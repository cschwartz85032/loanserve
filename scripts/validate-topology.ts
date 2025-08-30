#!/usr/bin/env tsx

/**
 * RabbitMQ Topology Validation Script
 * 
 * Pre-deploy validation script that verifies the live topology via the RabbitMQ HTTP API.
 * Ensures queues exist with expected arguments to prevent 406 PRECONDITION_FAILED errors.
 * 
 * Usage:
 *   npm run validate-topology
 *   or
 *   tsx scripts/validate-topology.ts
 */

import axios from 'axios';

// Expected topology configuration
const expectedQueues = [
  // Core payment queues
  { name: 'payments.intake', args: { 'x-queue-type': 'quorum' } },
  { name: 'payments.processing', args: { 'x-queue-type': 'quorum' } },
  { name: 'payments.reversal', args: { 'x-queue-type': 'quorum' } },
  { name: 'payments.returned', args: { 'x-queue-type': 'quorum' } },
  { name: 'q.payments.processing.v2', args: { 'x-queue-type': 'quorum' } },
  
  // Investor calculation queues
  { name: 'investor.calculations', args: { 'x-queue-type': 'quorum' } },
  { name: 'investor.clawback', args: { 'x-queue-type': 'quorum' } },
  
  // Escrow subsystem queues (versioned)
  { name: 'q.forecast.v2', args: { 'x-queue-type': 'quorum', 'x-delivery-limit': 6 } },
  { name: 'q.schedule.disbursement.v2', args: { 'x-queue-type': 'quorum', 'x-delivery-limit': 6 } },
  { name: 'q.escrow.analysis.v2', args: { 'x-queue-type': 'quorum' } },
  { name: 'q.escrow.dlq.v2', args: { 'x-queue-type': 'quorum' } },
  
  // Remittance queues
  { name: 'q.remit.aggregate', args: { 'x-queue-type': 'quorum' } },
  { name: 'q.remit.export', args: { 'x-queue-type': 'quorum' } },
  { name: 'q.remit.settle', args: { 'x-queue-type': 'quorum' } },
  { name: 'q.remit.events.audit', args: { 'x-queue-type': 'quorum' } },
  
  // Document processing
  { name: 'documents.analysis.request', args: { 'x-queue-type': 'quorum' } },
  
  // Notification queues
  { name: 'notifications.email', args: {} }, // Classic queue, no quorum
  { name: 'notifications.dashboard', args: { 'x-queue-type': 'quorum' } },
  
  // Audit queue (lazy mode)
  { name: 'audit.events', args: { 'x-queue-mode': 'lazy' } },
  
  // DLQ queues
  { name: 'dlq.payments', args: {} },
  { name: 'dlq.notifications', args: {} },
  
  // Legacy queues that should NOT have x-max-priority on quorum
  { name: 'q.validate', args: {} },
  { name: 'q.classify', args: {} },
  { name: 'q.notifications', args: {} },
  { name: 'q.audit', args: {} }
];

const expectedExchanges = [
  { name: 'payments.topic', type: 'topic' },
  { name: 'payments.dlq', type: 'direct' },
  { name: 'documents.direct', type: 'direct' },
  { name: 'dlx.main', type: 'topic' },
  { name: 'audit.topic', type: 'topic' },
  { name: 'notifications.topic', type: 'topic' },
  { name: 'escrow.workflow', type: 'topic' },
  { name: 'escrow.saga', type: 'topic' },
  { name: 'escrow.events', type: 'topic' },
  { name: 'escrow.compensate', type: 'topic' },
  { name: 'escrow.dlq', type: 'direct' },
  { name: 'investor.direct', type: 'direct' },
  { name: 'remittance', type: 'topic' },
  { name: 'remit.saga', type: 'topic' },
  { name: 'remit.events', type: 'topic' },
  { name: 'remit.dlq', type: 'direct' },
  { name: 'cash.events', type: 'topic' }
];

interface QueueInfo {
  name: string;
  arguments: Record<string, any>;
  durable: boolean;
  type: string;
}

interface ExchangeInfo {
  name: string;
  type: string;
  durable: boolean;
}

