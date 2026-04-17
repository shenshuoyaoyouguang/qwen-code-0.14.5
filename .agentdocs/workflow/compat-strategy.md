# Qwen Code 分层规范系统兼容策略

> 创建时间：2026-04-17
> 背景：Phase 2 引入 `.qwen/spec/**/*.md` 分层规范系统，需要与现有旧规范入口向后兼容
> 依据：
>
> - A1 目录契约：`.agentdocs/workflow/spec-contract.md`
> - 现有规范发现机制：`packages/core/src/utils/memoryDiscovery.ts`
> - 现有记忆工具：`packages/core/src/tools/memoryTool.ts`
> - 上下文聚合器：`packages/cli/src/acp-integration/session/trellis-context.ts`
> - 系统提示生成：`packages/core/src/core/prompts.ts`
> - 路径常量：`packages/core/src/utils/paths.ts`

---

## 一、现有规范入口清单

### 1.1 入口总表

| 入口路径                                   | 职责                                   | 负责模块                                  | 是否纳入 spec tree |
| ------------------------------------------ | -------------------------------------- | ----------------------------------------- | ------------------ |
| `QWEN.md` / `AGENTS.md`（项目级）          | 项目顶层长期上下文、团队约束、运行方式 | `memoryDiscovery.ts`                      | **不纳入**         |
| `QWEN.md` / `AGENTS.md`（全局 ~`/.qwen/`） | 用户级跨项目记忆                       | `memoryDiscovery.ts`                      | **不纳入**         |
| `.qwen/system.md`                          | 自定义系统提示文本                     | `prompts.ts`（`QWEN_SYSTEM_MD` 环境变量） | **不纳入**         |
| `.qwen/agents/*.md`                        | Agent 定义文件                         | CLI Agent 加载器                          | **不纳入**         |
| `.qwen/commands/qc/*.md`                   | 命令/Skill 文件（`/commit` 等）        | CLI Skill 加载器                          | **不纳入**         |
| `.qwen/skills/**/*.md`                     | Skill 定义及参考文档                   | CLI Skill 加载器                          | **不纳入**         |
| `.qwen/rules.md`                           | **（尚不存在）**历史遗留单文件规范     | `specLoader.ts`（Phase 2 新建）           | **直接兼容**       |

### 1.2 `memoryDiscovery.ts` 职责详解

**功能**：从 CWD 向上扫描至项目根，找到所有 `QWEN.md` / `AGENTS.md` 并按层级合并。

关键行为：

- **扫描方向**：从 CWD 向上至项目根（含 home 目录）
- **配置化文件名**：`setGeminiMdFilename()` 支持自定义文件名数组（默认 `['QWEN.md', 'AGENTS.md']`）
- **全局路径**：`~/.qwen/QWEN.md`（`Storage.getGlobalQwenDir()`）
- **合并格式**：`--- Context from: relative/path.md ---\n[content]\n--- End of Context from: relative/path.md ---`
- **处理 import**：通过 `memoryImportProcessor.ts` 支持 `@import` 语法
- **输出**：`LoadServerHierarchicalMemoryResponse`（含 `memoryContent` 和 `fileCount`）

**在提示词中的位置**：由调用方（如 agent-core.ts）注入 `memoryContent`，拼接至系统提示词末尾。

### 1.3 `memoryTool.ts` 职责详解

**功能**：`save_memory` 工具，支持用户通过对话将信息持久化到 QWEN.md。

关键行为：

- **作用域**：`global`（`~/.qwen/QWEN.md`）或 `project`（`./QWEN.md`）
- **写入格式**：在 `## Qwen Added Memories` 节下追加 `- [fact]` 列表项
- **文件不存在时**：自动创建（含目录）
- **与 spec tree 关系**：仅操作 `QWEN.md`，不涉及 `.qwen/spec/` 目录

### 1.4 `prompts.ts` 职责详解

**功能**：生成系统提示词，组装 base prompt + user memory + append instruction。

关键行为：

