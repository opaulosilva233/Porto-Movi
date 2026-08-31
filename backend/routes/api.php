<?php

declare(strict_types=1);

use App\Http\Controllers\Api\HealthCheckController;
use App\Http\Controllers\Api\LinesController;
use App\Http\Controllers\Api\RealtimeVehiclesController;
use App\Http\Controllers\Api\ShapesController;
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
