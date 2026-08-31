<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stcp_trip_patterns', function (Blueprint $table): void {
            $table->string('pattern', 160)->primary();
            $table->string('line', 20)->index();
            $table->string('headsign')->nullable();
            $table->unsignedTinyInteger('direction_id')->nullable();
            $table->string('shape_id', 160)->nullable()->index();
        });

        Schema::create('stcp_shapes', function (Blueprint $table): void {
            $table->string('id', 160)->primary();
            $table->json('points');
            $table->unsignedSmallInteger('point_count');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stcp_shapes');
        Schema::dropIfExists('stcp_trip_patterns');
    }
};
