import { Router, Request, Response } from 'express';
import { rabbitmqClient } from '../services/rabbitmq-unified.js';
import { requireAuth } from '../auth/middleware.js';
import { db } from '../db.js';
import { loans, payments } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();
const rabbitmq = rabbitmqClient;

// Get DLQ info (queue stats)
router.get('/dlq/:queueName/info', requireAuth, async (req: Request, res: Response) => {
  try {
    const { queueName } = req.params;
    
    if (!queueName.startsWith('dlq.')) {
      return res.status(400).json({ error: 'Queue name must start with dlq.' });
    }

    // Check connection first - graceful degradation
    try {
      const connectionInfo = await rabbitmq.getConnectionInfo();
      if (!connectionInfo.connected) {
        return res.json({
          queue: queueName,
          messageCount: 0,
          consumerCount: 0,
          originalQueue: queueName.replace('dlq.', ''),
          info: {
            status: 'offline',
            message: 'RabbitMQ connection unavailable'
          }
        });
      }
    } catch (error) {
      return res.json({
        queue: queueName,
        messageCount: 0,
        consumerCount: 0,
        originalQueue: queueName.replace('dlq.', ''),
        info: {
          status: 'offline',
          message: 'Connection check failed'
        }
      });
    }

    let channel;
    try {
      channel = await rabbitmq.getDLQChannel();
      if (!channel) {
        return res.json({
          queue: queueName,
          messageCount: 0,
          consumerCount: 0,
          originalQueue: queueName.replace('dlq.', ''),
          info: {
            status: 'offline',
            message: 'DLQ channel unavailable'
          }
        });
      }

      // Get queue statistics
      const stats = await channel.checkQueue(queueName);
      
      res.json({
        queue: queueName,
        messageCount: stats.messageCount,
        consumerCount: stats.consumerCount,
        originalQueue: queueName.replace('dlq.', ''),
        info: {
          status: 'connected',
          durable: true,
          arguments: stats.arguments || {}
        }
      });
    } catch (error) {
      // Queue might not exist - return empty stats
      res.json({
        queue: queueName,
        messageCount: 0,
        consumerCount: 0,
        originalQueue: queueName.replace('dlq.', ''),
        info: {
          status: 'not_found',
          message: 'Queue does not exist'
        }
      });
    } finally {
      // Always close channel in finally block
      if (channel) {
        try {
          await channel.close();
        } catch (closeError) {
          console.error('Error closing DLQ channel:', closeError);
        }
      }
    }
  } catch (error) {
    console.error('Error getting DLQ info:', error);
    res.json({
      queue: req.params.queueName,
      messageCount: 0,
      consumerCount: 0,
      originalQueue: req.params.queueName.replace('dlq.', ''),
      info: {
        status: 'error',
        message: 'Failed to retrieve queue information'
      }
    });
  }
});

