#!/bin/bash
# Orchestration script for EWO-014.19A.1 browser tests
# Uses the dedicated Engineering Browser Test account (no Product Owner credentials)
set -e

SHOTS_DIR="/tmp/ewo014_19a1-screenshots"

echo "=== EWO-014.19A.1 Browser Test Orchestration ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Using dedicated Engineering Browser Test account"

# Start the Playwright regression suite
echo "Starting Playwright regression suite..."
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers npx tsx scripts/ewo014_19a1-regression.ts 2>&1 | tee /tmp/pw-test-output.log
EXIT_CODE=$?

echo ""
echo "=== Test Output ==="

exit $EXIT_CODE
