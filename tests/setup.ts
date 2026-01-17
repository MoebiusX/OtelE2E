/**
 * Test Setup - Global configuration for Vitest
 */
import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables for tests
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
  process.env.RABBITMQ_URL = 'amqp://test:test@localhost:5672';
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Suppress console output during tests unless DEBUG is set
if (!process.env.DEBUG) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Keep console.error for debugging test failures
}
