# specLoader.ts 接口设计方案

> 创建时间：2026-04-17
> 阶段：Phase 2 核心设计
> 文件路径：`packages/core/src/services/specLoader.ts`
> 前置参考：A1 目录契约（`.agentdocs/workflow/spec-contract.md`）

---

## 一、类型定义草案（可直接使用的 TypeScript 代码）

```typescript
// packages/core/src/services/specLoader.ts
// ============================================================================
// 约束前提
// - 与 Phase 1 taskTypes.ts 完全兼容
// - 与 A1 目录契约（spec-contract.md）保持一致
// - 不依赖任何未稳定 Phase 2 的模块
// ============================================================================

import type { Task, TaskStatus, TaskPriority } from '../tools/taskTypes.js';

// ============================================================================
// 1. 任务上下文（外部传入的匹配条件）
// ============================================================================

/**
 * 任务上下文 — specLoader 的输入条件
 * 从 Task 类型中提取 spec 匹配相关的字段
 *
 * 与 Task 的区别：
 * - Task 是完整持久化结构，TaskContext 是运行时匹配视图
 * - TaskContext 允许缺失字段（undefined），表示"不以此字段筛选"
 */
export interface TaskContext {
  /** 任务 ID（仅用于日志和追踪，不参与匹配） */
  taskId?: string;

  /** 所属包名，命中 .qwen/spec/packages/<package>/** */
  package?: string;

  /** 开发类型，命中对应领域目录 */
  dev_type?: 'backend' | 'frontend' | 'fullstack' | 'test' | 'qa' | string;

  /** 任务标签，用于弱匹配 */
  tags?: string[];

  /** 任务名称（仅用于日志） */
  taskName?: string;

  /** 任务状态（仅用于日志，不参与匹配） */
  status?: TaskStatus;
}

// ============================================================================
// 2. spec 文件元数据（加载结果的基本单元）
// ============================================================================

/**
 * spec 文件元数据 — 描述一个被发现的规范文件
 * 注意：不包含文件内容，内容在 SpecBlock 中承载
 */
export interface SpecFileMeta {
  /** 文件绝对路径 */
  path: string;
  /** 相对于 .qwen/spec/ 的路径（用于分类和排序） */
  relativePath: string;
  /** 文件名（含扩展名） */
  basename: string;
  /** 文件所属层级 */
  layer: SpecLayer;
  /** 是否为目录入口文件 */
  isIndex: boolean;
  /** 所属包名（仅 layer === 'package' 时有效） */
  packageName?: string;
  /** 所属领域目录名（backend / frontend / testing 等） */
  domain?: string;
}

/**
 * spec 层级枚举
 * 对应 A1 契约中的三级结构：
 * - guides: 通用思维层（始终加载）
 * - domain: 项目级领域层（按 dev_type 命中）
 * - package: 包级层（按 package 命中）
 */
export type SpecLayer = 'guides' | 'domain' | 'package';

/**
 * spec 块 — 格式化后的规范内容单元
 * 对应 A1 契约中的输出格式：
 * --- Spec: <relative-path> ---
 * <content>
 * --- End Spec: <relative-path> ---
 */
export interface SpecBlock {
  /** 文件元数据 */
  meta: SpecFileMeta;
  /** 原始文本内容 */
  rawContent: string;
  /** 加载失败时记录原因（成功时为空字符串） */
  error?: string;
}

// ============================================================================
// 3. 加载结果
// ============================================================================

/**
 * 命中统计
 */
export interface SpecMatchStats {
  /** guides 层命中文件数 */
  guidesCount: number;
  /** domain 层命中文件数 */
  domainCount: number;
  /** package 层命中文件数 */
  packageCount: number;
  /** 总文件数 */
  totalCount: number;
  /** 实际加载失败的文件数 */
  failedCount: number;
}

/**
 * spec 加载结果 — specLoader 的核心返回值
 */
export interface SpecResult {
  /** 所有命中的规范块（按优先级排序） */
  blocks: SpecBlock[];

  /** 格式化后的 prompt 文本 */
  promptContent: string;

  /** 命中统计 */
  stats: SpecMatchStats;

  /** 是否存在 .qwen/spec/ 目录 */
  specDirExists: boolean;

  /** 任务上下文摘要（便于调试） */
  taskContext: TaskContext;
}

// ============================================================================
// 4. 配置与选项
// ============================================================================

/**
 * specLoader 行为配置
 */
export interface SpecLoaderOptions {
  /**
   * 是否加载 .qwen/rules.md（兼容旧入口）
   * 默认为 true
   */
  includeRulesLegacy?: boolean;

  /**
   * 最大输出 token 估算值
   * 超过时从末尾截断 blocks
   * 默认为 4000（约 16000 字符）
   */
  maxTokens?: number;

  /**
   * 是否启用 guides 层强制加载
   * 默认为 true（与 A1 契约 规则 D 一致）
   */
  forceGuides?: boolean;

  /**
   * 指定额外的 domain 命中目录（超出 dev_type 标准映射时使用）
   * 例如：['docs', 'infra']
   */
  extraDomains?: string[];

  /**
   * 是否在 promptContent 中包含来源标记
   * 默认为 true
   */
  includeSourceMarkers?: boolean;
}

/** 默认配置 */
export const DEFAULT_SPEC_LOADER_OPTIONS: Required<
  Omit<SpecLoaderOptions, 'extraDomains'>
> = {
  includeRulesLegacy: true,
  maxTokens: 4000,
  forceGuides: true,
  includeSourceMarkers: true,
};

// ============================================================================
// 5. 内部工作类型（不导出至 public API）
// ============================================================================

/**
 * 内部：扫描到的候选文件记录
 */
interface DiscoveredCandidate {
  meta: SpecFileMeta;
  priority: number; // 越低越先加载
}

/**
 * 内部：层级优先级常量
 */
const LAYER_PRIORITY: Record<SpecLayer, number> = {
  guides: 1, // 最先
  domain: 2, // 次之
  package: 3, // 最后（最具体）
};

/**
 * 内部：dev_type → domain 目录的标准映射
 */
const DEV_TYPE_TO_DOMAIN: Record<string, string> = {
  backend: 'backend',
  frontend: 'frontend',
  fullstack: 'backend', // fullstack 命中 backend + frontend，由调用侧处理
  test: 'testing',
  qa: 'testing',
  docs: 'docs',
  infra: 'infra',
};

// ============================================================================
// 6. 错误类型
// ============================================================================

/**
 * specLoader 可能抛出的错误类型
 */
export class SpecLoaderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'DIR_NOT_FOUND'
      | 'ACCESS_DENIED'
      | 'INVALID_CONTEXT'
      | 'UNKNOWN',
    cause?: unknown,
  ) {
    super(message);
    this.name = 'SpecLoaderError';
  }
}
```

