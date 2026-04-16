/**
 * SessionJournalService — 会话日志服务
 * 提供任务会话的日志记录功能，支持循环日志和索引维护
 *
 * 目录结构:
 *   {Storage.getRuntimeBaseDir()}/journals/{sessionId}/
 *     ├── index.md           # 索引文件
 *     ├── journal-1.md       # 第1部分日志（2000行限制）
 *     ├── journal-2.md       # 第2部分日志
 *     └── ...
 */

import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import { createDebugLogger } from '../utils/debugLogger.js';

/** 日志文件名前缀 */
const JOURNAL_FILE_PREFIX = 'journal-';
/** 索引文件名 */
const INDEX_FILE_NAME = 'index.md';
/** 日志文件最大行数 */
const MAX_JOURNAL_LINES = 2000;
/** 会话日志子目录 */
const JOURNALS_SUBDIR = 'journals';

const debugLogger = createDebugLogger('SessionJournalService');

// ============================================================================
// Types
// ============================================================================

/**
 * Journal 文件信息
 */
export interface JournalFile {
  /** 文件路径 */
  path: string;
  /** 文件编号（如 1, 2, 3） */
  number: number;
  /** 当前行数 */
  lineCount: number;
  /** 是否为活动文件 */
  isActive: boolean;
}

/**
 * Journal 会话信息
 */
export interface JournalSession {
  /** 任务 ID */
  taskId: string;
  /** 任务标题 */
  title: string;
  /** 会话编号 */
  sessionNumber: number;
  /** 活动文件 */
  activeFile: JournalFile;
  /** 所有文件列表 */
  files: JournalFile[];
  /** 创建时间 */
  createdAt: string;
}

/**
 * Journal 启动参数
 */
export interface StartJournalParams {
  /** 任务 ID */
  taskId: string;
  /** 任务标题 */
  title: string;
}

/**
 * Journal 追加内容参数
 */
export interface AppendJournalParams {
  /** 任务 ID */
  taskId: string;
  /** 要追加的内容 */
  content: string;
}

/**
 * Journal 完成参数
 */
