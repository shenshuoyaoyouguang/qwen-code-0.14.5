# Qwen Code v0.14.5 深度架构分析

> 基于源码逆向分析，结合集成测试案例和实际使用场景，全面剖析项目架构设计与核心机制。

---

## 一、项目概览

### 1.1 定位与起源

Qwen Code 是一个**开源终端 AI Agent**，专为 Qwen 系列模型优化。项目基于 Google Gemini CLI（Apache-2.0）二次开发，核心贡献在于 parser 级别的适配，使终端 Agent 体验更好地支持 Qwen-Coder 模型族。

**核心定位**：帮助开发者理解大型代码库、自动化繁琐工作、加速交付——类似 Claude Code 的终端体验。

| 属性 | 值 |
|------|-----|
| 版本 | 0.14.5 |
| 运行环境 | Node.js >= 20 |
| 模块系统 | ESM（`"type": "module"`） |
| 入口命令 | `qwen` → `dist/cli.js` |
| 核心模型 | Qwen3-Coder 系列 (Qwen3.6-Plus, Qwen3.5-Plus 等) |
| 认证方式 | Qwen OAuth / OpenAI API Key / Anthropic / Gemini / Vertex-AI |

### 1.2 技术栈一览

| 层面 | 技术 |
|------|------|
| 语言 | TypeScript (strict, `noImplicitAny`, `strictNullChecks`) |
| 终端UI | ink 6.x + React 19.x (React 终端渲染) |
| LLM 接口 | `@google/genai` / `openai` / `@anthropic-ai/sdk` (统一 ContentGenerator 抽象) |
| MCP 协议 | `@modelcontextprotocol/sdk` |
| 代码解析 | `web-tree-sitter` |
| 伪终端 | `@lydell/node-pty` |
| 构建工具 | esbuild (打包) + tsc (编译) |
| 测试框架 | vitest (单元 + 集成) |
| 代码规范 | ESLint + Prettier (单引号/分号/尾逗号/2空格/80字符宽) |

---

## 二、架构总览

### 2.1 分层架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户接入层                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │  终端CLI  │  │ VSCode   │  │ IM频道   │  │  SDK 编程接口     │   │
│  │  (ink)   │  │ Companion│  │ TG/微信/ │  │  (TypeScript)     │   │
│  │          │  │          │  │ 钉钉     │  │                   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬──────────┘   │
│       │             │             │                  │              │
│       └─────────────┴─────────────┴──────────────────┘              │
│                              │                                      │
├──────────────────────────────┼──────────────────────────────────────┤
│                              ▼                                      │
│                     ┌────────────────┐                              │
│                     │  Core Engine   │                              │
│                     │  (核心引擎包)   │                              │
│                     │                │                              │
│                     │ ┌────────────┐ │                              │
│                     │ │GeminiClient│ │  ← 对话管理、工具调度        │
│                     │ └────────────┘ │                              │
│                     │ ┌────────────┐ │                              │
│                     │ │ContentGen  │ │  ← 多Provider内容生成        │
│                     │ │  Router    │ │                              │
│                     │ └────────────┘ │                              │
│                     │ ┌────────────┐ │                              │
│                     │ │ToolRegistry│ │  ← 工具注册/发现/MCP        │
│                     │ └────────────┘ │                              │
│                     │ ┌────────────┐ │                              │
│                     │ │HookSystem  │ │  ← 全生命周期钩子           │
│                     │ └────────────┘ │                              │
│                     │ ┌────────────┐ │                              │
│                     │ │Permission  │ │  ← 权限决策与沙箱           │
│                     │ │ Manager    │ │                              │
│                     │ └────────────┘ │                              │
│                     │ ┌────────────┐ │                              │
│                     │ │Agent       │ │  ← 多Agent运行时            │
│                     │ │ Runtime    │ │                              │
│                     │ └────────────┘ │                              │
│                     │ ┌────────────┐ │                              │
│                     │ │Extension   │ │  ← 扩展管理                 │
│                     │ │ Manager    │ │                              │
│                     │ └────────────┘ │                              │
│                     └────────────────┘                              │
│                              │                                      │
├──────────────────────────────┼──────────────────────────────────────┤
│                              ▼                                      │
│                     ┌────────────────┐                              │
│                     │ LLM Provider   │                              │
│                     │ APIs           │                              │
│                     │ ┌────────────┐ │                              │
│                     │ │  OpenAI    │ │  DashScope / OpenRouter /   │
│                     │ │ Compatible │ │  Fireworks AI / 自建API     │
│                     │ ├────────────┤ │                              │
│                     │ │ Anthropic  │ │  Claude 模型                │
│                     │ ├────────────┤ │                              │
│                     │ │  Gemini    │ │  Google Gemini              │
│                     │ ├────────────┤ │                              │
│                     │ │  Qwen      │ │  Qwen OAuth + DashScope     │
│                     │ └────────────┘ │                              │
│                     └────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 包依赖关系

```
sdk-typescript ──→ cli ──→ core
                              ↑
channels/base ────────────────┘
channels/telegram ──→ channels/base
channels/weixin  ──→ channels/base
channels/dingtalk──→ channels/base

webui ──→ (独立组件库，供 VSCode Companion 使用)
vscode-ide-companion ──→ webui
```

