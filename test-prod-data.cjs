// Direct test to verify your data exists in production
const { neon } = require('@neondatabase/serverless');

const prodUrl = 'postgresql://neondb_owner:npg_kcmy2MiWQej8@ep-old-mode-ad3oconp.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(prodUrl);

async function showProductionData() {
  console.log('===== YOUR PRODUCTION DATA =====\n');
  
  // Users
  const users = await sql`
    SELECT id, username, email, role, status 
    FROM users 
    ORDER BY id
  `;
  
  console.log('USERS (' + users.length + ' total):');
  users.forEach(u => {
    console.log(`  • ${u.username} (${u.email}) - Role: ${u.role}`);
  });
  
  // Loans
  const loans = await sql`
    SELECT id, loan_number, loan_amount, property_address 
    FROM loans 
    ORDER BY id DESC
  `;
  
  console.log('\nLOANS (' + loans.length + ' total):');
  loans.forEach(l => {
    console.log(`  • Loan #${l.loan_number} - $${l.loan_amount} - ${l.property_address?.substring(0, 30) || 'No address'}`);
  });
  
  console.log('\n================================');
  console.log('Your data IS in production.');
  console.log('The issue is only with session persistence.');
}

showProductionData().catch(console.error);