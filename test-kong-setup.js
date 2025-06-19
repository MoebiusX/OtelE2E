#!/usr/bin/env node

// Test Kong Gateway setup and create payment API service
const fetch = require('node-fetch');

async function setupKong() {
  const KONG_ADMIN_URL = 'http://localhost:8001';
  
  console.log('[KONG] Testing Kong Gateway setup...');
  
  try {
    // Test Kong status
    const statusResponse = await fetch(`${KONG_ADMIN_URL}/status`);
    if (!statusResponse.ok) {
      console.error('[KONG] Kong Gateway not available');
      return false;
    }
    
    console.log('[KONG] Kong Gateway is available');
    
    // Create payment-api service
    const serviceData = new URLSearchParams({
      name: 'payment-api',
      url: 'http://host.docker.internal:5000'
    });
    
    let response = await fetch(`${KONG_ADMIN_URL}/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: serviceData
    });
    
    if (response.status === 409) {
      console.log('[KONG] Service payment-api already exists');
    } else if (response.ok) {
      console.log('[KONG] Service payment-api created successfully');
    } else {
      console.error('[KONG] Failed to create service:', await response.text());
      return false;
    }
    
    // Create route for payment service
    const routeData = new URLSearchParams({
      'paths[]': '/api',
      strip_path: 'false',
      preserve_host: 'false'
    });
    
    response = await fetch(`${KONG_ADMIN_URL}/services/payment-api/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: routeData
    });
    
    if (response.status === 409) {
      console.log('[KONG] Route already exists');
    } else if (response.ok) {
      console.log('[KONG] Route created successfully');
    } else {
      console.error('[KONG] Failed to create route:', await response.text());
      return false;
    }
    
    // Test the Kong Gateway routing
    console.log('\n[TEST] Testing Kong Gateway routing...');
    const testPayment = {
      amount: 9999,
      currency: 'USD',
      recipient: 'kong-test@example.com',
      description: 'Kong Gateway Configuration Test'
    };
    
    const testResponse = await fetch('http://localhost:8000/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayment)
    });
    
    if (testResponse.ok) {
      const result = await testResponse.json();
      console.log('[TEST] Kong Gateway routing successful!');
      console.log('[TEST] Payment created via Kong:', result.payment?.id);
      return true;
    } else {
      console.error('[TEST] Kong Gateway routing failed:', await testResponse.text());
      return false;
    }
    
  } catch (error) {
    console.error('[KONG] Setup failed:', error.message);
    return false;
  }
}

// Run the setup
setupKong().then(success => {
  if (success) {
    console.log('\n✅ Kong Gateway setup complete!');
    console.log('Now you can route payments through Kong to see Kong spans in traces.');
    console.log('Use: curl -X POST http://localhost:8000/api/payments ...');
  } else {
    console.log('\n❌ Kong Gateway setup failed');
  }
  process.exit(success ? 0 : 1);
});