<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ShapeResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $points = is_string($this->resource->points)
            ? json_decode($this->resource->points, true, 512, JSON_THROW_ON_ERROR)
            : $this->resource->points;

        return ['id' => (string) $this->resource->id, 'path' => $points];
    }
}
