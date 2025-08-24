/**
 * Payment Processing Consumers Initialization
 * Starts all payment processing consumers
 */

import { PaymentValidationConsumer } from './payment-validation-consumer';
import { PaymentProcessingConsumer } from './payment-processing-consumer';
import { PaymentDistributionConsumer } from './payment-distribution-consumer';
import { PaymentReversalSaga } from './payment-reversal-saga';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { OutboxProcessor } from '../services/outbox-processor';
import { ConsumerHealthMonitor } from '../services/consumer-health-monitor';

export async function startPaymentConsumers(): Promise<void> {
  console.log('[Consumers] Starting payment processing consumers...');

  try {
    // Initialize RabbitMQ connection
    const rabbitmq = getEnhancedRabbitMQService();
    
    // Wait for connection to be ready
    console.log('[Consumers] Waiting for RabbitMQ connection...');
    await rabbitmq.waitForConnection();
    console.log('[Consumers] RabbitMQ connected');

    // Initialize health monitoring
    const healthMonitor = ConsumerHealthMonitor.getInstance();
    healthMonitor.registerConsumer('payment-validation');
    healthMonitor.registerConsumer('payment-processing');
    healthMonitor.registerConsumer('payment-distribution');
    healthMonitor.registerConsumer('payment-reversal');
    healthMonitor.startMonitoring();
    console.log('[Consumers] Health monitoring started');

    // Start outbox processor
    const outboxProcessor = new OutboxProcessor();
    await outboxProcessor.start();
    console.log('[Consumers] Outbox processor started');

    // Start validation consumer
    const validationConsumer = new PaymentValidationConsumer();
    await validationConsumer.start();
    console.log('[Consumers] Validation consumer started');

    // Start processing consumer
    const processingConsumer = new PaymentProcessingConsumer();
    await processingConsumer.start();
    console.log('[Consumers] Processing consumer started');

    // Start distribution consumer
    const distributionConsumer = new PaymentDistributionConsumer();
    await distributionConsumer.start();
    console.log('[Consumers] Distribution consumer started');

    // Start reversal saga
    const reversalSaga = new PaymentReversalSaga();
    await reversalSaga.start();
    console.log('[Consumers] Reversal saga started');

    console.log('[Consumers] All payment processing consumers started successfully');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('[Consumers] Shutting down payment consumers...');
      healthMonitor.stopMonitoring();
      await rabbitmq.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('[Consumers] Shutting down payment consumers...');
      healthMonitor.stopMonitoring();
      await rabbitmq.shutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error('[Consumers] Failed to start payment consumers:', error);
    throw error;
  }
}

// Auto-start if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startPaymentConsumers().catch(error => {
    console.error('[Consumers] Fatal error:', error);
    process.exit(1);
  });
}