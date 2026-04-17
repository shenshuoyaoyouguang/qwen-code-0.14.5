/**
 * SessionStartContext - Session Start Context Builder
 *
 * Provides context data for the SessionStart hook event.
 * This is the primary (TypeScript) implementation for Qwen Code.
 *
 * Architecture:
 *   - This service provides context when the Python session-start.py hook
 *     is NOT available or not invoked.
 *   - The Python hook is a reference implementation for Trellis environments.
 *   - This TypeScript service is the Qwen Code native implementation.
 *
 * Context sources:
 *   1. Active task info (from TaskService)
 *   2. Relevant specs (from specLoader)
 *   3. Recent journal summary (from sessionJournalService)
 *   4. Quick reference
 *
 * Output format matches SessionStartOutput.hookSpecificOutput.additionalContext
 * protocol from packages/core/src/hooks/types.ts.
 */
import * as path from 'node:path';
import { createDebugLogger } from '../utils/debugLogger.js';
import { TaskService } from './taskService.js';
import { SessionJournalService } from './sessionJournalService.js';
import {
  loadRelevantSpecs,
  formatSpecsForPrompt,
  type TaskContext,
} from './specLoader.js';
import type { TaskStatus } from '../tools/taskTypes.js';

const debugLogger = createDebugLogger('SessionStartContext');

const JOURNAL_LINE_LIMIT = 2000;
const DEFAULT_MAX_SPEC_LENGTH = 8000;

// ============================================================================
// Types
// ============================================================================

export interface ActiveTaskInfo {
  id: string;
  name: string;
  title: string;
  status: string;
  priority: string;
  description?: string;
  dev_type?: string;
  scope?: string;
  tags?: string[];
}

export interface JournalSummary {
  file: string;
  lineCount: number;
  nearLimit: boolean;
}

export interface SessionStartContextOptions {
  workspaceRoot: string;
  sessionId?: string;
  includeSpecs?: boolean;
  maxSpecLength?: number;
}

// ============================================================================
// 任务信息
// ============================================================================

async function getActiveTaskInfo(
  sessionId: string,
): Promise<ActiveTaskInfo | null> {
  try {
    const taskService = new TaskService(sessionId);
    const tasks = await taskService.listTasks({
      status: ['in_progress'] as TaskStatus[],
    });
    if (tasks.length === 0) return null;
    const task = tasks[0];
    return {
      id: task.id,
      name: task.name,
      title: task.title,
      status: task.status,
      priority: task.priority,
      description: task.description,
      dev_type: task.dev_type,
      scope: task.scope,
      tags: task.tags ?? [],
    };
  } catch {
    return null;
  }
}

