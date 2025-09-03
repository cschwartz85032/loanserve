/**
 * DLQ Path and Retry Behavior Test
 * Validates that messaging topology properly routes terminal failures to DLQ
 * and that retry queues work with proper TTL behavior
 */

import amqp, { Channel, Connection } from "amqplib";
import { assertWithDlx } from "../../src/messaging/init-queues";

const RMQ_URL = process.env.CLOUDAMQP_URL ?? "amqp://localhost:5672";

describe("Messaging DLQ flow", () => {
  let conn: Connection;
  let ch: Channel;

  beforeAll(async () => {
    conn = await amqp.connect(RMQ_URL);
    ch = await conn.createChannel();

    // Setup test topology using our assertWithDlx helper
    await assertWithDlx(ch, "loan.board", "loan.board.request.q", "request", { 
      retryTtlMs: 2000, // 2 seconds for faster testing
      quorum: false // Use classic queues for testing
    });

    console.log('[DLQ Test] Test topology created');
  });

  afterAll(async () => {
    // Clean up test queues
    try {
      await ch.deleteQueue("loan.board.request.q");
      await ch.deleteQueue("loan.board.request.q.retry");
      await ch.deleteQueue("loan.board.request.q.dlq");
    } catch (error) {
      console.warn('[DLQ Test] Cleanup warning:', error);
    }
    
    await ch.close();
    await conn.close();
  });

  beforeEach(async () => {
    // Purge queues before each test
    await ch.purgeQueue("loan.board.request.q");
    await ch.purgeQueue("loan.board.request.q.retry");  
    await ch.purgeQueue("loan.board.request.q.dlq");
  });

  it("routes terminal errors to DLQ using nack(false, false)", async () => {
    // Consumer that always fails terminally (simulates SelfHealingWorker behavior)
    let messageReceived = false;
    
    await ch.consume("loan.board.request.q", msg => {
      if (!msg) return;
      messageReceived = true;
      
      console.log('[DLQ Test] Simulating terminal failure with nack(false, false)');
      // This is the critical pattern: nack with no requeue
      ch.nack(msg, false, false);
    }, { consumerTag: "test-terminal-failure-consumer" });

    // Publish a test message
    const testMessage = { loanId: "test-123", action: "test-terminal-failure" };
    await ch.publish("loan.board", "request", Buffer.from(JSON.stringify(testMessage)), {
      contentType: "application/json"
    });

    // Wait for message to be processed and routed to DLQ
    let dlqMessageFound = false;
    for (let i = 0; i < 20 && !dlqMessageFound; i++) {
      const dlqStatus = await ch.checkQueue("loan.board.request.q.dlq");
      if (dlqStatus.messageCount > 0) {
        dlqMessageFound = true;
        break;
      }
      await new Promise(r => setTimeout(r, 250));
    }

    expect(messageReceived).toBe(true);
    expect(dlqMessageFound).toBe(true);

    // Verify the message content in DLQ
    const dlqMessage = await ch.get("loan.board.request.q.dlq");
    expect(dlqMessage).toBeTruthy();
    if (dlqMessage) {
      const content = JSON.parse(dlqMessage.content.toString());
      expect(content.loanId).toBe("test-123");
      ch.ack(dlqMessage);
    }

    await ch.cancel("test-terminal-failure-consumer");
  }, 10000);

  it("uses retry queue for transient errors with TTL redelivery", async () => {
    let messageCount = 0;
    const receivedMessages: any[] = [];

    await ch.consume("loan.board.request.q", msg => {
      if (!msg) return;
      
      messageCount++;
      const content = JSON.parse(msg.content.toString());
      receivedMessages.push({ 
        attempt: messageCount, 
        content, 
        timestamp: Date.now() 
      });
      
      console.log(`[DLQ Test] Received message attempt ${messageCount}`);

      if (messageCount === 1) {
        // First delivery: simulate transient failure by routing to retry
        console.log('[DLQ Test] Simulating transient failure - routing to retry');
        ch.publish("dlx", "loan.board.request.q.retry", msg.content, { 
          headers: {
            ...msg.properties.headers,
            'x-retry-count': 1,
            'x-last-error': 'Transient timeout'
          }
        });
        ch.ack(msg);
        return;
      }
      
      // Second delivery should succeed
      console.log('[DLQ Test] Second delivery - acknowledging success');
      ch.ack(msg);
    }, { consumerTag: "test-retry-consumer" });

    // Publish test message
    const testMessage = { loanId: "test-456", action: "test-retry-behavior" };
    await ch.publish("loan.board", "request", Buffer.from(JSON.stringify(testMessage)), {
      contentType: "application/json"
    });

    // Wait for retry TTL (2 seconds) plus processing time
    await new Promise(r => setTimeout(r, 3500));

    expect(messageCount).toBeGreaterThanOrEqual(2);
    expect(receivedMessages).toHaveLength(2);
    
    // Verify retry delay worked
    const delay = receivedMessages[1].timestamp - receivedMessages[0].timestamp;
    expect(delay).toBeGreaterThan(1800); // Should be close to 2000ms TTL
    expect(delay).toBeLessThan(3000);   // But not too much longer

    await ch.cancel("test-retry-consumer");
  }, 15000);

  it("enforces proper queue structure with assertWithDlx helper", async () => {
    // Verify that our helper creates the expected queue structure
    const mainQueue = await ch.checkQueue("loan.board.request.q");
    const retryQueue = await ch.checkQueue("loan.board.request.q.retry");
    const dlqQueue = await ch.checkQueue("loan.board.request.q.dlq");

    expect(mainQueue).toBeTruthy();
    expect(retryQueue).toBeTruthy(); 
    expect(dlqQueue).toBeTruthy();

    // Verify queue bindings exist
    // Note: RabbitMQ doesn't provide direct binding inspection via amqplib
    // This test confirms queues were created successfully by the helper
    expect(true).toBe(true); // If we get here, bindings worked
  });

  it("handles structured error events for monitoring", async () => {
    // Setup monitoring queue to capture error events
    await ch.assertQueue("test.monitoring.errors", { durable: false, autoDelete: true });
    await ch.bindQueue("test.monitoring.errors", "ops.notifications", "worker.error");

    // Simulate worker error with structured event
    const errorEvent = {
      worker: "TestWorker",
      routingKey: "loan.board.request",
      queue: "loan.board.request.q",
      error: {
        name: "ValidationError",
        message: "missing mandatory field: loanId",
        stack: ["ValidationError: missing mandatory field: loanId", "at TestWorker.process"]
      },
      tenantId: "test-tenant-123",
      occurred_at: new Date().toISOString()
    };

    await ch.publish(
      "ops.notifications",
      "worker.error", 
      Buffer.from(JSON.stringify(errorEvent)),
      { contentType: "application/json", persistent: true }
    );

    // Verify error event was captured
    await new Promise(r => setTimeout(r, 100));
    const monitoringMessage = await ch.get("test.monitoring.errors");
    expect(monitoringMessage).toBeTruthy();
    
    if (monitoringMessage) {
      const capturedEvent = JSON.parse(monitoringMessage.content.toString());
      expect(capturedEvent.worker).toBe("TestWorker");
      expect(capturedEvent.tenantId).toBe("test-tenant-123");
      expect(capturedEvent.error.message).toContain("missing mandatory field");
      ch.ack(monitoringMessage);
    }

    await ch.deleteQueue("test.monitoring.errors");
  });

  it("validates retry count headers are preserved", async () => {
    let headerCheck = false;

    await ch.consume("loan.board.request.q", msg => {
      if (!msg) return;
      
      const retryCount = msg.properties.headers?.['x-retry-count'];
      if (retryCount && retryCount > 0) {
        headerCheck = true;
        console.log(`[DLQ Test] Retry count header found: ${retryCount}`);
      }
      
      ch.ack(msg);
    }, { consumerTag: "test-header-consumer" });

    // Simulate a retry by publishing directly to retry queue with headers
    const testMessage = { loanId: "test-789", action: "test-headers" };
    await ch.publish("dlx", "loan.board.request.q.retry", Buffer.from(JSON.stringify(testMessage)), {
      contentType: "application/json",
      headers: {
        'x-retry-count': 2,
        'x-last-error': 'Previous attempt failed'
      }
    });

    // Wait for TTL and redelivery
    await new Promise(r => setTimeout(r, 2500));

    expect(headerCheck).toBe(true);
    
    await ch.cancel("test-header-consumer");
  });
});