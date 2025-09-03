/**
 * Predictive Analytics Engine
 * Machine learning models for risk assessment and forecasting
 */

import { Pool } from "pg";
import { randomUUID } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface PredictiveModel {
  modelId: string;
  modelName: string;
  modelType: 'classification' | 'regression' | 'time_series' | 'clustering';
  predictionTarget: string;
  features: string[];
  accuracy: number;
  lastTrainingDate: Date;
  version: string;
  status: 'active' | 'training' | 'deprecated';
}

export interface PredictionRequest {
  modelName: string;
  loanId?: string;
  borrowerId?: string;
  features: Record<string, any>;
  predictionHorizon?: number; // days
}

export interface PredictionResult {
  predictionId: string;
  modelName: string;
  predictionType: string;
  probability: number;
  confidence: number;
  riskScore: number;
  predictions: Record<string, any>;
  recommendations: string[];
  generatedAt: Date;
}

export interface RiskAssessment {
  loanId: string;
  borrowerId: string;
  overallRiskScore: number;
  riskCategory: 'low' | 'medium' | 'high' | 'critical';
  defaultProbability: number;
  delinquencyProbability: number;
  prepaymentProbability: number;
  factors: Array<{
    factor: string;
    impact: number;
    contribution: number;
  }>;
  recommendations: string[];
  nextReviewDate: Date;
}

export interface PortfolioForecast {
  forecastPeriod: string;
  portfolioBalance: number;
  expectedDelinquencies: number;
  expectedDefaults: number;
  expectedPrepayments: number;
  cashflowProjection: Array<{
    month: number;
    principalPayments: number;
    interestPayments: number;
    prepayments: number;
    defaults: number;
    netCashflow: number;
  }>;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
}

/**
 * Predictive Analytics Engine
 */
export class PredictiveEngine {
  private static instance: PredictiveEngine;
  private models: Map<string, PredictiveModel> = new Map();

  constructor() {
    this.initializeModels();
  }

  static getInstance(): PredictiveEngine {
    if (!PredictiveEngine.instance) {
      PredictiveEngine.instance = new PredictiveEngine();
    }
    return PredictiveEngine.instance;
  }

  /**
   * Predict default risk for a loan
   */
  async predictDefaultRisk(loanId: string, features?: Record<string, any>): Promise<PredictionResult> {
    const c = await pool.connect();
    try {
      // Get loan features if not provided
      let loanFeatures = features;
      if (!loanFeatures) {
        loanFeatures = await this.extractLoanFeatures(c, loanId);
      }

      // Simulate ML model prediction (in production, this would call actual ML service)
      const defaultProbability = this.calculateDefaultProbability(loanFeatures);
      const confidence = 0.75 + Math.random() * 0.2; // Simulate confidence score

      const prediction: PredictionResult = {
        predictionId: randomUUID(),
        modelName: 'default_risk_v2',
        predictionType: 'default_risk',
        probability: defaultProbability,
        confidence,
        riskScore: this.probabilityToRiskScore(defaultProbability),
        predictions: {
          default_probability: defaultProbability,
          time_to_default_days: this.estimateTimeToDefault(loanFeatures),
          severity_score: this.calculateSeverityScore(loanFeatures)
        },
        recommendations: this.generateDefaultRiskRecommendations(defaultProbability, loanFeatures),
        generatedAt: new Date()
      };

      // Store prediction in analytics table
      await this.storePrediction(c, loanId, prediction);

      return prediction;
    } finally {
      c.release();
    }
  }

  /**
   * Predict delinquency risk
   */
  async predictDelinquencyRisk(loanId: string, horizon: number = 30): Promise<PredictionResult> {
    const c = await pool.connect();
    try {
      const loanFeatures = await this.extractLoanFeatures(c, loanId);
      
      // Simulate delinquency prediction
      const delinquencyProbability = this.calculateDelinquencyProbability(loanFeatures, horizon);
      const confidence = 0.80 + Math.random() * 0.15;

      const prediction: PredictionResult = {
        predictionId: randomUUID(),
        modelName: 'delinquency_risk_v1',
        predictionType: 'delinquency_risk',
        probability: delinquencyProbability,
        confidence,
        riskScore: this.probabilityToRiskScore(delinquencyProbability),
        predictions: {
          delinquency_probability: delinquencyProbability,
          expected_delinquency_days: horizon,
          recovery_probability: 1 - delinquencyProbability * 0.7
        },
        recommendations: this.generateDelinquencyRecommendations(delinquencyProbability, loanFeatures),
        generatedAt: new Date()
      };

      await this.storePrediction(c, loanId, prediction);
      return prediction;
    } finally {
      c.release();
    }
  }

