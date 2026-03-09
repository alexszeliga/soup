import type { TorrentFile } from './QBClient.js';

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
  /** Unix timestamp when the torrent was added. */
  addedOn?: number;
  /** Total time the torrent has been seeding in seconds. */
  seedingTime?: number;
  /** Current share ratio. */
  ratio?: number;
  /** True if sequential download is enabled. */
  isSequential?: boolean;
  /** True if first/last piece priority is enabled. */
  isFirstLastPrio?: boolean;
  /** True if force start is enabled. */
  isForceStart?: boolean;
  /** Optional list of individual files within the torrent. */
  files?: TorrentFile[];
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

  /** Mapping of raw qBittorrent states to user-friendly names. */
  public static readonly STATE_MAP: Record<string, string> = {
    'error': 'Error',
    'missingFiles': 'Missing Files',
    'uploading': 'Seeding',
    'stalledUP': 'Seeding',
    'pausedUP': 'Completed',
    'queuedUP': 'Seeding',
    'checkingUP': 'Checking',
    'forcedUP': 'Seeding',
    'allocating': 'Allocating',
    'downloading': 'Downloading',
    'metaDL': 'Metadata',
    'stalledDL': 'Stalled',
    'pausedDL': 'Paused',
    'queuedDL': 'Queued',
    'checkingDL': 'Checking',
    'forcedDL': 'Downloading',
    'checkingResumeData': 'Resuming',
    'moving': 'Moving',
    'unknown': 'Unknown'
  };

  public readonly hash: string;
  public readonly name: string;
  public readonly progress: number;
  public readonly state: string;
  public readonly stateName: string;
  public readonly downloadSpeed: number;
  public readonly uploadSpeed: number;
  public readonly contentPath: string;
  public readonly addedOn?: number;
  public readonly seedingTime?: number;
  public readonly ratio?: number;
  public readonly isSequential?: boolean;
  public readonly isFirstLastPrio?: boolean;
  public readonly isForceStart?: boolean;
  public readonly files?: TorrentFile[];

  /**
   * Creates an instance of Torrent.
   * 
   * @param props - Initialization properties.
   */
  constructor(props: TorrentProps) {
    this.hash = props.hash;
    this.name = props.name;
    this.progress = props.progress;
    this.state = props.state;
    this.stateName = Torrent.STATE_MAP[this.state] || this.state;
    this.downloadSpeed = props.downloadSpeed;
    this.uploadSpeed = props.uploadSpeed;
    this.contentPath = props.contentPath;
    this.addedOn = props.addedOn;
    this.seedingTime = props.seedingTime;
    this.ratio = props.ratio;
    this.isSequential = props.isSequential;
    this.isFirstLastPrio = props.isFirstLastPrio;
    this.isForceStart = props.isForceStart;
    this.files = props.files;
  }

  /**
   * Returns true if the torrent is 100% downloaded.
   * 
   * @returns Completion status.
   */
  public get isComplete(): boolean {
    return this.progress === 1;
  }

  /**
   * Returns true if the torrent is currently in an active state (not paused/queued/completed).
   * 
   * @returns Activity status.
   */
  public get isActive(): boolean {
    return Torrent.ACTIVE_STATES.includes(this.state);
  }

  /**
   * Returns true if the torrent is currently seeding.
   * 
   * @returns Seeding status.
   */
  public get isSeeding(): boolean {
    return this.state === 'uploading' || this.state === 'stalledUP' || this.state === 'forcedUP' || this.state === 'queuedUP' || this.state === 'checkingUP';
  }

  /**
   * Attempts to extract a clean title and release year from the raw torrent name.
   * 
   * Supports common Scene/P2P naming conventions:
   * 1. TV Shows: `Title.S01E01...`, `Title.2019.S01E01...`, `Title.Season.1...`
   * 2. Movies: `Title.2024...`
   * 
   * @returns An object containing the parsed title and optional year.
   */
  public getMediaInfo(): { title: string; year: number | null } {
    // 1. Initial cleanup: Replace separators with spaces
    const clean = this.name.replace(/[._]/g, ' ').trim();

    // 2. Identify TV Shows first (highest specificity)
    // Patterns: S01E01, S01, 1x01, Season 1
    const tvPatterns = [
      /^(.*?)\s+(\d{4})\s+S(\d{1,2})(?:E(\d{1,2}))?\b/i,  // Title 2019 S01 (Highest priority)
      /^(.*?)\s+S(\d{1,2})(?:E(\d{1,2}))?\b/i,           // Title S01
      /^(.*?)\s+Season\s+(\d{1,2})\b/i,                  // Title Season 1
      /^(.*?)\s+(\d{1,2})x(\d{1,2})\b/i,                 // Title 1x01
    ];

    for (const pattern of tvPatterns) {
      const match = clean.match(pattern);
      if (match) {
        // If the second capture group is a 4-digit year (from pattern 1)
        if (match[2].length === 4 && parseInt(match[2], 10) > 1900) {
          return {
            title: match[1].trim(),
            year: parseInt(match[2], 10)
          };
        }
        return {
          title: match[1].trim(),
          year: null
        };
      }
    }

    // 3. Identify Movies (Look for 4-digit year)
    // Avoid matching 1080 as a year
    const movieMatch = clean.match(/^(.*?)\s+((?:19|20)\d{2})(?:\s+|$)/i);
    if (movieMatch) {
      const title = movieMatch[1].trim();
      const year = parseInt(movieMatch[2], 10);
      
      // If title is empty (name starts with year), fallback to full name cleaning
      if (title) {
        return { title, year };
      }
    }

    // 4. Fallback: Systematic Noise Stripping
    // Remove common technical tags and language info
    const noise = [
      /\b(?:1080p|720p|2160p|4k|uhd|bluray|brrip|web-?dl|hdtv|x264|x265|hevc|h264|h265)\b/gi,
      /\b(?:german|english|french|multi|dual|truefrench|vostfr|subs?)\b/gi,
      /\b(?:ac3|dts|dd5\.?1|aac|mp3)\b/gi,
      /\b(?:proper|repack|internal|unrated|extended|directors\.?cut)\b/gi,
      /\s+-\s*.*$/g, // Remove trailing group info after a dash
    ];

    let resultTitle = clean;
    for (const n of noise) {
      resultTitle = resultTitle.replace(n, '');
    }

    // One final trim and whitespace normalization
    resultTitle = resultTitle.replace(/\s+/g, ' ').trim();

    return {
      title: resultTitle || clean,
      year: null
    };
  }
}
