const { neon } = require('@neondatabase/serverless');

// Check both database URLs
console.log('Checking database environment variables...\n');

const devUrl = process.env.DATABASE_URL;
const prodUrl = process.env.DATABASE_URL_PROD;

console.log('DATABASE_URL (dev) exists:', !!devUrl);
console.log('DATABASE_URL_PROD exists:', !!prodUrl);

// Use production URL for this check
const url = prodUrl || devUrl;
if (!url) {
  console.error('No database URL found');
  process.exit(1);
}

// Extract database name from URL
const dbMatch = url.match(/\/([^?]+)(\?|$)/);
const dbName = dbMatch ? dbMatch[1] : 'unknown';
console.log('\nChecking database:', dbName);

const sql = neon(url);

async function checkDatabase() {
  try {
    // Check if servicing columns exist
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
    
    console.log('\nColumns found in loans table:');
    const foundColumns = new Set();
    result.forEach(col => {
      console.log(`  ✓ ${col.column_name}: ${col.data_type}`);
      foundColumns.add(col.column_name);
    });
    
    // Check for missing columns
    const requiredColumns = [
      'servicing_fee', 'servicing_fee_type', 'late_charge', 'late_charge_type',
      'fee_payer', 'grace_period_days', 'investor_loan_number', 'pool_number',
      'property_tax', 'home_insurance', 'pmi', 'other_monthly', 'escrow_number'
    ];
    
    const missingColumns = requiredColumns.filter(col => !foundColumns.has(col));
    
    if (missingColumns.length > 0) {
      console.log('\n❌ MISSING COLUMNS:');
      missingColumns.forEach(col => {
        console.log(`  - ${col}`);
      });
    } else {
      console.log('\n✅ All required columns exist!');
    }
    
    // Check a sample loan to see the actual data
    const sampleLoan = await sql`
      SELECT servicing_fee, servicing_fee_type, late_charge, late_charge_type, grace_period_days
      FROM loans 
      LIMIT 1
    `;
    
    if (sampleLoan.length > 0) {
      console.log('\nSample loan servicing data:');
      console.log(sampleLoan[0]);
    }
    
  } catch (error) {
    console.error('Error checking database:', error.message);
  }
}

checkDatabase();