---

## 二、接口设计

### 2.1 导出函数签名

````typescript
// ============================================================================
// 主入口：加载匹配当前任务的规范内容
// ============================================================================

/**
 * 加载与给定任务上下文匹配的所有规范文件，并格式化为 prompt 文本
 *
 * @param taskContext - 任务上下文（从 Task 提取的匹配条件）
 * @param projectRoot - 项目根目录（用于解析 .qwen 相对路径）
 * @param options     - 加载行为配置（可选，使用 DEFAULT_SPEC_LOADER_OPTIONS）
 * @returns 规范加载结果，包含格式化文本和命中统计
 *
 * 使用示例：
 * ```ts
 * const result = await loadSpecsForTask(
 *   { package: 'core', dev_type: 'backend', tags: ['api', 'service'] },
 *   workspaceRoot,
 * );
 * // result.promptContent 可直接注入 additionalContext
 * ```
 */
export async function loadSpecsForTask(
  taskContext: TaskContext,
  projectRoot: string,
  options?: SpecLoaderOptions,
): Promise<SpecResult>;
````

```typescript
// ============================================================================
// 工具函数：获取当前任务上下文（辅助 SessionStart Hook 使用）
// ============================================================================

/**
 * 从 Task 对象提取 specLoader 所需的 TaskContext
 * 这是一个纯转换函数，不涉及文件 IO
 *
 * @param task - Phase 1 TaskService 中的 Task 对象
 * @returns TaskContext
 */
export function extractTaskContext(task: Task): TaskContext;
```

```typescript
// ============================================================================
// 工具函数：仅发现文件（不读取内容，用于预览 / 校验）
// ============================================================================

/**
 * 发现所有符合规范的候选文件，但不读取内容
 * 用于调试、列表预览、或与其他系统协作
 *
 * @param projectRoot - 项目根目录
 * @param taskContext - 任务上下文（决定命中哪些目录）
 * @param options     - 配置
 * @returns 文件元数据列表（按优先级排序）
 */
export async function discoverSpecFiles(
  projectRoot: string,
  taskContext: TaskContext,
  options?: SpecLoaderOptions,
): Promise<SpecFileMeta[]>;
```

