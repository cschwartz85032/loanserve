// This script needs to be run with the production database credentials
// You'll need to provide the production DATABASE_URL when running this

const { neon } = require('@neondatabase/serverless');

const prodUrl = process.argv[2];

if (!prodUrl) {
  console.log(`
Usage: node update-prod-password.cjs "postgresql://user:password@host/database"

You need to provide the production database URL as an argument.
This can be found in your Replit deployment settings.
`);
  process.exit(1);
}

const sql = neon(prodUrl);

async function updateProduction() {
  console.log('Running migrations on PRODUCTION database...');
  console.log('Database host:', prodUrl.match(/@([^/]+)/)?.[1] || 'unknown');
  
  const migrations = [
    // Servicing Settings fields
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS servicing_fee numeric`,
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS servicing_fee_type text`,
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS late_charge numeric`,
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS late_charge_type text`,
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS fee_payer text`,
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS grace_period_days integer`,
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS investor_loan_number text`,
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS pool_number text`,
    
    // Payment Settings fields  
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS property_tax numeric`,
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS home_insurance numeric`,
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS pmi numeric DEFAULT 0`,
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS other_monthly numeric`,
    
    // Property APN field
    `ALTER TABLE properties ADD COLUMN IF NOT EXISTS apn text`,
    
    // Escrow number field
    `ALTER TABLE loans ADD COLUMN IF NOT EXISTS escrow_number text`
  ];
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const migration of migrations) {
    const columnName = migration.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1];
    process.stdout.write(`Adding column ${columnName}... `);
    try {
      await sql(migration);
      console.log('✓');
      successCount++;
    } catch (error) {
      console.log(`✗ ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\nMigration complete: ${successCount} successful, ${errorCount} errors`);
  
  // Verify the columns
  console.log('\nVerifying columns in loans table...');
  const result = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'loans' 
    AND column_name IN (
      'servicing_fee', 'servicing_fee_type', 'late_charge', 'late_charge_type',
      'fee_payer', 'grace_period_days', 'investor_loan_number', 'pool_number',
      'property_tax', 'home_insurance', 'pmi', 'other_monthly', 'escrow_number'
    )
    ORDER BY column_name
  `;
  
  console.log('Columns found:');
  result.forEach(col => {
    console.log(`  ✓ ${col.column_name}: ${col.data_type}`);
  });
  
  if (result.length === 13) {
    console.log('\n✅ All required columns are present in production!');
  } else {
    console.log(`\n⚠️ Only ${result.length} of 13 columns found`);
  }
}

updateProduction().catch(console.error);