<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class RealtimeVehiclesTest extends TestCase
{
    public function test_it_normalizes_fiware_vehicles(): void
    {
        Cache::flush();
        Http::fake([
            'broker.fiware.urbanplatform.portodigital.pt/*' => Http::response([[
                'id' => 'urn:ngsi-ld:Vehicle:porto:stcp:bus:1833',
                'annotations' => ['value' => ['stcp:route:107', 'stcp:sentido:0', 'stcp:nr_viagem:107_0_1|291']],
                'fleetVehicleId' => ['value' => '1833'],
                'location' => ['value' => ['coordinates' => [-8.5785, 41.1593]]],
                'heading' => ['value' => 8],
                'speed' => ['value' => 3.9],
                'observationDateTime' => ['value' => now()->subSeconds(5)->toIso8601String()],
            ]], 200),
        ]);

        $this->getJson('/api/vehicles')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.vehicles.0.id', '1833')
            ->assertJsonPath('data.vehicles.0.line', '107')
            ->assertJsonPath('data.vehicles.0.speedKmh', 14);
    }
}
