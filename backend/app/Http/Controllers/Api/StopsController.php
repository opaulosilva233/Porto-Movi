<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StopsRequest;
use App\Http\Resources\StopResource;
use App\Services\StcpStopService;
use Illuminate\Http\JsonResponse;

final class StopsController extends Controller
{
    public function __invoke(StopsRequest $request, StcpStopService $service): JsonResponse
    {
        $stops = StopResource::collection($service->stops($request->validated('q')))->resolve();

        return response()->json([
            'success' => true,
            'data' => ['count' => count($stops), 'stops' => $stops],
            'message' => 'Paragens STCP carregadas.',
        ]);
    }
}