export interface FinishJournalParams {
  /** 任务 ID */
  taskId: string;
  /** 任务总结 */
  summary: string;
  /** 关联的 commit hash 列表 */
  commitHashes?: string[];
  /** Git 分支名称 */
  branch?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 获取会话日志目录路径
 * @param sessionId - 会话 ID
 */
function getJournalsDir(sessionId: string): string {
  return path.join(Storage.getRuntimeBaseDir(), JOURNALS_SUBDIR, sessionId);
}

/**
 * 从文件名提取 journal 编号
 */
function extractJournalNumber(filename: string): number {
  const match = filename.match(/^journal-(\d+)\.md$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * 获取 journal 文件路径
 * @param journalsDir - 日志目录
 * @param number - 文件编号
 */
function getJournalFilePath(journalsDir: string, number: number): string {
  return path.join(journalsDir, `${JOURNAL_FILE_PREFIX}${number}.md`);
}

/**
 * 获取索引文件路径
 * @param journalsDir - 日志目录
 */
function getIndexFilePath(journalsDir: string): string {
  return path.join(journalsDir, INDEX_FILE_NAME);
}

/**
 * 读取文件行数
 * @param filePath - 文件路径
 */
async function countFileLines(filePath: string): Promise<number> {
  const fs = await import('fs/promises');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

/**
 * 获取最新的 journal 文件信息
 * @param journalsDir - 日志目录
 */
async function getLatestJournalFile(
  journalsDir: string,
): Promise<{ file: JournalFile | null; number: number; lines: number }> {
  const fs = await import('fs/promises');
  try {
    const files = await fs.readdir(journalsDir);
    let latestFile: JournalFile | null = null;
    let latestNum = -1;
    let latestLines = 0;

    for (const filename of files) {
      if (
        !filename.startsWith(JOURNAL_FILE_PREFIX) ||
        !filename.endsWith('.md')
      ) {
        continue;
      }
      const num = extractJournalNumber(filename);
      if (num > latestNum) {
        latestNum = num;
        const filePath = path.join(journalsDir, filename);
        latestLines = await countFileLines(filePath);
        latestFile = {
          path: filePath,
          number: num,
          lineCount: latestLines,
          isActive: true,
        };
      }
    }

    return { file: latestFile, number: latestNum, lines: latestLines };
  } catch {
    return { file: null, number: 0, lines: 0 };
  }
}

/**
 * 获取索引文件中的会话总数
 * @param indexPath - 索引文件路径
 */
async function getSessionCountFromIndex(indexPath: string): Promise<number> {
  const fs = await import('fs/promises');
  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    const match = content.match(/Total Sessions[:\s]*(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * 原子写入文件（先写临时文件再 rename）
 * @param filePath - 目标文件路径
 * @param content - 文件内容
 */
async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const fs = await import('fs/promises');
  const crypto = await import('crypto');

  // 确保目录存在
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // 生成唯一临时文件名
  const tmpSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const tmpFilePath = `${filePath}.tmp.${tmpSuffix}`;

  // 1. 写入临时文件
  await fs.writeFile(tmpFilePath, content, 'utf-8');
  // 2. 原子移动到目标文件
  await fs.rename(tmpFilePath, filePath);
}

/**
 * 生成会话内容
 * @param sessionNum - 会话编号
 * @param title - 任务标题
 * @param summary - 任务总结
 * @param commitHashes - commit hash 列表
 * @param branch - Git 分支名称
 * @param today - 日期字符串
 */
function generateSessionContent(
  sessionNum: number,
  title: string,
  summary: string,
  commitHashes: string[],
  branch: string | undefined,
  today: string,
): string {
  const commitTable =
    commitHashes.length > 0
      ? `| Hash | Message |\n|------|---------|\n${commitHashes
          .map((c) => `| \`${c}\` | (see git log) |`)
          .join('\n')}`
      : '(No commits - planning session)';

  const branchLine = branch ? `\n**Branch**: \`${branch}\`` : '';

  return `

## Session ${sessionNum}: ${title}

**Date**: ${today}
**Task**: ${title}${branchLine}

### Summary

${summary}

### Git Commits

${commitTable}

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
`;
}

/**
 * 创建新的 journal 文件
 * @param journalsDir - 日志目录
 * @param number - 文件编号
 * @param today - 日期字符串
 */
async function createNewJournalFile(
  journalsDir: string,
  number: number,
  today: string,
): Promise<string> {
  const prevNum = number - 1;
  const filePath = getJournalFilePath(journalsDir, number);

  const content = `# Journal - Part ${number}

> Continuation from \`${JOURNAL_FILE_PREFIX}${prevNum}.md\` (archived at ~${MAX_JOURNAL_LINES} lines)
> Started: ${today}

---

`;
  await atomicWriteFile(filePath, content);
  return filePath;
}

/**
 * 生成索引文件内容
 * @param sessions - 会话历史列表
 * @param activeFile - 当前活动文件
 * @param totalSessions - 会话总数
 * @param today - 日期
 */
function generateIndexContent(
  sessions: Array<{
    num: number;
    date: string;
    title: string;
    commits: string;
    branch: string;
  }>,
  activeFile: string,
  totalSessions: number,
  today: string,
): string {
  // 生成会话历史表格行
  const sessionRows = sessions
    .map(
      (s) =>
        `| ${s.num} | ${s.date} | ${s.title} | ${s.commits} | \`${s.branch}\` |`,
    )
    .join('\n');

  return `# Journal Index

## Current Status
- **Active File**: \`${activeFile}\`
- **Total Sessions**: ${totalSessions}
- **Last Active**: ${today}

## Session History
| # | Date | Title | Commits | Branch |
|---|------|-------|---------|--------|
${sessionRows}
`;
}

// ============================================================================
// SessionJournalService
// ============================================================================

/**
 * SessionJournalService — 会话日志服务
 *
 * 提供任务的会话日志记录功能:
 * - 启动 journal: 创建新的日志文件
 * - 追加内容: 向当前 journal 追加内容（自动分卷）
 * - 完成 journal: 追加总结并更新索引
 * - 获取活动 journal: 查询当前活动的 journal 信息
 */
export class SessionJournalService {
  private readonly sessionId: string;

  /**
   * 创建会话日志服务实例
   * @param sessionId - 会话 ID，用于会话级别的日志存储
   */
  constructor(sessionId: string = 'default') {
    this.sessionId = sessionId;
  }

  /**
   * 启动新的 journal 会话
   * @param params - 启动参数
   * @returns 新创建的 journal 会话信息
   */
  async startJournal(params: StartJournalParams): Promise<JournalSession> {
    const { taskId, title } = params;
    const journalsDir = getJournalsDir(this.sessionId);
    const indexPath = getIndexFilePath(journalsDir);
    const today = new Date().toISOString().split('T')[0];

    debugLogger.info(
      `[SessionJournalService] Starting journal for task: ${taskId}`,
    );

    // 确保目录存在
    const fs = await import('fs/promises');
    await fs.mkdir(journalsDir, { recursive: true });

    // 获取当前会话编号
    const sessionCount = await getSessionCountFromIndex(indexPath);
    const sessionNumber = sessionCount + 1;

    // 获取最新 journal 文件
    const {
      file: latestFile,
      number: latestNum,
      lines: latestLines,
    } = await getLatestJournalFile(journalsDir);

    // 确定目标文件（如果当前文件接近上限则创建新文件）
    // latestNum 为 0 或 -1 都表示无现有文件，应从 1 开始编号
    let targetNum = latestNum <= 0 ? 1 : latestNum;
    let targetPath: string;

    if (latestFile && latestLines < MAX_JOURNAL_LINES) {
      // 使用现有文件
      targetPath = latestFile.path;
    } else {
      // 创建新文件
      targetNum = latestNum + 1;
      targetPath = await createNewJournalFile(journalsDir, targetNum, today);
      debugLogger.info(
        `[SessionJournalService] Created new journal file: ${path.basename(targetPath)}`,
      );
    }

    // 更新索引文件
    await this.updateIndex(
      sessionNumber,
      title,
      [],
      undefined,
      today,
      targetPath,
    );

    // 收集所有文件
    const files = await this.listJournalFiles(journalsDir, targetNum);

    return {
      taskId,
      title,
      sessionNumber,
      activeFile: files.find((f) => f.number === targetNum) || {
        path: targetPath,
        number: targetNum,
        lineCount: 0,
        isActive: true,
      },
      files,
      createdAt: today,
    };
  }

  /**
   * 追加内容到当前 journal
   * @param params - 追加参数
   */
  async appendJournal(params: AppendJournalParams): Promise<void> {
    const { taskId, content } = params;
    const journalsDir = getJournalsDir(this.sessionId);
    const today = new Date().toISOString().split('T')[0];

    debugLogger.debug(
      `[SessionJournalService] Appending ${content.split('\n').length} lines for task: ${taskId}`,
    );

    // 获取最新 journal 文件
    const { file: latestFile, lines: latestLines } =
      await getLatestJournalFile(journalsDir);

    if (!latestFile) {
      debugLogger.warn(
        `[SessionJournalService] No journal file found for task: ${taskId}`,
      );
      return;
    }

    const contentLines = content.split('\n').length;
    const totalLines = latestLines + contentLines;

    let targetPath = latestFile.path;
    let targetNum = latestFile.number;

    // 如果超过限制，创建新文件
    if (totalLines > MAX_JOURNAL_LINES) {
      targetNum = latestFile.number + 1;
      targetPath = await createNewJournalFile(journalsDir, targetNum, today);
      debugLogger.info(
        `[SessionJournalService] Exceeded ${MAX_JOURNAL_LINES} lines, created new file: ${path.basename(targetPath)}`,
      );
    }

    // 追加内容到文件
    const fs = await import('fs/promises');
    const contentWithTimestamp = `\n\n---\n**${new Date().toLocaleString()}**\n\n${content}`;
    await fs.appendFile(targetPath, contentWithTimestamp, 'utf-8');

    debugLogger.debug(
      `[SessionJournalService] Appended content to: ${path.basename(targetPath)}`,
    );
  }

  /**
   * 完成当前 journal
   * @param params - 完成参数
   */
  async finishJournal(params: FinishJournalParams): Promise<void> {
    const { taskId, summary, commitHashes = [], branch } = params;
    const journalsDir = getJournalsDir(this.sessionId);
    const today = new Date().toISOString().split('T')[0];

    debugLogger.info(
      `[SessionJournalService] Finishing journal for task: ${taskId}`,
    );

    // 获取当前会话编号
    const indexPath = getIndexFilePath(journalsDir);
    const sessionCount = await getSessionCountFromIndex(indexPath);
    const sessionNumber = sessionCount > 0 ? sessionCount : 1;

    // 获取最新 journal 文件
    const { file: latestFile } = await getLatestJournalFile(journalsDir);

    if (!latestFile) {
      debugLogger.warn(
        `[SessionJournalService] No journal file found to finish: ${taskId}`,
      );
      return;
    }

    // 生成会话内容
    const sessionContent = generateSessionContent(
      sessionNumber,
      taskId,
      summary,
      commitHashes,
      branch,
      today,
    );

    // 追加到文件
    const fsFinish = await import('fs/promises');
    await fsFinish.appendFile(latestFile.path, sessionContent, 'utf-8');

    // 更新索引（添加会话历史）
    await this.updateIndex(
      sessionNumber,
      taskId,
      commitHashes,
      branch,
      today,
      latestFile.path,
    );

    debugLogger.info(
      `[SessionJournalService] Journal finished: session ${sessionNumber}, ${commitHashes.length} commits`,
    );
  }

  /**
   * 获取当前活动的 journal 信息
   * @param taskId - 任务 ID
   * @returns 当前活动的 journal 信息
   */
  async getActiveJournal(taskId: string): Promise<JournalSession | null> {
    const journalsDir = getJournalsDir(this.sessionId);
    const indexPath = getIndexFilePath(journalsDir);

    // 检查目录是否存在
    const fs = await import('fs/promises');
    try {
      await fs.access(journalsDir);
    } catch {
      debugLogger.debug(
        `[SessionJournalService] No journal directory for session: ${this.sessionId}`,
      );
      return null;
    }

    // 获取最新文件
    const { file: latestFile, number: latestNum } =
      await getLatestJournalFile(journalsDir);

    if (!latestFile) {
      return null;
    }

    // 获取会话编号
    const sessionCount = await getSessionCountFromIndex(indexPath);

    // 收集所有文件
    const files = await this.listJournalFiles(journalsDir, latestNum);

    return {
      taskId,
      title: taskId,
      sessionNumber: sessionCount,
      activeFile: latestFile,
      files,
      createdAt: new Date().toISOString().split('T')[0],
    };
  }

  /**
   * 列出所有 journal 文件
   * @param journalsDir - 日志目录
   * @param activeNum - 当前活动文件编号
   */
  private async listJournalFiles(
    journalsDir: string,
    activeNum: number,
  ): Promise<JournalFile[]> {
    const fs = await import('fs/promises');
    const files: JournalFile[] = [];

    try {
      const dirFiles = await fs.readdir(journalsDir);

      for (const filename of dirFiles) {
        if (
          !filename.startsWith(JOURNAL_FILE_PREFIX) ||
          !filename.endsWith('.md')
        ) {
          continue;
        }

        const num = extractJournalNumber(filename);
        const filePath = path.join(journalsDir, filename);
        const lineCount = await countFileLines(filePath);

        files.push({
          path: filePath,
          number: num,
          lineCount,
          isActive: num === activeNum,
        });
      }
    } catch {
      // 目录不存在或无法读取
    }

    return files.sort((a, b) => a.number - b.number);
  }

  /**
   * 更新索引文件
   */
  private async updateIndex(
    sessionNum: number,
    title: string,
    commitHashes: string[],
    branch: string | undefined,
    today: string,
    activeFilePath: string,
  ): Promise<void> {
    const journalsDir = getJournalsDir(this.sessionId);
    const indexPath = getIndexFilePath(journalsDir);
    const activeFileName = path.basename(activeFilePath);

    // 格式化 commit
    const commitDisplay =
      commitHashes.length > 0
        ? commitHashes.map((c) => `\`${c}\``).join(', ')
        : '-';

    // 生成新的索引内容
    const sessions = [
      {
        num: sessionNum,
        date: today,
        title,
        commits: commitDisplay,
        branch: branch || '-',
      },
    ];

    const content = generateIndexContent(
      sessions,
      activeFileName,
      sessionNum,
      today,
    );

    await atomicWriteFile(indexPath, content);
    debugLogger.debug(`[SessionJournalService] Updated index.md`);
  }
}
