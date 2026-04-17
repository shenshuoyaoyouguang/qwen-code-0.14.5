/**
 * SpecLoader — 分层规范加载器
 *
 * 支持从 `.qwen/spec/` 目录按优先级加载分层规范，
 * 并基于任务上下文（scope / tags / dev_type）匹配合适的规范子集。
 *
 * 规范优先级（由高到低）：
 *   1. .qwen/rules.md              — 旧版单文件规范入口（兼容）
 *   2. .qwen/spec/guides/index.md  — 指南入口
 *   3. .qwen/spec/guides/*.md      — 通用指南（非 index）
 *   4. .qwen/spec/{domain}/index.md — 域入口（按 scope 命中）
 *   5. .qwen/spec/{domain}/*.md    — 域内其他规范
 *
 * 职责边界：
 *   - QWEN.md         → 顶层持久上下文（memoryDiscovery 负责）
 *   - .qwen/rules.md  → 旧版规范（specLoader 兼容读取）
 *   - .qwen/spec/**   → 分层规范（本模块负责）
 */

import * as fs from 'fs/promises';
import type { Dirent, Stats } from 'node:fs';
import * as path from 'node:path';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('SpecLoader');

/** 规范文件容器 */
const SPEC_DIR = '.qwen';
const SPEC_SUBDIR = 'spec';
const RULES_FILE = 'rules.md';

/** 单个规范条目 */
export interface SpecEntry {
  /** 相对于 cwd 的路径 */
  relPath: string;
  /** 文件名 */
  filename: string;
  /** 规范内容 */
  content: string;
  /** 加载优先级（数字越小越高） */
  priority: number;
}

/** 规范加载结果 */
export interface LoadedSpecs {
  /** 所有已加载的规范条目（按 priority 排序） */
  entries: SpecEntry[];
  /** 是否命中了 rules.md */
  hasRules: boolean;
  /** 是否存在 spec/ 目录 */
  hasSpecDir: boolean;
  /** 因超过大小限制而跳过的文件路径列表 */
  skippedLargeFiles: string[];
}

/** 格式化后的规范块 */
export interface FormattedSpec {
  /** 规范来源路径 */
  source: string;
  /** 格式化的规范内容 */
  content: string;
  /** 来源标记（用于调试/溯源） */
  marker: string;
}

// ============================================================================
// 路径工具
// ============================================================================

function getSpecRootDir(cwd: string): string {
  return path.join(cwd, SPEC_DIR, SPEC_SUBDIR);
}

function getRulesFilePath(cwd: string): string {
  return path.join(cwd, SPEC_DIR, RULES_FILE);
}

// ============================================================================
// 文件大小限制
// ============================================================================

/** 单个规范文件最大允许大小（1MB），防止内存溢出 */
const MAX_FILE_SIZE = 1024 * 1024;

/** 记录因文件过大而跳过的文件路径（单次 loadAllSpecs 调用内累积） */
const _skippedLargeFiles: string[] = [];

function recordSkippedLargeFile(filePath: string): void {
  _skippedLargeFiles.push(filePath);
  debugLogger.debug(
    `[SpecLoader] Skipped large file (${MAX_FILE_SIZE} bytes limit): ${filePath}`,
  );
}

/** 获取并清除本轮 skippedLargeFiles 记录（用于注入 LoadedSpecs） */
function popSkippedLargeFiles(): string[] {
  const result = [..._skippedLargeFiles];
  _skippedLargeFiles.length = 0;
  return result;
}

// ============================================================================
// 文件读取（带大小检查）
// ============================================================================

/**
 * 带大小检查的安全文件读取。
 * 读取前先 fs.stat() 获取文件大小，超过 MAX_FILE_SIZE 的文件直接跳过。
 * 失败时记录分级日志：ENOENT=debug（正常跳过），EACCES/EPERM=warn，其他=warn。
 *
 * @param filePath 文件绝对路径
 * @returns 文件内容，或 null（文件不存在、超过大小限制或读取失败）
 */
