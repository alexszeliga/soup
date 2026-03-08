/**
 * Formats a number of bytes into a human-readable string.
 * 
 * @param bytes - The number of bytes.
 * @param decimals - Number of decimal places (default 2).
 * @returns Formatted string (e.g., "1.24 GiB").
 */
export function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Formats a number of seconds into a human-readable duration string.
 * 
 * @param seconds - Total seconds.
 * @returns Formatted string (e.g., "2d 4h", "5h 20m", "15m").
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';

  const days = Math.floor(seconds / (24 * 3600));
  const hours = Math.floor((seconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || (days === 0 && hours === 0)) parts.push(`${minutes}m`);

  // Return only the top 2 units for brevity
  return parts.slice(0, 2).join(' ');
}
