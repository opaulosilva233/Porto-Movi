<?php

declare(strict_types=1);

return [
    'departures_url' => env('METRO_DEPARTURES_URL', 'https://otp.portodigital.pt/otp/routers/default/index/graphql'),
    'feed_prefix' => env('METRO_FEED_PREFIX', '1:'),
    'gtfs_url' => env('METRO_GTFS_URL', 'https://www.metrodoporto.pt/metrodoporto/uploads/document/file/794/google_transit_04_09_2026.zip'),
];
