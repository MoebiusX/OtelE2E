#!/bin/bash

# OpenTelemetry Context Propagation PoC - Automated Test Runner
# This script executes the complete test plan with automated validation

set -e

BASE_URL="http://localhost:5000"
TEST_RESULTS=()
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test result tracking
log_test() {
    local test_name="$1"
    local status="$2"
    local details="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [[ "$status" == "PASS" ]]; then
        echo -e "${GREEN}✓ PASS${NC} $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAIL${NC} $test_name - $details"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    TEST_RESULTS+=("$status: $test_name - $details")
}

# Helper functions
check_server() {
    if curl -s "$BASE_URL" > /dev/null; then
        return 0
    else
        return 1
    fi
}

extract_trace_id() {
    echo "$1" | grep -o '"traceId":"[^"]*"' | cut -d'"' -f4
}

verify_span_count() {
    local trace_data="$1"
    local expected_count="$2"
    local actual_count=$(echo "$trace_data" | jq -r '.[0].spans | length' 2>/dev/null || echo "0")
    
    if [[ "$actual_count" -ge "$expected_count" ]]; then
        return 0
    else
        return 1
    fi
}

echo -e "${BLUE}OpenTelemetry Context Propagation PoC - Test Runner${NC}"
echo "============================================================"

# Phase 1: Basic Functionality Tests
echo -e "\n${YELLOW}Phase 1: Basic Functionality Tests${NC}"

# Test 1.1: Server Health Check
if check_server; then
    log_test "1.1 Server Health Check" "PASS" "Server responding"
else
    log_test "1.1 Server Health Check" "FAIL" "Server not responding at $BASE_URL"
    exit 1
fi

# Test 1.2: API Endpoints
echo "Testing API endpoints..."

# Test payments endpoint
payments_response=$(curl -s "$BASE_URL/api/payments")
if [[ "$payments_response" == "["* ]]; then
    log_test "1.2a Payments API" "PASS" "Returns array"
else
    log_test "1.2a Payments API" "FAIL" "Invalid response format"
fi

# Test traces endpoint
traces_response=$(curl -s "$BASE_URL/api/traces")
if [[ "$traces_response" == "["* ]]; then
    log_test "1.2b Traces API" "PASS" "Returns array"
else
    log_test "1.2b Traces API" "FAIL" "Invalid response format"
fi

# Phase 2: Context Propagation Tests
echo -e "\n${YELLOW}Phase 2: Context Propagation Tests${NC}"

# Test 2.1: Kong Context Injection (No Client Headers)
echo "Testing Kong context injection..."
injection_response=$(curl -s -X POST "$BASE_URL/api/payments" \
    -H "Content-Type: application/json" \
    -d '{"amount": 25000, "currency": "USD", "recipient": "kong-injection@test.com"}')

injection_trace_id=$(extract_trace_id "$injection_response")
if [[ -n "$injection_trace_id" && "$injection_trace_id" != "null" ]]; then
    log_test "2.1a Kong Context Injection" "PASS" "Trace ID generated: $injection_trace_id"
    
    # Verify Kong injection span exists
    sleep 1
    trace_data=$(curl -s "$BASE_URL/api/traces")
    if echo "$trace_data" | grep -q "Kong Context Injection"; then
        log_test "2.1b Kong Injection Span" "PASS" "Kong Context Injection span found"
    else
        log_test "2.1b Kong Injection Span" "FAIL" "Kong Context Injection span missing"
    fi
else
    log_test "2.1a Kong Context Injection" "FAIL" "No trace ID generated"
fi

# Test 2.2: Client Headers Enabled (Trace Continuation)
echo "Testing trace continuation with client headers..."
client_trace_id="client-trace-12345"
continuation_response=$(curl -s -X POST "$BASE_URL/api/payments" \
    -H "Content-Type: application/json" \
    -H "x-trace-id: $client_trace_id" \
    -H "x-span-id: client-span-67890" \
    -d '{"amount": 30000, "currency": "EUR", "recipient": "client-trace@test.com"}')

