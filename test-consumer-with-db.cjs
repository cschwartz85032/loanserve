const amqp = require('amqplib');
const { Pool } = require('@neondatabase/serverless');
const WebSocket = require('ws');
const { neonConfig } = require('@neondatabase/serverless');

neonConfig.webSocketConstructor = WebSocket;

const CLOUDAMQP_URL = 'amqps://dakjacqm:KVYaHXxCWleHs9tHn1uvrpWwTlpLZt-o@duck.lmq.cloudamqp.com/dakjacqm';

async function testConsumerWithDb() {
  console.log('Testing consumer with database operations...\n');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Connect to RabbitMQ
    const connection = await amqp.connect(CLOUDAMQP_URL);
    console.log('✓ Connected to RabbitMQ');
    
    const channel = await connection.createChannel();
    console.log('✓ Channel created');
    
    // Create test queue
    const testQueue = 'test.db.queue';
    await channel.assertQueue(testQueue, { durable: false });
    console.log(`✓ Queue '${testQueue}' created`);
    
    // Publish test message
    const testMessage = {
      message_id: 'TEST-DB-' + Date.now(),
      data: { test: true, timestamp: new Date().toISOString() }
    };
    
    channel.sendToQueue(testQueue, Buffer.from(JSON.stringify(testMessage)));
    console.log('✓ Test message published');
    
    // Set up consumer with database operations
    console.log('\nSetting up consumer with DB operations...');
    let messageProcessed = false;
    let errorOccurred = null;
    
    await channel.consume(testQueue, async (msg) => {
      console.log('\n=== Processing Message with DB ===');
      if (!msg) {
        console.log('Null message received');
        return;
      }
      
      const client = await pool.connect();
      console.log('✓ Got database connection');
      
      try {
        const parsed = JSON.parse(msg.content.toString());
        console.log('✓ Parsed message:', parsed.message_id);
        
        // Start transaction
        await client.query('BEGIN');
        console.log('✓ Transaction started');
        
        // Check inbox (simulating idempotency check)
        const checkResult = await client.query(
          'SELECT * FROM inbox WHERE consumer = $1 AND message_id = $2',
          ['test-consumer', parsed.message_id]
        );
        console.log('✓ Inbox check completed, rows:', checkResult.rows.length);
        
        if (checkResult.rows.length === 0) {
          // Record as processed
          await client.query(
            'INSERT INTO inbox (consumer, message_id, processed_at) VALUES ($1, $2, NOW())',
            ['test-consumer', parsed.message_id]
          );
          console.log('✓ Recorded in inbox');
        }
        
        // Commit transaction
        await client.query('COMMIT');
        console.log('✓ Transaction committed');
        
        channel.ack(msg);
        console.log('✓ Message acknowledged');
        messageProcessed = true;
        
      } catch (error) {
        console.error('✗ Error in message processing:', error.message);
        errorOccurred = error;
        
        try {
          await client.query('ROLLBACK');
          console.log('✓ Transaction rolled back');
        } catch (rollbackError) {
          console.error('✗ Rollback failed:', rollbackError.message);
        }
        
        channel.nack(msg, false, false);
        console.log('✓ Message nacked');
      } finally {
        client.release();
        console.log('✓ Connection released');
      }
    });
    
    console.log('✓ Consumer with DB started');
    
    // Wait for processing
    console.log('\nWaiting for message processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check results
    if (errorOccurred) {
      console.log('\n✗ Test FAILED with error:', errorOccurred.message);
      console.log('Error code:', errorOccurred.code);
    } else if (messageProcessed) {
      console.log('\n✓ Test PASSED - Message processed with database operations');
      
      // Verify inbox entry
      const verifyResult = await pool.query('SELECT COUNT(*) FROM inbox WHERE consumer = $1', ['test-consumer']);
      console.log('✓ Verified inbox entries:', verifyResult.rows[0].count);
    } else {
      console.log('\n⚠ Test incomplete - Message not processed');
    }
    
    // Cleanup
    await pool.query('DELETE FROM inbox WHERE consumer = $1', ['test-consumer']);
    await channel.deleteQueue(testQueue);
    await channel.close();
    await connection.close();
    console.log('\n✓ Cleanup complete');
    
  } catch (error) {
    console.error('\n✗ Test failed:', error);
  } finally {
    await pool.end();
    console.log('✓ Database pool closed');
  }
}

// Run the test
testConsumerWithDb().catch(console.error);