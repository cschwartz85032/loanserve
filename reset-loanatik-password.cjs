// Reset password for loanatik user
const { neon } = require('@neondatabase/serverless');
const argon2 = require('argon2');

async function resetPassword() {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    // Hash the new password
    const newPassword = 'admin123';
    const hashedPassword = await argon2.hash(newPassword);
    
    // Update the password
    const result = await sql`
      UPDATE users 
      SET password = ${hashedPassword}
      WHERE username = 'loanatik'
      RETURNING id, username, email
    `;
    
    if (result.length > 0) {
      console.log('Password reset successfully for user:', result[0]);
      console.log('New password: admin123');
    } else {
      console.log('User not found');
    }
  } catch (error) {
    console.error('Error resetting password:', error);
  }
}

resetPassword();