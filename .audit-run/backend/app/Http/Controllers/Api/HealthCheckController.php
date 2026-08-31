<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthCheckController extends Controller
{
    /**
     * Return system health status and connectivity metrics.
     */
    public function __invoke(): JsonResponse
    {
        $dbStatus = 'healthy';
        $dbMessage = 'Connected successfully';

        try {
            DB::connection()->getPdo();
        } catch (Throwable $e) {
            $dbStatus = 'unhealthy';
            $dbMessage = $e->getMessage();
        }

        $isHealthy = $dbStatus === 'healthy';

        return response()->json([
            'success' => $isHealthy,
            'data' => [
                'status' => $isHealthy ? 'operational' : 'degraded',
                'app' => [
                    'name' => config('app.name', 'Laravel API'),
                    'environment' => config('app.env', 'production'),
                    'php_version' => PHP_VERSION,
                    'laravel_version' => app()->version(),
                ],
                'database' => [
                    'status' => $dbStatus,
                    'connection' => config('database.default'),
                    'message' => $dbMessage,
                ],
                'timestamp' => now()->toIso8601String(),
            ],
            'message' => $isHealthy
                ? 'All systems operational'
                : 'System is experiencing degraded service',
        ], $isHealthy ? 200 : 503);
    }
}
