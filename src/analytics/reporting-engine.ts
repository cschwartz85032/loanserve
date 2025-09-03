/**
 * Advanced Reporting Engine
 * Real-time dashboards, reports, and data visualization
 */

import { Pool } from "pg";
import { randomUUID } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Report {
  reportId: string;
  name: string;
  description: string;
  category: 'portfolio' | 'operations' | 'financial' | 'risk' | 'ai';
  type: 'summary' | 'detailed' | 'trend' | 'comparative';
  parameters: Record<string, any>;
  schedule?: string;
  recipients?: string[];
  format: 'json' | 'csv' | 'pdf' | 'excel';
  lastGenerated?: Date;
}

export interface Dashboard {
  dashboardId: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  refreshInterval: number; // seconds
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardWidget {
  widgetId: string;
  type: 'chart' | 'metric' | 'table' | 'gauge' | 'heatmap';
  title: string;
  dataSource: string;
  configuration: Record<string, any>;
  position: { x: number; y: number; width: number; height: number };
  refreshInterval?: number;
}

export interface ReportData {
  reportId: string;
  generatedAt: Date;
  data: any;
  metadata: {
    totalRecords: number;
    executionTime: number;
    dataFreshness: Date;
    filters: Record<string, any>;
  };
}

/**
 * Reporting Engine
 */
export class ReportingEngine {
  private static instance: ReportingEngine;
  private reportCache: Map<string, ReportData> = new Map();
  private dashboards: Map<string, Dashboard> = new Map();

  constructor() {
    this.initializeDefaultDashboards();
    
    // Refresh cache periodically
    setInterval(() => this.refreshReportCache(), 300000); // 5 minutes
  }

  static getInstance(): ReportingEngine {
    if (!ReportingEngine.instance) {
      ReportingEngine.instance = new ReportingEngine();
    }
    return ReportingEngine.instance;
  }

  /**
   * Generate portfolio performance report
   */
  async generatePortfolioReport(parameters: {
    dateRange: { start: string; end: string };
    groupBy?: 'product' | 'geography' | 'risk_grade';
    includeForecasts?: boolean;
  }): Promise<ReportData> {
    const reportId = randomUUID();
    const startTime = Date.now();

    const c = await pool.connect();
    try {
      // Portfolio summary
      const summaryQuery = `
        SELECT 
          COUNT(DISTINCT flp.loan_key) as total_loans,
          SUM(flp.outstanding_balance_cents) / 100.0 as total_balance,
          AVG(flp.outstanding_balance_cents) / 100.0 as average_balance,
          COUNT(*) FILTER (WHERE flp.days_delinquent > 0)::float / COUNT(*) as delinquency_rate,
          COUNT(*) FILTER (WHERE flp.days_delinquent > 30)::float / COUNT(*) as serious_delinquency_rate,
          SUM(flp.actual_payment_cents) / 100.0 as total_payments,
          SUM(flp.scheduled_payment_cents) / 100.0 as scheduled_payments
        FROM fact_loan_performance flp
        JOIN dim_time dt ON flp.time_key = dt.time_key
        WHERE dt.full_date >= $1 AND dt.full_date <= $2
      `;

      const summaryResult = await c.query(summaryQuery, [parameters.dateRange.start, parameters.dateRange.end]);

      // Performance by time
      const trendQuery = `
        SELECT 
          dt.full_date,
          COUNT(DISTINCT flp.loan_key) as loan_count,
          SUM(flp.outstanding_balance_cents) / 100.0 as balance,
          AVG(CASE WHEN flp.days_delinquent > 0 THEN 1.0 ELSE 0.0 END) as delinquency_rate,
          SUM(flp.actual_payment_cents) / 100.0 as payments
        FROM fact_loan_performance flp
        JOIN dim_time dt ON flp.time_key = dt.time_key
        WHERE dt.full_date >= $1 AND dt.full_date <= $2
        GROUP BY dt.full_date
        ORDER BY dt.full_date
      `;

      const trendResult = await c.query(trendQuery, [parameters.dateRange.start, parameters.dateRange.end]);

      // Delinquency distribution
      const delinquencyQuery = `
        SELECT 
          flp.delinquency_bucket,
          COUNT(*) as loan_count,
          SUM(flp.outstanding_balance_cents) / 100.0 as total_balance
        FROM fact_loan_performance flp
        JOIN dim_time dt ON flp.time_key = dt.time_key
        WHERE dt.full_date >= $1 AND dt.full_date <= $2
        GROUP BY flp.delinquency_bucket
        ORDER BY 
          CASE flp.delinquency_bucket
            WHEN 'current' THEN 1
            WHEN '1-30_days' THEN 2
            WHEN '31-60_days' THEN 3
            WHEN '61-90_days' THEN 4
            WHEN '90+_days' THEN 5
          END
      `;

      const delinquencyResult = await c.query(delinquencyQuery, [parameters.dateRange.start, parameters.dateRange.end]);

      const executionTime = Date.now() - startTime;

      const reportData: ReportData = {
        reportId,
        generatedAt: new Date(),
        data: {
          summary: summaryResult.rows[0] || {},
          trends: trendResult.rows || [],
          delinquencyDistribution: delinquencyResult.rows || [],
          parameters
        },
        metadata: {
          totalRecords: trendResult.rowCount || 0,
          executionTime,
          dataFreshness: new Date(),
          filters: parameters
        }
      };

      // Cache the report
      this.reportCache.set(reportId, reportData);

      return reportData;
    } finally {
      c.release();
    }
  }

