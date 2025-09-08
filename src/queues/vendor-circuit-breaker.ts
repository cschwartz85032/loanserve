interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailure: null,
    state: 'CLOSED'
  };
  
  constructor(
    private failureThreshold: number = 5,
    private resetTimeoutMs: number = 60000,
    private monitoringTimeWindow: number = 120000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    return this.state.lastFailure !== null &&
           Date.now() - this.state.lastFailure.getTime() > this.resetTimeoutMs;
  }

  private onSuccess(): void {
    this.state.failures = 0;
    this.state.state = 'CLOSED';
  }

  private onFailure(): void {
    this.state.failures++;
    this.state.lastFailure = new Date();
    
    if (this.state.failures >= this.failureThreshold) {
      this.state.state = 'OPEN';
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

export class RetryWithBackoff {
  constructor(
    private maxRetries: number = 3,
    private baseDelayMs: number = 1000,
    private maxDelayMs: number = 30000,
    private backoffMultiplier: number = 2
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.maxRetries) {
          throw lastError;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.baseDelayMs * Math.pow(this.backoffMultiplier, attempt),
          this.maxDelayMs
        );
        
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.1 * delay;
        await this.sleep(delay + jitter);
      }
    }
    
    throw lastError!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}