| 包 | npm 名 | 职责 |
|----|--------|------|
| `packages/core` | `@qwen-code/qwen-code-core` | 后端引擎：模型交互、工具调度、会话管理 |
| `packages/cli` | `@qwen-code/qwen-code` | 用户交互层：ink TUI 渲染、命令处理 |
| `packages/sdk-typescript` | `@qwen-code/sdk` | 编程式 SDK：Query / MCP Tool 创建 |
| `packages/channels/base` | `@qwen-code/channel-base` | 频道基础设施：ACP 桥接、会话路由 |
| `packages/channels/telegram` | `@qwen-code/channel-telegram` | Telegram 适配器 |
| `packages/channels/weixin` | `@qwen-code/channel-weixin` | 微信适配器 |
| `packages/channels/dingtalk` | `@qwen-code/channel-dingtalk` | 钉钉适配器 |
| `packages/webui` | `@qwen-code/webui` | 共享 UI 组件库 (React + Tailwind) |
| `packages/vscode-ide-companion` | `qwen-code-vscode-ide-companion` | VSCode 扩展 |
| `packages/zed-extension` | — | Zed 编辑器扩展 |

---

## 三、核心包深度剖析 (`packages/core`)

### 3.1 模块全景

```
core/src/
├── core/           ← LLM 客户端与内容生成（引擎核心）
│   ├── client.ts            GeminiClient: 对话管理、工具调度、循环检测
│   ├── turn.ts              Turn: 单轮对话抽象
│   ├── contentGenerator.ts  ContentGenerator 接口 + AuthType 枚举
│   ├── geminiChat.ts        GeminiChat: 底层聊天抽象
│   ├── coreToolScheduler.ts 工具调度器：并行/串行执行
│   ├── openaiContentGenerator/  OpenAI 兼容实现
│   ├── anthropicContentGenerator/ Anthropic 实现
│   └── geminiContentGenerator/   Gemini 实现
│
├── tools/          ← 工具系统
│   ├── tools.ts             DeclarativeTool 基类 + ToolInvocation 接口
│   ├── tool-registry.ts     ToolRegistry: 注册/发现/MCP 集成
│   ├── tool-names.ts        19 个内置工具名称常量
│   ├── edit.ts              文件编辑工具
│   ├── write_file.ts        写文件工具
│   ├── read_file.ts         读文件工具
│   ├── shell_tool.ts        Shell 命令执行
│   ├── grep_search.ts       ripgrep 内容搜索
│   ├── glob.ts              glob 文件搜索
│   ├── list_directory.ts    目录列表
│   ├── web_fetch.ts         网页获取
│   ├── web_search.ts        网页搜索
│   ├── todo_write.ts        待办事项
│   ├── save_memory.ts       记忆保存
│   ├── agent_tool.ts        子 Agent 调度
│   ├── skill_tool.ts        技能执行
│   ├── ask_user_question.ts 用户提问
│   ├── lsp_tool.ts          LSP 诊断
│   └── cron_*.ts            定时任务 (create/list/delete)
│
├── config/         ← 配置系统
│   ├── config.ts            Config 类 (2325 行): 全局配置中枢
│   └── models.ts            模型注册与默认配置
│
├── models/         ← 模型管理
│   ├── modelRegistry.ts     模型注册表
│   └── modelConfigResolver.ts 模型配置解析
│
├── agents/         ← 多 Agent 运行时
│   ├── arena/               Arena 模式（多 Agent 竞赛/评测）
│   ├── backends/            终端后端 (tmux/iTerm2/进程内)
│   └── runtime/             Agent 运行时核心
│       ├── agent-core.ts    AgentCore: 共享执行引擎
│       ├── agent-headless.ts Headless Agent: 一次性任务
│       └── agent-interactive.ts Interactive Agent: 持久交互
│
├── subagents/      ← 子 Agent 管理
│   ├── subagent-manager.ts  子 Agent 注册与调度
│   └── builtin-agents.ts    内置 Agent (general-purpose / Explore)
│
├── skills/         ← 技能系统
│   ├── skill-manager.ts     技能注册与执行
│   └── skill-load.ts        SKILL.md 加载器
│
├── hooks/          ← 钩子系统
│   ├── hookSystem.ts        HookSystem: 钩子协调器
│   ├── hookRegistry.ts      HookRegistry: 钩子注册表
│   ├── hookRunner.ts        HookRunner: 钩子执行器
│   ├── hookAggregator.ts    HookAggregator: 结果聚合
│   ├── hookPlanner.ts       HookPlanner: 执行规划
│   └── hookEventHandler.ts  HookEventHandler: 事件分发
│
├── extension/      ← 扩展管理
│   ├── extensionManager.ts  ExtensionManager (1413 行)
│   ├── github.ts            GitHub Release 安装
│   ├── npm.ts               NPM 安装
│   ├── claude-converter.ts  Claude 插件格式兼容
│   ├── gemini-converter.ts  Gemini 扩展格式兼容
│   └── variables.ts         变量替换系统
│
├── permissions/    ← 权限系统
│   ├── permission-manager.ts PermissionManager (817 行)
│   ├── rule-parser.ts        权限规则解析
│   ├── types.ts              权限类型定义
│   └── shell-semantics.ts    Shell 命令语义分析
│
├── services/       ← 基础服务
│   ├── chatCompressionService.ts  对话压缩
│   ├── microcompaction/           微压缩（基于时间的旧工具结果清理）
│   ├── sessionService.ts          会话管理
│   └── gitService.ts              Git 服务
│
├── followup/       ← 推测执行
│   ├── speculation.ts       SpeculationEngine: 用户确认前预执行
│   ├── overlayFs.ts         Copy-on-Write 文件系统隔离
│   ├── forkedQuery.ts       Fork 查询
│   └── suggestionGenerator.ts 建议生成
│
├── mcp/            ← MCP 认证
│   ├── oauth-provider.ts    MCP OAuth Provider
│   └── oauth-token-storage.ts Token 存储
│
├── lsp/            ← LSP 集成
│   ├── NativeLspService.ts  LSP 服务
│   └── LspServerManager.ts  LSP 服务器管理
│
├── ide/            ← IDE 集成
│   ├── ide-client.ts        IDE 客户端
│   └── ideContext.ts        IDE 上下文（打开文件/光标/选区）
│
├── telemetry/      ← 遥测
│   ├── loggers.ts           遥测日志
│   └── metrics.ts           指标收集
│
└── utils/          ← 工具函数 (60+ 文件)
    ├── environmentContext.ts 环境上下文
    ├── ripgrepUtils.ts      ripgrep 工具
    ├── shellAstParser.ts    Shell AST 解析
    └── retry.ts             重试机制
```

