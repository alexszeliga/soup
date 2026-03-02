import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('CLI Entry Point', () => {
  it('should display help information', () => {
    const cliPath = path.resolve(process.cwd(), 'dist/index.js');
    const output = execSync(`TMDB_API_KEY=fake node --no-warnings ${cliPath} --help`).toString();
    
    expect(output).toContain('Usage: soup [options] [command]');
    expect(output).toContain('list');
    expect(output).toContain('show');
  });
});
