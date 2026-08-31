<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VehicleResource;
use App\Services\StcpRealtimeService;
use Illuminate\Http\JsonResponse;

final class RealtimeVehiclesController extends Controller
{
    public function __invoke(StcpRealtimeService $service): JsonResponse
    {
        $result = $service->vehicles();
        $vehicles = VehicleResource::collection($result['vehicles'])->resolve();

        return response()->json([
            'success' => $result['ok'],
            'data' => [
                'updatedAt' => $result['updatedAt'],
                'count' => count($vehicles),
                'stale' => $result['stale'],
                'source' => $result['source'],
                'vehicles' => $vehicles,
            ],
            'message' => $result['error'] ?? 'Posições STCP atualizadas.',
        ]);
    }
}
