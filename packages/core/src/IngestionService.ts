import path from 'path';
import * as fs from 'fs';
import { Task, TaskStatus } from './TaskQueue.js';

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
   * Analyzes a filename and metadata to suggest a Jellyfin-compatible path.
   * 
   * @param cleanTitle - The cleaned title of the show/movie.
   * @param originalFilename - The raw filename from the torrent.
   * @param year - Optional release year.
   * @returns A relative path from the media root.
   */
  public suggestPath(cleanTitle: string, originalFilename: string, year?: number): string {
    const ext = path.extname(originalFilename);
    
    // 1. Try TV Show Pattern: S01E01, 1x01, S1E1
    const tvMatch = originalFilename.match(/[S](\d{1,2})[E](\d{1,2})/i) || 
                    originalFilename.match(/(\d{1,2})x(\d{1,2})/i);

    if (tvMatch) {
      const season = tvMatch[1].padStart(2, '0');
      const episode = tvMatch[2].padStart(2, '0');
      return path.join(
        cleanTitle,
        `Season ${season}`,
        `${cleanTitle} - S${season}E${episode}${ext}`
      );
    }

    // 2. Try Movie Pattern (Year)
    if (year) {
      return path.join(
        `${cleanTitle} (${year})`,
        `${cleanTitle} (${year})${ext}`
      );
    }

    // 3. Fallback: Simple folder
    return path.join(cleanTitle, originalFilename);
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
   * Executes the copy operation and reports progress.
   * 
   * @param onProgress - Callback for progress updates.
   */
  public async run(onProgress: (p: number) => void): Promise<void> {
    this.status = 'processing';
    const files = Object.entries(this.fileMap);
    
    try {
      // 1. Calculate total bytes
      for (const [src] of files) {
        const stats = await fs.promises.stat(src);
        this.totalBytes += stats.size;
      }

      // 2. Copy files sequentially
      for (const [src, dest] of files) {
        // Ensure destination directory exists
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });

        await new Promise<void>((resolve, reject) => {
          const readStream = fs.createReadStream(src);
          const writeStream = fs.createWriteStream(dest);

          readStream.on('data', (chunk) => {
            this.completedBytes += chunk.length;
            this.progress = Math.round((this.completedBytes / this.totalBytes) * 100);
            onProgress(this.progress);
          });

          readStream.on('error', reject);
          writeStream.on('error', reject);
          writeStream.on('finish', resolve);

          readStream.pipe(writeStream);
        });
      }

      this.status = 'completed';
      this.progress = 100;
      onProgress(100);
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
  public toJSON(): any {
    return {
      id: this.id,
      torrentHash: this.torrentHash,
      status: this.status,
      progress: this.progress,
      fileMap: JSON.stringify(this.fileMap)
    };
  }
}
