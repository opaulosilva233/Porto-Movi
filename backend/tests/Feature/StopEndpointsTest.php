<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class StopEndpointsTest extends TestCase
{
    use DatabaseTransactions;

    public function test_it_lists_a_stop_and_returns_realtime_arrivals_and_schedule(): void
    {
        $now = now('Europe/Lisbon');
        DB::table('stcp_stops')->insert([
            'id' => 'TSTP',
            'code' => 'TSTP',
            'name' => 'PARAGEM TESTE CODEX',
            'name_normalized' => 'paragem teste codex',
            'lat' => 41.15,
            'lon' => -8.60,
        ]);
        DB::table('stcp_trip_patterns')->insert([
            'pattern' => 'TST_0_1',
            'line' => '201',
            'headsign' => 'Destino Teste',
            'direction_id' => 0,
            'shape_id' => 'TST_0|0',
        ]);
        DB::table('stcp_shapes')->insert([
            'id' => 'TST_0|0',
            'points' => json_encode([[41.15, -8.61], [41.15, -8.60]], JSON_THROW_ON_ERROR),
            'point_count' => 2,
        ]);
        DB::table('stcp_stop_patterns')->insert([
            'stop_id' => 'TSTP',
            'pattern' => 'TST_0_1',
            'shape_distance' => 840,
        ]);
        DB::table('stcp_trips')->insert([
            'id' => 'TST_0_1|TRIP',
            'pattern' => 'TST_0_1',
            'line' => '201',
            'service_id' => 'TEST_SERVICE',
            'headsign' => 'Destino Teste',
            'direction_id' => 0,
            'shape_id' => 'TST_0|0',
        ]);
        DB::table('stcp_stop_times')->insert([
            'trip_id' => 'TST_0_1|TRIP',
            'stop_id' => 'TSTP',
            'arrival' => $now->addMinutes(10)->format('H:i:s'),
            'departure' => $now->addMinutes(10)->format('H:i:s'),
            'sequence' => 1,
            'shape_distance' => 840,
        ]);
        DB::table('stcp_service_dates')->insert([
            'service_id' => 'TEST_SERVICE',
            'service_date' => $now->toDateString(),
            'exception_type' => 1,
        ]);
        Cache::flush();
        Http::fake([
            'broker.fiware.urbanplatform.portodigital.pt/*' => Http::response([[
                'id' => 'urn:ngsi-ld:Vehicle:porto:stcp:bus:9999',
                'annotations' => ['value' => ['stcp:route:201', 'stcp:sentido:0', 'stcp:nr_viagem:TST_0_1|TRIP']],
                'fleetVehicleId' => ['value' => '9999'],
                'location' => ['value' => ['coordinates' => [-8.609, 41.15]]],
                'speed' => ['value' => 4],
                'observationDateTime' => ['value' => now()->toIso8601String()],
            ]]),
        ]);

        $this->getJson('/api/stops?q=Teste')
            ->assertOk()
            ->assertJsonPath('data.stops.0.id', 'TSTP');
        $this->getJson('/api/stops/TSTP/arrivals')
            ->assertOk()
            ->assertJsonPath('data.arrivals.0.vehicleId', '9999')
            ->assertJsonPath('data.arrivals.0.line', '201');
        $this->getJson('/api/stops/TSTP/schedule')
            ->assertOk()
            ->assertJsonPath('data.schedule.0.line', '201')
            ->assertJsonCount(1, 'data.schedule');
        $this->getJson('/api/patterns/TST_0_1')
            ->assertOk()
            ->assertJsonPath('data.line', '201')
            ->assertJsonPath('data.stops.0.id', 'TSTP')
            ->assertJsonCount(2, 'data.path');
    }
}