```typescript
// ============================================================================
// 工具函数：格式化单个文件为 prompt 块
// ============================================================================

/**
 * 将一个规范文件格式化为带来源标记的 prompt 块
 * 对应 A1 契约 4.5 节的输出格式
 *
 * @param block - 规范块
 * @returns 格式化字符串
 */
export function formatSpecBlock(block: SpecBlock): string;
```

```typescript
// ============================================================================
// 类：SpecLoader（用于需要共享状态或扩展的高级场景）
// ============================================================================

/**
 * SpecLoader — 可实例化的规范加载器
 *
 * 与顶层函数 loadSpecsForTask 的区别：
 * - 支持注入自定义的文件发现策略（便于测试 mock）
 * - 可持有内部缓存（避免重复扫描）
 * - 可扩展生命周期钩子
 */
export class SpecLoader {
  constructor(projectRoot: string, options?: SpecLoaderOptions);

  /** 加载匹配的规范文件 */
  load(taskContext: TaskContext): Promise<SpecResult>;

  /** 发现候选文件元数据（不读内容） */
  discover(taskContext: TaskContext): Promise<SpecFileMeta[]>;

  /** 获取当前加载配置 */
  getOptions(): Readonly<Required<SpecLoaderOptions>>;
}
```

### 2.2 参数类型定义总结

| 参数          | 类型                | 来源                | 说明                       |
| ------------- | ------------------- | ------------------- | -------------------------- |
| `taskContext` | `TaskContext`       | Phase 1 `Task` 提取 | 匹配条件，不含文件 IO 依赖 |
| `projectRoot` | `string`            | 调用方传入          | 用于路径解析，兼容 Windows |
| `options`     | `SpecLoaderOptions` | 可选                | 配置项，全部有默认值       |

---

## 三、内部模块设计

### 3.1 规范发现（文件扫描）

```
模块名：specDiscovery（内部函数，不导出）
职责：扫描 .qwen/spec/ 目录结构，收集候选文件
```

**扫描流程：**

1. 解析 `.qwen/spec/` 目录是否存在
   - 不存在 → 设置 `specDirExists: false`，返回空结果
2. **按层级扫描**（从广到窄）：
   - guides 层：`scanDirectory(specRoot, 'guides')`
   - domain 层：由 `DEV_TYPE_TO_DOMAIN` 映射 + `extraDomains` 确定目录集合
   - package 层：由 `taskContext.package` 确定 `.qwen/spec/packages/<pkg>/`
3. **同目录内部排序**：
   - `index.md` 排在最前
   - 其余文件按 `basename` 升序（kebab-case 字母顺序稳定）
4. **去重**：同一相对路径只保留一个（避免 index.md 被多次收集）

**Windows 兼容性**：

- 路径拼接统一使用 `path.join()`
- 目录名/文件名仅包含合法字符，不依赖大小写敏感排序

### 3.2 任务匹配（按 package / dev_type / tags）

```
模块名：specMatcher（内部函数，不导出）
职责：根据 TaskContext 筛选需要加载的规范目录
```

**匹配矩阵：**

| TaskContext 字段                | 命中规则                           | 命中结果                          |
| ------------------------------- | ---------------------------------- | --------------------------------- |
| `package: 'core'`               | `packages/core/` 存在              | `layer: 'package'`                |
| `dev_type: 'backend'`           | `spec/backend/` 存在               | `layer: 'domain'`                 |
| `dev_type: 'fullstack'`         | `spec/backend/` + `spec/frontend/` | `layer: 'domain'` × 2             |
| `tags: ['api', 'service']`      | tag 与一级目录名完全匹配           | 命中 `spec/api/`、`spec/service/` |
| `dev_type: 'test'` / `qa'`      | `spec/testing/`                    | `layer: 'domain'`                 |
| `package` + `dev_type` 同时存在 | 分别计算后合并去重                 | —                                 |

**tag 匹配限制**（A1 契约规则 C）：

- 第一版只匹配"tag 与顶级目录名完全相同"
- 不做模糊语义匹配，不做同义词扩展

### 3.3 加载排序（优先级规则）

**全局加载顺序（A1 契约 2.6 节）：**

