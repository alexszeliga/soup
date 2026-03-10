import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { getClient, handleError, formatDuration } from '../client.js';

export function registerTorrentCommands(program: Command) {
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
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command('show <hash>')
    .description('Show details for a specific torrent')
    .action(async (hash) => {
      const client = getClient();
      try {
        const torrents = await client.getFocusedTorrents(hash);
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
      }
    });
}