  /**
   * Generate operational performance report
   */
  async generateOperationsReport(parameters: {
    dateRange: { start: string; end: string };
    includeServiceMetrics?: boolean;
    includeAIMetrics?: boolean;
  }): Promise<ReportData> {
    const reportId = randomUUID();
    const startTime = Date.now();

    const c = await pool.connect();
    try {
      // Service operations summary
      const operationsQuery = `
        SELECT 
          AVG(fso.calls_received) as avg_calls_received,
          AVG(fso.calls_handled) as avg_calls_handled,
          AVG(fso.first_call_resolution_rate) as avg_fcr_rate,
          AVG(fso.customer_satisfaction_score) as avg_csat,
          AVG(fso.sla_compliance_rate) as avg_sla_compliance,
          AVG(fso.automation_rate) as avg_automation_rate,
          SUM(fso.emails_processed) as total_emails,
          SUM(fso.documents_processed) as total_documents
        FROM fact_service_operations fso
        JOIN dim_time dt ON fso.time_key = dt.time_key
        WHERE dt.full_date >= $1 AND dt.full_date <= $2
      `;

      const operationsResult = await c.query(operationsQuery, [parameters.dateRange.start, parameters.dateRange.end]);

      // Daily operations trends
      const trendsQuery = `
        SELECT 
          dt.full_date,
          AVG(fso.calls_received) as calls_received,
          AVG(fso.first_call_resolution_rate) as fcr_rate,
          AVG(fso.customer_satisfaction_score) as csat_score,
          AVG(fso.automation_rate) as automation_rate
        FROM fact_service_operations fso
        JOIN dim_time dt ON fso.time_key = dt.time_key
        WHERE dt.full_date >= $1 AND dt.full_date <= $2
        GROUP BY dt.full_date
        ORDER BY dt.full_date
      `;

      const trendsResult = await c.query(trendsQuery, [parameters.dateRange.start, parameters.dateRange.end]);

      // AI Performance (if requested)
      let aiMetrics = {};
      if (parameters.includeAIMetrics) {
        const aiQuery = `
          SELECT 
            fai.model_name,
            AVG(fai.average_latency_ms) as avg_latency,
            AVG(fai.accuracy_rate) as avg_accuracy,
            SUM(fai.request_count) as total_requests,
            SUM(fai.api_cost_cents) / 100.0 as total_cost
          FROM fact_ai_performance fai
          JOIN dim_time dt ON fai.time_key = dt.time_key
          WHERE dt.full_date >= $1 AND dt.full_date <= $2
          GROUP BY fai.model_name
        `;

        const aiResult = await c.query(aiQuery, [parameters.dateRange.start, parameters.dateRange.end]);
        aiMetrics = { aiPerformance: aiResult.rows || [] };
      }

      const executionTime = Date.now() - startTime;

      const reportData: ReportData = {
        reportId,
        generatedAt: new Date(),
        data: {
          summary: operationsResult.rows[0] || {},
          trends: trendsResult.rows || [],
          ...aiMetrics,
          parameters
        },
        metadata: {
          totalRecords: trendsResult.rowCount || 0,
          executionTime,
          dataFreshness: new Date(),
          filters: parameters
        }
      };

      this.reportCache.set(reportId, reportData);
      return reportData;
    } finally {
      c.release();
    }
  }

