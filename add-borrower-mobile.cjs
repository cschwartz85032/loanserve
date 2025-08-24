const { neon } = require('@neondatabase/serverless');

async function addBorrowerMobileColumn() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);

  try {
    console.log('Adding borrowerMobile column to loans table...');
    
    // Add borrowerMobile column if it doesn't exist
    await sql`
      ALTER TABLE loans 
      ADD COLUMN IF NOT EXISTS borrower_mobile TEXT
    `;
    
    console.log('✓ Successfully added borrowerMobile column');
    
  } catch (error) {
    console.error('Error adding column:', error);
  }
}

addBorrowerMobileColumn();