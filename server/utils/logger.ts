import { Request } from 'express';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogContext {
  service?: string;
  userId?: string;
  correlationId?: string;
  requestId?: string;
  [key: string]: any;
}

export class Logger {
  private service: string;
  private context: LogContext = {};
  
  constructor(service: string) {
    this.service = service;
  }
  
  setContext(context: LogContext) {
    this.context = { ...this.context, ...context };
  }
  
  clearContext() {
    this.context = {};
  }
  
  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const contextStr = Object.keys(this.context).length > 0 
      ? ` [${Object.entries(this.context).map(([k, v]) => `${k}:${v}`).join(' ')}]`
      : '';
    
    const prefix = `[${this.service}]${contextStr}`;
    
    if (data !== undefined) {
      if (typeof data === 'object') {
        return `${prefix} ${message}`;
      } else {
        return `${prefix} ${message}: ${data}`;
      }
    }
    
    return `${prefix} ${message}`;
  }
  
  private log(level: LogLevel, message: string, data?: any) {
    const formattedMessage = this.formatMessage(level, message, data);
    
    switch (level) {
      case LogLevel.ERROR:
        if (data && typeof data === 'object') {
          console.error(formattedMessage, data);
        } else {
          console.error(formattedMessage);
        }
        break;
      case LogLevel.WARN:
        if (data && typeof data === 'object') {
          console.warn(formattedMessage, data);
        } else {
          console.warn(formattedMessage);
        }
        break;
      case LogLevel.DEBUG:
        if (process.env.DEBUG === 'true') {
          if (data && typeof data === 'object') {
            console.log(formattedMessage, data);
          } else {
            console.log(formattedMessage);
          }
        }
        break;
      case LogLevel.INFO:
      default:
        if (data && typeof data === 'object') {
          console.log(formattedMessage, data);
        } else {
          console.log(formattedMessage);
        }
        break;
    }
  }
  
  error(message: string, error?: Error | any) {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    } else {
      this.log(LogLevel.ERROR, message, error);
    }
  }
  
  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data);
  }
  
  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data);
  }
  
  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data);
  }
  
  // Request-specific logging
  logRequest(req: Request, message: string, data?: any) {
    const requestContext: LogContext = {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userId: (req as any).user?.id || 'anonymous'
    };
    
    const prevContext = this.context;
    this.setContext(requestContext);
    this.info(message, data);
    this.context = prevContext;
  }
  
  // Performance logging
  startTimer(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`${label} completed`, { durationMs: duration });
    };
  }
  
  // Structured error logging
  logError(error: Error | any, context?: string) {
    const errorData = {
      context,
      name: error?.name || 'UnknownError',
      message: error?.message || 'Unknown error occurred',
      stack: error?.stack,
      code: error?.code,
      ...this.context
    };
    
    this.error(`Error in ${context || 'unknown context'}`, errorData);
  }
  
  // Batch operation logging
  logBatch(operation: string, total: number, processed: number, failed?: number) {
    const successRate = total > 0 ? ((processed - (failed || 0)) / total * 100).toFixed(2) : '0';
    
    this.info(`Batch ${operation} completed`, {
      total,
      processed,
      failed: failed || 0,
      successRate: `${successRate}%`
    });
  }
  
  // Database operation logging
  logQuery(query: string, params?: any[], duration?: number) {
    if (process.env.LOG_SQL === 'true') {
      this.debug('SQL Query', {
        query: query.substring(0, 500), // Truncate long queries
        params: params?.slice(0, 10), // Limit param logging
        duration: duration ? `${duration}ms` : undefined
      });
    }
  }
}

// Factory function for creating service-specific loggers
export function createLogger(service: string): Logger {
  return new Logger(service);
}

// Global logger instances for common services
export const loggers = {
  auth: createLogger('Auth'),
  payment: createLogger('Payment'),
  escrow: createLogger('Escrow'),
  remittance: createLogger('Remittance'),
  reconciliation: createLogger('Reconciliation'),
  api: createLogger('API'),
  db: createLogger('Database'),
  rabbit: createLogger('RabbitMQ'),
  scheduler: createLogger('Scheduler'),
  document: createLogger('Document'),
  crm: createLogger('CRM'),
  cash: createLogger('CashManagement'),
  dlq: createLogger('DLQ'),
  queue: createLogger('QueueMonitor')
};