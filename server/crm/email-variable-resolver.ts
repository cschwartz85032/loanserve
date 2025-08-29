/**
 * Centralized Email Variable Resolution Service
 * Pure function for resolving email variables with defaults
 */

import { db } from '../db';
import { loans, borrowers, properties, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { EmailVariableContext, ResolvedEmailVariables } from './email-types';

export class EmailVariableResolver {
  /**
   * Resolve all email variables for a given context
   * Pure function that returns defaults for any missing data
   */
  async resolveEmailVariables(context: EmailVariableContext): Promise<ResolvedEmailVariables> {
    try {
      // Get loan information with borrower and property
      const loanResult = await db
        .select({
          // Loan fields
          loanNumber: loans.loanNumber,
          loanAmount: loans.loanAmount,
          interestRate: loans.interestRate,
          monthlyPayment: loans.monthlyPayment,
          nextDueDate: loans.nextDueDate,
          currentBalance: loans.currentBalance,
          
          // Borrower fields
          borrowerFirstName: borrowers.firstName,
          borrowerLastName: borrowers.lastName,
          borrowerEmail: borrowers.email,
          borrowerPhone: borrowers.phone,
          
          // Property fields
          propertyStreetAddress: properties.streetAddress,
          propertyCity: properties.city,
          propertyState: properties.state,
          propertyZipCode: properties.zipCode
        })
        .from(loans)
        .leftJoin(borrowers, eq(loans.borrowerId, borrowers.id))
        .leftJoin(properties, eq(loans.propertyId, properties.id))
        .where(eq(loans.id, context.loan_id))
        .limit(1);

      const loanData = loanResult[0];

      // Get servicer information (system defaults)
      const servicerInfo = await this.getServicerInfo();

      // Build resolved variables with defaults
      const resolved: ResolvedEmailVariables = {
        // Borrower information
        borrower_first_name: loanData?.borrowerFirstName || '[FIRST_NAME]',
        borrower_last_name: loanData?.borrowerLastName || '[LAST_NAME]',
        borrower_full_name: loanData ? 
          `${loanData.borrowerFirstName || '[FIRST_NAME]'} ${loanData.borrowerLastName || '[LAST_NAME]'}` : 
          '[BORROWER_NAME]',
        borrower_email: loanData?.borrowerEmail || '[EMAIL]',
        borrower_phone: this.formatPhone(loanData?.borrowerPhone) || '[PHONE]',
        
        // Loan information
        loan_number: loanData?.loanNumber || '[LOAN_NUMBER]',
        loan_amount: this.formatCurrency(loanData?.loanAmount) || '[LOAN_AMOUNT]',
        interest_rate: this.formatPercentage(loanData?.interestRate) || '[RATE]',
        monthly_payment: this.formatCurrency(loanData?.monthlyPayment) || '[PAYMENT]',
        next_due_date: this.formatDate(loanData?.nextDueDate) || '[DUE_DATE]',
        current_balance: this.formatCurrency(loanData?.currentBalance) || '[BALANCE]',
        
        // Property information
        property_address: loanData?.propertyStreetAddress || '[PROPERTY_ADDRESS]',
        property_city: loanData?.propertyCity || '[CITY]',
        property_state: loanData?.propertyState || '[STATE]',
        property_zip: loanData?.propertyZipCode || '[ZIP]',
        
        // System information
        servicer_name: servicerInfo.name,
        servicer_phone: servicerInfo.phone,
        servicer_email: servicerInfo.email,
        current_date: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        
        // Merge custom variables
        ...context.custom_variables
      };

      return resolved;
    } catch (error) {
      console.error('[EmailVariableResolver] Error resolving variables:', error);
      
      // Return safe defaults on error
      return this.getSafeDefaults(context);
    }
  }

  /**
   * Get servicer information from system settings
   */
  private async getServicerInfo() {
    // In a real system, this would come from system settings
    return {
      name: process.env.SERVICER_NAME || 'LoanServe Pro',
      phone: process.env.SERVICER_PHONE || '1-800-LOAN-PRO',
      email: process.env.SERVICER_EMAIL || 'support@loanservepro.com'
    };
  }

  /**
   * Format currency values
   */
  private formatCurrency(value: any): string {
    if (!value) return '';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num);
  }

  /**
   * Format percentage values
   */
  private formatPercentage(value: any): string {
    if (!value) return '';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '';
    return `${num.toFixed(3)}%`;
  }

  /**
   * Format date values
   */
  private formatDate(value: any): string {
    if (!value) return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Format phone numbers
   */
  private formatPhone(value: any): string {
    if (!value) return '';
    const phone = value.toString().replace(/\D/g, '');
    if (phone.length === 10) {
      return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
    }
    return phone;
  }

  /**
   * Get safe default values when data loading fails
   */
  private getSafeDefaults(context: EmailVariableContext): ResolvedEmailVariables {
    return {
      borrower_first_name: '[FIRST_NAME]',
      borrower_last_name: '[LAST_NAME]',
      borrower_full_name: '[BORROWER_NAME]',
      borrower_email: '[EMAIL]',
      borrower_phone: '[PHONE]',
      loan_number: `[LOAN_${context.loan_id}]`,
      loan_amount: '[LOAN_AMOUNT]',
      interest_rate: '[RATE]',
      monthly_payment: '[PAYMENT]',
      next_due_date: '[DUE_DATE]',
      current_balance: '[BALANCE]',
      property_address: '[PROPERTY_ADDRESS]',
      property_city: '[CITY]',
      property_state: '[STATE]',
      property_zip: '[ZIP]',
      servicer_name: 'LoanServe Pro',
      servicer_phone: '1-800-LOAN-PRO',
      servicer_email: 'support@loanservepro.com',
      current_date: new Date().toLocaleDateString('en-US'),
      ...context.custom_variables
    };
  }

  /**
   * Validate template variables against allowed list
   * Rejects unknown placeholders to catch typos early
   */
  validateTemplateVariables(templateContent: string, allowedVariables: string[]): string[] {
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const foundVariables: string[] = [];
    const unknownVariables: string[] = [];
    
    let match;
    while ((match = variablePattern.exec(templateContent)) !== null) {
      const variable = match[1].trim();
      foundVariables.push(variable);
      
      if (!allowedVariables.includes(variable)) {
        unknownVariables.push(variable);
      }
    }
    
    return unknownVariables;
  }

  /**
   * Get the list of all available template variables
   */
  getAllowedVariables(): string[] {
    return [
      // Borrower variables
      'borrower_first_name',
      'borrower_last_name', 
      'borrower_full_name',
      'borrower_email',
      'borrower_phone',
      
      // Loan variables
      'loan_number',
      'loan_amount',
      'interest_rate',
      'monthly_payment',
      'next_due_date',
      'current_balance',
      
      // Property variables
      'property_address',
      'property_city',
      'property_state',
      'property_zip',
      
      // System variables
      'servicer_name',
      'servicer_phone',
      'servicer_email',
      'current_date'
    ];
  }
}