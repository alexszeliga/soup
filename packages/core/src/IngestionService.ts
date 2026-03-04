import path from 'path';
import * as fs from 'fs';
import { Task, TaskStatus, TaskJSON } from './TaskQueue.js';

/**
 * Service responsible for suggesting media-standard file paths
 * and orchestrating the ingestion (copying) of torrent files.
 */
export class IngestionService {
  /**
   * Creates an instance of IngestionService.
   * 
   * @param mediaRoot - The base directory for all media (e.g. /media).
   */
  constructor(private readonly mediaRoot: string) {}

  /**
   * Returns a list of top-level directories within the media root.
   * These represent individual Jellyfin libraries (e.g. Movies, TV Shows).
   * 
   * @returns Array of directory names.
   */
  public async getLibraryOptions(): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(this.mediaRoot, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch (err) {
      console.error('Failed to read media root:', err);
      return [];
    }
  }

  /**
   * Sanitizes a title by removing or replacing illegal filesystem characters.
   * 
   * @param title - The raw title to sanitize.
   * @returns The sanitized title.
   */
  private sanitizeTitle(title: string): string {
    // Replace illegal characters: / \ : * ? " < > |
    // Most common is ":" which we replace with " -"
    return title
      .replace(/:/g, ' -')
      .replace(/[\\*?"<>|]/g, '')
      .trim();
  }

  /**
   * Analyzes a filename and metadata to suggest a Jellyfin-compatible path.
   * 
   * @param title - The title of the show/movie.
   * @param originalFilename - The raw filename from the torrent.
   * @param year - Optional release year.
   * @returns A relative path from the media root.
   */
  public suggestPath(title: string, originalFilename: string, year?: number): string {
    const ext = path.extname(originalFilename);
    const cleanTitle = this.sanitizeTitle(title);
    const titleWithYear = year ? `${cleanTitle} (${year})` : cleanTitle;
    
    // 1. Try TV Show Pattern: S01E01, 1x01, S1E1
    const tvMatch = originalFilename.match(/[S](\d{1,2})[E](\d{1,2})/i) || 
                    originalFilename.match(/(\d{1,2})x(\d{1,2})/i);

    if (tvMatch) {
      const season = tvMatch[1].padStart(2, '0');
      const episode = tvMatch[2].padStart(2, '0');
      return path.join(
        titleWithYear,
        `Season ${season}`,
        `${titleWithYear} - S${season}E${episode}${ext}`
      );
    }

    // 2. Try Movie Pattern (Year)
    if (year) {
      return path.join(
        titleWithYear,
        `${titleWithYear}${ext}`
      );
    }

    // 3. Fallback: Simple folder
    return path.join(cleanTitle, originalFilename);
  }

  /**
   * Maps a remote qBittorrent path to a local filesystem path.
   * 
   * @param remotePath - The absolute path reported by qBittorrent.
   * @param remoteRoot - qBittorrent's download root folder.
   * @param localRoot - The local filesystem mount point for the downloads.
   * @returns The mapped local absolute path.
   */
  public mapRemoteToLocalPath(remotePath: string, remoteRoot: string, localRoot: string): string {
    if (remotePath.startsWith(remoteRoot)) {
      return path.join(localRoot, remotePath.substring(remoteRoot.length));
    }
    return remotePath;
  }

  /**
   * Creates a new CopyTask for the given torrent and file mapping.
   * 
   * @param torrentHash - The hash of the torrent.
   * @param fileMap - Mapping of source paths to relative destination paths.
   * @returns A new CopyTask instance.
   */
  public createCopyTask(torrentHash: string, fileMap: Record<string, string>): CopyTask {
    const absoluteFileMap: Record<string, string> = {};
    for (const [src, dest] of Object.entries(fileMap)) {
      absoluteFileMap[src] = path.isAbsolute(dest) ? dest : path.join(this.mediaRoot, dest);
    }
    return new CopyTask(torrentHash, absoluteFileMap);
  }
}

/**
 * Background task that copies one or more files to a destination.
 * Implements the Task interface for the TaskQueue.
 */
export class CopyTask implements Task {
  public id: string;
  public status: TaskStatus = 'queued';
  public progress: number = 0;
  public totalBytes: number = 0;
  public completedBytes: number = 0;
  public currentFile: string | null = null;

  /**
   * Creates an instance of CopyTask.
   * 
   * @param torrentHash - The hash of the associated torrent.
   * @param fileMap - Absolute source to absolute destination mapping.
   */
  constructor(
    public readonly torrentHash: string,
    private readonly fileMap: Record<string, string>
  ) {
    this.id = `copy-${torrentHash}-${Date.now()}`;
  }

  /**
   * Executes the copy operation using high-performance fs.copyFile.
   * Progress is tracked by polling fs.stat on the destination files.
   * 
   * @param onProgress - Callback for progress updates.
   */
  public async run(onProgress: (p: number, currentFile?: string | null) => void): Promise<void> {
    this.status = 'processing';
    const files = Object.entries(this.fileMap);
    
    try {
      // 1. Calculate total bytes
      for (const [src] of files) {
        const stats = await fs.promises.stat(src);
        this.totalBytes += stats.size;
      }

      let bytesFromFinishedFiles = 0;

      // 2. Copy files sequentially
      for (const [src, dest] of files) {
        this.currentFile = path.basename(src);
        
        // Ensure destination directory exists
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });

        // Start high-performance copy
        const copyPromise = fs.promises.copyFile(src, dest);

        // Progress polling while file is copying
        const pollInterval = setInterval(async () => {
          try {
            const destStats = await fs.promises.stat(dest);
            const currentTotalCompleted = bytesFromFinishedFiles + destStats.size;
            this.progress = Math.min(99, Math.round((currentTotalCompleted / this.totalBytes) * 100));
            onProgress(this.progress, this.currentFile);
          } catch {
            // File might not exist yet
          }
        }, 500);

        try {
          await copyPromise;
          const srcStats = await fs.promises.stat(src);
          bytesFromFinishedFiles += srcStats.size;
          this.progress = Math.round((bytesFromFinishedFiles / this.totalBytes) * 100);
          onProgress(this.progress, this.currentFile);
        } finally {
          clearInterval(pollInterval);
        }
      }

      this.currentFile = null;
      this.status = 'completed';
      this.progress = 100;
      onProgress(100, null);
    } catch (err) {
      this.status = 'failed';
      throw err;
    }
  }

  /**
   * Returns a serializable representation of the task for DB persistence.
   * 
   * @returns Plain object representation.
   */
  public toJSON(): TaskJSON {
    return {
      id: this.id,
      torrentHash: this.torrentHash,
      status: this.status,
      progress: this.progress,
      currentFile: this.currentFile,
      fileMap: JSON.stringify(this.fileMap)
    };
  }
}
