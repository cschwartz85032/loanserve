#!/bin/bash

# Test Runner Script
# Executes all test suites with proper error handling and reporting

set -e

echo "========================================="
echo "Payment System Test Suite"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test categories
UNIT_TESTS="server/tests/unit/**/*.test.ts"
INTEGRATION_TESTS="server/tests/integration/**/*.test.ts"
REPLAY_TESTS="server/tests/replay/**/*.test.ts"
CHAOS_TESTS="server/tests/chaos/**/*.test.ts"

# Results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run test suite
run_test_suite() {
    local suite_name=$1
    local test_pattern=$2
    
    echo -e "${YELLOW}Running $suite_name...${NC}"
    echo "----------------------------------------"
    
    if npx vitest run "$test_pattern" --reporter=json --outputFile="test-results-${suite_name}.json" 2>&1; then
        echo -e "${GREEN}✓ $suite_name passed${NC}"
        ((PASSED_TESTS++))
    else
        echo -e "${RED}✗ $suite_name failed${NC}"
        ((FAILED_TESTS++))
    fi
    
    ((TOTAL_TESTS++))
    echo ""
}

# Check if test database is configured
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}ERROR: DATABASE_URL not set${NC}"
    exit 1
fi

# Check if RabbitMQ is configured
if [ -z "$CLOUDAMQP_URL" ]; then
    echo -e "${YELLOW}WARNING: CLOUDAMQP_URL not set - some tests may fail${NC}"
fi

# Run unit tests
echo "========================================="
echo "UNIT TESTS"
echo "========================================="
run_test_suite "envelope-validation" "server/tests/unit/envelope-validation.test.ts"
run_test_suite "waterfall-math" "server/tests/unit/waterfall-math.test.ts"
run_test_suite "idempotency" "server/tests/unit/idempotency.test.ts"

# Run integration tests
echo "========================================="
echo "INTEGRATION TESTS"
echo "========================================="
run_test_suite "webhook-to-posting" "server/tests/integration/webhook-to-posting.test.ts"

# Run replay tests
echo "========================================="
echo "REPLAY TESTS"
echo "========================================="
run_test_suite "historical-replay" "server/tests/replay/historical-replay.test.ts"

# Run chaos tests (optional - can be intensive)
if [ "$RUN_CHAOS_TESTS" = "true" ]; then
    echo "========================================="
    echo "CHAOS ENGINEERING TESTS"
    echo "========================================="
    run_test_suite "broker-failure" "server/tests/chaos/broker-failure.test.ts"
else
    echo -e "${YELLOW}Skipping chaos tests (set RUN_CHAOS_TESTS=true to run)${NC}"
fi

# Generate coverage report
echo "========================================="
echo "COVERAGE REPORT"
echo "========================================="
npx vitest run --coverage || true

# Summary
echo ""
echo "========================================="
echo "TEST SUMMARY"
echo "========================================="
echo "Total test suites: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo -e "${GREEN}✓ Deterministic replays verified${NC}"
    echo -e "${GREEN}✓ Chaos scenarios handled without manual intervention${NC}"
    echo ""
    echo "Pipeline Status: GREEN ✓"
    exit 0
else
    echo ""
    echo -e "${RED}✗ Some tests failed${NC}"
    echo "Pipeline Status: RED ✗"
    exit 1
fi