```
优先级 1（最先）：.qwen/rules.md（若 includeRulesLegacy === true）
优先级 2：.qwen/spec/guides/index.md
优先级 3：.qwen/spec/guides/*.md（按 basename 升序，排除 index.md）
优先级 4：命中的 domain 目录 index.md
优先级 5：命中的 domain 目录其他 .md（按 basename 升序）
优先级 6：命中的 package 目录 index.md
优先级 7：命中的 package 子域目录 index.md
优先级 8：命中的 package 子域目录其他 .md
```

**优先级计算公式（内部）：**

```
filePriority = LAYER_PRIORITY[layer] * 10000
            + (isIndex ? 0 : 1000)   // index.md 优先
            + nameSortOrder           // basename 升序，0-indexed
```

### 3.4 格式化输出（拼接为 prompt 文本）

```
模块名：specFormatter（内部函数，不导出）
职责：将加载结果格式化为可直接注入 prompt 的文本
```

**输出格式（A1 契约 4.5 节）：**

```text
--- Spec: .qwen/rules.md ---
[文件正文]
--- End Spec: .qwen/rules.md ---

--- Spec: .qwen/spec/guides/index.md ---
[文件正文]
--- End Spec: .qwen/spec/guides/index.md ---

[...其他块...]
```

**截断策略（options.maxTokens）：**

1. 累积所有 `block.rawContent` 的字符数
2. 若超过 `maxTokens * 4`（按 1 token ≈ 4 字符估算），从末尾开始丢弃 block
3. 保留至少 `guides/index.md`（即使超出限制也强制保留前 3 个块）
4. 截断后的块在 `stats` 中标记

---

## 四、与现有系统的集成点

### 4.1 SessionStart Hook 调用链

```
SessionStart Hook
    │
    ├── 1. TaskService.listTasks()        // 读取当前任务
    ├── 2. extractTaskContext(task)       // 提取匹配条件
    │
    ├── 3. specLoader.loadSpecsForTask()   // 【Phase 2 新增】
    │       │
    │       ├── discoverSpecFiles()       // 发现候选
    │       ├── specMatcher()             // 任务匹配
    │       ├── specFormatter()           // 格式化
    │       └── → SpecResult.promptContent
    │
    ├── 4. memoryDiscovery.loadServerHierarchicalMemory()  // 现有：QWEN.md
    │
    └── 5. TrellisContextAggregator.buildAdditionalContext()  // 聚合
            ├── memoryContent: QWEN.md 文本
            ├── specContent:  specLoader 结果
            └── journalSummary: sessionJournalService 结果
```

**调用示例：**

```typescript
// 在 SessionStart Hook handler 中
import {
  loadSpecsForTask,
  extractTaskContext,
} from '../services/specLoader.js';
import { TaskService } from '../services/taskService.js';

const taskService = new TaskService(sessionId);
const tasks = await taskService.listTasks({ status: 'in_progress' });

if (tasks.length > 0) {
  const activeTask = tasks[0];
  const ctx = extractTaskContext(activeTask);
  const specResult = await loadSpecsForTask(ctx, projectRoot, {
    maxTokens: 4000,
    includeRulesLegacy: true,
  });
  // specResult.promptContent → additionalContext.spec
}
```

### 4.2 TrellisContextAggregator 协作接口

```typescript
// TrellisContextAggregator 的 expected input shape（Phase 2 扩展点）
// 规范内容作为独立字段传入

interface AggregatedContext {
  memory: string; // 来自 memoryDiscovery（QWEN.md）
  spec: string; // 来自 specLoader.promptContent
  journal: string; // 来自 sessionJournalService
  task: TaskContext; // 来自 TaskService
}
```

**协作约定：**

- `specLoader` 不持有 `TrellisContextAggregator` 引用（单向数据流）
- 规范内容以纯文本字符串形式返回，不携带格式假设
- `specLoader` 不解析 markdown AST，仅做文件级拼接

---

## 五、边界处理

### 5.1 无 `.qwen/spec/` 目录时的行为

```typescript
// loadSpecsForTask 内部
if (!specDirExists) {
  return {
    blocks: [],
    promptContent: '', // 空字符串
    stats: {
      guidesCount: 0,
      domainCount: 0,
      packageCount: 0,
      totalCount: 0,
      failedCount: 0,
    },
    specDirExists: false, // 明确标记
    taskContext,
  };
  // 不抛出错误，静默降级
}
```

