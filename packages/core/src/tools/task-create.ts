/**
 * task_create 工具 — 创建新任务
 */

import type { ToolResult } from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type TaskCreatedResultDisplay,
} from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import type { TaskPriority } from './taskTypes.js';

const debugLogger = createDebugLogger('TASK_CREATE');

export interface TaskCreateParams {
  /** 任务名称（唯一标识） */
  name: string;
  /** 任务标题（人类可读） */
  title: string;
  /** 任务详细描述 */
  description?: string;
  /** 开发类型（如 feature/bugfix/refactor） */
  dev_type?: string;
  /** 影响范围 */
  scope?: string;
  /** 任务优先级 */
  priority?: TaskPriority;
  /** 父任务 ID（用于任务层级） */
  parent?: string;
  /** 任务标签 */
  tags?: string[];
}

const taskCreateToolSchemaData = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      description: '任务唯一名称标识符，用于在系统中唯一识别该任务',
    },
    title: {
      type: 'string',
      minLength: 1,
      description: '任务的人类可读标题，将显示在任务列表和通知中',
    },
    description: {
      type: 'string',
      description: '任务的详细描述，包括背景、目标和验收标准',
    },
    dev_type: {
      type: 'string',
      description:
        '开发类型，如 feature（新功能）、bugfix（缺陷修复）、refactor（重构）、docs（文档）等',
    },
    scope: {
      type: 'string',
      description: '任务影响范围的简短描述',
    },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'urgent'],
      description: '任务优先级，默认为 medium',
    },
    parent: {
      type: 'string',
      description: '父任务 ID，用于创建子任务或关联任务',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: '任务标签数组，用于分类和筛选',
    },
  },
  required: ['name', 'title'],
  additionalProperties: false,
};

const taskCreateToolDescription = `
创建一个新的任务。

## 功能说明
- 创建任务时系统会自动分配唯一 ID
- name 和 title 是必填字段
- priority 默认为 medium

## 字段说明
- name: 任务唯一标识名，建议使用 kebab-case 或 snake_case
- title: 人类可读的简短标题
- description: 详细描述任务的背景、目标和验收标准
- dev_type: 开发类型（feature/bugfix/refactor/docs/test 等）
- scope: 任务影响范围（如 "frontend" / "api" / "database"）
- priority: 优先级（low/medium/high/urgent）
- parent: 父任务 ID，用于构建任务层级
- tags: 标签数组，用于分类管理

## 使用示例

<example>
用户: 创建一个高优先级的功能开发任务
助手: 使用 task_create 工具:
{
  "name": "user-authentication",
  "title": "实现用户认证功能",
  "description": "实现基于 JWT 的用户认证，包括登录、注册、登出功能",
  "dev_type": "feature",
  "scope": "backend",
  "priority": "high",
  "tags": ["auth", "security"]
}
</example>

<example>
用户: 创建一个缺陷修复任务
助手: 使用 task_create 工具:
{
  "name": "fix-login-validation",
  "title": "修复登录表单验证问题",
  "description": "修复用户名字段在空值时未正确显示错误提示的问题",
  "dev_type": "bugfix",
  "priority": "medium"
}
</example>
`;

class TaskCreateToolInvocation extends BaseToolInvocation<
  TaskCreateParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: TaskCreateParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `创建任务: ${this.params.title}`;
  }

  async execute(): Promise<ToolResult> {
    const taskService = this.config.getTaskService();

    try {
      // 调用 TaskService 创建任务
      const task = await taskService.createTask({
        name: this.params.name,
        title: this.params.title,
        description: this.params.description,
        dev_type: this.params.dev_type,
        scope: this.params.scope,
        priority: this.params.priority ?? 'medium',
        parent: this.params.parent,
        tags: this.params.tags,
      });

      // 构建成功消息
      const llmContent = buildSuccessMessage(task);
      const displayResult: TaskCreatedResultDisplay = {
        type: 'task_created',
        task,
      };

      return {
        llmContent,
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      debugLogger.error(
        `[TaskCreateTool] Error creating task: ${errorMessage}`,
      );

      return {
        llmContent: `创建任务失败: ${errorMessage}`,
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
  description?: string;
  dev_type?: string;
  scope?: string;
  status: string;
  priority: string;
  tags?: string[];
}): string {
  const lines: string[] = [
    `任务创建成功！`,
    ``,
    `- ID: ${task.id}`,
    `- 名称: ${task.name}`,
    `- 标题: ${task.title}`,
    `- 状态: ${task.status}`,
    `- 优先级: ${task.priority}`,
  ];

  if (task.description) {
    lines.push(`- 描述: ${task.description}`);
  }
  if (task.dev_type) {
    lines.push(`- 类型: ${task.dev_type}`);
  }
  if (task.scope) {
    lines.push(`- 范围: ${task.scope}`);
  }
  if (task.tags && task.tags.length > 0) {
    lines.push(`- 标签: ${task.tags.join(', ')}`);
  }

  return lines.join('\n');
}

export class TaskCreateTool extends BaseDeclarativeTool<
  TaskCreateParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.TASK_CREATE;

  constructor(private config: Config) {
    super(
      TaskCreateTool.Name,
      ToolDisplayNames.TASK_CREATE,
      taskCreateToolDescription,
      Kind.Edit,
      taskCreateToolSchemaData as Record<string, unknown>,
    );
  }

  override validateToolParams(params: TaskCreateParams): string | null {
    // 验证必填字段
    if (
      !params.name ||
      typeof params.name !== 'string' ||
      params.name.trim() === ''
    ) {
      return '参数 "name" 是必填字段，且不能为空字符串';
    }

    if (
      !params.title ||
      typeof params.title !== 'string' ||
      params.title.trim() === ''
    ) {
      return '参数 "title" 是必填字段，且不能为空字符串';
    }

    // 验证 priority 参数
    if (params.priority !== undefined) {
      const validPriorities: TaskPriority[] = [
        'low',
        'medium',
        'high',
        'urgent',
      ];
      if (!validPriorities.includes(params.priority)) {
        return `无效的 priority 值: ${params.priority}。有效值为: ${validPriorities.join(', ')}`;
      }
    }

    // 验证 tags 参数
    if (params.tags !== undefined) {
      if (!Array.isArray(params.tags)) {
        return '参数 "tags" 必须是数组';
      }
      for (const tag of params.tags) {
        if (typeof tag !== 'string') {
          return '所有标签必须是字符串类型';
        }
      }
    }

    return null;
  }

  protected createInvocation(params: TaskCreateParams) {
    return new TaskCreateToolInvocation(this.config, params);
  }
}
