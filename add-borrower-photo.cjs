const { neon } = require('@neondatabase/serverless');

async function addBorrowerPhotoColumn() {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    // Check if column already exists
    const checkColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'loans' 
      AND column_name = 'borrower_photo'
    `;
    
    if (checkColumn.length > 0) {
      console.log('borrower_photo column already exists');
      return;
    }
    
    // Add the column
    await sql`ALTER TABLE loans ADD COLUMN borrower_photo TEXT`;
    console.log('Successfully added borrower_photo column to loans table');
    
  } catch (error) {
    console.error('Error adding borrower_photo column:', error);
  }
}

addBorrowerPhotoColumn();