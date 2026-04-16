/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini mcp' command
import type { CommandModule, Argv } from 'yargs';
import { addCommand } from './mcp/add.js';
import { removeCommand } from './mcp/remove.js';
import { listCommand } from './mcp/list.js';
import { reconnectCommand } from './mcp/reconnect.js';
import { t } from '../i18n/index.js';

export const mcpCommand: CommandModule = {
  command: 'mcp',
  describe: t('Manage MCP servers'),
  builder: (yargs: Argv) =>
    yargs
      .command(addCommand)
      .command(removeCommand)
      .command(listCommand)
      .command(reconnectCommand)
      .demandCommand(1, t('You need at least one command before continuing.'))
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
    // thanks to demandCommand(1) in the builder.
  },
};
