#!/bin/bash

# Quick test to verify testing framework is working
echo "========================================="
echo "Payment System Test Framework Verification"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Running sample unit test to verify framework..."
echo ""

# Run a simple test
npx vitest run server/tests/unit/waterfall-math.test.ts --reporter=verbose

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Test framework is working!${NC}"
    echo ""
    echo "To run all tests, use:"
    echo "  npm run test:all"
    echo ""
    echo "To run specific test suites:"
    echo "  npm run test:unit"
    echo "  npm run test:integration"
    echo "  npm run test:replay"
    echo "  npm run test:chaos"
    echo ""
else
    echo ""
    echo -e "${YELLOW}⚠️  Test framework needs configuration${NC}"
    echo "Please check that Vitest is installed and configured correctly"
fi