<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StopResource;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

final class MetroController extends Controller
{
    public function routes(string $code): JsonResponse
    {
        abort_unless(DB::table('metro_stops')->where('id', $code)->exists(), 404, 'Estação não encontrada.');
        $stops = DB::table('metro_stops')->get()->keyBy('id');
        $routes = [];
        foreach (DB::table('metro_routes')->orderBy('id')->get() as $route) {
            $ids = json_decode($route->stop_ids, true, 512, JSON_THROW_ON_ERROR);
            if (! in_array($code, $ids, true)) {
                continue;
            }
            // Prefer the complete route over short workings of the same line.
            if (isset($routes[$route->line]) && count($routes[$route->line]['stops']) >= count($ids)) {
                continue;
            }
            $routes[$route->line] = ['pattern' => $route->id, 'line' => $route->line, 'headsign' => $route->headsign,
                'directionId' => null, 'shapeId' => $route->id,
                'path' => json_decode($route->path, true, 512, JSON_THROW_ON_ERROR),
                'stops' => array_values(array_map(fn ($id) => StopResource::make($stops[$id])->resolve(), $ids))];
        }
        ksort($routes, SORT_NATURAL);

        return response()->json(['success' => true, 'data' => ['routes' => array_values($routes)], 'message' => 'Percursos do Metro carregados.']);
    }

    public function stops(): JsonResponse
    {
        if (! Schema::hasTable('metro_stops') || ! DB::table('metro_stops')->exists()) {
            return response()->json(['success' => false, 'data' => null, 'message' => 'Os horários do Metro ainda não estão disponíveis.'], 503);
        }
        $stops = StopResource::collection(DB::table('metro_stops')->orderBy('name')->get())->resolve();
        $lines = DB::table('metro_stop_times as times')->join('metro_trips as trip', 'trip.id', '=', 'times.trip_id')
            ->select('times.stop_id', 'trip.line')->distinct()->get()->groupBy('stop_id');
        foreach ($stops as &$stop) {
            $stop['lines'] = ($lines[$stop['id']] ?? collect())->pluck('line')->sort()->values()->all();
        }
        unset($stop);

        return response()->json(['success' => true, 'data' => ['count' => count($stops), 'stops' => $stops], 'message' => 'Estações do Metro carregadas.']);
    }

    public function schedule(string $code): JsonResponse
    {
        abort_unless(Schema::hasTable('metro_stops'), 503, 'Horários do Metro indisponíveis.');
        $stop = DB::table('metro_stops')->where('id', $code)->first();
        abort_if($stop === null, 404, 'Estação não encontrada.');
        $now = CarbonImmutable::now('Europe/Lisbon');
        $seconds = $now->hour * 3600 + $now->minute * 60 + $now->second;
        $services = DB::table('metro_services')->get();
        $departures = [];
        $covered = false;
        // Include yesterday's service: GTFS times such as 25:10 belong to the previous day.
        foreach ([-1, 0] as $offset) {
            $day = $now->startOfDay()->addDays($offset);
            $date = $day->format('Ymd');
            $active = [];
            foreach ($services as $service) {
                $calendar = json_decode($service->calendar ?? 'null', true, 512, JSON_THROW_ON_ERROR);
                $exceptions = json_decode($service->exceptions, true, 512, JSON_THROW_ON_ERROR);
                $inRange = $calendar && $date >= $calendar['start_date'] && $date <= $calendar['end_date'];
                if ($offset === 0 && ($inRange || isset($exceptions[$date]))) {
                    $covered = true;
                }
                $runs = $inRange && (int) $calendar[strtolower($day->format('l'))] === 1;
                if (isset($exceptions[$date])) {
                    $runs = (int) $exceptions[$date] === 1;
                }
                if ($runs) {
                    $active[] = $service->id;
                }
            }
            $rows = DB::table('metro_stop_times as times')
                ->join('metro_trips as trip', 'trip.id', '=', 'times.trip_id')
                ->where('times.stop_id', $stop->id)->whereIn('trip.service_id', $active)
                ->where('times.departure', '>=', $seconds - $offset * 86400)
                ->where('times.departure', '<', 86400 - $offset * 86400)
                ->get(['trip.line', 'trip.headsign', 'trip.direction_id', 'times.departure']);
            foreach ($rows as $row) {
                $row->departure += $offset * 86400;
                $departures[] = $row;
            }
        }
        usort($departures, fn ($a, $b) => $a->departure <=> $b->departure);
        $groups = [];
        foreach ($departures as $row) {
            $key = $row->line.'|'.$row->direction_id.'|'.$row->headsign;
            $groups[$key] ??= ['line' => $row->line, 'headsign' => $row->headsign,
                'directionId' => $row->direction_id === null ? null : (int) $row->direction_id, 'times' => []];
            $label = sprintf('%02d:%02d', intdiv($row->departure, 3600), intdiv($row->departure % 3600, 60));
            if (count($groups[$key]['times']) < 3 && ! in_array($label, $groups[$key]['times'], true)) {
                $groups[$key]['times'][] = $label;
            }
        }

        return response()->json(['success' => true, 'data' => [
            'stop' => StopResource::make($stop)->resolve(), 'date' => $now->toDateString(),
            'schedule' => array_values($groups), 'available' => $covered,
        ], 'message' => $covered ? 'Horários programados carregados.' : 'Sem calendário válido para esta data.']);
    }
}
