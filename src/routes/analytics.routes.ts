import { Router } from "express";
import { pool } from "../../server/db";
import { ReportingETL } from "../etl/reporting/loaders";
import { LakehouseExtractor } from "../etl/lakehouse/parquet-extractor";
import { Readable } from "stream";

// Import Step 23 Analytics Components
import { businessIntelligence } from "../analytics/business-intelligence";
import { etlPipeline } from "../analytics/etl-pipeline";
import { predictiveEngine } from "../analytics/predictive-engine";
import { reportingEngine } from "../analytics/reporting-engine";
import { streamingProcessor } from "../analytics/streaming-processor";

export const analyticsRouter = Router();

// ETL Management Endpoints
analyticsRouter.post('/etl/run', async (req, res) => {
  try {
    const { type = 'incremental', tenant_id } = req.body;
    const tenantId = tenant_id || '00000000-0000-0000-0000-000000000001';
    
    const etl = new ReportingETL(tenantId);
    let metrics;
    
    if (type === 'full') {
      metrics = await etl.runFullETL();
    } else {
      const since = req.body.since_iso;
      metrics = await etl.runIncrementalETL(since);
    }
    
    res.json({
      success: true,
      type,
      tenant_id: tenantId,
      metrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Analytics] ETL run failed:', error);
    res.status(500).json({
      error: 'ETL execution failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Lakehouse Export Endpoints
analyticsRouter.post('/lakehouse/export', async (req, res) => {
  try {
    const { type = 'incremental', tenant_id } = req.body;
    const tenantId = tenant_id || '00000000-0000-0000-0000-000000000001';
    
    const extractor = new LakehouseExtractor(tenantId);
    const jobs = await extractor.exportAllTables(type !== 'full');
    
    res.json({
      success: true,
      export_type: type,
      tenant_id: tenantId,
      jobs,
      summary: {
        total: jobs.length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Analytics] Lakehouse export failed:', error);
    res.status(500).json({
      error: 'Lakehouse export failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Data Export Endpoints
analyticsRouter.get('/export/csv/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { limit = 10000, offset = 0 } = req.query;
    
    const allowedTables = [
      'dim_loan', 'dim_investor', 'dim_user',
      'fact_txn', 'fact_qc', 'fact_servicing', 'fact_remit',
      'fact_export', 'fact_notify', 'fact_document'
    ];
    
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM reporting.${table}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No data found' });
      }
      
      // Set CSV headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${table}_export.csv"`);
      
      // Convert to CSV
      const headers = Object.keys(result.rows[0]);
      const csvData = [
        headers.join(','),
        ...result.rows.map(row => 
          headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return String(value);
          }).join(',')
        )
      ].join('\n');
      
      res.send(csvData);
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('[Analytics] CSV export failed:', error);
    res.status(500).json({
      error: 'CSV export failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Dashboard Query Endpoints
analyticsRouter.get('/dashboard/portfolio-summary', async (req, res) => {
  try {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          COUNT(DISTINCT loan_id) as total_loans,
          SUM(upb) as total_upb,
          SUM(escrow_balance) as total_escrow,
          COUNT(*) FILTER (WHERE delinquency_bucket != '0+') as delinquent_loans,
          AVG(upb) as avg_loan_balance
        FROM reporting.v_portfolio_summary
      `);
      
      res.json({
        success: true,
        data: result.rows[0],
        timestamp: new Date().toISOString()
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('[Analytics] Portfolio summary failed:', error);
    res.status(500).json({
      error: 'Portfolio summary failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

analyticsRouter.get('/dashboard/monthly-activity', async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM reporting.v_monthly_activity
        WHERE year >= EXTRACT(year FROM NOW() - INTERVAL '${months} months')
        ORDER BY year DESC, month DESC, transaction_type
        LIMIT 100
      `);
      
      res.json({
        success: true,
        data: result.rows,
        timestamp: new Date().toISOString()
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('[Analytics] Monthly activity failed:', error);
    res.status(500).json({
      error: 'Monthly activity failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

analyticsRouter.get('/dashboard/qc-performance', async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM reporting.v_qc_dashboard
        WHERE year >= EXTRACT(year FROM NOW() - INTERVAL '${months} months')
        ORDER BY year DESC, month DESC, severity
        LIMIT 100
      `);
      
      res.json({
        success: true,
        data: result.rows,
        timestamp: new Date().toISOString()
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('[Analytics] QC performance failed:', error);
    res.status(500).json({
      error: 'QC performance failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

analyticsRouter.get('/dashboard/remittance-summary', async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM reporting.v_remittance_summary
        WHERE year >= EXTRACT(year FROM NOW() - INTERVAL '${months} months')
        ORDER BY year DESC, month DESC, investor_name
        LIMIT 100
      `);
      
      res.json({
        success: true,
        data: result.rows,
        timestamp: new Date().toISOString()
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('[Analytics] Remittance summary failed:', error);
    res.status(500).json({
      error: 'Remittance summary failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Custom SQL Query Endpoint (Admin only)
analyticsRouter.post('/query/sql', async (req, res) => {
  try {
    const { sql, limit = 1000 } = req.body;
    
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: 'SQL query is required' });
    }
    
    // Basic SQL injection protection (whitelist approach)
    const allowedPatterns = [
      /^SELECT\s+/i,
      /FROM\s+reporting\./i
    ];
    
    const forbiddenPatterns = [
      /INSERT\s+/i,
      /UPDATE\s+/i,
      /DELETE\s+/i,
      /DROP\s+/i,
      /CREATE\s+/i,
      /ALTER\s+/i,
      /TRUNCATE\s+/i
    ];
    
    if (!allowedPatterns.every(pattern => pattern.test(sql))) {
      return res.status(400).json({ error: 'Only SELECT queries from reporting schema are allowed' });
    }
    
    if (forbiddenPatterns.some(pattern => pattern.test(sql))) {
      return res.status(400).json({ error: 'DDL/DML operations are not allowed' });
    }
    
    const client = await pool.connect();
    
    try {
      const limitedSql = sql.includes('LIMIT') ? sql : `${sql} LIMIT ${limit}`;
      const result = await client.query(limitedSql);
      
      res.json({
        success: true,
        columns: result.fields?.map(f => f.name) || [],
        data: result.rows,
        row_count: result.rowCount,
        timestamp: new Date().toISOString()
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('[Analytics] SQL query failed:', error);
    res.status(500).json({
      error: 'SQL query failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Data Quality Metrics
analyticsRouter.get('/data-quality/metrics', async (req, res) => {
  try {
    const client = await pool.connect();
    
    try {
      const metrics = await client.query(`
        SELECT 
          'dim_loan' as table_name,
          COUNT(*) as total_rows,
          COUNT(*) FILTER (WHERE loan_number IS NOT NULL) as loan_number_filled,
          COUNT(*) FILTER (WHERE borrower_name IS NOT NULL) as borrower_name_filled,
          MAX(updated_at) as last_updated
        FROM reporting.dim_loan
        
        UNION ALL
        
        SELECT 
          'fact_txn' as table_name,
          COUNT(*) as total_rows,
          COUNT(*) FILTER (WHERE amount > 0) as positive_amounts,
          COUNT(*) FILTER (WHERE d >= CURRENT_DATE - INTERVAL '30 days') as recent_txns,
          MAX(created_at) as last_updated
        FROM reporting.fact_txn
        
        UNION ALL
        
        SELECT 
          'fact_servicing' as table_name,
          COUNT(*) as total_rows,
          COUNT(*) FILTER (WHERE upb > 0) as active_loans,
          COUNT(*) FILTER (WHERE d = CURRENT_DATE) as current_snapshots,
          MAX(created_at) as last_updated
        FROM reporting.fact_servicing
      `);
      
      res.json({
        success: true,
        metrics: metrics.rows,
        timestamp: new Date().toISOString()
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('[Analytics] Data quality metrics failed:', error);
    res.status(500).json({
      error: 'Data quality metrics failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// Step 23: Advanced Analytics Lakehouse & Business Intelligence
// ============================================================================

// Business Intelligence & KPIs
analyticsRouter.get('/bi/kpis', async (req, res) => {
  try {
    const timeframe = req.query.timeframe as 'daily' | 'weekly' | 'monthly' || 'daily';
    const kpis = await businessIntelligence.calculateKPIs(timeframe);
    
    res.json({
      success: true,
      data: kpis,
      timeframe,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] KPIs calculation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate KPIs',
      message: error.message
    });
  }
});

analyticsRouter.get('/bi/insights', async (req, res) => {
  try {
    const insights = await businessIntelligence.generateBusinessInsights();
    
    res.json({
      success: true,
      data: insights,
      count: insights.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Business insights generation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate business insights',
      message: error.message
    });
  }
});

analyticsRouter.get('/bi/portfolio', async (req, res) => {
  try {
    const timeframe = req.query.timeframe as string || '30 days';
    const analytics = await businessIntelligence.getPortfolioAnalytics(timeframe);
    
    res.json({
      success: true,
      data: analytics,
      timeframe,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Portfolio analytics failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get portfolio analytics',
      message: error.message
    });
  }
});

analyticsRouter.get('/bi/operations', async (req, res) => {
  try {
    const timeframe = req.query.timeframe as string || '30 days';
    const analytics = await businessIntelligence.getOperationalAnalytics(timeframe);
    
    res.json({
      success: true,
      data: analytics,
      timeframe,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Operational analytics failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get operational analytics',
      message: error.message
    });
  }
});

// Reporting Engine
analyticsRouter.get('/reports/executive-dashboard', async (req, res) => {
  try {
    const dashboard = await reportingEngine.generateExecutiveDashboard();
    
    res.json({
      success: true,
      data: dashboard,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Executive dashboard failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate executive dashboard',
      message: error.message
    });
  }
});

analyticsRouter.post('/reports/portfolio-performance', async (req, res) => {
  try {
    const { dateRange, groupBy, includeForecasts } = req.body;
    
    if (!dateRange || !dateRange.start || !dateRange.end) {
      return res.status(400).json({
        success: false,
        error: 'Date range is required'
      });
    }

    const report = await reportingEngine.generatePortfolioReport({
      dateRange,
      groupBy,
      includeForecasts
    });
    
    res.json({
      success: true,
      data: report,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Portfolio report generation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate portfolio report',
      message: error.message
    });
  }
});

// Predictive Analytics
analyticsRouter.post('/predictions/default-risk', async (req, res) => {
  try {
    const { loanId, features } = req.body;
    
    if (!loanId) {
      return res.status(400).json({
        success: false,
        error: 'Loan ID is required'
      });
    }

    const prediction = await predictiveEngine.predictDefaultRisk(loanId, features);
    
    res.json({
      success: true,
      data: prediction,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Default risk prediction failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to predict default risk',
      message: error.message
    });
  }
});

analyticsRouter.post('/predictions/risk-assessment', async (req, res) => {
  try {
    const { loanId } = req.body;
    
    if (!loanId) {
      return res.status(400).json({
        success: false,
        error: 'Loan ID is required'
      });
    }

    const assessment = await predictiveEngine.generateRiskAssessment(loanId);
    
    res.json({
      success: true,
      data: assessment,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Risk assessment failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate risk assessment',
      message: error.message
    });
  }
});

analyticsRouter.post('/predictions/portfolio-forecast', async (req, res) => {
  try {
    const { months = 12 } = req.body;
    
    const forecast = await predictiveEngine.generatePortfolioForecast(months);
    
    res.json({
      success: true,
      data: forecast,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Portfolio forecast failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate portfolio forecast',
      message: error.message
    });
  }
});

// Real-time Streaming Analytics
analyticsRouter.get('/streaming/real-time', async (req, res) => {
  try {
    const analytics = await streamingProcessor.getRealTimeAnalytics();
    
    res.json({
      success: true,
      data: analytics,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Real-time analytics failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get real-time analytics',
      message: error.message
    });
  }
});

analyticsRouter.post('/streaming/events', async (req, res) => {
  try {
    const { eventType, eventSource, payload, metadata } = req.body;
    
    if (!eventType || !eventSource || !payload) {
      return res.status(400).json({
        success: false,
        error: 'Event type, source, and payload are required'
      });
    }

    const eventId = await streamingProcessor.ingestEvent({
      eventType,
      eventSource,
      payload,
      metadata
    });
    
    res.json({
      success: true,
      data: { eventId },
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Event ingestion failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to ingest event',
      message: error.message
    });
  }
});

// Advanced ETL Pipeline Management
analyticsRouter.post('/etl/advanced/run', async (req, res) => {
  try {
    const { jobType } = req.body;
    
    let result;
    switch (jobType) {
      case 'loan_performance':
        result = await etlPipeline.runLoanPerformanceETL();
        break;
      case 'service_operations':
        result = await etlPipeline.runServiceOperationsETL();
        break;
      case 'ai_performance':
        result = await etlPipeline.runAIPerformanceETL();
        break;
      case 'all':
        const [loan, service, ai] = await Promise.all([
          etlPipeline.runLoanPerformanceETL(),
          etlPipeline.runServiceOperationsETL(),
          etlPipeline.runAIPerformanceETL()
        ]);
        result = { loan, service, ai };
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid job type. Use: loan_performance, service_operations, ai_performance, or all'
        });
    }
    
    res.json({
      success: true,
      data: result,
      jobType,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Advanced ETL job execution failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run advanced ETL job',
      message: error.message
    });
  }
});

analyticsRouter.post('/etl/refresh-views', async (req, res) => {
  try {
    await etlPipeline.refreshMaterializedViews();
    
    res.json({
      success: true,
      message: 'Materialized views refreshed successfully',
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Analytics] Materialized views refresh failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh materialized views',
      message: error.message
    });
  }
});

// Health Check for Step 23 Analytics
analyticsRouter.get('/health/step23', async (req, res) => {
  try {
    const streamingMetrics = streamingProcessor.getStreamingMetrics();
    const etlJobs = etlPipeline.getAllJobResults();
    
    const health = {
      status: 'healthy',
      components: {
        streaming: {
          status: streamingMetrics.errorRate < 0.1 ? 'healthy' : 'degraded',
          eventsPerSecond: streamingMetrics.eventsPerSecond,
          errorRate: streamingMetrics.errorRate
        },
        etl: {
          status: etlJobs.length > 0 ? 'healthy' : 'warning',
          totalJobs: etlJobs.length
        },
        businessIntelligence: {
          status: 'healthy',
          features: ['kpis', 'insights', 'portfolio', 'operations']
        },
        predictiveAnalytics: {
          status: 'healthy',
          models: ['default_risk_v2', 'delinquency_risk_v1', 'prepayment_risk_v1']
        },
        reporting: {
          status: 'healthy',
          dashboards: reportingEngine.listDashboards().length
        }
      },
      lastChecked: new Date().toISOString()
    };

    res.json(health);
  } catch (error: any) {
    console.error('[Analytics] Step 23 health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});