  /**
   * Predict prepayment risk
   */
  async predictPrepaymentRisk(loanId: string, horizon: number = 90): Promise<PredictionResult> {
    const c = await pool.connect();
    try {
      const loanFeatures = await this.extractLoanFeatures(c, loanId);
      
      // Simulate prepayment prediction
      const prepaymentProbability = this.calculatePrepaymentProbability(loanFeatures, horizon);
      const confidence = 0.70 + Math.random() * 0.25;

      const prediction: PredictionResult = {
        predictionId: randomUUID(),
        modelName: 'prepayment_risk_v1',
        predictionType: 'prepayment_risk',
        probability: prepaymentProbability,
        confidence,
        riskScore: this.probabilityToRiskScore(prepaymentProbability),
        predictions: {
          prepayment_probability: prepaymentProbability,
          expected_prepayment_amount: loanFeatures.current_balance * prepaymentProbability,
          market_rate_sensitivity: this.calculateRateSensitivity(loanFeatures)
        },
        recommendations: this.generatePrepaymentRecommendations(prepaymentProbability, loanFeatures),
        generatedAt: new Date()
      };

      await this.storePrediction(c, loanId, prediction);
      return prediction;
    } finally {
      c.release();
    }
  }

  /**
   * Generate comprehensive risk assessment
   */
  async generateRiskAssessment(loanId: string): Promise<RiskAssessment> {
    const [defaultPred, delinquencyPred, prepaymentPred] = await Promise.all([
      this.predictDefaultRisk(loanId),
      this.predictDelinquencyRisk(loanId),
      this.predictPrepaymentRisk(loanId)
    ]);

    // Calculate overall risk score
    const overallRiskScore = (
      defaultPred.riskScore * 0.5 +
      delinquencyPred.riskScore * 0.3 +
      prepaymentPred.riskScore * 0.2
    );

    const riskCategory = this.categorizeRisk(overallRiskScore);

    // Identify key risk factors
    const factors = [
      {
        factor: 'Payment History',
        impact: 0.35,
        contribution: defaultPred.probability * 0.35
      },
      {
        factor: 'Credit Utilization',
        impact: 0.25,
        contribution: delinquencyPred.probability * 0.25
      },
      {
        factor: 'Market Conditions',
        impact: 0.20,
        contribution: prepaymentPred.probability * 0.20
      },
      {
        factor: 'Economic Indicators',
        impact: 0.20,
        contribution: overallRiskScore * 0.20
      }
    ];

    // Generate comprehensive recommendations
    const recommendations = [
      ...defaultPred.recommendations,
      ...delinquencyPred.recommendations,
      ...prepaymentPred.recommendations
    ].filter((rec, index, arr) => arr.indexOf(rec) === index); // Remove duplicates

    return {
      loanId,
      borrowerId: 'extracted_from_loan', // Would extract from loan data
      overallRiskScore,
      riskCategory,
      defaultProbability: defaultPred.probability,
      delinquencyProbability: delinquencyPred.probability,
      prepaymentProbability: prepaymentPred.probability,
      factors,
      recommendations,
      nextReviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };
  }

  /**
   * Generate portfolio forecast
   */
  async generatePortfolioForecast(months: number = 12): Promise<PortfolioForecast> {
    const c = await pool.connect();
    try {
      // Get current portfolio metrics
      const portfolioResult = await c.query(`
        SELECT 
          COUNT(*) as loan_count,
          SUM(current_balance_cents) / 100.0 as total_balance,
          AVG(current_balance_cents) / 100.0 as avg_balance
        FROM loans 
        WHERE status = 'active'
      `);

      const portfolio = portfolioResult.rows[0];
      const currentBalance = parseFloat(portfolio.total_balance) || 1000000;

      // Simulate cashflow projections
      const cashflowProjection = [];
      let remainingBalance = currentBalance;

      for (let month = 1; month <= months; month++) {
        const monthlyDecline = 0.02; // 2% monthly decline
        const defaultRate = 0.01; // 1% monthly default rate
        const prepaymentRate = 0.05; // 5% monthly prepayment rate

        const principalPayments = remainingBalance * monthlyDecline;
        const interestPayments = remainingBalance * 0.004; // 0.4% monthly interest
        const prepayments = remainingBalance * prepaymentRate;
        const defaults = remainingBalance * defaultRate;

        const netCashflow = principalPayments + interestPayments - defaults;
        remainingBalance = remainingBalance - principalPayments - prepayments - defaults;

        cashflowProjection.push({
          month,
          principalPayments,
          interestPayments,
          prepayments,
          defaults,
          netCashflow
        });
      }

      return {
        forecastPeriod: `${months} months`,
        portfolioBalance: currentBalance,
        expectedDelinquencies: currentBalance * 0.08, // 8% expected delinquencies
        expectedDefaults: currentBalance * 0.02, // 2% expected defaults
        expectedPrepayments: currentBalance * 0.15, // 15% expected prepayments
        cashflowProjection,
        confidenceInterval: {
          lower: 0.85,
          upper: 1.15
        }
      };
    } finally {
      c.release();
    }
  }

