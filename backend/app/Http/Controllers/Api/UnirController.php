<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class UnirController extends Controller
{
    private function fetch(string $url, array $query): array
    {
        $data = Http::connectTimeout(10)->timeout(30)->get($url, $query)->throw()->json();
        // Q.Horas currently wraps its JSON object in a JSON string.
        if (is_string($data)) {
            $data = json_decode($data, true, 512, JSON_THROW_ON_ERROR);
        }
        if (! is_array($data)) {
            throw new RuntimeException('Resposta UNIR inválida.');
        }

        return $data;
    }

    private function respond(callable $load): JsonResponse
    {
        try {
            return response()->json(['success' => true, 'data' => $load(), 'message' => 'Dados UNIR carregados.']);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['success' => false, 'data' => null, 'message' => 'O serviço UNIR está temporariamente indisponível.'], 503);
        }
    }

    public function stops(): JsonResponse
    {
        return $this->respond(function () {
            $stops = Cache::remember('unir:stops:v1', 3600, function () {
                $data = $this->fetch(config('unir.stops_url'), ['service' => 'WFS', 'version' => '1.0.0',
                    'request' => 'GetFeature', 'typeName' => 'paragens:paragens_geoserver',
                    'outputFormat' => 'application/json', 'srsName' => 'EPSG:4326']);
                if (! isset($data['features']) || count($data['features']) < ($data['totalFeatures'] ?? 0)) {
                    throw new RuntimeException('Lista de paragens UNIR incompleta.');
                }
                $stops = [];
                foreach ($data['features'] as $feature) {
                    $p = $feature['properties'];
                    $xy = $feature['geometry']['coordinates'] ?? [];
                    if (count($xy) !== 2 || empty($p['codparagem']) || empty($p['linhas'])) {
                        continue;
                    }
                    preg_match_all('/\b(\d{4})_/', $p['linhas'], $matches);
                    $stops[$p['codparagem']] = ['id' => $p['codparagem'], 'code' => $p['codparagem'],
                        'name' => $p['designacao'], 'lat' => (float) $xy[1], 'lon' => (float) $xy[0],
                        'lines' => array_values(array_unique($matches[1]))];
                }

                return array_values($stops);
            });

            return ['count' => count($stops), 'stops' => $stops];
        });
    }

    private function timetable(string $code, string $date): array
    {
        return Cache::remember('unir:schedule:'.hash('sha256', $code.$date), 60, function () use ($code, $date) {
            $data = $this->fetch(config('unir.api_url').'/get_horarios_prg', ['id' => $code, 'dia' => $date]);
            if (! isset($data['horarios'], $data['prg'])) {
                throw new RuntimeException('Horário UNIR inválido.');
            }

            return $data;
        });
    }

    public function schedule(string $code): JsonResponse
    {
        return $this->respond(function () use ($code) {
            $now = CarbonImmutable::now('Europe/Lisbon');
            $data = $this->timetable($code, $now->toDateString());
            $groups = [];
            $rows = $data['horarios'];
            // Overnight runs can be encoded as 24:xx or later on yesterday's service.
            $previous = $this->timetable($code, $now->subDay()->toDateString());
            foreach ($previous['horarios'] as $row) {
                if ((int) $row['hora'] >= 24) {
                    $row['hora'] = (int) $row['hora'] - 24;
                    $rows[] = $row;
                }
            }
            usort($rows, fn ($a, $b) => ((int) $a['hora'] * 60 + (int) $a['minuto']) <=> ((int) $b['hora'] * 60 + (int) $b['minuto']));
            foreach ($rows as $row) {
                if ((int) $row['hora'] * 60 + (int) $row['minuto'] < $now->hour * 60 + $now->minute) {
                    continue;
                }
                $key = $row['linha'].'|'.$row['sentido'].'|'.$row['destino'];
                $groups[$key] ??= ['line' => (string) $row['linha'], 'directionId' => (int) $row['sentido'],
                    'headsign' => $row['destino'], 'times' => []];
                $time = sprintf('%02d:%02d', $row['hora'], $row['minuto']);
                if (count($groups[$key]['times']) < 3 && ! in_array($time, $groups[$key]['times'], true)) {
                    $groups[$key]['times'][] = $time;
                }
            }

            return ['date' => $now->toDateString(), 'available' => true, 'schedule' => array_values($groups)];
        });
    }

    public function routes(string $code): JsonResponse
    {
        return $this->respond(function () use ($code) {
            $data = $this->timetable($code, CarbonImmutable::now('Europe/Lisbon')->toDateString());
            $routes = [];
            foreach ($data['horarios'] as $row) {
                $key = $row['linha'].'|'.$row['tipo'].'|'.$row['sentido'].'|'.$row['destino'];
                $routes[$key] ??= ['pattern' => $row['trip_id'], 'line' => (string) $row['linha'],
                    'headsign' => $row['destino'], 'directionId' => (int) $row['sentido'],
                    'shapeId' => $row['trip_id'], 'path' => [], 'stops' => []];
            }

            return ['routes' => array_values($routes)];
        });
    }

    public function route(string $trip): JsonResponse
    {
        return $this->respond(fn () => Cache::remember('unir:route:'.hash('sha256', $trip), 3600, function () use ($trip) {
            $data = $this->fetch(config('unir.api_url').'/get_horarios_serv', ['id' => $trip]);
            if (! isset($data['horario'], $data['geometry']['coordinates']) || $data['geometry']['type'] !== 'LineString') {
                throw new RuntimeException('Percurso UNIR inválido.');
            }
            $rows = $data['horario'];
            usort($rows, fn ($a, $b) => $a['ordem'] <=> $b['ordem']);
            $stops = array_map(fn ($s) => ['id' => $s['cod_paragem'], 'code' => $s['cod_paragem'],
                'name' => $s['desig_paragem'], 'lat' => (float) $s['lat'], 'lon' => (float) $s['lon']], $rows);

            return ['pattern' => $trip, 'line' => (string) $data['cod'], 'headsign' => end($stops)['name'] ?? '',
                'directionId' => (int) $data['sentido'], 'shapeId' => $trip, 'stops' => $stops,
                'path' => array_map(fn ($p) => [(float) $p[1], (float) $p[0]], $data['geometry']['coordinates'])];
        }));
    }
}
