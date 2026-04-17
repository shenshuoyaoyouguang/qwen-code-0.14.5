/**
 * TaskStartTool 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskStartTool } from './task-start.js';
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

function mockReadEmpty(): void {
  hoistedMockFs.readFile.mockRejectedValueOnce(
    Object.assign(new Error('ENOENT: file not found'), { code: 'ENOENT' }),
  );
}

const baseTask: Task = {
  id: 'task_001',
  name: 'task-a',
  title: 'Task A',
  status: 'in_progress',
  priority: 'medium',
  notes: [],
  tags: [],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  started_at: '2025-01-02T00:00:00Z',
};

describe('TaskStartTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // validateToolParams
  // ============================================================
  describe('validateToolParams', () => {
    it('返回 null（验证通过）当 task_id 合法时', () => {
      const tool = new TaskStartTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({ task_id: 'task_001' });
      expect(result).toBeNull();
    });

    it('返回错误信息当 task_id 为空字符串时', () => {
      const tool = new TaskStartTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({ task_id: '' });
      expect(result).toBe('参数 "task_id" 是必填字段，且不能为空字符串');
    });

    it('返回错误信息当 task_id 为纯空白字符串时', () => {
      const tool = new TaskStartTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({ task_id: '   ' });
      expect(result).toBe('参数 "task_id" 是必填字段，且不能为空字符串');
    });

    it('返回错误信息当 task_id 为 undefined 时', () => {
      const tool = new TaskStartTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams(
        {} as Parameters<typeof tool.validateToolParams>[0],
      );
      expect(result).toBe('参数 "task_id" 是必填字段，且不能为空字符串');
    });

    it('接受任意非空 task_id 字符串', () => {
      const tool = new TaskStartTool(createMockConfig({} as TaskService));
      expect(tool.validateToolParams({ task_id: 'task-123-abc' })).toBeNull();
      expect(tool.validateToolParams({ task_id: 'TASK_001' })).toBeNull();
    });
  });

  // ============================================================
  // execute
  // ============================================================
  describe('execute', () => {
    it('成功启动任务并返回正确的 llmContent 和 display 结果', async () => {
      const startedTask: Task = {
        ...baseTask,
        status: 'in_progress',
        started_at: '2025-01-02T10:00:00Z',
      };
      const mockService = {
        startTask: vi.fn().mockResolvedValue(startedTask),
      } as unknown as TaskService;

      const tool = new TaskStartTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'task_001' });

      const result = await invocation.execute();

      expect(mockService.startTask).toHaveBeenCalledWith({
        task_id: 'task_001',
      });
      expect(result.llmContent).toContain('任务启动成功');
      expect(result.llmContent).toContain('task_001');
      expect(result.returnDisplay).toMatchObject({ type: 'task_started' });
      expect(result.error).toBeUndefined();
    });

    it('包含 started_at 时间戳在成功消息中', async () => {
      const startedTask: Task = {
        ...baseTask,
        started_at: '2025-01-02T10:00:00Z',
      };
      const mockService = {
        startTask: vi.fn().mockResolvedValue(startedTask),
      } as unknown as TaskService;

      const tool = new TaskStartTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'task_001' });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('开始时间');
      expect(result.llmContent).toContain('2025-01-02T10:00:00Z');
    });

    it('当任务不存在时返回错误结果（TaskService 抛出异常）', async () => {
      mockReadEmpty();

      const mockService = {
        startTask: vi
          .fn()
          .mockRejectedValue(new Error('任务 ID "nonexistent" 不存在')),
      } as unknown as TaskService;

      const tool = new TaskStartTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'nonexistent' });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('启动任务失败');
      expect(result.llmContent).toContain('不存在');
      expect(result.error).toMatchObject({
        message: '任务 ID "nonexistent" 不存在',
      });
    });

    it('当任务状态不允许启动时返回错误结果', async () => {
      mockReadEmpty();

      const mockService = {
        startTask: vi
          .fn()
          .mockRejectedValue(
            new Error(
              '任务 "Already Running" 当前状态为 "in_progress"，无法启动',
            ),
          ),
      } as unknown as TaskService;

      const tool = new TaskStartTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'task_running' });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('启动任务失败');
      expect(result.returnDisplay).toContain('Error:');
      expect(result.error).toBeDefined();
    });

    it('处理非 Error 类型的异常', async () => {
      const mockService = {
        startTask: vi.fn().mockRejectedValue('string error'),
      } as unknown as TaskService;

      const tool = new TaskStartTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'task_001' });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('启动任务失败');
      expect(result.error).toBeDefined();
    });

    it('display 结果包含完整任务字段', async () => {
      const startedTask: Task = {
        ...baseTask,
        description: 'Task description',
        dev_type: 'feature',
        scope: 'backend',
        started_at: '2025-01-02T10:00:00Z',
      };
      const mockService = {
        startTask: vi.fn().mockResolvedValue(startedTask),
      } as unknown as TaskService;

      const tool = new TaskStartTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'task_001' });

      const result = await invocation.execute();

      const display = result.returnDisplay as { task: Task };
      expect(display.task).toMatchObject({
        id: 'task_001',
        name: 'task-a',
        status: 'in_progress',
      });
    });
  });
});
