/**
 * taskTypes 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  isTaskStatus,
  isTrellisTaskPriority,
  isTaskPriority,
  isSimpleTaskPriority,
  PRIORITY_MAPPING,
  STATUS_LABELS,
  PRIORITY_LABELS,
  TRELLIS_PRIORITY_LABELS,
} from './taskTypes.js';

describe('taskTypes', () => {
  describe('isTaskStatus', () => {
    it('returns true for valid statuses', () => {
      expect(isTaskStatus('pending')).toBe(true);
      expect(isTaskStatus('planning')).toBe(true);
      expect(isTaskStatus('in_progress')).toBe(true);
      expect(isTaskStatus('review')).toBe(true);
      expect(isTaskStatus('completed')).toBe(true);
      expect(isTaskStatus('blocked')).toBe(true);
    });

    it('returns false for invalid statuses', () => {
      expect(isTaskStatus('done')).toBe(false);
      expect(isTaskStatus('pending ')).toBe(false);
      expect(isTaskStatus('')).toBe(false);
      expect(isTaskStatus('PLANNING')).toBe(false);
      expect(isTaskStatus(null)).toBe(false);
      expect(isTaskStatus(undefined)).toBe(false);
      expect(isTaskStatus(123)).toBe(false);
      expect(isTaskStatus({})).toBe(false);
    });
  });

  describe('isTrellisTaskPriority', () => {
    it('returns true for valid Trellis priorities', () => {
      expect(isTrellisTaskPriority('P0')).toBe(true);
      expect(isTrellisTaskPriority('P1')).toBe(true);
      expect(isTrellisTaskPriority('P2')).toBe(true);
      expect(isTrellisTaskPriority('P3')).toBe(true);
    });

    it('returns false for invalid Trellis priorities', () => {
      expect(isTrellisTaskPriority('P4')).toBe(false);
      expect(isTrellisTaskPriority('p0')).toBe(false);
      expect(isTrellisTaskPriority('P0 ')).toBe(false);
      expect(isTrellisTaskPriority('')).toBe(false);
      expect(isTrellisTaskPriority(null)).toBe(false);
    });
  });

  describe('isTaskPriority', () => {
    it('returns true for valid priorities', () => {
      expect(isTaskPriority('low')).toBe(true);
      expect(isTaskPriority('medium')).toBe(true);
      expect(isTaskPriority('high')).toBe(true);
      expect(isTaskPriority('urgent')).toBe(true);
    });

    it('returns false for invalid priorities', () => {
      expect(isTaskPriority('critical')).toBe(false);
      expect(isTaskPriority('LOW')).toBe(false);
      expect(isTaskPriority('')).toBe(false);
      expect(isTaskPriority(null)).toBe(false);
      expect(isTaskPriority(undefined)).toBe(false);
      expect(isTaskPriority(0)).toBe(false);
    });
  });

  describe('isSimpleTaskPriority', () => {
    it('is an alias for isTaskPriority', () => {
      expect(isSimpleTaskPriority).toBe(isTaskPriority);
      expect(isSimpleTaskPriority('high')).toBe(true);
      expect(isSimpleTaskPriority('invalid')).toBe(false);
    });
  });

  describe('PRIORITY_MAPPING', () => {
    it('maps simplified priorities to Trellis priorities', () => {
      expect(PRIORITY_MAPPING.low).toBe('P3');
      expect(PRIORITY_MAPPING.medium).toBe('P2');
      expect(PRIORITY_MAPPING.high).toBe('P1');
      expect(PRIORITY_MAPPING.urgent).toBe('P0');
    });
  });

  describe('STATUS_LABELS', () => {
    it('contains labels for all statuses', () => {
      expect(STATUS_LABELS.pending).toBe('待处理');
      expect(STATUS_LABELS.planning).toBe('规划中');
      expect(STATUS_LABELS.in_progress).toBe('进行中');
      expect(STATUS_LABELS.review).toBe('审核中');
      expect(STATUS_LABELS.completed).toBe('已完成');
      expect(STATUS_LABELS.blocked).toBe('已阻塞');
    });
  });

  describe('PRIORITY_LABELS', () => {
    it('contains labels for all simplified priorities', () => {
      expect(PRIORITY_LABELS.low).toBe('低优先级');
      expect(PRIORITY_LABELS.medium).toBe('中优先级');
      expect(PRIORITY_LABELS.high).toBe('高优先级');
      expect(PRIORITY_LABELS.urgent).toBe('紧急');
    });
  });

  describe('TRELLIS_PRIORITY_LABELS', () => {
    it('contains labels for all Trellis priorities', () => {
      expect(TRELLIS_PRIORITY_LABELS.P0).toBe('紧急 (P0)');
      expect(TRELLIS_PRIORITY_LABELS.P1).toBe('高 (P1)');
      expect(TRELLIS_PRIORITY_LABELS.P2).toBe('中 (P2)');
      expect(TRELLIS_PRIORITY_LABELS.P3).toBe('低 (P3)');
    });
  });
});
