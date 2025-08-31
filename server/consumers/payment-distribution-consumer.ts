/**
 * Payment Distribution Consumer
 * Calculates and posts investor distributions for settled payments
 */

import { PoolClient } from 'pg';
import { ulid } from 'ulid';
import {
  PaymentEnvelope,
  PaymentData,
  DistributionData
} from '../messaging/payment-envelope';
import { IdempotencyService, createIdempotentHandler } from '../services/payment-idempotency';
import { rabbitmqClient } from '../services/rabbitmq-unified';
import { getMessageFactory } from '../messaging/message-factory';
import { db } from '../db';

interface InvestorPosition {
  investor_id: string;
  pct_bps: number; // Basis points (100 = 1%)
}

export class PaymentDistributionConsumer {
  private rabbitmq = rabbitmqClient;
  private messageFactory = getMessageFactory();

  /**
   * Calculate and post distributions
   */
  async calculateDistributions(
    envelope: PaymentEnvelope<PaymentData>,
    client: PoolClient
  ): Promise<void> {
    const { data } = envelope;
    console.log(`[Distribution] Calculating distributions for payment ${data.payment_id}`);

    try {
      // Get payment details
      const paymentResult = await client.query(
        'SELECT * FROM payment_transactions WHERE payment_id = $1',
        [data.payment_id]
      );

      if (paymentResult.rows.length === 0) {
        throw new Error(`Payment ${data.payment_id} not found`);
      }

      const payment = paymentResult.rows[0];
      const effectiveDate = new Date(payment.effective_date);

      // Get payment allocations from ledger
      const ledgerResult = await client.query(`
        SELECT account, credit_cents
        FROM payment_ledger
        WHERE payment_id = $1 
          AND credit_cents > 0
          AND account IN ('interest_income', 'principal_receivable')
      `, [data.payment_id]);

      // Calculate distributable amounts
      let interestAmount = 0;
      let principalAmount = 0;

      for (const entry of ledgerResult.rows) {
        if (entry.account === 'interest_income') {
          interestAmount = entry.credit_cents;
        } else if (entry.account === 'principal_receivable') {
          principalAmount = entry.credit_cents;
        }
      }

      const totalDistributable = interestAmount + principalAmount;

      if (totalDistributable === 0) {
        console.log(`[Distribution] No distributable amount for payment ${data.payment_id}`);
        return;
      }

      // Get effective investor positions
      const positions = await this.getEffectivePositions(
        client,
        payment.loan_id,
        effectiveDate
      );

      if (positions.length === 0) {
        console.log(`[Distribution] No investor positions found for loan ${payment.loan_id}`);
        return;
      }

      // Calculate servicing fee (example: 0.25% annually = ~25 bps monthly)
      const servicingFeeBps = 25; // Monthly servicing fee in basis points
      const servicingFeeAmount = Math.floor((interestAmount * servicingFeeBps) / 10000);
      const distributableAfterFees = totalDistributable - servicingFeeAmount;

      // Calculate distributions
      const distributions = this.calculateProRataDistributions(
        positions,
        distributableAfterFees,
        servicingFeeAmount
      );

      // Post distributions to database
      for (const dist of distributions) {
        await client.query(`
          INSERT INTO payment_distributions (
            payment_id, investor_id, amount_cents, servicing_fee_cents,
            tranche, effective_date, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          data.payment_id,
          dist.investor_id,
          dist.amount_cents,
          dist.servicing_fee_cents,
          null, // tranche - could be used for structured deals
          effectiveDate,
          'calculated'
        ]);
      }

      // Update distribution status to posted
      await client.query(
        `UPDATE payment_distributions 
         SET status = 'posted' 
         WHERE payment_id = $1`,
        [data.payment_id]
      );

      // Emit distribution event
      const distributionEnvelope = this.messageFactory.createReply(
        envelope,
        'loanserve.distribution.v1.calculated',
        {
          payment_id: data.payment_id,
          distributions,
          total_distributed: distributableAfterFees,
          servicing_fee_total: servicingFeeAmount
        } as DistributionData
      );

      await IdempotencyService.addToOutbox(
        client,
        { type: 'distribution', id: data.payment_id },
        distributionEnvelope,
        'distribution.calculated'
      );

      console.log(`[Distribution] Calculated ${distributions.length} distributions for payment ${data.payment_id}`);

    } catch (error) {
      console.error(`[Distribution] Error calculating distributions:`, error);
      throw error;
    }
  }

  /**
   * Get effective investor positions for a date
   */
  private async getEffectivePositions(
    client: PoolClient,
    loanId: string,
    effectiveDate: Date
  ): Promise<InvestorPosition[]> {
    const result = await client.query(`
      SELECT ip.investor_id, ip.pct_bps
      FROM investor_positions ip
      JOIN investor_position_versions ipv ON ip.version_id = ipv.version_id
      WHERE ipv.loan_id = $1
        AND ipv.effective_from <= $2
        AND NOT EXISTS (
          SELECT 1 FROM investor_position_versions ipv2
          WHERE ipv2.loan_id = ipv.loan_id
            AND ipv2.effective_from > ipv.effective_from
            AND ipv2.effective_from <= $2
        )
    `, [loanId, effectiveDate]);

    return result.rows;
  }

  /**
   * Calculate pro-rata distributions with largest remainder rounding
   */
  private calculateProRataDistributions(
    positions: InvestorPosition[],
    distributableAmount: number,
    servicingFeeTotal: number
  ): Array<{
    investor_id: string;
    amount_cents: number;
    servicing_fee_cents: number;
    percentage: number;
  }> {
    // Calculate initial distributions
    const distributions = positions.map(pos => {
      const exactAmount = (distributableAmount * pos.pct_bps) / 10000;
      const exactServiceFee = (servicingFeeTotal * pos.pct_bps) / 10000;
      
      return {
        investor_id: pos.investor_id,
        amount_cents: Math.floor(exactAmount),
        servicing_fee_cents: Math.floor(exactServiceFee),
        percentage: pos.pct_bps / 100, // Convert to percentage
        remainder: exactAmount - Math.floor(exactAmount),
        fee_remainder: exactServiceFee - Math.floor(exactServiceFee)
      };
    });

    // Apply largest remainder for amount
    const distributedAmount = distributions.reduce((sum, d) => sum + d.amount_cents, 0);
    let amountRemainder = distributableAmount - distributedAmount;

    // Sort by remainder (largest first)
    distributions.sort((a, b) => b.remainder - a.remainder);

    // Distribute remainder cents
    for (let i = 0; i < amountRemainder && i < distributions.length; i++) {
      distributions[i].amount_cents += 1;
    }

    // Apply largest remainder for servicing fee
    const distributedFee = distributions.reduce((sum, d) => sum + d.servicing_fee_cents, 0);
    let feeRemainder = servicingFeeTotal - distributedFee;

    // Sort by fee remainder (largest first)
    distributions.sort((a, b) => b.fee_remainder - a.fee_remainder);

    // Distribute fee remainder cents
    for (let i = 0; i < feeRemainder && i < distributions.length; i++) {
      distributions[i].servicing_fee_cents += 1;
    }

    // Return clean result without temporary fields
    return distributions.map(d => ({
      investor_id: d.investor_id,
      amount_cents: d.amount_cents,
      servicing_fee_cents: d.servicing_fee_cents,
      percentage: d.percentage
    }));
  }

  /**
   * Handle clawback for returned payments
   */
  async processClawback(
    envelope: PaymentEnvelope<{ payment_id: string; reason: string }>,
    client: PoolClient
  ): Promise<void> {
    const { payment_id, reason } = envelope.data;
    console.log(`[Distribution] Processing clawback for payment ${payment_id}`);

    // Get original distributions
    const distributions = await client.query(
      'SELECT * FROM payment_distributions WHERE payment_id = $1',
      [payment_id]
    );

    // Create negative distributions
    for (const dist of distributions.rows) {
      const clawbackId = ulid();
      
      await client.query(`
        INSERT INTO payment_distributions (
          payment_id, investor_id, amount_cents, servicing_fee_cents,
          tranche, effective_date, status, clawback_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        payment_id,
        dist.investor_id,
        -dist.amount_cents, // Negative amount
        -dist.servicing_fee_cents, // Negative fee
        dist.tranche,
        dist.effective_date,
        'clawback_pending',
        clawbackId
      ]);

      // TODO: Net against future distributions or create receivable
      // This would be implemented based on business rules
    }

    // Emit clawback event
    const clawbackEnvelope = this.messageFactory.createReply(
      envelope,
      'loanserve.distribution.v1.clawback',
      {
        payment_id,
        reason,
        clawback_count: distributions.rows.length
      }
    );

    await IdempotencyService.addToOutbox(
      client,
      { type: 'distribution', id: payment_id },
      clawbackEnvelope,
      'distribution.clawback'
    );
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    // Distribution calculation handler
    const distributionHandler = createIdempotentHandler(
      'payment-distribution',
      this.calculateDistributions.bind(this)
    );

    await this.rabbitmq.consume(
      {
        queue: 'payments.distribution',
        prefetch: 10,
        consumerTag: 'payment-distribution-consumer'
      },
      async (envelope: PaymentEnvelope<PaymentData>, msg) => {
        try {
          await distributionHandler(envelope);
          // Ack is handled automatically by enhanced service
        } catch (error) {
          console.error('[Distribution] Error processing message:', error);
          throw error; // Enhanced service will handle nack
        }
      }
    );

    // Clawback handler
    const clawbackHandler = createIdempotentHandler(
      'payment-clawback',
      this.processClawback.bind(this)
    );

    await this.rabbitmq.consume(
      {
        queue: 'investor.clawback',
        prefetch: 5,
        consumerTag: 'payment-clawback-consumer'
      },
      async (envelope: PaymentEnvelope<{ payment_id: string; reason: string }>, msg) => {
        try {
          await clawbackHandler(envelope);
          // Ack is handled automatically by enhanced service
        } catch (error) {
          console.error('[Distribution] Error processing clawback:', error);
          throw error; // Enhanced service will handle nack
        }
      }
    );

    console.log('[Distribution] Payment distribution consumer started');
  }
}