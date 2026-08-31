<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class StopResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->resource->id,
            'code' => (string) $this->resource->code,
            'name' => (string) $this->resource->name,
            'lat' => (float) $this->resource->lat,
            'lon' => (float) $this->resource->lon,
        ];
    }
}
