const { Pool } = require('pg');

async function debugPaymentId() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Check what's in the outbox for the $502 payment
    const result = await client.query(`
      SELECT id, aggregate_id, schema, routing_key, 
             pg_typeof(payload) as payload_type,
             payload::text as payload_text
      FROM outbox 
      WHERE aggregate_id = '16f66589-f85b-4d49-ab02-0d028109bb52'
      ORDER BY id DESC LIMIT 1
    `);
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log('Outbox entry #' + row.id);
      console.log('Aggregate ID:', row.aggregate_id);
      console.log('Schema:', row.schema);
      console.log('Routing key:', row.routing_key);
      console.log('Payload type in DB:', row.payload_type);
      console.log('\nPayload content:');
      
      // Check if it's JSONB or text
      if (row.payload_type === 'jsonb') {
        console.log('❌ PROBLEM: Payload is stored as JSONB (should be text)');
        console.log('This is why the payment_id is not being extracted properly');
      } else {
        try {
          const parsed = JSON.parse(row.payload_text);
          console.log('✓ Payload is text and can be parsed');
          console.log('Structure:', JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log('❌ Cannot parse payload:', e.message);
        }
      }
    }
    
    // Check the manual payment entry that was fixed
    const newResult = await client.query(`
      SELECT id, aggregate_id, routing_key, 
             pg_typeof(payload) as payload_type
      FROM outbox 
      WHERE routing_key LIKE 'payment.%.validated'
      ORDER BY id DESC LIMIT 5
    `);
    
    console.log('\n\nRecent validated payment messages:');
    console.log('ID | Aggregate ID | Type | Routing Key');
    console.log('-'.repeat(60));
    newResult.rows.forEach(row => {
      const typeIcon = row.payload_type === 'jsonb' ? '❌ JSONB' : '✓ TEXT';
      console.log(`${row.id} | ${row.aggregate_id.substring(0, 10)}... | ${typeIcon} | ${row.routing_key}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

debugPaymentId();
