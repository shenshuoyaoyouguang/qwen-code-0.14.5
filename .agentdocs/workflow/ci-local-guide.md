# Qwen Code 本地 CI 验证指南

> 本文档将 GitHub Actions CI（`.github/workflows/ci.yml`）等效为可在 Windows 本地运行的验证流程，用于 Phase 2 开发前的基线验证和合并前的回归验证。

## 目录

- [前置条件](#前置条件)
- [本地 CI 完整检查清单](#本地-ci-完整检查清单)
- [快捷脚本 `npm run ci:local`](#快捷脚本-npm-run-cilocal)
- [Windows 兼容注意事项](#windows-兼容注意事项)
- [基线结果模板](#基线结果模板)

---

## 前置条件

| 工具    | 版本要求              | 安装方式                                                 | Windows 注意事项                                   |
| ------- | --------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Node.js | >= 20（.nvmrc: `20`） | [nodejs.org](https://nodejs.org/) 或 nvm                 | 建议使用官方 MSI 安装程序                          |
| npm     | 随 Node.js 绑定       | -                                                        | 确保 `npm` 在 PATH 中                              |
| Python3 | >= 3.8                | [python.org](https://www.python.org/) 或 Microsoft Store | 安装时勾选 "Add Python to PATH"，或使用 `py` 命令  |
| pip     | 随 Python 绑定        | `python -m ensurepip`                                    | 可用 `python -m pip --version` 验证                |
| Git     | 任意版本              | [git-scm.com](https://git-scm.com/)                      | 建议使用 Git Bash 或 WSL                           |
| curl    | 任意版本              | Git Bash 自带，或系统 curl                               | Windows 11 原生 curl 与 Git Bash curl 行为略有差异 |

> 注意：`scripts/lint.js` 依赖 curl 下载 actionlint/shellcheck 二进制文件。Windows 下建议使用 **Git Bash** 或 **WSL** 执行 `npm run ci:local`，以避免兼容性问题。

---

## 本地 CI 完整检查清单

以下清单与 `.github/workflows/ci.yml` 中的 Job 步骤一一对应。

### Phase A：Lint Job（对应 CI `lint` Job）

#### A1. 依赖安装

```bash
npm ci
```

- **预期耗时**：1~3 分钟（取决于网络和 node_modules 是否已有缓存）
- **失败排查**：
  - `ENOENT: no such file or directory`：确认当前目录为项目根目录（存在 `package.json`）
  - `EINTEGRITY` 错误：删除 `node_modules` 和 `package-lock.json`，重新 `npm install`
  - 网络超时：配置 npm 镜像（如 `npm config set registry https://registry.npmmirror.com`）

#### A2. 锁文件校验

```bash
npm run check:lockfile
```

- **预期耗时**：< 5 秒
- **失败排查**：
  - 输出 `missing the "resolved" or "integrity" field`：锁文件被手动编辑或合并冲突导致格式损坏
  - 解决方案：重新生成锁文件 `rm package-lock.json && npm install`

#### A3. Linter 工具安装

```bash
node scripts/lint.js --setup
```

- **预期耗时**：30 秒 ~ 2 分钟（首次下载 binary 时，重复运行跳过已安装的工具）
- **Windows 注意事项**：
  - 使用 **Git Bash** 执行，脚本内部使用 `curl` 和 `tar`（Git Bash 自带）
  - actionlint/shellcheck 的 Windows 版本不完整，建议在 Git Bash 模式下运行
  - yamllint 通过 `pip3 install` 安装，需确保 Python/pip 可用
- **失败排查**：
  - `command not found: curl`：在 Git Bash 中执行，而非原生 PowerShell
  - `command not found: pip3`：使用 `python -m pip install yamllint`
  - 网络下载失败：手动下载对应平台的 release 包，放入 `TEMP_DIR/qwen-code-linters/`

#### A4. ESLint 检查

```bash
npm run lint:ci
```

- **预期耗时**：1~3 分钟
- **失败排查**：
  - `max-warnings` 违规：执行 `npm run lint:fix` 自动修复，或在 `eslint.config.js` 中调整规则
  - TS/TSX 解析错误：确认 `tsconfig.json` 存在且路径正确
  - 内存溢出（大型 monorepo）：在 PowerShell 中设置 `NODE_OPTIONS=--max-old-space-size=4096`

#### A5. actionlint 检查（Shell 脚本 lint）

```bash
node scripts/lint.js --actionlint
```

- **预期耗时**：5~15 秒
- **Windows 注意事项**：
  - `scripts/lint.js` 中的 `getPlatformArch()` 仅支持 `linux/darwin`，在 Windows 原生环境下会抛出 `Unsupported platform/architecture` 错误
  - **解决方案**：在 Git Bash 中执行，或跳过此步（Windows 下暂不强制要求 actionlint）
- **失败排查**：
  - 手动安装：`curl -sSL https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_windows_amd64.zip | tar -xzf - -C /usr/local/bin/`

#### A6. shellcheck 检查（Shell 脚本质量）

```bash
node scripts/lint.js --shellcheck
```

- **预期耗时**：5~15 秒
- **Windows 注意事项**：同 A5，需 Git Bash 环境
- **失败排查**：
  - Windows 下 git ls-files 路径格式与 Unix 不同，管道命令链可能失效
  - 手动安装（Git Bash）：`pacman -S mingw-w64-x86_64-shellcheck` 或从官网下载

#### A7. yamllint 检查

```bash
node scripts/lint.js --yamllint
```

- **预期耗时**：5~10 秒
- **Windows 注意事项**：
  - 需要 Python + pip，先执行 `pip install yamllint==1.35.1`
  - `git ls-files` 在 Windows 下对 YAML 文件路径可能使用反斜杠，yamllint 需接收正斜杠路径
- **失败排查**：
  - 手动运行：`python -m yamllint --format github .github/workflows/`

#### A8. Prettier 格式化检查

```bash
npx prettier --experimental-cli --check .
```

- **预期耗时**：30 秒 ~ 1 分钟
- **失败排查**：
  - 文件被格式化：执行 `npm run format`（会修改文件），确认修改后重新提交
  - `--check` 只检查不修改，如需修复运行 `npm run format`

#### A9. 敏感关键词检查

```bash
node scripts/lint.js --sensitive-keywords
```

- **预期耗时**：5~10 秒
- **失败排查**：输出包含 `TODO`、`FIXME`、`console.log` 等关键词，需手动清理或确认是否误报

#### A10. CLI 包构建

```bash
npm run build --workspace=packages/cli
```

- **预期耗时**：30 秒 ~ 2 分钟
- **失败排查**：
  - TypeScript 类型错误：完整构建时会暴露类型问题，先运行 `npm run typecheck`
  - esbuild 找不到模块：确认所有 workspace 依赖已正确安装（`npm run build` 先于本步）

#### A11. 设置文件 Schema 生成

```bash
npm run generate:settings-schema
```

- **预期耗时**：5~15 秒
- **失败排查**：
  - 依赖 `tsx` 运行时：确认 `node_modules/.bin/tsx` 存在
  - JSON Schema 生成失败：检查 `packages/vscode-ide-companion/` 下源文件的 TypeScript 类型定义

#### A12. Schema 文件同步检查

```bash
# 手动检查，与 CI 中的 git status --porcelain 等效
git status --porcelain packages/vscode-ide-companion/schemas/settings.schema.json
```

- **预期耗时**：< 5 秒
- **失败排查**：
  - 如有输出，说明 schema 文件有未提交变更，需运行 `npm run generate:settings-schema` 并重新提交

---

### Phase B：Test Job（对应 CI `test` Job）

> 注意：CI 中 test job 在多平台（macOS/Ubuntu/Windows）× 多 Node 版本（20/22/24）的矩阵下运行。本地验证建议**至少在当前环境的 Node 版本下完整跑一次**，其他矩阵可作为可选补充。

#### B1. 测试环境准备

```bash
npm run build
```

- **预期耗时**：2~5 分钟（全量构建所有 workspace）
- **与 CI 差异**：CI 中使用 `npm run build`（全量），而 lint job 使用 `npm run build --workspace=packages/cli`
- **失败排查**：
  - 参见 A10 的构建失败排查方向
  - 如有 `@lydell/node-pty` 可选依赖编译失败（Windows ARM64 等），可暂时忽略（可选依赖不阻断构建）

#### B2. CI 模式测试执行

```bash
$env:NO_COLOR="1"; npm run test:ci
```

- **预期耗时**：5~15 分钟（取决于测试用例数量和 CPU 性能）
- **与 CI 差异**：
  - CI 设置 `NO_COLOR: true`，本地等效设置环境变量
  - CI 运行 `npm run test:ci --workspaces --if-present --parallel` 并行执行所有 workspace 的测试
  - 额外执行 `npm run test:scripts` 测试 scripts 目录
- **失败排查**：
  - 测试超时：检查 `vitest.config.ts` 中的 `testTimeout`
  - 覆盖率文件缺失：确认 `packages/*/coverage/` 目录有写入权限
  - sandbox 相关测试失败：本地环境 `QWEN_SANDBOX=false`，不依赖 Docker/Podman
  - 并行测试竞争条件：如偶发性失败，可改为串行：`npm run test:ci`（不加 `--parallel`，Vitest 默认串行）

---

## 快捷脚本 `npm run ci:local`

### 新增内容

在 `package.json` 的 `scripts` 字段中新增以下条目：

```json
{
  "ci:local": "node scripts/ci-local.js"
}
```

### `scripts/ci-local.js` 完整内容

此脚本将 CI 中的 lint 和 test job 步骤整合为一个可中断执行的流程，每个步骤独立报告成功/失败。

```javascript
#!/usr/bin/env node

/**
 * 本地 CI 验证脚本
 * 等效于 GitHub Actions CI (.github/workflows/ci.yml) 的 lint + test job
 *
 * 使用方式:
 *   npm run ci:local            # 运行完整流程
 *   node scripts/ci-local.js     # 直接运行
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';
import { cwd } from 'node:process';

const IS_WINDOWS = platform() === 'win32';
const IS_GIT_BASH = IS_WINDOWS && process.env.MSYSTEM !== undefined;
const IS_POWERSHELL = IS_WINDOWS && !process.env.MSYSTEM;

const GREEN = IS_WINDOWS ? '' : '\x1b[32m';
const RED = IS_WINDOWS ? '' : '\x1b[31m';
const YELLOW = IS_WINDOWS ? '' : '\x1b[33m';
const RESET = IS_WINDOWS ? '' : '\x1b[0m';

const PREFIX = IS_WINDOWS ? '[CI-LOCAL]' : `[${GREEN}CI-LOCAL${RESET}]`;

function log(msg) {
  console.log(`${PREFIX} ${msg}`);
}

function logStep(step, status, detail = '') {
  const symbol =
    status === 'OK'
      ? `${GREEN}✓${RESET}`
      : status === 'FAIL'
        ? `${RED}✗${RESET}`
        : `${YELLOW}→${RESET}`;
  const ts = new Date().toLocaleTimeString();
  console.log(
    `${PREFIX} [${ts}] ${symbol} ${step}${detail ? ` ${detail}` : ''}`,
  );
}

function run(cmd, opts = {}) {
  const { silent = false, env = {} } = opts;
  const mergedEnv = { ...process.env, NO_COLOR: '1', ...env };
  try {
    if (!silent) log(`Running: ${cmd}`);
    execSync(cmd, {
      stdio: 'inherit',
      env: mergedEnv,
      shell: IS_GIT_BASH ? 'bash' : undefined,
    });
    return true;
  } catch (_err) {
    return false;
  }
}

function check(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore', shell: IS_GIT_BASH ? 'bash' : undefined });
    return true;
  } catch (_err) {
    return false;
  }
}

function heading(title) {
  const line = '─'.repeat(60);
  console.log(`\n${PREFIX} ${line}`);
  log(`${YELLOW}${title}${RESET}`);
  console.log(`${PREFIX} ${line}\n`);
}

async function main() {
  const startTime = Date.now();
  const failed = [];
  const skipped = [];
  const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  const os = `${platform()} (${IS_GIT_BASH ? 'Git Bash' : IS_POWERSHELL ? 'PowerShell' : 'Unix Shell'})`;

  console.log('\n' + '='.repeat(60));
  log(`${YELLOW}Qwen Code 本地 CI 验证${RESET}`);
  console.log('='.repeat(60));
  log(`Node.js:  ${nodeVersion}`);
  log(`npm:      ${npmVersion}`);
  log(`Platform: ${os}`);
  log(`CWD:      ${cwd()}`);
  console.log('='.repeat(60) + '\n');

  // ── 前置检查 ──────────────────────────────────────────
  heading('Phase A: Lint Job');

  // A1. npm ci
  if (!run('npm ci --prefer-offline --no-audit --progress=false')) {
    failed.push('A1-npm-ci');
    logStep('A1 npm ci', 'FAIL');
  } else {
    logStep('A1 npm ci', 'OK');
  }

  // A2. check:lockfile
  if (!run('npm run check:lockfile')) {
    failed.push('A2-lockfile');
    logStep('A2 check:lockfile', 'FAIL');
  } else {
    logStep('A2 check:lockfile', 'OK');
  }

  // A3. lint.js --setup
  if (!run('node scripts/lint.js --setup')) {
    // actionlint/shellcheck 在 Windows 原生环境可能失败，标记为警告而非硬失败
    if (IS_WINDOWS && !IS_GIT_BASH) {
      skipped.push('A3-linters-setup-windows');
      logStep(
        'A3 lint.js --setup',
        'SKIP',
        '(Windows 非 Git Bash 环境，跳过外部 linter 安装)',
      );
    } else {
      failed.push('A3-linters-setup');
      logStep('A3 lint.js --setup', 'FAIL');
    }
  } else {
    logStep('A3 lint.js --setup', 'OK');
  }

  // A4. ESLint
  if (!run('npm run lint:ci')) {
    failed.push('A4-eslint');
    logStep('A4 ESLint (lint:ci)', 'FAIL');
  } else {
    logStep('A4 ESLint (lint:ci)', 'OK');
  }

  // A5. actionlint（Windows 非 Git Bash 环境跳过）
  if (IS_WINDOWS && !IS_GIT_BASH) {
    skipped.push('A5-actionlint');
    logStep('A5 actionlint', 'SKIP', '(需要 Git Bash 环境)');
  } else if (!run('node scripts/lint.js --actionlint')) {
    failed.push('A5-actionlint');
    logStep('A5 actionlint', 'FAIL');
  } else {
    logStep('A5 actionlint', 'OK');
  }

  // A6. shellcheck（Windows 非 Git Bash 环境跳过）
  if (IS_WINDOWS && !IS_GIT_BASH) {
    skipped.push('A6-shellcheck');
    logStep('A6 shellcheck', 'SKIP', '(需要 Git Bash 环境)');
  } else if (!run('node scripts/lint.js --shellcheck')) {
    failed.push('A6-shellcheck');
    logStep('A6 shellcheck', 'FAIL');
  } else {
    logStep('A6 shellcheck', 'OK');
  }

  // A7. yamllint
  if (!run('node scripts/lint.js --yamllint')) {
    failed.push('A7-yamllint');
    logStep('A7 yamllint', 'FAIL');
  } else {
    logStep('A7 yamllint', 'OK');
  }

  // A8. Prettier
  if (!run('npx prettier --experimental-cli --check .')) {
    failed.push('A8-prettier');
    logStep('A8 Prettier --check', 'FAIL');
  } else {
    logStep('A8 Prettier --check', 'OK');
  }

  // A9. sensitive-keywords（lint.js 内部步骤之一，全量 lint:ci 已覆盖）
  // 如 lint.js --sensitive-keywords 为独立步骤则启用
  // if (!run('node scripts/lint.js --sensitive-keywords')) {
  //   failed.push('A9-sensitive-keywords');
  // }

  // A10. CLI build
  if (!run('npm run build --workspace=packages/cli')) {
    failed.push('A10-cli-build');
    logStep('A10 CLI build', 'FAIL');
  } else {
    logStep('A10 CLI build', 'OK');
  }

  // A11. settings schema 生成
  if (!run('npm run generate:settings-schema')) {
    failed.push('A11-schema-gen');
    logStep('A11 generate:settings-schema', 'FAIL');
  } else {
    logStep('A11 generate:settings-schema', 'OK');
  }

  // A12. schema 文件同步检查
  const schemaPath = join(
    cwd(),
    'packages/vscode-ide-companion/schemas/settings.schema.json',
  );
  if (existsSync(schemaPath)) {
    try {
      execSync(
        'git diff --quiet packages/vscode-ide-companion/schemas/settings.schema.json',
        {
          shell: IS_GIT_BASH ? 'bash' : undefined,
        },
      );
      logStep('A12 schema up-to-date check', 'OK');
    } catch (_err) {
      failed.push('A12-schema-sync');
      logStep(
        'A12 schema up-to-date check',
        'FAIL',
        '(settings.schema.json 有未提交的变更)',
      );
      console.log(
        `${PREFIX}   提示：运行 npm run generate:settings-schema 生成并提交更新`,
      );
    }
  } else {
    skipped.push('A12-schema-check');
    logStep('A12 schema up-to-date check', 'SKIP', '(文件不存在，跳过)');
  }

  // ── Phase B: Test Job ──────────────────────────────────
  heading('Phase B: Test Job');

  // B1. 全量构建
  if (!run('npm run build')) {
    failed.push('B1-build');
    logStep('B1 npm run build', 'FAIL');
  } else {
    logStep('B1 npm run build', 'OK');
  }

  // B2. CI 模式测试
  if (!run('npm run test:ci')) {
    failed.push('B2-test-ci');
    logStep('B2 test:ci', 'FAIL');
  } else {
    logStep('B2 test:ci', 'OK');
  }

  // ── 结果汇总 ──────────────────────────────────────────
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  console.log('\n' + '='.repeat(60));
  log(`${YELLOW}验证完成${RESET} — 耗时 ${mins}m ${secs}s`);
  console.log('='.repeat(60));

  if (skipped.length > 0) {
    log(`${YELLOW}跳过 (可忽略):${RESET} ${skipped.join(', ')}`);
  }

  if (failed.length > 0) {
    log(`${RED}失败:${RESET} ${failed.join(', ')}`);
    console.log(
      '\n请根据上方输出定位失败原因，修复后重新运行 npm run ci:local',
    );
    process.exit(1);
  } else {
    log(`${GREEN}所有检查通过！${RESET}`);
    process.exit(0);
  }
}

main();
```

> **为什么要独立脚本而非直接写在 `package.json` 中？**
> CI lint job 包含约 12 个独立步骤，Windows PowerShell 的 `&&` 链在任意一步失败时会输出不清晰的错误信息。独立 Node 脚本提供彩色输出、分步报告、失败统计，且可精确控制环境变量和 shell 选项。

---

## Windows 兼容注意事项

### 1. shell 执行环境

| 场景                | 推荐方式                             | 说明                                                              |
| ------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| 日常开发            | PowerShell 7 / Windows Terminal      | Node.js/npm 原生支持                                              |
| CI 本地验证         | **Git Bash**（msys2）                | `scripts/lint.js` 依赖 curl/tar/git ls-files 等 Unix 工具链       |
| PowerShell 强制运行 | 使用 `npm run lint:ci` 等 npm script | npm script 通过 `shell` 配置使用 bash（见 `package.json` 根配置） |

### 2. line endings

Windows 换行符（CRLF）与 Unix（LF）差异可能导致 shell 脚本执行失败。

```powershell
# 推荐：统一 LF
git config --global core.autocrlf input
# 对已有文件：删除 node_modules 后重新 clone，或执行
npm run clean
```

### 3. 路径分隔符

`scripts/lint.js` 内部使用 `join()` 生成跨平台路径（`path.join`），理论上安全。但 git bash 下 `node scripts/lint.js` 的工作目录为 `/d/xiaoxiao/...`，与 PowerShell 的 `D:\xiaoxiao\...` 等价，无需额外处理。

### 4. npm config rate limiting（可选，减少 CI 与本地网络行为差异）

```powershell
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm config set fetch-retries 5
npm config set fetch-timeout 300000
```

### 5. actionlint / shellcheck 替代方案（PowerShell 环境）

如果仅能在 PowerShell 中运行 lint job，跳过 actionlint（A5）和 shellcheck（A6）不会阻断主要代码质量检查，因为 ESLint 已覆盖 JavaScript/TypeScript 代码。

### 6. `scripts/lint.js --sensitive-keywords` 步骤

当前 `scripts/lint.js` 的 `LINTERS` 对象中没有定义 `sensitive-keywords`，但 CI 中 `lint.js --sensitive-keywords` 是一个独立步骤。如果项目后续添加此检查，`ci-local.js` 预留了对应的 `A9` 槽位。

---

## 基线结果模板

在 Phase 2 开发前，运行一次完整 `npm run ci:local`，记录以下结果作为基线。

### 基线记录表

| 字段          | 值                                                                 |
| ------------- | ------------------------------------------------------------------ |
| 记录日期      | `YYYY-MM-DD`                                                       |
| 分支名        | `git rev-parse --abbrev-ref HEAD`                                  |
| Node.js 版本  | `node --version`                                                   |
| npm 版本      | `npm --version`                                                    |
| 操作系统      | `uname -a`（Git Bash）或 `$PSVersionTable.PSVersion`（PowerShell） |
| CI-LOCAL 耗时 | `Xm Ys`                                                            |

### Phase A 结果

| 步骤               | 命令                                                                          | 状态               | 错误信息（失败时填写） |
| ------------------ | ----------------------------------------------------------------------------- | ------------------ | ---------------------- |
| A1 npm ci          | `npm ci --prefer-offline --no-audit --progress=false`                         | PASS / FAIL        |                        |
| A2 check:lockfile  | `npm run check:lockfile`                                                      | PASS / FAIL        |                        |
| A3 lint.js --setup | `node scripts/lint.js --setup`                                                | PASS / FAIL / SKIP |                        |
| A4 ESLint          | `npm run lint:ci`                                                             | PASS / FAIL        |                        |
| A5 actionlint      | `node scripts/lint.js --actionlint`                                           | PASS / FAIL / SKIP |                        |
| A6 shellcheck      | `node scripts/lint.js --shellcheck`                                           | PASS / FAIL / SKIP |                        |
| A7 yamllint        | `node scripts/lint.js --yamllint`                                             | PASS / FAIL        |                        |
| A8 Prettier        | `npx prettier --experimental-cli --check .`                                   | PASS / FAIL        |                        |
| A10 CLI build      | `npm run build --workspace=packages/cli`                                      | PASS / FAIL        |                        |
| A11 schema 生成    | `npm run generate:settings-schema`                                            | PASS / FAIL        |                        |
| A12 schema 同步    | `git diff --quiet packages/vscode-ide-companion/schemas/settings.schema.json` | PASS / FAIL        |                        |

### Phase B 结果

| 步骤        | 命令              | 状态        | 错误信息（失败时填写） |
| ----------- | ----------------- | ----------- | ---------------------- |
| B1 全量构建 | `npm run build`   | PASS / FAIL |                        |
| B2 test:ci  | `npm run test:ci` | PASS / FAIL |                        |

### 测试覆盖率摘要（可选）

运行 `npm run test:ci` 后，从 `packages/*/coverage/coverage-summary.json` 读取：

| Package | 语句覆盖率   | 分支覆盖率   |
| ------- | ------------ | ------------ |
| cli     | e.g. `84.3%` | e.g. `71.2%` |
| core    | e.g. `91.0%` | e.g. `78.5%` |

### 回归对比说明

在 Phase 2 合并前，再次运行 `npm run ci:local`，与上表逐项对比：

- 任何 **FAIL** 均为阻断性问题，需修复后合并
- 覆盖率**显著下降**（>5%）需排查新增代码是否充分测试
- A12 schema 变更需确认变更是否符合预期
