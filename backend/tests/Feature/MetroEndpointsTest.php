<?php

declare(strict_types=1);

namespace Tests\Feature;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class MetroEndpointsTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function seedMetro(): void
    {
        DB::table('metro_stops')->insert(['id' => 'TEST_METRO', 'code' => 'TEST_METRO',
            'name' => 'Estação Teste', 'name_normalized' => 'estacao teste', 'lat' => 41.15, 'lon' => -8.6]);
        DB::table('metro_services')->insert(['id' => 'TEST_METRO_SERVICE', 'calendar' => json_encode([
            'start_date' => '20261001', 'end_date' => '20261031', 'monday' => 1, 'tuesday' => 1,
            'wednesday' => 1, 'thursday' => 1, 'friday' => 1, 'saturday' => 0, 'sunday' => 0,
        ]), 'exceptions' => '{}']);
        DB::table('metro_trips')->insert(['id' => 'TEST_METRO_TRIP', 'service_id' => 'TEST_METRO_SERVICE',
            'line' => 'A', 'headsign' => 'Destino Teste', 'direction_id' => 0]);
    }

    public function test_weekday_schedule_is_separate_from_stcp_and_sorted(): void
    {
        $this->seedMetro();
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-14 12:00:00', 'Europe/Lisbon'));
        foreach ([13 * 3600, 11 * 3600, 12 * 3600 + 600] as $time) {
            DB::table('metro_stop_times')->insert(['trip_id' => 'TEST_METRO_TRIP', 'stop_id' => 'TEST_METRO', 'departure' => $time]);
        }
        $this->getJson('/api/metro/stops')->assertOk()->assertJsonFragment(['id' => 'TEST_METRO']);
        $this->getJson('/api/stops?q=TEST_METRO')->assertOk()->assertJsonMissing(['id' => 'TEST_METRO']);
        $this->getJson('/api/metro/stops/TEST_METRO/schedule')->assertOk()
            ->assertJsonPath('data.available', true)->assertJsonPath('data.schedule.0.times', ['12:10', '13:00']);
        $this->getJson('/api/metro/stops/missing-station/schedule')->assertNotFound();
    }

    public function test_calendar_exceptions_override_weekday_and_weekend(): void
    {
        $this->seedMetro();
        DB::table('metro_stop_times')->insert(['trip_id' => 'TEST_METRO_TRIP', 'stop_id' => 'TEST_METRO', 'departure' => 13 * 3600]);
        DB::table('metro_services')->where('id', 'TEST_METRO_SERVICE')->update(['exceptions' => '{"20261014":2,"20261018":1}']);
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-14 12:00:00', 'Europe/Lisbon'));
        $this->getJson('/api/metro/stops/TEST_METRO/schedule')->assertJsonPath('data.schedule', []);
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-18 12:00:00', 'Europe/Lisbon'));
        $this->getJson('/api/metro/stops/TEST_METRO/schedule')->assertJsonPath('data.schedule.0.times', ['13:00']);
    }

    public function test_after_midnight_departures_use_previous_service_day(): void
    {
        $this->seedMetro();
        DB::table('metro_stop_times')->insert(['trip_id' => 'TEST_METRO_TRIP', 'stop_id' => 'TEST_METRO', 'departure' => 25 * 3600 + 600]);
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-17 00:30:00', 'Europe/Lisbon'));
        $this->getJson('/api/metro/stops/TEST_METRO/schedule')->assertJsonPath('data.schedule.0.times', ['01:10']);
    }

    public function test_expired_calendar_is_reported_as_unavailable(): void
    {
        $this->seedMetro();
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2035-01-01 12:00:00', 'Europe/Lisbon'));
        $this->getJson('/api/metro/stops/TEST_METRO/schedule')->assertJsonPath('data.available', false)->assertJsonPath('data.schedule', []);
    }
}
