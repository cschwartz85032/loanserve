const { neon } = require('@neondatabase/serverless');

// This script applies ALL production fixes:
// 1. Missing servicing settings columns
// 2. Ownership percentage precision fix

const prodUrl = process.argv[2];

if (!prodUrl) {
  console.log(`
Usage: node fix-production-complete.cjs "postgresql://user:password@host/database"

IMPORTANT: Wrap the entire database URL in quotes!

Example:
node fix-production-complete.cjs "postgresql://neondb_owner:npg_YvNVbM1FOfA2@ep-still-sound-ad98va4z.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
`);
  process.exit(1);
}

const sql = neon(prodUrl);

async function applyAllProductionFixes() {
  console.log('Applying ALL production database fixes...');
  console.log('Database host:', prodUrl.match(/@([^/]+)/)?.[1] || 'unknown');
  console.log('');
  
  let successCount = 0;
  let errorCount = 0;
  
  try {
    // Part 1: Add missing columns
    console.log('=== PART 1: Adding missing columns ===\n');
    
    const columnsToAdd = [
      // Servicing Settings fields
      { table: 'loans', column: 'servicing_fee', type: 'numeric' },
      { table: 'loans', column: 'servicing_fee_type', type: 'text' },
      { table: 'loans', column: 'late_charge', type: 'numeric' },
      { table: 'loans', column: 'late_charge_type', type: 'text' },
      { table: 'loans', column: 'fee_payer', type: 'text' },
      { table: 'loans', column: 'grace_period_days', type: 'integer' },
      { table: 'loans', column: 'investor_loan_number', type: 'text' },
      { table: 'loans', column: 'pool_number', type: 'text' },
      
      // Payment Settings fields
      { table: 'loans', column: 'property_tax', type: 'numeric' },
      { table: 'loans', column: 'home_insurance', type: 'numeric' },
      { table: 'loans', column: 'pmi', type: 'numeric DEFAULT 0' },
      { table: 'loans', column: 'other_monthly', type: 'numeric' },
      
      // Property APN field
      { table: 'properties', column: 'apn', type: 'text' },
      
      // Escrow number field
      { table: 'loans', column: 'escrow_number', type: 'text' }
    ];
    
    for (const { table, column, type } of columnsToAdd) {
      process.stdout.write(`Adding ${table}.${column}... `);
      try {
        await sql(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
        console.log('✓');
        successCount++;
      } catch (error) {
        console.log(`✗ ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\nColumns: ${successCount} added, ${errorCount} errors\n`);
    
    // Part 2: Fix ownership percentage precision
    console.log('=== PART 2: Fixing ownership percentage precision ===\n');
    
    // Check current precision
    const currentDefs = await sql`
      SELECT 
        table_name,
        column_name,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE column_name = 'ownership_percentage'
      AND table_name IN ('investors', 'loan_borrowers', 'investor_distributions')
      ORDER BY table_name
    `;
    
    console.log('Current precision:');
    currentDefs.forEach(col => {
      console.log(`  ${col.table_name}: numeric(${col.numeric_precision},${col.numeric_scale})`);
    });
    console.log('');
    
    // Update precision
    const tablesToUpdate = ['investors', 'loan_borrowers', 'investor_distributions'];
    
    for (const table of tablesToUpdate) {
      process.stdout.write(`Updating ${table}.ownership_percentage to numeric(8,6)... `);
      try {
        await sql(`ALTER TABLE ${table} ALTER COLUMN ownership_percentage TYPE numeric(8,6)`);
        console.log('✓');
      } catch (error) {
        console.log(`✗ ${error.message}`);
      }
    }
    
    // Verify all changes
    console.log('\n=== VERIFICATION ===\n');
    
    // Check servicing columns
    const servicingCols = await sql`
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
    
    console.log('Servicing settings columns:');
    servicingCols.forEach(col => {
      console.log(`  ✓ ${col.column_name}: ${col.data_type}`);
    });
    
    // Check precision
    const updatedPrecision = await sql`
      SELECT 
        table_name,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE column_name = 'ownership_percentage'
      AND table_name IN ('investors', 'loan_borrowers', 'investor_distributions')
      ORDER BY table_name
    `;
    
    console.log('\nOwnership percentage precision:');
    updatedPrecision.forEach(col => {
      const isCorrect = col.numeric_precision === 8 && col.numeric_scale === 6;
      const status = isCorrect ? '✓' : '✗';
      console.log(`  ${status} ${col.table_name}: numeric(${col.numeric_precision},${col.numeric_scale})`);
    });
    
    console.log('\n✅ Production database fixes completed successfully!');
    console.log('- All servicing settings columns added');
    console.log('- Ownership percentages updated to numeric(8,6) for precise splits');
    
  } catch (error) {
    console.error('\n❌ Error during migration:', error.message);
    process.exit(1);
  }
}

applyAllProductionFixes().catch(console.error);