### 3.2 核心交互流程

一次完整的用户交互流程：

```
1. 用户输入
   ↓
2. CLI (gemini.tsx) 解析参数 → loadSettings → validateAuthMethod
   ↓
3. GeminiClient.sendMessageStream()
   │
   ├── a. 触发 UserPromptSubmit Hook
   ├── b. 构建系统提示词 + IDE 上下文 + 子 Agent 提醒
   ├── c. 调用 ContentGenerator (按 AuthType 路由)
   │       │
   │       ├── USE_OPENAI   → OpenAIContentGenerator (DashScope/OpenRouter/...)
   │       ├── USE_ANTHROPIC → AnthropicContentGenerator
   │       ├── USE_GEMINI   → GeminiContentGenerator
   │       └── QWEN_OAUTH   → QwenContentGenerator
   │
   ├── d. 流式返回事件:
   │       ├── Content           → 文本内容
   │       ├── ToolCallRequest   → 工具调用请求
   │       ├── Thought           → 思考内容
   │       ├── Error             → 错误
   │       └── Finished          → 完成
   │
   ├── e. 工具调用处理:
   │       ├── 构建 ToolInvocation
   │       ├── PermissionManager 权限检查
   │       ├── 触发 PreToolUse Hook
   │       ├── 执行工具
   │       ├── 触发 PostToolUse Hook
   │       └── 将结果返回模型
   │
   └── f. 完成后:
           ├── 触发 Stop Hook (可能触发继续对话)
           └── 检查 nextSpeaker (模型是否需要继续)
   ↓
4. CLI 渲染结果到终端
```

---

## 四、六大核心机制

### 4.1 工具系统

#### 4.1.1 架构设计

工具系统采用**声明式基类 + 注册中心**模式：

```
DeclarativeTool (抽象基类)
  │  - name, description, paramSchema
  │  - validateToolParams()
  │  - createInvocation()
  │
  ├── BaseDeclarativeTool (增加校验和调用创建)
  │     └── 所有具体工具 (EditTool, ShellTool, ReadFileTool, ...)
  │
  └── DiscoveredTool (动态发现的外部工具，如 MCP 工具)

ToolInvocation (调用实例接口)
  └── BaseToolInvocation (便捷基类)
        └── 各工具的 Invocation 实现
```

#### 4.1.2 内置工具清单

| 工具名 | 显示名 | 类别 | 功能 |
|--------|--------|------|------|
| `edit` | Edit | Edit | 精确替换文件中的文本片段 |
| `write_file` | WriteFile | Edit | 创建或覆盖写入文件 |
| `read_file` | ReadFile | Read | 读取文件内容 |
| `list_directory` | ListFiles | Read | 列出目录内容 |
| `grep_search` | Grep | Search | ripgrep 正则搜索文件内容 |
| `glob` | Glob | Search | glob 模式搜索文件路径 |
| `run_shell_command` | Shell | Execute | 执行 Shell 命令 |
| `web_fetch` | WebFetch | Fetch | 获取网页内容 |
| `web_search` | WebSearch | Fetch | 网页搜索 |
| `todo_write` | TodoWrite | Think | 管理待办事项列表 |
| `save_memory` | SaveMemory | Think | 保存长期记忆 |
| `agent` | Agent | Other | 调度子 Agent 执行任务 |
| `skill` | Skill | Other | 执行预定义技能 |
| `exit_plan_mode` | ExitPlanMode | Other | 退出计划模式 |
| `ask_user_question` | AskUserQuestion | Other | 向用户提问 |
| `lsp` | Lsp | Other | LSP 诊断信息 |
| `cron_create` | CronCreate | Other | 创建定时任务 |
| `cron_list` | CronList | Other | 列出定时任务 |
| `cron_delete` | CronDelete | Other | 删除定时任务 |

#### 4.1.3 MCP 工具发现

