<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;
use SplFileObject;
use ZipArchive;

final class ImportStcpGtfs extends Command
{
    protected $signature = 'stcp:import-gtfs {--url= : URL alternativa do ZIP GTFS}';

    protected $description = 'Importa linhas, destinos, traçados, paragens e horários do GTFS oficial da STCP';

    public function handle(): int
    {
        $url = trim((string) ($this->option('url') ?: config('stcp.gtfs_url')));
        if ($url === '') {
            $url = $this->latestGtfsUrl();
        }
        $directory = storage_path('app/private/stcp-gtfs-import');
        $zipPath = $directory.'/feed.zip';
        if (! is_dir($directory) && ! mkdir($directory, 0755, true) && ! is_dir($directory)) {
            throw new RuntimeException('Não foi possível criar o diretório temporário GTFS.');
        }

        $this->components->info('A descarregar o GTFS oficial…');
        Http::connectTimeout(10)->timeout(120)->sink($zipPath)->get($url)->throw();
        $zip = new ZipArchive;
        if ($zip->open($zipPath) !== true) {
            throw new RuntimeException('O ficheiro GTFS descarregado não é um ZIP válido.');
        }
        $zip->extractTo($directory);
        $zip->close();

        $routes = [];
        foreach ($this->rows($directory.'/routes.txt') as $row) {
            $routeId = trim((string) ($row['route_id'] ?? ''));
            if ($routeId !== '') {
                $routes[$routeId] = trim((string) ($row['route_short_name'] ?? $routeId));
            }
        }

        $patterns = [];
        $trips = [];
        $tripPatterns = [];
        foreach ($this->rows($directory.'/trips.txt') as $row) {
            $tripId = trim((string) ($row['trip_id'] ?? ''));
            $routeId = trim((string) ($row['route_id'] ?? ''));
            if ($tripId === '' || $routeId === '') {
                continue;
            }
            $pattern = trim(explode('|', $tripId)[0] ?? $tripId);
            $tripPatterns[$tripId] = $pattern;
            $trip = [
                'id' => $tripId,
                'pattern' => $pattern,
                'line' => $routes[$routeId] ?? $routeId,
                'service_id' => trim((string) ($row['service_id'] ?? '')),
                'headsign' => trim((string) ($row['trip_headsign'] ?? '')) ?: null,
                'direction_id' => isset($row['direction_id']) && $row['direction_id'] !== '' ? (int) $row['direction_id'] : null,
                'shape_id' => trim((string) ($row['shape_id'] ?? '')) ?: null,
            ];
            $trips[] = $trip;
            $patterns[$pattern] ??= [
                'pattern' => $pattern,
                'line' => $trip['line'],
                'headsign' => $trip['headsign'],
                'direction_id' => $trip['direction_id'],
                'shape_id' => $trip['shape_id'],
            ];
        }

        $stops = [];
        foreach ($this->rows($directory.'/stops.txt') as $row) {
            $id = trim((string) ($row['stop_id'] ?? ''));
            $name = trim((string) ($row['stop_name'] ?? ''));
            if ($id === '' || $id === '.' || $name === '' || $name === '.') {
                continue;
            }
            $stops[] = [
                'id' => $id,
                'code' => trim((string) ($row['stop_code'] ?? '')) ?: $id,
                'name' => $name,
                'name_normalized' => Str::lower(Str::ascii($name)),
                'lat' => (float) ($row['stop_lat'] ?? 0),
                'lon' => (float) ($row['stop_lon'] ?? 0),
            ];
        }

        $this->components->info('A importar paragens, viagens e destinos…');
        DB::transaction(function () use ($patterns, $trips, $stops): void {
            DB::table('stcp_stop_patterns')->delete();
            DB::table('stcp_stop_times')->delete();
            DB::table('stcp_service_dates')->delete();
            DB::table('stcp_trips')->delete();
            DB::table('stcp_stops')->delete();
            DB::table('stcp_trip_patterns')->delete();
            $this->insertChunks('stcp_trip_patterns', array_values($patterns));
            $this->insertChunks('stcp_trips', $trips);
            $this->insertChunks('stcp_stops', $stops);
        });

        $this->components->info('A importar os traçados oficiais…');
        DB::table('stcp_shapes')->delete();
        $currentId = null;
        $points = [];
        $shapeCount = 0;
        foreach ($this->rows($directory.'/shapes.txt') as $row) {
            $shapeId = trim((string) ($row['shape_id'] ?? ''));
            if ($shapeId === '') {
                continue;
            }
            if ($currentId !== null && $shapeId !== $currentId) {
                $this->storeShape($currentId, $points);
                $shapeCount++;
                $points = [];
            }
            $currentId = $shapeId;
            $points[] = [(float) $row['shape_pt_lat'], (float) $row['shape_pt_lon']];
        }
        if ($currentId !== null && $points !== []) {
            $this->storeShape($currentId, $points);
            $shapeCount++;
        }

        $this->components->info('A importar horários e ligações às paragens…');
        $stopTimeChunk = [];
        $stopPatternDistances = [];
        $stopTimeCount = 0;
        foreach ($this->rows($directory.'/stop_times.txt') as $row) {
            $tripId = trim((string) ($row['trip_id'] ?? ''));
            $stopId = trim((string) ($row['stop_id'] ?? ''));
            if ($tripId === '' || $stopId === '') {
                continue;
            }
            $distance = isset($row['shape_dist_traveled']) && $row['shape_dist_traveled'] !== ''
                ? (float) $row['shape_dist_traveled']
                : 0.0;
            $stopTimeChunk[] = [
                'trip_id' => $tripId,
                'stop_id' => $stopId,
                'arrival' => trim((string) ($row['arrival_time'] ?? '00:00:00')),
                'departure' => trim((string) ($row['departure_time'] ?? '00:00:00')),
                'sequence' => (int) ($row['stop_sequence'] ?? 0),
                'shape_distance' => $distance,
            ];
            $pattern = $tripPatterns[$tripId] ?? null;
            if ($pattern !== null) {
                $key = $stopId.'|'.$pattern;
                if (! isset($stopPatternDistances[$key]) || $distance < $stopPatternDistances[$key]['shape_distance']) {
                    $stopPatternDistances[$key] = ['stop_id' => $stopId, 'pattern' => $pattern, 'shape_distance' => $distance];
                }
            }
            if (count($stopTimeChunk) >= 1000) {
                DB::table('stcp_stop_times')->insert($stopTimeChunk);
                $stopTimeCount += count($stopTimeChunk);
                $stopTimeChunk = [];
            }
        }
        if ($stopTimeChunk !== []) {
            DB::table('stcp_stop_times')->insert($stopTimeChunk);
            $stopTimeCount += count($stopTimeChunk);
        }
        $this->insertChunks('stcp_stop_patterns', array_values($stopPatternDistances));

        $serviceDates = [];
        foreach ($this->rows($directory.'/calendar_dates.txt') as $row) {
            $rawDate = trim((string) ($row['date'] ?? ''));
            if (strlen($rawDate) !== 8) {
                continue;
            }
            $serviceDates[] = [
                'service_id' => trim((string) ($row['service_id'] ?? '')),
                'service_date' => substr($rawDate, 0, 4).'-'.substr($rawDate, 4, 2).'-'.substr($rawDate, 6, 2),
                'exception_type' => (int) ($row['exception_type'] ?? 1),
            ];
        }
        $this->insertChunks('stcp_service_dates', $serviceDates);

        Cache::forget('stcp.gtfs.patterns');
        Cache::forget('stcp.realtime.current');
        Cache::forget('stcp.realtime.last_good');
        @unlink($zipPath);
        foreach (['agency.txt', 'calendar.txt', 'calendar_dates.txt', 'feed_info.txt', 'routes.txt', 'shapes.txt', 'stops.txt', 'stop_times.txt', 'trips.txt'] as $file) {
            @unlink($directory.'/'.$file);
        }

        $this->components->info(sprintf(
            'Importação concluída: %d paragens, %d viagens, %d horários, %d padrões e %d traçados.',
            count($stops),
            count($trips),
            $stopTimeCount,
            count($patterns),
            $shapeCount,
        ));

        return self::SUCCESS;
    }

