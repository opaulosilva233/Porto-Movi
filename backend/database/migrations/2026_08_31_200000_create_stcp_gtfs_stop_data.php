<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stcp_stops', function (Blueprint $table): void {
            $table->string('id', 80)->primary();
            $table->string('code', 80)->index();
            $table->string('name');
            $table->string('name_normalized')->index();
            $table->decimal('lat', 10, 7);
            $table->decimal('lon', 10, 7);
        });

        Schema::create('stcp_trips', function (Blueprint $table): void {
            $table->string('id', 190)->primary();
            $table->string('pattern', 160)->index();
            $table->string('line', 20)->index();
            $table->string('service_id', 100)->index();
            $table->string('headsign')->nullable();
            $table->unsignedTinyInteger('direction_id')->nullable();
            $table->string('shape_id', 160)->nullable()->index();
        });

        Schema::create('stcp_stop_times', function (Blueprint $table): void {
            $table->id();
            $table->string('trip_id', 190)->index();
            $table->string('stop_id', 80)->index();
            $table->string('arrival', 12);
            $table->string('departure', 12);
            $table->unsignedSmallInteger('sequence');
            $table->decimal('shape_distance', 12, 3)->nullable();
            $table->unique(['trip_id', 'sequence']);
        });

        Schema::create('stcp_stop_patterns', function (Blueprint $table): void {
            $table->string('stop_id', 80);
            $table->string('pattern', 160);
            $table->decimal('shape_distance', 12, 3);
            $table->primary(['stop_id', 'pattern']);
            $table->index('pattern');
        });

        Schema::create('stcp_service_dates', function (Blueprint $table): void {
            $table->string('service_id', 100);
            $table->date('service_date');
            $table->unsignedTinyInteger('exception_type');
            $table->primary(['service_id', 'service_date']);
            $table->index('service_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stcp_service_dates');
        Schema::dropIfExists('stcp_stop_patterns');
        Schema::dropIfExists('stcp_stop_times');
        Schema::dropIfExists('stcp_trips');
        Schema::dropIfExists('stcp_stops');
    }
};
