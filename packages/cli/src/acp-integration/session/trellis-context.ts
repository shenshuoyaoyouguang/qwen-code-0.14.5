/**
 * TrellisContextAggregator - 上下文聚合器
 *
 * 从 Trellis 项目移植，提供会话上下文聚合功能
 *
 * 功能：
 * - 聚合开发者信息、Git 状态、任务信息、Journal 状态
 * - 输出格式化的文本上下文或 JSON 格式上下文
 * - 供 SessionStart 钩子自动注入当前任务上下文到 Qwen 系统提示
 *
 * 参考：Trellis 的 session_context.py 和 get_context.py
 */

import { simpleGit } from 'simple-git';
import path from 'node:path';
import fs from 'node:fs';
import type { TaskStatus } from '../../../../core/src/tools/taskTypes.js';
import { createDebugLogger } from '../../../../core/src/utils/debugLogger.js';

const debugLogger = createDebugLogger('TrellisContextAggregator');

/**
 * Git 提交信息
 */
export interface GitCommit {
  hash: string;
  message: string;
}

/**
 * Git 上下文信息
 */
export interface GitContext {
  branch: string;
  isClean: boolean;
  uncommittedChanges: number;
  recentCommits: GitCommit[];
}

/**
 * 活跃任务信息
 */
export interface ActiveTask {
  id: string;
  name: string;
  status: TaskStatus;
  children: string[];
  parent?: string;
}

/**
 * 当前任务信息
 */
export interface CurrentTaskInfo {
  id: string;
  name: string;
  status: TaskStatus;
  description?: string;
}

/**
 * Journal 文件信息
 */
export interface JournalInfo {
  file: string;
  lines: number;
  nearLimit: boolean;
}

/**
 * 完整的 Trellis 上下文 JSON 结构
 */
export interface TrellisContext {
  developer: string;
  git: GitContext;
  tasks: {
    active: ActiveTask[];
    directory: string;
  };
  currentTask?: CurrentTaskInfo;
  journal: JournalInfo;
}

// ==================== 常量定义 ====================

/** Trellis 工作流目录名称 */
const DIR_WORKFLOW = '.trellis';
/** 开发者配置文件名称 */
const FILE_DEVELOPER = '.developer';
/** 当前任务配置文件名称 */
const FILE_CURRENT_TASK = '.current-task';
/** Journal 文件名前缀 */
const FILE_JOURNAL_PREFIX = 'journal-';
/** Journal 文件行数限制 */
const JOURNAL_LINE_LIMIT = 2000;

// ==================== 任务数据接口 ====================

/**
 * 任务数据 - 对应 Trellis task.json 结构
 */
interface TaskData {
  id: string;
  name: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: string;
  parent?: string;
  children: string[];
  tags: string[];
  notes: string[];
  created_at: string;
  updated_at: string;
}

// ==================== 辅助函数 ====================

/**
 * 获取项目根目录
 * 查找包含 .trellis/ 目录的最近祖先目录
 */
function getRepoRoot(projectRoot: string): string {
  let current = path.resolve(projectRoot);
  const root = path.parse(current).root;
  const MAX_DEPTH = 20;
  let depth = 0;

  while (current !== root && depth < MAX_DEPTH) {
    depth++;
    const trellisPath = path.join(current, DIR_WORKFLOW);
    if (fs.existsSync(trellisPath)) {
      return current;
    }
    current = path.dirname(current);
  }

  // 如果找不到 .trellis/ 目录，返回传入的目录
  return projectRoot;
}

/**
 * 获取开发者名称
 * 从 .trellis/.developer 文件中读取
 */
