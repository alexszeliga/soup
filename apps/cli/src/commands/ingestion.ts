import { Command } from 'commander';
import chalk from 'chalk';
import { getClient, handleError } from '../client.js';

export function registerIngestionCommands(program: Command) {
  program
    .command('libraries')
    .description('List available media ingestion libraries')
    .action(async () => {
      const client = getClient();
      try {
        const libraries = await client.getLibraries();
        console.log(chalk.blue('Available libraries:'));
        libraries.forEach(l => console.log(`- ${l}`));
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
      }
    });
}