`ToolRegistry.discoverMcpTools()` 通过 MCP 协议动态发现外部工具服务器提供的工具，与内置工具统一注册到同一个工具注册表中，对上层完全透明。

**案例：MCP 工具发现流程**

```typescript
// tool-registry.ts 核心逻辑（简化）
async discoverMcpTools(): Promise<DiscoveredTool[]> {
  const mcpServers = this.config.getMcpServers();
  const tools = [];
  for (const [name, config] of Object.entries(mcpServers)) {
    const connection = await this.mcpClient.connect(name, config);
    const serverTools = await connection.listTools();
    tools.push(...serverTools.map(t => new DiscoveredTool(t)));
  }
  return tools;
}
```

### 4.2 多 Provider 内容生成

#### 4.2.1 统一接口抽象

`ContentGenerator` 接口统一了所有 LLM Provider 的调用方式：

```typescript
// contentGenerator.ts
enum AuthType {
  USE_OPENAI   = 'openai',     // OpenAI 兼容 API
  QWEN_OAUTH   = 'qwen-oauth', // Qwen OAuth 认证
  USE_GEMINI   = 'gemini',     // Google Gemini
  USE_VERTEX_AI = 'vertex-ai', // Google Vertex AI
  USE_ANTHROPIC = 'anthropic',  // Anthropic Claude
}
```

#### 4.2.2 Provider 路由

```
AuthType.USE_OPENAI  → OpenAIContentGenerator
                         ├── DashScope (阿里云模型服务)
                         ├── OpenRouter
                         ├── Fireworks AI
                         └── 任何 OpenAI 兼容 API
AuthType.USE_ANTHROPIC → AnthropicContentGenerator
AuthType.USE_GEMINI   → GeminiContentGenerator
AuthType.QWEN_OAUTH   → QwenContentGenerator (OAuth + DashScope)
```

#### 4.2.3 格式转换层

各 Provider 的请求/响应格式差异通过转换层统一：
- OpenAI 格式 ↔ Gemini 格式（函数调用、内容块、工具结果）
- Anthropic 格式 ↔ Gemini 格式
- 这使得上层 `GeminiClient` 和 `GeminiChat` 可以统一处理，无需感知底层 Provider

### 4.3 多 Agent 运行时

#### 4.3.1 Agent 生命周期

```
INITIALIZING → RUNNING ⇄ IDLE → COMPLETED / FAILED / CANCELLED
```

#### 4.3.2 三种 Agent 模式

| 模式 | 类 | 场景 | 特点 |
|------|-----|------|------|
| Headless | `AgentHeadless` | 一次性任务（SDK 调用、CI/CD） | 无交互，任务完成后退出 |
| Interactive | `AgentInteractive` | 持久交互（终端会话） | 支持用户输入、会话恢复 |
| Arena | `ArenaAgentClient` | 多 Agent 竞赛/评测 | 多个 Agent 并行执行同一任务 |

#### 4.3.3 AgentCore 共享引擎

`AgentCore` (1113 行) 是所有 Agent 模式的共享执行引擎，封装了：
- **模型推理循环**：发送请求 → 解析响应 → 调度工具 → 汇总结果
- **工具调度**：通过 `CoreToolScheduler` 管理并行/串行工具执行
- **统计收集**：`AgentStatistics` 跟踪轮次、token 使用、工具调用数
- **事件发射**：`AgentEventEmitter` 发射轮次事件、工具事件、使用量事件
- **终止控制**：`maxTurns` / `maxTimeMinutes` 限制

**安全约束**：子 Agent 被禁止使用 `Agent` 工具（防止递归）和 `Cron` 工具（会话作用域不匹配）：

```typescript
export const EXCLUDED_TOOLS_FOR_SUBAGENTS: ReadonlySet<string> = new Set([
  ToolNames.AGENT,
  ToolNames.CRON_CREATE,
  ToolNames.CRON_LIST,
  ToolNames.CRON_DELETE,
]);
```

#### 4.3.4 内置子 Agent

| Agent | 用途 | 特点 |
|-------|------|------|
| `general-purpose` | 通用研究、代码搜索、多步骤任务 | 可读写文件，返回简洁报告 |
| `Explore` | 快速代码库探索 | **只读模式**，禁止任何文件修改 |

**案例：Explore Agent 的只读约束**

Explore Agent 的系统提示词中明确声明：
> "This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from creating new files, modifying existing files, deleting files, moving or copying files..."

这意味着 Explore Agent 只能使用 `read_file`、`glob`、`grep_search` 和只读 Shell 命令，从工具层面保证了安全性。

### 4.4 钩子系统 (Hook System)

#### 4.4.1 架构设计

钩子系统采用**注册 → 规划 → 执行 → 聚合**四阶段流水线：

```
HookRegistry (注册) → HookPlanner (规划) → HookRunner (执行) → HookAggregator (聚合)
                                                                              │
                                                     HookEventHandler ←──────┘
                                                       (事件分发)
```

- **HookRegistry**：管理钩子注册、启用/禁用、优先级排序
- **HookPlanner**：根据事件类型规划执行计划（哪些钩子需要运行）
- **HookRunner**：执行单个钩子（子进程方式，支持超时和错误处理）
- **HookAggregator**：聚合多个钩子的决策结果（取最严格）
- **HookEventHandler**：对外接口，触发事件并返回聚合结果

