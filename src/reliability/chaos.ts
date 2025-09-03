import { pool } from "../../server/db";

export interface ChaosTest {
  name: string;
  description: string;
  category: 'network' | 'database' | 'cpu' | 'memory' | 'disk';
  severity: 'low' | 'medium' | 'high';
  duration_seconds: number;
}

export interface ChaosResult {
  test: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  metrics?: any;
  recovery_time_seconds?: number;
  error?: string;
}

// Available chaos tests
export const CHAOS_TESTS: ChaosTest[] = [
  {
    name: 'db_connection_stress',
    description: 'Stress test database connections',
    category: 'database',
    severity: 'medium',
    duration_seconds: 60
  },
  {
    name: 'memory_pressure',
    description: 'Simulate memory pressure',
    category: 'memory',
    severity: 'medium',
    duration_seconds: 30
  },
  {
    name: 'cpu_spike',
    description: 'Generate CPU load spike',
    category: 'cpu',
    severity: 'low',
    duration_seconds: 45
  },
  {
    name: 'network_latency',
    description: 'Simulate network latency',
    category: 'network',
    severity: 'low',
    duration_seconds: 120
  }
];

export class ChaosEngine {
  private activeTests: Map<string, ChaosResult> = new Map();

  async runChaosTest(testName: string): Promise<ChaosResult> {
    const test = CHAOS_TESTS.find(t => t.name === testName);
    if (!test) {
      throw new Error(`Unknown chaos test: ${testName}`);
    }

    if (this.activeTests.has(testName)) {
      throw new Error(`Chaos test ${testName} is already running`);
    }

    const result: ChaosResult = {
      test: testName,
      started_at: new Date().toISOString(),
      status: 'running'
    };

    this.activeTests.set(testName, result);

    try {
      console.log(`[Chaos] Starting test: ${testName}`);
      
      switch (testName) {
        case 'db_connection_stress':
          await this.dbConnectionStress(test.duration_seconds);
          break;
        case 'memory_pressure':
          await this.memoryPressure(test.duration_seconds);
          break;
        case 'cpu_spike':
          await this.cpuSpike(test.duration_seconds);
          break;
        case 'network_latency':
          await this.networkLatency(test.duration_seconds);
          break;
        default:
          throw new Error(`Test implementation not found: ${testName}`);
      }

      result.status = 'completed';
      result.completed_at = new Date().toISOString();
      result.recovery_time_seconds = Math.floor(
        (new Date(result.completed_at).getTime() - new Date(result.started_at).getTime()) / 1000
      );

      console.log(`[Chaos] Test completed: ${testName} in ${result.recovery_time_seconds}s`);

    } catch (error) {
      result.status = 'failed';
      result.completed_at = new Date().toISOString();
      result.error = error instanceof Error ? error.message : String(error);
      console.error(`[Chaos] Test failed: ${testName}`, error);
    } finally {
      this.activeTests.delete(testName);
    }

    return result;
  }

  async abortChaosTest(testName: string): Promise<void> {
    const result = this.activeTests.get(testName);
    if (result) {
      result.status = 'aborted';
      result.completed_at = new Date().toISOString();
      this.activeTests.delete(testName);
      console.log(`[Chaos] Test aborted: ${testName}`);
    }
  }

  getActiveTests(): ChaosResult[] {
    return Array.from(this.activeTests.values());
  }

  private async dbConnectionStress(duration: number): Promise<void> {
    const connections: any[] = [];
    const maxConnections = 10;
    
    try {
      // Create multiple database connections
      for (let i = 0; i < maxConnections; i++) {
        const client = await pool.connect();
        connections.push(client);
        
        // Run a query that takes some time
        client.query('SELECT pg_sleep(0.1), generate_series(1, 1000)')
          .catch(() => {}); // Ignore errors
      }
      
      // Hold connections for the duration
      await new Promise(resolve => setTimeout(resolve, duration * 1000));
      
    } finally {
      // Release all connections
      connections.forEach(client => {
        try {
          client.release();
        } catch (e) {}
      });
    }
  }

  private async memoryPressure(duration: number): Promise<void> {
    const memoryHogs: any[] = [];
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    
    try {
      // Allocate memory gradually
      const endTime = Date.now() + (duration * 1000);
      
      while (Date.now() < endTime) {
        // Allocate 10MB of memory
        const chunk = Buffer.alloc(chunkSize);
        chunk.fill(0);
        memoryHogs.push(chunk);
        
        // Wait a bit before next allocation
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Don't exceed 100MB total
        if (memoryHogs.length > 10) break;
      }
      
      // Hold memory for remaining duration
      const remainingTime = endTime - Date.now();
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
      
    } finally {
      // Release memory
      memoryHogs.length = 0;
    }
  }

  private async cpuSpike(duration: number): Promise<void> {
    const endTime = Date.now() + (duration * 1000);
    const workers: Promise<void>[] = [];
    
    // Start CPU-intensive work on multiple threads
    for (let i = 0; i < 2; i++) {
      workers.push(this.cpuIntensiveWork(endTime));
    }
    
    await Promise.all(workers);
  }

  private async cpuIntensiveWork(endTime: number): Promise<void> {
    return new Promise((resolve) => {
      const work = () => {
        // Perform CPU-intensive calculation
        let result = 0;
        for (let i = 0; i < 1000000; i++) {
          result += Math.sqrt(i);
        }
        
        // Check if we should continue
        if (Date.now() < endTime) {
          // Use setImmediate to avoid blocking completely
          setImmediate(work);
        } else {
          resolve();
        }
      };
      
      work();
    });
  }

  private async networkLatency(duration: number): Promise<void> {
    // Simulate network latency by adding delays to operations
    const originalSetTimeout = global.setTimeout;
    const latencyMs = 100; // Add 100ms latency
    
    // Override setTimeout to add latency (simplified simulation)
    global.setTimeout = function(callback: any, delay: number, ...args: any[]) {
      return originalSetTimeout(callback, delay + latencyMs, ...args);
    } as any;
    
    try {
      await new Promise(resolve => setTimeout(resolve, duration * 1000));
    } finally {
      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    }
  }
}

export const chaosEngine = new ChaosEngine();