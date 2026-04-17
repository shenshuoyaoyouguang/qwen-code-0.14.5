# `/init --spec` 任务设计（重启版）

> 更新时间：2026-04-17  
> 目标：在现有 `/init`（生成 `QWEN.md`）能力上，新增 `--spec` 初始化流程，可靠落盘 `.qwen/spec/` 目录与模板文件，并保证交互/非交互兼容。

---

## 1. 输入依据与现状结论

本设计已基于以下文件重新校对：

- `D:\xiaoxiao\2026.4.16\qwen-code-0.14.5\packages\cli\src\ui\commands\initCommand.ts`
- `D:\xiaoxiao\2026.4.16\qwen-code-0.14.5\packages\cli\src\ui\commands\initCommand.test.ts`
- `D:\xiaoxiao\2026.4.16\qwen-code-0.14.5\.agentdocs\workflow\spec-contract.md`
- `D:\xiaoxiao\2026.4.16\qwen-code-0.14.5\.agentdocs\workflow\compat-strategy.md`
- `D:\xiaoxiao\2026.4.16\qwen-code-0.14.5\.agentdocs\workflow\specloader-design.md`

### 1.1 现有 `/init` 行为（来自 `initCommand.ts`）

1. `/init` 当前仅负责初始化 `QWEN.md`（文件名由 `getCurrentGeminiMdFilename()` 决定）。
2. 若目标文件已存在且非空，会返回 `confirm_action` 请求覆盖确认。
3. 确认后先写空文件，再 `submit_prompt` 交给模型填充内容。
4. 该逻辑已在 `initCommand.test.ts` 有稳定覆盖（存在/空文件/覆盖确认/无配置报错）。

### 1.2 对 `--spec` 设计的硬约束

1. 必须不破坏 `/init` 无参数现有语义与测试。
2. 非交互环境不能依赖 `confirm_action`（需 fail-fast 或 `--force`）。
3. `.qwen/spec` 的结构需符合 `spec-contract.md` 三层契约（guides/domain/packages）。
4. 与 `compat-strategy.md` 一致：保留 `.qwen/rules.md` 兼容思路，不侵入 `.qwen/agents|commands|skills`。
5. 与 `specloader-design.md` 一致：初始化产物应可直接被后续 `specLoader` 发现与排序。

---

## 2. 命令语法与参数设计（交互/非交互）

## 2.1 命令语法

```bash
/init [--spec] [--profile minimal|full] [--force] [--dry-run]
```

## 2.2 参数定义

- `--spec`
  - 启用规范脚手架初始化流程（目标 `.qwen/spec`）。
  - 与默认 `QWEN.md` 生成流程互斥，避免一次命令做两种重操作。

- `--profile minimal|full`
  - 仅在 `--spec` 出现时生效。
  - `minimal`：最小可用模板（MVP 默认）。
  - `full`：完整模板骨架（含 frontend/testing/packages）。

- `--force`
  - 冲突文件直接覆盖，不走确认。

- `--dry-run`
  - 只输出 create/overwrite/unchanged 计划，不写盘。

## 2.3 参数校验规则

1. 未知参数：报错并提示示例。
2. 未携带 `--spec` 但传了 `--profile`：报错。
3. `--profile` 非 `minimal|full`：报错。
4. `/init` 无参数：走现有逻辑，不进入 `--spec` 分支。

## 2.4 交互模式策略

- 若检测到冲突文件且未加 `--force`：返回一次性 `confirm_action`。
- 用户确认后继续写入。
- 若无冲突：直接执行。

## 2.5 非交互模式策略

- 有冲突 + 无 `--force`：直接 `message(error)` 失败并提示“补 `--force` 或先清理文件”。
- 有冲突 + `--force`：允许覆盖。
- 全程不得返回 `confirm_action`。

---

## 3. 初始化目录与模板文件清单

## 3.1 目录创建顺序（幂等）

固定顺序创建，便于日志与测试断言：

1. `.qwen/`
2. `.qwen/spec/`
3. `.qwen/spec/guides/`
4. `.qwen/spec/backend/`
5. `full` 时增加：`.qwen/spec/frontend/`
6. `full` 时增加：`.qwen/spec/testing/`
7. `full` 时增加：`.qwen/spec/packages/`

> 目录存在时跳过，不视为错误。

## 3.2 `minimal` 模板（默认）

```text
.qwen/spec/guides/index.md
.qwen/spec/guides/code-reuse-thinking-guide.md
.qwen/spec/backend/index.md
.qwen/spec/backend/directory-structure.md
.qwen/spec/backend/quality-guidelines.md
```

设计意图：

- 保证“通用指南 + backend 最小治理闭环”。
- 文件数量可控，适合首次落地与低冲突迁移。

## 3.3 `full` 模板

```text
.qwen/spec/guides/index.md
.qwen/spec/guides/code-reuse-thinking-guide.md
.qwen/spec/guides/cross-platform-thinking-guide.md

.qwen/spec/backend/index.md
.qwen/spec/backend/directory-structure.md
.qwen/spec/backend/script-conventions.md
.qwen/spec/backend/error-handling.md
.qwen/spec/backend/quality-guidelines.md
.qwen/spec/backend/logging-guidelines.md

.qwen/spec/frontend/index.md
.qwen/spec/frontend/component-guidelines.md
.qwen/spec/frontend/state-management.md
.qwen/spec/frontend/type-safety.md

.qwen/spec/testing/index.md
.qwen/spec/testing/conventions.md
.qwen/spec/testing/integration-patterns.md

.qwen/spec/packages/index.md
```

