import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import type { TorrentWithMetadata, MediaMetadata, TorrentFile } from '@soup/core';

/**
 * Utility to format seconds into a concise duration string.
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
  return parts.slice(0, 2).join(' ');
}

/**
 * Formats a number of bytes into a human-readable string.
 */
export function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export interface SuggestionPath {
  index: number;
  originalName: string;
  sourcePath: string;
  suggestedPath: string;
}

export interface IngestionTask {
  id: string;
  torrentHash: string;
  status: string;
  progress: number;
  currentFile: string | null;
  fileMap: string;
}

/**
 * Simple client for the Soup Server API.
 */
export class SoupClient {
  constructor(private readonly baseUrl: string) {}

  async getTorrents(): Promise<TorrentWithMetadata[]> {
    const response = await fetch(`${this.baseUrl}/api/torrents`);
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
    return await response.json() as TorrentWithMetadata[];
  }

  async getFocusedTorrents(hash: string): Promise<TorrentWithMetadata[]> {
    const response = await fetch(`${this.baseUrl}/api/torrents/focus/${hash}`);
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
    return await response.json() as TorrentWithMetadata[];
  }

  async performAction(hash: string, action: string, value?: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/torrents/${hash}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, value })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Server Error: ${data.error || response.statusText}`);
    }
  }

  async deleteTorrent(hash: string, deleteFiles: boolean = false): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/torrents?hashes=${hash}&deleteFiles=${deleteFiles}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Server Error: ${data.error || response.statusText}`);
    }
  }

  async addTorrentUrl(url: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/torrents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Server Error: ${data.error || response.statusText}`);
    }
  }

  async addTorrentFile(filePath: string): Promise<void> {
    const fileData = fs.readFileSync(filePath);
    const formData = new FormData();
    const blob = new Blob([fileData], { type: 'application/x-bittorrent' });
    formData.append('torrent', blob, path.basename(filePath));

    const response = await fetch(`${this.baseUrl}/api/torrents`, {
      method: 'POST',
      body: formData
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Server Error: ${data.error || response.statusText}`);
    }
  }

  async searchMetadata(query: string): Promise<MediaMetadata[]> {
    const response = await fetch(`${this.baseUrl}/api/metadata/search?query=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
    return await response.json() as MediaMetadata[];
  }

  async linkMetadata(hash: string, metadataId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/torrents/${hash}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadataId })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Server Error: ${data.error || response.statusText}`);
    }
  }

  async unmatchTorrent(hash: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/torrents/${hash}/unmatch`, {
      method: 'POST'
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Server Error: ${data.error || response.statusText}`);
    }
  }

  async setNonMedia(hash: string, isNonMedia: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/torrents/${hash}/non-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isNonMedia })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Server Error: ${data.error || response.statusText}`);
    }
  }

  async getFiles(hash: string): Promise<TorrentFile[]> {
    const response = await fetch(`${this.baseUrl}/api/torrents/${hash}/files`);
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
    return await response.json() as TorrentFile[];
  }

  async setFilePriority(hash: string, indices: number[], priority: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/torrents/${hash}/files/priority`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ indices, priority })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Server Error: ${data.error || response.statusText}`);
    }
  }

  async getLibraries(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/libraries`);
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
    return await response.json() as string[];
  }

  async getSuggestPaths(hash: string, library?: string): Promise<SuggestionPath[]> {
    const url = new URL(`${this.baseUrl}/api/torrents/${hash}/suggest-paths`);
    if (library) url.searchParams.set('library', library);
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
    return await response.json() as SuggestionPath[];
  }

  async ingest(hash: string, fileMap: Record<string, string>): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/torrents/${hash}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileMap })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Server Error: ${data.error || response.statusText}`);
    }
  }

  async getTasks(): Promise<IngestionTask[]> {
    const response = await fetch(`${this.baseUrl}/api/tasks`);
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
    return await response.json() as IngestionTask[];
  }

  async clearTasks(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/tasks/clear`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
  }

  async getPreferences(): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/api/preferences`);
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
    return await response.json() as Record<string, unknown>;
  }

  async setPreferences(prefs: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs)
    });
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
  }

  async getServerState(): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/api/state`);
    if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
    return await response.json() as Record<string, unknown>;
  }
}

export function getClient() {
  const soupUrl = process.env.SOUP_URL || 'http://localhost:8207';
  return new SoupClient(soupUrl);
}

export function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(chalk.red(`Error: ${message}`));
}
