#!/bin/bash
# Wrapper script to run the development server with proper paths
export NODE_ENV=development
exec npx tsx server/index.ts