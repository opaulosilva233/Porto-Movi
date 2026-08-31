export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message: string;
}

export interface HealthCheckData {
  status: 'operational' | 'degraded';
  app: {
    name: string;
    environment: string;
    php_version: string;
    laravel_version: string;
  };
  database: {
    status: string;
    connection: string;
    message: string;
  };
  timestamp: string;
}

export interface Vehicle {
  id: string;
  line: string;
  pattern: string | null;
  headsign: string | null;
  directionId: number | null;
  shapeId: string | null;
  lat: number;
  lon: number;
  bearing: number;
  speedKmh: number;
  observedAt: string;
  ageSec: number;
}

export interface ShapePayload {
  id: string;
  path: Array<[number, number]>;
}

export interface VehiclesPayload {
  updatedAt: string;
  count: number;
  stale: boolean;
  source: 'fiware';
  vehicles: Vehicle[];
}

export interface StopInfo {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Arrival {
  vehicleId: string;
  line: string;
  headsign: string | null;
  directionId: number | null;
  shapeId: string | null;
  lat: number;
  lon: number;
  speedKmh: number;
  distanceM: number;
  etaSeconds: number;
  atStop: boolean;
}

export interface ArrivalsPayload {
  stop: StopInfo;
  updatedAt: string;
  realtime: boolean;
  arrivals: Arrival[];
}

export interface ScheduleItem {
  line: string;
  headsign: string | null;
  directionId: number | null;
  times: string[];
}

export interface SchedulePayload {
  stop: StopInfo;
  date: string;
  schedule: ScheduleItem[];
}

export interface PatternRoutePayload {
  pattern: string;
  line: string;
  headsign: string | null;
  directionId: number | null;
  shapeId: string;
  path: Array<[number, number]>;
  stops: Array<StopInfo & { shapeDistance: number }>;
}
