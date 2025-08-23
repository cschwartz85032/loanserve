#!/bin/bash

# Run Queue Infrastructure Tests
# This script executes the comprehensive queue testing suite

echo "🚀 Starting Queue Infrastructure Tests..."
echo "=================================="
echo ""
echo "This will test:"
echo "  ✓ RabbitMQ connections and topology"
echo "  ✓ Message publishing and routing"
echo "  ✓ Payment processing flows (ACH, Wire, Check, Lockbox)"
echo "  ✓ Error handling and dead letter queues"
echo "  ✓ Daily servicing cycles"
echo "  ✓ Settlement and reconciliation"
echo "  ✓ Compliance and AML screening"
echo "  ✓ Load testing (1000 messages)"
echo ""
echo "=================================="
echo ""

# Check if tsx is available
if ! command -v tsx &> /dev/null; then
    echo "❌ tsx not found. Installing..."
    npm install -g tsx
fi

# Run the test suite
tsx scripts/test-queue-infrastructure.ts

echo ""
echo "Test complete! Check the Queue Monitor to see the activity."