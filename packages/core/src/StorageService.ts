import fs from 'fs/promises';
import path from 'path';

export interface DiskStats {
  label: string;
  path: string;
  total: number;
  free: number;
  used: number;
  usagePercent: number;
}

/**
 * Service for querying underlying system storage information.
 */
export class StorageService {
  /**
   * Retrieves disk statistics for a given directory path.
   * 
   * @param label - Human-readable label for this location.
   * @param dirPath - The filesystem path to check.
   * @returns Disk statistics object.
   */
  public async getDiskStats(label: string, dirPath: string): Promise<DiskStats> {
    try {
      // Ensure the path exists or use its parent
      const stats = await fs.statfs(dirPath);
      
      const total = Number(stats.bsize) * Number(stats.blocks);
      const free = Number(stats.bsize) * Number(stats.bavail); // bavail is blocks available to unprivileged users
      const used = total - free;
      const usagePercent = total > 0 ? (used / total) * 100 : 0;

      return {
        label,
        path: dirPath,
        total,
        free,
        used,
        usagePercent
      };
    } catch (error) {
      console.error(`Failed to get disk stats for ${dirPath}:`, error);
      // Fallback for missing/inaccessible paths
      return {
        label,
        path: dirPath,
        total: 0,
        free: 0,
        used: 0,
        usagePercent: 0
      };
    }
  }

  /**
   * Aggregates stats for multiple configured paths, merging duplicates 
   * if they reside on the same filesystem.
   * 
   * @param locations - Map of Label -> Path
   * @returns List of unique disk stats.
   */
  public async getStorageOverview(locations: Record<string, string>): Promise<DiskStats[]> {
    const results: DiskStats[] = [];
    const seenFilesystems = new Set<string>();

    for (const [label, dirPath] of Object.entries(locations)) {
      try {
        const absolutePath = path.resolve(dirPath);
        await fs.statfs(absolutePath);
        
        const disk = await this.getDiskStats(label, absolutePath);
        
        // Fingerprint to avoid double-counting the same physical disk
        const fingerprint = `${disk.total}-${disk.free}`;
        
        if (!seenFilesystems.has(fingerprint)) {
          results.push(disk);
          seenFilesystems.add(fingerprint);
        } else {
          // If we've seen this disk but with a different label (e.g. "Library" and "Downloads" on same disk),
          // we can combine the label.
          const existing = results.find(r => `${r.total}-${r.free}` === fingerprint);
          if (existing && !existing.label.includes(label)) {
            existing.label = `${existing.label} & ${label}`;
          }
        }
      } catch {
        // Skip inaccessible paths
      }
    }

    return results;
  }
}