#### 4.4.2 钩子事件全表

| 事件 | 触发时机 | 典型用途 |
|------|----------|----------|
| `PreToolUse` | 工具执行前 | 拦截危险操作、注入参数 |
| `PostToolUse` | 工具执行后 | 日志记录、结果后处理 |
| `PostToolUseFailure` | 工具执行失败后 | 错误通知、重试策略 |
| `UserPromptSubmit` | 用户提交提示词 | 输入预处理、注入上下文 |
| `SessionStart` | 会话开始 | 初始化环境、加载配置 |
| `SessionEnd` | 会话结束 | 清理资源、状态持久化 |
| `Stop` | Agent 即将结束响应 | 强制继续对话、追加操作 |
| `StopFailure` | 因 API 错误结束轮次 | 自动重试、降级处理 |
| `SubagentStart` | 子 Agent 启动 | 资源分配、状态跟踪 |
| `SubagentStop` | 子 Agent 停止 | 结果收集、资源回收 |
| `PreCompact` | 对话压缩前 | 保留关键信息 |
| `PostCompact` | 对话压缩后 | 验证压缩结果 |
| `Notification` | 通知发送时 | 自定义通知渠道 |
| `PermissionRequest` | 权限对话框展示时 | 自动审批/拒绝 |

#### 4.4.3 钩子决策类型

| 决策 | 含义 | 优先级 |
|------|------|--------|
| `deny` | 拒绝执行 | 3 (最高) |
| `ask` | 要求用户确认 | 2 |
| `default` | 使用默认行为 | 1 |
| `allow` | 允许执行 | 0 (最低) |

**聚合规则**：多个钩子返回不同决策时，取**最严格**（优先级最高）的决策。

**案例：PreToolUse Hook 拦截 Shell 命令**

```json
// .qwen/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "run_shell_command",
        "hooks": [
          {
            "type": "command",
            "command": "sh -c 'echo \"Shell command blocked\" && exit 1'"
          }
        ]
      }
    ]
  }
}
```

当 Agent 尝试执行 Shell 命令时，PreToolUse Hook 会先运行，若返回非零退出码则阻止工具执行。

### 4.5 权限系统

#### 4.5.1 四种审批模式

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| `default` | 危险操作需用户确认 | 日常开发（默认） |
| `plan` | 先规划后执行，规划阶段不执行工具 | 需要审慎评估的复杂任务 |
| `auto_edit` | 文件编辑免确认，Shell 仍需确认 | 高频编辑场景 |
| `yolo` | 所有操作免确认 | CI/CD、自动化流程 |

#### 4.5.2 权限决策层级

```
工具自身权限检查
    ↓
PermissionManager 规则匹配
    ├── allow 规则 → 直接允许
    ├── deny 规则  → 直接拒绝
    └── ask 规则   → 弹出确认对话框
    ↓
用户交互确认（如需）
```

#### 4.5.3 Shell 命令安全分析

权限系统对 Shell 命令进行了**语义级分析**：

```
用户输入: "rm -rf /tmp/build && npm run test"
    ↓
shell-semantics.ts → 拆分为独立操作
    ├── "rm -rf /tmp/build"  → 危险操作 (写操作)
    └── "npm run test"       → 只读操作 (可能)
    ↓
shellAstParser.ts → AST 级别判断只读/写操作
    ↓
检测命令替换 $(...) → 标记为不可预测 → 需要 ask
```

`PermissionManager` 对每个 Shell 操作独立决策，确保即使组合命令也能精确控制。

### 4.6 扩展系统

#### 4.6.1 三种安装来源

| 来源 | 方法 | 示例 |
|------|------|------|
| NPM | `downloadFromNpmRegistry()` | `qwen extension install @scope/package` |
| GitHub Release | `downloadFromGitHubRelease()` | `qwen extension install owner/repo` |
| Git Clone | `cloneFromGit()` | `qwen extension install https://github.com/...` |

#### 4.6.2 跨格式兼容

ExtensionManager 通过转换器兼容其他生态的插件格式：

```
Claude 插件 ──→ claude-converter.ts ──→ 统一内部格式
Gemini 扩展 ──→ gemini-converter.ts ──→ 统一内部格式
```

这使得 Qwen Code 可以直接复用 Claude 和 Gemini 生态的已有插件。

#### 4.6.3 扩展能力

一个扩展可以提供：
- **MCP 服务器配置** — 注册新的 MCP 工具
- **钩子定义** — 注册 PreToolUse/PostToolUse 等钩子
- **技能 (Skill)** — 注册 SKILL.md 技能文件
- **子 Agent (Subagent)** — 注册自定义 Agent
- **设置项** — 扩展的可配置参数

#### 4.6.4 变量替换系统

扩展配置支持变量替换，在加载时动态解析：

```json
{
  "mcpServers": {
    "my-server": {
      "command": "${SHELL}",
      "args": ["-c", "API_KEY=${env:MY_API_KEY} npx my-server"]
    }
  }
}
```

`${SHELL}`、`${env:MY_API_KEY}` 等变量在加载时通过 `variables.ts` 解析。

---

## 五、频道系统深度剖析

### 5.1 ACP 桥接架构

频道系统基于 **ACP (Agent Client Protocol)** 协议，将即时通讯平台桥接到 Qwen Code 核心引擎：

