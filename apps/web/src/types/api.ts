/**
 * API Response Types for Soup-Go Backend
 * 
 * These types match the JSON structure returned by the Go backend API.
 */

export interface TorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
  priority: number;
}

export interface TorrentWithMetadata {
  hash: string;
  name: string;
  size: number;
  progress: number;
  state: string;
  stateName: string;
  downloadSpeed: number;
  uploadSpeed: number;
  totalRead: number;
  totalWritten: number;
  contentPath: string;
  addedOn: number;
  seedingTime: number;
  ratio: number;
  eta: number;
  activePeers: number;
  totalPeers: number;
  availability: number;
  isSequential: boolean;
  isForceStart: boolean;
  isNonMedia: boolean;
  mediaInfo: MediaInfo;
  mediaMetadata: MediaMetadata | null;
  files?: TorrentFile[];
}

export interface MediaInfo {
  title: string;
  year: number | null;
  type: 'movie' | 'tv' | 'unknown';
}

export interface MediaMetadata {
  id: string;
  title: string;
  year: number;
  plot: string;
  cast: string[];
  posterPath: string;
}

export interface QBServerState {
  dl_info_speed: number;
  up_info_speed: number;
  ingest_info_speed?: number;
  dht_nodes?: number;
  use_alt_speed_limits: boolean;
  connection_status: string;
}

export interface DiskStats {
  label: string;
  path: string;
  total: number;
  free: number;
  used: number;
  usagePercent: number;
}

export interface IngestionTask {
  id: string;
  torrentHash: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentFile: string | null;
  fileMap: string;
  errorMessage?: string;
}

export interface QBPreferences {
  [key: string]: string | number | boolean | undefined;
  save_path: string;
  max_active_downloads?: number;
  max_active_uploads?: number;
  max_active_torrents?: number;
  dht: boolean;
  pex: boolean;
  utp?: boolean;
  lt_dht?: boolean;
  local_dht?: boolean;
  upnp?: boolean;
  NATPMP?: boolean;
  alt_dl_limit: number;
  alt_up_limit: number;
  connection_speed?: number;
  listen_port: number;
  encryption?: number;
  max_ratio?: number;
  max_seeding_time?: number;
  auto_tmm_enabled?: boolean;
  save_path_locked?: boolean;
  temp_path_locked?: boolean;
  auto_download_enabled?: boolean;
  media_root?: string;
  download_path?: string;
  download_path_locked?: boolean;
  auto_management_enabled?: boolean;
  recheck_completed_torrents?: boolean;
  slow_torrent_dl_rate_threshold?: number;
  slow_torrent_ul_rate_threshold?: number;
  slow_torrent_inactive_timer?: number;
  preallocate_all?: boolean;
  queueing_enabled?: boolean;
  max_ratio_enabled?: boolean;
  max_seeding_time_enabled?: boolean;
  max_inactive_connections?: number;
  max_active_seeding?: number;
  max_active_downloading?: number;
  enable_super_seeding?: boolean;
  aggressive_leds?: boolean;
  slow_torrents_inactive_timer?: number;
  ssl_enabled?: boolean;
}

export interface ClientConfig {
  backend: 'soup-go' | 'qbittorrent';
  syncInterval: number;
  tmdbImageBase: string;
  env: string;
}

// Constants for frontend use
export const ACTIVE_STATES = [
  'allocating', 'downloading', 'metaDL', 'stalledDL', 'checkingDL', 
  'forcedDL', 'queuedDL', 'uploading', 'stalledUP', 'forcedUP', 
  'queuedUP', 'checkingUP', 'moving'
];

export const STATE_MAP: Record<string, string> = {
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
