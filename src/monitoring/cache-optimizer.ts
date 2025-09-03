/**
 * Advanced Caching and Optimization
 * Intelligent caching with performance monitoring and automatic optimization
 */

import { Pool } from "pg";
import { createHash } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface CacheConfig {
  ttlSeconds: number;
  maxSize: number;
  evictionPolicy: 'lru' | 'lfu' | 'ttl';
  compressionEnabled: boolean;
}

export interface CacheMetric {
  tenantId: string;
  cacheType: string;
  operation: 'hit' | 'miss' | 'eviction' | 'write';
  keyHash: string;
  latencyMs: number;
  sizeBytes?: number;
  ttlSeconds?: number;
}

/**
 * Intelligent Cache Manager
 */
export class CacheOptimizer {
  private static instance: CacheOptimizer;
  private caches: Map<string, Map<string, any>> = new Map();
  private cacheStats: Map<string, { hits: number; misses: number }> = new Map();
  private metricsBuffer: CacheMetric[] = [];

  constructor() {
    // Start periodic optimization
    setInterval(() => this.optimizeCaches(), 300000); // 5 minutes
    setInterval(() => this.flushMetrics(), 30000); // 30 seconds
  }

  static getInstance(): CacheOptimizer {
    if (!CacheOptimizer.instance) {
      CacheOptimizer.instance = new CacheOptimizer();
    }
    return CacheOptimizer.instance;
  }

  /**
   * Get value from cache with performance tracking
   */
  async get(
    tenantId: string,
    cacheType: string,
    key: string
  ): Promise<any | null> {
    const startTime = Date.now();
    const cacheKey = `${tenantId}:${cacheType}`;
    const cache = this.caches.get(cacheKey);
    const keyHash = this.hashKey(key);

    let value = null;
    let operation: 'hit' | 'miss' = 'miss';

    if (cache?.has(key)) {
      value = cache.get(key);
      operation = 'hit';
      this.incrementHits(cacheKey);
    } else {
      this.incrementMisses(cacheKey);
    }

    const latencyMs = Date.now() - startTime;

    // Record metric
    this.recordMetric({
      tenantId,
      cacheType,
      operation,
      keyHash,
      latencyMs
    });

    return value;
  }

  /**
   * Set value in cache with optimization
   */
  async set(
    tenantId: string,
    cacheType: string,
    key: string,
    value: any,
    ttlSeconds?: number
  ): Promise<void> {
    const startTime = Date.now();
    const cacheKey = `${tenantId}:${cacheType}`;
    const keyHash = this.hashKey(key);

    // Initialize cache if not exists
    if (!this.caches.has(cacheKey)) {
      this.caches.set(cacheKey, new Map());
    }

    const cache = this.caches.get(cacheKey)!;
    
    // Apply eviction policy if cache is full
    const maxSize = this.getCacheConfig(cacheType).maxSize;
    if (cache.size >= maxSize) {
      await this.evictEntries(tenantId, cacheType, 1);
    }

    // Set value with metadata
    const entry = {
      value,
      timestamp: Date.now(),
      ttl: ttlSeconds || this.getCacheConfig(cacheType).ttlSeconds,
      accessCount: 0
    };

    cache.set(key, entry);

    const latencyMs = Date.now() - startTime;
    const sizeBytes = this.estimateSize(value);

    // Record metric
    this.recordMetric({
      tenantId,
      cacheType,
      operation: 'write',
      keyHash,
      latencyMs,
      sizeBytes,
      ttlSeconds: entry.ttl
    });
  }

  /**
   * Get cache hit rate
   */
  getHitRate(tenantId: string, cacheType: string): number {
    const cacheKey = `${tenantId}:${cacheType}`;
    const stats = this.cacheStats.get(cacheKey);
    
    if (!stats || (stats.hits + stats.misses) === 0) {
      return 0;
    }

    return stats.hits / (stats.hits + stats.misses);
  }

  /**
   * Get cache performance analytics
   */
  async getCacheAnalytics(
    tenantId: string,
    hoursBack: number = 24
  ): Promise<{
    hitRates: Record<string, number>;
    avgLatency: Record<string, number>;
    totalSizeMB: Record<string, number>;
    evictionRates: Record<string, number>;
  }> {
    const c = await pool.connect();
    try {
      // Get hit rates
      const hitRateResult = await c.query(
        `SELECT 
           cache_type,
           COUNT(*) FILTER (WHERE operation = 'hit') as hits,
           COUNT(*) FILTER (WHERE operation = 'miss') as misses
         FROM cache_metrics 
         WHERE tenant_id = $1 AND timestamp >= now() - interval '${hoursBack} hours'
         GROUP BY cache_type`,
        [tenantId]
      );

      const hitRates: Record<string, number> = {};
      for (const row of hitRateResult.rows) {
        const total = parseInt(row.hits) + parseInt(row.misses);
        hitRates[row.cache_type] = total > 0 ? parseInt(row.hits) / total : 0;
      }

      // Get average latencies
      const latencyResult = await c.query(
        `SELECT cache_type, AVG(latency_ms) as avg_latency
         FROM cache_metrics 
         WHERE tenant_id = $1 AND timestamp >= now() - interval '${hoursBack} hours'
         GROUP BY cache_type`,
        [tenantId]
      );

      const avgLatency: Record<string, number> = {};
      for (const row of latencyResult.rows) {
        avgLatency[row.cache_type] = parseFloat(row.avg_latency);
      }

      // Get cache sizes
      const sizeResult = await c.query(
        `SELECT cache_type, SUM(size_bytes) / (1024*1024) as total_mb
         FROM cache_metrics 
         WHERE tenant_id = $1 AND operation = 'write' 
         AND timestamp >= now() - interval '${hoursBack} hours'
         GROUP BY cache_type`,
        [tenantId]
      );

      const totalSizeMB: Record<string, number> = {};
      for (const row of sizeResult.rows) {
        totalSizeMB[row.cache_type] = parseFloat(row.total_mb) || 0;
      }

      // Get eviction rates
      const evictionResult = await c.query(
        `SELECT cache_type, COUNT(*) as evictions
         FROM cache_metrics 
         WHERE tenant_id = $1 AND operation = 'eviction'
         AND timestamp >= now() - interval '${hoursBack} hours'
         GROUP BY cache_type`,
        [tenantId]
      );

      const evictionRates: Record<string, number> = {};
      for (const row of evictionResult.rows) {
        evictionRates[row.cache_type] = parseInt(row.evictions);
      }

      return { hitRates, avgLatency, totalSizeMB, evictionRates };
    } finally {
      c.release();
    }
  }