- **系统提示文本**：默认内联在 `getCoreSystemPrompt()` 中
- **`.qwen/system.md`**：通过 `QWEN_SYSTEM_MD` 环境变量覆盖 base prompt（默认路径 `.qwen/system.md`）
- **user memory 注入**：调用方传入 `userMemory` 字符串，拼接到 base prompt 末尾
- **与 spec tree 关系**：`specLoader` 的输出应作为 `appendInstruction` 或独立字段注入

### 1.5 现有 `.qwen/` 子目录清单

当前 `.qwen/` 已存在以下子目录（均与 Phase 2 spec tree 无重叠）：

```
.qwen/
├── agents/          # Agent 定义（test-engineer.md 等）
├── commands/qc/     # /commit、/bugfix 等命令文件
└── skills/          # Skill 定义（含 SKILL.md、references/、scripts/）
```

**Phase 2 spec tree 位置**：

```
.qwen/
└── spec/            # Phase 2 新建，与现有子目录完全隔离
```

---

## 二、兼容策略定义

### 2.1 每个旧入口的兼容决策

#### 决策 1：`QWEN.md` / `AGENTS.md` — **保留，完全隔离**

- **策略**：继续由 `memoryDiscovery.ts` 独立管理，不并入 `specLoader` 扫描范围
- **理由**：A1 目录契约明确规定 `QWEN.md` 由 `memoryDiscovery.ts` 负责，不并入 spec tree
- **两者关系**：并行层（parallel layer），各自有独立的职责边界
  - `QWEN.md` = 项目顶层上下文（目标、约束、协作规则）
  - `.qwen/spec/**/*.md` = 结构性技术规范（代码风格、领域规则）
- **注入时机**：在 `specLoader` 输出之后，`trellis-context.ts` 聚合层负责拼接

#### 决策 2：`.qwen/rules.md` — **保留，specLoader 直接兼容**

- **策略**：`.qwen/rules.md` 是 Phase 1 向 Phase 2 迁移的过渡兼容入口
- **specLoader 处理方式**：
  1. 首先检查 `.qwen/rules.md` 是否存在
  2. 存在则读取并标记来源为 `--- Spec: .qwen/rules.md ---`
  3. 再继续扫描 `.qwen/spec/**/*.md`
  4. 最终拼接顺序：`rules.md` → `spec/guides/**` → `spec/<domain>/**` → `spec/packages/**`
- **不覆盖原则**：`rules.md` 的内容不自动覆盖 `spec/` 下更具体的文件
- **未来路径**：随着 spec tree 完善，建议逐步将 `rules.md` 内容拆分迁移到 `spec/` 下的对应领域文件，`rules.md` 最终降级为空文件或注释说明迁移状态

#### 决策 3：`.qwen/system.md` — **识别，不处理**

- **策略**：`specLoader` 扫描时应跳过 `.qwen/system.md`，不在 spec tree 中加载
- **理由**：`system.md` 由 `prompts.ts` 独立处理（`QWEN_SYSTEM_MD`），与 spec 系统职责重叠但机制独立
- **实现要求**：`specLoader` 扫描时必须显式排除文件名 `system.md` 或路径为 `system.md` 的文件

#### 决策 4：`.qwen/agents/`、`.qwen/commands/`、`.qwen/skills/` — **扫描时显式排除**

- **策略**：这三个子目录完全不受 specLoader 影响
- **实现要求**：
  1. `specLoader` 扫描起点为 `.qwen/`
  2. 扫描时必须排除 `agents/`、`commands/`、`skills/` 目录及其所有子目录
  3. 也可以更简单地限定只扫描 `.qwen/spec/` 和 `.qwen/rules.md`
- **理由**：这三个目录是 CLI 功能模块（Agent/Skill/Command），其 `.md` 文件是功能定义而非规范，与技术规范（spec）是不同维度的产物

### 2.2 优先级规则

#### 加载顺序（Phase 2 specLoader 内部）

