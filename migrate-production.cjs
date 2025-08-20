// Production Database Migration Script
// Run this script to add missing columns to the production database
// Usage: node migrate-production.js

const { Client } = require('pg');

async function runMigration() {
  // Use the production DATABASE_URL from environment
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    
    console.log('Running migrations...');
    
    // Add servicing settings columns
    const servicingColumns = [
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS servicing_fee_type text DEFAULT 'percentage'`,
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS late_charge_type text DEFAULT 'percentage'`,
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS fee_payer text`,
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS grace_period_days integer`,
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS investor_loan_number text`,
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS pool_number text`,
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS late_charge decimal(10, 2)`
    ];
    
    // Add payment settings columns
    const paymentColumns = [
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS property_tax decimal(10, 2)`,
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS home_insurance decimal(10, 2)`,
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS pmi decimal(10, 2)`,
      `ALTER TABLE loans ADD COLUMN IF NOT EXISTS other_monthly decimal(10, 2)`
    ];
    
    // Add APN field
    const apnColumn = `ALTER TABLE properties ADD COLUMN IF NOT EXISTS apn text`;
    
    // Add escrow number field
    const escrowColumn = `ALTER TABLE loans ADD COLUMN IF NOT EXISTS escrow_number text`;
    
    // Execute all migrations
    const allMigrations = [...servicingColumns, ...paymentColumns, apnColumn, escrowColumn];
    
    for (const migration of allMigrations) {
      try {
        console.log(`Running: ${migration.substring(0, 50)}...`);
        await client.query(migration);
        console.log('✓ Success');
      } catch (error) {
        if (error.code === '42701') {
          console.log('✓ Column already exists');
        } else {
          console.error(`✗ Error: ${error.message}`);
        }
      }
    }
    
    // Verify the changes
    console.log('\nVerifying columns in loans table...');
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loans' 
      AND column_name IN (
        'servicing_fee_type', 'late_charge_type', 'fee_payer', 
        'grace_period_days', 'investor_loan_number', 'pool_number',
        'late_charge', 'property_tax', 'home_insurance', 
        'pmi', 'other_monthly', 'escrow_number'
      )
      ORDER BY column_name
    `);
    
    console.log('\nColumns found in database:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the migration
runMigration().catch(console.error);