### 5.2 只有 `.qwen/rules.md`（无 spec/ 目录）时的行为

- `specDirExists: true`（因为 rules.md 在 `.qwen/` 根下，与 `spec/` 独立）
- `guidesCount: 0, domainCount: 0, packageCount: 0`
- 仅 `stats.totalCount` 计入口径 1 的 `rules.md`
- 行为等同于"没有结构化规范，但有遗留规范"

### 5.3 规范文件过多时的截断策略

| 场景                            | 处理方式                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| 单文件过大（> `maxTokens * 2`） | 截断该文件内容，末尾加 `[...规范内容已截断]`                    |
| 总内容超过 `maxTokens` 估算     | 从末尾丢弃最低优先级的 block                                    |
| `guides/index.md` 被截断        | 强制保留至少前 3 个块（guides + 最高优先级的 domain + package） |
| 所有文件加载失败                | 返回空 `blocks`，`stats.failedCount === stats.totalCount`       |

---

## 六、测试策略建议

### 6.1 单元测试（specLoader.test.ts）

**测试场景矩阵：**

| 测试用例                | 输入                            | 预期结果                           |
| ----------------------- | ------------------------------- | ---------------------------------- |
| 无 spec 目录            | `specDirExists: false` 项目     | `blocks: []`, `promptContent: ''`  |
| 只有 rules.md           | 仅有 `.qwen/rules.md`           | 1 个 block，layer = `rules`        |
| guides 全命中           | 无匹配条件，`forceGuides: true` | 所有 guides/\*.md 被加载           |
| 按 dev_type 命中        | `dev_type: 'backend'`           | 命中 `spec/backend/**`             |
| 按 package 命中         | `package: 'core'`               | 命中 `spec/packages/core/**`       |
| dev_type + package 合并 | 两者同时存在                    | 去重合并，layer 优先级正确         |
| tags 命中额外目录       | `tags: ['docs']`                | 命中 `spec/docs/**`                |
| maxTokens 截断          | 大批量文件 + `maxTokens: 100`   | 末尾 block 被截断                  |
| 优先级排序              | 多层文件混排                    | guides → domain → package          |
| index.md 优先           | 目录内有 index.md + 其他文件    | index.md 在前                      |
| 文件读取失败            | 某个 .md 文件无权限             | 该 block 含 `error` 字段，但不停表 |

**测试工具：**

- 使用 `vitest`（项目已有 `vitest` 环境）
- 使用 `fs.mock` 或 `memfs` mock 文件系统
- 创建临时 `.qwen/spec/` 目录结构用于集成测试

### 6.2 集成测试建议

1. **真实文件系统测试**（在 CI 中使用临时目录）：
   - 模拟完整的 monorepo 目录结构
   - 验证 Windows 路径处理正确性

2. **与 TaskService 联调测试**：
   - 创建真实 Task，验证 `extractTaskContext` 正确提取字段
   - 验证 Task 缺少字段时（无 `package`、`dev_type`）仍能降级加载

3. **与 memoryDiscovery 对比测试**：
   - 验证 specLoader 不读取 `QWEN.md`（职责边界清晰）
   - 验证输出格式与 `memoryDiscovery.concatenateInstructions` 风格一致

### 6.3 回归测试

- 当 `spec-contract.md` 变更时，更新对应的测试用例
- 测试文件位置：`packages/core/src/services/specLoader.test.ts`

---

## 七、技术约束与设计决策记录

| 决策点                            | 选择                       | 理由                                          |
| --------------------------------- | -------------------------- | --------------------------------------------- |
| 不做 frontmatter 解析             | 仅文本拼接                 | A1 契约 4.4 明确要求；降低复杂度              |
| 不引入外部 markdown 库            | 原生字符串处理             | 避免额外依赖，与 memoryDiscovery 风格一致     |
| `includeRulesLegacy` 默认 true    | 兼容渐进迁移               | 现有项目可能已有 `.qwen/rules.md`             |
| 不做模糊语义匹配                  | 精确目录名匹配             | v1 稳定优先；tag 匹配限制在目录级             |
| `SpecLayer` 不含 `rules`          | rules 作为独立 legacy 入口 | 保持层级模型纯粹性                            |
| `SpecResult` 包含 `promptContent` | 避免调用方再做拼接         | 与现有 `concatenateInstructions` 结果形式一致 |
| Windows 兼容                      | `path.join` + 显式排序     | 项目有 Windows 用户（见 gitStatus）           |
