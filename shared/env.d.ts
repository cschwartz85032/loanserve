declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'local' | 'dev' | 'staging' | 'prod';
      SERVICE_NAME: string;
      HTTP_PORT: string;
      
      CLOUDAMQP_URL: string;
      RABBIT_HEARTBEAT_SEC: string;
      RABBIT_PREFETCH: string;
      RABBIT_RECONNECT_MAX: string;
      RABBIT_RECONNECT_BASE_MS: string;
      
      OTEL_EXPORTER_OTLP_ENDPOINT?: string;
      OTEL_SAMPLING_RATIO?: string;
      OTEL_RESOURCE_ATTRIBUTES?: string;
      
      LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
      LOG_PRETTY?: string;
      
      DB_URL?: string;
      DATABASE_URL?: string;
      DB_HEALTH_QUERY?: string;
      
      SESSION_SECRET?: string;
    }
  }
}

export {};