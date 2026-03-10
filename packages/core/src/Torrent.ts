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

  /** Comprehensive list of static noise patterns (Technical, Language, Scene). */
  private static readonly STATIC_NOISE_PATTERNS = [
    // Technical Specs
    /\b(?:1080p|720p|2160p|4k|uhd|bluray|brrip|bdrip|web-?dl|hdtv|x264|x265|hevc|h264|h265|remux|redux)\b/gi,
    /\b(?:ac3|dts(?:-hd)?|dd(?:p|\+)?5\.?1|aac(?:2\.0)?|mp3|atmos|truehd|e-?ac3)\b/gi,
    // Languages
    /\b(?:german|english|french|multi|dual|truefrench|vostfr|subs?|japanese|korean|spanish|italian|russian)\b/gi,
    // Scene Tags
    /\b(?:proper|repack|internal|unrated|extended|directors\.?cut|limited|collectors|edition|remastered|uncut|complete)\b/gi,
    /\b(?:h\.?264|h\.?265|h\.?262)\b/gi,
    /\b(?:dv|hdr(?:10)?|vost|subbed|dubbed)\b/gi,
    // Trailing Group Info
    /\s+-\s*.*$/g,
    /-[a-zA-Z0-9]+$/g,
  ];

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
   * Static helper to check if a token is covered by the static noise rules.
   * 
   * @param token - Token to check.
   * @returns True if it's static noise.
   */
  public static isStaticNoise(token: string): boolean {
    return this.STATIC_NOISE_PATTERNS.some(pattern => {
      // Create a fresh regex instance to avoid state issues with global flag
      const re = new RegExp(pattern.source, pattern.flags);
      return re.test(token);
    });
  }

  /**
   * Attempts to extract a clean title and release year from the raw torrent name.
   * 
   * Supports common Scene/P2P naming conventions:
   * 1. TV Shows: `Title.S01E01...`, `Title.2019.S01E01...`, `Title.Season.1...`
   * 2. Movies: `Title.2024...`
   * 
   * @param dynamicNoise - Optional list of additional noise tokens to strip (e.g. from the Noise Miner).
   * @returns An object containing the parsed title and optional year.
   */
  public getMediaInfo(dynamicNoise: string[] = []): { title: string; year: number | null } {
    // 1. Initial cleanup: Replace separators with spaces
    const clean = this.name.replace(/[._]/g, ' ').trim();
    let extractedYear: number | null = null;
    let extractedTitle = clean;

    // 2. Identify TV Shows first (highest specificity)
    // Patterns: S01E01, S01, 1x01, Season 1
    const tvPatterns = [
      /^(.*?)\s+(\d{4})\s+S(\d{1,2})(?:E(\d{1,2}))?\b/i,  // Title 2019 S01 (Highest priority)
      /^(.*?)\s+S(\d{1,2})(?:E(\d{1,2}))?\b/i,           // Title S01
      /^(.*?)\s+Season\s+(\d{1,2})\b/i,                  // Title Season 1
      /^(.*?)\s+(\d{1,2})x(\d{1,2})\b/i,                 // Title 1x01
    ];

    let tvMatched = false;
    for (const pattern of tvPatterns) {
      const match = clean.match(pattern);
      if (match) {
        extractedTitle = match[1].trim();
        // If the second capture group is a 4-digit year (from pattern 1)
        if (match[2] && match[2].length === 4 && parseInt(match[2], 10) > 1900 && parseInt(match[2], 10) < 2100) {
          extractedYear = parseInt(match[2], 10);
        }
        tvMatched = true;
        break;
      }
    }

    // 3. Identify Movies if no TV match (Look for 4-digit year)
    if (!tvMatched) {
      const movieMatch = clean.match(/^(.*?)\s+((?:19|20)\d{2})(?:\s+|$)/i);
      if (movieMatch) {
        extractedTitle = movieMatch[1].trim();
        extractedYear = parseInt(movieMatch[2], 10);
      }
    }

    // 4. Systematic Noise Stripping
    // This is applied to the extracted title to clean up remaining tags
    let resultTitle = extractedTitle;
    for (const n of Torrent.STATIC_NOISE_PATTERNS) {
      resultTitle = resultTitle.replace(n, '');
    }

    // Apply dynamic noise if provided
    for (const n of dynamicNoise) {
      const regex = new RegExp(`\\b${n}\\b`, 'gi');
      resultTitle = resultTitle.replace(regex, '');
    }

    // Final trim and whitespace normalization
    resultTitle = resultTitle.replace(/\s+/g, ' ').trim();

    // If resultTitle is empty (e.g. name was all noise), fallback to extractedTitle or clean
    return {
      title: resultTitle || extractedTitle || clean,
      year: extractedYear
    };
  }
}
