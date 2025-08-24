import { Router } from 'express';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { requireAuth } from '../auth/middleware';

const router = Router();
const rabbitmq = getEnhancedRabbitMQService();

// Get messages from a DLQ without consuming them
router.get('/dlq/:queueName/messages', requireAuth, async (req, res) => {
  try {
    const { queueName } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    
    if (!queueName.startsWith('dlq.')) {
      return res.status(400).json({ error: 'Queue name must start with dlq.' });
    }

    const channel = await rabbitmq.getDLQChannel();
    if (!channel) {
      return res.status(503).json({ error: 'Message broker not connected' });
    }

    // Get messages without acknowledging them (browse mode)
    const messages = [];
    let message;
    let count = 0;
    
    while (count < limit && (message = await channel.get(queueName, { noAck: false }))) {
      try {
        const content = JSON.parse(message.content.toString());
        messages.push({
          messageId: message.properties.messageId,
          correlationId: message.properties.correlationId,
          timestamp: message.properties.timestamp,
          headers: message.properties.headers,
          exchange: message.fields.exchange,
          routingKey: message.fields.routingKey,
          redelivered: message.fields.redelivered,
          deliveryTag: message.fields.deliveryTag.toString(),
          content,
          contentSize: message.content.length,
          failureReason: message.properties.headers?.['x-death'] ? 
            message.properties.headers['x-death'][0] : null
        });
        
        // Reject the message to put it back in the queue (since we're just browsing)
        channel.reject(message, true);
        count++;
      } catch (error) {
        console.error('Error parsing DLQ message:', error);
        // Still reject to put back in queue
        channel.reject(message, true);
      }
    }

    // Close the channel after we're done
    await channel.close();
    
    res.json({
      queue: queueName,
      messages,
      totalFetched: messages.length
    });

  } catch (error) {
    console.error('Error fetching DLQ messages:', error);
    res.status(500).json({ error: 'Failed to fetch DLQ messages' });
  }
});

// Get detailed information about a specific DLQ
router.get('/dlq/:queueName/info', requireAuth, async (req, res) => {
  try {
    const { queueName } = req.params;
    
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
    const { messageCount = 1, editedMessage } = req.body;
    
    if (!queueName.startsWith('dlq.')) {
      return res.status(400).json({ error: 'Queue name must start with dlq.' });
    }

    const channel = await rabbitmq.getDLQChannel();
    if (!channel) {
      return res.status(503).json({ error: 'Message broker not connected' });
    }

    const originalQueue = queueName.replace('dlq.', '');
    const retriedMessages = [];
    
    // If we have an edited message, use that instead of the original
    if (editedMessage) {
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

// Remove a single message from DLQ
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
      removed: {
        messageId: message.properties.messageId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error removing DLQ message:', error);
    res.status(500).json({ error: 'Failed to remove DLQ message' });
  }
});

export default router;