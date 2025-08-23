import { Router } from 'express';
import { getRabbitMQService } from '../services/rabbitmq.js';

const router = Router();

// Check environment configuration
router.get('/check-config', async (req, res) => {
  const cloudamqpUrl = process.env.CLOUDAMQP_URL;
  
  res.json({
    hasCloudamqpUrl: !!cloudamqpUrl,
    urlLength: cloudamqpUrl?.length || 0,
    urlPrefix: cloudamqpUrl?.substring(0, 10) || 'undefined',
    envKeys: Object.keys(process.env).filter(key => key.includes('CLOUD') || key.includes('AMQP')),
    allEnvKeys: Object.keys(process.env).length
  });
});

// Test RabbitMQ connection
router.get('/test-connection', async (req, res) => {
  try {
    const cloudamqpUrl = process.env.CLOUDAMQP_URL;
    
    if (!cloudamqpUrl) {
      return res.status(500).json({
        success: false,
        message: 'CLOUDAMQP_URL environment variable is not set',
        debug: {
          hasEnvVar: false,
          envKeys: Object.keys(process.env).filter(key => key.includes('CLOUD') || key.includes('AMQP'))
        }
      });
    }
    
    if (!cloudamqpUrl.startsWith('amqp://') && !cloudamqpUrl.startsWith('amqps://')) {
      return res.status(500).json({
        success: false,
        message: 'CLOUDAMQP_URL does not start with amqp:// or amqps://',
        debug: {
          urlLength: cloudamqpUrl.length,
          urlPrefix: cloudamqpUrl.substring(0, 10)
        }
      });
    }
    
    const rabbitmq = getRabbitMQService();
    const info = await rabbitmq.getConnectionInfo();
    
    res.json({
      success: true,
      message: 'RabbitMQ connection test successful',
      connectionInfo: info
    });
  } catch (error: any) {
    console.error('RabbitMQ connection test failed:', error);
    res.status(500).json({
      success: false,
      message: 'RabbitMQ connection test failed',
      error: error.message
    });
  }
});

// Test publishing a message
router.post('/test-publish', async (req, res) => {
  try {
    const rabbitmq = getRabbitMQService();
    const { queue = 'test-queue', message = 'Hello from LoanServe Pro!' } = req.body;
    
    const success = await rabbitmq.sendToQueue(queue, {
      message,
      timestamp: new Date().toISOString(),
      sender: 'LoanServe Pro API'
    });
    
    res.json({
      success,
      message: `Message published to queue '${queue}'`,
      data: { queue, published: success }
    });
  } catch (error: any) {
    console.error('RabbitMQ publish test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish message',
      error: error.message
    });
  }
});

// Test consuming messages (this will consume one message and return it)
router.get('/test-consume', async (req, res) => {
  try {
    const rabbitmq = getRabbitMQService();
    const { queue = 'test-queue' } = req.query;
    
    let messageReceived: any = null;
    let timeoutReached = false;
    
    // Set up a timeout to prevent hanging
    const timeout = setTimeout(() => {
      timeoutReached = true;
    }, 5000); // 5 second timeout
    
    const consumerTag = await rabbitmq.consume(queue as string, async (message) => {
      if (!timeoutReached) {
        messageReceived = message;
        clearTimeout(timeout);
      }
    });
    
    // Wait for message or timeout
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (messageReceived || timeoutReached) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);
    });
    
    if (messageReceived) {
      res.json({
        success: true,
        message: `Message consumed from queue '${queue}'`,
        data: messageReceived
      });
    } else {
      res.json({
        success: true,
        message: `No messages available in queue '${queue}' within timeout period`,
        data: null
      });
    }
  } catch (error: any) {
    console.error('RabbitMQ consume test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to consume message',
      error: error.message
    });
  }
});

// Initialize RabbitMQ connection on server start
router.get('/initialize', async (req, res) => {
  try {
    const rabbitmq = getRabbitMQService();
    await rabbitmq.connect();
    
    // Create test exchange and queue
    await rabbitmq.createExchange('loanserve-exchange', 'direct');
    await rabbitmq.bindQueue('test-queue', 'loanserve-exchange', 'test');
    
    res.json({
      success: true,
      message: 'RabbitMQ initialized successfully',
      data: {
        exchange: 'loanserve-exchange',
        queue: 'test-queue',
        routingKey: 'test'
      }
    });
  } catch (error: any) {
    console.error('RabbitMQ initialization failed:', error);
    res.status(500).json({
      success: false,
      message: 'RabbitMQ initialization failed',
      error: error.message
    });
  }
});

export default router;