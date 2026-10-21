import { describe, it, expect } from 'vitest';
import { classifyTrackerError, trackerSeverityText } from './trackerHealth.js';

describe('classifyTrackerError', () => {
  it('returns ok when there is no error', () => {
    expect(classifyTrackerError(undefined)).toBe('ok');
    expect(classifyTrackerError('')).toBe('ok');
  });

  it('classifies the escalation message as unreachable', () => {
    expect(
      classifyTrackerError('UNREACHABLE — all announce tiers dead (3 consecutive sweeps). Re-upload the .torrent from the tracker to fix.'),
    ).toBe('unreachable');
  });

  it('classifies the immediate "tiers dead" note as unreachable', () => {
    expect(classifyTrackerError('all announce tiers dead (1 probe) — tracker may be unreachable')).toBe('unreachable');
  });

  it('classifies a TLS/certificate failure as certificate', () => {
    expect(classifyTrackerError('Get "https://tracker/announce": x509: certificate signed by unknown authority')).toBe('certificate');
    expect(classifyTrackerError('tls: failed to verify certificate')).toBe('certificate');
  });

  it('falls back to issue for other tracker failures', () => {
    expect(classifyTrackerError('tracker announce failed: 502 Bad Gateway (tracker: https://x/announce)')).toBe('issue');
  });

  it('returns an empty summary for ok', () => {
    expect(trackerSeverityText('ok')).toBe('');
  });

  it('returns action text for the severe severities', () => {
    expect(trackerSeverityText('unreachable')).toContain('Re-upload');
    expect(trackerSeverityText('certificate')).toContain('certificate');
  });
});
