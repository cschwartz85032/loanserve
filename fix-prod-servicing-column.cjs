const { Client } = require('pg');

// Use production database URL
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment variables');
  process.exit(1);
}

const isProduction = DATABASE_URL.includes('neon') || DATABASE_URL.includes('aws');
console.log('Database type:', isProduction ? 'Production (Neon)' : 'Development');

async function fixColumns() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Check if servicing_fee column exists
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'loans' 
      AND column_name = 'servicing_fee';
    `);

    if (checkResult.rows.length === 0) {
      console.log('=== Adding servicing_fee column ===');
      
      // Add the servicing_fee column
      await client.query(`
        ALTER TABLE loans 
        ADD COLUMN IF NOT EXISTS servicing_fee numeric(10, 2);
      `);
      console.log('  ✓ Added servicing_fee column');
      
      // Copy data from servicing_fee_amount to servicing_fee if it exists
      console.log('  Migrating existing data from servicing_fee_amount...');
      await client.query(`
        UPDATE loans 
        SET servicing_fee = servicing_fee_amount 
        WHERE servicing_fee_amount IS NOT NULL;
      `);
      console.log('  ✓ Data migrated');
      
      // We'll keep the old columns for now to avoid breaking anything
      console.log('  Note: Keeping servicing_fee_amount and servicing_fee_rate columns for backward compatibility');
    } else {
      console.log('  ✓ servicing_fee column already exists');
    }

    // Verify the final state
    const finalResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loans' 
      AND column_name LIKE '%servicing%'
      ORDER BY column_name;
    `);

    console.log('\n=== Final servicing columns state ===');
    finalResult.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

fixColumns();