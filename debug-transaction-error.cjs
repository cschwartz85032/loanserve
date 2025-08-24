const { Pool } = require('@neondatabase/serverless');
const WebSocket = require('ws');

// Configure Neon websocket
const { neonConfig } = require('@neondatabase/serverless');
neonConfig.webSocketConstructor = WebSocket;

async function testDatabaseConnection() {
  console.log('Testing database connection...');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Test 1: Simple query
    console.log('\nTest 1: Simple query');
    const result1 = await pool.query('SELECT 1 as test');
    console.log('✓ Simple query succeeded:', result1.rows[0]);
    
    // Test 2: Transaction test
    console.log('\nTest 2: Transaction test');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      console.log('✓ Transaction started');
      
      const result2 = await client.query('SELECT COUNT(*) FROM payment_transactions');
      console.log('✓ Query in transaction succeeded:', result2.rows[0]);
      
      await client.query('COMMIT');
      console.log('✓ Transaction committed');
    } catch (error) {
      console.error('✗ Transaction error:', error.message);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    
    // Test 3: Check for stuck transactions
    console.log('\nTest 3: Checking for stuck transactions');
    const activeResult = await pool.query(`
      SELECT pid, state, query, backend_start, state_change 
      FROM pg_stat_activity 
      WHERE state != 'idle' 
        AND pid != pg_backend_pid()
        AND query NOT LIKE '%pg_stat_activity%'
    `);
    
    if (activeResult.rows.length > 0) {
      console.log('⚠ Found active transactions:');
      activeResult.rows.forEach(row => {
        console.log(`  PID ${row.pid}: ${row.state} - ${row.query?.substring(0, 50)}...`);
      });
    } else {
      console.log('✓ No stuck transactions found');
    }
    
    // Test 4: Check inbox table
    console.log('\nTest 4: Checking inbox table');
    const inboxResult = await pool.query('SELECT COUNT(*) as count FROM inbox');
    console.log('✓ Inbox table accessible, rows:', inboxResult.rows[0].count);
    
    // Test 5: Check consumer_inbox table
    console.log('\nTest 5: Checking consumer_inbox table');
    const consumerInboxResult = await pool.query('SELECT COUNT(*) as count FROM consumer_inbox');
    console.log('✓ Consumer inbox table accessible, rows:', consumerInboxResult.rows[0].count);
    
  } catch (error) {
    console.error('\n✗ Database test failed:', error);
  } finally {
    await pool.end();
    console.log('\n✓ Database pool closed');
  }
}

// Run the test
testDatabaseConnection().catch(console.error);