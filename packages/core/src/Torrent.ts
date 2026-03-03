/**
 * Properties required to instantiate a Torrent object.
 */
export interface TorrentProps {
  /** Unique SHA-1 hash of the torrent. */
  hash: string;
  /** Display name of the torrent (usually the filename or folder). */
  name: string;
  /** Completion progress as a decimal between 0 and 1. */
  progress: number;
  /** Current operational state (e.g., 'downloading', 'seeding', 'stalled'). */
  state: string;
  /** Current download rate in bytes per second. */
  downloadSpeed: number;
  /** Current upload rate in bytes per second. */
  uploadSpeed: number;
  /** Absolute local path where the torrent content is stored. */
  contentPath: string;
}

/**
 * Domain model representing a qBittorrent torrent.
 * 
 * Provides utility methods for determining completion status, activity,
 * and parsing raw names into structured media information (Title/Year).
 */
export class Torrent {
  /** List of qBittorrent states that indicate the torrent is actively performing I/O. */
  public static readonly ACTIVE_STATES = [
    'allocating', 'downloading', 'metaDL', 'stalledDL', 'checkingDL', 
    'forcedDL', 'queuedDL', 'uploading', 'stalledUP', 'forcedUP', 
    'queuedUP', 'checkingUP', 'moving'
  ];

  public readonly hash: string;
  public readonly name: string;
  public readonly progress: number;
  public readonly state: string;
  public readonly downloadSpeed: number;
  public readonly uploadSpeed: number;
  public readonly contentPath: string;

  constructor(props: TorrentProps) {
    this.hash = props.hash;
    this.name = props.name;
    this.progress = props.progress;
    this.state = props.state;
    this.downloadSpeed = props.downloadSpeed;
    this.uploadSpeed = props.uploadSpeed;
    this.contentPath = props.contentPath;
  }

  /**
   * Returns true if the torrent is 100% downloaded.
   */
  public get isComplete(): boolean {
    return this.progress === 1;
  }

  /**
   * Returns true if the torrent is currently in an active state (not paused/queued/completed).
   */
  public get isActive(): boolean {
    return Torrent.ACTIVE_STATES.includes(this.state);
  }

  /**
   * Attempts to extract a clean title and release year from the raw torrent name.
   * 
   * Supports common Scene/P2P naming conventions:
   * 1. TV Shows: `Title.S01E01...`
   * 2. Movies: `Title.2024...`
   * 
   * @returns An object containing the parsed title and optional year.
   */
  public getMediaInfo(): { title: string; year: number | null } {
    // 1. Try TV Show pattern: Title.S01E01...
    const tvMatch = this.name.match(/^(.*?)[. ]S(\d{1,2})E(\d{1,2})/i);
    if (tvMatch) {
      const title = tvMatch[1].replace(/[.]/g, ' ').trim();
      return { title, year: null };
    }

    // 2. Try Movie pattern with Year: Title.2024...
    const yearMatch = this.name.match(/^(.*?)[. ](\d{4})[. ]/);
    if (yearMatch) {
      const title = yearMatch[1].replace(/[.]/g, ' ').trim();
      const year = parseInt(yearMatch[2], 10);
      return { title, year };
    }

    // Fallback: use the whole name as title if no pattern found
    return {
      title: this.name.replace(/[.]/g, ' ').trim(),
      year: null
    };
  }
}
