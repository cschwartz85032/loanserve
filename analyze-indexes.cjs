const { neon } = require('@neondatabase/serverless');

const databaseUrl = process.env.DATABASE_URL;
const sql = neon(databaseUrl);

async function analyzeIndexes() {
  try {
    console.log('Analyzing database indexes...\n');
    
    // Get all tables
    const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE '%drizzle%'
      ORDER BY tablename
    `;
    
    console.log(`Found ${tables.length} tables\n`);
    
    // Get all existing indexes
    const indexes = await sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `;
    
    console.log('=== EXISTING INDEXES ===\n');
    let currentTable = '';
    for (const idx of indexes) {
      if (idx.tablename !== currentTable) {
        currentTable = idx.tablename;
        console.log(`\nTable: ${currentTable}`);
      }
      console.log(`  - ${idx.indexname}`);
    }
    
    // Get foreign key constraints
    console.log('\n\n=== FOREIGN KEY ANALYSIS ===\n');
    const foreignKeys = await sql`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name
    `;
    
    console.log(`Found ${foreignKeys.length} foreign key constraints\n`);
    
    // Check if foreign keys have indexes
    const missingIndexes = [];
    for (const fk of foreignKeys) {
      const hasIndex = indexes.some(idx => 
        idx.tablename === fk.table_name && 
        idx.indexdef.includes(`(${fk.column_name})`)
      );
      
      if (!hasIndex) {
        missingIndexes.push(fk);
        console.log(`❌ Missing index on ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      } else {
        console.log(`✓ Index exists on ${fk.table_name}.${fk.column_name}`);
      }
    }
    
    // Analyze frequently joined tables
    console.log('\n\n=== FREQUENTLY JOINED TABLES (Recommendations) ===\n');
    
    const recommendations = [
      { tables: ['loans', 'payments'], columns: ['loan_id', 'payment_date'] },
      { tables: ['loans', 'documents'], columns: ['loan_id', 'created_at'] },
      { tables: ['loans', 'escrow_disbursements'], columns: ['loan_id', 'next_due_date'] },
      { tables: ['loans', 'loan_fees'], columns: ['loan_id', 'due_date'] },
      { tables: ['users', 'user_roles'], columns: ['user_id'] },
      { tables: ['roles', 'user_roles'], columns: ['role_id'] },
      { tables: ['loans', 'crm_activity'], columns: ['loan_id', 'activity_date'] },
      { tables: ['loans', 'crm_contacts'], columns: ['loan_id'] },
      { tables: ['investors', 'investor_positions'], columns: ['investor_id'] },
      { tables: ['loans', 'investor_positions'], columns: ['loan_id'] }
    ];
    
    console.log('Recommended composite indexes for better join performance:');
    recommendations.forEach(rec => {
      console.log(`  - ${rec.tables.join(' + ')}: Consider index on ${rec.columns.join(', ')}`);
    });
    
    // Return missing indexes for creation
    return missingIndexes;
    
  } catch (error) {
    console.error('Error analyzing indexes:', error);
  }
}

analyzeIndexes();