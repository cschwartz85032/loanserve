import axios, { AxiosInstance, AxiosError } from 'axios';
import { z } from 'zod';

// Column Bank API Configuration
const COLUMN_API_BASE_URL = process.env.COLUMN_API_KEY?.startsWith('prod_') 
  ? 'https://api.column.com' 
  : 'https://sandbox.column.com';

// Column Bank API Response Schemas
const ColumnEntitySchema = z.object({
  id: z.string(),
  type: z.enum(['individual', 'business']),
  name: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string().default('US')
  }).optional(),
  created_at: z.string(),
  updated_at: z.string()
});

const ColumnBankAccountSchema = z.object({
  id: z.string(),
  entity_id: z.string(),
  account_number: z.string(),
  routing_number: z.string(),
  type: z.enum(['checking', 'savings', 'escrow']),
  status: z.enum(['active', 'frozen', 'closed']),
  balance: z.object({
    available: z.number(),
    pending: z.number(),
    locked: z.number(),
    holding: z.number()
  }),
  currency: z.string().default('USD'),
  created_at: z.string(),
  updated_at: z.string()
});

const ColumnTransferSchema = z.object({
  id: z.string(),
  type: z.enum(['wire', 'ach', 'book', 'rtp']),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  amount: z.number(),
  currency: z.string().default('USD'),
  from_account_id: z.string(),
  to_account_id: z.string().optional(),
  counterparty_id: z.string().optional(),
  description: z.string(),
  reference_id: z.string().optional(),
  created_at: z.string(),
  completed_at: z.string().optional(),
  failure_reason: z.string().optional()
});

const ColumnACHTransferSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'returned']),
  amount: z.number(),
  direction: z.enum(['debit', 'credit']),
  bank_account_id: z.string(),
  counterparty: z.object({
    name: z.string(),
    account_number: z.string(),
    routing_number: z.string(),
    account_type: z.enum(['checking', 'savings'])
  }),
  sec_code: z.enum(['PPD', 'CCD', 'WEB', 'TEL']).default('PPD'),
  description: z.string(),
  effective_date: z.string(),
  return_code: z.string().optional(),
  return_reason: z.string().optional(),
  created_at: z.string()
});

// Type exports
export type ColumnEntity = z.infer<typeof ColumnEntitySchema>;
export type ColumnBankAccount = z.infer<typeof ColumnBankAccountSchema>;
export type ColumnTransfer = z.infer<typeof ColumnTransferSchema>;
export type ColumnACHTransfer = z.infer<typeof ColumnACHTransferSchema>;

