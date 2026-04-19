/// <reference types="vitest/globals" />

declare global {
  const fetch: typeof import('node-fetch');
  const global: typeof globalThis;
}

export {};
