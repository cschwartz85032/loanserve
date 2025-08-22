#!/bin/bash
# LoanServe Pro Server Runner

cd /home/runner/workspace

echo "Starting LoanServe Pro server..."
echo "================================"

# Run the server
NODE_ENV=development exec npx tsx server/index.ts