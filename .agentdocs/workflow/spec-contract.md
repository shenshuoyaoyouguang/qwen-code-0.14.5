# Qwen Code 分层规范系统目录契约建议

> 创建时间：2026-04-17
> 背景：为 Phase 2 引入 `.qwen/spec/**/*.md` 分层规范系统提供目录契约、职责边界和文件格式模板
> 参考实现：
>
> - `D:\xiaoxiao\2026.4.16\Trellis-main\packages\cli\src\templates\markdown\spec\`
> - `D:\xiaoxiao\2026.4.16\Trellis-main\.trellis\spec\`
> - `D:\xiaoxiao\2026.4.16\qwen-code-0.14.5\packages\core\src\utils\memoryDiscovery.ts`
> - `D:\xiaoxiao\2026.4.16\qwen-code-0.14.5\packages\core\src\tools\memoryTool.ts`

---

## 一、Trellis 规范模板结构分析

### 1.1 观察到的总体结构模式

Trellis 的规范系统呈现出非常稳定的"三层结构"：

```text
spec/
├── guides/                  # 跨领域思维指导
│   ├── index.md
│   ├── code-reuse-thinking-guide.md
│   ├── cross-layer-thinking-guide.md
│   └── cross-platform-thinking-guide.md
├── <scope>/                 # 某一业务域 / 技术域 / 包级域
│   ├── index.md
│   ├── directory-structure.md
│   ├── quality-guidelines.md
│   └── ...
└── <package>/<subscope>/    # monorepo 下的包级再分层
    ├── index.md
    └── *.md