```
[1] .qwen/rules.md                          （兼容旧入口，如有）
[2] .qwen/spec/guides/index.md              （全局思维引导层）
[3] .qwen/spec/guides/*.md（不含 index.md） （全局思维引导文件）
[4] .qwen/spec/<domain>/index.md            （项目级领域入口）
[5] .qwen/spec/<domain>/*.md               （项目级领域正文）
[6] .qwen/spec/packages/<pkg>/index.md      （包级入口）
[7] .qwen/spec/packages/<pkg>/**/*.md        （包级正文）
```

#### 同目录内顺序

1. `index.md` 优先于其他文件
2. 其他文件按文件名升序（Unicode 排序）排列

#### 注入顺序（会话级别，从 trellis-context 聚合）

```
[1] memoryDiscovery.ts 输出    （QWEN.md/AGENTS.md 层级合并内容）
[2] specLoader.ts 输出         （rules.md + spec/**/*.md）
[3] trellis-context.ts 输出    （Git/Tasks/Journal 等会话状态）
[4] 提示词 appendInstruction   （用户自定义追加指令）
```

**设计原则**：从"稳定持久"到"动态临时"，符合上下文新鲜度递增规律。

### 2.3 冲突仲裁规则

#### 规则 1：包级 > 项目级 > guides

当 `spec/packages/<pkg>/backend/index.md` 和 `spec/backend/index.md` 存在相同主题的规则时：

- **默认**：两者都保留、拼接，由 AI 自己判断适用场景
- **显式声明覆盖**：文件内用注释 `# OVERRIDES: spec/backend/xxx.md` 声明覆盖意图
- **specLoader 行为**：不做自动仲裁，仅按顺序拼接，提供完整上下文

#### 规则 2：rules.md 不覆盖 spec/ 具体规则

当 `rules.md` 和 `spec/backend/directory-structure.md` 存在冲突时：

- **默认**：`spec/` 下更具体的文件优先（因为经过领域化拆分，意图更清晰）
- **实现方式**：在 `rules.md` 文件头部加注释说明迁移状态，如 `# 此文件已迁移至 .qwen/spec/ 相关目录，此文件仅供参考`

#### 规则 3：同一文件内的重复内容

当 `memoryDiscovery.ts` 输出的多层 `QWEN.md` 存在冲突时：

- **当前行为**（保持不变）：各层内容依次拼接，靠上（更浅层）的在上
- **AI 处理**：由模型自行判断适用层级
- **不自动去重**：因为不同层可能有不同的意图（如 global 层是用户偏好，project 层是项目约束）

---

## 三、specLoader 兼容性设计

### 3.1 扫描范围白名单

```text
# specLoader 扫描路径白名单
允许：
  - .qwen/rules.md                                    （单文件）
  - .qwen/spec/**/*.md                                （目录树）

排除（显式不扫描）：
  - .qwen/system.md                                   （prompts.ts 专用）
  - .qwen/agents/**                                  （Agent 定义）
  - .qwen/commands/**                                （Command 定义）
  - .qwen/skills/**                                  （Skill 定义）
```

**实现建议**：扫描函数签名中明确传入扫描范围，而不依赖黑名单追加：

```typescript
async function loadSpecs(root: string): Promise<SpecOutput> {
  // 1. 读取 .qwen/rules.md（如果存在）
  // 2. 扫描 .qwen/spec/ 目录树
  // 3. 不接触 agents/、commands/、skills/、system.md
}
```

### 3.2 `.qwen/rules.md` 处理流程

```
1. 检查 .qwen/rules.md 是否存在
   ├─ 不存在 → 跳过，继续步骤 2
   └─ 存在 → 读取，标记来源为 ".qwen/rules.md"
2. 扫描 .qwen/spec/ 目录树
3. 按加载顺序拼接所有内容
4. 返回 { content: string, sources: string[] }
```

**注意**：`.qwen/rules.md` 是**可选**的。没有此文件时，specLoader 正常返回 spec tree 内容。

