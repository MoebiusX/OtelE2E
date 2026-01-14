
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const dockerComposeCmd = 'docker-compose';

// Parse args
const args = process.argv.slice(2);

console.log('🚀 Starting OtelE2E Development Environment...');

async function checkDocker() {
    try {
        execSync('docker info', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

async function startExternalServices() {
    console.log('📦 Starting external services (Kong, RabbitMQ, Jaeger)...');
    const composeFile = path.join(rootDir, 'docker-compose.external.yml');

    const child = spawn(dockerComposeCmd, ['-f', composeFile, 'up', '-d'], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: true
    });

    return new Promise((resolve, reject) => {
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error('Failed to start external services'));
        });
    });
}

async function startApp() {
    console.log('✨ Starting Application (Server + Vite)...');
    const child = spawn(npmCmd, ['run', 'dev'], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, NODE_ENV: 'development' }
    });

    // Handle cleanup
    process.on('SIGINT', () => {
        child.kill();
        process.exit();
    });
}

async function main() {
    const dockerUp = await checkDocker();
    if (!dockerUp) {
        console.error('❌ Docker is not running or not accessible.');
        console.error('   This application requires Docker for Kong, RabbitMQ, and Jaeger.');
        console.error('   Please start Docker and try again.');
        process.exit(1);
    }

    try {
        await startExternalServices();
    } catch (e) {
        console.error('❌ Failed to start external services. Please check docker outputs.');
        process.exit(1);
    }

    await startApp();
}

main().catch(console.error);
