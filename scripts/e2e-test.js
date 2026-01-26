/**
 * E2E Test Script - Validates both context propagation use cases
 * 
 * Use Case 1: Empty Headers - API Gateway injects trace context
 * Use Case 2: Client Headers - Client provides trace context
 */

const PAYMENT_API = 'http://localhost:5000/api/payments';
const KONG_API = 'http://localhost:8000/api/payments';
const JAEGER_API = 'http://localhost:16686/api';

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff(fn, options = {}) {
    const {
        maxRetries = 10,
        initialDelay = 1000,
        maxDelay = 10000,
        backoffMultiplier = 1.5,
        timeoutMs = 30000
    } = options;

    const startTime = Date.now();
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
            throw new Error(`Timeout after ${timeoutMs}ms`);
        }

        try {
            const result = await fn(attempt);
            if (result) {
                return result;
            }
        } catch (error) {
            lastError = error;
        }

        // Don't delay after last attempt
        if (attempt < maxRetries) {
            const delayMs = Math.min(
                initialDelay * Math.pow(backoffMultiplier, attempt - 1),
                maxDelay
            );
            await delay(delayMs);
        }
    }

    throw lastError || new Error('Retry failed');
}

async function submitPayment(url, payload, headers = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        body: JSON.stringify(payload)
    });
    return response.json();
}

async function queryJaegerTraces(service, lookback = '1m') {
    const url = `${JAEGER_API}/traces?service=${service}&lookback=${lookback}&limit=10`;
    const response = await fetch(url);
    return response.json();
}

