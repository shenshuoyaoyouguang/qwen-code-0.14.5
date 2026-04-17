/**
 * TaskFinishTool 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskFinishTool } from './task-finish.js';
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
  status: 'completed',
  priority: 'medium',
  notes: [],
  tags: [],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  started_at: '2025-01-02T00:00:00Z',
  completed_at: '2025-01-03T00:00:00Z',
};

describe('TaskFinishTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // validateToolParams
  // ============================================================
  describe('validateToolParams', () => {
    it('返回 null（验证通过）当 task_id 合法且无 notes 时', () => {
      const tool = new TaskFinishTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({ task_id: 'task_001' });
      expect(result).toBeNull();
    });

    it('返回 null（验证通过）当 task_id 合法且 notes 为空数组时', () => {
      const tool = new TaskFinishTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        task_id: 'task_001',
        notes: [],
      });
      expect(result).toBeNull();
    });

    it('返回错误信息当 task_id 为空字符串时', () => {
      const tool = new TaskFinishTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({ task_id: '' });
      expect(result).toBe('参数 "task_id" 是必填字段，且不能为空字符串');
    });

    it('返回错误信息当 task_id 为纯空白字符串时', () => {
      const tool = new TaskFinishTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({ task_id: '   ' });
      expect(result).toBe('参数 "task_id" 是必填字段，且不能为空字符串');
    });

    it('返回错误信息当 task_id 为 undefined 时', () => {
      const tool = new TaskFinishTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams(
        {} as Parameters<typeof tool.validateToolParams>[0],
      );
      expect(result).toBe('参数 "task_id" 是必填字段，且不能为空字符串');
    });

    it('返回错误信息当 notes 不是数组时', () => {
      const tool = new TaskFinishTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        task_id: 'task_001',
        notes: 'not an array',
      } as Parameters<typeof tool.validateToolParams>[0]);
      expect(result).toBe('参数 "notes" 必须是数组');
    });

    it('返回错误信息当 notes 数组包含非字符串元素时', () => {
      const tool = new TaskFinishTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        task_id: 'task_001',
        notes: ['valid note', 123 as unknown as string],
      } as Parameters<typeof tool.validateToolParams>[0]);
      expect(result).toBe('所有笔记必须是字符串类型');
    });

    it('接受合法的 notes 数组', () => {
      const tool = new TaskFinishTool(createMockConfig({} as TaskService));
      const result = tool.validateToolParams({
        task_id: 'task_001',
        notes: ['note 1', 'note 2', 'note 3'],
      });
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // execute
  // ============================================================
  describe('execute', () => {
    it('成功完成任务并返回正确的 llmContent 和 display 结果', async () => {
      const finishedTask: Task = {
        ...baseTask,
        status: 'completed',
        completed_at: '2025-01-03T10:00:00Z',
      };
      const mockService = {
        finishTask: vi.fn().mockResolvedValue(finishedTask),
      } as unknown as TaskService;

      const tool = new TaskFinishTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'task_001' });

      const result = await invocation.execute();

      expect(mockService.finishTask).toHaveBeenCalledWith({
        task_id: 'task_001',
        notes: undefined,
      });
      expect(result.llmContent).toContain('任务完成');
      expect(result.llmContent).toContain('task_001');
      expect(result.returnDisplay).toMatchObject({ type: 'task_finished' });
      expect(result.error).toBeUndefined();
    });

    it('包含完成时间戳在成功消息中', async () => {
      const finishedTask: Task = {
        ...baseTask,
        completed_at: '2025-01-03T10:00:00Z',
      };
      const mockService = {
        finishTask: vi.fn().mockResolvedValue(finishedTask),
      } as unknown as TaskService;

      const tool = new TaskFinishTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'task_001' });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('完成时间');
      expect(result.llmContent).toContain('2025-01-03T10:00:00Z');
    });

    it('传递 notes 参数给 TaskService.finishTask', async () => {
      const finishedTask: Task = {
        ...baseTask,
        notes: ['summary note 1', 'summary note 2'],
      };
      const mockService = {
        finishTask: vi.fn().mockResolvedValue(finishedTask),
      } as unknown as TaskService;

      const tool = new TaskFinishTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({
        task_id: 'task_001',
        notes: ['summary note 1', 'summary note 2'],
      });

      const result = await invocation.execute();

      expect(mockService.finishTask).toHaveBeenCalledWith({
        task_id: 'task_001',
        notes: ['summary note 1', 'summary note 2'],
      });
      expect(result.llmContent).toContain('完成总结');
      expect(result.llmContent).toContain('summary note 1');
      expect(result.llmContent).toContain('summary note 2');
    });

    it('当任务不存在时返回错误结果', async () => {
      mockReadEmpty();

      const mockService = {
        finishTask: vi
          .fn()
          .mockRejectedValue(new Error('任务 ID "nonexistent" 不存在')),
      } as unknown as TaskService;

      const tool = new TaskFinishTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'nonexistent' });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('完成任务失败');
      expect(result.llmContent).toContain('不存在');
      expect(result.error).toMatchObject({
        message: '任务 ID "nonexistent" 不存在',
      });
    });

    it('当任务状态不允许完成时返回错误结果', async () => {
      mockReadEmpty();

      const mockService = {
        finishTask: vi
          .fn()
          .mockRejectedValue(
            new Error('任务 "Planning Task" 当前状态为 "planning"，无法完成'),
          ),
      } as unknown as TaskService;

      const tool = new TaskFinishTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'task_planning' });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('完成任务失败');
      expect(result.returnDisplay).toContain('Error:');
      expect(result.error).toBeDefined();
    });

    it('处理非 Error 类型的异常', async () => {
      const mockService = {
        finishTask: vi.fn().mockRejectedValue(42),
      } as unknown as TaskService;

      const tool = new TaskFinishTool(createMockConfig(mockService));
      const invocation = tool.createInvocation({ task_id: 'task_001' });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('完成任务失败');
      expect(result.error).toBeDefined();
    });
  });
});
