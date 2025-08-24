const { Pool } = require('pg');

async function checkOutboxFormat() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Get the raw outbox data
    const result = await client.query(
      "SELECT id, schema, payload FROM outbox WHERE aggregate_id = '16f66589-f85b-4d49-ab02-0d028109bb52' ORDER BY id DESC LIMIT 1"
    );
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log('Outbox entry #' + row.id);
      console.log('Schema:', row.schema);
      console.log('Raw payload type:', typeof row.payload);
      console.log('Raw payload:', row.payload);
      
      // The payload might be double-stringified
      try {
        const parsed = JSON.parse(row.payload);
        console.log('\nFirst parse result type:', typeof parsed);
        if (typeof parsed === 'string') {
          console.log('Payload is double-stringified! Attempting second parse...');
          const doubleParsed = JSON.parse(parsed);
          console.log('Double parsed type:', typeof doubleParsed);
          console.log('Double parsed keys:', Object.keys(doubleParsed));
        } else {
          console.log('Parsed keys:', Object.keys(parsed));
        }
      } catch (e) {
        console.log('Parse error:', e.message);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

checkOutboxFormat();
