<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;
use ZipArchive;

final class MetroImportTest extends TestCase
{
    use DatabaseTransactions;

    public function test_import_preserves_stcp_and_excludes_terminal_departures(): void
    {
        $stcpCount = DB::table('stcp_stops')->count();
        $file = tempnam(sys_get_temp_dir(), 'metro-test-');
        $zip = new ZipArchive;
        $zip->open($file, ZipArchive::OVERWRITE);
        $zip->addFromString('routes.txt', "route_id,route_short_name\nA,A\n");
        $zip->addFromString('stops.txt', "stop_id,stop_code,stop_name,stop_lat,stop_lon\nSTART,,Início,41.15,-8.6\nEND,,Fim,41.16,-8.6\n");
        $zip->addFromString('trips.txt', "trip_id,route_id,service_id,trip_headsign,direction_id,shape_id\nTRIP,A,SERVICE,Fim,0,SHAPE\n");
        $zip->addFromString('shapes.txt', "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nSHAPE,41.16,-8.6,2\nSHAPE,41.15,-8.6,1\n");
        $zip->addFromString('calendar_dates.txt', "service_id,date,exception_type\nSERVICE,20261014,1\n");
        $zip->addFromString('stop_times.txt', "trip_id,stop_id,arrival_time,departure_time,stop_sequence\nTRIP,START,25:10:00,25:10:00,1\nTRIP,END,25:20:00,25:20:00,2\n");
        $zip->close();
        try {
            Http::fake(['*' => Http::response(file_get_contents($file), 200)]);
            $this->artisan('metro:import-gtfs')->assertSuccessful();
            $this->assertDatabaseHas('metro_stop_times', ['stop_id' => 'START', 'departure' => 90600]);
            $this->assertDatabaseMissing('metro_stop_times', ['stop_id' => 'END']);
            $this->assertDatabaseHas('metro_stops', ['id' => 'START', 'code' => 'START']);
            $this->assertSame($stcpCount, DB::table('stcp_stops')->count());
            $this->getJson('/api/metro/stops/END/routes')->assertOk()
                ->assertJsonPath('data.routes.0.line', 'A')
                ->assertJsonPath('data.routes.0.path.0', [41.15, -8.6])
                ->assertJsonPath('data.routes.0.stops.0.id', 'START')
                ->assertJsonPath('data.routes.0.stops.1.id', 'END');
            $this->getJson('/api/metro/stops/UNKNOWN/routes')->assertNotFound();
        } finally {
            unlink($file);
        }
    }
}
