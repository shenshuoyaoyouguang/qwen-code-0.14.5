/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskService } from './taskService.js';
import type { Task } from '../tools/taskTypes.js';

const hoistedMockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('fs/promises', () => hoistedMockFs);

const hoistedMockCrypto = vi.hoisted(() => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));
vi.mock('crypto', () => hoistedMockCrypto);

function mockReadTasks(tasks: Task[]): void {
  hoistedMockFs.readFile.mockResolvedValueOnce(
    JSON.stringify({
      tasks,
      sessionId: 'default',
      updated_at: new Date().toISOString(),
    }),
  );
}

function mockReadEmpty(): void {
  hoistedMockFs.readFile.mockRejectedValueOnce(
    Object.assign(new Error('ENOENT: file not found'), { code: 'ENOENT' }),
  );
}

describe('TaskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 mock mkdir 和 writeFile 为成功
    hoistedMockFs.mkdir.mockResolvedValueOnce(undefined);
    hoistedMockFs.writeFile.mockResolvedValueOnce(undefined);
    hoistedMockFs.rename.mockResolvedValueOnce(undefined);
  });

  describe('listTasks', () => {
    it('returns empty array when file does not exist', async () => {
      mockReadEmpty();
      const service = new TaskService('default');
      const tasks = await service.listTasks();
      expect(tasks).toEqual([]);
    });

    it('returns all tasks when no filter', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'task-a',
          title: 'Task A',
          status: 'planning',
          priority: 'high',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'task_2',
          name: 'task-b',
          title: 'Task B',
          status: 'in_progress',
          priority: 'low',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      const result = await service.listTasks();
      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('task-a');
    });

    it('filters tasks by status', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'task-a',
          title: 'Task A',
          status: 'planning',
          priority: 'high',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'task_2',
          name: 'task-b',
          title: 'Task B',
          status: 'in_progress',
          priority: 'low',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      const result = await service.listTasks({ status: 'in_progress' });
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('task-b');
    });

    it('filters tasks by priority', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'task-a',
          title: 'Task A',
          status: 'planning',
          priority: 'high',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'task_2',
          name: 'task-b',
          title: 'Task B',
          status: 'planning',
          priority: 'low',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      const result = await service.listTasks({ priority: 'high' });
      expect(result).toHaveLength(1);
      expect(result[0]!.priority).toBe('high');
    });

    it('filters tasks by multiple statuses', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'task-a',
          title: 'Task A',
          status: 'planning',
          priority: 'medium',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'task_2',
          name: 'task-b',
          title: 'Task B',
          status: 'completed',
          priority: 'medium',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'task_3',
          name: 'task-c',
          title: 'Task C',
          status: 'in_progress',
          priority: 'medium',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      const result = await service.listTasks({
        status: ['planning', 'completed'],
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('createTask', () => {
    it('creates a new task with default priority', async () => {
      mockReadEmpty();
      const service = new TaskService('default');
      const task = await service.createTask({
        name: 'my-task',
        title: 'My Task',
      });
      expect(task.name).toBe('my-task');
      expect(task.title).toBe('My Task');
      expect(task.status).toBe('planning');
      expect(task.priority).toBe('medium');
      expect(task.id).toBe('task_test-uuid-1234');
      expect(task.notes).toEqual([]);
      expect(task.tags).toEqual([]);
    });

    it('creates a task with all fields', async () => {
      mockReadEmpty();
      const service = new TaskService('default');
      const task = await service.createTask({
        name: 'full-task',
        title: 'Full Task',
        description: 'A description',
        dev_type: 'feature',
        scope: 'backend',
        priority: 'urgent',
        parent: 'parent-id',
        tags: ['backend', 'feature'],
      });
      expect(task.description).toBe('A description');
      expect(task.dev_type).toBe('feature');
      expect(task.scope).toBe('backend');
      expect(task.priority).toBe('urgent');
      expect(task.parent).toBe('parent-id');
      expect(task.tags).toEqual(['backend', 'feature']);
    });

    it('throws if task name already exists', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'existing-task',
          title: 'Existing Task',
          status: 'planning',
          priority: 'medium',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      await expect(
        service.createTask({ name: 'existing-task', title: 'Duplicate' }),
      ).rejects.toThrow('任务名称 "existing-task" 已存在');
    });

    it('writes task to file after creation', async () => {
      mockReadEmpty();
      const service = new TaskService('default');
      await service.createTask({ name: 'new-task', title: 'New Task' });
      expect(hoistedMockFs.writeFile).toHaveBeenCalled();
      expect(hoistedMockFs.rename).toHaveBeenCalled();
    });
  });

  describe('startTask', () => {
    it('starts a task in planning status', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'task-a',
          title: 'Task A',
          status: 'planning',
          priority: 'medium',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      const task = await service.startTask({ task_id: 'task_1' });
      expect(task.status).toBe('in_progress');
      expect(task.started_at).toBeDefined();
    });

    it('starts a task in blocked status', async () => {
      const tasks: Task[] = [
        {
          id: 'task_blocked',
          name: 'task-blocked',
          title: 'Blocked Task',
          status: 'blocked',
          priority: 'high',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      const task = await service.startTask({ task_id: 'task_blocked' });
      expect(task.status).toBe('in_progress');
    });

    it('throws if task does not exist', async () => {
      mockReadEmpty();
      const service = new TaskService('default');
      await expect(
        service.startTask({ task_id: 'nonexistent' }),
      ).rejects.toThrow('任务 ID "nonexistent" 不存在');
    });

    it('throws if task is already in_progress', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'task-a',
          title: 'Task A',
          status: 'in_progress',
          priority: 'medium',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      await expect(service.startTask({ task_id: 'task_1' })).rejects.toThrow(
        '当前状态为 "in_progress"，无法启动',
      );
    });

    it('throws if task is completed', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'task-a',
          title: 'Task A',
          status: 'completed',
          priority: 'medium',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      await expect(service.startTask({ task_id: 'task_1' })).rejects.toThrow(
        '当前状态为 "completed"，无法启动',
      );
    });
  });

  describe('finishTask', () => {
    it('finishes a task in in_progress status', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'task-a',
          title: 'Task A',
          status: 'in_progress',
          priority: 'medium',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      const task = await service.finishTask({ task_id: 'task_1' });
      expect(task.status).toBe('completed');
      expect(task.completed_at).toBeDefined();
    });

    it('appends notes to task when finishing', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'task-a',
          title: 'Task A',
          status: 'in_progress',
          priority: 'medium',
          notes: ['existing note'],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      const task = await service.finishTask({
        task_id: 'task_1',
        notes: ['note 1', 'note 2'],
      });
      expect(task.notes).toEqual(['existing note', 'note 1', 'note 2']);
    });

    it('throws if task does not exist', async () => {
      mockReadEmpty();
      const service = new TaskService('default');
      await expect(
        service.finishTask({ task_id: 'nonexistent' }),
      ).rejects.toThrow('任务 ID "nonexistent" 不存在');
    });

    it('throws if task is not in_progress', async () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          name: 'task-a',
          title: 'Task A',
          status: 'planning',
          priority: 'medium',
          notes: [],
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockReadTasks(tasks);
      const service = new TaskService('default');
      await expect(service.finishTask({ task_id: 'task_1' })).rejects.toThrow(
        '当前状态为 "planning"，无法完成',
      );
    });
  });
});
