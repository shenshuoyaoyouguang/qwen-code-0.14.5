# Trellis 移植 Phase 2 详细执行计划

> 创建时间：2026-04-17
> 状态：规划中
> 范围：分层规范系统、规范加载器、SessionStart 注入、规范初始化模板命令
> 依赖前置：第一阶段任务管理 / 会话记录 / 上下文聚合器已完成

---

## 一、Phase 2 目标概述

第二阶段目标是在 Qwen Code 中引入 Trellis 风格的"分层规范系统"，使项目级规范不再局限于单文件上下文，而是能按域、按模块、按包进行组织，并在会话启动时自动注入与当前任务相关的规范和上下文。

本阶段优先采用"扩展现有架构"的实现策略：复用 Qwen 现有的 Hook 协议、hierarchical memory 发现机制、`/init` 命令入口以及第一阶段已完成的任务与会话日志能力，避免引入第二套并行上下文系统。

---

## 二、需求与约束

### 2.1 核心需求

- 支持 `.qwen/spec/**/*.md` 形式的分层规范目录
- 向后兼容现有单文件规范入口（如未来存在 `.qwen/rules.md`）
- 新增规范加载器，按目录结构和任务上下文加载规范文本
- 在 SessionStart 阶段自动注入任务上下文与相关规范
- 提供规范模板初始化入口，支持快速创建 `.qwen/spec/` 基础结构
- 第二阶段改动应独立可测、可逐步上线，不阻塞现有会话流程

### 2.2 非目标

- 不在本阶段实现 Git Worktree 并行能力
- 不在本阶段实现远程模板注册表
- 不在本阶段重写 Qwen 现有 memoryDiscovery 机制
- 不在本阶段引入新的外部依赖或新的测试框架

### 2.3 已确认约束

- Hook 输出需遵循现有 `SessionStartOutput` 协议
- `additionalContext` 会被现有 `hookAggregator.ts` 拼接
- 第一阶段的 `SessionJournalService` 可提供活跃任务日志上下文，但不是规范加载器本身
- 当前仓库内 `.qwen/` 已存在 agents/commands/skills 结构，但不存在现成 `spec/` 目录

---

## 三、源实现研究结论

### 3.1 Trellis 分层规范模板结构

参考源：

