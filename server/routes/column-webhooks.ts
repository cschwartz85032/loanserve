/**
 * Column Bank Webhook Handler Routes
 */

import { Router } from 'express';
import { columnBankService } from '../services/column-bank-service';
import { columnClient } from '../services/column-api-client';
import crypto from 'crypto';

const router = Router();

/**
 * Column webhook endpoint
 * Receives and processes real-time notifications from Column
 */
router.post('/api/webhooks/column', async (req, res) => {
  console.log('[ColumnWebhook] Received webhook event');

  try {
    // Get raw body for signature verification
    const rawBody = JSON.stringify(req.body);
    
    // Extract signature and timestamp from headers
    const signature = req.headers['x-column-signature'] as string;
    const timestamp = req.headers['x-column-timestamp'] as string;

    if (!signature || !timestamp) {
      console.error('[ColumnWebhook] Missing signature or timestamp headers');
      return res.status(401).json({ error: 'Missing authentication headers' });
    }

    // Verify webhook is from Column
    const isValid = columnClient.verifyWebhookSignature(rawBody, signature, timestamp);
    if (!isValid) {
      console.error('[ColumnWebhook] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Check timestamp to prevent replay attacks (5 minute window)
    const webhookTime = parseInt(timestamp);
    const currentTime = Date.now();
    if (Math.abs(currentTime - webhookTime) > 300000) {
      console.error('[ColumnWebhook] Webhook timestamp too old');
      return res.status(401).json({ error: 'Timestamp expired' });
    }

    // Process the webhook event
    await columnBankService.processWebhook(rawBody, signature, timestamp);

    // Acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[ColumnWebhook] Error processing webhook:', error);
    
    // Return 200 to prevent Column from retrying on processing errors
    // Log the error for investigation
    res.status(200).json({ 
      received: true, 
      error: 'Processing error logged' 
    });
  }
});

/**
 * Create a payment link for borrower payment
 */
router.post('/api/column/payment-link', async (req, res) => {
  try {
    const { loanId, amount, description } = req.body;

    if (!loanId || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: loanId, amount' 
      });
    }

    // Get the operating account to receive payments
    const accountId = process.env.COLUMN_OPERATING_ACCOUNT_ID;
    if (!accountId) {
      return res.status(500).json({ 
        error: 'Payment account not configured' 
      });
    }

    const link = await columnClient.createPaymentLink({
      amount: amount,
      description: description || `Payment for Loan ${loanId}`,
      reference_id: `LOAN-${loanId}-${Date.now()}`,
      destination_account_id: accountId,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      metadata: {
        loan_id: loanId,
        created_at: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      paymentLink: link.url,
      linkId: link.id,
      expiresAt: link.expires_at
    });
  } catch (error: any) {
    console.error('[Column] Failed to create payment link:', error);
    res.status(500).json({ 
      error: 'Failed to create payment link',
      details: error.message 
    });
  }
});

/**
 * Get Column account balances
 */
router.get('/api/column/balances', async (req, res) => {
  try {
    const balances = await columnBankService.getAccountBalances();
    
    res.json({
      success: true,
      balances,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Column] Failed to get balances:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve account balances',
      details: error.message 
    });
  }
});

/**
 * Create a disbursement
 */
router.post('/api/column/disbursement', async (req, res) => {
  try {
    const {
      loanId,
      amount,
      type = 'ach',
      recipientAccount,
      description,
      reference
    } = req.body;

    if (!loanId || !amount || !recipientAccount) {
      return res.status(400).json({ 
        error: 'Missing required fields: loanId, amount, recipientAccount' 
      });
    }

    const result = await columnBankService.createDisbursement({
      loanId,
      amount,
      type,
      recipientAccount,
      description,
      reference
    });

    res.json({
      success: true,
      transfer: result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Column] Failed to create disbursement:', error);
    res.status(500).json({ 
      error: 'Failed to create disbursement',
      details: error.message 
    });
  }
});

/**
 * Create an escrow disbursement
 */
router.post('/api/column/escrow-disbursement', async (req, res) => {
  try {
    const {
      loanId,
      amount,
      payee,
      description,
      accountInfo
    } = req.body;

    if (!loanId || !amount || !payee || !accountInfo) {
      return res.status(400).json({ 
        error: 'Missing required fields: loanId, amount, payee, accountInfo' 
      });
    }

    const result = await columnBankService.createEscrowDisbursement({
      loanId,
      amount,
      payee,
      description,
      accountInfo
    });

    res.json({
      success: true,
      transfer: result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Column] Failed to create escrow disbursement:', error);
    res.status(500).json({ 
      error: 'Failed to create escrow disbursement',
      details: error.message 
    });
  }
});

/**
 * Reconcile transactions for a period
 */
router.post('/api/column/reconcile', async (req, res) => {
  try {
    const {
      accountId,
      startDate,
      endDate
    } = req.body;

    if (!accountId || !startDate || !endDate) {
      return res.status(400).json({ 
        error: 'Missing required fields: accountId, startDate, endDate' 
      });
    }

    const result = await columnBankService.reconcileTransactions(
      accountId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      reconciliation: result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Column] Failed to reconcile transactions:', error);
    res.status(500).json({ 
      error: 'Failed to reconcile transactions',
      details: error.message 
    });
  }
});

/**
 * Validate account and routing numbers
 */
router.post('/api/column/validate-account', async (req, res) => {
  try {
    const { accountNumber, routingNumber } = req.body;

    if (!accountNumber || !routingNumber) {
      return res.status(400).json({ 
        error: 'Missing required fields: accountNumber, routingNumber' 
      });
    }

    const result = await columnClient.validateAccount({
      account_number: accountNumber,
      routing_number: routingNumber
    });

    res.json({
      success: true,
      validation: result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Column] Failed to validate account:', error);
    res.status(500).json({ 
      error: 'Failed to validate account',
      details: error.message 
    });
  }
});

/**
 * Health check for Column integration
 */
router.get('/api/column/health', async (req, res) => {
  try {
    const health = await columnBankService.healthCheck();
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      ...health,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Column] Health check failed:', error);
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Initialize Column accounts (admin only)
 */
router.post('/api/column/initialize', async (req, res) => {
  try {
    // TODO: Add admin authentication check
    
    await columnBankService.initializeAccounts();
    
    res.json({
      success: true,
      message: 'Column accounts initialized',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Column] Failed to initialize accounts:', error);
    res.status(500).json({ 
      error: 'Failed to initialize accounts',
      details: error.message 
    });
  }
});

export default router;