```

典型样例：

- 模板目录：
  - `Trellis-main/packages/cli/src/templates/markdown/spec/backend/index.md`
  - `Trellis-main/packages/cli/src/templates/markdown/spec/backend/directory-structure.md`
  - `Trellis-main/packages/cli/src/templates/markdown/spec/guides/code-reuse-thinking-guide.md`
  - `Trellis-main/packages/cli/src/templates/markdown/spec/guides/cross-platform-thinking-guide.md`

- 实际项目目录：
  - `Trellis-main/.trellis/spec/cli/backend/index.md`
  - `Trellis-main/.trellis/spec/cli/unit-test/index.md`
  - `Trellis-main/.trellis/spec/docs-site/docs/index.md`
  - `Trellis-main/.trellis/spec/guides/index.md`

### 1.2 Trellis 的关键结构规律

#### 规律 A：每个"可独立阅读的目录"通常都带 `index.md`

`index.md` 在 Trellis 中不是普通文件，而是该目录的入口文件，承担以下语义：

1. 定义该目录的主题范围
2. 列出子文件索引
3. 提供"何时阅读这些文档"的导航
4. 在部分场景承担"快速检查表"角色

结论：`index.md` 应视为目录级入口说明，而不是一般内容文件。

#### 规律 B：正文按单一主题拆分，避免巨型总规范

Trellis 不倾向于把所有规范堆到一个大文件，而是拆成：

- `directory-structure.md`
- `script-conventions.md`
- `quality-guidelines.md`
- `logging-guidelines.md`
- `error-handling.md`

这种拆分非常适合按需加载，也有利于后续仅注入"相关规范"。

#### 规律 C：存在"横向 guides"和"纵向 domain/package"两套体系

Trellis 同时维护两类规范：

1. 横向通用思维类：`guides/*.md`，用于所有任务的思维提醒
2. 纵向领域/模块类：`backend/*.md`、`frontend/*.md`、`cli/backend/*.md` 等

这说明规范系统天然支持"全局通用 + 局部针对"的组合式加载。

#### 规律 D：monorepo 通过"包名作为一级目录"实现隔离

在 `.trellis/spec/` 的真实项目中，monorepo 结构不是把所有规范扁平堆在根下，而是：

```text
spec/
├── guides/
├── cli/
│   ├── backend/
│   └── unit-test/
└── docs-site/
    └── docs/
```

#### 规律 E：文件名稳定、语义清晰、统一 kebab-case

观察到的命名模式：`index.md`、`directory-structure.md`、`quality-guidelines.md` 等。

Trellis 倾向于：

- 文件名直接表达主题
- 使用小写 kebab-case
- 不带编号前缀
- 不依赖文件名中的排序号，而依赖 `index.md` 和加载器规则确定顺序

### 1.3 对 Qwen Code 可迁移的核心启发

Trellis 提供的不是"固定内容模板"，而是一个稳定的目录契约：

1. `index.md` 是目录入口
2. `guides/` 是通用思维层
3. 领域规范按子目录组织
4. monorepo 用包名做一级隔离
5. 文件粒度细，便于按需注入
6. 加载顺序可通过"入口优先、正文后置"实现

---

## 二、推荐 `.qwen/spec/` 目录契约

### 2.1 推荐目录层级结构

```text
.qwen/
├── rules.md                    # 兼容旧入口，可选
└── spec/
    ├── guides/
    │   ├── index.md
    │   ├── code-reuse-thinking-guide.md
    │   ├── cross-layer-thinking-guide.md
    │   └── cross-platform-thinking-guide.md
    ├── backend/
    │   ├── index.md
    │   ├── directory-structure.md
    │   ├── quality-guidelines.md
    │   ├── error-handling.md
    │   └── logging-guidelines.md
    ├── frontend/
    │   ├── index.md
    │   ├── component-guidelines.md
    │   ├── state-management.md
    │   └── type-safety.md
    ├── testing/
    │   ├── index.md
    │   ├── conventions.md
    │   └── integration-patterns.md
    └── packages/               # monorepo 推荐容器目录
        └── <package-name>/
            ├── index.md
            ├── backend/
            │   ├── index.md
            │   └── *.md
            ├── frontend/
            │   ├── index.md
            │   └── *.md
            └── testing/
                ├── index.md
                └── *.md
```

### 2.2 为什么推荐 `packages/<package-name>/`

建议增加一层 `packages/` 容器目录，原因：

1. 更清晰地区分"全局领域目录"和"包级目录"
2. 减少一级目录命名冲突（包名可能与 `backend`、`frontend` 等保留域冲突）
3. 更利于 `specLoader.ts` 做稳定分类
4. 对 Windows 路径处理更安全

### 2.3 `.qwen/spec/` 一级保留目录

| 目录        | 用途                  |
| ----------- | --------------------- |
| `guides/`   | 通用思维类规范        |
| `backend/`  | 项目级后端规范        |
| `frontend/` | 项目级前端规范        |
| `testing/`  | 项目级测试规范        |
| `packages/` | monorepo 包级规范容器 |

可扩展：`docs/`、`infra/`、`security/`。

### 2.4 `index.md` 的语义规则

1. **定义目录边界**：本目录覆盖什么、什么时候应阅读
2. **不复制子文件全文**：做摘要与导航，而非总汇编
3. **优先加载**：若存在，必须优先于同目录其他文件加载
4. **无 `index.md` 时可扫描**：目录仍可被扫描，按文件名稳定排序
5. **可独立阅读**：即使其他子文件未被加载，`index.md` 也应表达核心边界

### 2.5 文件命名规范

- 目录：全小写 kebab-case，不含 Windows 保留字符
- 文件：`.md`，kebab-case，`index.md` 为唯一保留文件名
- 不建议：`01-overview.md`（序号前缀）
- 推荐：`overview.md`

### 2.6 加载优先级规则

#### 总顺序

1. `QWEN.md` / `AGENTS.md` — 现有 `memoryDiscovery.ts` 负责
2. `.qwen/rules.md` — 兼容旧规范入口
3. `.qwen/spec/guides/index.md`
4. `.qwen/spec/guides/*.md`（除 `index.md`）
5. 命中领域目录的 `index.md`
6. 命中领域目录的其他 `.md`
7. 命中包级目录的 `index.md`
8. 命中包级子域目录的 `index.md`
9. 命中包级子域目录的其他 `.md`

#### 同目录内部顺序

1. `index.md`
2. 其他 `.md` 文件按文件名升序排序

#### 多目录间顺序

1. 通用层：`guides`
2. 项目级领域层：`backend` / `frontend` / `testing` / `docs` / `infra`
3. 包级层：`packages/<pkg>/...`

理由：从"广"到"窄"，符合上下文收敛规律。

### 2.7 任务相关命中规则

#### 规则 A：按任务 `package` 命中包级目录

若任务 `package=core`，优先命中 `.qwen/spec/packages/core/`

#### 规则 B：按任务 `dev_type` 命中领域目录

- `backend` → `spec/backend/`
- `frontend` → `spec/frontend/`
- `fullstack` → `spec/backend/` + `spec/frontend/`
- `test` / `qa` → `spec/testing/`

#### 规则 C：按任务 `tags` 做弱匹配补充

第一版只匹配"与一级目录名完全相同"的 tag。

#### 规则 D：永远先加载 `guides/`

`guides/` 是全局思维引导层，不依赖任务字段，应始终优先注入。

### 2.8 Windows 兼容要求

1. 只依赖普通目录和 `.md` 文件
2. 路径拼接必须使用 Node `path.join`
3. 目录名和文件名不得使用 Windows 非法字符：`< > : " / \ | ? *`
4. 不依赖软链接
5. 不依赖大小写敏感文件系统
6. 排序逻辑必须显式，不依赖底层文件系统返回顺序

---

## 三、与现有规范的边界划分

### 3.1 三类规范入口的职责定义

| 入口                 | 职责                         | 适合放什么                             |
| -------------------- | ---------------------------- | -------------------------------------- |
| `QWEN.md`            | 项目顶层长期上下文           | 项目目标、团队约束、运行方式、协作规则 |
| `.qwen/rules.md`     | 项目级规范兼容入口           | 历史遗留单文件规范、尚未迁移的规则     |
| `.qwen/spec/**/*.md` | 结构化、可组合的项目规范体系 | 领域规范、包级规范、思维指南           |

### 3.2 边界原则

- `QWEN.md` 不承载大量细粒度技术规范（否则与 `spec/` 重叠）
- `.qwen/rules.md` 只做过渡兼容或总览摘要，不作为未来主入口
- 具体领域规则优先落到 `.qwen/spec/**/*.md`
- `QWEN.md` 与 `.qwen/spec/` 是并行层，不互相替代

### 3.3 推荐的职责分布示例

| 场景                     | 放置位置                                    |
| ------------------------ | ------------------------------------------- |
| 项目全局协作规则         | `QWEN.md`                                   |
| 后端代码结构规范         | `.qwen/spec/backend/directory-structure.md` |
| 测试命名约定             | `.qwen/spec/testing/conventions.md`         |
| core 包特有服务边界      | `.qwen/spec/packages/core/backend/index.md` |
| 旧项目尚未拆分的历史规范 | `.qwen/rules.md`（过渡兼容）                |

### 3.4 推荐的注入边界

运行时注入的职责链：

1. `memoryDiscovery.ts` — 负责 `QWEN.md` / `AGENTS.md`
2. `specLoader.ts` — 负责 `.qwen/rules.md` + `.qwen/spec/**/*.md`
3. Hook / SessionStart 聚合层 — 负责 task context + journal summary + spec content → `additionalContext`

---

## 四、规范文件格式模板

### 4.1 `index.md` 模板

```md
# [目录主题名称]

