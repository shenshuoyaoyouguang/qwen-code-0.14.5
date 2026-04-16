/**
 * TaskService — 任务管理服务
 * 提供任务的创建、列表、查询和管理功能
 */

import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import type {
  Task,
  TaskPriority,
  TaskListFilters,
} from '../tools/taskTypes.js';
import { isTaskStatus, isTaskPriority } from '../tools/taskTypes.js';

/**
 * 创建任务参数
 */
interface CreateTaskParams {
  name: string;
  title: string;
  description?: string;
  dev_type?: string;
  scope?: string;
  priority?: TaskPriority;
  parent?: string;
  tags?: string[];
}

/**
 * 启动任务参数
 */
interface StartTaskParams {
  task_id: string;
}

/**
 * 完成任务参数
 */
interface FinishTaskParams {
  task_id: string;
  notes?: string[];
}

const debugLogger = createDebugLogger('TaskService');

const TASKS_SUBDIR = 'tasks';

/**
 * 获取任务文件路径
 */
function getTaskFilePath(sessionId?: string): string {
  const taskDir = Storage.getRuntimeBaseDir();
  const filename = `${sessionId || 'default'}.json`;
  return path.join(taskDir, TASKS_SUBDIR, filename);
}

function getTaskDir(): string {
  return path.join(Storage.getRuntimeBaseDir(), TASKS_SUBDIR);
}

/**
 * 从文件系统读取任务列表
 */
async function readTasksFromFile(sessionId?: string): Promise<Task[]> {
  try {
    const fs = await import('fs/promises');
    const taskFilePath = getTaskFilePath(sessionId);
    const content = await fs.readFile(taskFilePath, 'utf-8');
    const data = JSON.parse(content);
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch (err) {
    const error = err as Error & { code?: string };
    if (!(error instanceof Error) || error.code !== 'ENOENT') {
      debugLogger.error(`[TaskService] Error reading tasks: ${error.message}`);
    }
    return [];
  }
}

/**
 * 原子写入任务列表到文件系统
 * 使用 tmp 文件 + rename 保证写入原子性，防止并发写入导致数据损坏
 */
async function writeTasksToFile(
  tasks: Task[],
  sessionId?: string,
): Promise<void> {
  const fsPromises = await import('fs/promises');
  const crypto = await import('crypto');
  const taskFilePath = getTaskFilePath(sessionId);
  const taskDir = getTaskDir();

  await fsPromises.mkdir(taskDir, { recursive: true });

  const data = {
    tasks,
    sessionId: sessionId || 'default',
    updated_at: new Date().toISOString(),
  };

  const content = JSON.stringify(data, null, 2);
  // 生成唯一临时文件名，避免同进程多次调用的冲突
  const tmpSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const tmpFilePath = `${taskFilePath}.tmp.${tmpSuffix}`;

  // 1. 写入临时文件
  await fsPromises.writeFile(tmpFilePath, content, 'utf-8');
  // 2. 原子移动到目标文件（覆盖已存在的文件）
  try {
    await fsPromises.rename(tmpFilePath, taskFilePath);
  } catch (renameErr) {
    // rename 失败时清理临时文件，避免留下孤立文件
    try {
      await fsPromises.unlink(tmpFilePath);
    } catch {
      // 忽略清理失败
    }
    throw renameErr;
  }
}

/**
 * 生成唯一任务 ID（使用加密安全的随机数）
 * 使用动态 import 兼容 ESM 环境
 */
async function generateTaskId(): Promise<string> {
  const crypto = await import('crypto');
  return `task_${crypto.randomUUID()}`;
}

/**
 * TaskService — 任务管理服务
 */
export class TaskService {
  private readonly sessionId: string;

  /**
   * 创建任务服务实例
   * @param sessionId - 会话 ID，用于会话级别的任务存储
   */
  constructor(sessionId: string = 'default') {
    this.sessionId = sessionId;
  }

  /**
   * 列出所有任务
   */
  async listTasks(filters?: TaskListFilters): Promise<Task[]> {
    const tasks = await readTasksFromFile(this.sessionId);

    if (!filters || Object.keys(filters).length === 0) {
      return tasks;
    }

    // 应用过滤器
    return tasks.filter((task) => {
      // 按状态过滤
      if (filters.status !== undefined) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status];
        if (!statuses.some((s) => isTaskStatus(s) && s === task.status)) {
          return false;
        }
      }

      // 按优先级过滤
      if (filters.priority !== undefined) {
        const priorities = Array.isArray(filters.priority)
          ? filters.priority
          : [filters.priority];
        if (!priorities.some((p) => isTaskPriority(p) && p === task.priority)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 创建新任务
   */
  async createTask(params: CreateTaskParams): Promise<Task> {
    const tasks = await readTasksFromFile(this.sessionId);

    // 检查任务名称是否已存在
    const existingTask = tasks.find((t) => t.name === params.name);
    if (existingTask) {
      throw new Error(`任务名称 "${params.name}" 已存在`);
    }

    const now = new Date().toISOString();
    const newTask: Task = {
      id: await generateTaskId(),
      name: params.name,
      title: params.title,
      description: params.description,
      dev_type: params.dev_type,
      scope: params.scope,
      status: 'planning',
      priority: params.priority ?? 'medium',
      parent: params.parent,
      tags: params.tags ?? [],
      notes: [],
      created_at: now,
      updated_at: now,
    };

    tasks.push(newTask);
    await writeTasksToFile(tasks, this.sessionId);

    debugLogger.info(`[TaskService] Task created: ${newTask.id}`);
    return newTask;
  }

  /**
   * 启动任务（planning → in_progress）
   */
  async startTask(params: StartTaskParams): Promise<Task> {
    const tasks = await readTasksFromFile(this.sessionId);

    // 查找任务
    const task = tasks.find((t) => t.id === params.task_id);
    if (!task) {
      throw new Error(`任务 ID "${params.task_id}" 不存在`);
    }

    // 验证状态转换：只有 planning 或 blocked 状态可以启动
    if (task.status !== 'planning' && task.status !== 'blocked') {
      throw new Error(
        `任务 "${task.title}" 当前状态为 "${task.status}"，无法启动。只有处于 "planning" 或 "blocked" 状态的任务才能启动`,
      );
    }

    // 更新任务状态
    const now = new Date().toISOString();
    task.status = 'in_progress';
    task.started_at = now;
    task.updated_at = now;

    await writeTasksToFile(tasks, this.sessionId);

    debugLogger.info(`[TaskService] Task started: ${task.id}`);
    return task;
  }

  /**
   * 完成任务（in_progress → completed）
   */
  async finishTask(params: FinishTaskParams): Promise<Task> {
    const tasks = await readTasksFromFile(this.sessionId);

    // 查找任务
    const task = tasks.find((t) => t.id === params.task_id);
    if (!task) {
      throw new Error(`任务 ID "${params.task_id}" 不存在`);
    }

    // 验证状态转换：只有 in_progress 状态可以完成
    if (task.status !== 'in_progress') {
      throw new Error(
        `任务 "${task.title}" 当前状态为 "${task.status}"，无法完成。只有处于 "in_progress" 状态的任务才能完成`,
      );
    }

    // 更新任务状态
    const now = new Date().toISOString();
    task.status = 'completed';
    task.completed_at = now;
    task.updated_at = now;

    // 追加任务总结笔记
    if (params.notes && params.notes.length > 0) {
      task.notes = [...(task.notes ?? []), ...params.notes];
    }

    await writeTasksToFile(tasks, this.sessionId);

    debugLogger.info(`[TaskService] Task finished: ${task.id}`);
    return task;
  }
}
