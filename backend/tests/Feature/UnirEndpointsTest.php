<?php

declare(strict_types=1);

namespace Tests\Feature;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class UnirEndpointsTest extends TestCase
{
    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_stops_use_longitude_latitude_and_deduplicate_lines(): void
    {
        Http::fake(['*' => Http::response(['totalFeatures' => 1, 'features' => [
            ['geometry' => ['coordinates' => [-8.6, 41.2]], 'properties' => [
                'codparagem' => 'mai:6', 'designacao' => 'Macau', 'linhas' => ' 6001_ 1| 6001_ 2| 6016_ 2',
            ]],
        ]])]);
        $this->getJson('/api/unir/stops')->assertOk()->assertJsonPath('data.stops.0.lat', 41.2)
            ->assertJsonPath('data.stops.0.lon', -8.6)->assertJsonPath('data.stops.0.lines', ['6001', '6016']);
    }

    public function test_double_encoded_schedules_are_sorted_filtered_and_limited(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-14 12:00', 'Europe/Lisbon'));
        $rows = [];
        foreach ([14, 11, 13, 12, 15, 12] as $hour) {
            $rows[] = ['linha' => '5002', 'sentido' => '2', 'destino' => 'Leça', 'hora' => $hour, 'minuto' => 10];
        }
        Http::fake(['*' => Http::response(json_encode(json_encode(['prg' => 'prt:190', 'horarios' => $rows])), 200, ['Content-Type' => 'application/json'])]);
        $this->getJson('/api/unir/stops/prt:190/schedule')->assertOk()
            ->assertJsonPath('data.schedule.0.times', ['12:10', '13:10', '14:10'])
            ->assertJsonPath('data.schedule.0.line', '5002');
    }

    public function test_routes_preserve_variants_and_directions(): void
    {
        $rows = [];
        foreach (['1', '2'] as $direction) {
            $rows[] = ['linha' => '5002', 'sentido' => $direction, 'destino' => 'Destino', 'tipo' => '0', 'trip_id' => 'A:5002:0:'.$direction.':0600'];
        }
        Http::fake(['*' => Http::response(['prg' => 'prt:190', 'horarios' => $rows])]);
        $this->getJson('/api/unir/stops/prt:190/routes')->assertOk()->assertJsonCount(2, 'data.routes');
    }

    public function test_route_uses_source_geometry_and_ordered_stops(): void
    {
        Http::fake(['*' => Http::response(['cod' => 5002, 'sentido' => '2',
            'geometry' => ['type' => 'LineString', 'coordinates' => [[-8.6, 41.1], [-8.7, 41.2]]],
            'horario' => [
                ['ordem' => 2, 'cod_paragem' => 'b', 'desig_paragem' => 'Fim', 'lat' => 41.2, 'lon' => -8.7],
                ['ordem' => 1, 'cod_paragem' => 'a', 'desig_paragem' => 'Início', 'lat' => 41.1, 'lon' => -8.6],
            ]])]);
        $this->getJson('/api/unir/trips/A:5002:0:2:0600')->assertOk()
            ->assertJsonPath('data.path.0', [41.1, -8.6])->assertJsonPath('data.stops.0.id', 'a')
            ->assertJsonPath('data.headsign', 'Fim');
    }

    public function test_overnight_services_from_yesterday_remain_visible(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-15 00:05', 'Europe/Lisbon'));
        Http::fake(function ($request) {
            $rows = $request['dia'] === '2026-10-14'
                ? [['linha' => '5103', 'sentido' => '2', 'destino' => 'MAR Shopping', 'hora' => 24, 'minuto' => 10]] : [];

            return Http::response(['prg' => 'prt:190', 'horarios' => $rows]);
        });
        $this->getJson('/api/unir/stops/prt:190/schedule')->assertOk()
            ->assertJsonPath('data.schedule.0.times', ['00:10']);
    }

    public function test_source_failure_is_not_an_empty_successful_timetable(): void
    {
        Http::fake(['*' => Http::response('Unavailable', 503)]);
        $this->getJson('/api/unir/stops/prt:190/schedule')->assertStatus(503)->assertJsonPath('success', false);
    }
}
