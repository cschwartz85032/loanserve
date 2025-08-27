#!/bin/bash
# RabbitMQ Queue Migration Tool

echo "🔧 RabbitMQ Queue Migration Tool"
echo "================================"
echo ""

# Run the migration script
tsx server/scripts/migrate-queues.ts "$@"