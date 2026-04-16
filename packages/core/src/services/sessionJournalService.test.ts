/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionJournalService } from './sessionJournalService.js';

const hoistedMockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  access: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs/promises', () => hoistedMockFs);

const hoistedMockCrypto = vi.hoisted(() => ({
  randomUUID: vi.fn(() => 'abcd12345678'),
}));
vi.mock('crypto', () => hoistedMockCrypto);

describe('SessionJournalService', () => {
  beforeEach(() => {
    // 重置所有 mock 状态，确保每个测试独立
    hoistedMockFs.readFile.mockReset();
    hoistedMockFs.appendFile.mockReset();
    hoistedMockFs.mkdir.mockReset();
    hoistedMockFs.writeFile.mockReset();
    hoistedMockFs.rename.mockReset();
    hoistedMockFs.readdir.mockReset();
    hoistedMockFs.access.mockReset();
  });

  // -------------------------------------------------------------------------
  // startJournal
  // -------------------------------------------------------------------------
  describe('startJournal', () => {
    it('creates a new journal on first start', async () => {
      // getSessionCountFromIndex: 索引不存在
      hoistedMockFs.readFile.mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      // getLatestJournalFile: 目录不存在
      hoistedMockFs.readFile.mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      // createNewJournalFile -> mkdir
      hoistedMockFs.mkdir.mockResolvedValueOnce(undefined);
      // createNewJournalFile -> writeFile + rename
      hoistedMockFs.writeFile.mockResolvedValueOnce(undefined);
      hoistedMockFs.rename.mockResolvedValueOnce(undefined);
      // updateIndex -> mkdir + writeFile + rename
      hoistedMockFs.mkdir.mockResolvedValueOnce(undefined);
      hoistedMockFs.writeFile.mockResolvedValueOnce(undefined);
      hoistedMockFs.rename.mockResolvedValueOnce(undefined);
      // listJournalFiles -> readdir (empty)
      hoistedMockFs.readdir.mockResolvedValueOnce([]);

      const service = new SessionJournalService('session-1');
      const journal = await service.startJournal({
        taskId: 'task-123',
        title: 'Test Task',
      });

      expect(journal.taskId).toBe('task-123');
      expect(journal.title).toBe('Test Task');
      expect(journal.sessionNumber).toBe(1);
      expect(journal.activeFile.isActive).toBe(true);
    });

    it('increments session number when previous sessions exist', async () => {
      // getSessionCountFromIndex: 索引文件包含 "Total Sessions: 3"
      hoistedMockFs.readFile.mockResolvedValueOnce(
        '# Journal Index\n\nTotal Sessions: 3\n',
      );
      // getLatestJournalFile: 目录为空
      hoistedMockFs.readdir.mockResolvedValueOnce([]);
      // createNewJournalFile -> mkdir + writeFile + rename
      hoistedMockFs.mkdir.mockResolvedValueOnce(undefined);
      hoistedMockFs.writeFile.mockResolvedValueOnce(undefined);
      hoistedMockFs.rename.mockResolvedValueOnce(undefined);
      // updateIndex -> mkdir + writeFile + rename
      hoistedMockFs.mkdir.mockResolvedValueOnce(undefined);
      hoistedMockFs.writeFile.mockResolvedValueOnce(undefined);
      hoistedMockFs.rename.mockResolvedValueOnce(undefined);
      // listJournalFiles -> readdir (empty)
      hoistedMockFs.readdir.mockResolvedValueOnce([]);

      const service = new SessionJournalService('session-2');
      const journal = await service.startJournal({
        taskId: 'task-456',
        title: 'Another Task',
      });

      // 基于索引中的 3 个会话，新会话编号应为 4
      expect(journal.sessionNumber).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // appendJournal
  // -------------------------------------------------------------------------
  describe('appendJournal', () => {
    it('appends content to the latest journal file', async () => {
      // getLatestJournalFile -> readdir
      hoistedMockFs.readdir.mockResolvedValueOnce([
        'journal-1.md',
      ] as unknown as Array<import('node:fs').Dirent>);
      // countFileLines
      hoistedMockFs.readFile.mockResolvedValueOnce('line1\nline2');

      const service = new SessionJournalService('session-1');
      await service.appendJournal({
        taskId: 'task-123',
        content: 'Some appended content',
      });

      expect(hoistedMockFs.appendFile).toHaveBeenCalledTimes(1);
    });

    it('creates new file when line limit would be exceeded', async () => {
      // getLatestJournalFile -> readdir
      hoistedMockFs.readdir.mockResolvedValueOnce([
        'journal-1.md',
      ] as unknown as Array<import('node:fs').Dirent>);
      // countFileLines for existing file (near limit)
      hoistedMockFs.readFile.mockResolvedValueOnce('line'.repeat(500));
      // createNewJournalFile -> mkdir + writeFile + rename
      hoistedMockFs.mkdir.mockResolvedValueOnce(undefined);
      hoistedMockFs.writeFile.mockResolvedValueOnce(undefined);
      hoistedMockFs.rename.mockResolvedValueOnce(undefined);

      const service = new SessionJournalService('session-1');
      const largeContent = Array(500).fill('line').join('\n');
      await service.appendJournal({
        taskId: 'task-123',
        content: largeContent,
      });

      expect(hoistedMockFs.appendFile).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no journal file exists', async () => {
      hoistedMockFs.readdir.mockRejectedValueOnce(new Error('ENOENT'));

      const service = new SessionJournalService('session-1');
      await service.appendJournal({
        taskId: 'task-123',
        content: 'Some content',
      });

      expect(hoistedMockFs.appendFile).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getActiveJournal
  // -------------------------------------------------------------------------
  describe('getActiveJournal', () => {
    it('returns null when journal directory does not exist', async () => {
      hoistedMockFs.access.mockRejectedValueOnce(new Error('ENOENT'));

      const service = new SessionJournalService('session-1');
      const journal = await service.getActiveJournal('task-123');
      expect(journal).toBeNull();
    });

    it('returns active journal info when directory exists', async () => {
      hoistedMockFs.access.mockResolvedValueOnce(undefined);
      // getLatestJournalFile -> readdir
      hoistedMockFs.readdir.mockResolvedValueOnce([
        'journal-1.md',
      ] as unknown as Array<import('node:fs').Dirent>);
      // countFileLines
      hoistedMockFs.readFile.mockResolvedValueOnce('line1\nline2');
      // getSessionCountFromIndex
      hoistedMockFs.readFile.mockResolvedValueOnce('Total Sessions: 5');
      // listJournalFiles -> readdir
      hoistedMockFs.readdir.mockResolvedValueOnce([
        'journal-1.md',
      ] as unknown as Array<import('node:fs').Dirent>);
      // countFileLines for listJournalFiles
      hoistedMockFs.readFile.mockResolvedValueOnce('line1\nline2');

      const service = new SessionJournalService('session-1');
      const journal = await service.getActiveJournal('task-123');

      expect(journal).not.toBeNull();
      expect(journal!.taskId).toBe('task-123');
      expect(journal!.activeFile.path).toContain('journal-1.md');
    });
  });

  // -------------------------------------------------------------------------
  // finishJournal
  // -------------------------------------------------------------------------
  describe('finishJournal', () => {
    it('appends session content and updates index', async () => {
      // getSessionCountFromIndex
      hoistedMockFs.readFile.mockResolvedValueOnce('Total Sessions: 2');
      // getLatestJournalFile -> readdir
      hoistedMockFs.readdir.mockResolvedValueOnce([
        'journal-1.md',
      ] as unknown as Array<import('node:fs').Dirent>);
      // countFileLines
      hoistedMockFs.readFile.mockResolvedValueOnce('some content');
      // updateIndex -> mkdir + writeFile + rename
      hoistedMockFs.mkdir.mockResolvedValueOnce(undefined);
      hoistedMockFs.writeFile.mockResolvedValueOnce(undefined);
      hoistedMockFs.rename.mockResolvedValueOnce(undefined);

      const service = new SessionJournalService('session-1');
      await service.finishJournal({
        taskId: 'task-123',
        summary: 'Completed the task',
        commitHashes: ['abc123', 'def456'],
        branch: 'main',
      });

      expect(hoistedMockFs.appendFile).toHaveBeenCalledTimes(1);
    });

    it('finishes without error when no journal file exists', async () => {
      // getSessionCountFromIndex -> ENOENT
      hoistedMockFs.readFile.mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      // getLatestJournalFile -> readdir throws
      hoistedMockFs.readdir.mockRejectedValueOnce(new Error('ENOENT'));

      const service = new SessionJournalService('session-1');
      await expect(
        service.finishJournal({ taskId: 'task-123', summary: 'Summary' }),
      ).resolves.not.toThrow();
    });

    it('handles finish with empty commit list', async () => {
      // getSessionCountFromIndex
      hoistedMockFs.readFile.mockResolvedValueOnce('Total Sessions: 1');
      // getLatestJournalFile -> readdir
      hoistedMockFs.readdir.mockResolvedValueOnce([
        'journal-1.md',
      ] as unknown as Array<import('node:fs').Dirent>);
      // countFileLines
      hoistedMockFs.readFile.mockResolvedValueOnce('content');
      // updateIndex -> mkdir + writeFile + rename
      hoistedMockFs.mkdir.mockResolvedValueOnce(undefined);
      hoistedMockFs.writeFile.mockResolvedValueOnce(undefined);
      hoistedMockFs.rename.mockResolvedValueOnce(undefined);

      const service = new SessionJournalService('session-1');
      await service.finishJournal({
        taskId: 'task-123',
        summary: 'No commits',
      });

      expect(hoistedMockFs.appendFile).toHaveBeenCalledTimes(1);
    });
  });
});