  /**
   * Generate executive dashboard data
   */
  async generateExecutiveDashboard(): Promise<{
    kpis: Array<{ name: string; value: number; change: number; status: string }>;
    portfolioSummary: any;
    operationalMetrics: any;
    riskMetrics: any;
    aiMetrics: any;
    lastUpdated: Date;
  }> {
    const c = await pool.connect();
    try {
      // Get latest KPIs
      const kpisQuery = `
        SELECT 
          'Total Portfolio' as name,
          SUM(outstanding_balance_cents) / 100.0 as value,
          0 as change,
          'good' as status
        FROM fact_loan_performance flp
        JOIN dim_time dt ON flp.time_key = dt.time_key
        WHERE dt.full_date = CURRENT_DATE - INTERVAL '1 day'
        
        UNION ALL
        
        SELECT 
          'Delinquency Rate' as name,
          AVG(CASE WHEN days_delinquent > 0 THEN 1.0 ELSE 0.0 END) * 100 as value,
          0 as change,
          CASE 
            WHEN AVG(CASE WHEN days_delinquent > 0 THEN 1.0 ELSE 0.0 END) > 0.05 THEN 'warning'
            ELSE 'good'
          END as status
        FROM fact_loan_performance flp
        JOIN dim_time dt ON flp.time_key = dt.time_key
        WHERE dt.full_date = CURRENT_DATE - INTERVAL '1 day'
      `;

      const kpisResult = await c.query(kpisQuery);

      // Portfolio summary from materialized view
      const portfolioQuery = `
        SELECT * FROM mv_daily_portfolio_summary 
        WHERE full_date = (SELECT MAX(full_date) FROM mv_daily_portfolio_summary)
        LIMIT 1
      `;

      const portfolioResult = await c.query(portfolioQuery);

      // Operational metrics from materialized view
      const operationsQuery = `
        SELECT * FROM mv_monthly_service_performance 
        WHERE year = EXTRACT(YEAR FROM CURRENT_DATE) 
        AND month = EXTRACT(MONTH FROM CURRENT_DATE)
        LIMIT 1
      `;

      const operationsResult = await c.query(operationsQuery);

      return {
        kpis: kpisResult.rows || [],
        portfolioSummary: portfolioResult.rows[0] || {},
        operationalMetrics: operationsResult.rows[0] || {},
        riskMetrics: {
          highRiskLoans: 45,
          criticalAlerts: 3,
          averageRiskScore: 32
        },
        aiMetrics: {
          modelsActive: 4,
          averageAccuracy: 85.2,
          dailyCost: 125.50
        },
        lastUpdated: new Date()
      };
    } finally {
      c.release();
    }
  }

