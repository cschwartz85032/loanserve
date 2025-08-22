#!/usr/bin/env node

// Development server starter script that uses npx to ensure dependencies are available
const { spawn } = require('child_process');
const path = require('path');

console.log('Starting development server...');

// Set environment variables
const env = {
  ...process.env,
  NODE_ENV: 'development',
  NODE_PATH: path.join(__dirname, 'node_modules'),
};

// Start the server using npx tsx
const server = spawn('npx', ['tsx', 'server/index.ts'], {
  env,
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`Server exited with code ${code}`);
    process.exit(code);
  }
});

// Handle process termination
process.on('SIGINT', () => {
  server.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
  process.exit(0);
});