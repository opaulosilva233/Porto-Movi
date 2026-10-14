<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;
use ZipArchive;

final class ImportMetroGtfs extends Command
{
    protected $signature = 'metro:import-gtfs {--url= : URL do ZIP GTFS oficial}';

    protected $description = 'Importa estações e horários programados do Metro do Porto';

    public function handle(): int
    {
        $path = tempnam(sys_get_temp_dir(), 'metro-');
        $zip = new ZipArchive;
        try {
            Http::connectTimeout(15)->timeout(120)->sink($path)
                ->get($this->option('url') ?: config('metro.gtfs_url'))->throw();
            if ($zip->open($path) !== true) {
                throw new RuntimeException('O GTFS do Metro não é um ZIP válido.');
            }
            foreach (['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'] as $file) {
                if ($zip->locateName($file) === false) {
                    throw new RuntimeException('Ficheiro GTFS em falta: '.$file);
                }
            }
            if ($zip->locateName('frequencies.txt') !== false) {
                throw new RuntimeException('Este importador requer horários explícitos, sem frequencies.txt.');
            }
            $routes = [];
            foreach ($this->rows($zip, 'routes.txt') as $row) {
                $routes[$row['route_id']] = $row['route_short_name'] ?: $row['route_id'];
            }
            $services = [];
            foreach ($this->rows($zip, 'calendar.txt') as $row) {
                $services[$row['service_id']] = ['calendar' => $row, 'exceptions' => []];
            }
            foreach ($this->rows($zip, 'calendar_dates.txt') as $row) {
                $services[$row['service_id']] ??= ['calendar' => null, 'exceptions' => []];
                $services[$row['service_id']]['exceptions'][$row['date']] = (int) $row['exception_type'];
            }
            if ($services === []) {
                throw new RuntimeException('O GTFS não contém um calendário de serviço.');
            }
            DB::transaction(function () use ($zip, $services, $routes): void {
                foreach (['metro_routes', 'metro_stop_times', 'metro_trips', 'metro_services', 'metro_stops'] as $table) {
                    DB::table($table)->delete();
                }
                foreach ($services as $id => $service) {
                    DB::table('metro_services')->insert(['id' => $id,
                        'calendar' => json_encode($service['calendar'], JSON_THROW_ON_ERROR),
                        'exceptions' => json_encode($service['exceptions'], JSON_THROW_ON_ERROR)]);
                }
                $count = 0;
                foreach ($this->rows($zip, 'stops.txt') as $row) {
                    DB::table('metro_stops')->insert(['id' => $row['stop_id'], 'code' => $row['stop_code'] ?: $row['stop_id'],
                        'name' => $row['stop_name'], 'name_normalized' => Str::lower(Str::ascii($row['stop_name'])),
                        'lat' => (float) $row['stop_lat'], 'lon' => (float) $row['stop_lon']]);
                    $count++;
                }
                if ($count === 0) {
                    throw new RuntimeException('O GTFS não contém estações.');
                }
                $chunk = [];
                $tripRoutes = [];
                foreach ($this->rows($zip, 'trips.txt') as $row) {
                    if (! empty($row['shape_id'])) {
                        $tripRoutes[$row['trip_id']] = ['id' => $row['route_id'].'|'.$row['shape_id'],
                            'shape' => $row['shape_id'], 'line' => $routes[$row['route_id']], 'headsign' => $row['trip_headsign'] ?: null];
                    }
                    $chunk[] = ['id' => $row['trip_id'], 'service_id' => $row['service_id'],
                        'line' => $routes[$row['route_id']], 'headsign' => $row['trip_headsign'] ?: null,
                        'direction_id' => ($row['direction_id'] ?? '') !== '' ? (int) $row['direction_id'] : null];
                    if (count($chunk) >= 500) {
                        DB::table('metro_trips')->insert($chunk);
                        $chunk = [];
                    }
                }
                if ($chunk !== []) {
                    DB::table('metro_trips')->insert($chunk);
                }
                $lastSequences = [];
                $tripStops = [];
                foreach ($this->rows($zip, 'stop_times.txt') as $row) {
                    $tripStops[$row['trip_id']][(int) $row['stop_sequence']] = $row['stop_id'];
                    $lastSequences[$row['trip_id']] = max($lastSequences[$row['trip_id']] ?? -1, (int) $row['stop_sequence']);
                }
                $shapes = [];
                foreach ($this->rows($zip, 'shapes.txt') as $row) {
                    $shapes[$row['shape_id']][(int) $row['shape_pt_sequence']] = [(float) $row['shape_pt_lat'], (float) $row['shape_pt_lon']];
                }
                $routeRows = [];
                foreach ($tripRoutes as $tripId => $route) {
                    $stopIds = $tripStops[$tripId] ?? [];
                    ksort($stopIds);
                    $points = $shapes[$route['shape']] ?? [];
                    ksort($points);
                    if (count($points) < 2 || count($stopIds) < 2) {
                        continue;
                    }
                    if (isset($routeRows[$route['id']]) && count($routeRows[$route['id']]['stops']) >= count($stopIds)) {
                        continue;
                    }
                    $routeRows[$route['id']] = ['route' => $route, 'stops' => array_values($stopIds), 'path' => array_values($points)];
                }
                foreach ($routeRows as $id => $data) {
                    DB::table('metro_routes')->insert(['id' => $id, 'line' => $data['route']['line'], 'headsign' => $data['route']['headsign'],
                        'path' => json_encode($data['path'], JSON_THROW_ON_ERROR), 'stop_ids' => json_encode($data['stops'], JSON_THROW_ON_ERROR)]);
                }
                $chunk = [];
                foreach ($this->rows($zip, 'stop_times.txt') as $row) {
                    if ((int) $row['stop_sequence'] === $lastSequences[$row['trip_id']]) {
                        continue;
                    }
                    if (($row['pickup_type'] ?? '') === '1') {
                        continue;
                    }
                    $time = $row['departure_time'] ?: $row['arrival_time'];
                    if (! preg_match('/^(\d+):([0-5]\d):([0-5]\d)$/', $time, $parts)) {
                        throw new RuntimeException('Hora GTFS inválida: '.$time);
                    }
                    $chunk[] = ['trip_id' => $row['trip_id'], 'stop_id' => $row['stop_id'],
                        'departure' => (int) $parts[1] * 3600 + (int) $parts[2] * 60 + (int) $parts[3]];
                    if (count($chunk) >= 1000) {
                        DB::table('metro_stop_times')->insert($chunk);
                        $chunk = [];
                    }
                }
                if ($chunk !== []) {
                    DB::table('metro_stop_times')->insert($chunk);
                }
            });
            $this->info('Estações e horários do Metro importados.');
        } finally {
            if ($zip->status === ZipArchive::ER_OK && $zip->numFiles > 0) {
                $zip->close();
            }
            if (is_file($path)) {
                unlink($path);
            }
        }

        return self::SUCCESS;
    }

    private function rows(ZipArchive $zip, string $name): iterable
    {
        if ($zip->locateName($name) === false) {
            return;
        }
        $stream = $zip->getStream($name);
        if ($stream === false) {
            return;
        }
        try {
            $header = fgetcsv($stream, 0, ',', '"', '');
            if (! is_array($header)) {
                throw new RuntimeException('Cabeçalho GTFS inválido: '.$name);
            }
            $header[0] = ltrim($header[0], "\xEF\xBB\xBF");
            while (($values = fgetcsv($stream, 0, ',', '"', '')) !== false) {
                if ($values === [null]) {
                    continue;
                }
                if (count($header) !== count($values)) {
                    throw new RuntimeException('Linha GTFS inválida: '.$name);
                }
                yield array_combine($header, $values);
            }
        } finally {
            fclose($stream);
        }
    }
}