- `D:\xiaoxiao\2026.4.16\Trellis-main\packages\cli\src\templates\markdown\spec\`
- `D:\xiaoxiao\2026.4.16\Trellis-main\.trellis\spec\`

结构模式：

- `spec/backend/index.md`
- `spec/backend/directory-structure.md`
- `spec/backend/script-conventions.md`
- `spec/guides/code-reuse-thinking-guide.md`
- `spec/guides/cross-platform-thinking-guide.md`

特征：

- 每个子域目录通常有 `index.md`，作为入口和目录
- 子域下按主题拆分多个 markdown 文件
- 适合在 monorepo 或多模块场景下按域扩展

### 3.2 Trellis SessionStart 钩子模式

参考源：

- `D:\xiaoxiao\2026.4.16\Trellis-main\packages\cli\src\templates\qwen\hooks\session-start.py`

关键行为：

- 非交互模式跳过注入
- 若未检测到 `.trellis` 则静默退出
- 注入内容包含：
  - Developer Identity
  - Git Context
  - Current Task
  - Active Tasks
  - Quick Reference
- 通过 `hookSpecificOutput.additionalContext` 注入系统提示

### 3.3 Qwen 现有可复用基础设施

参考源：

- `packages/core/src/hooks/types.ts` - 已定义 `SessionStartOutput.additionalContext`
- `packages/core/src/hooks/hookAggregator.ts` - 已支持多个 Hook 的 `additionalContext` 拼接
- `packages/core/src/utils/memoryDiscovery.ts` - 已支持层级化 `QWEN.md` / `AGENTS.md` 发现与拼装
- `packages/cli/src/ui/commands/initCommand.ts` - 已有 `/init` 生成 `QWEN.md` 的入口
- `packages/core/src/services/sessionJournalService.ts` - 第一阶段已完成

---

## 四、架构调整方案

### 新增/修改文件总览

#### Core 层

- 新增：`packages/core/src/services/specLoader.ts`
- 新增：`packages/core/src/services/specLoader.test.ts`
- 可能修改：`packages/core/src/config/config.ts`
- 可能修改：`packages/core/src/hooks/hookEventHandler.test.ts`
- 可能修改：`packages/core/src/hooks/hookAggregator.test.ts`

#### CLI 层

- 修改：`packages/cli/src/ui/commands/initCommand.ts`
- 修改：`packages/cli/src/ui/commands/initCommand.test.ts`
- 可能新增：`packages/cli/src/templates/qwen/spec/...`（规范模板）
- 可能新增：`packages/cli/src/templates/qwen/hooks/session-start.py`（SessionStart 钩子模板）

---

## 五、Phase 2 详细任务分解

### Phase 2-A：规范系统设计收敛

#### A1. 明确规范目录契约

- 输入：Trellis spec 模板目录（`packages/cli/src/templates/markdown/spec/`）、`.trellis/spec/**`
- 输出：`trellis-porting-phase2.md` 更新
- 动作：确定 `.qwen/spec/` 的目录命名规范、`index.md` 语义、文件加载顺序、是否支持包级子目录
- 产出要求：形成统一规范契约
- 依赖：无
- 风险：低

#### A2. 明确与旧规范入口的兼容策略

- 输入：`memoryDiscovery.ts`、`memoryTool.ts`
- 输出：`trellis-porting-phase2.md` 更新
- 动作：定义 `.qwen/rules.md`、`QWEN.md`、`.qwen/spec/**/*.md` 三者职责边界
- 建议策略：
  - `QWEN.md` 继续承担项目顶层持久上下文
  - `.qwen/spec/**/*.md` 承担可分层、可组合的项目规范
  - 如存在 `.qwen/rules.md`，由 `specLoader` 作为兼容输入源一并读取
- 依赖：A1
- 风险：中

---

### Phase 2-B：规范加载器设计与实现

#### B1. 新增 `specLoader.ts` 领域模型与接口定义

- 输入：`sessionJournalService.ts`、`memoryDiscovery.ts`
- 输出：`packages/core/src/services/specLoader.ts`
- 动作：设计核心接口
  - `loadAllSpecs(cwd)`
  - `loadRelevantSpecs(cwd, taskContext)`
  - `formatSpecsForPrompt(...)`
- 依赖：A1、A2
- 风险：中

#### B2. 定义规范发现与加载顺序

- 输入：Trellis spec 模板、现有 `.qwen/` 结构
- 输出：`packages/core/src/services/specLoader.ts`
- 动作：明确加载优先级
  1. `.qwen/rules.md`（若存在，兼容旧入口）
  2. `.qwen/spec/guides/index.md`
  3. `.qwen/spec/guides/*.md`
  4. 任务相关域目录 `index.md`
  5. 任务相关域目录其他 `.md`
- 依赖：B1
- 风险：中

#### B3. 设计任务相关规范匹配策略

- 输入：task 工具与任务字段定义
- 输出：`packages/core/src/services/specLoader.ts`
- 动作：基于任务字段建立匹配规则（`scope`、`dev_type`、`tags`）
- 依赖：B1
- 风险：中

#### B4. 为 `specLoader` 补充测试

- 输入：`specLoader.ts`
- 输出：`packages/core/src/services/specLoader.test.ts`
- 动作：覆盖以下测试面
  - 无 `.qwen/spec` 时返回空内容
  - 仅有 `.qwen/rules.md` 时兼容加载
  - 目录中 `index.md` 优先
  - 多文件稳定排序
  - 根据任务 `scope/tags` 命中局部规范
- 依赖：B1、B2、B3
- 风险：低

---

### Phase 2-C：SessionStart 注入集成

#### C1. 设计 SessionStart 注入内容结构

- 输入：Trellis session-start.py、Qwen hooks types、journal service
- 输出：设计说明写入本计划文档
- 动作：规划注入块顺序
  1. 当前任务摘要
  2. 任务状态与优先级
  3. 最近 journal 摘要
  4. 命中规范清单
  5. 规范正文
- 依赖：B3
- 风险：低

#### C2. 确定 Hook 侧与 Core 侧的职责边界

- 输入：`hookEventHandler.ts`、`hookAggregator.ts`
- 输出：设计说明写入本计划文档
- 推荐：短期采用"模板 Hook 脚本注入"，中期再评估 Core 内建注入
- 依赖：C1
- 风险：中

#### C3. 定义会话上下文脚本与服务接口

- 输入：`sessionJournalService.ts`、`trellis-context.ts`
- 输出：待实现文件清单与接口说明
- 动作：规划 Hook 需要依赖的上下文来源
- 依赖：B4、C2
- 风险：中

#### C4. SessionStart 集成测试设计

- 输入：Hook 测试文件
- 输出：Hook 测试用例
- 动作：增加测试场景
  - SessionStart 返回 `additionalContext`
  - 多来源 additionalContext 正常拼接
  - 无 spec 时不报错
- 依赖：C2、C3
- 风险：低

---

### Phase 2-D：规范模板初始化命令

#### D1. 扩展 `/init` 的能力边界

- 输入：`initCommand.ts`、`initCommand.test.ts`
- 输出：扩展后的 `initCommand.ts`
- 动作：设计 `/init --spec` 的行为
- 依赖：A1、A2
- 风险：中

#### D2. 落定模板文件来源与目录布局

- 输入：Trellis markdown spec 模板
- 输出：`packages/cli/src/templates/qwen/spec/**`
- 建议最小模板集：
  - `.qwen/spec/guides/index.md`
  - `.qwen/spec/guides/code-reuse-thinking-guide.md`
  - `.qwen/spec/backend/index.md`
  - `.qwen/spec/backend/directory-structure.md`
  - `.qwen/spec/backend/quality-guidelines.md`
- 依赖：D1
- 风险：低

#### D3. 定义初始化命令的覆盖行为

- 输入：`initCommand.ts`
- 输出：扩展后的 `initCommand.ts`
- 动作：规划覆盖规则
  - 目标目录不存在则创建
  - 已存在非空文件时请求确认
  - 只覆盖模板管理范围内的文件
- 依赖：D2
- 风险：中

#### D4. 初始化命令测试补齐

- 输入：`initCommand.test.ts`
- 输出：扩展后的 `initCommand.test.ts`
- 动作：增加测试场景
- 依赖：D3
- 风险：低

---

### Phase 2-E：验收前收尾与回归

#### E1. 任务工具第一阶段遗漏测试补齐

- 输入：四个 task 工具文件
- 输出：
  - `packages/core/src/tools/task-create.test.ts`
  - `packages/core/src/tools/task-start.test.ts`
  - `packages/core/src/tools/task-finish.test.ts`
  - `packages/core/src/tools/task-list.test.ts`
- 动作：先补齐 Phase 1 遗漏，降低后续上下文集成回归风险
- 依赖：无
- 风险：低

#### E2. 建立本地 CI 验证清单

- 输入：`.github/workflows/ci.yml`
- 输出：文档化本地 CI 流程
- 动作：形成本地执行顺序
  1. `npm run lint`
  2. `npm run build`
  3. `npm run test:ci`
- 依赖：E1
- 风险：低

#### E3. Phase 2 联调回归清单

- 输入：全部相关实现与测试文件
- 输出：测试清单文档
- 动作：核对以下回归面
  - 不启用 spec 时行为不变
  - 仅 `QWEN.md` 时行为不变
  - SessionStart 注入正常
  - task/journal 上下文可读取
  - `/init` 不破坏旧逻辑
- 依赖：B4、C4、D4
- 风险：中

---

## 六、每个子任务的输入/输出文件汇总

| 子任务 | 输入文件                                                    | 输出文件                                        |
| ------ | ----------------------------------------------------------- | ----------------------------------------------- |
| A1     | Trellis spec 模板目录与 `.trellis/spec/**`                  | `trellis-porting-phase2.md`                     |
| A2     | `memoryDiscovery.ts`, `memoryTool.ts`                       | `trellis-porting-phase2.md`                     |
| B1     | `sessionJournalService.ts`, `memoryDiscovery.ts`            | `packages/core/src/services/specLoader.ts`      |
| B2     | Trellis spec 模板、现有 `.qwen/` 结构                       | `packages/core/src/services/specLoader.ts`      |
| B3     | task 工具与任务字段定义                                     | `packages/core/src/services/specLoader.ts`      |
| B4     | `specLoader.ts`                                             | `packages/core/src/services/specLoader.test.ts` |
| C1     | Trellis session-start.py、Qwen hooks types、journal service | 设计说明 / 后续实现文件                         |
| C2     | `hookEventHandler.ts`, `hookAggregator.ts`                  | 设计说明 / 后续实现文件                         |
| C3     | `sessionJournalService.ts`, `trellis-context.ts`            | 扩展聚合器或新增上下文脚本                      |
| C4     | Hook 测试文件                                               | Hook 测试用例                                   |
| D1     | `initCommand.ts`, `initCommand.test.ts`                     | `initCommand.ts`                                |
| D2     | Trellis markdown spec 模板                                  | `packages/cli/src/templates/qwen/spec/**`       |
| D3     | `initCommand.ts`                                            | `initCommand.ts`                                |
| D4     | `initCommand.test.ts`                                       | `initCommand.test.ts`                           |
| E1     | 四个 task 工具文件                                          | 四个 `.test.ts`                                 |
| E2     | `.github/workflows/ci.yml`                                  | 文档化本地 CI 流程                              |
| E3     | 全部 Phase 2 相关文件                                       | 联调回归清单                                    |

---

## 七、任务间依赖关系

### 关键主链

```
A1 → A2 → B1 → B2 → B3 → B4
                        ↓
B4 → C1 → C2 → C3 → C4
                        ↓
A1 → D1 → D2 → D3 → D4
                        ↓
B4、C4、D4 → E3
```

### 说明

- `specLoader` 是 Phase 2 的核心前置，没有它就无法稳定做 SessionStart 规范注入
- `/init --spec` 可以与 SessionStart 集成并行推进，但模板目录契约必须先收敛
- 第一阶段遗漏测试应尽量前置完成，避免在第二阶段调试时混淆问题来源

---

## 八、可并行的任务组

### 并行组 P1：前置稳定化

- E1. 补齐四个 task 工具测试
- E2. 整理本地 CI 验证流程
- A1. 规范目录契约梳理

### 并行组 P2：核心能力建设

- A2. 兼容策略定义
- B1. `specLoader` 接口设计
- D1. `/init --spec` 命令设计

### 并行组 P3：实现与测试

- B2. 规范发现顺序
- B3. 任务匹配策略
- D2. 模板目录迁入与筛选

### 并行组 P4：集成联调

- B4. `specLoader` 测试
- C1. SessionStart 注入结构
- D4. init 命令测试扩展

### 必须串行的任务

- C2/C3 必须在 B4 之后
- E3 必须在 B4、C4、D4 之后

---

## 九、风险评估更新

| 风险                                  | 等级 | 缓解策略                                              |
| ------------------------------------- | ---- | ----------------------------------------------------- |
| 规范上下文膨胀导致 prompt 过长        | 高   | 第一版只加载 guides + 任务相关域；设计字数/文件数上限 |
| 旧入口兼容不清晰导致行为分裂          | 中   | 显式定义三者边界（QWEN.md / rules.md / spec/）        |
| SessionStart 注入链路过长，问题难定位 | 中   | 注入内容分块，输出中带来源标记；分别为各组件补充测试  |
| 初始化模板覆盖用户自定义规范          | 中   | 非空文件覆盖前必须确认；仅管理模板白名单文件          |
| 任务字段与规范目录映射不稳定          | 中   | 第一版只做简单、可解释映射；命中结果写入调试日志      |
| Trellis 模板路径与文档不一致          | 低   | 统一改用实际可读路径                                  |

---

## 十、测试策略

### 单元测试

- `packages/core/src/services/specLoader.test.ts`
- `packages/core/src/tools/task-create.test.ts`
- `packages/core/src/tools/task-start.test.ts`
- `packages/core/src/tools/task-finish.test.ts`
- `packages/core/src/tools/task-list.test.ts`
- `packages/cli/src/ui/commands/initCommand.test.ts`

### 集成测试

- Hook `SessionStart` 事件返回 `additionalContext`
- 多 hook 的 `additionalContext` 拼接行为
- task + journal + spec 联动时上下文可生成

### 手工/E2E 验证

- 初始化空项目后执行规范模板生成
- 创建任务并开始会话，验证任务上下文和 spec 注入
- 仅存在 `QWEN.md` 时，会话行为保持不变
- 无 `.qwen/spec` 时，系统不报错、不污染提示词

---

## 十一、审核标准

### 11.1 设计审核

- [ ] 明确 `.qwen/spec/` 的目录契约与加载顺序
- [ ] 明确 `QWEN.md` / `.qwen/rules.md` / `.qwen/spec/` 的职责边界
- [ ] 明确 SessionStart 注入由谁负责拼装

### 11.2 实现审核

- [ ] `specLoader.ts` 接口命名与返回结构可测试、可扩展
- [ ] 未重复实现已有 hierarchical memory / hook aggregation 能力
- [ ] 初始化模板逻辑不破坏现有 `/init`

### 11.3 测试审核

- [ ] 四个任务工具补齐单元测试
- [ ] `specLoader` 具备独立测试文件
- [ ] Hook 注入链路具备回归测试
- [ ] `init --spec` 具备覆盖确认相关测试

### 11.4 行为审核

- [ ] 无 `.qwen/spec` 时系统行为保持兼容
- [ ] 仅使用旧规范文件时系统行为保持兼容
- [ ] SessionStart 注入内容有明确来源标记
- [ ] 规范注入性能满足目标，不出现明显启动卡顿

### 11.5 合并门禁

- [ ] lint 通过
- [ ] build / typecheck 通过
- [ ] test:ci 通过
- [ ] 文档同步更新到 `.agentdocs/`

---

## 十二、推荐实施顺序

### 第一步：补稳基础

1. E1 补齐四个任务工具测试
2. E2 梳理本地 CI 命令
3. A1 明确 `.qwen/spec/` 契约与兼容策略

### 第二步：先做核心服务

4. B1 实现 `specLoader.ts`
5. B2 定义加载顺序
6. B3 设计匹配策略
7. B4 完成 `specLoader.test.ts`

### 第三步：再接入会话与模板

8. C1-C3 规划并接入 SessionStart 注入
9. D1-D3 扩展 `/init --spec`
10. D4 扩展 init 命令测试

### 第四步：最后做联调验收

11. E3 执行联调回归
12. 更新 `trellis-porting.md` 状态与审查结论
