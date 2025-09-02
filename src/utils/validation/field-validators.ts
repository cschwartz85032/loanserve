/**
 * Field Validators - Business rule validation for loan data
 * Implements "Do-Not-Ping" principle with deterministic validation
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import dayjs from 'dayjs';

export interface ValidationRule {
  name: string;
  field: string;
  type: 'required' | 'format' | 'range' | 'business_rule' | 'cross_field';
  severity: 'error' | 'warning' | 'info';
  rule: any;
  message: string;
  autoCorrect?: boolean;
  programSpecific?: string[]; // e.g., ['FNMA', 'FHLMC']
}

export interface ValidationResult {
  field: string;
  isValid: boolean;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  originalValue: any;
  suggestedValue?: any;
  canAutoCorrect: boolean;
}

export class FieldValidators {
  private ajv: Ajv;
  private rules: ValidationRule[];

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
    this.rules = this.initializeValidationRules();
  }

  /**
   * Validate all fields in loan data
   */
  validateLoanData(data: Record<string, any>, program = 'FNMA'): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Filter rules by program
    const applicableRules = this.rules.filter(rule => 
      !rule.programSpecific || rule.programSpecific.includes(program)
    );

    for (const rule of applicableRules) {
      const fieldValue = data[rule.field];
      const result = this.validateField(rule, fieldValue, data);
      results.push(result);
    }

    return results;
  }

  /**
   * Validate individual field
   */
  validateField(rule: ValidationRule, value: any, allData: Record<string, any>): ValidationResult {
    const result: ValidationResult = {
      field: rule.field,
      isValid: true,
      severity: rule.severity,
      rule: rule.name,
      message: rule.message,
      originalValue: value,
      canAutoCorrect: rule.autoCorrect || false
    };

    switch (rule.type) {
      case 'required':
        result.isValid = this.validateRequired(value);
        break;

      case 'format':
        result.isValid = this.validateFormat(value, rule.rule);
        break;

      case 'range':
        result.isValid = this.validateRange(value, rule.rule);
        break;

      case 'business_rule':
        result.isValid = this.validateBusinessRule(value, rule.rule, allData);
        if (!result.isValid && rule.autoCorrect) {
          result.suggestedValue = this.suggestCorrection(rule, value, allData);
        }
        break;

      case 'cross_field':
        result.isValid = this.validateCrossField(value, rule.rule, allData);
        break;
    }

    return result;
  }

  /**
   * Initialize comprehensive validation rules
   */
  private initializeValidationRules(): ValidationRule[] {
    return [
      // Loan Amount Validations
      {
        name: 'loan_amount_required',
        field: 'loan_amount',
        type: 'required',
        severity: 'error',
        rule: true,
        message: 'Loan amount is required'
      },
      {
        name: 'loan_amount_positive',
        field: 'loan_amount',
        type: 'range',
        severity: 'error',
        rule: { min: 0.01, max: 50000000 },
        message: 'Loan amount must be between $0.01 and $50,000,000'
      },
      {
        name: 'loan_amount_fnma_limit',
        field: 'loan_amount',
        type: 'business_rule',
        severity: 'warning',
        rule: { type: 'conforming_limit', year: 2025, limit: 766550 },
        message: 'Loan amount exceeds FNMA conforming limit',
        programSpecific: ['FNMA']
      },

      // Interest Rate Validations
      {
        name: 'interest_rate_required',
        field: 'interest_rate',
        type: 'required',
        severity: 'error',
        rule: true,
        message: 'Interest rate is required'
      },
      {
        name: 'interest_rate_range',
        field: 'interest_rate',
        type: 'range',
        severity: 'error',
        rule: { min: 0.1, max: 50 },
        message: 'Interest rate must be between 0.1% and 50%'
      },
      {
        name: 'interest_rate_realistic',
        field: 'interest_rate',
        type: 'business_rule',
        severity: 'warning',
        rule: { type: 'market_range', min: 2, max: 15 },
        message: 'Interest rate outside typical market range (2%-15%)'
      },

      // Borrower Name Validations
      {
        name: 'borrower_name_required',
        field: 'borrower_name',
        type: 'required',
        severity: 'error',
        rule: true,
        message: 'Borrower name is required'
      },
      {
        name: 'borrower_name_format',
        field: 'borrower_name',
        type: 'format',
        severity: 'error',
        rule: '^[A-Za-z\\s\\.\\-\\,]{2,100}$',
        message: 'Borrower name must be 2-100 characters, letters and common punctuation only'
      },
      {
        name: 'borrower_name_normalization',
        field: 'borrower_name',
        type: 'business_rule',
        severity: 'info',
        rule: { type: 'name_case' },
        message: 'Borrower name should use proper case',
        autoCorrect: true
      },

      // Property Address Validations
      {
        name: 'property_address_required',
        field: 'property_address',
        type: 'required',
        severity: 'error',
        rule: true,
        message: 'Property address is required'
      },
      {
        name: 'property_address_format',
        field: 'property_address',
        type: 'format',
        severity: 'warning',
        rule: '^\\d+\\s+[A-Za-z0-9\\s\\.\\-\\#]+',
        message: 'Property address should start with street number'
      },

      // Loan Term Validations
      {
        name: 'loan_term_required',
        field: 'loan_term',
        type: 'required',
        severity: 'error',
        rule: true,
        message: 'Loan term is required'
      },
      {
        name: 'loan_term_range',
        field: 'loan_term',
        type: 'range',
        severity: 'error',
        rule: { min: 1, max: 720 }, // 1 month to 60 years
        message: 'Loan term must be between 1 and 720 months'
      },
      {
        name: 'loan_term_standard',
        field: 'loan_term',
        type: 'business_rule',
        severity: 'info',
        rule: { type: 'standard_terms', values: [120, 180, 240, 300, 360] },
        message: 'Consider using standard loan terms: 10, 15, 20, 25, or 30 years'
      },

      // Date Validations
      {
        name: 'origination_date_format',
        field: 'origination_date',
        type: 'format',
        severity: 'error',
        rule: 'date',
        message: 'Origination date must be a valid date'
      },
      {
        name: 'maturity_date_future',
        field: 'maturity_date',
        type: 'business_rule',
        severity: 'error',
        rule: { type: 'future_date' },
        message: 'Maturity date must be in the future'
      },

      // Cross-field Validations
      {
        name: 'maturity_after_origination',
        field: 'maturity_date',
        type: 'cross_field',
        severity: 'error',
        rule: { compareField: 'origination_date', operator: 'after' },
        message: 'Maturity date must be after origination date'
      },
      {
        name: 'payment_amount_calculated',
        field: 'payment_amount',
        type: 'cross_field',
        severity: 'warning',
        rule: { type: 'payment_calculation_check' },
        message: 'Payment amount does not match calculated P&I'
      }
    ];
  }

  /**
   * Validate required fields
   */
  private validateRequired(value: any): boolean {
    return value !== null && value !== undefined && value !== '';
  }

  /**
   * Validate field format using regex or predefined formats
   */
  private validateFormat(value: any, format: string): boolean {
    if (value === null || value === undefined) return false;

    if (format === 'date') {
      return dayjs(value).isValid();
    }

    // Regex validation
    const regex = new RegExp(format);
    return regex.test(String(value));
  }

  /**
   * Validate numeric ranges
   */
  private validateRange(value: any, range: { min?: number; max?: number }): boolean {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return false;

    if (range.min !== undefined && numValue < range.min) return false;
    if (range.max !== undefined && numValue > range.max) return false;

    return true;
  }

  /**
   * Validate business rules
   */
  private validateBusinessRule(value: any, rule: any, allData: Record<string, any>): boolean {
    switch (rule.type) {
      case 'conforming_limit':
        return parseFloat(value) <= rule.limit;

      case 'market_range':
        const rate = parseFloat(value);
        return rate >= rule.min && rate <= rule.max;

      case 'name_case':
        // Check if name is properly capitalized
        const name = String(value);
        const properCase = name.replace(/\b\w+/g, word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        );
        return name === properCase;

      case 'standard_terms':
        return rule.values.includes(parseInt(value));

      case 'future_date':
        return dayjs(value).isAfter(dayjs());

      default:
        return true;
    }
  }

  /**
   * Validate cross-field relationships
   */
  private validateCrossField(value: any, rule: any, allData: Record<string, any>): boolean {
    switch (rule.type) {
      case 'payment_calculation_check':
        return this.validatePaymentCalculation(allData);

      default:
        if (rule.compareField && rule.operator) {
          const compareValue = allData[rule.compareField];
          return this.compareValues(value, compareValue, rule.operator);
        }
        return true;
    }
  }

  /**
   * Compare two values using operator
   */
  private compareValues(value1: any, value2: any, operator: string): boolean {
    switch (operator) {
      case 'after':
        return dayjs(value1).isAfter(dayjs(value2));
      case 'before':
        return dayjs(value1).isBefore(dayjs(value2));
      case 'equal':
        return value1 === value2;
      case 'greater':
        return parseFloat(value1) > parseFloat(value2);
      case 'less':
        return parseFloat(value1) < parseFloat(value2);
      default:
        return true;
    }
  }

  /**
   * Validate payment calculation
   */
  private validatePaymentCalculation(data: Record<string, any>): boolean {
    const loanAmount = parseFloat(data.loan_amount || 0);
    const interestRate = parseFloat(data.interest_rate || 0);
    const loanTerm = parseInt(data.loan_term || 0);
    const paymentAmount = parseFloat(data.payment_amount || 0);

    if (!loanAmount || !interestRate || !loanTerm) {
      return true; // Can't validate without required fields
    }

    // Calculate expected monthly payment (P&I only)
    const monthlyRate = interestRate / 100 / 12;
    const numPayments = loanTerm;

    if (monthlyRate === 0) {
      // Interest-free loan
      const expectedPayment = loanAmount / numPayments;
      return Math.abs(paymentAmount - expectedPayment) < 1; // $1 tolerance
    }

    const expectedPayment = loanAmount * 
      (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
      (Math.pow(1 + monthlyRate, numPayments) - 1);

    // Allow 5% tolerance for escrow and other factors
    const tolerance = expectedPayment * 0.05;
    return Math.abs(paymentAmount - expectedPayment) <= tolerance;
  }

  /**
   * Suggest correction for invalid values
   */
  private suggestCorrection(rule: ValidationRule, value: any, allData: Record<string, any>): any {
    switch (rule.rule.type) {
      case 'name_case':
        return String(value).replace(/\b\w+/g, word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        );

      default:
        return value;
    }
  }

  /**
   * Get validation statistics
   */
  getValidationStats(results: ValidationResult[]): {
    total: number;
    passed: number;
    errors: number;
    warnings: number;
    info: number;
    canAutoCorrect: number;
  } {
    return {
      total: results.length,
      passed: results.filter(r => r.isValid).length,
      errors: results.filter(r => !r.isValid && r.severity === 'error').length,
      warnings: results.filter(r => !r.isValid && r.severity === 'warning').length,
      info: results.filter(r => !r.isValid && r.severity === 'info').length,
      canAutoCorrect: results.filter(r => !r.isValid && r.canAutoCorrect).length
    };
  }
}