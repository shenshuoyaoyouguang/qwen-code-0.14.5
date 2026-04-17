/**
 * TaskCreateTool 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskCreateTool } from './task-create.js';
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

// Mock Config with getTaskService
function createMockConfig(mockTaskService: TaskService): Config {
  return {
    getTaskService: vi.fn(() => mockTaskService),
  } as unknown as Config;
}

function mockReadEmpty(): void {
  hoistedMockFs.readFile.mockRejectedValueOnce(
    Object.assign(new Error('ENOENT: file not found'), { code: 'ENOENT' }),
  );
}

function mockWriteSuccess(): void {
  hoistedMockFs.mkdir.mockResolvedValueOnce(undefined);
  hoistedMockFs.writeFile.mockResolvedValueOnce(undefined);
  hoistedMockFs.rename.mockResolvedValueOnce(undefined);
}

const baseTask: Task = {
  id: 'task_mock-uuid-1234',
  name: 'test-task',
  title: 'Test Task',
  status: 'planning',
  priority: 'medium',
  notes: [],
  tags: [],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('TaskCreateTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // validateToolParams
  // ============================================================
  describe('validateToolParams', () => {
    it('返回 null（验证通过）当参数完全合法时', () => {
      const tool = new TaskCreateTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        name: 'my-task',
        title: 'My Task',
      });
      expect(result).toBeNull();
    });

    it('返回错误信息当 name 缺失时', () => {
      const tool = new TaskCreateTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        name: '',
        title: 'My Task',
      } as Parameters<typeof tool.validateToolParams>[0]);
      expect(result).toBe('参数 "name" 是必填字段，且不能为空字符串');
    });

    it('返回错误信息当 name 为纯空白字符串时', () => {
      const tool = new TaskCreateTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        name: '   ',
        title: 'My Task',
      } as Parameters<typeof tool.validateToolParams>[0]);
      expect(result).toBe('参数 "name" 是必填字段，且不能为空字符串');
    });

    it('返回错误信息当 title 缺失时', () => {
      const tool = new TaskCreateTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        name: 'my-task',
        title: '',
      } as Parameters<typeof tool.validateToolParams>[0]);
      expect(result).toBe('参数 "title" 是必填字段，且不能为空字符串');
    });

    it('返回错误信息当 priority 为无效值时', () => {
      const tool = new TaskCreateTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        name: 'my-task',
        title: 'My Task',
        priority: 'invalid-priority' as 'medium',
      } as Parameters<typeof tool.validateToolParams>[0]);
      expect(result).toContain('无效的 priority 值');
    });

    it('返回 null 当 priority 为有效枚举值时', () => {
      const tool = new TaskCreateTool(createMockConfig({} as TaskService));
      for (const p of ['low', 'medium', 'high', 'urgent'] as const) {
        const result = tool.validateToolParams({
          name: 'my-task',
          title: 'My Task',
          priority: p,
        });
        expect(result).toBeNull();
      }
    });

    it('返回错误信息当 tags 不是数组时', () => {
      const tool = new TaskCreateTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        name: 'my-task',
        title: 'My Task',
        tags: 'not-an-array' as unknown as string[],
      } as Parameters<typeof tool.validateToolParams>[0]);
      expect(result).toBe('参数 "tags" 必须是数组');
    });

    it('返回错误信息当 tags 数组包含非字符串元素时', () => {
      const tool = new TaskCreateTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        name: 'my-task',
        title: 'My Task',
        tags: ['valid', 123 as unknown as string],
      } as Parameters<typeof tool.validateToolParams>[0]);
      expect(result).toBe('所有标签必须是字符串类型');
    });

    it('返回 null 当 tags 为空数组时', () => {
      const tool = new TaskCreateTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        name: 'my-task',
        title: 'My Task',
        tags: [],
      });
      expect(result).toBeNull();
    });

    it('接受所有可选字段参数时返回 null', () => {
      const tool = new TaskCreateTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        name: 'my-task',
        title: 'My Task',
        description: '任务描述',
        dev_type: 'feature',
        scope: 'backend',
        priority: 'high',
        parent: 'parent-123',
        tags: ['backend', 'feature'],
      });
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // execute (通过 createInvocation)
  // ============================================================
  describe('execute', () => {
    it('成功创建任务并返回正确的 llmContent 和 display 结果', async () => {
      mockReadEmpty();
      mockWriteSuccess();

      const mockService = {
        createTask: vi.fn().mockResolvedValue(baseTask),
      } as unknown as TaskService;

      const tool = new TaskCreateTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({
        name: 'test-task',
        title: 'Test Task',
      });

      const result = await invocation.execute();

      expect(mockService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-task',
          title: 'Test Task',
          priority: 'medium',
        }),
      );
      expect(result.llmContent).toContain('任务创建成功');
      expect(result.llmContent).toContain('test-task');
      expect(result.returnDisplay).toMatchObject({ type: 'task_created' });
      expect(result.error).toBeUndefined();
    });

    it('使用自定义优先级创建任务', async () => {
      mockReadEmpty();
      mockWriteSuccess();

      const mockService = {
        createTask: vi
          .fn()
          .mockResolvedValue({ ...baseTask, priority: 'urgent' }),
      } as unknown as TaskService;

      const tool = new TaskCreateTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({
        name: 'urgent-task',
        title: 'Urgent Task',
        priority: 'urgent',
      });

      const result = await invocation.execute();

      expect(mockService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'urgent' }),
      );
      expect(result.llmContent).toContain('urgent');
    });

    it('当 TaskService.createTask 抛出错误时返回错误结果', async () => {
      mockReadEmpty();

      const mockService = {
        createTask: vi.fn().mockRejectedValue(new Error('任务名称已存在')),
      } as unknown as TaskService;

      const tool = new TaskCreateTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({
        name: 'dup-task',
        title: 'Duplicate Task',
      });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('创建任务失败');
      expect(result.llmContent).toContain('任务名称已存在');
      expect(result.error).toMatchObject({
        message: '任务名称已存在',
      });
    });

    it('正确构建包含 tags 的成功消息', async () => {
      mockReadEmpty();
      mockWriteSuccess();

      const taskWithTags: Task = {
        ...baseTask,
        tags: ['backend', 'feature'],
      };
      const mockService = {
        createTask: vi.fn().mockResolvedValue(taskWithTags),
      } as unknown as TaskService;

      const tool = new TaskCreateTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({
        name: 'tagged-task',
        title: 'Tagged Task',
        tags: ['backend', 'feature'],
      });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('backend, feature');
    });
  });
});