> 作用范围：[说明本目录覆盖的边界]
> 适用场景：[说明什么时候应阅读本目录]
> 优先级：高 / 中 / 低

---

## 目录说明

[用 2-5 行说明该目录要解决什么问题]

---

## 文件索引

| 文件               | 主题       | 何时使用   |
| ------------------ | ---------- | ---------- |
| [xxx.md](./xxx.md) | [主题摘要] | [使用场景] |

---

## 本目录核心规则摘要

- [规则 1]
- [规则 2]
- [规则 3]
```

### 4.2 普通规范文件模板

```md
# [规范标题]

> 作用范围：[文件适用的范围]
> 适用对象：[backend / frontend / testing / package-specific / all]

---

## 背景

[说明为什么有这份规范]

---

## 必须遵守

- [明确规则 1]
- [明确规则 2]

---

## 推荐做法

- [推荐做法 1]

---

## 禁止做法

- [禁止做法 1]

---

## 典型示例

### 正例

[描述正确做法]

### 反例

[描述错误做法]
```

### 4.3 包级规范入口模板

```md
# [包名] 包级规范

> 包名：[package name]
> 作用范围：`.qwen/spec/packages/[package-name]/**`

---

## 包定位

[说明该包在 monorepo 中的职责]

---

## 本包必须优先遵守的约束