```
┌──────────────┐     ACP 协议      ┌────────────────┐
│  Telegram    │◄──────────────────►│                │
│  Adapter     │                    │   Qwen Code    │
├──────────────┤                    │   Core Engine  │
│  微信        │◄──────────────────►│                │
│  Adapter     │                    │                │
├──────────────┤                    │                │
│  钉钉        │◄──────────────────►│                │
│  Adapter     │                    │                │
└──────────────┘                    └────────────────┘
```

### 5.2 ChannelBase 抽象基类

所有频道适配器都继承自 `ChannelBase`，需实现三个核心方法：

```typescript
abstract class ChannelBase {
  abstract connect(): Promise<void>;      // 连接到即时通讯平台
  abstract sendMessage(chatId: string, text: string): Promise<void>;  // 发送消息
  abstract disconnect(): void;            // 断开连接
}
```

内置功能：
- **GroupGate** — 群聊策略（白名单/黑名单/全部允许）
- **SenderGate** — 发送者验证（allowlist/pairing/open 三种策略）
- **SessionRouter** — 会话路由（user/thread/single 三种作用域）
- **BlockStreamer** — 分块流式输出（适配 IM 平台的消息长度限制）

### 5.3 三种消息调度模式

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| `collect` | 收集连续消息，合并为一个 prompt | 用户分多条发送需求 |
| `steer` | 新消息中断当前执行，转向新方向 | 用户需要纠正方向 |
| `followup` | 新消息追加到当前对话末尾 | 用户补充上下文 |

### 5.4 开发自定义频道

**案例：开发一个 Slack 频道适配器**

```typescript
import { ChannelBase, ChannelPlugin } from '@qwen-code/channel-base';

class SlackChannel extends ChannelBase {
  private client: WebClient;

  async connect(): Promise<void> {
    this.client = new WebClient(this.config.apiToken);
    // 注册消息监听
    this.client.on('message', (msg) => this.handleMessage(msg));
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.client.chat.postMessage({ channel: chatId, text });
  }

  disconnect(): void {
    this.client.disconnect();
  }

  private async handleMessage(msg: SlackMessage): Promise<void> {
    const envelope: Envelope = {
      chatId: msg.channel,
      senderId: msg.user,
      text: msg.text,
      // ...
    };
    // 交由 ChannelBase 处理群聊策略、发送者验证、会话路由
    await this.onMessage(envelope);
  }
}

// 插件注册
export const plugin: ChannelPlugin = {
  channelType: 'slack',
  displayName: 'Slack',
  createChannel: (name, config, bridge) => new SlackChannel(name, config, bridge),
};
```

---

## 六、SDK 编程接口

### 6.1 Query API

SDK 通过子进程方式与 Qwen Code CLI 通信：

```typescript
import { query } from '@qwen-code/sdk';

// 单轮查询
const q = query({
  prompt: '解释 packages/core/src/core/client.ts 的核心设计',
  options: {
    model: 'qwen3.6-plus',
    permissionMode: 'default',
    cwd: '/path/to/project',
  },
});

// 监听流式响应
for await (const message of q) {
  if (message.type === 'assistant') {
    process.stdout.write(message.message.content);
  }
}
```

**多轮对话**：

```typescript
import { query } from '@qwen-code/sdk';

async function* multiTurnMessages() {
  yield { type: 'user', message: { role: 'user', content: '第一个问题' } };
  // 等待响应后继续
  yield { type: 'user', message: { role: 'user', content: '跟进问题' } };
}

const q = query({
  prompt: multiTurnMessages(),
  options: { sessionId: 'my-session' },
});
```

### 6.2 SDK MCP Tool API

SDK 提供了优雅的 MCP 工具创建接口：

```typescript
import { z } from 'zod';
import { tool, createSdkMcpServer } from '@qwen-code/sdk';

// 定义工具
const calculatorTool = tool(
  'calculate_sum',
  '计算两个数的和',
  { a: z.number().describe('第一个数'), b: z.number().describe('第二个数') },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  })
);

// 创建 MCP 服务器
const server = createSdkMcpServer({
  name: 'calculator',
  version: '1.0.0',
  tools: [calculatorTool],
});
```

**类型安全**：`tool()` 函数利用 Zod schema 推断 `args` 的类型，确保 handler 中的参数类型与 schema 一致。

### 6.3 传输层

SDK 使用 `ProcessTransport` 通过子进程与 CLI 通信：

```
SDK (Query) ←→ ProcessTransport ←→ 子进程 (qwen CLI) ←→ Core Engine
```

- JSON Lines 协议（每行一个 JSON 消息）
- 支持流式消息（部分消息 + 完整消息）
- 支持 AbortController 取消

---

## 七、推测执行机制

### 7.1 设计理念

推测执行（Speculation）是 Qwen Code 的一项**创新机制**：在用户确认建议之前，后台就已经开始执行，一旦用户确认则立即得到结果。

```
时间线:
─────────────────────────────────────────────────────►
  建议展示   推测执行开始(后台)   用户按Tab确认   立即得到结果
    │              │                  │               │
    └─────speculation──────┘          │               │
           (OverlayFs 隔离)           │               │
                                    accept          复制 Overlay 到真实 FS
```

