/**
 * 虚拟文件系统 mock 状态与控制函数
 */

import { vi } from 'vitest';

interface FileEntry {
  isDir: boolean;
  children?: string[];
  content?: string;
}

const g = globalThis as typeof globalThis & {
  __specMockTree__?: Map<string, FileEntry>;
};

function getTree(): Map<string, FileEntry> {
  if (!g.__specMockTree__) {
    g.__specMockTree__ = new Map();
  }
  return g.__specMockTree__;
}

function toUnix(p: string): string {
  // 将 Windows 路径转换为 Unix 风格：反斜杠 -> 正斜杠，去掉盘符
  let result = p.replace(/\\/g, '/'); // 替换所有反斜杠为正斜杠
  result = result.replace(/^[A-Z]:/, ''); // 去掉盘符如 C:
  return result;
}

const _mockReadFile = vi.fn();
const _mockReaddir = vi.fn();
const _mockAccess = vi.fn();

export const fsMockControl = {
  readFile: _mockReadFile,
  readdir: _mockReaddir,
  access: _mockAccess,

  reset(): void {
    _mockReadFile.mockReset();
    _mockReaddir.mockReset();
    _mockAccess.mockReset();
    _mockReadFile.mockImplementation(async (filePath: string) => {
      const tree = getTree();
      const unix = toUnix(filePath as string);
      process.stderr.write(
        `[SPEC-MOCK] readFile: ${unix} tree.has=${tree.has(unix)}\n`,
      );
      const entry = tree.get(unix);
      if (!entry || entry.content === undefined) {
        const err = new Error('ENOENT') as Error & { code: string };
        err.code = 'ENOENT';
        throw err;
      }
      return entry.content;
    });
    _mockReaddir.mockImplementation(async (dirPath: string) => {
      const tree = getTree();
      const unix = toUnix(dirPath as string);
      process.stderr.write(
        `[SPEC-MOCK] readdir: ${unix} tree.has=${tree.has(unix)}\n`,
      );
      const entry = tree.get(unix);
      if (!entry || !entry.isDir) {
        const err = new Error('ENOENT') as Error & { code: string };
        err.code = 'ENOENT';
        throw err;
      }
      if (!entry.children) return [];
      return entry.children.map((name) => {
        const childEntry = tree.get(`${unix}/${name}`);
        return {
          name,
          isDirectory: () => (childEntry ? childEntry.isDir : false),
          isFile: () => (childEntry ? !childEntry.isDir : true),
        };
      });
    });
    _mockAccess.mockImplementation(async (filePath: string) => {
      const tree = getTree();
      const unix = toUnix(filePath as string);
      process.stderr.write(
        `[SPEC-MOCK] access: ${unix} tree.has=${tree.has(unix)}\n`,
      );
      if (!tree.has(unix)) {
        const err = new Error('ENOENT') as Error & { code: string };
        err.code = 'ENOENT';
        throw err;
      }
    });
  },

  setup(
    tree: Record<
      string,
      { isDir?: boolean; children?: string[]; content?: string }
    >,
  ): void {
    process.stderr.write(
      `[SPEC-MOCK] setup called with keys: ${Object.keys(tree).join(', ')}\n`,
    );
    getTree().clear();
    for (const [path, meta] of Object.entries(tree)) {
      const key = toUnix(path);
      getTree().set(key, {
        isDir: meta.isDir ?? false,
        children: meta.children,
        content: meta.content,
      });
    }
    process.stderr.write(
      `[SPEC-MOCK] tree now has ${getTree().size} entries\n`,
    );
  },
};

fsMockControl.reset();
