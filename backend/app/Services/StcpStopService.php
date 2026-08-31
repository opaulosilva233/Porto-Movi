<?php

declare(strict_types=1);

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

final class StcpStopService
{
    public function __construct(private readonly StcpRealtimeService $realtime) {}

    /** @return array<int, object> */
    public function stops(?string $query = null): array
    {
        if (! Schema::hasTable('stcp_stops')) {
            return [];
        }
        $builder = DB::table('stcp_stops')->orderBy('name');
        $query = trim((string) $query);
        if ($query !== '') {
            $normalized = Str::lower(Str::ascii($query));
            $builder->where(function ($where) use ($query, $normalized): void {
                $where->where('name_normalized', 'like', '%'.$normalized.'%')
                    ->orWhere('code', 'like', $query.'%')
                    ->orWhere('id', 'like', $query.'%');
            })->limit(30);
        }

        return $builder->get(['id', 'code', 'name', 'lat', 'lon'])->all();
    }

    /** @return array<string, mixed>|null */
    public function arrivals(string $code): ?array
    {
        $stop = $this->findStop($code);
        if ($stop === null) {
            return null;
        }
        $distances = DB::table('stcp_stop_patterns')->where('stop_id', $stop->id)
            ->pluck('shape_distance', 'pattern')
            ->map(fn (mixed $distance): float => (float) $distance)->all();
        $realtime = $this->realtime->vehicles();
        $matching = array_values(array_filter(
            $realtime['vehicles'],
            fn (array $vehicle): bool => is_string($vehicle['pattern'])
                && is_string($vehicle['shapeId'])
                && array_key_exists($vehicle['pattern'], $distances),
        ));
        $shapeIds = array_values(array_unique(array_column($matching, 'shapeId')));
        $shapes = DB::table('stcp_shapes')->whereIn('id', $shapeIds)->pluck('points', 'id');
        $arrivals = [];

        foreach ($matching as $vehicle) {
            $rawPoints = $shapes[$vehicle['shapeId']] ?? null;
            if ($rawPoints === null) {
                continue;
            }
            $points = is_string($rawPoints) ? json_decode($rawPoints, true, 512, JSON_THROW_ON_ERROR) : $rawPoints;
            if (! is_array($points) || count($points) < 2) {
                continue;
            }
            $projection = $this->projectOnShape($points, (float) $vehicle['lat'], (float) $vehicle['lon']);
            if ($projection['off'] > 300) {
                continue;
            }
            $remaining = (float) $distances[$vehicle['pattern']] - $projection['along'];
            if ($remaining < -40) {
                continue;
            }
            $remaining = max(0, $remaining);
            $speed = max(3.0, min((float) $vehicle['speedKmh'] / 3.6, 9.5));
            $arrivals[] = [
                'vehicleId' => $vehicle['id'],
                'line' => $vehicle['line'],
                'headsign' => $vehicle['headsign'],
                'directionId' => $vehicle['directionId'],
                'shapeId' => $vehicle['shapeId'],
                'lat' => $vehicle['lat'],
                'lon' => $vehicle['lon'],
                'speedKmh' => $vehicle['speedKmh'],
                'distanceM' => (int) round($remaining),
                'etaSeconds' => (int) round($remaining / $speed),
                'atStop' => $remaining < 120,
            ];
        }
        usort($arrivals, fn (array $a, array $b): int => $a['distanceM'] <=> $b['distanceM']);

        return [
            'stop' => $stop,
            'updatedAt' => $realtime['updatedAt'],
            'realtime' => $realtime['ok'],
            'arrivals' => $arrivals,
        ];
    }

    /** @return array<string, mixed>|null */
    public function schedule(string $code): ?array
    {
        $stop = $this->findStop($code);
        if ($stop === null) {
            return null;
        }
        $now = CarbonImmutable::now('Europe/Lisbon');
        $seconds = ($now->hour * 3600) + ($now->minute * 60) + $now->second;
        $rows = DB::table('stcp_stop_times as stop_time')
            ->join('stcp_trips as trip', 'trip.id', '=', 'stop_time.trip_id')
            ->where('stop_time.stop_id', $stop->id)
            ->whereIn('trip.service_id', function ($query) use ($now): void {
                $query->select('service_id')->from('stcp_service_dates')
                    ->whereDate('service_date', $now->toDateString())
                    ->where('exception_type', 1);
            })
            ->whereRaw('TIME_TO_SEC(stop_time.arrival) >= ?', [$seconds - 120])
            ->orderByRaw('TIME_TO_SEC(stop_time.arrival)')
            ->limit(400)
            ->get(['trip.line', 'trip.headsign', 'trip.direction_id', 'stop_time.arrival']);

        $groups = [];
        foreach ($rows as $row) {
            $key = implode('|', [(string) $row->line, (string) $row->direction_id, (string) $row->headsign]);
            $groups[$key] ??= [
                'line' => (string) $row->line,
                'headsign' => $row->headsign !== null ? (string) $row->headsign : null,
                'directionId' => $row->direction_id !== null ? (int) $row->direction_id : null,
                'times' => [],
            ];
            if (count($groups[$key]['times']) >= 3) {
                continue;
            }
            [$hour, $minute] = array_pad(explode(':', (string) $row->arrival), 2, '00');
            $label = sprintf('%02d:%s', ((int) $hour) % 24, $minute);
            if (! in_array($label, $groups[$key]['times'], true)) {
                $groups[$key]['times'][] = $label;
            }
        }
        uasort($groups, fn (array $a, array $b): int => strnatcasecmp($a['line'], $b['line']));

        return ['stop' => $stop, 'date' => $now->toDateString(), 'schedule' => array_values($groups)];
    }

