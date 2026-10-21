/**
 * Tracker-health helpers for the UI.
 *
 * The Go tracker-health watchdog writes a human-readable message into a
 * torrent's `trackerError` field (surfaced via the WebSocket sync + the
 * `/api/torrents` DTO). Rather than render that raw string, we classify it into
 * a severity so the UI can colour-code "check the tracker" (amber) vs.
 * "tracker is gone — re-upload" (red) vs. a transient blip (neutral).
 *
 * The classifier is deliberately tolerant: it looks for the same keywords the
 * backend uses, and anything that does not obviously match the severe buckets
 * falls back to a neutral "issue" (still visible, never hidden).
 */

export type TrackerSeverity = 'unreachable' | 'certificate' | 'issue' | 'ok';

/**
 * Classify a raw tracker-error message into a severity. An empty/absent message
 * means the tracker is healthy ('ok').
 */
export function classifyTrackerError(trackerError?: string): TrackerSeverity {
  if (!trackerError) return 'ok';
  const s = trackerError.toLowerCase();
  if (s.includes('unreachable') || s.includes('all announce tiers dead')) {
    return 'unreachable';
  }
  if (s.includes('certificate') || s.includes('x509') || s.includes('tls')) {
    return 'certificate';
  }
  return 'issue';
}

/** A human-facing action/summary line for each severity (for the detail banner). */
export function trackerSeverityText(severity: TrackerSeverity): string {
  switch (severity) {
    case 'unreachable':
      return 'Tracker unreachable — all announce tiers are dead. Re-upload the .torrent from the tracker, or point it at a working tracker.';
    case 'certificate':
      return 'Tracker certificate could not be verified — check the tracker’s server certificate or your system clock.';
    case 'issue':
      return 'Tracker issue detected — the watchdog will re-check every 15 minutes.';
    case 'ok':
      return '';
  }
}
