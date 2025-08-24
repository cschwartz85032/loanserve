#!/usr/bin/env node

/**
 * Test the invitation system
 */

const fetch = require('node-fetch');

const API_URL = 'http://localhost:5000';

async function testInvitation(username, password) {
  console.log('🔐 Testing invitation system...\n');
  
  try {
    // Step 1: Login
    console.log(`1. Logging in as ${username}...`);
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: username,
        password: password
      })
    });
    
    const loginData = await loginRes.json();
    
    if (!loginRes.ok) {
      console.log('❌ Login failed:', loginData.error);
      return;
    }
    
    console.log('✅ Login successful');
    
    // Extract cookies for session
    const cookies = loginRes.headers.raw()['set-cookie'];
    const cookieHeader = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';
    
    // Step 2: Test invitation endpoint
    console.log('\n2. Testing invitation endpoint...');
    const inviteRes = await fetch(`${API_URL}/api/admin/users/bulk-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        invitations: [{
          email: 'test-invite@example.com',
          roleId: 'borrower' // Will be handled as role name
        }]
      })
    });
    
    const inviteData = await inviteRes.json();
    
    if (!inviteRes.ok) {
      console.log('❌ Invitation failed:', inviteData);
      
      // If it's an auth error, it might be because the user doesn't have admin role
      if (inviteRes.status === 403) {
        console.log('\nℹ️  User needs admin role to send invitations');
      }
    } else {
      console.log('✅ Invitation response:', inviteData);
      
      if (inviteData.summary) {
        console.log(`\n📊 Summary:`);
        console.log(`   Total: ${inviteData.summary.total}`);
        console.log(`   Successful: ${inviteData.summary.successful}`);
        console.log(`   Failed: ${inviteData.summary.failed}`);
      }
      
      if (inviteData.errors && inviteData.errors.length > 0) {
        console.log('\n⚠️  Errors:');
        inviteData.errors.forEach(err => {
          console.log(`   - ${err.email}: ${err.error}`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Get credentials from command line or use defaults
const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'Admin123!';

console.log('Testing with user:', username);
console.log('-------------------\n');

testInvitation(username, password).then(() => {
  console.log('\n✅ Test complete');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});