  /**
   * Get model performance metrics
   */
  async getModelPerformance(modelName: string): Promise<{
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    auc: number;
    lastEvaluated: Date;
  }> {
    // Simulate model performance metrics
    return {
      accuracy: 0.85 + Math.random() * 0.1,
      precision: 0.80 + Math.random() * 0.15,
      recall: 0.75 + Math.random() * 0.2,
      f1Score: 0.82 + Math.random() * 0.12,
      auc: 0.88 + Math.random() * 0.1,
      lastEvaluated: new Date()
    };
  }

  // Private helper methods

  private initializeModels(): void {
    const models: PredictiveModel[] = [
      {
        modelId: 'default_risk_v2',
        modelName: 'default_risk_v2',
        modelType: 'classification',
        predictionTarget: 'default_probability',
        features: ['payment_history', 'credit_score', 'dti_ratio', 'ltv_ratio', 'employment_status'],
        accuracy: 0.87,
        lastTrainingDate: new Date(),
        version: '2.1',
        status: 'active'
      },
      {
        modelId: 'delinquency_risk_v1',
        modelName: 'delinquency_risk_v1',
        modelType: 'classification',
        predictionTarget: 'delinquency_probability',
        features: ['payment_history', 'contact_attempts', 'payment_method', 'economic_indicators'],
        accuracy: 0.82,
        lastTrainingDate: new Date(),
        version: '1.3',
        status: 'active'
      }
    ];

    for (const model of models) {
      this.models.set(model.modelName, model);
    }
  }

  private async extractLoanFeatures(client: any, loanId: string): Promise<Record<string, any>> {
    try {
      const result = await client.query(`
        SELECT 
          l.current_balance_cents / 100.0 as current_balance,
          l.original_balance_cents / 100.0 as original_balance,
          lb.current_interest_rate,
          lb.current_payment_amount_cents / 100.0 as payment_amount,
          b.credit_score,
          EXTRACT(DAYS FROM (CURRENT_DATE - l.origination_date)) as loan_age_days
        FROM loans l
        LEFT JOIN loan_balances lb ON l.id = lb.loan_id
        LEFT JOIN borrowers b ON l.borrower_id = b.id
        WHERE l.id = $1
      `, [loanId]);

      if (result.rowCount === 0) {
        // Return default features if loan not found
        return {
          current_balance: 250000,
          original_balance: 300000,
          current_interest_rate: 0.045,
          payment_amount: 1520,
          credit_score: 720,
          loan_age_days: 180
        };
      }

      return result.rows[0];
    } catch (error) {
      // Return simulated features if tables don't exist
      return {
        current_balance: 250000,
        original_balance: 300000,
        current_interest_rate: 0.045,
        payment_amount: 1520,
        credit_score: 720,
        loan_age_days: 180
      };
    }
  }

  private calculateDefaultProbability(features: Record<string, any>): number {
    // Simplified risk scoring model
    const creditScoreWeight = 0.4;
    const ltvWeight = 0.3;
    const ageWeight = 0.2;
    const paymentWeight = 0.1;

    const creditScore = features.credit_score || 700;
    const ltv = (features.current_balance / features.original_balance) || 0.8;
    const age = features.loan_age_days || 180;
    const paymentRatio = (features.payment_amount / features.current_balance * 12) || 0.06;

    // Normalize factors to risk scores (0-1)
    const creditRisk = Math.max(0, (750 - creditScore) / 250);
    const ltvRisk = Math.max(0, (ltv - 0.8) / 0.2);
    const ageRisk = Math.max(0, (365 - age) / 365);
    const paymentRisk = Math.max(0, (paymentRatio - 0.05) / 0.03);

    const riskScore = 
      creditRisk * creditScoreWeight +
      ltvRisk * ltvWeight +
      ageRisk * ageWeight +
      paymentRisk * paymentWeight;

    return Math.min(0.95, Math.max(0.01, riskScore));
  }