async function validateTopology(): Promise<void> {
  console.log('🔍 Starting RabbitMQ topology validation...');
  
  // Get configuration from environment
  const mgmt = process.env.RABBIT_MGMT_URL || process.env.CLOUDAMQP_MGMT_URL;
  const vhost = encodeURIComponent(process.env.RABBIT_VHOST || '/');
  
  if (!mgmt) {
    throw new Error('RABBIT_MGMT_URL or CLOUDAMQP_MGMT_URL environment variable not set');
  }
  
  console.log(`📡 Connecting to RabbitMQ Management API: ${mgmt.replace(/\/\/.*@/, '//***@')}`);
  
  try {
    // Validate queues
    console.log('\\n📋 Validating queues...');
    const { data: liveQueues } = await axios.get<QueueInfo[]>(`${mgmt}/queues/${vhost}`, {
      timeout: 10000
    });
    
    console.log(`Found ${liveQueues.length} queues in RabbitMQ`);
    
    let queueErrors = 0;
    for (const expected of expectedQueues) {
      const found = liveQueues.find((q: QueueInfo) => q.name === expected.name);
      
      if (!found) {
        console.error(`❌ Queue ${expected.name} is missing`);
        queueErrors++;
        continue;
      }
      
      // Validate arguments
      for (const [key, value] of Object.entries(expected.args)) {
        const actualValue = found.arguments?.[key];
        if (actualValue !== value) {
          // Special handling for x-max-priority on quorum queues
          if (key === 'x-max-priority' && found.arguments?.['x-queue-type'] === 'quorum') {
            console.error(`❌ Queue ${expected.name} has x-max-priority on quorum queue (not supported)`);
            queueErrors++;
          } else if (actualValue === undefined && value !== undefined) {
            console.error(`❌ Queue ${expected.name} missing argument ${key} (expected: ${value})`);
            queueErrors++;
          } else if (actualValue !== value) {
            console.error(`❌ Queue ${expected.name} argument ${key} mismatch (expected: ${value}, actual: ${actualValue})`);
            queueErrors++;
          }
        }
      }
      
      // Check for prohibited x-max-priority on quorum queues
      if (found.arguments?.['x-queue-type'] === 'quorum' && found.arguments?.['x-max-priority']) {
        console.error(`❌ Queue ${expected.name} has prohibited x-max-priority on quorum queue`);
        queueErrors++;
      } else {
        console.log(`✅ Queue ${expected.name} validated`);
      }
    }
    
    // Validate exchanges
    console.log('\\n🔄 Validating exchanges...');
    const { data: liveExchanges } = await axios.get<ExchangeInfo[]>(`${mgmt}/exchanges/${vhost}`, {
      timeout: 10000
    });
    
    console.log(`Found ${liveExchanges.length} exchanges in RabbitMQ`);
    
    let exchangeErrors = 0;
    for (const expected of expectedExchanges) {
      const found = liveExchanges.find((e: ExchangeInfo) => e.name === expected.name);
      
      if (!found) {
        console.error(`❌ Exchange ${expected.name} is missing`);
        exchangeErrors++;
        continue;
      }
      
      if (found.type !== expected.type) {
        console.error(`❌ Exchange ${expected.name} type mismatch (expected: ${expected.type}, actual: ${found.type})`);
        exchangeErrors++;
        continue;
      }
      
      console.log(`✅ Exchange ${expected.name} validated`);
    }
    
    // Summary
    console.log('\\n📊 Validation Summary:');
    console.log(`   Queues: ${expectedQueues.length - queueErrors}/${expectedQueues.length} valid`);
    console.log(`   Exchanges: ${expectedExchanges.length - exchangeErrors}/${expectedExchanges.length} valid`);
    
    const totalErrors = queueErrors + exchangeErrors;
    if (totalErrors === 0) {
      console.log('\\n🎉 RabbitMQ topology validation passed!');
      process.exit(0);
    } else {
      console.error(`\\n💥 RabbitMQ topology validation failed with ${totalErrors} errors`);
      process.exit(1);
    }
    
  } catch (error: any) {
    if (error.response) {
      console.error(`❌ HTTP Error ${error.response.status}: ${error.response.data?.error || error.message}`);
      if (error.response.status === 401) {
        console.error('💡 Check your RABBIT_MGMT_URL includes valid credentials');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ Connection refused - RabbitMQ Management API not accessible');
      console.error('💡 Check RABBIT_MGMT_URL and ensure management plugin is enabled');
    } else {
      console.error(`❌ Validation failed: ${error.message}`);
    }
    process.exit(1);
  }
}

// Self-executing when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateTopology().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

export { validateTopology };