// Browse messages in a DLQ
router.get('/dlq/:queueName/messages', requireAuth, async (req: Request, res: Response) => {
  try {
    const { queueName } = req.params;
    const { limit = 10 } = req.query;
    
    if (!queueName.startsWith('dlq.')) {
      return res.status(400).json({ error: 'Queue name must start with dlq.' });
    }

    // Check connection first - graceful degradation
    try {
      const connectionInfo = await rabbitmq.getConnectionInfo();
      if (!connectionInfo.connected) {
        return res.json({
          queue: queueName,
          messages: [],
          totalFetched: 0,
          info: { status: 'offline', message: 'RabbitMQ connection unavailable' }
        });
      }
    } catch (error) {
      return res.json({
        queue: queueName,
        messages: [],
        totalFetched: 0,
        info: { status: 'offline', message: 'Connection check failed' }
      });
    }

    let channel;
    try {
      channel = await rabbitmq.getDLQChannel();
      if (!channel) {
        return res.json({
          queue: queueName,
          messages: [],
          totalFetched: 0,
          info: { status: 'offline', message: 'DLQ channel unavailable' }
        });
      }

      // Get messages without acknowledging them (browse mode)
      const messages = [];
    let message;
    let count = 0;
    const maxMessages = Math.min(parseInt(limit as string, 10), 100);

    while (count < maxMessages) {
      message = await channel.get(queueName, { noAck: false });
      
      if (!message) {
        break;
      }

      try {
        const content = JSON.parse(message.content.toString());
        
        // Enrich payment messages with loan data
        let enrichedContent = content;
        if (queueName.includes('payment') && content.loanId) {
          try {
            const loan = await db.select().from(loans).where(eq(loans.id, content.loanId)).limit(1);
            if (loan.length > 0) {
              enrichedContent = {
                ...content,
                _context: {
                  loanBalance: loan[0].currentBalance,
                  loanStatus: loan[0].status,
                  borrowerName: loan[0].borrowerName,
                  originalAmount: loan[0].originalAmount
                }
              };
            }
          } catch (error) {
            console.error('Error fetching loan context:', error);
          }
        }
        
        messages.push({
          messageId: message.properties.messageId || `msg-${count}`,
          correlationId: message.properties.correlationId,
          timestamp: message.properties.timestamp || Date.now(),
          headers: message.properties.headers || {},
          exchange: message.fields.exchange,
          routingKey: message.fields.routingKey,
          redelivered: message.fields.redelivered,
          deliveryTag: message.fields.deliveryTag.toString(),
          content: enrichedContent,
          contentSize: message.content.length,
          failureReason: message.properties.headers?.['x-death'] ? 
            message.properties.headers['x-death'][0] : null
        });
        
        // Reject to put message back
        channel.reject(message, true);
        count++;
      } catch (error) {
        // If we can't parse, still include the message but with raw content
        messages.push({
          messageId: `msg-${count}`,
          correlationId: null,
          timestamp: Date.now(),
          headers: message.properties.headers || {},
          exchange: message.fields.exchange,
          routingKey: message.fields.routingKey,
          redelivered: message.fields.redelivered,
          deliveryTag: message.fields.deliveryTag.toString(),
          content: message.content.toString(),
          contentSize: message.content.length,
          failureReason: { error: 'Failed to parse message content' }
        });
        
        channel.reject(message, true);
        count++;
      }
    }

      res.json({
        queue: queueName,
        messages,
        totalFetched: messages.length
      });

    } catch (error) {
      console.error('Error fetching DLQ messages:', error);
      res.json({
        queue: req.params.queueName,
        messages: [],
        totalFetched: 0,
        info: { status: 'error', message: 'Failed to fetch DLQ messages' }
      });
    } finally {
      // Always close channel in finally block
      if (channel) {
        try {
          await channel.close();
        } catch (closeError) {
          console.error('Error closing DLQ channel:', closeError);
        }
      }
    }
  } catch (error) {
    console.error('Error in DLQ messages endpoint:', error);
    res.json({
      queue: req.params.queueName,
      messages: [],
      totalFetched: 0,
      info: { status: 'error', message: 'Connection error' }
    });
  }
});

// Retry a message from DLQ (move back to original queue)
router.post('/dlq/:queueName/retry', requireAuth, async (req, res) => {
  try {
    const { queueName } = req.params;
    const { messageCount = 1, editedMessage, resolution } = req.body;
    
    if (!queueName.startsWith('dlq.')) {
      return res.status(400).json({ error: 'Queue name must start with dlq.' });
    }

    const channel = await rabbitmq.getDLQChannel();
    if (!channel) {
      return res.status(503).json({ error: 'Message broker not connected' });
    }

    const queueInfo = await channel.checkQueue(queueName);
    
    // Close the channel after we're done
    await channel.close();
    
    res.json({
      queue: queueName,
      messageCount: queueInfo.messageCount,
      consumerCount: queueInfo.consumerCount,
      originalQueue: queueName.replace('dlq.', ''),
      info: queueInfo
    });

  } catch (error) {
    console.error('Error fetching DLQ info:', error);
    res.status(500).json({ error: 'Failed to fetch DLQ info' });
  }
});

