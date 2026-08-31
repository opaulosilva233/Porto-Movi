<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class VehicleResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->resource['id'],
            'line' => (string) $this->resource['line'],
            'pattern' => $this->resource['pattern'],
            'headsign' => $this->resource['headsign'],
            'directionId' => $this->resource['directionId'],
            'shapeId' => $this->resource['shapeId'],
            'lat' => (float) $this->resource['lat'],
            'lon' => (float) $this->resource['lon'],
            'bearing' => (float) $this->resource['bearing'],
            'speedKmh' => (float) $this->resource['speedKmh'],
            'observedAt' => (string) $this->resource['observedAt'],
            'ageSec' => (int) $this->resource['ageSec'],
        ];
    }
}
