/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { createDebugLogger } from '@qwen-code/qwen-code-core';
import { t } from '../i18n/index.js';

const debugLogger = createDebugLogger('HOOKS_UI');

export const hooksCommand: CommandModule = {
  command: 'hooks',
  aliases: ['hook'],
  describe: t('Manage Qwen Code hooks (use /hooks in interactive mode).'),
  builder: (yargs) => yargs.version(false).help(false),
  handler: () => {
    // In CLI mode, this command is not interactive.
    // Users should use /hooks in interactive mode for the full UI experience.
    debugLogger.debug(
      'Use /hooks in interactive mode to manage hooks with the UI.',
    );
    process.exit(0);
  },
};
