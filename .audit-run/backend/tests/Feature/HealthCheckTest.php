<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

class HealthCheckTest extends TestCase
{
    /**
     * Test the health check endpoint returns proper JSON structure.
     */
    public function test_health_check_endpoint_returns_json(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'data' => [
                    'status',
                    'app' => [
                        'name',
                        'environment',
                        'php_version',
                        'laravel_version',
                    ],
                    'database' => [
                        'status',
                        'connection',
                        'message',
                    ],
                    'timestamp',
                ],
                'message',
            ]);
    }
}
