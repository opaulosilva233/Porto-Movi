<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use SplFileObject;
use ZipArchive;

final class ImportStcpGtfs extends Command
{
    protected $signature = 'stcp:import-gtfs {--url= : URL alternativa do ZIP GTFS}';

    protected $description = 'Importa destinos e traçados do GTFS oficial da STCP';

    public function handle(): int
    {
        $url = (string) ($this->option('url') ?: config('stcp.gtfs_url'));
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
        foreach ($this->rows($directory.'/trips.txt') as $row) {
            $tripId = trim((string) ($row['trip_id'] ?? ''));
            $routeId = trim((string) ($row['route_id'] ?? ''));
            if ($tripId === '' || $routeId === '') {
                continue;
            }
            $pattern = trim(explode('|', $tripId)[0] ?? $tripId);
            if ($pattern === '' || isset($patterns[$pattern])) {
                continue;
            }
            $patterns[$pattern] = [
                'pattern' => $pattern,
                'line' => $routes[$routeId] ?? $routeId,
                'headsign' => trim((string) ($row['trip_headsign'] ?? '')) ?: null,
                'direction_id' => isset($row['direction_id']) && $row['direction_id'] !== '' ? (int) $row['direction_id'] : null,
                'shape_id' => trim((string) ($row['shape_id'] ?? '')) ?: null,
            ];
        }

        $this->components->info('A importar destinos e sentidos…');
        DB::transaction(function () use ($patterns): void {
            DB::table('stcp_trip_patterns')->delete();
            foreach (array_chunk(array_values($patterns), 1000) as $chunk) {
                DB::table('stcp_trip_patterns')->insert($chunk);
            }
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

        Cache::forget('stcp.gtfs.patterns');
        Cache::forget('stcp.realtime.current');
        Cache::forget('stcp.realtime.last_good');

        @unlink($zipPath);
        foreach (['agency.txt', 'calendar.txt', 'calendar_dates.txt', 'feed_info.txt', 'routes.txt', 'shapes.txt', 'stops.txt', 'stop_times.txt', 'trips.txt'] as $file) {
            @unlink($directory.'/'.$file);
        }

        $this->components->info(sprintf('Importação concluída: %d padrões e %d traçados.', count($patterns), $shapeCount));

        return self::SUCCESS;
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
