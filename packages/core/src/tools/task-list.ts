/**
 * task_list 工具 — 列出任务列表
 */

import type { ToolResult } from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type TaskListResultDisplay,
} from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import type { Task, TaskStatus, TaskPriority } from '../tools/taskTypes.js';

const debugLogger = createDebugLogger('TASK_LIST');

export interface TaskListParams {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  format?: 'table' | 'json';
}

const taskListToolSchemaData = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: [
        'pending',
        'in_progress',
        'completed',
        'blocked',
        'planning',
        'review',
      ],
      description: '按状态筛选任务，可传入单个状态或状态数组',
    },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'urgent'],
      description: '按优先级筛选任务，可传入单个优先级或优先级数组',
    },
    format: {
      type: 'string',
      enum: ['table', 'json'],
      description: '返回格式：table（表格视图，LLM友好）或 json（JSON格式）',
      default: 'table',
    },
  },
  additionalProperties: false,
};

const taskListToolDescription = `
列出所有任务，支持按状态和优先级筛选。

## 使用场景
- 查看当前项目的所有任务
- 按状态查看进行中或已完成的任务
- 按优先级筛选重要任务

## 筛选参数
- status: 任务状态（pending/in_progress/completed/blocked）
- priority: 任务优先级（low/medium/high/urgent）

## 返回格式
- table（默认）：表格视图，便于阅读和引用
- json：JSON格式，便于程序处理

## 使用示例

<example>
用户: 列出所有进行中的任务
助手: 使用 task_list 工具，参数 { "status": "in_progress" }
</example>

<example>
用户: 查看所有高优先级的任务
助手: 使用 task_list 工具，参数 { "priority": "high" }
</example>

<example>
用户: 以 JSON 格式列出所有任务
助手: 使用 task_list 工具，参数 { "format": "json" }
</example>
`;

class TaskListToolInvocation extends BaseToolInvocation<
  TaskListParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: TaskListParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return '列出任务列表';
  }

  async execute(): Promise<ToolResult> {
    const taskService = this.config.getTaskService();
    const format = this.params.format ?? 'table';

    try {
      // 构建过滤条件（转换为数组形式以匹配 TaskFilter）
      const filters: {
        status?: TaskStatus[];
        priority?: TaskPriority[];
      } = {};

      if (this.params.status) {
        filters.status = Array.isArray(this.params.status)
          ? this.params.status
          : [this.params.status];
      }
      if (this.params.priority) {
        filters.priority = Array.isArray(this.params.priority)
          ? this.params.priority
          : [this.params.priority];
      }

      const tasks = await taskService.listTasks(filters);
      const llmContent = formatTasksForLLM(tasks, format);

      const displayResult: TaskListResultDisplay = {
        type: 'task_list',
        tasks,
        format,
      };

      return {
        llmContent,
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      debugLogger.error(`[TaskListTool] Error listing tasks: ${errorMessage}`);

      return {
        llmContent: `列出任务失败: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: { message: errorMessage },
      };
    }
  }
}

/**
 * 格式化任务列表为 LLM 友好的文本格式
 */
function truncateVisual(str: string, maxWidth: number): string {
  // 全角字符（CJK）在等宽终端中占 2 个字符宽度
  let width = 0;
  let end = 0;
  for (const char of str) {
    const code = char.codePointAt(0) ?? 0;
    const charWidth =
      code >= 0x1100 &&
      (code <= 0x115f || // Hangul Jamo
        code === 0x2329 ||
        code === 0x232a ||
        (code >= 0x2e80 && code <= 0x303f) || // CJK Radicals Supplement..CJK Symbols and Punctuation
        (code >= 0x3040 && code <= 0xa4cf) || // Hiragana..Yi
        (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
        (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
        (code >= 0xfe10 && code <= 0xfe1f) || // Vertical forms
        (code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms..Small Form Variants
        (code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms
        (code >= 0xffe0 && code <= 0xffe6)) // Fullwidth Forms
        ? 2
        : 1;
    if (width + charWidth > maxWidth) break;
    width += charWidth;
    end++;
  }
  const result = str.slice(0, end);
  return result.length < str.length ? result + '..' : result;
}

function formatTasksForLLM(tasks: Task[], format: 'table' | 'json'): string {
  if (tasks.length === 0) {
    return '暂无任务';
  }

  if (format === 'json') {
    return JSON.stringify(tasks, null, 2);
  }

  // 表格格式
  const header = '| ID | 名称 | 标题 | 状态 | 优先级 |';
  const separator =
    '|------|----------------|----------------|--------|----------|';
  const rows = tasks.map((task) => {
    const name = truncateVisual(task.name, 14);
    const title = truncateVisual(task.title, 14);
    return `| ${task.id.slice(0, 8)} | ${name} | ${title} | ${task.status} | ${task.priority} |`;
  });

  return [header, separator, ...rows].join('\n');
}

export class TaskListTool extends BaseDeclarativeTool<
  TaskListParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.TASK_LIST;

  constructor(private config: Config) {
    super(
      TaskListTool.Name,
      ToolDisplayNames.TASK_LIST,
      taskListToolDescription,
      Kind.Read,
      taskListToolSchemaData as Record<string, unknown>,
    );
  }

  override validateToolParams(params: TaskListParams): string | null {
    // 验证 status 参数
    if (params.status !== undefined) {
      const validStatuses: TaskStatus[] = [
        'pending',
        'in_progress',
        'completed',
        'blocked',
        'planning',
        'review',
      ];
      const statuses = Array.isArray(params.status)
        ? params.status
        : [params.status];
      for (const status of statuses) {
        if (!validStatuses.includes(status)) {
          return `无效的 status 值: ${status}。有效值为: ${validStatuses.join(', ')}`;
        }
      }
    }

    // 验证 priority 参数
    if (params.priority !== undefined) {
      const validPriorities: TaskPriority[] = [
        'low',
        'medium',
        'high',
        'urgent',
      ];
      const priorities = Array.isArray(params.priority)
        ? params.priority
        : [params.priority];
      for (const priority of priorities) {
        if (!validPriorities.includes(priority)) {
          return `无效的 priority 值: ${priority}。有效值为: ${validPriorities.join(', ')}`;
        }
      }
    }

    // 验证 format 参数
    if (
      params.format !== undefined &&
      !['table', 'json'].includes(params.format)
    ) {
      return '无效的 format 值。有效值为: table, json';
    }

    return null;
  }

  protected createInvocation(params: TaskListParams) {
    return new TaskListToolInvocation(this.config, params);
  }
}
