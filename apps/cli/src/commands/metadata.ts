import { Command } from 'commander';
import chalk from 'chalk';
import { getClient, handleError } from '../client.js';

export function registerMetadataCommands(program: Command) {
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
      }
    });
}
