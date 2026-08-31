<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StopResource;
use App\Services\StcpStopService;
use Illuminate\Http\JsonResponse;

final class StopArrivalsController extends Controller
{
    public function __invoke(string $code, StcpStopService $service): JsonResponse
    {
        $result = $service->arrivals($code);
        if ($result === null) {
            return response()->json(['success' => false, 'data' => null, 'message' => 'Paragem não encontrada.'], 404);
        }
        $result['stop'] = StopResource::make($result['stop'])->resolve();

        return response()->json(['success' => true, 'data' => $result, 'message' => 'Chegadas em tempo real atualizadas.']);
    }
}