// Retry a message from DLQ (move back to original queue)
router.post('/dlq/:queueName/retry', requireAuth, async (req, res) => {
  try {
    const { queueName } = req.params;
    const { messageCount = 1, editedMessage, resolution } = req.body;
    
    if (!queueName.startsWith('dlq.')) {
      return res.status(400).json({ error: 'Queue name must start with dlq.' });
    }

    const channel = await rabbitmq.getDLQChannel();
    if (!channel) {
      return res.status(503).json({ error: 'Message broker not connected' });
    }

    const originalQueue = queueName.replace('dlq.', '');
    const retriedMessages = [];
    
    // If we have a resolution action, handle it specially
    if (resolution && resolution.action === 'accept_overpayment') {
      const message = await channel.get(queueName, { noAck: false });
      
      if (message) {
        try {
          const content = JSON.parse(message.content.toString());
          
          // Modify the message to indicate overpayment handling
          const modifiedContent = {
            ...content,
            acceptOverpayment: true,
            overpaymentAmount: resolution.overpaymentAmount,
            refundRequired: true,
            _resolution: {
              action: 'accept_overpayment',
              timestamp: new Date().toISOString(),
              approvedBy: req.user?.id || 'system'
            }
          };
          
          // Publish the modified content to original queue
          await channel.sendToQueue(
            originalQueue,
            Buffer.from(JSON.stringify(modifiedContent)),
            {
              persistent: true,
              headers: {
                ...message.properties.headers,
                'x-retried-from-dlq': true,
                'x-retry-timestamp': new Date().toISOString(),
                'x-resolution-action': 'accept_overpayment',
                'x-original-error': message.properties.headers?.['x-death'] ? 
                  JSON.stringify(message.properties.headers['x-death'][0]) : null
              }
            }
          );

          // Acknowledge the message from DLQ (removes it)
          channel.ack(message);
          
          retriedMessages.push({
            messageId: message.properties.messageId,
            movedTo: originalQueue,
            timestamp: new Date().toISOString(),
            resolution: 'accept_overpayment'
          });
          
        } catch (error) {
          // Reject back to DLQ if retry fails
          channel.reject(message, true);
          throw error;
        }
      }
    } else if (editedMessage) {
      // If we have an edited message, use that instead of the original
      const message = await channel.get(queueName, { noAck: false });
      
      if (message) {
        try {
          // Publish the edited content to original queue
          await channel.sendToQueue(
            originalQueue,
            Buffer.from(JSON.stringify(editedMessage)),
            {
              persistent: true,
              headers: {
                ...message.properties.headers,
                'x-retried-from-dlq': true,
                'x-retry-timestamp': new Date().toISOString(),
                'x-message-edited': true,
                'x-original-error': message.properties.headers?.['x-death'] ? 
                  JSON.stringify(message.properties.headers['x-death'][0]) : null
              }
            }
          );

          // Acknowledge the message from DLQ (removes it)
          channel.ack(message);
          
          retriedMessages.push({
            messageId: message.properties.messageId,
            movedTo: originalQueue,
            timestamp: new Date().toISOString(),
            edited: true
          });
          
        } catch (error) {
          // Reject back to DLQ if retry fails
          channel.reject(message, true);
          throw error;
        }
      }
    } else {
      // Original logic for retrying without edits
      for (let i = 0; i < messageCount; i++) {
        const message = await channel.get(queueName, { noAck: false });
        
        if (!message) {
          break;
        }

        try {
          // Publish to original queue
          await channel.sendToQueue(
            originalQueue,
            message.content,
            {
              persistent: true,
              headers: {
                ...message.properties.headers,
                'x-retried-from-dlq': true,
                'x-retry-timestamp': new Date().toISOString(),
                'x-original-error': message.properties.headers?.['x-death'] ? 
                  JSON.stringify(message.properties.headers['x-death'][0]) : null
              }
            }
          );

          // Acknowledge the message from DLQ (removes it)
          channel.ack(message);
          
          retriedMessages.push({
            messageId: message.properties.messageId,
            movedTo: originalQueue,
            timestamp: new Date().toISOString()
          });
          
        } catch (error) {
          // Reject back to DLQ if retry fails
          channel.reject(message, true);
          throw error;
        }
      }
    }

    res.json({
      success: true,
      retriedCount: retriedMessages.length,
      messages: retriedMessages
    });
    
    // Close the channel
    await channel.close();

  } catch (error) {
    console.error('Error retrying DLQ messages:', error);
    res.status(500).json({ error: 'Failed to retry DLQ messages' });
  }
});

// Purge a specific DLQ
router.delete('/dlq/:queueName/purge', requireAuth, async (req, res) => {
  try {
    const { queueName } = req.params;
    
    if (!queueName.startsWith('dlq.')) {
      return res.status(400).json({ error: 'Queue name must start with dlq.' });
    }

    const channel = await rabbitmq.getDLQChannel();
    if (!channel) {
      return res.status(503).json({ error: 'Message broker not connected' });
    }

    const result = await channel.purgeQueue(queueName);
    
    // Close the channel
    await channel.close();
    
    res.json({
      success: true,
      queue: queueName,
      messagesPurged: result.messageCount
    });

  } catch (error) {
    console.error('Error purging DLQ:', error);
    res.status(500).json({ error: 'Failed to purge DLQ' });
  }
});

// Remove single message from DLQ
router.delete('/dlq/:queueName/message', requireAuth, async (req, res) => {
  try {
    const { queueName } = req.params;
    
    if (!queueName.startsWith('dlq.')) {
      return res.status(400).json({ error: 'Queue name must start with dlq.' });
    }

    const channel = await rabbitmq.getDLQChannel();
    if (!channel) {
      return res.status(503).json({ error: 'Message broker not connected' });
    }

    const message = await channel.get(queueName, { noAck: false });
    
    if (!message) {
      return res.status(404).json({ error: 'No messages in queue' });
    }
    
    // Acknowledge to remove from queue
    channel.ack(message);
    
    // Close the channel
    await channel.close();
    
    res.json({
      success: true,
      removed: true,
      messageId: message.properties.messageId
    });

  } catch (error) {
    console.error('Error removing message from DLQ:', error);
    res.status(500).json({ error: 'Failed to remove message' });
  }
});

export default router;