import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { 
  type TorrentWithMetadata, 
  type MediaMetadata, 
  type TorrentFile,
  formatBytes,
  formatDuration 
} from '@soup/core';

export { formatBytes, formatDuration };

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

  /**
   * Private helper to perform standardized API requests.
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...((options.body && !(options.body instanceof FormData)) ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(data.error || response.statusText);
    }

    // Handle 204 No Content or empty responses
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }

    return await response.json() as T;
  }

  async getTorrents(): Promise<TorrentWithMetadata[]> {
    return this.request<TorrentWithMetadata[]>('/api/torrents');
  }

  async getFocusedTorrents(hash: string): Promise<TorrentWithMetadata[]> {
    return this.request<TorrentWithMetadata[]>(`/api/torrents/focus/${hash}`);
  }

  async performAction(hash: string, action: string, value?: unknown): Promise<void> {
    await this.request(`/api/torrents/${hash}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, value })
    });
  }

  async deleteTorrent(hash: string, deleteFiles: boolean = false): Promise<void> {
    await this.request(`/api/torrents?hashes=${hash}&deleteFiles=${deleteFiles}`, {
      method: 'DELETE'
    });
  }

  async addTorrentUrl(url: string): Promise<void> {
    await this.request('/api/torrents', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
  }

  async addTorrentFile(filePath: string): Promise<void> {
    const fileData = fs.readFileSync(filePath);
    const formData = new FormData();
    const blob = new Blob([fileData], { type: 'application/x-bittorrent' });
    formData.append('torrent', blob, path.basename(filePath));

    await this.request('/api/torrents', {
      method: 'POST',
      body: formData
    });
  }

  async searchMetadata(query: string): Promise<MediaMetadata[]> {
    return this.request<MediaMetadata[]>(`/api/metadata/search?query=${encodeURIComponent(query)}`);
  }

  async linkMetadata(hash: string, metadataId: string): Promise<void> {
    await this.request(`/api/torrents/${hash}/metadata`, {
      method: 'POST',
      body: JSON.stringify({ metadataId })
    });
  }

  async unmatchTorrent(hash: string): Promise<void> {
    await this.request(`/api/torrents/${hash}/unmatch`, {
      method: 'POST'
    });
  }

  async setNonMedia(hash: string, isNonMedia: boolean): Promise<void> {
    await this.request(`/api/torrents/${hash}/non-media`, {
      method: 'POST',
      body: JSON.stringify({ isNonMedia })
    });
  }

  async getFiles(hash: string): Promise<TorrentFile[]> {
    return this.request<TorrentFile[]>(`/api/torrents/${hash}/files`);
  }

  async setFilePriority(hash: string, indices: number[], priority: number): Promise<void> {
    await this.request(`/api/torrents/${hash}/files/priority`, {
      method: 'POST',
      body: JSON.stringify({ indices, priority })
    });
  }

  async getLibraries(): Promise<string[]> {
    return this.request<string[]>('/api/libraries');
  }

  async getSuggestPaths(hash: string, library?: string): Promise<SuggestionPath[]> {
    const endpoint = library 
      ? `/api/torrents/${hash}/suggest-paths?library=${encodeURIComponent(library)}`
      : `/api/torrents/${hash}/suggest-paths`;
    return this.request<SuggestionPath[]>(endpoint);
  }

  async ingest(hash: string, fileMap: Record<string, string>): Promise<void> {
    await this.request(`/api/torrents/${hash}/ingest`, {
      method: 'POST',
      body: JSON.stringify({ fileMap })
    });
  }

  async getTasks(): Promise<IngestionTask[]> {
    return this.request<IngestionTask[]>('/api/tasks');
  }

  async clearTasks(): Promise<void> {
    await this.request('/api/tasks/clear', {
      method: 'POST'
    });
  }

  async getPreferences(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/api/preferences');
  }

  async setPreferences(prefs: Record<string, unknown>): Promise<void> {
    await this.request('/api/preferences', {
      method: 'POST',
      body: JSON.stringify(prefs)
    });
  }

  async getServerState(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/api/state');
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
