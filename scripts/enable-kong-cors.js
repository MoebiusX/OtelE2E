
async function enableCors() {
    const KONG_ADMIN_URL = 'http://localhost:8001';
    console.log('🌍 Enabling CORS on Kong Gateway...');

    // 1. Check if plugin exists
    try {
        const getRes = await fetch(`${KONG_ADMIN_URL}/plugins`);
        const plugins = await getRes.json();
        const existing = plugins.data && plugins.data.find(p => p.name === 'cors');

        const payload = {
            name: 'cors',
            config: {
                origins: ['*'],
                methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
                headers: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'x-trace-id', 'x-span-id', 'traceparent'],
                exposed_headers: ['x-trace-id', 'x-span-id'],
                credentials: true,
                max_age: 3600
            }
        };

        let res;
        if (existing) {
            console.log(`🔄 Updating existing CORS plugin (ID: ${existing.id})...`);
            res = await fetch(`${KONG_ADMIN_URL}/plugins/${existing.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            console.log('✨ Creating new CORS plugin...');
            res = await fetch(`${KONG_ADMIN_URL}/plugins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (res.status === 201 || res.status === 200) {
            console.log('✅ CORS enabled successfully on Kong.');
        } else {
            const text = await res.text();
            console.error(`❌ Failed to enable CORS: ${res.status} ${text}`);
            process.exit(1);
        }

    } catch (e) {
        console.error('❌ Error connecting to Kong Admin API:', e.message);
        process.exit(1);
    }
}

enableCors();
