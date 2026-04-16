# Trellis 功能移植到 Qwen Code 工作流

> 创建时间：2026-04-17
> 状态：规划中
> 参考：Trellis 项目 `D:\xiaoxiao\2026.4.16\Trellis-main`

---

## 一、背景与目标

### 1.1 两项目定位对比

| 维度             | Qwen Code                       | Trellis                           |
| ---------------- | ------------------------------- | --------------------------------- |
| **角色**         | **执行层** — 代码生成、工具调用 | **编排层** — 工作流编排、状态管理 |
| **任务管理**     | 无原生任务概念                  | ✅ 完整任务生命周期               |
| **上下文持久化** | 会话级临时存储                  | ✅ 跨会话项目记忆                 |
| **并行执行**     | 单会话串行                      | ✅ Git Worktree 多任务            |
| **团队协作**     | 个人工具                        | ✅ 团队共享规范                   |
| **规范执行**     | 依赖用户提示                    | ✅ 自动注入编码标准               |
| **状态追踪**     | 无状态                          | ✅ 完整任务审计                   |

### 1.2 移植目标

将 Trellis 的核心工作流能力（任务管理、规范系统、会话连续性）移植到 Qwen Code，使 Qwen Code 从个人工具升级为团队级开发平台。

### 1.3 最佳协同模式

```
用户输入 → Trellis 任务编排 → 注入上下文 → Qwen Code 执行
      状态更新 ← 结果反馈 ← 钩子拦截 ← 执行完成
```

---

## 二、可移植功能评估

| 功能模块                   | 优先级  | 复杂度 | 工作量 | 说明                                |
| -------------------------- | ------- | ------ | ------ | ----------------------------------- |
| ✅ 任务管理系统            | 🔴 最高 | 低     | 1 周   | 纯文件系统实现，零依赖              |
| ✅ 上下文聚合器            | 🟠 高   | 低     | 2-3 天 | `get_context.py` 可直接复用         |
| ✅ 会话记录与工作区        | 🟠 高   | 低     | 3-5 天 | Python 脚本可直接复用               |
| ✅ 规范分层管理系统        | 🔴 最高 | 中     | 2-3 周 | 核心价值功能，扩展 `.qwen/rules.md` |
| ✅ 钩子扩展点              | 🟠 高   | 低     | 2 天   | 扩充现有钩子系统                    |
| ⚠️ Git Worktree 并行 Agent | 🟡 中   | 中     | 2 周   | 需 CLI 支持工作目录切换             |
| ⚠️ 远程模板注册表          | 🟡 中   | 中     | 2 周   | 可选功能，后序实现                  |
| ❌ 多平台兼容层            | 🔵 低   | 高     | 6+ 周  | 暂不需要                            |

---

## 三、推荐移植路线图

### 第一阶段（0-2 周）— 核心基础移植

| 任务                  | 源文件                           | 目标位置                                          | 状态   |
| --------------------- | -------------------------------- | ------------------------------------------------- | ------ |
| 移植 `task.py`        | `Trellis/scripts/task.py`        | `packages/core/src/tools/taskTool.ts`             | 待移植 |
| 移植 `get_context.py` | `Trellis/scripts/get_context.py` | `packages/core/src/services/contextAggregator.ts` | 待移植 |
| 移植会话记录          | `Trellis/scripts/add_session.py` | `packages/core/src/services/sessionJournal.ts`    | 待移植 |
| 扩展配置              | 扩展 `.qwen/config.toml`         | 增加 `workspace` 配置段                           | 待移植 |

### 第二阶段（2-4 周）— 规范系统集成

| 任务              | 说明                                                  | 状态   |
| ----------------- | ----------------------------------------------------- | ------ |
| 多文件规范注入    | 扩展 `.qwen/rules.md` → `.qwen/spec/**/*.md` 分层规范 | 待移植 |
| 规范加载器        | 新增 `packages/core/src/services/specLoader.ts`       | 待移植 |
| SessionStart 钩子 | 自动注入当前任务上下文到 Qwen 系统提示                | 待移植 |
| 规范模板命令      | `qwen init --spec` 快速初始化项目规范                 | 待移植 |