    /** @return array<string, mixed>|null */
    public function patternRoute(string $pattern): ?array
    {
        $tripPattern = DB::table('stcp_trip_patterns')->where('pattern', $pattern)
            ->first(['pattern', 'line', 'headsign', 'direction_id', 'shape_id']);
        if ($tripPattern === null || $tripPattern->shape_id === null) {
            return null;
        }
        $shape = DB::table('stcp_shapes')->where('id', $tripPattern->shape_id)->first(['points']);
        if ($shape === null) {
            return null;
        }
        $path = is_string($shape->points) ? json_decode($shape->points, true, 512, JSON_THROW_ON_ERROR) : $shape->points;
        $stops = DB::table('stcp_stop_patterns as stop_pattern')
            ->join('stcp_stops as stop', 'stop.id', '=', 'stop_pattern.stop_id')
            ->where('stop_pattern.pattern', $pattern)
            ->orderBy('stop_pattern.shape_distance')
            ->get(['stop.id', 'stop.code', 'stop.name', 'stop.lat', 'stop.lon', 'stop_pattern.shape_distance'])
            ->map(fn (object $stop): array => [
                'id' => (string) $stop->id,
                'code' => (string) $stop->code,
                'name' => (string) $stop->name,
                'lat' => (float) $stop->lat,
                'lon' => (float) $stop->lon,
                'shapeDistance' => (float) $stop->shape_distance,
            ])->all();

        return [
            'pattern' => (string) $tripPattern->pattern,
            'line' => (string) $tripPattern->line,
            'headsign' => $tripPattern->headsign !== null ? (string) $tripPattern->headsign : null,
            'directionId' => $tripPattern->direction_id !== null ? (int) $tripPattern->direction_id : null,
            'shapeId' => (string) $tripPattern->shape_id,
            'path' => $path,
            'stops' => $stops,
        ];
    }

    private function findStop(string $code): ?object
    {
        if (! Schema::hasTable('stcp_stops')) {
            return null;
        }

        return DB::table('stcp_stops')->where('id', $code)->orWhere('code', $code)
            ->first(['id', 'code', 'name', 'lat', 'lon']);
    }

    /**
     * @param  array<int, array{0: float|int, 1: float|int}>  $points
     * @return array{along: float, off: float}
     */
    private function projectOnShape(array $points, float $latitude, float $longitude): array
    {
        $metresPerDegree = 111320;
        $cosine = cos(deg2rad($latitude));
        $pointX = $longitude * $metresPerDegree * $cosine;
        $pointY = $latitude * $metresPerDegree;
        $bestDistance = INF;
        $bestAlong = 0.0;
        $travelled = 0.0;

        for ($index = 0, $last = count($points) - 1; $index < $last; $index++) {
            $ax = (float) $points[$index][1] * $metresPerDegree * $cosine;
            $ay = (float) $points[$index][0] * $metresPerDegree;
            $bx = (float) $points[$index + 1][1] * $metresPerDegree * $cosine;
            $by = (float) $points[$index + 1][0] * $metresPerDegree;
            $dx = $bx - $ax;
            $dy = $by - $ay;
            $lengthSquared = ($dx * $dx) + ($dy * $dy);
            $ratio = $lengthSquared > 0 ? (($pointX - $ax) * $dx + ($pointY - $ay) * $dy) / $lengthSquared : 0.0;
            $ratio = max(0.0, min(1.0, $ratio));
            $segmentLength = sqrt($lengthSquared);
            $off = hypot(($ax + $ratio * $dx) - $pointX, ($ay + $ratio * $dy) - $pointY);
            if ($off < $bestDistance) {
                $bestDistance = $off;
                $bestAlong = $travelled + ($ratio * $segmentLength);
            }
            $travelled += $segmentLength;
        }

        return ['along' => $bestAlong, 'off' => $bestDistance];
    }
}