    private function latestGtfsUrl(): string
    {
        $datasetUrl = (string) config('stcp.gtfs_dataset_api_url');
        $response = Http::connectTimeout(10)->timeout(30)->get($datasetUrl)->throw()->json();
        $resources = $response['result']['resources'] ?? null;
        if (! is_array($resources)) {
            throw new RuntimeException('O Portal de Dados do Porto não devolveu recursos GTFS.');
        }

        $resources = array_values(array_filter($resources, static function (mixed $resource): bool {
            if (! is_array($resource) || ($resource['state'] ?? null) !== 'active') {
                return false;
            }
            $format = Str::upper((string) ($resource['format'] ?? ''));
            $url = (string) ($resource['url'] ?? '');

            return in_array($format, ['GTFS', 'ZIP'], true) && filter_var($url, FILTER_VALIDATE_URL) !== false;
        }));
        usort($resources, static fn (array $first, array $second): int => ((int) ($second['position'] ?? -1)) <=> ((int) ($first['position'] ?? -1))
        );
        $url = (string) ($resources[0]['url'] ?? '');
        if ($url === '') {
            throw new RuntimeException('Não foi possível encontrar o ZIP GTFS mais recente.');
        }
        $this->components->info('A usar o recurso GTFS mais recente do Portal de Dados do Porto.');

        return $url;
    }

    /**
     * @return \Generator<int, array<string, string>>
     */
    private function rows(string $path): \Generator
    {
        if (! is_file($path)) {
            throw new RuntimeException(sprintf('Ficheiro GTFS em falta: %s', basename($path)));
        }
        $file = new SplFileObject($path, 'r');
        $file->setFlags(SplFileObject::READ_CSV | SplFileObject::SKIP_EMPTY);
        $header = null;
        foreach ($file as $columns) {
            if (! is_array($columns) || $columns === [null]) {
                continue;
            }
            if ($header === null) {
                $header = array_map(fn (mixed $value): string => ltrim(trim((string) $value), "\xEF\xBB\xBF"), $columns);

                continue;
            }
            $columns = array_pad($columns, count($header), '');
            /** @var array<string, string> $row */
            $row = array_combine($header, array_slice(array_map(fn (mixed $value): string => trim((string) $value), $columns), 0, count($header)));
            yield $row;
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function insertChunks(string $table, array $rows): void
    {
        foreach (array_chunk($rows, 1000) as $chunk) {
            DB::table($table)->insert($chunk);
        }
    }

    /** @param array<int, array{0: float, 1: float}> $points */
    private function storeShape(string $id, array $points): void
    {
        $maxPoints = 600;
        if (count($points) > $maxPoints) {
            $step = (count($points) - 1) / ($maxPoints - 1);
            $decimated = [];
            for ($index = 0; $index < $maxPoints; $index++) {
                $decimated[] = $points[(int) round($index * $step)];
            }
            $points = $decimated;
        }
        DB::table('stcp_shapes')->insert([
            'id' => $id,
            'points' => json_encode($points, JSON_THROW_ON_ERROR),
            'point_count' => count($points),
        ]);
    }
}