async function safeReadFile(filePath: string): Promise<string | null> {
  let stat: Stats;
  try {
    stat = await fs.stat(filePath);
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'ENOENT') {
      // 文件不存在，正常跳过
      return null;
    }
    debugLogger.warn(
      `[SpecLoader] Failed to stat file: ${filePath}, code=${error.code ?? 'unknown'}, msg=${error.message}`,
    );
    return null;
  }

  if (stat.size > MAX_FILE_SIZE) {
    recordSkippedLargeFile(filePath);
    return null;
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'ENOENT') {
      // 并发场景下文件在 stat 后被删除，正常跳过
      return null;
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      debugLogger.warn(
        `[SpecLoader] Permission denied reading file: ${filePath}`,
      );
    } else {
      debugLogger.warn(
        `[SpecLoader] Failed to read file: ${filePath}, code=${error.code ?? 'unknown'}, msg=${error.message}`,
      );
    }
    return null;
  }
}

// ============================================================================
// 文件发现
// ============================================================================

/**
 * 递归收集目录中所有 .md 文件（使用 Set 跟踪已访问路径，防止符号链接循环）。
 *
 * @param dir 起始目录
 * @param visited 已访问目录路径集合（调用方传入空 Set）
 * @returns 所有 .md 文件的绝对路径列表
 */
async function readDirRecursively(
  dir: string,
  visited: Set<string>,
): Promise<string[]> {
  const mdFiles: string[] = [];

  // 统一用正斜杠归一化路径，用于 Set 跟踪和去重（兼容 Windows 平台）
  const normalizedDir = dir.replace(/\\/g, '/');

  // 解析真实路径用于 Set 比较（处理符号链接循环）
  let realDir: string;
  try {
    realDir = (await fs.realpath(dir)).replace(/\\/g, '/');
  } catch {
    realDir = normalizedDir;
  }

  if (visited.has(realDir)) {
    debugLogger.debug(
      `[SpecLoader] Skip already-visited directory (symlink cycle): ${dir}`,
    );
    return mdFiles;
  }
  visited.add(realDir);

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const error = err as Error & { code?: string };
    debugLogger.warn(
      `[SpecLoader] Failed to readdir: ${dir}, code=${error.code ?? 'unknown'}, msg=${error.message}`,
    );
    return mdFiles;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await readDirRecursively(fullPath, visited);
      mdFiles.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      mdFiles.push(fullPath);
    }
    // 忽略其他文件类型（块设备、符号链接文件等）
  }

  return mdFiles;
}

// ============================================================================
// 加载逻辑
// ============================================================================

/**
 * 加载 rules.md（兼容旧入口）
 */
async function loadRulesFile(rulesPath: string): Promise<SpecEntry | null> {
  const content = await safeReadFile(rulesPath);
  if (!content || !content.trim()) {
    return null;
  }
  return {
    relPath: rulesPath,
    filename: RULES_FILE,
    content: content.trim(),
    priority: 1,
  };
}

/**
 * 加载 spec/guides/index.md
 */
async function loadGuidesIndex(specRoot: string): Promise<SpecEntry | null> {
  const indexPath = path.join(specRoot, 'guides', 'index.md');
  const content = await safeReadFile(indexPath);
  if (!content || !content.trim()) {
    return null;
  }
  return {
    relPath: indexPath,
    filename: 'index.md',
    content: content.trim(),
    priority: 2,
  };
}

/**
 * 加载 guides/ 下除 index.md 外的其他 .md 文件（并行读取）
 * 注意：guides 目录只有一层，不使用递归
 */
