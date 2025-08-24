const { Client } = require('pg');

// Use production database URL - this should be the Neon database
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment variables');
  process.exit(1);
}

// Parse to check if it's production (Neon)
const isProduction = DATABASE_URL.includes('neon') || DATABASE_URL.includes('aws');
console.log('Database URL type:', isProduction ? 'Production (Neon)' : 'Development');

async function checkColumns() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check for columns with 'servicing' in their name
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loans' 
      AND column_name LIKE '%servicing%'
      ORDER BY column_name;
    `);

    console.log('\n=== Servicing-related columns in loans table ===');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });

    // Also check for any columns with 'file' in the name
    const fileResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loans' 
      AND column_name LIKE '%file%'
      ORDER BY column_name;
    `);

    if (fileResult.rows.length > 0) {
      console.log('\n=== Columns with "file" in the name ===');
      fileResult.rows.forEach(row => {
        console.log(`  ${row.column_name}: ${row.data_type}`);
      });
    } else {
      console.log('\n✓ No columns with "file" in the name found (this is good!)');
    }

    // Check specifically for the problematic column
    const problemResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'loans' 
      AND (column_name = 'servicing_file_type' OR column_name = 'servicing_fee_type');
    `);

    console.log('\n=== Checking for specific columns ===');
    console.log('  servicing_file_type exists?', problemResult.rows.some(r => r.column_name === 'servicing_file_type') ? 'YES (PROBLEM!)' : 'NO (good)');
    console.log('  servicing_fee_type exists?', problemResult.rows.some(r => r.column_name === 'servicing_fee_type') ? 'YES (good)' : 'NO (PROBLEM!)');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkColumns();