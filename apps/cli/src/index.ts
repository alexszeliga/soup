import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { QBClient } from '@soup/core/QBClient.js';
import { TMDBMetadataProvider } from '@soup/core/TMDBMetadataProvider.js';
import { MetadataMatcher } from '@soup/core/MetadataMatcher.js';
import { MetadataCache } from '@soup/core/MetadataCache.js';
import { createDatabase } from '@soup/database';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const program = new Command();

program
  .name('soup')
  .description('A qBittorrent interface with rich media metadata')
  .version('0.1.0');

async function getServices() {
  const qbUrl = process.env.QB_URL || 'https://qb.osage.lol/api/v2';
  const tmdbApiKey = process.env.TMDB_API_KEY;
  const dbPath = process.env.DB_PATH || './soup.db';

  if (!tmdbApiKey) {
    throw new Error('TMDB_API_KEY is not defined in .env');
  }

  const db = createDatabase(dbPath);
  const qb = new QBClient(qbUrl);
  const tmdb = new TMDBMetadataProvider(tmdbApiKey);
  const matcher = new MetadataMatcher(tmdb);
  const cache = new MetadataCache(db);

  await cache.ensureTables();

  return { qb, tmdb, matcher, cache };
}

program
  .command('list')
  .description('List all torrents with rich metadata')
  .action(async () => {
    const { qb, matcher, cache } = await getServices();

    try {
      console.log(chalk.blue('Fetching torrents from qBittorrent...'));
      const torrents = await qb.getTorrents();
      
      console.log(chalk.white(`${'Name'.padEnd(40)} | ${'Progress'.padEnd(10)} | ${'Media Title'.padEnd(30)}`));
      console.log('-'.repeat(85));

      for (const torrent of torrents) {
        // Try to get from cache first
        let metadata = await cache.getMetadataForTorrent(torrent.hash);
        
        // If not in cache, match it
        if (!metadata) {
          metadata = await matcher.match(torrent);
          if (metadata) {
            await cache.saveMetadataForTorrent(torrent, metadata);
          }
        }

        const name = torrent.name.length > 37 ? torrent.name.slice(0, 37) + '...' : torrent.name;
        const progress = (torrent.progress * 100).toFixed(1) + '%';
        const mediaTitle = metadata ? metadata.title : chalk.gray('Unknown');

        console.log(`${name.padEnd(40)} | ${progress.padEnd(10)} | ${mediaTitle}`);
      }
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('show <hash>')
  .description('Show details for a specific torrent')
  .action(async (hash) => {
    const { qb, matcher, cache } = await getServices();

    try {
      const torrents = await qb.getTorrents();
      const torrent = torrents.find(t => t.hash === hash);

      if (!torrent) {
        console.error(chalk.red(`Error: Torrent with hash ${hash} not found.`));
        return;
      }

      let metadata = await cache.getMetadataForTorrent(torrent.hash);
      if (!metadata) {
        metadata = await matcher.match(torrent);
        if (metadata) {
          await cache.saveMetadataForTorrent(torrent, metadata);
        }
      }

      console.log(chalk.bold.blue(`\nTorrent: ${torrent.name}`));
      console.log(chalk.gray(`Hash: ${torrent.hash}`));
      console.log(`Status: ${torrent.state} | Progress: ${(torrent.progress * 100).toFixed(1)}%`);

      if (metadata) {
        console.log(chalk.bold.green(`\nMedia: ${metadata.title} (${metadata.year})`));
        console.log(chalk.white(`\nPlot: ${metadata.plot}`));
        console.log(chalk.white(`\nCast: ${metadata.cast.join(', ')}`));
        if (metadata.posterPath) {
          console.log(chalk.gray(`\nPoster: ${metadata.posterPath}`));
        }
      } else {
        console.log(chalk.yellow('\nNo media metadata found.'));
      }
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program.parse(process.argv);