async function loadGuidesOthers(specRoot: string): Promise<SpecEntry[]> {
  const guidesDir = path.join(specRoot, 'guides');

  let entries: Dirent[];
  try {
    entries = await fs.readdir(guidesDir, { withFileTypes: true });
  } catch {
    // guides/ 目录不存在，正常跳过
    return [];
  }

  const mdEntries = entries.filter(
    (e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'index.md',
  );

  // 并行读取所有文件，单个失败不影响其他
  const results = await Promise.all(
    mdEntries.map(async (entry) => {
      const fullPath = path.join(guidesDir, entry.name);
      const content = await safeReadFile(fullPath);
      if (!content || !content.trim()) return null;
      return {
        relPath: fullPath,
        filename: entry.name,
        content: content.trim(),
        priority: 3,
      } as SpecEntry;
    }),
  );

  return results.filter((r): r is SpecEntry => r !== null);
}

/**
 * 按 scope 加载域目录下所有深度的 .md 文件。
 * - 递归扫描所有嵌套子目录，使用 Set 跟踪已访问路径，防止符号链接循环
 * - index.md 优先级更高（priority=4），其他文件 priority=5
 *
 * @param specRoot - .qwen/spec/ 根目录
 * @param scope - 任务 scope（如 backend, frontend）
 */
async function loadDomainSpecs(
  specRoot: string,
  scope: string,
): Promise<SpecEntry[]> {
  const domainDir = path.join(specRoot, scope);

  try {
    await fs.access(domainDir, fs.constants.R_OK);
  } catch {
    return [];
  }

  // 递归收集所有 .md 文件（Set 防循环）
  const allMdFiles = await readDirRecursively(domainDir, new Set());
  const indexPath = path.join(domainDir, 'index.md');
  const otherFiles = allMdFiles.filter((f) => f !== indexPath);

  // 并行加载 index.md 和其他 .md 文件，单个失败不影响其他
  const [indexResult, ...otherResults] = await Promise.all([
    safeReadFile(indexPath),
    ...otherFiles.map((fullPath) => safeReadFile(fullPath)),
  ]);

  const results: SpecEntry[] = [];

  if (indexResult && indexResult.trim()) {
    results.push({
      relPath: indexPath,
      filename: 'index.md',
      content: indexResult.trim(),
      priority: 4,
    });
  }

  for (let i = 0; i < otherFiles.length; i++) {
    const content = otherResults[i];
    if (content && content.trim()) {
      results.push({
        relPath: otherFiles[i],
        filename: path.basename(otherFiles[i]),
        content: content.trim(),
        priority: 5,
      });
    }
  }

  return results;
}

/**
 * 加载所有规范（不区分 scope，各域目录并行加载）
 */
async function loadAllDomainSpecs(specRoot: string): Promise<SpecEntry[]> {
  try {
    await fs.access(specRoot, fs.constants.R_OK);
  } catch {
    return [];
  }

  let entries: Dirent[];
  try {
    entries = await fs.readdir(specRoot, { withFileTypes: true });
  } catch (err) {
    const error = err as Error & { code?: string };
    debugLogger.warn(
      `[SpecLoader] Failed to readdir specRoot: ${specRoot}, code=${error.code ?? 'unknown'}, msg=${error.message}`,
    );
    return [];
  }

  const domainDirs = entries.filter((e) => e.isDirectory());

  // 各域目录并行加载
  const domainResults = await Promise.all(
    domainDirs.map((entry) => loadDomainSpecs(specRoot, entry.name)),
  );

  return domainResults.flat();
}

// ============================================================================
// 任务上下文匹配
// ============================================================================

export interface TaskContext {
  /** 任务 scope，如 backend, frontend, infra */
  scope?: string;
  /** 任务类型，如 feature, bugfix, refactor */
  dev_type?: string;
  /** 任务标签 */
  tags?: string[];
}

/**
 * 判断规范是否与任务上下文相关
 *
 * 匹配策略：
 * - scope 完全匹配：优先（如 scope=backend 命中 backend/）
 * - tags 包含关系：次优先（如 tags=[react] 命中 frontend/）
 * - dev_type 关联：辅助（如 dev_type=feature 命中 features/）
 */
function isSpecRelevant(specRelPath: string, context: TaskContext): boolean {
  const rel = specRelPath.replace(/\\/g, '/');
  const parts = rel.split('/');

  // 没有任务上下文时，所有规范都相关
  if (
    !context.scope &&
    !context.dev_type &&
    (!context.tags || context.tags.length === 0)
  ) {
    return true;
  }

  // 检查 scope 是否命中域目录
  if (context.scope) {
    const specIndex = parts.indexOf(SPEC_SUBDIR);
    if (specIndex >= 0) {
      const domain = parts[specIndex + 1];
      // 域目录名与 scope 匹配
      if (domain === context.scope) {
        return true;
      }
      // scope 可能包含斜杠（如 backend/api），检查前缀
      if (
        domain &&
        (context.scope === domain ||
          context.scope.startsWith(`${domain}/`) ||
          domain.startsWith(`${context.scope}/`))
      ) {
        return true;
      }
    }
  }

  // 检查文件名是否包含 tags 或 dev_type 关键词
  const filename = parts[parts.length - 1] ?? '';
  const filenameLower = filename.toLowerCase();

  if (context.tags) {
    for (const tag of context.tags) {
      if (filenameLower.includes(tag.toLowerCase())) {
        return true;
      }
    }
  }

  if (context.dev_type) {
    if (filenameLower.includes(context.dev_type.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * 过滤并排序规范条目
 */
function filterAndSortEntries(
  entries: SpecEntry[],
  context: TaskContext,
): SpecEntry[] {
  const filtered = entries.filter((e) => isSpecRelevant(e.relPath, context));
  return filtered.sort((a, b) => a.priority - b.priority);
}

// ============================================================================
// 公开 API
// ============================================================================

/**
 * 加载所有规范（不区分 scope）
 * @param cwd - 当前工作目录
 */
export async function loadAllSpecs(cwd: string): Promise<LoadedSpecs> {
  const rulesPath = getRulesFilePath(cwd);
  const specRoot = getSpecRootDir(cwd);

  // 三个阶段完全并行：rules / guides / allDomainSpecs
  const [
    rulesResult,
    guidesIndexResult,
    guidesOthersResult,
    domainEntriesResult,
  ] = await Promise.all([
    loadRulesFile(rulesPath),
    loadGuidesIndex(specRoot),
    loadGuidesOthers(specRoot),
    loadAllDomainSpecs(specRoot),
  ]);

  const entries: SpecEntry[] = [];

  if (rulesResult) entries.push(rulesResult);
  if (guidesIndexResult) entries.push(guidesIndexResult);
  entries.push(...guidesOthersResult);
  entries.push(...domainEntriesResult);

  // 按 priority 排序（保持原有行为）
  entries.sort((a, b) => a.priority - b.priority);

  // 收集本轮跳过的超大文件
  const skippedLargeFiles = popSkippedLargeFiles();

  debugLogger.debug(
    `[SpecLoader] Loaded ${entries.length} spec entries (hasRules=${!!rulesResult}), skippedLargeFiles=${skippedLargeFiles.length}`,
  );

  return {
    entries,
    hasRules: !!rulesResult,
    hasSpecDir: entries.length > 0,
    skippedLargeFiles,
  };
}

/**
 * 加载与任务上下文相关的规范
 * @param cwd - 当前工作目录
 * @param context - 任务上下文
 */
export async function loadRelevantSpecs(
  cwd: string,
  context: TaskContext,
): Promise<LoadedSpecs> {
  const all = await loadAllSpecs(cwd);
  const filtered = filterAndSortEntries(all.entries, context);

  debugLogger.debug(
    `[SpecLoader] Filtered to ${filtered.length}/${all.entries.length} relevant specs for context: ${JSON.stringify(context)}`,
  );

  return {
    entries: filtered,
    hasRules: all.hasRules,
    hasSpecDir: all.hasSpecDir,
    skippedLargeFiles: all.skippedLargeFiles,
  };
}

/**
 * 格式化规范为 Prompt 友好文本
 * @param entries - 规范条目
 * @param cwd - 当前工作目录（用于计算相对路径）
 */
export function formatSpecsForPrompt(
  entries: SpecEntry[],
  cwd: string,
): string {
  if (entries.length === 0) {
    return '';
  }

  const blocks = entries.map((entry) => {
    const relPath = path.relative(cwd, entry.relPath).replace(/\\/g, '/');
    const marker = `<!-- from: ${relPath} -->`;
    return `${marker}\n${entry.content}`;
  });

  return blocks.join('\n\n');
}

/**
 * 获取规范加载统计信息（用于调试）
 */
export function getSpecStats(loaded: LoadedSpecs): {
  totalCount: number;
  hasRules: boolean;
  hasSpecDir: boolean;
  domains: string[];
  skippedLargeFiles: string[];
} {
  const domains = new Set<string>();

  for (const entry of loaded.entries) {
    const rel = entry.relPath.replace(/\\/g, '/');
    const parts = rel.split('/');
    const specIndex = parts.indexOf(SPEC_SUBDIR);
    if (specIndex >= 0 && parts[specIndex + 1]) {
      domains.add(parts[specIndex + 1]);
    }
  }

  return {
    totalCount: loaded.entries.length,
    hasRules: loaded.hasRules,
    hasSpecDir: loaded.hasSpecDir,
    domains: Array.from(domains).sort(),
    skippedLargeFiles: loaded.skippedLargeFiles,
  };
}
