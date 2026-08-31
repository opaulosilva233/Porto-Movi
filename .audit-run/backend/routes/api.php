<?php

declare(strict_types=1);

use App\Http\Controllers\Api\HealthCheckController;
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
