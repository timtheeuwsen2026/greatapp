#!/bin/bash

# Venue Module Test Runner
# This script runs the comprehensive test suite for the Venue Module

set -e

echo "🧪 Running Venue Module Test Suite..."
echo "======================================"
echo ""

# Run tests with coverage
echo "📊 Running tests with coverage..."
npx vitest run --coverage

echo ""
echo "✅ Test suite completed!"
echo ""
echo "📈 Coverage report generated in coverage/ directory"
echo "🌐 View HTML report: open coverage/index.html"
