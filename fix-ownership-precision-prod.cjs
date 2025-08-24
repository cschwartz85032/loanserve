const { neon } = require('@neondatabase/serverless');

// This script needs to be run with the production database URL
const prodUrl = process.argv[2];

if (!prodUrl) {
  console.log(`
Usage: node fix-ownership-precision-prod.cjs "postgresql://user:password@host/database"

You need to provide the production database URL as an argument.
This can be found in your Replit deployment settings.
`);
  process.exit(1);
}

const sql = neon(prodUrl);

async function fixOwnershipPrecision() {
  console.log('Fixing ownership percentage precision in PRODUCTION database...');
  console.log('Changing from numeric(5,2) to numeric(8,6) for better precision\n');
  console.log('Database host:', prodUrl.match(/@([^/]+)/)?.[1] || 'unknown');
  
  try {
    // Check current precision before changes
    console.log('Checking current column definitions...');
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
    
    console.log('Current definitions:');
    currentDefs.forEach(col => {
      console.log(`  ${col.table_name}.${col.column_name}: numeric(${col.numeric_precision},${col.numeric_scale})`);
    });
    console.log('');
    
    // Update investors table
    console.log('Updating investors.ownership_percentage...');
    await sql`
      ALTER TABLE investors 
      ALTER COLUMN ownership_percentage 
      TYPE numeric(8,6)
    `;
    console.log('  ✓ Updated to numeric(8,6)');
    
    // Update loan_borrowers table
    console.log('Updating loan_borrowers.ownership_percentage...');
    await sql`
      ALTER TABLE loan_borrowers 
      ALTER COLUMN ownership_percentage 
      TYPE numeric(8,6)
    `;
    console.log('  ✓ Updated to numeric(8,6)');
    
    // investor_distributions should already be correct, but let's verify
    console.log('Verifying investor_distributions.ownership_percentage...');
    const distCheck = await sql`
      SELECT numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'investor_distributions'
      AND column_name = 'ownership_percentage'
    `;
    
    if (distCheck.length > 0) {
      const { numeric_precision, numeric_scale } = distCheck[0];
      if (numeric_precision === 8 && numeric_scale === 6) {
        console.log('  ✓ Already at numeric(8,6) - no change needed');
      } else {
        console.log(`  Current: numeric(${numeric_precision},${numeric_scale}), updating...`);
        await sql`
          ALTER TABLE investor_distributions 
          ALTER COLUMN ownership_percentage 
          TYPE numeric(8,6)
        `;
        console.log('  ✓ Updated to numeric(8,6)');
      }
    }
    
    // Verify the changes
    console.log('\nVerifying updated column definitions...');
    const updatedDefs = await sql`
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
    
    console.log('Updated definitions:');
    let allCorrect = true;
    updatedDefs.forEach(col => {
      const isCorrect = col.numeric_precision === 8 && col.numeric_scale === 6;
      const status = isCorrect ? '✓' : '✗';
      console.log(`  ${status} ${col.table_name}.${col.column_name}: numeric(${col.numeric_precision},${col.numeric_scale})`);
      if (!isCorrect) allCorrect = false;
    });
    
    if (allCorrect) {
      console.log('\n✅ All ownership percentage columns successfully updated to numeric(8,6)!');
      console.log('This allows for precise percentage splits like 33.333333% without rounding errors.');
    } else {
      console.log('\n⚠️ Some columns may not have been updated correctly. Please check manually.');
    }
    
  } catch (error) {
    console.error('❌ Error updating precision:', error.message);
    process.exit(1);
  }
}

fixOwnershipPrecision().catch(console.error);