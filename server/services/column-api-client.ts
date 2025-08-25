/**
 * Column Bank API Client
 * Handles authentication and API communication with Column
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import crypto from 'crypto';

// Column API configuration
const COLUMN_API_BASE = process.env.COLUMN_API_BASE || 'https://api.column.com';
const COLUMN_API_KEY = process.env.COLUMN_API_KEY || '';
const COLUMN_API_SECRET = process.env.COLUMN_API_SECRET || '';
const COLUMN_WEBHOOK_SECRET = process.env.COLUMN_WEBHOOK_SECRET || '';

// API response types
export interface ColumnAccount {
  id: string;
  account_number: string;
  routing_number: string;
  type: 'checking' | 'savings';
  status: 'active' | 'pending' | 'closed';
  balance: {
    available: number;
    pending: number;
    ledger: number;
  };
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ColumnTransfer {
  id: string;
  type: 'ach' | 'wire' | 'book';
  direction: 'credit' | 'debit';
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'reversed';
  source_account_id?: string;
  destination_account_id?: string;
  external_account?: {
    account_number: string;
    routing_number: string;
    account_holder_name: string;
    account_type: 'checking' | 'savings';
  };
  description: string;
  reference_id?: string;
  metadata?: Record<string, any>;
  error?: {
    code: string;
    message: string;
  };
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface ColumnWebhookEvent {
  id: string;
  type: string;
  data: any;
  created_at: string;
}

export interface CreateTransferRequest {
  type: 'ach' | 'wire' | 'book';
  direction: 'credit' | 'debit';
  amount: number; // in cents
  source_account_id?: string;
  destination_account_id?: string;
  external_account?: {
    account_number: string;
    routing_number: string;
    account_holder_name: string;
    account_type?: 'checking' | 'savings';
  };
  description: string;
  reference_id?: string;
  metadata?: Record<string, any>;
}

export class ColumnAPIClient {
  private client: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  private webhookSecret: string;

  constructor() {
    this.apiKey = COLUMN_API_KEY;
    this.apiSecret = COLUMN_API_SECRET;
    this.webhookSecret = COLUMN_WEBHOOK_SECRET;

    if (!this.apiKey || !this.apiSecret) {
      console.warn('[Column] API credentials not configured');
    }

    // Create axios instance with auth
    this.client = axios.create({
      baseURL: COLUMN_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      timeout: 30000
    });

    // Add request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        // Add signature for enhanced security
        const timestamp = Date.now().toString();
        const payload = config.data ? JSON.stringify(config.data) : '';
        const signature = this.generateSignature(timestamp, payload);
        
        config.headers['X-Timestamp'] = timestamp;
        config.headers['X-Signature'] = signature;
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const { response } = error;
        
        if (response) {
          console.error(`[Column] API Error ${response.status}:`, response.data);
          
          // Handle specific error codes
          if (response.status === 401) {
            console.error('[Column] Authentication failed - check API credentials');
          } else if (response.status === 429) {
            console.error('[Column] Rate limited - implement retry logic');
          }
        } else {
          console.error('[Column] Network error:', error.message);
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Generate HMAC signature for request authentication
   */
  private generateSignature(timestamp: string, payload: string): string {
    const message = `${timestamp}.${payload}`;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    timestamp: string
  ): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');
    
    // Ensure both buffers are the same length for timing-safe comparison
    const sig1 = Buffer.from(signature || '');
    const sig2 = Buffer.from(expectedSignature);
    
    if (sig1.length !== sig2.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(sig1, sig2);
  }

  /**
   * Create a new bank account
   */
  async createAccount(params: {
    type: 'checking' | 'savings';
    holder_name: string;
    holder_type: 'individual' | 'business';
    metadata?: Record<string, any>;
  }): Promise<ColumnAccount> {
    console.log('[Column] Creating account:', params.holder_name);
    
    const response = await this.client.post('/v1/accounts', params);
    return response.data;
  }

  /**
   * Get account details
   */
  async getAccount(accountId: string): Promise<ColumnAccount> {
    const response = await this.client.get(`/v1/accounts/${accountId}`);
    return response.data;
  }

  /**
   * List all accounts
   */
  async listAccounts(params?: {
    limit?: number;
    offset?: number;
    status?: 'active' | 'pending' | 'closed';
  }): Promise<ColumnAccount[]> {
    const response = await this.client.get('/v1/accounts', { params });
    return response.data.accounts || [];
  }

  /**
   * Get account balance
   */
  async getBalance(accountId: string): Promise<{
    available: number;
    pending: number;
    ledger: number;
  }> {
    const account = await this.getAccount(accountId);
    return account.balance;
  }

  /**
   * Create a transfer (ACH, wire, or book)
   */
  async createTransfer(params: CreateTransferRequest): Promise<ColumnTransfer> {
    console.log(`[Column] Creating ${params.type} transfer:`, params.reference_id);
    
    // Validate transfer parameters
    if (params.type === 'book') {
      if (!params.source_account_id || !params.destination_account_id) {
        throw new Error('Book transfers require source and destination account IDs');
      }
    } else {
      if (params.direction === 'debit' && !params.source_account_id) {
        throw new Error('Debit transfers require source account ID');
      }
      if (params.direction === 'credit' && !params.destination_account_id && !params.external_account) {
        throw new Error('Credit transfers require destination account or external account');
      }
    }
    
    const response = await this.client.post('/v1/transfers', params);
    return response.data;
  }

  /**
   * Get transfer details
   */
  async getTransfer(transferId: string): Promise<ColumnTransfer> {
    const response = await this.client.get(`/v1/transfers/${transferId}`);
    return response.data;
  }

  /**
   * List transfers
   */
  async listTransfers(params?: {
    account_id?: string;
    status?: string;
    type?: 'ach' | 'wire' | 'book';
    direction?: 'credit' | 'debit';
    limit?: number;
    offset?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<ColumnTransfer[]> {
    const response = await this.client.get('/v1/transfers', { params });
    return response.data.transfers || [];
  }

  /**
   * Cancel a pending transfer
   */
  async cancelTransfer(transferId: string): Promise<ColumnTransfer> {
    console.log(`[Column] Cancelling transfer: ${transferId}`);
    
    const response = await this.client.post(`/v1/transfers/${transferId}/cancel`);
    return response.data;
  }

  /**
   * Get transaction history
   */
  async getTransactions(params: {
    account_id: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const response = await this.client.get('/v1/transactions', { params });
    return response.data.transactions || [];
  }

  /**
   * Create a payment link for customer payment collection
   */
  async createPaymentLink(params: {
    amount: number;
    description: string;
    reference_id: string;
    destination_account_id: string;
    expires_at?: string;
    metadata?: Record<string, any>;
  }): Promise<{
    id: string;
    url: string;
    status: string;
    expires_at: string;
  }> {
    console.log('[Column] Creating payment link:', params.reference_id);
    
    const response = await this.client.post('/v1/payment_links', params);
    return response.data;
  }

  /**
   * Validate account and routing numbers
   */
  async validateAccount(params: {
    account_number: string;
    routing_number: string;
  }): Promise<{
    valid: boolean;
    bank_name?: string;
    account_type?: string;
  }> {
    try {
      const response = await this.client.post('/v1/validate/account', params);
      return response.data;
    } catch (error) {
      console.error('[Column] Account validation failed:', error);
      return { valid: false };
    }
  }

  /**
   * Get webhook events
   */
  async getWebhookEvents(params?: {
    limit?: number;
    offset?: number;
    type?: string;
  }): Promise<ColumnWebhookEvent[]> {
    const response = await this.client.get('/v1/webhook_events', { params });
    return response.data.events || [];
  }

  /**
   * Retry a webhook event
   */
  async retryWebhookEvent(eventId: string): Promise<void> {
    await this.client.post(`/v1/webhook_events/${eventId}/retry`);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'down';
    services: Record<string, boolean>;
  }> {
    try {
      const response = await this.client.get('/v1/health');
      return response.data;
    } catch (error) {
      return {
        status: 'down',
        services: {}
      };
    }
  }
}

// Export singleton instance
export const columnClient = new ColumnAPIClient();