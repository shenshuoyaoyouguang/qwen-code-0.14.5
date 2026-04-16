/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trellis 任务管理系统数据类型定义
 * 从 Trellis 项目移植，对应 scripts/common/types.py 中的数据结构
 */

// ==================== 枚举类型 ====================

/**
 * 任务状态枚举
 * 对应 Trellis TaskData.status
 */
export type TaskStatus =
  | 'pending' // 待处理（初始状态）
  | 'planning' // 规划中
  | 'in_progress' // 进行中
  | 'review' // 审核中
  | 'completed' // 已完成
  | 'blocked'; // 已阻塞

/**
 * 任务优先级枚举（Trellis 原始格式）
 * 对应 Trellis TaskData.priority
 */
export type TrellisTaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * 任务优先级（简化版 — Qwen Code 使用此格式）
 * 用于 UI 展示、参数输入
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// ==================== 核心数据结构 ====================

/**
 * 任务数据 - 磁盘持久化结构
 * 对应 Trellis TaskData TypedDict
 */
export interface TaskData {
  id: string;
  name: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dev_type?: string;
  scope?: string;
  package?: string;
  priority: TaskPriority;
  assignee?: string;
  branch?: string;
  children: string[];
  parent?: string;
  notes: string[];
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  session_id?: string;
  tags: string[];
}

/**
 * 任务信息 - 运行时只读视图
 * 对应 Trellis TaskInfo dataclass
 */
export interface TaskInfo {
  id: string;
  name: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  branch?: string;
  children: TaskInfo[];
  parentId?: string;
  package?: string;
  scope?: string;
  devType?: string;
  notes: string[];
  tags: string[];
}

/**
 * 任务索引文件结构
 * 存储 id → 文件路径的映射关系
 */
export interface TaskIndex {
  tasks: Record<string, string>; // id → file path
  order: string[];
  updated_at: string;
}

// ==================== 类型别名 ====================

/**
 * Task — 任务运行时类型（TaskService 使用的存储/返回类型）
 * 与 TaskData 相比去掉了 children/parentId 等层级字段，简化存储
 */
export type Task = Omit<TaskData, 'children'>;

/**
 * 启动任务参数
 */
export interface StartTaskParams {
  task_id: string;
}

/**
 * 完成任务参数
 */
export interface FinishTaskParams {
  task_id: string;
  notes?: string[];
}

/**
 * 任务过滤器（TaskService 层使用）
 */
export interface TaskFilter {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assignee?: string;
  parent?: string;
}

/**
 * 创建任务参数
 */
export interface TaskCreateParams {
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
 * 任务列表过滤器（TaskService 层使用）
 */
export type TaskListFilters = TaskFilter;

// ==================== 显示常量 ====================

/**
 * 状态显示名称映射
 */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '待处理',
  planning: '规划中',
  in_progress: '进行中',
  review: '审核中',
  completed: '已完成',
  blocked: '已阻塞',
};

// ==================== 类型守卫 ====================

/**
 * 判断是否为有效的任务状态
 */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === 'string' &&
    [
      'pending',
      'planning',
      'in_progress',
      'review',
      'completed',
      'blocked',
    ].includes(value)
  );
}

/**
 * 判断是否为有效的任务优先级（Trellis 格式）
 */
export function isTrellisTaskPriority(
  value: unknown,
): value is TrellisTaskPriority {
  return typeof value === 'string' && ['P0', 'P1', 'P2', 'P3'].includes(value);
}

/**
 * 判断是否为有效的任务优先级
 */
export function isTaskPriority(value: unknown): value is TaskPriority {
  return (
    typeof value === 'string' &&
    ['low', 'medium', 'high', 'urgent'].includes(value)
  );
}

/**
 * 判断是否为有效的任务优先级（别名，与 isTaskPriority 相同）
 */
export const isSimpleTaskPriority = isTaskPriority;

/**
 * 简化优先级到 Trellis 优先级的映射
 */
export const PRIORITY_MAPPING: Record<TaskPriority, TrellisTaskPriority> = {
  low: 'P3',
  medium: 'P2',
  high: 'P1',
  urgent: 'P0',
};

/**
 * 优先级显示名称映射（Trellis 格式）
 */
export const TRELLIS_PRIORITY_LABELS: Record<TrellisTaskPriority, string> = {
  P0: '紧急 (P0)',
  P1: '高 (P1)',
  P2: '中 (P2)',
  P3: '低 (P3)',
};

/**
 * 优先级显示名称映射（简化格式）
 */
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: '低优先级',
  medium: '中优先级',
  high: '高优先级',
  urgent: '紧急',
};
