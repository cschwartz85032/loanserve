#!/bin/bash
# Development server startup script
export NODE_ENV=development
exec npx tsx server/index.ts