returned_trace_id=$(extract_trace_id "$continuation_response")
if [[ "$returned_trace_id" == "$client_trace_id" ]]; then
    log_test "2.2a Trace Continuation" "PASS" "Client trace ID preserved: $client_trace_id"
    
    # Verify Kong proxy span exists
    sleep 1
    trace_data=$(curl -s "$BASE_URL/api/traces")
    if echo "$trace_data" | grep -q "Kong Gateway Proxy"; then
        log_test "2.2b Kong Proxy Span" "PASS" "Kong Gateway Proxy span found"
    else
        log_test "2.2b Kong Proxy Span" "FAIL" "Kong Gateway Proxy span missing"
    fi
else
    log_test "2.2a Trace Continuation" "FAIL" "Client trace ID not preserved. Expected: $client_trace_id, Got: $returned_trace_id"
fi

# Test 2.3: Context Propagation Comparison
if [[ "$injection_trace_id" != "$client_trace_id" ]]; then
    log_test "2.3 Context Propagation Difference" "PASS" "Different trace IDs confirm different propagation modes"
else
    log_test "2.3 Context Propagation Difference" "FAIL" "Trace IDs should be different between modes"
fi

# Phase 3: Distributed Tracing Tests
echo -e "\n${YELLOW}Phase 3: Distributed Tracing Tests${NC}"

# Test 3.1: Complete Trace Flow Validation
echo "Testing complete distributed trace flow..."
flow_response=$(curl -s -X POST "$BASE_URL/api/payments" \
    -H "Content-Type: application/json" \
    -d '{"amount": 45000, "currency": "USD", "recipient": "flow-test@example.com"}')

flow_trace_id=$(extract_trace_id "$flow_response")
if [[ -n "$flow_trace_id" ]]; then
    sleep 1
    trace_data=$(curl -s "$BASE_URL/api/traces")
    
    # Verify minimum span count (HTTP + Kong + Solace)
    if verify_span_count "$trace_data" 3; then
        log_test "3.1a Complete Trace Flow" "PASS" "Minimum 3 spans found"
        
        # Check for expected span types
        if echo "$trace_data" | grep -q "POST" && \
           echo "$trace_data" | grep -q "Kong" && \
           echo "$trace_data" | grep -q "Solace"; then
            log_test "3.1b Span Types" "PASS" "HTTP, Kong, and Solace spans present"
        else
            log_test "3.1b Span Types" "FAIL" "Missing expected span types"
        fi
    else
        log_test "3.1a Complete Trace Flow" "FAIL" "Insufficient span count"
    fi
else
    log_test "3.1a Complete Trace Flow" "FAIL" "No trace generated"
fi

# Test 3.2: Solace Queue Integration
echo "Testing Solace queue integration..."
sleep 1
recent_trace=$(curl -s "$BASE_URL/api/traces")
if echo "$recent_trace" | grep -q '"messaging.system":"solace"'; then
    log_test "3.2a Solace Integration" "PASS" "Solace messaging attributes found"
    
    if echo "$recent_trace" | grep -q '"messaging.destination":"payment-queue"'; then
        log_test "3.2b Queue Destination" "PASS" "Correct queue destination"
    else
        log_test "3.2b Queue Destination" "FAIL" "Queue destination missing or incorrect"
    fi
else
    log_test "3.2a Solace Integration" "FAIL" "Solace messaging attributes missing"
fi

# Phase 4: Performance Tests
echo -e "\n${YELLOW}Phase 4: Performance Tests${NC}"

# Test 4.1: Latency Measurement
echo "Testing request latency..."
start_time=$(date +%s%N)
perf_response=$(curl -s -X POST "$BASE_URL/api/payments" \
    -H "Content-Type: application/json" \
    -d '{"amount": 15000, "currency": "USD", "recipient": "perf-test@example.com"}')
end_time=$(date +%s%N)

