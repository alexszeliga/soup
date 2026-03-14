import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigLoader } from '../Config.js';
import path from 'path';

describe('ConfigLoader', () => {
  const dummyEnvPath = path.resolve(__dirname, 'non-existent.env');

  beforeEach(() => {
    // Reset singleton internal state for tests
    (ConfigLoader as any).instance = undefined;
    vi.resetModules();
    
    // Clear relevant environment variables from process.env
    delete process.env.PORT;
    delete process.env.DEV_API_PORT;
    delete process.env.SOUP_PORT;
    delete process.env.NODE_ENV;
    delete process.env.TMDB_API_KEY;
    delete process.env.QB_URL;
  });

  it('should load default values for PORT and NODE_ENV', () => {
    // We need to provide a fake API KEY because it's required by the schema
    process.env.TMDB_API_KEY = 'fake-key';

    // Point to a non-existent file so it doesn't load the real .env
    const config = ConfigLoader.load(dummyEnvPath);

    expect(config.PORT).toBe(3001);
    expect(config.NODE_ENV).toBe('development');
  });

  it('should fallback to DEV_API_PORT or SOUP_PORT if PORT is missing', () => {
    process.env.TMDB_API_KEY = 'fake-key';

    // Reset singleton internal state for first check
    (ConfigLoader as any).instance = undefined;
    process.env.DEV_API_PORT = '3002';
    let config = ConfigLoader.load(dummyEnvPath);
    expect(config.PORT).toBe(3002);

    // Reset singleton internal state for second check
    (ConfigLoader as any).instance = undefined;
    delete process.env.DEV_API_PORT;
    process.env.SOUP_PORT = '3003';
    config = ConfigLoader.load(dummyEnvPath);
    expect(config.PORT).toBe(3003);

    // Cleanup
    delete process.env.SOUP_PORT;
  });

  it('should throw an error if TMDB_API_KEY is missing', () => {
    // Point to a non-existent file so it doesn't load the real .env
    expect(() => ConfigLoader.load(dummyEnvPath)).toThrow('Invalid environment variables');
  });

  it('should preserve singleton instance once loaded', () => {
    process.env.TMDB_API_KEY = 'first-key';
    const config1 = ConfigLoader.load(dummyEnvPath);

    process.env.TMDB_API_KEY = 'second-key';
    const config2 = ConfigLoader.load(dummyEnvPath);

    // Should return the same object and NOT see the second key change
    expect(config1).toBe(config2);
    expect(config2.TMDB_API_KEY).toBe('first-key');
  });
});