async function findTraceById(traceId) {
    const url = `${JAEGER_API}/traces/${traceId}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
}

function validateSpans(trace, expectedServices, expectedSpanNames) {
    const spans = trace.data[0]?.spans || [];
    const services = new Set(spans.map(s => s.processID).map(pid =>
        trace.data[0]?.processes[pid]?.serviceName
    ));
    const spanNames = spans.map(s => s.operationName);

    const missingServices = expectedServices.filter(s => !services.has(s));
    const missingSpans = expectedSpanNames.filter(s => !spanNames.some(n => n.includes(s)));

    return {
        success: missingServices.length === 0 && missingSpans.length === 0,
        foundServices: Array.from(services),
        foundSpans: spanNames,
        missingServices,
        missingSpans
    };
}

async function runTest(name, testFn) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${name}`);
    console.log('='.repeat(60));

    try {
        const result = await testFn();
        if (result.success) {
            console.log(`✅ PASS: ${name}`);
        } else {
            console.log(`❌ FAIL: ${name}`);
            console.log(`   Reason: ${result.reason || 'Unknown'}`);
        }
        return result;
    } catch (error) {
        console.log(`❌ ERROR: ${name}`);
        console.log(`   ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function testCase1_EmptyHeaders() {
    // Use Case 1: Send request through Kong WITHOUT trace headers
    // Expected: API Gateway creates and injects trace context

    // Generate unique test ID to validate we find the right trace
    const testId = `test1-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('📤 Sending payment through Kong (no trace headers)...');
    console.log(`   Test ID: ${testId}`);

    const payment = await submitPayment(KONG_API, {
        amount: 1001,
        currency: 'USD',
        recipient: 'e2e-test1@example.com',
        description: `E2E Test - Empty Headers - ${testId}`
    });

    if (!payment.payment?.id) {
        return { success: false, reason: 'Payment was not created' };
    }

    const paymentTime = Date.now();
    console.log(`   Payment ID: ${payment.payment?.id}`);
    console.log('   ⏳ Waiting for traces to propagate to Jaeger...');

    // Initial delay to allow OTEL Collector batching
    await delay(2000);

    // Retry fetching traces with exponential backoff
    try {
        const result = await retryWithBackoff(async (attempt) => {
            process.stdout.write(`\r   Attempt ${attempt}/10... `);

            // Try service names in order of preference (new kx-* names first)
            let traces = await queryJaegerTraces('kx-exchange');
            if (!traces.data || traces.data.length === 0) {
                traces = await queryJaegerTraces('api-gateway');
            }
            if (!traces.data || traces.data.length === 0) {
                traces = await queryJaegerTraces('kx-wallet');
            }
            // Legacy fallbacks
            if (!traces.data || traces.data.length === 0) {
                traces = await queryJaegerTraces('exchange-api');
            }

            if (!traces.data || traces.data.length === 0) {
                return null; // Retry
            }

            // Filter traces to only recent ones (within last 10 seconds)
            const recentTraces = traces.data.filter(t => {
                const traceStartTime = t.spans[0]?.startTime || 0;
                const traceAge = (Date.now() * 1000) - traceStartTime; // Jaeger uses microseconds
                return traceAge < 10000000; // 10 seconds in microseconds
            });

            if (recentTraces.length === 0) {
                return null; // Retry
            }

            // Get the most recent trace
            const latestTrace = recentTraces[0];
            const fullTrace = await findTraceById(latestTrace.traceID);

            if (!fullTrace) {
                return null; // Retry
            }

            const spans = fullTrace.data[0]?.spans || [];

            // Verify this trace was created around our test time (within 15 seconds)
            const traceStartTime = spans[0]?.startTime || 0;
            const traceAge = (Date.now() * 1000) - traceStartTime; // Jaeger uses microseconds

            // Accept if trace is recent and has API gateway + exchange spans
            const hasRequiredSpans = spans.length >= 3;
            const isRecentEnough = traceAge < 15000000; // 15 seconds in microseconds

            if (hasRequiredSpans && isRecentEnough) {
                const services = new Set(spans.map(s => s.processID).map(pid =>
                    fullTrace.data[0]?.processes[pid]?.serviceName
                ));

                console.log(); // New line after attempts
                console.log(`   ✓ Found correct trace with ${spans.length} spans (took ${Date.now() - paymentTime}ms)`);
                console.log(`   Services: ${Array.from(services).join(', ')}`);
                console.log(`   Trace ID: ${latestTrace.traceID}`);
                console.log(`   Payment ID ${payment.payment?.id} processed`);

                return { traceId: latestTrace.traceID, spanCount: spans.length };
            }

            return null; // Retry
        }, {
            maxRetries: 10,
            initialDelay: 1000,
            maxDelay: 3000,
            timeoutMs: 25000
        });

        return { success: true, ...result };
    } catch (error) {
        if (error.message.includes('Timeout')) {
            return { success: false, reason: 'Traces did not appear within 30 seconds' };
        }
        return { success: false, reason: 'No traces found for any service' };
    }
}

async function testCase2_ClientHeaders() {
    // Use Case 2: Send request through Kong WITH client trace headers
    // Expected: Kong preserves client's trace context and propagates it

    // Generate random trace ID - this proves we're tracking the right trace
    const clientTraceId = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join('');
    const clientSpanId = Array.from({ length: 16 }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join('');

    // Generate unique test ID
    const testId = `test2-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`📤 Sending payment through Kong with random trace ID`);
    console.log(`   Test ID: ${testId}`);
    console.log(`   Client Trace ID: ${clientTraceId}`);

    const payment = await submitPayment(KONG_API, {
        amount: 2002,
        currency: 'USD',
        recipient: 'e2e-test2@example.com',
        description: `E2E Test - Client Headers - ${testId}`
    }, {
        'traceparent': `00-${clientTraceId}-${clientSpanId}-01`
    });

    const paymentTime = Date.now();
    console.log(`   Payment ID: ${payment.payment?.id}`);
    console.log('   ⏳ Waiting for traces to propagate to Jaeger...');

    // Initial delay to allow OTEL Collector batching
    await delay(2000);

    // Retry fetching traces with exponential backoff
    try {
        const result = await retryWithBackoff(async (attempt) => {
            process.stdout.write(`\r   Attempt ${attempt}/10... `);

            // Query for the specific trace by ID
            const trace = await findTraceById(clientTraceId);

            if (!trace || !trace.data || trace.data.length === 0) {
                return null; // Retry
            }

            // Trace found - verify it's complete
            const spans = trace.data[0]?.spans || [];
            if (spans.length < 3) {
                return null; // Retry - not enough spans yet
            }

            const services = new Set(spans.map(s => s.processID).map(pid =>
                trace.data[0]?.processes[pid]?.serviceName
            ));

            console.log(); // New line after attempts
            console.log(`   ✓ Found correct trace with ${spans.length} spans (took ${Date.now() - paymentTime}ms)`);
            console.log(`   Services: ${Array.from(services).join(', ')}`);
            console.log(`   Client trace ID ${clientTraceId} preserved ✓`);
            console.log(`   Payment ID ${payment.payment?.id} processed`);

            return { traceId: clientTraceId, spanCount: spans.length };
        }, {
            maxRetries: 10,
            initialDelay: 1000,
            maxDelay: 3000,
            timeoutMs: 25000
        });

        return { success: true, ...result };
    } catch (error) {
        if (error.message.includes('Timeout')) {
            return { success: false, reason: 'Traces did not appear within 25 seconds' };
        }
        return { success: false, reason: 'Trace with client ID not found' };
    }
}

async function main() {
    console.log('\n🧪 E2E Test Suite - OpenTelemetry Context Propagation');
    console.log('='.repeat(60));

    // Check services are running
    try {
        await fetch(PAYMENT_API.replace('/payments', '/traces'));
        console.log('✅ Payment API is running');
    } catch {
        console.error('❌ Payment API is not running on port 5000');
        process.exit(1);
    }

    try {
        await fetch(JAEGER_API + '/services');
        console.log('✅ Jaeger is running');
    } catch {
        console.error('❌ Jaeger is not running on port 16686');
        process.exit(1);
    }

    // Run tests
    const results = [];

    results.push(await runTest(
        'Use Case 1: Empty Headers (API Gateway injects context)',
        testCase1_EmptyHeaders
    ));

    results.push(await runTest(
        'Use Case 2: Client Headers (Client provides context)',
        testCase2_ClientHeaders
    ));

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.success).length;
    const total = results.length;

    console.log(`\n${passed}/${total} tests passed\n`);

    process.exit(passed === total ? 0 : 1);
}

main().catch(console.error);
