#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import type { TorrentWithMetadata } from '@soup/core';

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

  async performAction(hash: string, action: string, value?: any): Promise<void> {
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
      
      console.log(chalk.white(`${'Name'.padEnd(40)} | ${'Progress'.padEnd(10)} | ${'Status'.padEnd(12)} | ${'Media Title'.padEnd(30)}`));
      console.log('-'.repeat(100));

      for (const torrent of torrents) {
        const name = torrent.name.length > 37 ? torrent.name.slice(0, 37) + '...' : torrent.name;
        const progress = (torrent.progress * 100).toFixed(1) + '%';
        const status = torrent.stateName || torrent.state;
        const mediaTitle = torrent.mediaMetadata ? torrent.mediaMetadata.title : chalk.gray('Unknown');

        console.log(`${name.padEnd(40)} | ${progress.padEnd(10)} | ${status.padEnd(12)} | ${mediaTitle}`);
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
      const torrent = torrents.find(t => t.hash === hash);

      if (!torrent) {
        console.error(chalk.red(`Error: Torrent with hash ${hash} not found.`));
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

program.parse(process.argv);
