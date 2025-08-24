#!/usr/bin/env node
// Temporary bypass to start the development server
const { spawn } = require('child_process');

console.log('Starting development server (bypassing vite requirement)...');

// Set environment variables
process.env.NODE_ENV = 'development';

// Start the server with npx tsx which works
const server = spawn('npx', ['--yes', 'tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: process.env
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  server.kill('SIGINT');
  process.exit(0);
});