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
