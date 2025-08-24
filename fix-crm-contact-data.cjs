const { neon } = require('@neondatabase/serverless');

const databaseUrl = process.env.DATABASE_URL;
const sql = neon(databaseUrl);

async function fixContactData() {
  try {
    console.log('Fetching all loans with contact data...');
    
    // Get all loans with contact data
    const loans = await sql`
      SELECT id, loan_number, borrower_email, borrower_phone, borrower_mobile
      FROM loans 
      WHERE borrower_email IS NOT NULL 
         OR borrower_phone IS NOT NULL 
         OR borrower_mobile IS NOT NULL
    `;
    
    console.log(`Found ${loans.length} loans with contact data`);
    
    for (const loan of loans) {
      let needsUpdate = false;
      const updates = {};
      
      // Fix email data
      if (loan.borrower_email) {
        try {
          let emailData = loan.borrower_email;
          let parsedData = emailData;
          
          // Keep parsing until we get to the actual data
          while (typeof parsedData === 'string') {
            try {
              parsedData = JSON.parse(parsedData);
            } catch {
              // If we can't parse anymore, break
              break;
            }
          }
          
          // Now we should have the actual data
          if (Array.isArray(parsedData)) {
            // It's an array of email objects
            const cleanEmails = parsedData.map(item => {
              // If item has nested email property, extract it
              if (typeof item === 'object' && item.email) {
                // Check if item.email is another nested structure
                let email = item.email;
                while (typeof email === 'string' && (email.startsWith('[') || email.startsWith('{'))) {
                  try {
                    email = JSON.parse(email);
                    if (Array.isArray(email) && email.length > 0) {
                      email = email[0].email || email[0];
                    } else if (typeof email === 'object' && email.email) {
                      email = email.email;
                    }
                  } catch {
                    break;
                  }
                }
                return {
                  email: email,
                  label: item.label || 'Primary'
                };
              }
              return item;
            }).filter(item => item.email && typeof item.email === 'string' && !item.email.startsWith('[') && !item.email.startsWith('{'));
            
            if (cleanEmails.length > 0) {
              updates.borrower_email = JSON.stringify(cleanEmails);
              needsUpdate = true;
              console.log(`Loan ${loan.loan_number}: Fixed email data`);
            }
          } else if (typeof parsedData === 'string' && !parsedData.startsWith('[') && !parsedData.startsWith('{')) {
            // It's a plain email string
            updates.borrower_email = JSON.stringify([{ email: parsedData, label: 'Primary' }]);
            needsUpdate = true;
            console.log(`Loan ${loan.loan_number}: Converted plain email to JSON format`);
          }
        } catch (error) {
          console.error(`Loan ${loan.loan_number}: Error processing email:`, error.message);
        }
      }
      
      // Fix phone data (ensure it's properly formatted)
      if (loan.borrower_phone) {
        try {
          let phoneData = loan.borrower_phone;
          if (typeof phoneData === 'string' && !phoneData.startsWith('{')) {
            // Plain phone number, convert to JSON format
            updates.borrower_phone = JSON.stringify({
              number: phoneData,
              label: 'Primary',
              isBad: false
            });
            needsUpdate = true;
            console.log(`Loan ${loan.loan_number}: Converted plain phone to JSON format`);
          } else if (typeof phoneData === 'string') {
            // Parse and reformat to ensure it's clean
            const parsed = JSON.parse(phoneData);
            updates.borrower_phone = JSON.stringify({
              number: parsed.number || parsed,
              label: parsed.label || 'Primary',
              isBad: parsed.isBad || false
            });
            needsUpdate = true;
            console.log(`Loan ${loan.loan_number}: Cleaned phone data`);
          }
        } catch (error) {
          console.error(`Loan ${loan.loan_number}: Error processing phone:`, error.message);
        }
      }
      
      // Fix mobile data
      if (loan.borrower_mobile) {
        try {
          let mobileData = loan.borrower_mobile;
          if (typeof mobileData === 'string' && !mobileData.startsWith('{')) {
            // Plain phone number, convert to JSON format
            updates.borrower_mobile = JSON.stringify({
              number: mobileData,
              label: 'Mobile',
              isBad: false
            });
            needsUpdate = true;
            console.log(`Loan ${loan.loan_number}: Converted plain mobile to JSON format`);
          } else if (typeof mobileData === 'string') {
            // Parse and reformat to ensure it's clean
            const parsed = JSON.parse(mobileData);
            updates.borrower_mobile = JSON.stringify({
              number: parsed.number || parsed,
              label: parsed.label || 'Mobile',
              isBad: parsed.isBad || false
            });
            needsUpdate = true;
            console.log(`Loan ${loan.loan_number}: Cleaned mobile data`);
          }
        } catch (error) {
          console.error(`Loan ${loan.loan_number}: Error processing mobile:`, error.message);
        }
      }
      
      // Apply updates if needed
      if (needsUpdate) {
        const setClause = Object.entries(updates)
          .map(([key, value]) => `${key} = ${value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`}`)
          .join(', ');
        
        await sql(`UPDATE loans SET ${setClause} WHERE id = ${loan.id}`);
        console.log(`Loan ${loan.loan_number}: Updated successfully`);
      }
    }
    
    console.log('\nContact data cleanup complete!');
    
    // Show sample of fixed data
    const sample = await sql`
      SELECT loan_number, borrower_email, borrower_phone, borrower_mobile
      FROM loans 
      WHERE id = 14
      LIMIT 1
    `;
    
    if (sample.length > 0) {
      console.log('\nSample fixed data:');
      console.log('Loan:', sample[0].loan_number);
      if (sample[0].borrower_email) {
        console.log('Email:', JSON.parse(sample[0].borrower_email));
      }
      if (sample[0].borrower_phone) {
        console.log('Phone:', JSON.parse(sample[0].borrower_phone));
      }
      if (sample[0].borrower_mobile) {
        console.log('Mobile:', JSON.parse(sample[0].borrower_mobile));
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

fixContactData();