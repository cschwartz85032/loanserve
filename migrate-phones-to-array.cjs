const { neon } = require('@neondatabase/serverless');

const databaseUrl = process.env.DATABASE_URL;
const sql = neon(databaseUrl);

async function migratePhonesToArray() {
  try {
    console.log('Migrating phone data to array format...');
    
    // Get all loans with phone data
    const loans = await sql`
      SELECT id, loan_number, borrower_phone, borrower_mobile
      FROM loans 
      WHERE borrower_phone IS NOT NULL OR borrower_mobile IS NOT NULL
    `;
    
    console.log(`Found ${loans.length} loans with phone data`);
    
    for (const loan of loans) {
      const phones = [];
      
      // Parse primary phone
      if (loan.borrower_phone) {
        try {
          // Check if already an array
          if (loan.borrower_phone.startsWith('[')) {
            // Already migrated, skip
            console.log(`Loan ${loan.loan_number}: Already using array format`);
            continue;
          }
          
          // Parse as object or string
          if (loan.borrower_phone.startsWith('{')) {
            const parsed = JSON.parse(loan.borrower_phone);
            phones.push({
              number: parsed.number || '',
              label: parsed.label || 'Primary',
              isBad: parsed.isBad || false
            });
          } else {
            // Plain string
            phones.push({
              number: loan.borrower_phone,
              label: 'Primary',
              isBad: false
            });
          }
        } catch (error) {
          console.error(`Loan ${loan.loan_number}: Error parsing borrower_phone:`, error.message);
          phones.push({
            number: loan.borrower_phone,
            label: 'Primary',
            isBad: false
          });
        }
      }
      
      // Parse mobile phone
      if (loan.borrower_mobile) {
        try {
          if (loan.borrower_mobile.startsWith('{')) {
            const parsed = JSON.parse(loan.borrower_mobile);
            phones.push({
              number: parsed.number || '',
              label: parsed.label || 'Mobile',
              isBad: parsed.isBad || false
            });
          } else {
            // Plain string
            phones.push({
              number: loan.borrower_mobile,
              label: 'Mobile',
              isBad: false
            });
          }
        } catch (error) {
          console.error(`Loan ${loan.loan_number}: Error parsing borrower_mobile:`, error.message);
          phones.push({
            number: loan.borrower_mobile,
            label: 'Mobile',
            isBad: false
          });
        }
      }
      
      // Update to array format
      if (phones.length > 0) {
        const phoneArrayJson = JSON.stringify(phones);
        
        await sql`
          UPDATE loans 
          SET borrower_phone = ${phoneArrayJson},
              borrower_mobile = NULL
          WHERE id = ${loan.id}
        `;
        
        console.log(`Loan ${loan.loan_number}: Migrated ${phones.length} phone(s) to array format`);
      }
    }
    
    console.log('\nPhone migration complete!');
    
    // Show sample of migrated data
    const sample = await sql`
      SELECT loan_number, borrower_phone, borrower_mobile
      FROM loans 
      WHERE id = 14
      LIMIT 1
    `;
    
    if (sample.length > 0) {
      console.log('\nSample migrated data:');
      console.log('Loan:', sample[0].loan_number);
      if (sample[0].borrower_phone) {
        console.log('Phones:', JSON.parse(sample[0].borrower_phone));
      }
      console.log('Mobile field (should be null):', sample[0].borrower_mobile);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

migratePhonesToArray();