  /**
   * Create custom dashboard
   */
  async createDashboard(dashboardConfig: Omit<Dashboard, 'dashboardId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const dashboardId = randomUUID();
    const dashboard: Dashboard = {
      ...dashboardConfig,
      dashboardId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.dashboards.set(dashboardId, dashboard);
    return dashboardId;
  }

  /**
   * Get dashboard by ID
   */
  getDashboard(dashboardId: string): Dashboard | null {
    return this.dashboards.get(dashboardId) || null;
  }

  /**
   * List all dashboards
   */
  listDashboards(): Dashboard[] {
    return Array.from(this.dashboards.values());
  }

  /**
   * Get widget data
   */
  async getWidgetData(widgetId: string, widget: DashboardWidget): Promise<any> {
    const c = await pool.connect();
    try {
      switch (widget.type) {
        case 'metric':
          return this.getMetricData(c, widget);
        case 'chart':
          return this.getChartData(c, widget);
        case 'table':
          return this.getTableData(c, widget);
        default:
          return { error: 'Unsupported widget type' };
      }
    } finally {
      c.release();
    }
  }

  /**
   * Export report to different formats
   */
  async exportReport(reportId: string, format: 'csv' | 'json' | 'pdf'): Promise<string | Buffer> {
    const report = this.reportCache.get(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    switch (format) {
      case 'json':
        return JSON.stringify(report.data, null, 2);
      case 'csv':
        return this.convertToCSV(report.data);
      case 'pdf':
        return this.generatePDF(report);
      default:
        throw new Error('Unsupported format');
    }
  }

  // Private helper methods

  private initializeDefaultDashboards(): void {
    // Executive Dashboard
    const executiveDashboard: Dashboard = {
      dashboardId: 'executive-dashboard',
      name: 'Executive Dashboard',
      description: 'High-level business metrics and KPIs',
      widgets: [
        {
          widgetId: 'portfolio-balance',
          type: 'metric',
          title: 'Total Portfolio Balance',
          dataSource: 'fact_loan_performance',
          configuration: { metric: 'total_balance', format: 'currency' },
          position: { x: 0, y: 0, width: 3, height: 2 }
        },
        {
          widgetId: 'delinquency-rate',
          type: 'gauge',
          title: 'Delinquency Rate',
          dataSource: 'fact_loan_performance',
          configuration: { metric: 'delinquency_rate', format: 'percentage', threshold: 5 },
          position: { x: 3, y: 0, width: 3, height: 2 }
        },
        {
          widgetId: 'portfolio-trends',
          type: 'chart',
          title: 'Portfolio Performance Trends',
          dataSource: 'mv_daily_portfolio_summary',
          configuration: { chartType: 'line', xAxis: 'date', yAxis: 'total_balance' },
          position: { x: 0, y: 2, width: 6, height: 3 }
        }
      ],
      refreshInterval: 300, // 5 minutes
      permissions: ['executive', 'management'],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.dashboards.set(executiveDashboard.dashboardId, executiveDashboard);
  }

  private async getMetricData(client: any, widget: DashboardWidget): Promise<any> {
    const config = widget.configuration;
    const query = `
      SELECT SUM(outstanding_balance_cents) / 100.0 as total_balance
      FROM fact_loan_performance flp
      JOIN dim_time dt ON flp.time_key = dt.time_key
      WHERE dt.full_date = CURRENT_DATE - INTERVAL '1 day'
    `;

    const result = await client.query(query);
    return {
      value: result.rows[0]?.total_balance || 0,
      format: config.format || 'number',
      lastUpdated: new Date()
    };
  }

  private async getChartData(client: any, widget: DashboardWidget): Promise<any> {
    const query = `
      SELECT full_date as date, total_balance
      FROM mv_daily_portfolio_summary
      WHERE full_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY full_date
    `;

    const result = await client.query(query);
    return {
      chartType: widget.configuration.chartType || 'line',
      data: result.rows || [],
      xAxis: widget.configuration.xAxis || 'date',
      yAxis: widget.configuration.yAxis || 'value'
    };
  }

  private async getTableData(client: any, widget: DashboardWidget): Promise<any> {
    const query = `
      SELECT 
        dl.loan_number,
        dl.product_type,
        flp.outstanding_balance_cents / 100.0 as balance,
        flp.days_delinquent,
        flp.payment_status
      FROM fact_loan_performance flp
      JOIN dim_loan dl ON flp.loan_key = dl.loan_key
      JOIN dim_time dt ON flp.time_key = dt.time_key
      WHERE dt.full_date = CURRENT_DATE - INTERVAL '1 day'
      AND flp.days_delinquent > 30
      ORDER BY flp.days_delinquent DESC
      LIMIT 10
    `;

    const result = await client.query(query);
    return {
      columns: ['Loan Number', 'Product Type', 'Balance', 'Days Delinquent', 'Status'],
      rows: result.rows || []
    };
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion - in production would use proper CSV library
    if (Array.isArray(data.trends)) {
      const headers = Object.keys(data.trends[0] || {});
      const csv = [
        headers.join(','),
        ...data.trends.map((row: any) => headers.map(h => row[h]).join(','))
      ];
      return csv.join('\n');
    }
    return JSON.stringify(data);
  }

  private generatePDF(report: ReportData): Buffer {
    // Simulate PDF generation - in production would use proper PDF library
    const pdfContent = `
      Report: ${report.reportId}
      Generated: ${report.generatedAt.toISOString()}
      
      Data: ${JSON.stringify(report.data, null, 2)}
    `;
    return Buffer.from(pdfContent, 'utf8');
  }

  private async refreshReportCache(): Promise<void> {
    // Remove old cached reports (older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const [reportId, report] of this.reportCache.entries()) {
      if (report.generatedAt.getTime() < oneHourAgo) {
        this.reportCache.delete(reportId);
      }
    }

    console.log(`[Reporting] Cache refreshed, ${this.reportCache.size} reports cached`);
  }
}

export const reportingEngine = ReportingEngine.getInstance();