### 第三阶段（4-8 周）— 高级功能

| 任务               | 说明                               | 状态   |
| ------------------ | ---------------------------------- | ------ |
| Git Worktree 并行  | 实现 `qwen worktree` 子命令        | 待移植 |
| 任务生命周期钩子   | TaskStatusChange / PreToolUse 扩展 | 待移植 |
| 远程模板注册表     | `--registry` 参数支持              | 待移植 |
| `qwen trellis` CLI | 统一任务管理入口                   | 待移植 |

---

## 四、技术兼容性与冲突点

### 4.1 高度兼容

| 兼容点             | 说明                                   |
| ------------------ | -------------------------------------- |
| TOML 配置格式      | Trellis 已原生支持 `.qwen/config.toml` |
| Python 钩子模型    | 两者都使用 Python 脚本钩子             |
| SKILL.md 格式      | 完全匹配 Qwen 规范                     |
| Agent `.toml` 定义 | 格式一致                               |

### 4.2 需适配的冲突点

| 冲突点              | 当前状态                     | 解决方案                       |
| ------------------- | ---------------------------- | ------------------------------ |
| 单文件 → 多文件规范 | Qwen 单文件 `.qwen/rules.md` | 扩展上下文注入逻辑，聚合多文件 |
| 无状态 → 会话连续   | Qwen 无状态                  | Core 增加会话状态持久化接口    |
| 固定 → 动态工作目录 | Qwen 固定工作目录            | CLI 增加工作目录切换支持       |

---

## 五、高价值源文件清单

### 5.1 任务管理核心

| 源文件                                        | 用途                       | 复杂度 |
| --------------------------------------------- | -------------------------- | ------ |
| `Trellis/scripts/task.py`                     | 任务管理核心，零依赖可移植 | 低     |
| `Trellis/scripts/common/types.py`             | 任务数据模型               | 低     |
| `Trellis/templates/trellis/scripts/task_*.py` | 任务相关脚本               | 低     |

### 5.2 上下文与工作区

| 源文件                           | 用途             | 复杂度 |
| -------------------------------- | ---------------- | ------ |
| `Trellis/scripts/get_context.py` | 统一上下文聚合器 | 低     |
| `Trellis/scripts/add_session.py` | 会话日志记录     | 低     |
| `Trellis/scripts/workspace.py`   | 工作区管理       | 低     |

### 5.3 钩子与集成

| 源文件                                           | 用途                  | 复杂度 |
| ------------------------------------------------ | --------------------- | ------ |
| `Trellis/templates/qwen/hooks/session-start.py`  | Qwen 会话启动钩子示例 | 低     |
| `Trellis/templates/trellis/scripts/hook_*.py`    | 工作流钩子脚本        | 低     |
| `Trellis/templates/trellis/scripts/multi_agent/` | 并行 Agent 脚本       | 中     |

### 5.4 规范与模板

| 源文件                                  | 用途         | 复杂度 |
| --------------------------------------- | ------------ | ------ |
| `Trellis/templates/trellis/spec/`       | 分层规范模板 | 中     |
| `Trellis/templates/trellis/config.yaml` | 配置模板     | 低     |

---

## 六、审核流程

### 6.1 代码审查要点

#### 阶段一审查（核心基础移植）

| 检查项       | 标准                                   |
| ------------ | -------------------------------------- |
| 任务数据模型 | 必须兼容 Qwen 的 TypeScript 类型系统   |
| 文件系统操作 | 必须使用 Qwen 的路径常量（`paths.ts`） |
| 错误处理     | 必须遵循 Qwen 的错误类型规范           |
| 测试覆盖     | 每个新模块必须有对应的 `.test.ts`      |
| 文档更新     | 每个新功能必须更新 `.agentdocs/`       |

