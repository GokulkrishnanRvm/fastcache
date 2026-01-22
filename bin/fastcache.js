#!/usr/bin/env node

const { program } = require('commander');
const FastCache = require('../src/index');
const chalk = require('chalk');

// ASCII Art Logo
console.log(chalk.cyan(`
  ______        _   _____           _          
 |  ____|      | | / ____|         | |         
 | |__ __ _ ___| || |     __ _  ___| |__   ___ 
 |  __/ _\` / __| || |    / _\` |/ __| '_ \\ / _ \\
 | | | (_| \\__ | || |___| (_| | (__| | | |  __/
 |_|  \\__,_|___| | \\_____\\__,_|\\___|_| |_|\\___|
                |_|                             
`));

program
  .name('fastcache')
  .description('Intelligent package manager with system-wide dependency sharing')
  .version('0.1.0');

// Install command
program
  .command('install')
  .alias('i')
  .description('Install dependencies from package.json')
  .action(async () => {
    try {
      const fc = new FastCache();
      await fc.init();
      await fc.install(process.cwd());
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Add command
program
  .command('add <packages...>')
  .description('Add one or more packages')
  .action(async (packages) => {
    try {
      const fc = new FastCache();
      await fc.init();
      await fc.add(packages, process.cwd());
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Stats command
program
  .command('stats')
  .description('Show cache statistics and savings')
  .action(async () => {
    try {
      const fc = new FastCache();
      await fc.init();
      await fc.showStats();
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Clean command
program
  .command('clean')
  .description('Clean unused packages from cache')
  .option('--dry-run', 'Show what would be deleted without deleting')
  .option('--days <number>', 'Remove packages unused for N days', '30')
  .action(async (options) => {
    try {
      const fc = new FastCache();
      await fc.init();
      await fc.clean(parseInt(options.days), options.dryRun || false);
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .alias('ls')
  .description('List all cached packages')
  .action(async () => {
    try {
      const fc = new FastCache();
      await fc.init();
      await fc.list();
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Help on no command
if (process.argv.length === 2) {
  program.help();
}

program.parse();