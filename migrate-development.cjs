const { neon } = require('@neondatabase/serverless');

// Use the development DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log('Running migrations on DEVELOPMENT database...');
  
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
  
  for (const migration of migrations) {
    console.log(`Running: ${migration}`);
    try {
      await sql(migration);
      console.log('✓ Success');
    } catch (error) {
      console.error(`✗ Error: ${error.message}`);
    }
  }
  
  // Verify the columns exist
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
  
  console.log('\nColumns found in database:');
  result.forEach(col => {
    console.log(`  - ${col.column_name}: ${col.data_type}`);
  });
  
  console.log('\n✅ Migration completed successfully!');
}

migrate().catch(console.error);