import '@testing-library/jest-dom';
import { vi } from 'vitest';

/**
 * Silent Console in Tests
 * Prevents expected error/warn chatter from polluting the test output.
 * If you need to debug a specific test, use console.info or comment this out.
 */
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
