import { Command } from 'commander';
import chalk from 'chalk';
import { getClient, handleError, formatBytes } from '../client.js';

export function registerFileCommands(program: Command) {
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
      }
    });
}
