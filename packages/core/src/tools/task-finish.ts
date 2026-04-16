/**
 * task_finish 工具 — 完成任务（in_progress → completed）
 */

import type { ToolResult } from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type TaskFinishedResultDisplay,
} from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import type { TaskStatus } from './taskTypes.js';

const debugLogger = createDebugLogger('TASK_FINISH');

export interface TaskFinishParams {
  /** 任务 ID */
  task_id: string;
  /** 可选的完成总结笔记 */
  notes?: string[];
}

const taskFinishToolSchemaData = {
  type: 'object',
  properties: {
    task_id: {
      type: 'string',
      description: '要完成的任务 ID',
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description: '可选的任务完成总结笔记数组，记录完成情况、成果或后续建议',
    },
  },
  required: ['task_id'],
  additionalProperties: false,
};

const taskFinishToolDescription = `
完成一个任务，将其状态从 in_progress 变更为 completed。

## 功能说明
- 将任务状态从 in_progress 切换为 completed
- 自动设置 completed_at 时间戳
- 可选追加任务总结笔记到任务记录

## 使用场景
- 当任务开发完成、测试通过、文档编写完毕时使用
- 记录任务完成情况、成果总结或后续建议

## 状态转换
- in_progress → completed（正常完成）

## 字段说明
- task_id: 要完成的任务 ID（必填）
- notes: 任务完成总结笔记数组（可选），用于记录完成情况

## 使用示例

<example>
用户: 完成任务 task_1234567
助手: 使用 task_finish 工具:
{
  "task_id": "task_1234567"
}
</example>

<example>
用户: 完成任务并添加总结
助手: 使用 task_finish 工具:
{
  "task_id": "task_1234567",
  "notes": [
    "已完成用户认证功能开发",
    "包括登录、注册、登出三个接口",
    "建议后续添加第三方登录支持"
  ]
}
</example>
`;

class TaskFinishToolInvocation extends BaseToolInvocation<
  TaskFinishParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: TaskFinishParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `完成任务: ${this.params.task_id}`;
  }

  async execute(): Promise<ToolResult> {
    const taskService = this.config.getTaskService();

    try {
      // 调用 TaskService 完成任务
      const task = await taskService.finishTask({
        task_id: this.params.task_id,
        notes: this.params.notes,
      });

      // 构建成功消息
      const llmContent = buildSuccessMessage(task, this.params.notes);
      const displayResult: TaskFinishedResultDisplay = {
        type: 'task_finished',
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
          notes: task.notes,
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
      debugLogger.error(
        `[TaskFinishTool] Error finishing task: ${errorMessage}`,
      );

      return {
        llmContent: `完成任务失败: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: { message: errorMessage },
      };
    }
  }
}

/**
 * 构建成功消息（用于 LLM 输出）
 */
function buildSuccessMessage(
  task: {
    id: string;
    name: string;
    title: string;
    status: TaskStatus;
    priority: string;
    completed_at?: string;
    notes?: string[];
  },
  inputNotes?: string[],
): string {
  const lines: string[] = [
    `任务完成！`,
    ``,
    `- ID: ${task.id}`,
    `- 名称: ${task.name}`,
    `- 标题: ${task.title}`,
    `- 状态: ${task.status}`,
    `- 优先级: ${task.priority}`,
  ];

  if (task.completed_at) {
    lines.push(`- 完成时间: ${task.completed_at}`);
  }

  // 显示追加的笔记
  if (inputNotes && inputNotes.length > 0) {
    lines.push(``);
    lines.push(`- 完成总结:`);
    inputNotes.forEach((note) => {
      lines.push(`  - ${note}`);
    });
  }

  return lines.join('\n');
}

export class TaskFinishTool extends BaseDeclarativeTool<
  TaskFinishParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.TASK_FINISH;

  constructor(private config: Config) {
    super(
      TaskFinishTool.Name,
      ToolDisplayNames.TASK_FINISH,
      taskFinishToolDescription,
      Kind.Edit,
      taskFinishToolSchemaData as Record<string, unknown>,
    );
  }

  override validateToolParams(params: TaskFinishParams): string | null {
    // 验证 task_id 必填
    if (
      !params.task_id ||
      typeof params.task_id !== 'string' ||
      params.task_id.trim() === ''
    ) {
      return '参数 "task_id" 是必填字段，且不能为空字符串';
    }

    // 验证 notes 参数
    if (params.notes !== undefined) {
      if (!Array.isArray(params.notes)) {
        return '参数 "notes" 必须是数组';
      }
      for (const note of params.notes) {
        if (typeof note !== 'string') {
          return '所有笔记必须是字符串类型';
        }
      }
    }

    return null;
  }

  protected createInvocation(params: TaskFinishParams) {
    return new TaskFinishToolInvocation(this.config, params);
  }
}