### 7.2 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| SpeculationEngine | `speculation.ts` | 推测执行协调器 |
| OverlayFs | `overlayFs.ts` | Copy-on-Write 文件系统隔离 |
| speculationToolGate | `speculationToolGate.ts` | 限制推测执行中的工具（只读 + overlay 写入） |
| forkedQuery | `forkedQuery.ts` | Fork 当前对话进行独立执行 |

### 7.3 执行流程

1. **建议展示** → `startSpeculation()` 触发
2. **推测循环** — 后台运行（只读工具 + overlay 写入），最多 20 轮
3. **用户确认** → `acceptSpeculation()` 将 overlay 复制到真实文件系统
4. **用户取消** → `abortSpeculation()` 清理 overlay

**安全保证**：推测执行期间所有文件修改都写入 OverlayFs（内存层），不会影响真实文件系统，只有用户明确确认后才提交。

---

## 八、对话压缩机制

### 8.1 为什么需要压缩

LLM 有上下文窗口限制，长对话会消耗大量 token。Qwen Code 提供两级压缩策略：

### 8.2 ChatCompressionService（全量压缩）

- 触发条件：对话历史超过 token 阈值
- 方式：将早期对话轮次摘要为简洁描述
- 保留：最近的对话轮次完整保留

### 8.3 MicrocompactionService（微压缩）

- 触发条件：基于时间，旧工具结果超过保留时限
- 方式：仅清理旧工具调用的结果文本，保留对话结构
- 优势：更轻量，不需要模型参与

**案例：微压缩策略**

```
压缩前:
  User: 请搜索所有 TypeScript 文件
  Assistant: [调用 glob 工具]
  Tool: 找到 847 个文件: /src/foo.ts, /src/bar.ts, ... (大量输出)
  Assistant: 在项目中找到了 847 个 TypeScript 文件

压缩后:
  User: 请搜索所有 TypeScript 文件
  Assistant: [调用 glob 工具] → [结果已压缩: 找到 847 个文件]
  Assistant: 在项目中找到了 847 个 TypeScript 文件
```

---

## 九、集成测试案例分析

### 9.1 测试架构

```
integration-tests/
├── test-helper.ts          TestRig 测试基础设施
├── cli/                    CLI 模式集成测试
│   ├── edit.test.ts        文件编辑
│   ├── write_file.test.ts  文件写入
│   ├── file-system.test.ts 文件系统操作
│   ├── run_shell_command.test.ts  Shell 命令
│   ├── list_directory.test.ts     目录列表
│   ├── read_many_files.test.ts    批量文件读取
│   ├── web_search.test.ts         网页搜索
│   ├── json-output.test.ts        JSON 输出模式
│   ├── todo_write.test.ts         待办事项
│   ├── save_memory.test.ts        记忆保存
│   ├── mcp_server_*.test.ts       MCP 服务器集成
│   ├── settings-migration.test.ts 配置迁移
│   ├── utf-bom-encoding.test.ts   UTF BOM 编码处理
│   └── extensions-install.test.ts 扩展安装
├── interactive/             交互模式集成测试
├── sdk-typescript/          SDK 集成测试
├── terminal-bench/          终端基准测试
└── concurrent-runner/       并发运行器
```

### 9.2 典型测试案例

#### 案例 1：文件编辑测试 (`edit.test.ts`)

```typescript
it('should be able to edit content in a file', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to edit content in a file');

  rig.createFile('file_to_edit.txt', 'original content');
  const prompt = `Can you edit the file 'file_to_edit.txt' to change 'original' to 'edited'`;

  const result = await rig.run(prompt);
  const foundToolCall = await rig.waitForToolCall('edit');

  expect(foundToolCall).toBeTruthy();
  expect(rig.readFile('file_to_edit.txt')).toBe('edited content');
});
```

**要点**：
- `TestRig` 提供隔离的测试环境
- 通过 `waitForToolCall('edit')` 验证工具调用
- 直接读取文件验证实际效果

#### 案例 2：正则特殊字符处理 (`edit.test.ts`)

```typescript
it('should handle $ literally when replacing text ending with $', async () => {
  const rig = new TestRig();
  await rig.setup('should handle $ literally...');

  rig.createFile('regex.yml', "| select('match', '^[sv]d[a-z]$')\n");
  const prompt = `Add a comment "# updated" at the end of the line in regex.yml`;

  const result = await rig.run(prompt);
  expect(rig.readFile('regex.yml')).toBe(
    "| select('match', '^[sv]d[a-z]$') # updated\n"
  );
});
```

**要点**：测试 edit 工具对正则特殊字符 `$` 的字面处理，避免正则转义导致的错误替换。

#### 案例 3：MCP 服务器集成 (`simple-mcp-server.test.ts`)

验证 Qwen Code 能发现并使用 MCP 服务器提供的工具，包括：
- MCP 服务器启动与连接
- 工具列表发现
- 工具调用与结果返回
- 循环 Schema 处理

---

## 十、VSCode IDE 集成

### 10.1 架构

