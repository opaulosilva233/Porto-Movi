<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'message' => 'Welcome to the REST API Backend',
        'health_check' => url('/api/health'),
    ]);
});
