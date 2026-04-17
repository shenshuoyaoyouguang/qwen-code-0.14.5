/**
 * TaskListTool 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskListTool } from './task-list.js';
import type { Config } from '../config/config.js';
import type { TaskService } from '../services/taskService.js';
import type { Task } from './taskTypes.js';

// Mock fs/promises
const hoistedMockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
}));
vi.mock('fs/promises', () => hoistedMockFs);

// Mock crypto
const hoistedMockCrypto = vi.hoisted(() => ({
  randomUUID: vi.fn(() => 'mock-uuid-1234'),
}));
vi.mock('crypto', () => hoistedMockCrypto);

function createMockConfig(mockTaskService: TaskService): Config {
  return {
    getTaskService: vi.fn(() => mockTaskService),
  } as unknown as Config;
}

const mockTasks: Task[] = [
  {
    id: 'task_001',
    name: 'task-feature-a',
    title: 'Feature A',
    status: 'in_progress',
    priority: 'high',
    notes: [],
    tags: ['feature'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    started_at: '2025-01-02T00:00:00Z',
  },
  {
    id: 'task_002',
    name: 'task-bugfix-b',
    title: 'Bugfix B',
    status: 'completed',
    priority: 'urgent',
    notes: [],
    tags: ['bugfix'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    completed_at: '2025-01-03T00:00:00Z',
  },
  {
    id: 'task_003',
    name: 'task-doc-c',
    title: 'Doc C',
    status: 'planning',
    priority: 'low',
    notes: [],
    tags: ['docs'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
];

describe('TaskListTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // validateToolParams
  // ============================================================
  describe('validateToolParams', () => {
    it('返回 null（验证通过）当参数为空时（无筛选条件）', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({});
      expect(result).toBeNull();
    });

    it('返回 null 当 status 为有效枚举值时', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      for (const s of [
        'pending',
        'planning',
        'in_progress',
        'completed',
        'blocked',
        'review',
      ] as const) {
        expect(tool.validateToolParams({ status: s })).toBeNull();
      }
    });

    it('返回错误信息当 status 为无效值时', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        status: 'invalid' as 'pending',
      });
      expect(result).toContain('无效的 status 值');
      expect(result).toContain('invalid');
    });

    it('返回 null 当 priority 为有效枚举值时', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      for (const p of ['low', 'medium', 'high', 'urgent'] as const) {
        expect(tool.validateToolParams({ priority: p })).toBeNull();
      }
    });

    it('返回错误信息当 priority 为无效值时', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        priority: 'critical' as 'medium',
      });
      expect(result).toContain('无效的 priority 值');
    });

    it('返回 null 当 format 为 table 时', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      expect(tool.validateToolParams({ format: 'table' })).toBeNull();
    });

    it('返回 null 当 format 为 json 时', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      expect(tool.validateToolParams({ format: 'json' })).toBeNull();
    });

    it('返回错误信息当 format 为无效值时', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({ format: 'xml' as 'json' });
      expect(result).toBe('无效的 format 值。有效值为: table, json');
    });

    it('接受 status 数组中所有有效状态', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        status: ['in_progress', 'completed'] as ['in_progress', 'completed'],
      });
      expect(result).toBeNull();
    });

    it('接受 priority 数组中所有有效优先级', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        priority: ['high', 'urgent'] as ['high', 'urgent'],
      });
      expect(result).toBeNull();
    });

    it('返回错误信息当 status 数组包含无效状态时', () => {
      const tool = new TaskListTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        status: ['in_progress', 'invalid' as 'pending'],
      });
      expect(result).toContain('无效的 status 值');
      expect(result).toContain('invalid');
    });
  });

  // ============================================================
  // execute
  // ============================================================
  describe('execute', () => {
    it('成功列出所有任务（无筛选条件）', async () => {
      const mockService = {
        listTasks: vi.fn().mockResolvedValue(mockTasks),
      } as unknown as TaskService;

      const tool = new TaskListTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({});

      const result = await invocation.execute();

      expect(mockService.listTasks).toHaveBeenCalledWith({});
      expect(result.returnDisplay).toMatchObject({ type: 'task_list' });
      expect(result.error).toBeUndefined();
    });

    it('默认 format 为 table', async () => {
      const mockService = {
        listTasks: vi.fn().mockResolvedValue(mockTasks),
      } as unknown as TaskService;

      const tool = new TaskListTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({});

      const result = await invocation.execute();

      const display = result.returnDisplay as { format: string };
      expect(display.format).toBe('table');
    });

    it('按 status 筛选任务', async () => {
      const mockService = {
        listTasks: vi.fn().mockResolvedValue([mockTasks[0]!]),
      } as unknown as TaskService;

      const tool = new TaskListTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ status: 'in_progress' });

      const result = await invocation.execute();

      expect(mockService.listTasks).toHaveBeenCalledWith({
        status: ['in_progress'],
      });
      expect(result.error).toBeUndefined();
    });

    it('按 priority 筛选任务', async () => {
      const mockService = {
        listTasks: vi.fn().mockResolvedValue([mockTasks[1]!]),
      } as unknown as TaskService;

      const tool = new TaskListTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ priority: 'urgent' });

      const result = await invocation.execute();

      expect(mockService.listTasks).toHaveBeenCalledWith({
        priority: ['urgent'],
      });
      expect(result.error).toBeUndefined();
    });

    it('同时按 status 和 priority 筛选任务', async () => {
      const mockService = {
        listTasks: vi.fn().mockResolvedValue([mockTasks[0]!]),
      } as unknown as TaskService;

      const tool = new TaskListTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({
        status: 'in_progress',
        priority: 'high',
      });

      const result = await invocation.execute();

      expect(mockService.listTasks).toHaveBeenCalledWith({
        status: ['in_progress'],
        priority: ['high'],
      });
      expect(result.error).toBeUndefined();
    });

    it('format 为 json 时返回 JSON 字符串', async () => {
      const mockService = {
        listTasks: vi.fn().mockResolvedValue(mockTasks),
      } as unknown as TaskService;

      const tool = new TaskListTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ format: 'json' });

      const result = await invocation.execute();

      const display = result.returnDisplay as { format: string };
      expect(display.format).toBe('json');
      // JSON 格式的 llmContent 应为 JSON 字符串
      expect(() => JSON.parse(result.llmContent)).not.toThrow();
    });

    it('当任务列表为空时返回"暂无任务"消息', async () => {
      const mockService = {
        listTasks: vi.fn().mockResolvedValue([]),
      } as unknown as TaskService;

      const tool = new TaskListTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({});

      const result = await invocation.execute();

      expect(result.llmContent).toBe('暂无任务');
    });

    it('当 TaskService.listTasks 抛出错误时返回错误结果', async () => {
      const mockService = {
        listTasks: vi.fn().mockRejectedValue(new Error('文件系统错误')),
      } as unknown as TaskService;

      const tool = new TaskListTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({});

      const result = await invocation.execute();

      expect(result.llmContent).toContain('列出任务失败');
      expect(result.llmContent).toContain('文件系统错误');
      expect(result.error).toMatchObject({ message: '文件系统错误' });
    });

    it('处理非 Error 类型的异常', async () => {
      const mockService = {
        listTasks: vi.fn().mockRejectedValue(null),
      } as unknown as TaskService;

      const tool = new TaskListTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({});

      const result = await invocation.execute();

      expect(result.llmContent).toContain('列出任务失败');
      expect(result.error).toBeDefined();
    });

    it('table 格式的 llmContent 包含表格头部', async () => {
      const mockService = {
        listTasks: vi.fn().mockResolvedValue(mockTasks),
      } as unknown as TaskService;

      const tool = new TaskListTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ format: 'table' });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('|');
      expect(result.llmContent).toContain('ID');
      expect(result.llmContent).toContain('名称');
      expect(result.llmContent).toContain('状态');
      expect(result.llmContent).toContain('优先级');
    });
  });
});
