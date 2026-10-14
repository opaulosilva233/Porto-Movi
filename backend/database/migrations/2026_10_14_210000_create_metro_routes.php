<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metro_routes', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('line');
            $table->string('headsign')->nullable();
            $table->json('path');
            $table->json('stop_ids');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metro_routes');
    }
};