### 3.3 格式化输出规范

```text
--- Spec: .qwen/rules.md ---
[rules.md 原文]
--- End Spec: .qwen/rules.md ---

--- Spec: .qwen/spec/guides/index.md ---
[guides/index.md 原文]
--- End Spec: .qwen/spec/guides/index.md ---

--- Spec: .qwen/spec/backend/index.md ---
[backend/index.md 原文]
--- End Spec: .qwen/spec/backend/index.md ---
...
```

**好处**：

- 与 `memoryDiscovery.ts` 的 `"Context from:"` 风格相近，便于调试
- 每个文件独立标记来源，便于追踪和规范截断
- 不依赖 Markdown AST 解析
- 路径始终使用相对于 CWD 的相对路径

### 3.4 与 memoryDiscovery.ts 的对接点

```
trellis-context.ts（聚合器）
  ├─ memoryDiscovery.ts.loadServerHierarchicalMemory()
  │    → QWEN.md / AGENTS.md 内容（memoryContent）
  │
  ├─ specLoader.ts.loadSpecs()
  │    → rules.md + spec/**/*.md 内容（specContent）
  │
  └─ TrellisContextAggregator.buildContext()
       → Git/Tasks/Journal 状态（sessionContext）

→ 最终聚合成 additionalContext 或 systemPrompt 字段
```

**关键约束**：`specLoader` 不调用 `memoryDiscovery`，两者独立发现、分别输出，由上层聚合。

---

## 四、边界检查清单

### 4.1 可能引发冲突的场景

| 场景                  | 冲突描述                                                                       | 避免方式                                                                                     |
| --------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **文件名校对敏感**    | Windows 文件系统大小写不敏感，`rules.md` 和 `Rules.md` 在 Windows 上是同一文件 | specLoader 统一使用 `path.basename()` 获取文件名后转小写比较                                 |
| **路径重叠**          | `specLoader` 意外扫描到 `.qwen/commands/qc/rules.md`                           | 扫描函数必须显式限定白名单路径，不依赖目录不存在                                             |
| **system.md 混入**    | `QWEN_SYSTEM_MD` 设为 `.qwen/rules.md` 时覆盖 rules.md                         | specLoader 显式排除 `system.md` 文件名，不受环境变量影响                                     |
| **filename 配置冲突** | 用户通过 `setGeminiMdFilename()` 自定义了非标准文件名                          | specLoader 不依赖 memoryTool 的文件名配置，独立使用固定文件名数组 `['QWEN.md', 'AGENTS.md']` |
| **空 spec tree**      | 项目完全没有 `.qwen/spec/` 目录                                                | specLoader 应优雅处理：无文件时返回空 content 和空 sources，不报错                           |
| **权限错误**          | `.qwen/rules.md` 存在但无读权限                                                | 使用 `fs.access()` 先检查可读性，不可读则静默跳过                                            |
| **循环 import**       | `.qwen/spec/` 下文件使用 `@import` 形成循环依赖                                | 限制 `@import` 最多 3 层深度，或 specLoader 第一版不支持 import                              |
| **超长内容**          | 多个 spec 文件拼接后超过 token 上限                                            | specLoader 输出应包含 sources 列表，供上层按需截断；不做自动截断                             |

### 4.2 扫描边界测试用例（实现 specLoader 时必须验证）

| 用例                                     | 预期行为                                    |
| ---------------------------------------- | ------------------------------------------- |
| `.qwen/rules.md` 存在，`spec/` 不存在    | 仅返回 rules.md 内容                        |
| `.qwen/spec/` 存在，`rules.md` 不存在    | 正常返回 spec tree 内容                     |
| 两者都不存在                             | 返回空 content、空 sources                  |
| `.qwen/agents/test-engineer.md` 存在     | specLoader 不返回此文件                     |
| `.qwen/skills/e2e-testing/SKILL.md` 存在 | specLoader 不返回此文件                     |
| `.qwen/commands/qc/commit.md` 存在       | specLoader 不返回此文件                     |
| `.qwen/system.md` 存在                   | specLoader 不返回此文件                     |
| `~/.qwen/QWEN.md` 存在                   | specLoader 不扫描 home 目录（无歧义）       |
| `rules.md` 在 Windows 上为 `RULES.MD`    | specLoader 仍能找到（文件系统不区分大小写） |

