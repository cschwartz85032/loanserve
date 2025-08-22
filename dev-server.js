#!/usr/bin/env node
// Workaround script to start the development server
const { spawn } = require('child_process');

console.log('Starting development server with npx tsx...');

const child = spawn('npx', ['tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' }
});

child.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code);
});