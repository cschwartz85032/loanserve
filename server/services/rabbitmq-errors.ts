/**
 * RabbitMQ Error Classification System
 * Differentiates between transient and permanent failures for proper retry handling
 */

/**
 * Base class for all RabbitMQ processing errors
 */
export abstract class RabbitMQError extends Error {
  abstract readonly isRetryable: boolean;
  abstract readonly retryAfterMs?: number;
  
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Permanent errors that should NOT be retried
 * These go straight to the DLQ
 */
export class PermanentError extends RabbitMQError {
  readonly isRetryable = false;
  
  constructor(message: string, originalError?: Error) {
    super(message, originalError);
  }
}

/**
 * Transient errors that SHOULD be retried
 * These get requeued with exponential backoff
 */
export class TransientError extends RabbitMQError {
  readonly isRetryable = true;
  readonly retryAfterMs: number;
  
  constructor(message: string, retryAfterMs: number = 5000, originalError?: Error) {
    super(message, originalError);
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Specific error types
 */

// Validation errors - permanent, no retry
export class ValidationError extends PermanentError {
  constructor(message: string, originalError?: Error) {
    super(`Validation failed: ${message}`, originalError);
  }
}

// Business rule violations - permanent, no retry
export class BusinessRuleError extends PermanentError {
  constructor(message: string, originalError?: Error) {
    super(`Business rule violation: ${message}`, originalError);
  }
}

// Data not found - permanent, no retry
export class NotFoundError extends PermanentError {
  constructor(message: string, originalError?: Error) {
    super(`Entity not found: ${message}`, originalError);
  }
}

// Malformed message - permanent, no retry
export class MalformedMessageError extends PermanentError {
  constructor(message: string, originalError?: Error) {
    super(`Malformed message: ${message}`, originalError);
  }
}

// Database connection errors - transient, retry
export class DatabaseConnectionError extends TransientError {
  constructor(message: string = 'Database connection failed', originalError?: Error) {
    super(message, 5000, originalError); // Retry after 5 seconds
  }
}

// External service errors - transient, retry
export class ExternalServiceError extends TransientError {
  constructor(service: string, originalError?: Error) {
    super(`External service error: ${service}`, 10000, originalError); // Retry after 10 seconds
  }
}

// Rate limit errors - transient, retry with backoff
export class RateLimitError extends TransientError {
  constructor(retryAfterMs: number = 30000, originalError?: Error) {
    super('Rate limit exceeded', retryAfterMs, originalError);
  }
}

// Timeout errors - transient, retry
export class TimeoutError extends TransientError {
  constructor(operation: string, originalError?: Error) {
    super(`Operation timeout: ${operation}`, 5000, originalError);
  }
}

// Resource temporarily unavailable - transient, retry
export class ResourceUnavailableError extends TransientError {
  constructor(resource: string, originalError?: Error) {
    super(`Resource temporarily unavailable: ${resource}`, 5000, originalError);
  }
}

/**
 * Error classifier - determines if an error is transient or permanent
 */
export class ErrorClassifier {
  /**
   * Classify an error and wrap it appropriately
   */
  static classify(error: unknown): RabbitMQError {
    // If already classified, return as-is
    if (error instanceof RabbitMQError) {
      return error;
    }

    // Convert to Error if needed
    const err = error instanceof Error ? error : new Error(String(error));
    const message = err.message.toLowerCase();
    const code = (err as any).code;

    // Database connection errors
    if (
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND' ||
      message.includes('connection refused') ||
      message.includes('connection timeout') ||
      message.includes('connection lost') ||
      message.includes('connection terminated') ||
      message.includes('too many connections')
    ) {
      return new DatabaseConnectionError(err.message, err);
    }

    // Network errors
    if (
      code === 'ENETUNREACH' ||
      code === 'EHOSTUNREACH' ||
      code === 'ECONNRESET' ||
      message.includes('network') ||
      message.includes('socket hang up')
    ) {
      return new ExternalServiceError('network', err);
    }

    // Rate limiting
    if (
      code === 429 ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('throttle')
    ) {
      return new RateLimitError(30000, err);
    }

    // Timeout errors
    if (
      code === 'ETIMEDOUT' ||
      message.includes('timeout') ||
      message.includes('timed out')
    ) {
      return new TimeoutError('operation', err);
    }

    // Resource unavailable
    if (
      code === 'EAGAIN' ||
      code === 'EBUSY' ||
      message.includes('resource temporarily unavailable') ||
      message.includes('resource busy') ||
      message.includes('lock timeout')
    ) {
      return new ResourceUnavailableError('resource', err);
    }

    // Validation errors - permanent
    if (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required') ||
      message.includes('must be') ||
      message.includes('should be') ||
      message.includes('constraint')
    ) {
      return new ValidationError(err.message, err);
    }

    // Not found errors - permanent
    if (
      code === 404 ||
      message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('no such')
    ) {
      return new NotFoundError(err.message, err);
    }

    // Business rule violations - permanent
    if (
      message.includes('insufficient') ||
      message.includes('exceeds') ||
      message.includes('not allowed') ||
      message.includes('forbidden') ||
      message.includes('unauthorized') ||
      message.includes('already exists')
    ) {
      return new BusinessRuleError(err.message, err);
    }

    // JSON/parsing errors - permanent
    if (
      message.includes('json') ||
      message.includes('parse') ||
      message.includes('syntax') ||
      message.includes('malformed')
    ) {
      return new MalformedMessageError(err.message, err);
    }

    // Default: treat unknown errors as transient with standard retry
    // This is conservative - we'd rather retry than lose a message
    return new TransientError(`Unclassified error: ${err.message}`, 5000, err);
  }

  /**
   * Calculate exponential backoff delay
   */
  static calculateBackoff(attemptNumber: number, baseDelayMs: number = 1000): number {
    // Exponential backoff with jitter: delay = base * 2^attempt + random jitter
    const exponentialDelay = baseDelayMs * Math.pow(2, attemptNumber);
    const jitter = Math.random() * 1000; // 0-1000ms random jitter
    const maxDelay = 60000; // Cap at 60 seconds
    
    return Math.min(exponentialDelay + jitter, maxDelay);
  }
}

/**
 * Message retry tracker
 */
export class RetryTracker {
  private attempts = new Map<string, number>();
  private lastAttempt = new Map<string, Date>();
  
  constructor(private readonly maxAttempts: number = 5) {}

  /**
   * Record an attempt and check if we should retry
   */
  shouldRetry(messageId: string, error: RabbitMQError): boolean {
    // Never retry permanent errors
    if (!error.isRetryable) {
      return false;
    }

    const currentAttempts = this.attempts.get(messageId) || 0;
    
    // Check max attempts
    if (currentAttempts >= this.maxAttempts) {
      console.log(`[RetryTracker] Max attempts (${this.maxAttempts}) reached for message ${messageId}`);
      return false;
    }

    // Update attempt count
    this.attempts.set(messageId, currentAttempts + 1);
    this.lastAttempt.set(messageId, new Date());
    
    return true;
  }

  /**
   * Get the delay before next retry
   */
  getRetryDelay(messageId: string): number {
    const attempts = this.attempts.get(messageId) || 0;
    return ErrorClassifier.calculateBackoff(attempts);
  }

  /**
   * Clear tracking for a message (on success or final failure)
   */
  clear(messageId: string): void {
    this.attempts.delete(messageId);
    this.lastAttempt.delete(messageId);
  }

  /**
   * Clean up old entries (maintenance)
   */
  cleanup(olderThanMs: number = 3600000): void {
    const now = Date.now();
    for (const [messageId, lastAttempt] of this.lastAttempt.entries()) {
      if (now - lastAttempt.getTime() > olderThanMs) {
        this.clear(messageId);
      }
    }
  }
}