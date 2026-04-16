## 产品文档
`prd/qwen-code-architecture.md` - Qwen Code 项目深度架构分析（架构图、六大核心机制、集成测试案例、SDK/MCP/频道/扩展详解）

## 前端文档
修改 CLI UI 时参考 `prd/qwen-code-architecture.md` 中"CLI 包"和"频道系统"章节

## 后端文档
修改 Core 逻辑时参考 `prd/qwen-code-architecture.md` 中"核心包深度剖析"和"六大核心机制"章节

## 当前任务文档

## 全局重要记忆
- Qwen Code 基于 Google Gemini CLI 二次开发，保留 Apache-2.0 许可证
- 所有 ContentGenerator 实现统一接口，OpenAI 兼容接口可接入 DashScope/OpenRouter/Fireworks AI
- 频道系统基于 ACP (Agent Client Protocol) 协议桥接，扩展新频道需继承 ChannelBase
- 扩展系统兼容 Claude 和 Gemini 插件格式
- 核心类 GeminiClient/GeminiChat 保留 Gemini 命名但已通过 ContentGenerator 支持多 Provider
- Config 类 2325 行，承担过多职责，可能需要拆分
- SDK 通过 ProcessTransport 子进程通信，非直接调用 Core
- Hook 在子进程中执行，提供安全隔离但增加延迟