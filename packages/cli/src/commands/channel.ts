import type { CommandModule, Argv } from 'yargs';
import { startCommand } from './channel/start.js';
import { stopCommand } from './channel/stop.js';
import { statusCommand } from './channel/status.js';
import {
  pairingListCommand,
  pairingApproveCommand,
} from './channel/pairing.js';
import { configureWeixinCommand } from './channel/configure.js';
import { t } from '../i18n/index.js';

const pairingCommand: CommandModule = {
  command: 'pairing',
  describe: t('Manage DM pairing requests'),
  builder: (yargs: Argv) =>
    yargs
      .command(pairingListCommand)
      .command(pairingApproveCommand)
      .demandCommand(1, t('You need at least one command before continuing.'))
      .version(false),
  handler: () => {},
};

export const channelCommand: CommandModule = {
  command: 'channel',
  describe: t('Manage messaging channels (Telegram, Discord, etc.)'),
  builder: (yargs: Argv) =>
    yargs
      .command(startCommand)
      .command(stopCommand)
      .command(statusCommand)
      .command(pairingCommand)
      .command(configureWeixinCommand)
      .demandCommand(1, t('You need at least one command before continuing.'))
      .version(false),
  handler: () => {},
};
