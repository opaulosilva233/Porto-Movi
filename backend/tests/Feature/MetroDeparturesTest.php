<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class MetroDeparturesTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::forget('metro.departures.v1.TEST_LIVE');
        DB::table('metro_stops')->insert(['id' => 'TEST_LIVE', 'code' => 'TEST_LIVE', 'name' => 'Teste', 'name_normalized' => 'teste', 'lat' => 41.15, 'lon' => -8.6]);
    }

    public function test_only_confirmed_predictions_are_realtime_and_cancellations_are_preserved(): void
    {
        $base = ['serviceDay' => time(), 'scheduledDeparture' => 300, 'realtimeDeparture' => 600,
            'headsign' => 'Destino', 'trip' => ['gtfsId' => '1:TEST', 'route' => ['shortName' => 'D']]];
        Http::fake(['*' => Http::response(['data' => ['stop' => ['stoptimesWithoutPatterns' => [
            $base + ['realtime' => false, 'realtimeState' => 'SCHEDULED'],
            $base + ['realtime' => true, 'realtimeState' => 'UPDATED'],
            $base + ['realtime' => true, 'realtimeState' => 'CANCELED'],
        ]]]])]);
        $response = $this->getJson('/api/metro/stops/TEST_LIVE/departures')->assertOk()->assertJsonPath('data.available', true);
        $rows = $response->json('data.departures');
        $this->assertFalse($rows[0]['realtime']);
        $this->assertTrue($rows[1]['cancelled']);
        $this->assertTrue($rows[2]['realtime']);
        $this->assertSame(300, strtotime($rows[2]['departureAt']) - strtotime($rows[0]['departureAt']));
        $this->getJson('/api/metro/stops/TEST_LIVE/departures')->assertOk();
        Http::assertSentCount(1);
    }

    public function test_upstream_errors_report_unavailable_without_fake_arrivals(): void
    {
        Http::fake(['*' => Http::response(['errors' => [['message' => 'Unavailable']]])]);
        $this->getJson('/api/metro/stops/TEST_LIVE/departures')->assertOk()
            ->assertJsonPath('data.available', false)->assertJsonPath('data.departures', []);
        $this->getJson('/api/metro/stops/UNKNOWN/departures')->assertNotFound();
    }
}