- [约束 1]
- [约束 2]

---

## 子域索引

| 目录        | 说明   |
| ----------- | ------ |
| `backend/`  | [说明] |
| `frontend/` | [说明] |

---

## 与项目级规范的关系

先遵守项目级通用规范。如本包规范更具体，则本包规范优先。
```

### 4.4 `specLoader.ts` 可依赖的最小格式假设

1. 文件为 UTF-8 Markdown 文本
2. 文件名和目录名提供主题语义
3. `index.md` 为目录入口
4. **不要求**解析 YAML frontmatter
5. **不要求**解析自定义 DSL
6. **不要求**解析复杂表格结构

只需：发现文件 → 稳定排序 → 读取文本 → 为提示词拼接来源标记

### 4.5 推荐的规范格式化输出模型

```text
--- Spec: .qwen/spec/backend/index.md ---
[文件正文]
--- End Spec: .qwen/spec/backend/index.md ---
```

若是兼容旧入口：

```text
--- Spec: .qwen/rules.md ---
[文件正文]
--- End Spec: .qwen/rules.md ---
```

好处：

- 与现有 `memoryDiscovery.ts` 的 "Context from:" 风格相近
- 便于调试命中结果
- 便于未来做截断和来源追踪
- 不需要额外依赖 Markdown AST 解析

---

## 五、最终契约结论

### 5.1 推荐主契约

1. `.qwen/spec/` 是分层规范主入口
2. `.qwen/spec/guides/` 为全局思维层
3. `.qwen/spec/backend/`、`.qwen/spec/frontend/`、`.qwen/spec/testing/` 为项目级领域层
4. `.qwen/spec/packages/<package-name>/` 为包级规范层
5. 每个目录可有 `index.md` 作为目录入口
6. 同目录内 `index.md` 优先于其他文件
7. `.qwen/rules.md` 继续作为兼容旧入口
8. `QWEN.md` 继续承担顶层长期上下文，不并入 spec tree
9. 所有路径与文件名设计必须遵守 Windows 兼容约束
10. 第一版 `specLoader.ts` 应只做"发现、排序、筛选、拼接"，不做复杂语义解析

### 5.2 推荐加载优先级

```
QWEN.md / AGENTS.md         -> 现有 memoryDiscovery.ts
.qwen/rules.md              -> specLoader 兼容入口
.qwen/spec/guides/**        -> 全局思维层
.qwen/spec/<domain>/**      -> 项目级领域层
.qwen/spec/packages/**      -> 包级局部层
```

### 5.3 推荐冲突处理原则

1. 包级规范优先于项目级同主题规范
2. 项目级领域规范优先于 guides 的泛化建议
3. `rules.md` 仅作兼容入口，不自动覆盖更具体的 spec 文件
4. 若存在显式冲突，应在文档中用文字声明覆盖关系

---

## 六、后续实现建议

### 6.1 `specLoader.ts` 实现边界

只负责：

- 发现 `.qwen/rules.md`
- 发现 `.qwen/spec/**/*.md`
- 根据任务上下文筛选目录
- 稳定排序
- 文本格式化输出

**不负责**：

- 读取 `QWEN.md`
- 处理 hook 协议
- 解析 journal
- 修改任何文件

### 6.2 第一版最小可用范围

先支持：

- `.qwen/rules.md`
- `.qwen/spec/guides/**`
- `.qwen/spec/backend/**`
- `.qwen/spec/frontend/**`
- `.qwen/spec/testing/**`
- `.qwen/spec/packages/<package-name>/**`

**暂不做**：

- 模糊语义匹配
- frontmatter 元数据解析
- 目录继承链 DSL
- 远程模板元信息
