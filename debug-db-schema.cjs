const { Client } = require('pg');

// Quick diagnostic script for schema issues
async function diagnoseSchema(tableName, searchTerm) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('neon') ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    
    // Find all columns matching search term
    const result = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = $1 
      AND column_name LIKE $2
      ORDER BY column_name;
    `, [tableName, `%${searchTerm}%`]);

    console.log(`\n=== Columns in '${tableName}' matching '${searchTerm}' ===`);
    result.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type}`);
    });

    // Check for potential duplicates (similar names)
    const dupCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY column_name;
    `, [tableName]);

    const columns = dupCheck.rows.map(r => r.column_name);
    const similar = columns.filter(col => 
      col.includes(searchTerm) || 
      col.replace(/_/g, '').includes(searchTerm.replace(/_/g, ''))
    );

    if (similar.length > 1) {
      console.log('\n⚠️  WARNING: Found similar column names that might conflict:');
      similar.forEach(col => console.log(`  - ${col}`));
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

// Usage: node debug-db-schema.cjs loans servicing
const [,, table = 'loans', search = ''] = process.argv;
diagnoseSchema(table, search);