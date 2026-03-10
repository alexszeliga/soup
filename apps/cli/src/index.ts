#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import path from 'path';
import { registerTorrentCommands } from './commands/torrents.js';
import { registerMetadataCommands } from './commands/metadata.js';
import { registerFileCommands } from './commands/files.js';
import { registerIngestionCommands } from './commands/ingestion.js';
import { registerSystemCommands } from './commands/system.js';

// Support both local development (.env in root) and environment-level config
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const program = new Command();

program
  .name('soup')
  .description('A remote CLI for Soup media manager')
  .version('0.1.0');

// Register modular commands
registerTorrentCommands(program);
registerMetadataCommands(program);
registerFileCommands(program);
registerIngestionCommands(program);
registerSystemCommands(program);

program.addHelpText('after', `
Examples:
  $ soup list                          # List all torrents
  $ soup add magnet:?xt=urn:btih:...   # Add a magnet link
  $ soup ingest <hash>                 # Preview and queue ingestion
  $ soup show <hash>                   # See full metadata and files
  $ soup priority <hash> 0,1 skip      # Skip first two files
`);

program.parse(process.argv);