#### 阶段二审查（规范系统集成）

| 检查项   | 标准                          |
| -------- | ----------------------------- |
| 向后兼容 | `.qwen/rules.md` 必须仍然可用 |
| 性能影响 | 上下文注入不超过 100ms        |
| 内存占用 | 新增内存不超过 10MB           |

#### 阶段三审查（高级功能）

| 检查项            | 标准                   |
| ----------------- | ---------------------- |
| Git Worktree 安全 | 必须处理分支冲突和清理 |
| CLI 向后兼容      | 现有命令不能被破坏     |
| 集成测试          | 必须通过沙箱环境测试   |

### 6.2 审核步骤

```
1. 功能开发者 → 提交 PR
2. 自动检查 → lint / typecheck / test
3. 代码审查 → 至少 1 人 Review
4. 对比审核 → 检查与原始 Trellis 实现的差异
5. 文档审核 → 确认 .agentdocs/ 已更新
6. 合并 → Squash and merge
```

### 6.3 差异对比标准

每次 PR 必须包含：

| 对比项    | 说明                         |
| --------- | ---------------------------- |
| 原始实现  | 引用 Trellis 源文件的对应行  |
| Qwen 实现 | 引用本次 PR 的修改           |
| 差异理由  | 说明为何偏离原始实现（如有） |
| 回归风险  | 评估对现有功能的影响         |

---

## 七、已暂存变更（参考）

> 以下为本次工作流规划前的代码变更，已提交至暂存区，待后续 PR 时一并提交。

### 7.1 变更文件清单

| 文件                                                         | 变更类型 | 说明                        |
| ------------------------------------------------------------ | -------- | --------------------------- |
| `.gitignore`                                                 | 修改     | 屏蔽 `.omx/` 和 `_install/` |
| `packages/cli/src/config/config.test.ts`                     | 新增     | CLI 配置测试                |
| `packages/cli/src/config/config.ts`                          | 修改     | CLI 配置逻辑                |
| `packages/cli/src/config/settingsSchema.ts`                  | 修改     | 配置 Schema                 |
| `packages/cli/src/generated/git-commit.ts`                   | 修改     | Git 版本信息                |
| `packages/cli/src/ui/components/messages/ToolMessage.tsx`    | 新增     | 工具消息 UI 组件            |
| `packages/core/src/config/config.ts`                         | 修改     | Core 配置                   |
| `packages/core/src/core/coreToolScheduler.test.ts`           | 新增     | 工具调度器测试              |
| `packages/core/src/core/coreToolScheduler.ts`                | 修改     | 工具调度器逻辑              |
| `packages/core/src/core/geminiChat.ts`                       | 修改     | Gemini 聊天逻辑             |
| `packages/core/src/generated/git-commit.ts`                  | 修改     | Git 版本信息                |
| `packages/core/src/services/chatCompressionService.ts`       | 修改     | 聊天压缩服务                |
| `packages/core/src/services/chatRecordingService.test.ts`    | 新增     | 聊天录制服务测试            |
| `packages/core/src/services/chatRecordingService.ts`         | 修改     | 聊天录制服务                |
| `packages/core/src/services/sessionService.ts`               | 修改     | 会话服务                    |
| `packages/core/src/tools/tools.ts`                           | 新增     | 工具定义扩展                |
| `packages/core/src/utils/toolResultMemory.ts`                | 新增     | 工具结果内存管理            |
| `packages/vscode-ide-companion/schemas/settings.schema.json` | 修改     | VSCode 配置 Schema          |

### 7.2 变更统计

- 总计：18 个文件
- 新增：788 行
- 删除：21 行
- 净增：767 行

---

## 八、后续行动

- [ ] 确定第一阶段优先移植的具体模块
- [ ] 分配移植任务责任人
- [ ] 建立 CI/CD 审核流程
- [ ] 创建 Trellis 源文件的本地引用分支（可选）
