/**
 * task_start 工具 — 启动任务（planning → in_progress）
 */

import type { ToolResult } from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type TaskStartedResultDisplay,
} from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import type { TaskStatus } from './taskTypes.js';

const debugLogger = createDebugLogger('TASK_START');

export interface TaskStartParams {
  /** 任务 ID */
  task_id: string;
}

const taskStartToolSchemaData = {
  type: 'object',
  properties: {
    task_id: {
      type: 'string',
      description: '要启动的任务 ID',
    },
  },
  required: ['task_id'],
  additionalProperties: false,
};

const taskStartToolDescription = `
启动一个任务，将其状态从 planning 或 blocked 变更为 in_progress。

## 功能说明
- 将任务状态从 planning/blocked 切换为 in_progress
- 自动设置 started_at 时间戳
- 记录任务开始时间，便于追踪

## 使用场景
- 当开始执行一个已规划的任务时使用
- 任务阻塞解除后重新开始时使用

## 状态转换
- planning → in_progress（正常启动）
- blocked → in_progress（解除阻塞后启动）
- 其他状态无法启动

## 使用示例

<example>
用户: 开始处理任务 task_1234567
助手: 使用 task_start 工具:
{
  "task_id": "task_1234567"
}
</example>

<example>
用户: 启动高优先级功能开发任务
助手: 先使用 task_list 工具查看任务，然后使用 task_start 工具启动任务
</example>
`;

class TaskStartToolInvocation extends BaseToolInvocation<
  TaskStartParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: TaskStartParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `启动任务: ${this.params.task_id}`;
  }

  async execute(): Promise<ToolResult> {
    const taskService = this.config.getTaskService();

    try {
      // 调用 TaskService 启动任务
      const task = await taskService.startTask({
        task_id: this.params.task_id,
      });

      // 构建成功消息
      const llmContent = buildSuccessMessage(task);

      const displayResult: TaskStartedResultDisplay = {
        type: 'task_started',
        task: {
          id: task.id,
          name: task.name,
          title: task.title,
          description: task.description,
          dev_type: task.dev_type,
          scope: task.scope,
          status: task.status,
          priority: task.priority,
          parent: task.parent,
          tags: task.tags,
          created_at: task.created_at,
          updated_at: task.updated_at,
          started_at: task.started_at,
          completed_at: task.completed_at,
        },
      };

      return {
        llmContent,
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      debugLogger.error(`[TaskStartTool] Error starting task: ${errorMessage}`);

      return {
        llmContent: `启动任务失败: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: { message: errorMessage },
      };
    }
  }
}

/**
 * 构建成功消息（用于 LLM 输出）
 */
function buildSuccessMessage(task: {
  id: string;
  name: string;
  title: string;
  status: TaskStatus;
  priority: string;
  started_at?: string;
}): string {
  const lines: string[] = [
    `任务启动成功！`,
    ``,
    `- ID: ${task.id}`,
    `- 名称: ${task.name}`,
    `- 标题: ${task.title}`,
    `- 状态: ${task.status}`,
    `- 优先级: ${task.priority}`,
  ];

  if (task.started_at) {
    lines.push(`- 开始时间: ${task.started_at}`);
  }

  return lines.join('\n');
}

export class TaskStartTool extends BaseDeclarativeTool<
  TaskStartParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.TASK_START;

  constructor(private config: Config) {
    super(
      TaskStartTool.Name,
      ToolDisplayNames.TASK_START,
      taskStartToolDescription,
      Kind.Edit,
      taskStartToolSchemaData as Record<string, unknown>,
    );
  }

  override validateToolParams(params: TaskStartParams): string | null {
    // 验证 task_id 必填
    if (
      !params.task_id ||
      typeof params.task_id !== 'string' ||
      params.task_id.trim() === ''
    ) {
      return '参数 "task_id" 是必填字段，且不能为空字符串';
    }

    return null;
  }

  protected createInvocation(params: TaskStartParams) {
    return new TaskStartToolInvocation(this.config, params);
  }
}
