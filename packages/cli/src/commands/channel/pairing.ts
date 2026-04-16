import type { CommandModule } from 'yargs';
import { PairingStore } from '@qwen-code/channel-base';
import { writeStderrLine, writeStdoutLine } from '../../utils/stdioHelpers.js';
import { t } from '../../i18n/index.js';

export const pairingListCommand: CommandModule<object, { name: string }> = {
  command: 'list <name>',
  describe: t('List pending pairing requests for a channel'),
  builder: (yargs) =>
    yargs.positional('name', {
      type: 'string',
      describe: t('Channel name'),
      demandOption: true,
    }),
  handler: (argv) => {
    const store = new PairingStore(argv.name);
    const pending = store.listPending();

    if (pending.length === 0) {
      writeStdoutLine('No pending pairing requests.');
      return;
    }

    writeStdoutLine(`Pending pairing requests for "${argv.name}":\n`);
    for (const req of pending) {
      const ago = Math.round((Date.now() - req.createdAt) / 60000);
      writeStdoutLine(
        `  Code: ${req.code}  Sender: ${req.senderName} (${req.senderId})  ${ago}m ago`,
      );
    }
  },
};

export const pairingApproveCommand: CommandModule<
  object,
  { name: string; code: string }
> = {
  command: 'approve <name> <code>',
  describe: t('Approve a pending pairing request'),
  builder: (yargs) =>
    yargs
      .positional('name', {
        type: 'string',
        describe: t('Channel name'),
        demandOption: true,
      })
      .positional('code', {
        type: 'string',
        describe: t('Pairing code'),
        demandOption: true,
      }),
  handler: (argv) => {
    const store = new PairingStore(argv.name);
    const request = store.approve(argv.code);

    if (!request) {
      writeStderrLine(
        `No pending request found for code "${argv.code.toUpperCase()}". It may have expired.`,
      );
      process.exit(1);
    }

    writeStdoutLine(
      `Approved: ${request.senderName} (${request.senderId}) can now use channel "${argv.name}".`,
    );
  },
};