说明：

- `packages/<package-name>/` 子目录不在初始化阶段强制生成，避免误判 monorepo 包名；由后续任务按真实包名补齐。

---

## 4. 覆盖确认与冲突处理策略

## 4.1 冲突定义

目标文件已存在且非空，并且内容与目标模板不同，记为 `would-overwrite`。

## 4.2 计划阶段与执行阶段

采用两阶段，降低半成品概率：

1. **Plan 阶段**：扫描所有目标文件，输出
   - `toCreate`
   - `toOverwrite`
   - `unchanged`
2. **Apply 阶段**：仅对计划中的 create/overwrite 执行写盘。

## 4.3 冲突处理矩阵

- 冲突 + `--force`：覆盖。
- 冲突 + interactive + 无 `--force`：确认后覆盖。
- 冲突 + non-interactive + 无 `--force`：失败退出。
- 内容一致：记 `unchanged`，不写盘。

## 4.4 输出约定

- `--dry-run`：输出计划，不写盘。
- 成功：输出三类计数 + 目标目录。
- 失败：输出冲突文件（前 N 个）和下一步建议。

---

## 5. 与现有 `/init` 的集成方式

## 5.1 集成原则

- **保持单命令入口**：继续使用 `initCommand`，按参数分支处理。
- **默认路径不变**：无参数仍为 `QWEN.md` 流程。
- **行为隔离**：`--spec` 逻辑模块化，避免污染原逻辑可读性。

## 5.2 推荐代码拆分

1. `packages/cli/src/ui/commands/initCommand.ts`
   - 仅负责参数解析、模式判断、返回类型路由。

2. `packages/cli/src/ui/commands/initSpecScaffold.ts`
   - 负责 plan/apply、冲突策略、结果汇总。

3. `packages/cli/src/ui/commands/initSpecTemplates.ts`
   - 负责模板注册表（minimal/full）与内容生成。

## 5.3 关键集成点

- 返回类型与现有命令保持一致（`message | confirm_action | submit_prompt`）。
- `--spec` 分支不调用模型生成，全部本地写盘，确保“文档完整落盘”可验证。
- 提示文案建议接入 i18n（后续可补齐）。

---

## 6. 测试策略与风险评估

## 6.1 单元测试（扩展 `initCommand.test.ts`）

至少新增以下场景：

1. `/init --spec` 默认 `minimal` 成功创建。
2. `/init --spec --profile full` 创建完整模板。
3. 冲突 + interactive + 无 `--force` 返回 `confirm_action`。
4. 冲突 + `--force` 直接覆盖。
5. `/init --spec --dry-run` 不写盘。
6. `/init --profile full`（缺少 `--spec`）报错。
7. `/init --spec --profile unknown` 报错。

## 6.2 非交互测试建议

在非交互命令测试中补齐：

1. `/init --spec` 无冲突：成功。
2. `/init --spec` 有冲突无 `--force`：`message(error)`，不得出现 `confirm_action`。
3. `/init --spec --force` 有冲突：成功。

## 6.3 风险清单与缓解

1. **误覆盖手写规范**
   - 缓解：默认 `minimal` + 冲突确认 + `--dry-run`。

2. **交互/非交互行为不一致**
   - 缓解：明确非交互禁用 confirm，统一 fail-fast 约定。

3. **模板与目录契约漂移**
   - 缓解：模板清单集中管理，并在测试中断言关键路径存在。

4. **初始化体量过大导致噪声**
   - 缓解：MVP 默认 `minimal`，`full` 由用户显式选择。

---

## 7. 实施步骤、MVP 与非目标

## 7.1 实施步骤

1. 在 `initCommand.ts` 加入参数解析与 `--spec` 分支路由。
2. 实现 `initSpecTemplates.ts`（minimal/full 注册表）。
3. 实现 `initSpecScaffold.ts`（plan/apply/冲突矩阵/结果输出）。
4. 扩展 `initCommand.test.ts` 与非交互测试矩阵。
5. 收口提示文案与帮助文本（含错误提示一致化）。

## 7.2 MVP 范围

- 支持 `/init --spec [--profile minimal|full] [--force] [--dry-run]`。
- 仅本地生成 `.qwen/spec` 模板，不进行智能内容填充。
- 不改变 `/init` 既有 `QWEN.md` 生成行为。
- 非交互冲突必须 fail-fast（除 `--force`）。

## 7.3 非目标

- 不新增独立命令（如 `/init-spec`）。
- 不做远程模板拉取/版本迁移机制。
- 不做基于 git 的三方自动合并。
- 不自动生成 `.qwen/rules.md` 或改写现有规则文件。

---

## 8. 关键设计决策（最终版）

1. **`/init` 单入口分支扩展**，不新增命令，保证用户心智稳定。
2. **`minimal` 默认**，降低首次启用风险和冲突成本。
3. **冲突策略统一为 plan→confirm/force→apply**，并对非交互场景明确 fail-fast。
4. **模板与执行逻辑解耦**（templates/scaffold 分离），便于后续迭代和测试。
5. **与 spec-contract/compat/specloader 保持同构**，确保初始化结果可直接服务后续加载器实现。
