<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\StcpRealtimeService;
use Illuminate\Http\JsonResponse;

final class LinesController extends Controller
{
    public function __invoke(StcpRealtimeService $service): JsonResponse
    {
        $result = $service->vehicles();
        $counts = [];
        foreach ($result['vehicles'] as $vehicle) {
            $line = (string) $vehicle['line'];
            $counts[$line] = ($counts[$line] ?? 0) + 1;
        }

        uksort($counts, 'strnatcasecmp');
        $lines = [];
        foreach ($counts as $line => $activeBuses) {
            $lines[] = ['id' => $line, 'activeBuses' => $activeBuses];
        }

        return response()->json([
            'success' => $result['ok'],
            'data' => ['updatedAt' => $result['updatedAt'], 'stale' => $result['stale'], 'lines' => $lines],
            'message' => $result['error'] ?? 'Linhas em circulação atualizadas.',
        ]);
    }
}