async function getAllActiveTasks(sessionId: string): Promise<ActiveTaskInfo[]> {
  try {
    const taskService = new TaskService(sessionId);
    const inProgress = await taskService.listTasks({
      status: ['in_progress'] as TaskStatus[],
    });
    const planning = await taskService.listTasks({
      status: ['planning'] as TaskStatus[],
    });
    const all = [...inProgress, ...planning].slice(0, 5);
    return all.map((t) => ({
      id: t.id,
      name: t.name,
      title: t.title,
      status: t.status,
      priority: t.priority,
      description: t.description,
      dev_type: t.dev_type,
      scope: t.scope,
      tags: t.tags ?? [],
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// Journal 摘要
// ============================================================================

async function getJournalSummary(
  taskId: string,
  sessionId: string,
): Promise<JournalSummary | null> {
  try {
    const journalService = new SessionJournalService(sessionId);
    const journal = await journalService.getActiveJournal(taskId);
    if (!journal || !journal.activeFile) return null;
    return {
      file: journal.activeFile.path,
      lineCount: journal.activeFile.lineCount,
      nearLimit: journal.activeFile.lineCount > JOURNAL_LINE_LIMIT * 0.9,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// 格式化函数
// ============================================================================

function formatCurrentTaskSection(task: ActiveTaskInfo | null): string {
  if (!task) {
    return '## Current Task\n\n(none)\n';
  }
  const desc = task.description ? task.description.slice(0, 200) : '';
  let s = '## Current Task\n';
  s += `- **ID**: \`${task.id}\`\n`;
  s += `- **Title**: ${task.title}\n`;
  s += `- **Status**: \`${task.status}\`\n`;
  s += `- **Priority**: ${task.priority}\n`;
  if (desc) s += `- **Description**: ${desc}\n`;
  if (task.scope) s += `- **Scope**: ${task.scope}\n`;
  if (task.dev_type) s += `- **Type**: ${task.dev_type}\n`;
  return s + '\n';
}

function formatActiveTasksSection(tasks: ActiveTaskInfo[]): string {
  if (!tasks.length) {
    return '## Active Tasks\n\n(none)\n';
  }
  let s = '## Active Tasks\n';
  for (const t of tasks) {
    s += `- \`${t.id}\` [\`${t.status}\`] ${t.priority} - ${t.title}\n`;
  }
  return s + '\n';
}

function formatJournalSection(s: JournalSummary | null): string {
  if (!s) {
    return '## Recent Journal\n\n(no journal)\n';
  }
  const rel = path.isAbsolute(s.file) ? path.basename(s.file) : s.file;
  let msg = '## Recent Journal\n';
  msg += `- **Active file**: ${rel}\n`;
  msg += `- **Line count**: ${s.lineCount} / ${JOURNAL_LINE_LIMIT}`;
  if (s.nearLimit) msg += '\n- **WARNING**: Approaching line limit!';
  return msg + '\n\n';
}

function formatSpecsSection(specs: string, maxLen: number): string {
  if (!specs.trim()) return '';
  const content =
    specs.length > maxLen ? specs.slice(0, maxLen - 3) + '...' : specs;
  return `## Project Specifications\n\n${content}\n`;
}

function formatQuickReferenceSection(): string {
  return (
    '## Quick Reference\n\n' +
    '- Run `/task list` to see all tasks\n' +
    '- Run `/task start <id>` to start a task\n' +
    '- Run `/task finish <id>` to complete a task\n' +
    '- Read `.qwen/spec/guides/index.md` for project guidelines\n' +
    '- Run `/init --spec` to initialize spec templates\n\n'
  );
}

// ============================================================================
// 公开 API
// ============================================================================

/**
 * 构建 SessionStart additionalContext
 *
 * @param opts - 配置选项
 * @returns 格式化的上下文文本，可直接注入 additionalContext
 */
export async function buildSessionStartContext(
  opts: SessionStartContextOptions,
): Promise<string> {
  const {
    workspaceRoot,
    sessionId = 'default',
    includeSpecs = true,
    maxSpecLength = DEFAULT_MAX_SPEC_LENGTH,
  } = opts;

  if (!workspaceRoot) return '';

  debugLogger.debug(
    `[SessionStartContext] Building context for workspace: ${workspaceRoot}, session: ${sessionId}`,
  );

  const activeTask = await getActiveTaskInfo(sessionId);

  const [activeTasks, journal] = await Promise.all([
    getAllActiveTasks(sessionId),
    activeTask
      ? getJournalSummary(activeTask.id, sessionId)
      : Promise.resolve(null),
  ]);

  let specsContent = '';
  if (includeSpecs && activeTask) {
    try {
      const ctx: TaskContext = {
        scope: activeTask.scope,
        dev_type: activeTask.dev_type,
        tags: activeTask.tags,
      };
      const loaded = await loadRelevantSpecs(workspaceRoot, ctx);
      specsContent = formatSpecsForPrompt(loaded.entries, workspaceRoot);
    } catch (err) {
      debugLogger.warn(
        `[SessionStartContext] Failed to load specs: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const sections = [
    formatCurrentTaskSection(activeTask),
    formatActiveTasksSection(
      activeTasks.filter((t) => t.id !== activeTask?.id),
    ),
    formatJournalSection(journal),
  ];

  if (specsContent) {
    sections.push(formatSpecsSection(specsContent, maxSpecLength));
  }

  sections.push(formatQuickReferenceSection());

  return sections.join('');
}

/**
 * 简易封装
 */
export async function buildSessionStartContextSimple(
  workspaceRoot: string,
  sessionId: string,
): Promise<string> {
  return buildSessionStartContext({ workspaceRoot, sessionId });
}
