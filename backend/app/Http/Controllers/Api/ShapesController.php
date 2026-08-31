<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ShapesRequest;
use App\Http\Resources\ShapeResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

final class ShapesController extends Controller
{
    public function __invoke(ShapesRequest $request): JsonResponse
    {
        /** @var array<int, string> $ids */
        $ids = $request->validated('ids');
        $rows = DB::table('stcp_shapes')->whereIn('id', $ids)->get(['id', 'points']);
        $shapes = ShapeResource::collection($rows)->resolve();

        return response()->json([
            'success' => true,
            'data' => ['shapes' => $shapes],
            'message' => 'Traçados STCP carregados.',
        ]);
    }
}
