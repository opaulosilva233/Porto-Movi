<?php

declare(strict_types=1);

return [
    'gtfs_url' => env('STCP_GTFS_URL'),
    'gtfs_dataset_api_url' => env(
        'STCP_GTFS_DATASET_API_URL',
        'https://opendata.porto.digital/api/3/action/package_show?id=horarios-paragens-e-rotas-em-formato-gtfs-stcp',
    ),
];