export class ColumnBankAPI {
  private client: AxiosInstance;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.COLUMN_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('Column API key not configured. Banking features will be disabled.');
    }

    this.client = axios.create({
      baseURL: COLUMN_API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      this.handleApiError
    );
  }

  private handleApiError(error: AxiosError): Promise<never> {
    if (error.response) {
      const statusCode = error.response.status;
      const errorData = error.response.data as any;
      
      switch (statusCode) {
        case 401:
          throw new Error('Column API authentication failed. Please check your API key.');
        case 403:
          throw new Error('Access forbidden. Your API key may not have the required permissions.');
        case 404:
          throw new Error('Resource not found in Column Bank.');
        case 422:
          throw new Error(`Validation error: ${errorData?.message || 'Invalid request data'}`);
        case 429:
          throw new Error('Rate limit exceeded. Please try again later.');
        default:
          throw new Error(`Column API error: ${errorData?.message || 'Unknown error'}`);
      }
    } else if (error.request) {
      throw new Error('Unable to reach Column Bank API. Please check your connection.');
    } else {
      throw new Error(`Column API request failed: ${error.message}`);
    }
  }

  // Entity Management
  async createEntity(data: {
    type: 'individual' | 'business';
    name: string;
    email?: string;
    phone?: string;
    address?: {
      street: string;
      city: string;
      state: string;
      zip: string;
    };
    taxId?: string;
  }): Promise<ColumnEntity> {
    const response = await this.client.post('/entities', data);
    return ColumnEntitySchema.parse(response.data);
  }

  async getEntity(entityId: string): Promise<ColumnEntity> {
    const response = await this.client.get(`/entities/${entityId}`);
    return ColumnEntitySchema.parse(response.data);
  }

  // Bank Account Management
  async createBankAccount(data: {
    entity_id: string;
    type: 'checking' | 'savings' | 'escrow';
    name?: string;
  }): Promise<ColumnBankAccount> {
    const response = await this.client.post('/bank-accounts', data);
    return ColumnBankAccountSchema.parse(response.data);
  }

  async getBankAccount(accountId: string): Promise<ColumnBankAccount> {
    const response = await this.client.get(`/bank-accounts/${accountId}`);
    return ColumnBankAccountSchema.parse(response.data);
  }

  async listBankAccounts(entityId?: string): Promise<ColumnBankAccount[]> {
    const params = entityId ? { entity_id: entityId } : {};
    const response = await this.client.get('/bank-accounts', { params });
    return z.array(ColumnBankAccountSchema).parse(response.data.data);
  }

  async getAccountBalance(accountId: string): Promise<{
    available: number;
    pending: number;
    locked: number;
    holding: number;
  }> {
    const account = await this.getBankAccount(accountId);
    return account.balance;
  }

  // Money Movement - ACH Transfers
  async createACHTransfer(data: {
    bank_account_id: string;
    amount: number;
    direction: 'debit' | 'credit';
    counterparty: {
      name: string;
      account_number: string;
      routing_number: string;
      account_type: 'checking' | 'savings';
    };
    description: string;
    sec_code?: 'PPD' | 'CCD' | 'WEB' | 'TEL';
    effective_date?: string;
  }): Promise<ColumnACHTransfer> {
    const response = await this.client.post('/transfers/ach', {
      ...data,
      sec_code: data.sec_code || 'PPD'
    });
    return ColumnACHTransferSchema.parse(response.data);
  }

  // Wire Transfers
  async createWireTransfer(data: {
    bank_account_id: string;
    amount: number;
    counterparty_id?: string;
    beneficiary?: {
      name: string;
      account_number: string;
      routing_number?: string;
      swift_code?: string;
      address: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      };
    };
    description: string;
    reference?: string;
  }): Promise<ColumnTransfer> {
    const response = await this.client.post('/transfers/wire', data);
    return ColumnTransferSchema.parse(response.data);
  }

  // Book Transfers (internal transfers between Column accounts)
  async createBookTransfer(data: {
    from_account_id: string;
    to_account_id: string;
    amount: number;
    description: string;
  }): Promise<ColumnTransfer> {
    const response = await this.client.post('/transfers/book', data);
    return ColumnTransferSchema.parse(response.data);
  }

  // Real-time Payments (FedNow/RTP)
  async createRealTimePayment(data: {
    bank_account_id: string;
    amount: number;
    counterparty: {
      name: string;
      account_number: string;
      routing_number: string;
    };
    description: string;
    payment_rail: 'fednow' | 'rtp';
  }): Promise<ColumnTransfer> {
    const response = await this.client.post('/transfers/realtime', data);
    return ColumnTransferSchema.parse(response.data);
  }

  // Transfer Status and History
  async getTransfer(transferId: string): Promise<ColumnTransfer> {
    const response = await this.client.get(`/transfers/${transferId}`);
    return ColumnTransferSchema.parse(response.data);
  }

  async listTransfers(params?: {
    bank_account_id?: string;
    status?: string;
    type?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
  }): Promise<ColumnTransfer[]> {
    const response = await this.client.get('/transfers', { params });
    return z.array(ColumnTransferSchema).parse(response.data.data);
  }

  // Account History
  async getAccountHistory(accountId: string, params?: {
    from_date?: string;
    to_date?: string;
    limit?: number;
  }): Promise<any[]> {
    const response = await this.client.get(`/bank-accounts/${accountId}/history`, { params });
    return response.data.data;
  }

  // Loan-specific helper methods for your platform
  async createEscrowAccount(loanId: number, borrowerName: string): Promise<ColumnBankAccount> {
    // First create an entity for the escrow
    const entity = await this.createEntity({
      type: 'individual',
      name: `Escrow - ${borrowerName} - Loan ${loanId}`
    });

    // Then create an escrow account
    return await this.createBankAccount({
      entity_id: entity.id,
      type: 'escrow',
      name: `Loan ${loanId} Escrow`
    });
  }

  async processMortgagePayment(data: {
    fromAccountNumber: string;
    fromRoutingNumber: string;
    toEscrowAccountId: string;
    principalAmount: number;
    interestAmount: number;
    escrowAmount: number;
    borrowerName: string;
    loanNumber: string;
  }): Promise<ColumnACHTransfer> {
    const totalAmount = data.principalAmount + data.interestAmount + data.escrowAmount;
    
    return await this.createACHTransfer({
      bank_account_id: data.toEscrowAccountId,
      amount: totalAmount,
      direction: 'credit',
      counterparty: {
        name: data.borrowerName,
        account_number: data.fromAccountNumber,
        routing_number: data.fromRoutingNumber,
        account_type: 'checking'
      },
      description: `Mortgage payment for loan ${data.loanNumber}`,
      sec_code: 'PPD'
    });
  }

  async disburseLoanFunds(data: {
    fromAccountId: string;
    toBorrowerAccount: {
      name: string;
      accountNumber: string;
      routingNumber: string;
    };
    amount: number;
    loanNumber: string;
  }): Promise<ColumnACHTransfer> {
    return await this.createACHTransfer({
      bank_account_id: data.fromAccountId,
      amount: data.amount,
      direction: 'debit',
      counterparty: {
        name: data.toBorrowerAccount.name,
        account_number: data.toBorrowerAccount.accountNumber,
        routing_number: data.toBorrowerAccount.routingNumber,
        account_type: 'checking'
      },
      description: `Loan disbursement for ${data.loanNumber}`,
      sec_code: 'PPD'
    });
  }

  // Check if API is configured and working
  async healthCheck(): Promise<{
    connected: boolean;
    environment: 'production' | 'sandbox' | 'not_configured';
    message: string;
  }> {
    if (!this.apiKey) {
      return {
        connected: false,
        environment: 'not_configured',
        message: 'Column API key not configured'
      };
    }

    try {
      // Try to list accounts to verify connection
      await this.client.get('/bank-accounts', { params: { limit: 1 } });
      return {
        connected: true,
        environment: this.apiKey.startsWith('prod_') ? 'production' : 'sandbox',
        message: 'Successfully connected to Column Bank API'
      };
    } catch (error) {
      return {
        connected: false,
        environment: this.apiKey.startsWith('prod_') ? 'production' : 'sandbox',
        message: `Connection failed: ${error.message}`
      };
    }
  }
}

// Export singleton instance
export const columnBank = new ColumnBankAPI();