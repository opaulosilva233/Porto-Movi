<?php

declare(strict_types=1);

use App\Http\Controllers\Api\HealthCheckController;
use App\Http\Controllers\Api\LinesController;
use App\Http\Controllers\Api\PatternRouteController;
use App\Http\Controllers\Api\RealtimeVehiclesController;
use App\Http\Controllers\Api\ShapesController;
use App\Http\Controllers\Api\StopArrivalsController;
use App\Http\Controllers\Api\StopScheduleController;
use App\Http\Controllers\Api\StopsController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application.
| All routes in this file are loaded with strict types and REST standards.
|
*/

Route::get('/health', HealthCheckController::class)->name('api.health');
Route::get('/vehicles', RealtimeVehiclesController::class)->name('api.vehicles');
Route::get('/lines', LinesController::class)->name('api.lines');
Route::get('/shapes', ShapesController::class)->name('api.shapes.index');
Route::get('/stops', StopsController::class)->name('api.stops.index');
Route::get('/stops/{code}/arrivals', StopArrivalsController::class)->name('api.stops.arrivals');
Route::get('/stops/{code}/schedule', StopScheduleController::class)->name('api.stops.schedule');
Route::get('/patterns/{pattern}', PatternRouteController::class)->where('pattern', '.*')->name('api.patterns.show');
