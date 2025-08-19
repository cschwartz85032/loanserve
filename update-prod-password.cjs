// Production Password Update Script
// This script will update the loanatik user password to "loanatik" in production
// 
// IMPORTANT: Run this script in the Replit Shell with your production database connected
// 
// To run this script:
// 1. Open the Replit Shell
// 2. Make sure you're connected to the production database
// 3. Run: node update-prod-password.js

const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}

async function updatePassword() {
  const newPassword = "loanatik";
  const hashedPassword = await hashPassword(newPassword);
  
  console.log("\n=================================");
  console.log("Production Password Update");
  console.log("=================================");
  console.log("\nTo update the password in production, run this SQL query in your production database:");
  console.log("\n--- SQL QUERY START ---");
  console.log(`UPDATE users SET password = '${hashedPassword}' WHERE username = 'loanatik';`);
  console.log("--- SQL QUERY END ---");
  console.log("\nAfter running this query:");
  console.log("- Username: loanatik");
  console.log("- Password: loanatik");
  console.log("\n=================================\n");
}

updatePassword().catch(console.error);