latency_ms=$(( (end_time - start_time) / 1000000 ))
if [[ $latency_ms -lt 100 ]]; then
    log_test "4.1 Request Latency" "PASS" "Response time: ${latency_ms}ms"
else
    log_test "4.1 Request Latency" "FAIL" "Response time too high: ${latency_ms}ms"
fi

# Test 4.2: Concurrent Requests
echo "Testing concurrent request handling..."
concurrent_pids=()
for i in {1..3}; do
    curl -s -X POST "$BASE_URL/api/payments" \
        -H "Content-Type: application/json" \
        -d "{\"amount\": $((i * 1000)), \"currency\": \"USD\", \"recipient\": \"concurrent-$i@test.com\"}" \
        > /dev/null &
    concurrent_pids+=($!)
done

# Wait for all concurrent requests
failed_concurrent=0
for pid in "${concurrent_pids[@]}"; do
    if ! wait $pid; then
        failed_concurrent=$((failed_concurrent + 1))
    fi
done

if [[ $failed_concurrent -eq 0 ]]; then
    log_test "4.2 Concurrent Requests" "PASS" "All 3 concurrent requests completed"
else
    log_test "4.2 Concurrent Requests" "FAIL" "$failed_concurrent out of 3 requests failed"
fi

# Phase 5: Error Handling Tests
echo -e "\n${YELLOW}Phase 5: Error Handling Tests${NC}"

# Test 5.1: Invalid Payment Data
echo "Testing error handling..."
error_response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/payments" \
    -H "Content-Type: application/json" \
    -d '{"amount": "invalid", "currency": "USD"}')

http_code="${error_response: -3}"
if [[ "$http_code" == "400" ]]; then
    log_test "5.1 Invalid Data Handling" "PASS" "Returned HTTP 400 for invalid data"
else
    log_test "5.1 Invalid Data Handling" "FAIL" "Expected HTTP 400, got $http_code"
fi

# Phase 6: Security Tests
echo -e "\n${YELLOW}Phase 6: Security Tests${NC}"

# Test 6.1: Malformed Headers
echo "Testing malformed header handling..."
security_response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/payments" \
    -H "x-trace-id: ../../../etc/passwd" \
    -H "x-span-id: <script>alert('xss')</script>" \
    -H "Content-Type: application/json" \
    -d '{"amount": 1000, "currency": "USD", "recipient": "security@test.com"}')

security_http_code="${security_response: -3}"
if [[ "$security_http_code" == "200" ]]; then
    security_trace_id=$(extract_trace_id "${security_response%???}")
    if [[ "$security_trace_id" =~ ^[a-f0-9]{32}$ ]]; then
        log_test "6.1 Security Headers" "PASS" "Malformed headers handled safely, valid trace ID generated"
    else
        log_test "6.1 Security Headers" "FAIL" "Invalid trace ID format: $security_trace_id"
    fi
else
    log_test "6.1 Security Headers" "FAIL" "Unexpected HTTP response: $security_http_code"
fi

# Clear test data
echo -e "\n${YELLOW}Cleanup${NC}"
clear_response=$(curl -s -X DELETE "$BASE_URL/api/clear")
if echo "$clear_response" | grep -q "success"; then
    log_test "Cleanup" "PASS" "Test data cleared"
else
    log_test "Cleanup" "FAIL" "Failed to clear test data"
fi

# Final Results
echo -e "\n${BLUE}Test Results Summary${NC}"
echo "============================================================"
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"

if [[ $FAILED_TESTS -eq 0 ]]; then
    echo -e "\n${GREEN}All tests passed! OpenTelemetry PoC is working correctly.${NC}"
    exit 0
else
    echo -e "\n${RED}Some tests failed. Please review the results above.${NC}"
    echo -e "\nFailed tests:"
    for result in "${TEST_RESULTS[@]}"; do
        if [[ "$result" == "FAIL:"* ]]; then
            echo -e "${RED}  $result${NC}"
        fi
    done
    exit 1
fi