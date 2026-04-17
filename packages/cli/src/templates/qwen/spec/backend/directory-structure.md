# Directory Structure

> How code is organized in this project.

---

## Overview

Describe your project's directory structure here. Replace this placeholder with your actual conventions.

---

## Recommended Structure (adjust to your project)

```
src/
├── cli/                 # CLI entry point
├── core/                # Core business logic
├── services/            # Service layer
├── tools/               # Tool implementations
├── types/               # TypeScript type definitions
└── utils/               # Shared utility functions
```

---

## Layer Responsibilities

| Layer    | Directory   | Responsibility                               |
| -------- | ----------- | -------------------------------------------- |
| CLI      | `cli/`      | Parse arguments, display help, call commands |
| Core     | `core/`     | Business logic, orchestration                |
| Services | `services/` | Service layer, external integrations         |
| Tools    | `tools/`    | Tool implementations                         |
| Types    | `types/`    | TypeScript type definitions                  |
| Utils    | `utils/`    | Reusable utility functions                   |

---

## Naming Conventions

### Files and Directories

| Convention             | Example          | Usage                |
| ---------------------- | ---------------- | -------------------- |
| `kebab-case`           | `file-writer.ts` | All TypeScript files |
| `PascalCase`           | `TaskService.ts` | TypeScript classes   |
| `SCREAMING_SNAKE_CASE` | `TOOL_NAME`      | Constants            |

---

## DO / DON'T

### DO

- Keep related files together (co-location)
- Use `kebab-case` for file and directory names
- Use `PascalCase` for TypeScript classes
- Keep files under 1000 lines (split if larger)

### DON'T

- Don't mix unrelated concerns in the same file
- Don't use camelCase for files
- Don't create deep nesting (> 3 levels)
- Don't duplicate code across files
