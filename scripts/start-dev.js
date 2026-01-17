
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

console.log('🚀 Starting Krystaline Exchange Development Environment...');

async function checkDocker() {
    try {
        execSync('docker info', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

async function startDockerServices() {
    console.log('📦 Starting Docker services (Kong, RabbitMQ, Jaeger, OTEL Collector)...');
    // Use the main docker-compose.yml file
    const child = spawn('docker-compose', ['up', '-d'], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: true
    });

    return new Promise((resolve, reject) => {
        child.on('exit', (code) => {
            if (code === 0) {
                console.log('✅ Docker services started');
                resolve();
            } else {
                reject(new Error('Failed to start Docker services'));
            }
        });
    });
}

async function waitForServices() {
    console.log('⏳ Waiting for services to be ready...');

    // Wait for Kong
    for (let i = 0; i < 30; i++) {
        try {
            execSync('curl -s http://localhost:8001/status', { stdio: 'ignore' });
            console.log('   ✅ Kong Gateway ready');
            break;
        } catch (e) {
            if (i === 29) console.log('   ⚠️  Kong Gateway not responding (may still be starting)');
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // Wait for RabbitMQ
    for (let i = 0; i < 30; i++) {
        try {
            execSync('curl -s http://localhost:15672', { stdio: 'ignore' });
            console.log('   ✅ RabbitMQ ready');
            break;
        } catch (e) {
            if (i === 29) console.log('   ⚠️  RabbitMQ not responding');
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

function startProcess(name, cmd, args, color) {
    const child = spawn(cmd, args, {
        cwd: rootDir,
        shell: true,
        env: { ...process.env, NODE_ENV: 'development', FORCE_COLOR: '1' }
    });

    child.stdout?.on('data', (data) => {
        process.stdout.write(`${color}[${name}]${'\x1b[0m'} ${data}`);
    });

    child.stderr?.on('data', (data) => {
        process.stderr.write(`${color}[${name}]${'\x1b[0m'} ${data}`);
    });

    return child;
}

async function main() {
    // Check Docker
    const dockerUp = await checkDocker();
    if (!dockerUp) {
        console.error('❌ Docker is not running. Please start Docker and try again.');
        process.exit(1);
    }

    // Start Docker services
    try {
        await startDockerServices();
        await waitForServices();
    } catch (e) {
        console.error('❌ Failed to start Docker services:', e.message);
        process.exit(1);
    }

    console.log('\n🚀 Starting application components...\n');

    // Start all components
    const processes = [];

    // Server (payment-api)
    processes.push(startProcess('SERVER', npmCmd, ['run', 'dev:server'], '\x1b[36m'));

    // Wait a bit for server to start before processor
    await new Promise(r => setTimeout(r, 3000));

    // Payment Processor
    processes.push(startProcess('PROCESSOR', npxCmd, ['tsx', 'payment-processor/index.ts'], '\x1b[33m'));

    // Wait a bit more
    await new Promise(r => setTimeout(r, 2000));

    // Vite frontend
    processes.push(startProcess('VITE', npxCmd, ['vite', '--host'], '\x1b[35m'));

    console.log('\n✨ All components starting! Open http://localhost:5173\n');
    console.log('   📊 Jaeger UI: http://localhost:16686');
    console.log('   🐰 RabbitMQ: http://localhost:15672');
    console.log('   🦍 Kong Admin: http://localhost:8001\n');

    // Handle cleanup on exit
    const cleanup = () => {
        console.log('\n🛑 Shutting down...');
        processes.forEach(p => {
            try { p.kill(); } catch (e) { }
        });
        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

main().catch(console.error);
