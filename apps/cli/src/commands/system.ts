import { Command } from 'commander';
import chalk from 'chalk';
import { getClient, handleError, formatBytes } from '../client.js';

export function registerSystemCommands(program: Command) {
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
      } catch (error) {
        handleError(error);
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
      } catch (error) {
        handleError(error);
      }
    });
}
