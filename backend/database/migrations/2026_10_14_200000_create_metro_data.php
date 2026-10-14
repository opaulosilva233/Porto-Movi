<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metro_stops', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('code');
            $table->string('name');
            $table->string('name_normalized');
            $table->double('lat');
            $table->double('lon');
        });
        Schema::create('metro_services', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->json('calendar')->nullable();
            $table->json('exceptions');
        });
        Schema::create('metro_trips', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('service_id')->index();
            $table->string('line');
            $table->string('headsign')->nullable();
            $table->unsignedTinyInteger('direction_id')->nullable();
        });
        Schema::create('metro_stop_times', function (Blueprint $table) {
            $table->string('trip_id');
            $table->string('stop_id');
            $table->unsignedInteger('departure');
            $table->index(['stop_id', 'departure']);
        });
    }

    public function down(): void
    {
        foreach (['metro_stop_times', 'metro_trips', 'metro_services', 'metro_stops'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