  private calculateDelinquencyProbability(features: Record<string, any>, horizon: number): number {
    const baseProbability = this.calculateDefaultProbability(features) * 0.7;
    const horizonAdjustment = Math.log(horizon / 30 + 1) / 10;
    return Math.min(0.9, baseProbability + horizonAdjustment);
  }

  private calculatePrepaymentProbability(features: Record<string, any>, horizon: number): number {
    const interestRate = features.current_interest_rate || 0.045;
    const marketRate = 0.04; // Simulated current market rate
    
    const rateDifference = interestRate - marketRate;
    const incentive = Math.max(0, rateDifference * 10); // Incentive to prepay
    
    const baseProbability = 0.1 + incentive;
    const horizonAdjustment = horizon / 365 * 0.2;
    
    return Math.min(0.8, baseProbability + horizonAdjustment);
  }

  private probabilityToRiskScore(probability: number): number {
    return Math.round(probability * 100);
  }

  private categorizeRisk(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore < 25) return 'low';
    if (riskScore < 50) return 'medium';
    if (riskScore < 75) return 'high';
    return 'critical';
  }

  private generateDefaultRiskRecommendations(probability: number, features: Record<string, any>): string[] {
    const recommendations = [];
    
    if (probability > 0.7) {
      recommendations.push('Consider immediate loss mitigation outreach');
      recommendations.push('Review for modification eligibility');
    } else if (probability > 0.4) {
      recommendations.push('Increase monitoring frequency');
      recommendations.push('Proactive customer contact recommended');
    } else if (probability > 0.2) {
      recommendations.push('Standard monitoring appropriate');
    }

    if (features.credit_score < 650) {
      recommendations.push('Credit counseling resources may be beneficial');
    }

    return recommendations;
  }

  private generateDelinquencyRecommendations(probability: number, features: Record<string, any>): string[] {
    const recommendations = [];
    
    if (probability > 0.6) {
      recommendations.push('Implement early intervention strategy');
      recommendations.push('Consider payment plan options');
    } else if (probability > 0.3) {
      recommendations.push('Schedule proactive customer contact');
    }

    return recommendations;
  }

  private generatePrepaymentRecommendations(probability: number, features: Record<string, any>): string[] {
    const recommendations = [];
    
    if (probability > 0.5) {
      recommendations.push('Consider retention strategies');
      recommendations.push('Review rate lock options');
    }

    return recommendations;
  }

  private estimateTimeToDefault(features: Record<string, any>): number {
    // Estimate days until potential default
    const baseTime = 180; // 6 months baseline
    const creditScore = features.credit_score || 700;
    const adjustment = (creditScore - 600) / 10; // Better credit = longer time
    
    return Math.max(30, baseTime + adjustment);
  }

  private calculateSeverityScore(features: Record<string, any>): number {
    // Calculate potential loss severity (0-100)
    const balance = features.current_balance || 250000;
    const ltv = (features.current_balance / features.original_balance) || 0.8;
    
    // Higher balance and LTV = higher severity
    const balanceFactor = Math.min(1, balance / 500000);
    const ltvFactor = ltv;
    
    return Math.round((balanceFactor * 0.6 + ltvFactor * 0.4) * 100);
  }

  private calculateRateSensitivity(features: Record<string, any>): number {
    // Calculate how sensitive the loan is to rate changes
    const currentRate = features.current_interest_rate || 0.045;
    const marketRate = 0.04;
    
    return Math.abs(currentRate - marketRate) * 100; // Basis points difference
  }

  private async storePrediction(client: any, loanId: string, prediction: PredictionResult): Promise<void> {
    try {
      // Get time key and dimension keys
      const timeKey = parseInt(new Date().toISOString().split('T')[0].replace(/-/g, ''));
      
      await client.query(
        `INSERT INTO fact_predictive_analytics 
         (time_key, model_name, prediction_type, prediction_confidence, 
          default_probability, delinquency_probability, prepayment_probability,
          recommended_action, model_accuracy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          timeKey,
          prediction.modelName,
          prediction.predictionType,
          prediction.confidence,
          prediction.predictionType === 'default_risk' ? prediction.probability : null,
          prediction.predictionType === 'delinquency_risk' ? prediction.probability : null,
          prediction.predictionType === 'prepayment_risk' ? prediction.probability : null,
          prediction.recommendations[0] || 'Monitor',
          this.models.get(prediction.modelName)?.accuracy || 0.85
        ]
      );
    } catch (error) {
      console.error('Failed to store prediction:', error);
      // Continue execution even if storage fails
    }
  }
}

export const predictiveEngine = PredictiveEngine.getInstance();