function getDeveloper(projectRoot: string): string | null {
  const repoRoot = getRepoRoot(projectRoot);
  const devFile = path.join(repoRoot, DIR_WORKFLOW, FILE_DEVELOPER);

  if (!fs.existsSync(devFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(devFile, 'utf-8');
    for (const line of content.split('\n')) {
      if (line.startsWith('name=')) {
        return line.split('=', 1)[1].trim();
      }
    }
  } catch {
    // 读取失败，返回 null
  }

  return null;
}

/**
 * 获取当前任务路径
 * 从 .trellis/.current-task 文件中读取
 */
function getCurrentTaskPath(projectRoot: string): string | null {
  const repoRoot = getRepoRoot(projectRoot);
  const currentTaskFile = path.join(repoRoot, DIR_WORKFLOW, FILE_CURRENT_TASK);

  if (!fs.existsSync(currentTaskFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(currentTaskFile, 'utf-8').trim();
    return content || null;
  } catch {
    return null;
  }
}

/**
 * 获取活跃的 Journal 文件
 */
function getActiveJournalFile(projectRoot: string): string | null {
  const repoRoot = getRepoRoot(projectRoot);
  const developer = getDeveloper(repoRoot);

  if (!developer) {
    return null;
  }

  const workspaceDir = path.join(
    repoRoot,
    DIR_WORKFLOW,
    'workspace',
    developer,
  );

  if (!fs.existsSync(workspaceDir)) {
    return null;
  }

  let latestFile: string | null = null;
  let highest = 0;

  try {
    const files = fs.readdirSync(workspaceDir);
    for (const file of files) {
      if (file.startsWith(FILE_JOURNAL_PREFIX) && file.endsWith('.md')) {
        const match = file.match(/(\d+)\.md$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > highest) {
            highest = num;
            latestFile = path.join(workspaceDir, file);
          }
        }
      }
    }
  } catch {
    // 目录读取失败
  }

  return latestFile;
}

/**
 * 统计文件行数
 */
function countLines(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

/**
 * 运行 Git 命令并返回结果
 */
async function runGitCommand(
  args: string[],
  cwd: string,
): Promise<{ success: boolean; output: string; error: string }> {
  try {
    const git = simpleGit(cwd);
    const output = await git.raw(args);
    return { success: true, output: output.trim(), error: '' };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error };
  }
}

/**
 * 获取 Git 上下文信息
 */
async function getGitContext(projectRoot: string): Promise<GitContext> {
  const repoRoot = getRepoRoot(projectRoot);

  // 获取当前分支
  const branchResult = await runGitCommand(
    ['branch', '--show-current'],
    repoRoot,
  );
  const branch = branchResult.success
    ? branchResult.output || 'unknown'
    : 'unknown';

  // 获取工作目录状态
  const statusResult = await runGitCommand(['status', '--porcelain'], repoRoot);
  const statusLines = statusResult.success
    ? statusResult.output.split('\n').filter((line) => line.trim())
    : [];
  const uncommittedChanges = statusLines.length;
  const isClean = uncommittedChanges === 0;

  // 获取最近提交
  const logResult = await runGitCommand(['log', '--oneline', '-5'], repoRoot);
  const recentCommits: GitCommit[] = [];

  if (logResult.success && logResult.output) {
    for (const line of logResult.output.split('\n')) {
      if (line.trim()) {
        const spaceIndex = line.indexOf(' ');
        if (spaceIndex > 0) {
          recentCommits.push({
            hash: line.substring(0, spaceIndex),
            message: line.substring(spaceIndex + 1),
          });
        }
      }
    }
  }

  return {
    branch,
    isClean,
    uncommittedChanges,
    recentCommits,
  };
}

/**
 * 从文件系统读取任务列表（读取 task.json 文件）
 */
async function readTasksFromFileSystem(
  projectRoot: string,
): Promise<TaskData[]> {
  const repoRoot = getRepoRoot(projectRoot);
  const tasksDir = path.join(repoRoot, DIR_WORKFLOW, 'tasks');

  if (!fs.existsSync(tasksDir)) {
    return [];
  }

  const tasks: TaskData[] = [];

  try {
    const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') {
        continue;
      }

      const taskFile = path.join(tasksDir, entry.name, 'task.json');
      if (fs.existsSync(taskFile)) {
        try {
          const content = fs.readFileSync(taskFile, 'utf-8');
          const data = JSON.parse(content) as Partial<TaskData>;
          tasks.push({
            id: data.id || entry.name,
            name: data.name || entry.name,
            title: data.title || data.name || entry.name,
            description: data.description,
            status: data.status || 'planning',
            priority: data.priority,
            parent: data.parent,
            children: data.children || [],
            tags: data.tags || [],
            notes: data.notes || [],
            created_at: data.created_at || new Date().toISOString(),
            updated_at: data.updated_at || new Date().toISOString(),
          });
        } catch (parseErr) {
          debugLogger.warn(
            `[TrellisContextAggregator] Failed to parse task file ${taskFile}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          );
        }
      }
    }
  } catch (dirErr) {
    debugLogger.warn(
      `[TrellisContextAggregator] Failed to read tasks directory ${tasksDir}: ${dirErr instanceof Error ? dirErr.message : String(dirErr)}`,
    );
  }

  return tasks;
}

// ==================== TrellisContextAggregator 类 ====================

/**
 * TrellisContextAggregator - 上下文聚合器
 *
 * 聚合来自不同服务的上下文信息，提供统一的文本和 JSON 输出
 */
export class TrellisContextAggregator {
  private readonly projectRoot: string;

  /**
   * 创建上下文聚合器实例
   * @param projectRoot - 项目根目录路径
   */
  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  /**
   * 获取活跃任务列表
   */
  private async getActiveTasks(): Promise<ActiveTask[]> {
    try {
      const tasks = await readTasksFromFileSystem(this.projectRoot);
      return tasks.map((task) => ({
        id: task.id,
        name: task.name,
        status: task.status,
        children: task.children || [],
        parent: task.parent,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取当前任务信息
   */
  private async getCurrentTask(): Promise<CurrentTaskInfo | undefined> {
    const currentTaskPath = getCurrentTaskPath(this.projectRoot);
    if (!currentTaskPath) {
      return undefined;
    }

    // 从 .current-task 文件中提取任务目录名作为 id
    const taskDir = path.basename(currentTaskPath);
    const taskId = taskDir.replace(/^tasks\//, '');

    // 尝试从任务文件获取任务详情
    try {
      const tasks = await readTasksFromFileSystem(this.projectRoot);
      const task = tasks.find((t) => t.name === taskId || t.id === taskId);
      if (task) {
        return {
          id: task.id,
          name: task.name,
          status: task.status,
          description: task.description,
        };
      }
    } catch {
      // 忽略错误
    }

    // 返回基本信息（不包含描述）
    return {
      id: taskId,
      name: taskId,
      status: 'in_progress',
    };
  }

  /**
   * 获取 Journal 信息
   */
  private getJournalInfo(): JournalInfo {
    const journalFile = getActiveJournalFile(this.projectRoot);

    if (!journalFile) {
      return {
        file: '',
        lines: 0,
        nearLimit: false,
      };
    }

    const repoRoot = getRepoRoot(this.projectRoot);
    const relativePath = journalFile
      .replace(repoRoot, '')
      .replace(/^[/\\]/, '');
    const lines = countLines(journalFile);

    return {
      file: relativePath,
      lines,
      nearLimit: lines > 1800,
    };
  }

  /**
   * 构建完整的 JSON 上下文
   */
  async buildContextJson(): Promise<TrellisContext> {
    const repoRoot = getRepoRoot(this.projectRoot);
    const developer = getDeveloper(repoRoot) || 'Unknown';

    // 并行获取所有上下文信息
    const [gitContext, activeTasks, currentTask] = await Promise.all([
      getGitContext(this.projectRoot),
      this.getActiveTasks(),
      this.getCurrentTask(),
    ]);

    return {
      developer,
      git: gitContext,
      tasks: {
        active: activeTasks,
        directory: `${DIR_WORKFLOW}/tasks`,
      },
      currentTask,
      journal: this.getJournalInfo(),
    };
  }

  /**
   * 构建格式化的文本上下文
   */
  async buildContext(): Promise<string> {
    const developer = getDeveloper(this.projectRoot);
    const contextJson = await this.buildContextJson();
    const lines: string[] = [];

    // 头部
    lines.push('========================================');
    lines.push('SESSION CONTEXT');
    lines.push('========================================');
    lines.push('');

    // 开发者信息
    lines.push('## DEVELOPER');
    if (!developer) {
      lines.push('(not initialized - run trellis init to set up)');
    } else {
      lines.push(`Name: ${developer}`);
    }
    lines.push('');

    // Git 状态
    lines.push('## GIT STATUS');
    lines.push(`Branch: ${contextJson.git.branch}`);
    if (contextJson.git.isClean) {
      lines.push('Working directory: Clean');
    } else {
      lines.push(
        `Working directory: ${contextJson.git.uncommittedChanges} uncommitted change(s)`,
      );
    }
    lines.push('');

    // 最近提交
    lines.push('## RECENT COMMITS');
    if (contextJson.git.recentCommits.length > 0) {
      for (const commit of contextJson.git.recentCommits) {
        lines.push(`${commit.hash} ${commit.message}`);
      }
    } else {
      lines.push('(no commits)');
    }
    lines.push('');

    // 当前任务
    lines.push('## CURRENT TASK');
    if (contextJson.currentTask) {
      lines.push(`Path: ${DIR_WORKFLOW}/tasks/${contextJson.currentTask.id}`);
      lines.push(`Name: ${contextJson.currentTask.name}`);
      lines.push(`Status: ${contextJson.currentTask.status}`);
      if (contextJson.currentTask.description) {
        lines.push(`Description: ${contextJson.currentTask.description}`);
      }
    } else {
      lines.push('(none)');
    }
    lines.push('');

    // 活跃任务
    lines.push('## ACTIVE TASKS');
    if (contextJson.tasks.active.length > 0) {
      for (const task of contextJson.tasks.active) {
        const parent = task.parent ? ` (parent: ${task.parent})` : '';
        lines.push(`- ${task.name}/ (${task.status})${parent}`);
      }
    } else {
      lines.push('(no active tasks)');
    }
    lines.push(`Total: ${contextJson.tasks.active.length} active task(s)`);
    lines.push('');

    // 我的任务（未完成的任务）
    lines.push('## MY TASKS');
    const myTasks = contextJson.tasks.active.filter(
      (t) => t.status !== 'completed',
    );
    if (myTasks.length > 0) {
      for (const task of myTasks) {
        lines.push(`- ${task.name} (${task.status})`);
      }
    } else {
      lines.push('(no tasks assigned to you)');
    }
    lines.push('');

    // Journal 文件
    lines.push('## JOURNAL FILE');
    if (contextJson.journal.file) {
      lines.push(`Active file: ${contextJson.journal.file}`);
      lines.push(
        `Line count: ${contextJson.journal.lines} / ${JOURNAL_LINE_LIMIT}`,
      );
      if (contextJson.journal.nearLimit) {
        lines.push('[!] WARNING: Approaching line limit!');
      }
    } else {
      lines.push('No journal file found');
    }
    lines.push('');

    // 路径信息
    lines.push('## PATHS');
    if (developer) {
      lines.push(`Workspace: ${DIR_WORKFLOW}/workspace/${developer}/`);
    }
    lines.push(`Tasks: ${DIR_WORKFLOW}/tasks/`);
    lines.push('');

    // 尾部
    lines.push('========================================');

    return lines.join('\n');
  }
}

// ==================== 导出便捷函数 ====================

/**
 * 创建上下文聚合器并构建文本上下文
 * 便捷函数，用于快速获取上下文
 */
export async function buildTrellisContext(
  projectRoot: string,
): Promise<string> {
  const aggregator = new TrellisContextAggregator(projectRoot);
  return aggregator.buildContext();
}

/**
 * 创建上下文聚合器并构建 JSON 上下文
 * 便捷函数，用于快速获取 JSON 格式的上下文
 */
export async function buildTrellisContextJson(
  projectRoot: string,
): Promise<TrellisContext> {
  const aggregator = new TrellisContextAggregator(projectRoot);
  return aggregator.buildContextJson();
}
