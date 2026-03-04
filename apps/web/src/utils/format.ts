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