```
┌─────────────────────────────────────┐
│         VSCode Extension            │
│  ┌───────────┐  ┌────────────────┐ │
│  │ Webview   │  │ IDE Server     │ │
│  │ (Sidebar) │  │ (通信服务器)    │ │
│  │           │  │                │ │
│  │ ┌───────┐ │  │ ┌────────────┐ │ │
│  │ │ChatViewer│ │  │ ide-client │ │ │
│  │ │(webui) │ │  │ (上下文共享) │ │ │
│  │ └───────┘ │  │ └────────────┘ │ │
│  │ ┌───────┐ │  │ ┌────────────┐ │ │
│  │ │Diff   │ │  │ │diff-manager│ │ │
│  │ │Editor │ │  │ │ (差异管理)  │ │ │
│  │ └───────┘ │  │ └────────────┘ │ │
│  └───────────┘  └────────────────┘ │
└─────────────────────────────────────┘
         │                    │
         ▼                    ▼
    Qwen Code CLI 进程    IDE 上下文
    (子进程通信)         (打开文件/光标/选区)
```

### 10.2 核心功能

| 功能 | 描述 |
|------|------|
| 侧边栏聊天 | 在 VSCode 侧边栏直接与 Qwen Code 对话 |
| Diff 编辑器 | 接受/拒绝 AI 修改，Ctrl+S 接受 |
| 上下文共享 | 自动共享打开文件、光标位置、选中文本 |
| 快捷键 | `Ctrl+Shift+L` 聚焦聊天面板 |

---

## 十一、配置系统

### 11.1 配置层级（优先级从高到低）

```
1. 命令行参数          (--model, --permission-mode, ...)
2. 环境变量            (QWEN_MODEL, QWEN_AUTH_TYPE, ...)
3. 项目配置            (.qwen/settings.json)
4. 用户配置            (~/.qwen/settings.json)
5. 系统配置            (系统级 settings.json)
6. 默认值              (代码中的默认配置)
```

### 11.2 关键配置类别

| 类别 | 关键配置项 |
|------|-----------|
| 通用 | vim 模式、编辑器偏好、自动更新 |
| UI | 主题、Banner、Footer |
| 模型 | 模型选择、会话轮次限制、压缩设置 |
| 上下文 | 上下文文件名、目录包含、文件过滤 |
| 工具 | 审批模式、沙箱、工具限制 |
| 隐私 | 使用统计收集 |
| 高级 | 调试选项、自定义 Bug 报告命令 |

---

## 十二、设计亮点与架构洞察

### 12.1 设计亮点

1. **ContentGenerator 统一抽象**：一套核心逻辑（GeminiClient/GeminiChat）通过 ContentGenerator 接口支持 5 种 LLM Provider，避免了核心引擎对特定 API 的耦合。

2. **推测执行（Speculation）**：用户确认前后台预执行 + OverlayFs 隔离，极大地提升了交互响应速度，同时保证了安全性。

3. **ACP 频道桥接**：统一的 ACP 协议使 Qwen Code 能无缝接入 Telegram/微信/钉钉等 IM 平台，具备企业级群聊策略和会话路由。

4. **跨生态兼容**：ExtensionManager 同时兼容 Claude 和 Gemini 插件格式，快速继承了两个生态的扩展资源。

5. **Shell 语义级安全分析**：不仅匹配命令名，而是通过 AST 解析分析 Shell 命令的读写语义，实现了精确的权限控制。

6. **微压缩 + 全量压缩 双层策略**：在 token 预算和响应质量之间取得平衡，微压缩不需要模型参与，开销极低。

### 12.2 架构洞察

1. **Gemini 遗留命名**：核心类如 `GeminiClient`、`GeminiChat` 保留了 Gemini CLI 的命名，但实际已通过 ContentGenerator 接口支持多 Provider。这是历史演进的痕迹，重构成本与收益的权衡。

2. **Config 类膨胀**：`config.ts` 达 2325 行，承担了过多职责（配置加载/验证/合并/持久化）。这是单体 Config 类的典型问题，未来可能需要拆分。

3. **子进程通信模型**：SDK 通过 `ProcessTransport` 启动子进程与 CLI 通信，而非直接调用 Core 包。这使得 SDK 和 Core 可以独立部署，但增加了进程间通信的开销。

4. **Hook 子进程执行**：每个 Hook 都在独立子进程中运行，这提供了安全隔离但增加了延迟。对于高频 Hook（如 PreToolUse），可能需要优化。

5. **工具调度的并行性**：`CoreToolScheduler` 支持并行执行多个无依赖的工具调用，这在需要同时搜索多个维度的场景下显著提升效率。

---

## 十三、关键文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `packages/core/src/config/config.ts` | 2325 | 全局配置中枢 |
| `packages/core/src/extension/extensionManager.ts` | 1413 | 扩展管理 |
| `packages/core/src/permissions/permission-manager.ts` | 817 | 权限管理 |
| `packages/core/src/agents/runtime/agent-core.ts` | 1113 | Agent 共享执行引擎 |
| `packages/core/src/core/client.ts` | 1061 | LLM 客户端（GeminiClient） |
| `packages/core/src/followup/speculation.ts` | 564 | 推测执行引擎 |
| `packages/core/src/hooks/hookSystem.ts` | 375 | 钩子系统 |
| `packages/channels/base/src/ChannelBase.ts` | 448 | 频道基类 |
| `packages/sdk-typescript/src/query/createQuery.ts` | ~130 | SDK Query 创建 |

---

*本文档基于 Qwen Code v0.14.5 源码分析，由蕾姆于 2026-04-16 生成。*