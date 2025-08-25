/**
 * Payment Processing Consumers Initialization
 * Starts all payment processing consumers
 */

import { PaymentValidatorConsumer } from './payment-validator-consumer';
import { PaymentClassifierConsumer } from './payment-classifier-consumer';
import { RulesEngineConsumer } from './rules-engine-consumer';
import { posterConsumer } from './poster-consumer';
import { PaymentValidationConsumer } from './payment-validation-consumer';
import { PaymentProcessingConsumer } from './payment-processing-consumer';
import { PaymentDistributionConsumer } from './payment-distribution-consumer';
import { PaymentReversalSaga } from './payment-reversal-saga';
import { notificationsConsumer } from './notifications-consumer';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { getOutboxPublisher } from '../services/outbox-publisher';

export async function startPaymentConsumers(): Promise<void> {
  console.log('[Consumers] Starting payment processing consumers...');

  try {
    // Initialize RabbitMQ connection
    const rabbitmq = getEnhancedRabbitMQService();
    
    // Wait for connection to be ready
    console.log('[Consumers] Waiting for RabbitMQ connection...');
    await rabbitmq.waitForConnection();
    console.log('[Consumers] RabbitMQ connected');

    // Start outbox publisher for transactional messaging
    const outboxPublisher = getOutboxPublisher();
    await outboxPublisher.start();
    console.log('[Consumers] Outbox publisher started');

    // Start validator consumer (Step 13)
    const validatorConsumer = new PaymentValidatorConsumer();
    await validatorConsumer.start();
    console.log('[Consumers] Validator consumer started');

    // Start classifier consumer (Step 14)
    const classifierConsumer = new PaymentClassifierConsumer();
    await classifierConsumer.start();
    console.log('[Consumers] Classifier consumer started');

    // Start rules engine consumer (Step 15)
    const rulesEngineConsumer = new RulesEngineConsumer();
    await rulesEngineConsumer.start();
    console.log('[Consumers] Rules engine consumer started');

    // DISABLED: Poster consumer requires q.post queue which conflicts with CloudAMQP settings
    // await posterConsumer.start();
    // console.log('[Consumers] Poster consumer started');

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

    // DISABLED: Notifications consumer needs refactoring for enhanced RabbitMQ service
    // await notificationsConsumer.start();
    // console.log('[Consumers] Notifications consumer started');

    console.log('[Consumers] All payment processing consumers started successfully');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('[Consumers] Shutting down payment consumers...');
      await rabbitmq.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('[Consumers] Shutting down payment consumers...');
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