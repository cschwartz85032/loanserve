// Simple script to check what production is actually configured with
const https = require('https');

const testData = JSON.stringify({
  username: 'loanatik',
  password: 'loanatik'
});

const options = {
  hostname: 'readysetclose.com',
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': testData.length
  }
};

const req = https.request(options, (res) => {
  console.log('Login status:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Response:', data.substring(0, 100));
    
    // Check session cookie
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      console.log('\nSession cookie received:', setCookie[0].substring(0, 50));
      console.log('Cookie attributes:', setCookie[0].includes('Secure'), setCookie[0].includes('HttpOnly'));
    } else {
      console.log('\nNO SESSION COOKIE RECEIVED');
    }
  });
});

req.write(testData);
req.end();
