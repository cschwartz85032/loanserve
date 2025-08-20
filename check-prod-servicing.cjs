const { Client } = require('pg');

// Use production database URL
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment variables');
  process.exit(1);
}

const isProduction = DATABASE_URL.includes('neon') || DATABASE_URL.includes('aws');
console.log('Database type:', isProduction ? 'Production (Neon)' : 'Development');

async function checkColumns() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Check ALL columns in loans table with 'servicing' in the name
    const result = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'loans' 
      AND column_name LIKE '%servicing%'
      ORDER BY column_name;
    `);

    console.log('=== ALL servicing-related columns in loans table ===');
    if (result.rows.length === 0) {
      console.log('  No servicing columns found!');
    } else {
      result.rows.forEach(row => {
        console.log(`  ${row.column_name}:`);
        console.log(`    - Type: ${row.data_type}`);
        console.log(`    - Default: ${row.column_default || 'none'}`);
        console.log(`    - Nullable: ${row.is_nullable}`);
      });
    }

    // Check if there's a duplicate servicing_fee column (should NOT exist)
    const dupCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'loans' 
      AND column_name = 'servicing_fee';
    `);

    console.log('\n=== Duplicate Column Check ===');
    if (dupCheck.rows.length > 0) {
      console.log('  ⚠️  WARNING: Found duplicate "servicing_fee" column that should be removed!');
      console.log('  This may be causing the intermittent issues.');
    } else {
      console.log('  ✓ No duplicate "servicing_fee" column found (good)');
    }

    // Try to drop the duplicate column if it exists
    if (dupCheck.rows.length > 0) {
      console.log('\n=== Attempting to fix by dropping duplicate column ===');
      try {
        await client.query('ALTER TABLE loans DROP COLUMN IF EXISTS servicing_fee;');
        console.log('  ✓ Successfully dropped duplicate "servicing_fee" column');
      } catch (dropError) {
        console.log('  ✗ Could not drop column:', dropError.message);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkColumns();