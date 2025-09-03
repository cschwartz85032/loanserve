/**
 * Database Performance Monitor
 * Real-time database performance monitoring for Issue #5: Database Performance (Architect Review)
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface IndexUsageStats {
  schemaname: string;
  tablename: string;
  indexname: string;
  idx_scan: number;
  idx_tup_read: number;
  idx_tup_fetch: number;
  usage_level: 'UNUSED' | 'LOW_USAGE' | 'MODERATE_USAGE' | 'HIGH_USAGE';
}

export interface TableScanStats {
  schemaname: string;
  tablename: string;
  seq_scan: number;
  seq_tup_read: number;
  idx_scan: number;
  idx_tup_fetch: number;
  seq_scan_ratio: number;
}

export interface QueryPerformanceStats {
  query: string;
  calls: number;
  total_time: number;
  mean_time: number;
  stddev_time: number;
  rows: number;
}

export interface DatabasePerformanceReport {
  timestamp: string;
  overall_status: 'optimal' | 'needs_attention' | 'critical';
  summary: {
    total_indexes: number;
    unused_indexes: number;
    high_seq_scan_tables: number;
    slow_queries: number;
  };
  index_usage: IndexUsageStats[];
  table_scans: TableScanStats[];
  slow_queries?: QueryPerformanceStats[];
  recommendations: string[];
}

/**
 * Database Performance Monitor Class
 */
export class DatabasePerformanceMonitor {
  
  /**
   * Get index usage statistics
   */
  async getIndexUsageStats(): Promise<IndexUsageStats[]> {
    const result = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch,
        CASE 
          WHEN idx_scan = 0 THEN 'UNUSED'
          WHEN idx_scan < 10 THEN 'LOW_USAGE'
          WHEN idx_scan < 100 THEN 'MODERATE_USAGE'
          ELSE 'HIGH_USAGE'
        END as usage_level
      FROM pg_stat_user_indexes 
      WHERE schemaname = 'public'
      ORDER BY idx_scan DESC
    `);

    return result as IndexUsageStats[];
  }

  /**
   * Get table scan statistics
   */
  async getTableScanStats(): Promise<TableScanStats[]> {
    const result = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        seq_scan,
        seq_tup_read,
        idx_scan,
        idx_tup_fetch,
        CASE 
          WHEN seq_scan + idx_scan = 0 THEN 0
          ELSE ROUND(100.0 * seq_scan / (seq_scan + idx_scan), 2)
        END as seq_scan_ratio
      FROM pg_stat_user_tables 
      WHERE schemaname = 'public'
      ORDER BY seq_scan_ratio DESC
    `);

    return result as TableScanStats[];
  }

  /**
   * Get slow query statistics (requires pg_stat_statements extension)
   */
  async getSlowQueryStats(): Promise<QueryPerformanceStats[]> {
    try {
      const result = await db.execute(sql`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          stddev_time,
          rows
        FROM pg_stat_statements 
        WHERE mean_time > 100  -- Queries slower than 100ms
        ORDER BY mean_time DESC 
        LIMIT 10
      `);

      return result as QueryPerformanceStats[];
    } catch (error) {
      // pg_stat_statements extension might not be available
      console.warn('pg_stat_statements extension not available for slow query analysis');
      return [];
    }
  }

  /**
   * Check database connectivity and basic performance
   */
  async checkDatabaseHealth(): Promise<{
    connected: boolean;
    responseTime: number;
    activeConnections: number;
    maxConnections: number;
    error?: string;
  }> {
    const start = Date.now();
    
    try {
      // Test basic connectivity
      await db.execute(sql`SELECT 1`);
      
      // Get connection stats
      const connectionStats = await db.execute(sql`
        SELECT 
          count(*) as active_connections,
          setting::int as max_connections
        FROM pg_stat_activity 
        CROSS JOIN pg_settings 
        WHERE pg_settings.name = 'max_connections'
      `);

      const responseTime = Date.now() - start;
      const stats = connectionStats[0] as any;

      return {
        connected: true,
        responseTime,
        activeConnections: parseInt(stats.active_connections),
        maxConnections: parseInt(stats.max_connections)
      };
    } catch (error: any) {
      return {
        connected: false,
        responseTime: Date.now() - start,
        activeConnections: 0,
        maxConnections: 0,
        error: error.message
      };
    }
  }

  /**
   * Generate comprehensive performance report
   */
  async generatePerformanceReport(): Promise<DatabasePerformanceReport> {
    const timestamp = new Date().toISOString();
    
    // Run all performance checks in parallel
    const [indexUsage, tableScans, slowQueries, dbHealth] = await Promise.all([
      this.getIndexUsageStats(),
      this.getTableScanStats(),
      this.getSlowQueryStats(),
      this.checkDatabaseHealth()
    ]);

    // Calculate summary statistics
    const unusedIndexes = indexUsage.filter(idx => idx.usage_level === 'UNUSED').length;
    const highSeqScanTables = tableScans.filter(table => table.seq_scan_ratio > 50).length;
    const slowQueryCount = slowQueries.length;

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (unusedIndexes > 0) {
      recommendations.push(`Consider removing ${unusedIndexes} unused indexes to save storage space`);
    }
    
    if (highSeqScanTables > 0) {
      recommendations.push(`${highSeqScanTables} tables have high sequential scan ratios - consider adding indexes`);
    }
    
    if (slowQueryCount > 0) {
      recommendations.push(`${slowQueryCount} queries are slower than 100ms - review and optimize`);
    }

    if (dbHealth.activeConnections > (dbHealth.maxConnections * 0.8)) {
      recommendations.push('Connection pool usage is high - monitor for connection leaks');
    }

    if (!dbHealth.connected) {
      recommendations.push('Database connectivity issues detected');
    }

    // Determine overall status
    let overall_status: 'optimal' | 'needs_attention' | 'critical' = 'optimal';
    
    if (!dbHealth.connected || slowQueryCount > 5) {
      overall_status = 'critical';
    } else if (unusedIndexes > 3 || highSeqScanTables > 2 || slowQueryCount > 0) {
      overall_status = 'needs_attention';
    }

    return {
      timestamp,
      overall_status,
      summary: {
        total_indexes: indexUsage.length,
        unused_indexes: unusedIndexes,
        high_seq_scan_tables: highSeqScanTables,
        slow_queries: slowQueryCount
      },
      index_usage: indexUsage,
      table_scans: tableScans,
      slow_queries: slowQueries.length > 0 ? slowQueries : undefined,
      recommendations
    };
  }

  /**
   * Get table sizes and disk usage
   */
  async getTableSizes(): Promise<Array<{ 
    table_name: string; 
    size_pretty: string; 
    size_bytes: number;
    row_count: number;
  }>> {
    const result = await db.execute(sql`
      SELECT 
        t.table_name,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name)::regclass)) as size_pretty,
        pg_total_relation_size(quote_ident(t.table_name)::regclass) as size_bytes,
        COALESCE(s.n_tup_ins + s.n_tup_upd + s.n_tup_del, 0) as row_count
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY pg_total_relation_size(quote_ident(t.table_name)::regclass) DESC
    `);

    return result as Array<{
      table_name: string;
      size_pretty: string;
      size_bytes: number;
      row_count: number;
    }>;
  }

  /**
   * Monitor real-time query performance
   */
  async monitorActiveQueries(): Promise<Array<{
    pid: number;
    duration: string;
    query: string;
    state: string;
  }>> {
    const result = await db.execute(sql`
      SELECT 
        pid,
        now() - query_start as duration,
        query,
        state
      FROM pg_stat_activity 
      WHERE state != 'idle' 
        AND query_start IS NOT NULL
        AND pid != pg_backend_pid()
      ORDER BY query_start
    `);

    return result as Array<{
      pid: number;
      duration: string;
      query: string;
      state: string;
    }>;
  }
}

// Singleton instance
export const dbPerformanceMonitor = new DatabasePerformanceMonitor();