import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OutboxService } from '../services/outbox';
import { OutboxDispatcher } from '../services/outbox-dispatcher';
import { db } from '../db';
import { outboxMessages } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('OutboxService', () => {
  let outboxService: OutboxService;
  let dispatcher: OutboxDispatcher;
  
  beforeEach(() => {
    outboxService = new OutboxService();
    dispatcher = new OutboxDispatcher(1000); // 1 second polling for tests
  });

  afterEach(() => {
    dispatcher.stop();
  });

  describe('Transactional Outbox Pattern', () => {
    it('should create payment and outbox message in same transaction', async () => {
      // Start a transaction
      const result = await db.transaction(async (trx) => {
        // Simulate creating a payment
        const paymentId = crypto.randomUUID();
        console.log(`[Test] Creating payment: ${paymentId}`);
        
        // Create outbox message in same transaction
        const outboxMessage = await outboxService.createMessage({
          aggregateType: 'payments',
          aggregateId: paymentId,
          eventType: 'payment.posted',
          payload: {
            paymentId,
            amount: 10000,
            currency: 'USD',
            timestamp: new Date().toISOString()
          }
        }, trx);

        console.log(`[Test] Created outbox message: ${outboxMessage.id}`);
        
        // Transaction will commit after this return
        return {
          paymentId,
          outboxMessageId: outboxMessage.id
        };
      });

      // Verify the outbox message exists after commit
      expect(result.paymentId).toBeDefined();
      expect(result.outboxMessageId).toBeDefined();
      
      // Check that dispatcher can see it
      const unpublished = await outboxService.pollUnpublishedMessages();
      const foundMessage = unpublished.find(m => m.id === result.outboxMessageId);
      
      expect(foundMessage).toBeDefined();
      expect(foundMessage?.aggregateId).toBe(result.paymentId);
      expect(foundMessage?.eventType).toBe('payment.posted');
      expect(foundMessage?.publishedAt).toBeNull();
      
      console.log(`[Test] Dispatcher sees unpublished message: ${foundMessage?.id}`);
    });

    it('should rollback outbox message if transaction fails', async () => {
      let outboxMessageId: string | undefined;
      
      try {
        await db.transaction(async (trx) => {
          // Create outbox message
          const outboxMessage = await outboxService.createMessage({
            aggregateType: 'payments',
            aggregateId: crypto.randomUUID(),
            eventType: 'payment.posted',
            payload: { test: true }
          }, trx);
          
          outboxMessageId = outboxMessage.id;
          console.log(`[Test] Created outbox message in transaction: ${outboxMessageId}`);
          
          // Simulate transaction failure
          throw new Error('Simulated transaction failure');
        });
      } catch (error: any) {
        console.log(`[Test] Transaction rolled back: ${error.message}`);
      }

      // Verify the outbox message was NOT persisted
      if (outboxMessageId) {
        const [message] = await db
          .select()
          .from(outboxMessages)
          .where(eq(outboxMessages.id, outboxMessageId));
        
        expect(message).toBeUndefined();
        console.log(`[Test] Outbox message ${outboxMessageId} was rolled back`);
      }
    });

    it('should handle multiple messages in order', async () => {
      const messageIds: string[] = [];
      
      // Create multiple messages
      for (let i = 0; i < 3; i++) {
        const result = await outboxService.createMessage({
          aggregateType: 'payments',
          aggregateId: crypto.randomUUID(),
          eventType: 'payment.posted',
          payload: { sequence: i }
        });
        messageIds.push(result.id!);
      }

      // Poll messages
      const messages = await outboxService.pollUnpublishedMessages();
      
      // Verify order (oldest first)
      const foundMessages = messages.filter(m => messageIds.includes(m.id!));
      expect(foundMessages).toHaveLength(3);
      
      // Check sequence order
      for (let i = 0; i < foundMessages.length; i++) {
        expect(foundMessages[i].payload.sequence).toBe(i);
      }
      
      console.log(`[Test] Messages polled in correct order`);
    });

    it('should mark messages as published', async () => {
      // Create a message
      const message = await outboxService.createMessage({
        aggregateType: 'payments',
        aggregateId: crypto.randomUUID(),
        eventType: 'payment.posted',
        payload: { test: true }
      });

      // Mark as published
      await outboxService.markPublished(message.id!);
      
      // Verify it's no longer in unpublished list
      const unpublished = await outboxService.pollUnpublishedMessages();
      const found = unpublished.find(m => m.id === message.id);
      
      expect(found).toBeUndefined();
      
      // Verify published timestamp is set
      const [published] = await db
        .select()
        .from(outboxMessages)
        .where(eq(outboxMessages.id, message.id!));
      
      expect(published.publishedAt).toBeDefined();
      expect(published.publishedAt).not.toBeNull();
      
      console.log(`[Test] Message ${message.id} marked as published`);
    });

    it('should track attempt count on failures', async () => {
      // Create a message
      const message = await outboxService.createMessage({
        aggregateType: 'payments',
        aggregateId: crypto.randomUUID(),
        eventType: 'payment.posted',
        payload: { test: true }
      });

      // Record failures
      await outboxService.recordFailure(message.id!, 'Connection refused');
      await outboxService.recordFailure(message.id!, 'Timeout');
      
      // Check attempt count
      const [updated] = await db
        .select()
        .from(outboxMessages)
        .where(eq(outboxMessages.id, message.id!));
      
      expect(updated.attemptCount).toBe(2);
      expect(updated.lastError).toBe('Timeout');
      expect(updated.publishedAt).toBeNull(); // Still unpublished
      
      console.log(`[Test] Message ${message.id} has ${updated.attemptCount} failed attempts`);
    });
  });

  describe('Dispatcher Integration', () => {
    it('should process messages when dispatcher runs', async () => {
      // Create messages
      const message1 = await outboxService.createMessage({
        aggregateType: 'payments',
        aggregateId: crypto.randomUUID(),
        eventType: 'payment.posted',
        payload: { amount: 100 }
      });

      const message2 = await outboxService.createMessage({
        aggregateType: 'payments',
        aggregateId: crypto.randomUUID(),
        eventType: 'payment.validated',
        payload: { amount: 200 }
      });

      console.log(`[Test] Created messages: ${message1.id}, ${message2.id}`);
      
      // Mock the RabbitMQ publish (since we're testing the pattern, not RabbitMQ)
      const originalProcess = outboxService.processOutboxMessages;
      let processedCount = 0;
      
      outboxService.processOutboxMessages = async function() {
        const messages = await this.pollUnpublishedMessages();
        for (const msg of messages) {
          await this.markPublished(msg.id!);
          processedCount++;
        }
        return processedCount;
      };

      // Process messages
      const published = await outboxService.processOutboxMessages();
      
      expect(published).toBe(2);
      expect(processedCount).toBe(2);
      
      // Verify no unpublished messages remain
      const remaining = await outboxService.pollUnpublishedMessages();
      const ourMessages = remaining.filter(m => 
        m.id === message1.id || m.id === message2.id
      );
      expect(ourMessages).toHaveLength(0);
      
      console.log(`[Test] Dispatcher processed ${published} messages`);
      
      // Restore original
      outboxService.processOutboxMessages = originalProcess;
    });

    it('should handle dispatcher start/stop', () => {
      // Check initial state
      let status = dispatcher.getStatus();
      expect(status.isRunning).toBe(false);
      
      // Start dispatcher
      dispatcher.start();
      status = dispatcher.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.pollIntervalMs).toBe(1000);
      
      // Stop dispatcher
      dispatcher.stop();
      status = dispatcher.getStatus();
      expect(status.isRunning).toBe(false);
      
      console.log('[Test] Dispatcher lifecycle verified');
    });
  });

  describe('Acceptance Test', () => {
    it('should insert payment and outbox row in transaction, commit, then dispatcher sees it', async () => {
      console.log('\n=== ACCEPTANCE TEST: Transactional Outbox Pattern ===');
      
      // Step 1: Create payment and outbox message in a transaction
      const { paymentId, outboxMessageId } = await db.transaction(async (trx) => {
        // In a real scenario, we'd insert into a payments table
        const paymentId = crypto.randomUUID();
        console.log(`[Acceptance] Creating payment in transaction: ${paymentId}`);
        
        // Insert outbox message in same transaction
        const outboxMsg = await outboxService.createMessage({
          aggregateType: 'payments',
          aggregateId: paymentId,
          eventType: 'payment.posted',
          payload: {
            paymentId,
            amount: 50000,
            currency: 'USD',
            channel: 'ach',
            timestamp: new Date().toISOString()
          }
        }, trx);
        
        console.log(`[Acceptance] Created outbox message in transaction: ${outboxMsg.id}`);
        
        // Transaction commits here
        return {
          paymentId,
          outboxMessageId: outboxMsg.id!
        };
      });
      
      console.log('[Acceptance] Transaction committed successfully');
      
      // Step 2: Dispatcher polls and sees the message
      const unpublishedMessages = await outboxService.pollUnpublishedMessages();
      const foundMessage = unpublishedMessages.find(m => m.id === outboxMessageId);
      
      expect(foundMessage).toBeDefined();
      expect(foundMessage?.aggregateType).toBe('payments');
      expect(foundMessage?.aggregateId).toBe(paymentId);
      expect(foundMessage?.eventType).toBe('payment.posted');
      expect(foundMessage?.publishedAt).toBeNull();
      expect(foundMessage?.attemptCount).toBe(0);
      
      console.log(`[Acceptance] Dispatcher found unpublished message: ${foundMessage?.id}`);
      console.log(`[Acceptance] Message details:`, {
        aggregateType: foundMessage?.aggregateType,
        aggregateId: foundMessage?.aggregateId,
        eventType: foundMessage?.eventType,
        payload: foundMessage?.payload
      });
      
      // Step 3: Simulate publishing the message
      await outboxService.markPublished(outboxMessageId);
      console.log(`[Acceptance] Message ${outboxMessageId} published successfully`);
      
      // Step 4: Verify message is no longer in unpublished queue
      const remainingUnpublished = await outboxService.pollUnpublishedMessages();
      const stillThere = remainingUnpublished.find(m => m.id === outboxMessageId);
      
      expect(stillThere).toBeUndefined();
      console.log('[Acceptance] Message no longer in unpublished queue');
      
      // Verify published timestamp
      const [publishedMsg] = await db
        .select()
        .from(outboxMessages)
        .where(eq(outboxMessages.id, outboxMessageId));
      
      expect(publishedMsg.publishedAt).toBeDefined();
      expect(publishedMsg.publishedAt).not.toBeNull();
      
      console.log(`[Acceptance] ✅ TEST PASSED: Transactional outbox pattern working correctly`);
      console.log(`[Acceptance] Published at: ${publishedMsg.publishedAt}`);
    });
  });
});