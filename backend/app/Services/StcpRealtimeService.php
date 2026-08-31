<?php

declare(strict_types=1);

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Throwable;

final class StcpRealtimeService
{
    private const BROKER_URL = 'https://broker.fiware.urbanplatform.portodigital.pt/v2/entities';

    private const CACHE_KEY = 'stcp.realtime.current';

    private const LAST_GOOD_KEY = 'stcp.realtime.last_good';

    /**
     * @return array{ok: bool, updatedAt: string, stale: bool, source: string, vehicles: array<int, array<string, mixed>>, error?: string}
     */
    public function vehicles(bool $forceRefresh = false): array
    {
        if (! $forceRefresh) {
            $cached = Cache::get(self::CACHE_KEY);
            if (is_array($cached)) {
                return $cached;
            }
        }

        try {
            $response = Http::acceptJson()
                ->connectTimeout(5)
                ->timeout(12)
                ->retry(2, 250, fn (Throwable $exception): bool => $exception instanceof ConnectionException)
                ->get(self::BROKER_URL, ['q' => 'vehicleType==bus', 'limit' => 1000])
                ->throw();

            $entities = $response->json();
            $payload = [
                'ok' => true,
                'updatedAt' => now()->toIso8601String(),
                'stale' => false,
                'source' => 'fiware',
                'vehicles' => is_array($entities) ? $this->normalize($entities) : [],
            ];

            Cache::put(self::CACHE_KEY, $payload, 8);
            Cache::forever(self::LAST_GOOD_KEY, $payload);

            return $payload;
        } catch (Throwable) {
            $lastGood = Cache::get(self::LAST_GOOD_KEY);
            if (is_array($lastGood)) {
                return [...$lastGood, 'ok' => false, 'stale' => true, 'error' => 'Não foi possível atualizar o feed em tempo real.'];
            }

            return [
                'ok' => false,
                'updatedAt' => now()->toIso8601String(),
                'stale' => false,
                'source' => 'fiware',
                'vehicles' => [],
                'error' => 'O feed em tempo real está temporariamente indisponível.',
            ];
        }
    }

    /**
     * @param  array<int, mixed>  $entities
     * @return array<int, array<string, mixed>>
     */
    private function normalize(array $entities): array
    {
        $vehicles = [];
        $now = CarbonImmutable::now('UTC');
        $patterns = $this->patterns();

        foreach ($entities as $entity) {
            if (! is_array($entity)) {
                continue;
            }

            $coordinates = data_get($entity, 'location.value.coordinates');
            if (! is_array($coordinates) || count($coordinates) < 2) {
                continue;
            }

            $line = null;
            $directionId = null;
            $pattern = null;
            $annotations = data_get($entity, 'annotations.value', []);
            if (is_array($annotations)) {
                foreach ($annotations as $annotation) {
                    if (! is_string($annotation)) {
                        continue;
                    }
                    if (str_starts_with($annotation, 'stcp:route:')) {
                        $line = substr($annotation, strlen('stcp:route:'));
                    } elseif (str_starts_with($annotation, 'stcp:sentido:')) {
                        $directionId = (int) substr($annotation, strlen('stcp:sentido:'));
                    } elseif (str_starts_with($annotation, 'stcp:nr_viagem:')) {
                        $trip = substr($annotation, strlen('stcp:nr_viagem:'));
                        $pattern = trim(explode('|', $trip)[0] ?? '') ?: null;
                    }
                }
            }

            if ($line === null) {
                $name = data_get($entity, 'name.value');
                if (is_string($name) && preg_match('/^STCP\s+(\S+)\s/', $name, $matches) === 1) {
                    $line = $matches[1];
                }
            }
            if ($line === null || ! is_numeric($coordinates[0]) || ! is_numeric($coordinates[1])) {
                continue;
            }

            $observedAt = (string) data_get($entity, 'observationDateTime.value', $now->toIso8601String());
            try {
                $observed = CarbonImmutable::parse($observedAt);
            } catch (Throwable) {
                $observed = $now;
                $observedAt = $now->toIso8601String();
            }

            $entityId = (string) ($entity['id'] ?? '');
            $vehicleId = (string) data_get($entity, 'fleetVehicleId.value', preg_replace('/^urn:ngsi-ld:Vehicle:porto:stcp:bus:/', '', $entityId));
            $patternInfo = $pattern !== null ? ($patterns[$pattern] ?? null) : null;
            $vehicles[] = [
                'id' => $vehicleId,
                'line' => strtoupper(trim($line)),
                'pattern' => $pattern,
                'headsign' => $patternInfo['headsign'] ?? null,
                'directionId' => $patternInfo['directionId'] ?? $directionId,
                'shapeId' => $patternInfo['shapeId'] ?? null,
                'lat' => (float) $coordinates[1],
                'lon' => (float) $coordinates[0],
                'bearing' => (float) data_get($entity, 'heading.value', data_get($entity, 'bearing.value', 0)),
                'speedKmh' => round((float) data_get($entity, 'speed.value', 0) * 3.6, 1),
                'observedAt' => $observedAt,
                'ageSec' => max(0, (int) $observed->diffInSeconds($now)),
            ];
        }

        usort($vehicles, fn (array $a, array $b): int => strnatcasecmp((string) $a['line'], (string) $b['line']));

        return $vehicles;
    }

    /**
     * @return array<string, array{headsign: string|null, directionId: int|null, shapeId: string|null}>
     */
    private function patterns(): array
    {
        if (! Schema::hasTable('stcp_trip_patterns')) {
            return [];
        }

        /** @var array<string, array{headsign: string|null, directionId: int|null, shapeId: string|null}> $patterns */
        $patterns = Cache::remember('stcp.gtfs.patterns', 3600, function (): array {
            $result = [];
            foreach (DB::table('stcp_trip_patterns')->get(['pattern', 'headsign', 'direction_id', 'shape_id']) as $row) {
                $result[(string) $row->pattern] = [
                    'headsign' => $row->headsign !== null ? (string) $row->headsign : null,
                    'directionId' => $row->direction_id !== null ? (int) $row->direction_id : null,
                    'shapeId' => $row->shape_id !== null ? (string) $row->shape_id : null,
                ];
            }

            return $result;
        });

        return $patterns;
    }
}
