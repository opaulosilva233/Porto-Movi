<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Throwable;

final class MetroDeparturesController extends Controller
{
    public function __invoke(string $code): JsonResponse
    {
        abort_unless(DB::table('metro_stops')->where('id', $code)->exists(), 404);
        $data = Cache::remember('metro.departures.v1.'.$code, 15, function () use ($code): array {
            try {
                $response = Http::connectTimeout(4)->timeout(10)->post(config('metro.departures_url'), [
                    'query' => 'query($id: String!) { stop(id: $id) { stoptimesWithoutPatterns(numberOfDepartures: 30, timeRange: 7200, omitCanceled: false) { realtime realtimeState scheduledDeparture realtimeDeparture serviceDay headsign trip { gtfsId route { shortName } } } } }',
                    'variables' => ['id' => config('metro.feed_prefix').$code],
                ])->throw()->json();
                if (! empty($response['errors']) || ! is_array($response['data']['stop']['stoptimesWithoutPatterns'] ?? null)) {
                    throw new \RuntimeException('Resposta de chegadas inválida.');
                }
                $departures = [];
                foreach ($response['data']['stop']['stoptimesWithoutPatterns'] as $row) {
                    $realtime = ($row['realtime'] ?? false) === true && in_array($row['realtimeState'] ?? '', ['UPDATED', 'ADDED', 'MODIFIED'], true);
                    $cancelled = ($row['realtimeState'] ?? '') === 'CANCELED';
                    $seconds = $realtime ? ($row['realtimeDeparture'] ?? null) : ($row['scheduledDeparture'] ?? null);
                    if (! is_numeric($seconds) || ! is_numeric($row['serviceDay'] ?? null)) {
                        continue;
                    }
                    $timestamp = (int) $row['serviceDay'] + (int) $seconds;
                    if ($timestamp < time() - 60) {
                        continue;
                    }
                    $departures[] = ['id' => ($row['trip']['gtfsId'] ?? '').':'.$timestamp,
                        'line' => $row['trip']['route']['shortName'] ?? '', 'headsign' => $row['headsign'] ?? '',
                        'departureAt' => gmdate('c', $timestamp), 'realtime' => $realtime, 'cancelled' => $cancelled];
                }
                usort($departures, fn ($a, $b) => strcmp($a['departureAt'], $b['departureAt']));

                return ['available' => true, 'departures' => $departures, 'checkedAt' => now()->toIso8601String()];
            } catch (Throwable $error) {
                report($error);

                return ['available' => false, 'departures' => [], 'checkedAt' => now()->toIso8601String()];
            }
        });

        return response()->json(['success' => true, 'data' => $data, 'message' => 'Consulta de chegadas do Explore Porto.']);
    }
}