  /**
   * Optimize caches based on performance data
   */
  private async optimizeCaches(): Promise<void> {
    for (const [cacheKey, cache] of this.caches.entries()) {
      const [tenantId, cacheType] = cacheKey.split(':');
      
      // Remove expired entries
      const now = Date.now();
      for (const [key, entry] of cache.entries()) {
        if (now - entry.timestamp > entry.ttl * 1000) {
          cache.delete(key);
          this.recordMetric({
            tenantId,
            cacheType,
            operation: 'eviction',
            keyHash: this.hashKey(key),
            latencyMs: 0
          });
        }
      }

      // Adjust cache size based on hit rate
      const hitRate = this.getHitRate(tenantId, cacheType);
      const config = this.getCacheConfig(cacheType);
      
      if (hitRate < 0.5 && cache.size > config.maxSize * 0.5) {
        // Low hit rate - reduce cache size
        await this.evictEntries(tenantId, cacheType, Math.floor(cache.size * 0.2));
      }
    }
  }

  /**
   * Evict entries based on policy
   */
  private async evictEntries(
    tenantId: string,
    cacheType: string,
    count: number
  ): Promise<void> {
    const cacheKey = `${tenantId}:${cacheType}`;
    const cache = this.caches.get(cacheKey);
    if (!cache) return;

    const config = this.getCacheConfig(cacheType);
    const entries = Array.from(cache.entries());

    let toEvict: string[] = [];

    switch (config.evictionPolicy) {
      case 'lru':
        // Least recently used
        toEvict = entries
          .sort(([, a], [, b]) => a.timestamp - b.timestamp)
          .slice(0, count)
          .map(([key]) => key);
        break;

      case 'lfu':
        // Least frequently used
        toEvict = entries
          .sort(([, a], [, b]) => a.accessCount - b.accessCount)
          .slice(0, count)
          .map(([key]) => key);
        break;

      case 'ttl':
        // Shortest TTL
        toEvict = entries
          .sort(([, a], [, b]) => a.ttl - b.ttl)
          .slice(0, count)
          .map(([key]) => key);
        break;
    }

    for (const key of toEvict) {
      cache.delete(key);
      this.recordMetric({
        tenantId,
        cacheType,
        operation: 'eviction',
        keyHash: this.hashKey(key),
        latencyMs: 0
      });
    }
  }

  private getCacheConfig(cacheType: string): CacheConfig {
    const configs: Record<string, CacheConfig> = {
      ai_response: {
        ttlSeconds: 3600, // 1 hour
        maxSize: 10000,
        evictionPolicy: 'lru',
        compressionEnabled: true
      },
      vendor_data: {
        ttlSeconds: 86400, // 24 hours
        maxSize: 5000,
        evictionPolicy: 'ttl',
        compressionEnabled: false
      },
      document_analysis: {
        ttlSeconds: 7200, // 2 hours
        maxSize: 1000,
        evictionPolicy: 'lfu',
        compressionEnabled: true
      }
    };

    return configs[cacheType] || configs.ai_response;
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  private estimateSize(value: any): number {
    return JSON.stringify(value).length;
  }

  private incrementHits(cacheKey: string): void {
    const stats = this.cacheStats.get(cacheKey) || { hits: 0, misses: 0 };
    stats.hits++;
    this.cacheStats.set(cacheKey, stats);
  }

  private incrementMisses(cacheKey: string): void {
    const stats = this.cacheStats.get(cacheKey) || { hits: 0, misses: 0 };
    stats.misses++;
    this.cacheStats.set(cacheKey, stats);
  }

  private recordMetric(metric: CacheMetric): void {
    this.metricsBuffer.push(metric);
  }

  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const metricsToFlush = [...this.metricsBuffer];
    this.metricsBuffer = [];

    const c = await pool.connect();
    try {
      for (const metric of metricsToFlush) {
        await c.query(
          `INSERT INTO cache_metrics 
           (tenant_id, cache_type, operation, key_hash, latency_ms, size_bytes, ttl_seconds)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            metric.tenantId,
            metric.cacheType,
            metric.operation,
            metric.keyHash,
            metric.latencyMs,
            metric.sizeBytes,
            metric.ttlSeconds
          ]
        );
      }
    } catch (error) {
      console.error('Failed to flush cache metrics:', error);
      this.metricsBuffer.unshift(...metricsToFlush);
    } finally {
      c.release();
    }
  }
}

export const cacheOptimizer = CacheOptimizer.getInstance();