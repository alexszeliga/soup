#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import type { TorrentWithMetadata, MediaMetadata, TorrentFile } from '@soup/core';

// Support both local development (.env in root) and environment-level config
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const program = new Command();

program
  .name('soup')
  .description('A remote CLI for Soup media manager')
  .version('0.1.0');

/**
 * Utility to format seconds into a concise duration string.
 */
function formatDuration(seconds: number): string {
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
function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface SuggestionPath {
  index: number;
  originalName: string;
  sourcePath: string;
  suggestedPath: string;
}

interface IngestionTask {
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
class SoupClient {
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

function getClient() {
  const soupUrl = process.env.SOUP_URL || 'http://localhost:8207';
  return new SoupClient(soupUrl);
}

program
  .command('list')
  .description('List all torrents from the remote Soup instance')
  .action(async () => {
    const client = getClient();

    try {
      console.log(chalk.blue('Connecting to Soup server...'));
      const torrents = await client.getTorrents();
      
      console.log(chalk.white(`${'Name'.padEnd(30)} | ${'Hash'.padEnd(10)} | ${'Progress'.padEnd(10)} | ${'Status'.padEnd(12)} | ${'Media Title'.padEnd(30)}`));
      console.log('-'.repeat(110));

      for (const torrent of torrents) {
        const name = torrent.name.length > 27 ? torrent.name.slice(0, 27) + '...' : torrent.name;
        const hash = torrent.hash.slice(0, 10);
        const progress = (torrent.progress * 100).toFixed(1) + '%';
        const status = torrent.stateName || torrent.state;
        const mediaTitle = torrent.mediaMetadata ? torrent.mediaMetadata.title : chalk.gray('Unknown');

        console.log(`${name.padEnd(30)} | ${hash.padEnd(10)} | ${progress.padEnd(10)} | ${status.padEnd(12)} | ${mediaTitle}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('show <hash>')
  .description('Show details for a specific torrent')
  .action(async (hash) => {
    const client = getClient();

    try {
      // Use focus endpoint to ensure we have latest details
      const torrents = await client.getFocusedTorrents(hash);
      
      // Server-side resolution already happened, but we might get a list.
      // We search for a case-insensitive prefix match locally to be safe.
      const torrent = torrents.find(t => 
        t.hash.toLowerCase() === hash.toLowerCase() || 
        t.hash.toLowerCase().startsWith(hash.toLowerCase())
      );

      if (!torrent) {
        console.error(chalk.red(`Error: Torrent matching ${hash} not found.`));
        return;
      }

      console.log(chalk.bold.blue(`\nTorrent: ${torrent.name}`));
      console.log(chalk.gray(`Hash: ${torrent.hash}`));
      console.log(`Status: ${torrent.stateName || torrent.state} | Progress: ${(torrent.progress * 100).toFixed(1)}%`);
      console.log(`Ratio: ${torrent.ratio?.toFixed(2) || '0.00'} | Seeded: ${formatDuration(torrent.seedingTime || 0)}`);

      if (torrent.mediaMetadata) {
        const meta = torrent.mediaMetadata;
        console.log(chalk.bold.green(`\nMedia: ${meta.title} (${meta.year})`));
        console.log(chalk.white(`\nPlot: ${meta.plot}`));
        console.log(chalk.white(`\nCast: ${meta.cast.join(', ')}`));
        if (meta.posterPath) {
          console.log(chalk.gray(`\nPoster: ${meta.posterPath}`));
        }
      } else if (torrent.isNonMedia) {
        console.log(chalk.yellow('\nMarked as Non-Media Item.'));
      } else {
        console.log(chalk.yellow('\nNo media metadata found.'));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('start <hash>')
  .description('Start a torrent')
  .action(async (hash) => {
    const client = getClient();
    try {
      await client.performAction(hash, 'resume');
      console.log(chalk.green(`Torrent ${hash} started successfully.`));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('stop <hash>')
  .description('Stop (pause) a torrent')
  .action(async (hash) => {
    const client = getClient();
    try {
      await client.performAction(hash, 'pause');
      console.log(chalk.green(`Torrent ${hash} stopped successfully.`));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('delete <hash>')
  .description('Delete a torrent')
  .option('--files', 'Also delete downloaded files from disk', false)
  .action(async (hash, options) => {
    const client = getClient();
    try {
      await client.deleteTorrent(hash, options.files);
      console.log(chalk.green(`Torrent ${hash} deleted successfully.`));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('add <source>')
  .description('Add a new torrent via magnet link, URL, or local .torrent file')
  .action(async (source) => {
    const client = getClient();
    try {
      if (source.startsWith('magnet:') || source.startsWith('http://') || source.startsWith('https://')) {
        await client.addTorrentUrl(source);
        console.log(chalk.green('Torrent URL added successfully.'));
      } else {
        if (!fs.existsSync(source)) {
          throw new Error(`File not found: ${source}`);
        }
        await client.addTorrentFile(source);
        console.log(chalk.green(`Torrent file '${path.basename(source)}' added successfully.`));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('recheck <hash>')
  .description('Recheck torrent data')
  .action(async (hash) => {
    const client = getClient();
    try {
      await client.performAction(hash, 'recheck');
      console.log(chalk.green(`Torrent ${hash} recheck initiated.`));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('search <query>')
  .description('Search for media metadata candidates')
  .action(async (query) => {
    const client = getClient();
    try {
      const candidates = await client.searchMetadata(query);
      if (candidates.length === 0) {
        console.log(chalk.yellow('No candidates found.'));
        return;
      }
      console.log(chalk.white(`${'ID'.padEnd(20)} | ${'Year'.padEnd(6)} | ${'Title'}`));
      console.log('-'.repeat(60));
      for (const c of candidates) {
        console.log(`${c.id.padEnd(20)} | ${c.year.toString().padEnd(6)} | ${c.title}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('match <hash> <metadataId>')
  .description('Manually link a torrent to specific media metadata')
  .action(async (hash, metadataId) => {
    const client = getClient();
    try {
      await client.linkMetadata(hash, metadataId);
      console.log(chalk.green(`Torrent ${hash} linked to metadata ${metadataId}.`));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('unmatch <hash>')
  .description('Clear media metadata for a torrent')
  .action(async (hash) => {
    const client = getClient();
    try {
      await client.unmatchTorrent(hash);
      console.log(chalk.green(`Metadata cleared for torrent ${hash}.`));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('mark-non-media <hash>')
  .description('Mark a torrent as non-media content')
  .action(async (hash) => {
    const client = getClient();
    try {
      await client.setNonMedia(hash, true);
      console.log(chalk.green(`Torrent ${hash} marked as non-media.`));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('mark-media <hash>')
  .description('Unmark a torrent as non-media content (allow automatic matching)')
  .action(async (hash) => {
    const client = getClient();
    try {
      await client.setNonMedia(hash, false);
      console.log(chalk.green(`Torrent ${hash} unmarked as non-media.`));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('files <hash>')
  .description('List files in a torrent')
  .action(async (hash) => {
    const client = getClient();
    try {
      const files = await client.getFiles(hash);
      if (files.length === 0) {
        console.log(chalk.yellow('No files found.'));
        return;
      }
      console.log(chalk.white(`${'Idx'.padEnd(4)} | ${'Size'.padEnd(10)} | ${'Prog'.padEnd(6)} | ${'Prio'.padEnd(6)} | ${'Name'}`));
      console.log('-'.repeat(80));
      for (const f of files) {
        const prog = (f.progress * 100).toFixed(0) + '%';
        const prio = f.priority === 0 ? 'Skip' : f.priority === 1 ? 'Norm' : f.priority === 6 ? 'High' : 'Max';
        console.log(`${f.index.toString().padEnd(4)} | ${formatBytes(f.size).padEnd(10)} | ${prog.padEnd(6)} | ${prio.padEnd(6)} | ${f.name}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('priority <hash> <indices> <level>')
  .description('Set download priority for files (level: skip, normal, high, max)')
  .action(async (hash, indices, level) => {
    const client = getClient();
    try {
      const idxList = indices.split(',').map((i: string) => parseInt(i.trim(), 10));
      const priorityMap: Record<string, number> = {
        'skip': 0,
        'normal': 1,
        'high': 6,
        'max': 7
      };
      const prioValue = priorityMap[level.toLowerCase()];
      if (prioValue === undefined) {
        throw new Error('Invalid priority level. Use: skip, normal, high, max');
      }
      await client.setFilePriority(hash, idxList, prioValue);
      console.log(chalk.green(`Priority updated for ${idxList.length} files.`));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('libraries')
  .description('List available media ingestion libraries')
  .action(async () => {
    const client = getClient();
    try {
      const libraries = await client.getLibraries();
      console.log(chalk.blue('Available libraries:'));
      libraries.forEach(l => console.log(`- ${l}`));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('ingest <hash>')
  .description('Trigger file ingestion for a torrent')
  .option('-l, --library <path>', 'Target library path')
  .action(async (hash, options) => {
    const client = getClient();
    try {
      console.log(chalk.blue('Fetching path suggestions...'));
      const suggestions = await client.getSuggestPaths(hash, options.library);
      if (suggestions.length === 0) {
        console.log(chalk.yellow('No files found to ingest.'));
        return;
      }

      const fileMap: Record<string, string> = {};
      console.log(chalk.white('\nPlanned Ingestion:'));
      console.log('-'.repeat(60));
      suggestions.forEach(s => {
        console.log(`${chalk.gray(s.originalName)} -> ${chalk.green(s.suggestedPath)}`);
        fileMap[s.sourcePath] = s.suggestedPath;
      });

      await client.ingest(hash, fileMap);
      console.log(chalk.bold.green('\nIngestion task queued successfully.'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('tasks')
  .description('Monitor ingestion tasks')
  .option('--clear', 'Clear completed and failed tasks', false)
  .action(async (options) => {
    const client = getClient();
    try {
      if (options.clear) {
        await client.clearTasks();
        console.log(chalk.green('Tasks cleared.'));
        return;
      }

      const tasks = await client.getTasks();
      if (tasks.length === 0) {
        console.log(chalk.yellow('No active or recent tasks.'));
        return;
      }

      console.log(chalk.white(`${'ID'.padEnd(8)} | ${'Status'.padEnd(12)} | ${'Prog'.padEnd(6)} | ${'Current File'}`));
      console.log('-'.repeat(80));
      for (const t of tasks) {
        const prog = (t.progress * 100).toFixed(0) + '%';
        console.log(`${t.id.slice(0, 8).padEnd(8)} | ${t.status.padEnd(12)} | ${prog.padEnd(6)} | ${t.currentFile || chalk.gray('N/A')}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('settings')
  .description('View or modify qBittorrent preferences')
  .option('--set <json>', 'JSON string of settings to update')
  .action(async (options) => {
    const client = getClient();
    try {
      if (options.set) {
        const prefs = JSON.parse(options.set) as Record<string, unknown>;
        await client.setPreferences(prefs);
        console.log(chalk.green('Preferences updated.'));
        return;
      }

      const prefs = await client.getPreferences();
      console.log(chalk.blue('Key Preferences:'));
      console.log(`- Save Path: ${prefs.save_path}`);
      console.log(`- DL Limit: ${prefs.dl_limit ? formatBytes(prefs.dl_limit as number) + '/s' : 'Infinity'}`);
      console.log(`- UP Limit: ${prefs.up_limit ? formatBytes(prefs.up_limit as number) + '/s' : 'Infinity'}`);
      console.log(`- DHT: ${prefs.dht ? 'Enabled' : 'Disabled'}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program
  .command('stats')
  .description('Show real-time global speed and health monitoring')
  .action(async () => {
    const client = getClient();
    try {
      const state = await client.getServerState();
      console.log(chalk.bold.blue('\nGlobal Soup Stats:'));
      console.log('-'.repeat(30));
      console.log(`Download: ${chalk.blue(formatBytes(state.dl_info_speed as number) + '/s')}`);
      console.log(`Upload:   ${chalk.green(formatBytes(state.up_info_speed as number) + '/s')}`);
      console.log(`Free Space: ${chalk.yellow(formatBytes(state.free_space_on_disk as number))}`);
      console.log(`Alt Speeds: ${state.use_alt_speed_limits ? chalk.yellow('ON') : chalk.gray('OFF')}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`Error: ${message}`));
    }
  });

program.addHelpText('after', `
Examples:
  $ soup list                          # List all torrents
  $ soup add magnet:?xt=urn:btih:...   # Add a magnet link
  $ soup ingest <hash>                 # Preview and queue ingestion
  $ soup show <hash>                   # See full metadata and files
  $ soup priority <hash> 0,1 skip      # Skip first two files
`);

program.parse(process.argv);
