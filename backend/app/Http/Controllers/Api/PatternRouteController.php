<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\StcpStopService;
use Illuminate\Http\JsonResponse;

final class PatternRouteController extends Controller
{
    public function __invoke(string $pattern, StcpStopService $service): JsonResponse
    {
        $result = $service->patternRoute($pattern);
        if ($result === null) {
            return response()->json(['success' => false, 'data' => null, 'message' => 'Percurso não encontrado.'], 404);
        }

        return response()->json(['success' => true, 'data' => $result, 'message' => 'Percurso e paragens carregados.']);
    }
}