---

## 五、结论与建议

### 5.1 兼容边界总结

**完全兼容（无需修改现有代码）**：

- `memoryDiscovery.ts` — QWEN.md/AGENTS.md 管理机制不变
- `memoryTool.ts` — save_memory 工具完全独立
- `prompts.ts` — system.md 覆盖机制独立
- `.qwen/agents/`、`.qwen/commands/`、`.qwen/skills/` — 功能模块不受影响

**需要新建（Phase 2 实现）**：

- `specLoader.ts` — 新建模块，扫描 `.qwen/rules.md` 和 `.qwen/spec/**/*.md`
- `trellis-context.ts` 更新 — 在聚合层对接 specLoader 输出

**关键约束**：

- `specLoader` 扫描范围严格限定为 `.qwen/rules.md` + `.qwen/spec/` 目录树
- 不得扫描 `.qwen/agents/`、`.qwen/commands/`、`.qwen/skills/`、`.qwen/system.md`
- `.qwen/rules.md` 是**可选**兼容入口，不存在时不报错
- `QWEN.md` 由 `memoryDiscovery.ts` 继续管理，**不**并入 specLoader 扫描范围

### 5.2 架构建议

```
旧规范入口                          新规范系统
┌─────────────────────────┐        ┌─────────────────────────┐
│ memoryDiscovery.ts       │        │ specLoader.ts            │
│  ├─ QWEN.md (全局/项目)  │        │  ├─ .qwen/rules.md      │
│  └─ AGENTS.md (全局/项目)│        │  └─ .qwen/spec/**/*.md   │
└─────────────────────────┘        └─────────────────────────┘
              │                                │
              └────────────┬────────────────────┘
                           ▼
              ┌─────────────────────────┐
              │  trellis-context.ts      │
              │  （聚合层，会话级注入）  │
              └─────────────────────────┘
```

**注入层次清晰**：

1. `memoryDiscovery` 输出：稳定、跨会话的长期上下文
2. `specLoader` 输出：结构化的技术规范体系
3. `trellis-context` 输出：当前会话的动态状态（Git/Tasks/Journal）

### 5.3 未来迁移路径建议

当 `.qwen/spec/` 目录树成熟后：

1. **降级 rules.md**：在 `rules.md` 头部添加迁移说明注释，不再作为主入口
2. **统一格式化**：将 `QWEN.md` 中的技术规范内容逐步迁移到 `spec/` 对应目录
3. **废弃判断**：当 `QWEN.md` 中不再包含技术规范（仅保留项目目标/协作规则），视为迁移完成
4. **保留 QWEN.md**：`QWEN.md` 始终保留，因为 `memoryDiscovery.ts` 依赖它，且它有独特的"跨会话记忆"语义（`save_memory` 工具追加至此文件）

### 5.4 第一版 specLoader 最小实现范围

```typescript
// 最小可用版本（Phase 2 第一版）应支持：

interface SpecLoaderResult {
  content: string; // 拼接后的规范文本
  sources: string[]; // 所有命中的文件路径（相对路径）
  fileCount: number; // 文件总数
}

// 功能：
// 1. 读取 .qwen/rules.md（如存在）
// 2. 递归扫描 .qwen/spec/ 下所有 .md 文件
// 3. 按加载顺序拼接（rules.md → guides → domain → packages）
// 4. 每段内容用 "--- Spec: path ---" 标记来源

// 不做（留待后续版本）：
// - @import 语法处理
// - frontmatter 元数据解析
// - 基于任务上下文的文件筛选（第一版全量加载）
// - 基于 token 上限的自动截断
```
