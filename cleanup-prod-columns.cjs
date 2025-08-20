const { Client } = require('pg');

// Use production database URL
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment variables');
  process.exit(1);
}

const isProduction = DATABASE_URL.includes('neon') || DATABASE_URL.includes('aws');
console.log('Database type:', isProduction ? 'Production (Neon)' : 'Development');

async function cleanupColumns() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    console.log('=== Removing obsolete servicing columns ===');
    
    // Drop the old columns that are no longer needed
    console.log('Dropping servicing_fee_amount column...');
    await client.query('ALTER TABLE loans DROP COLUMN IF EXISTS servicing_fee_amount;');
    console.log('  ✓ Dropped servicing_fee_amount');
    
    console.log('Dropping servicing_fee_rate column...');
    await client.query('ALTER TABLE loans DROP COLUMN IF EXISTS servicing_fee_rate;');
    console.log('  ✓ Dropped servicing_fee_rate');
    
    // Verify the final state
    const finalResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loans' 
      AND column_name LIKE '%servicing%'
      ORDER BY column_name;
    `);

    console.log('\n=== Final servicing columns (should only be 2) ===');
    finalResult.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    if (finalResult.rows.length === 2) {
      console.log('\n✅ Success! Database now has the correct servicing columns:');
      console.log('  - servicing_fee: stores the value');
      console.log('  - servicing_fee_type: indicates if value is $ amount or %');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

cleanupColumns();