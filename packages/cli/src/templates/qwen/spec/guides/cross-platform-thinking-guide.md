# Cross-Platform Thinking Guide

> **Purpose**: Catch platform-specific assumptions before they become bugs.

---

## Why This Matters

**Most cross-platform bugs come from implicit assumptions**:

- Assumed shebang works → breaks on Windows
- Assumed `/` path separator → breaks on Windows
- Assumed `\n` line endings → inconsistent behavior
- Assumed command availability → `grep` vs `findstr`

---

## Platform Differences Checklist

### 1. Script Execution

| Assumption                         | macOS/Linux         | Windows              |
| ---------------------------------- | ------------------- | -------------------- |
| Shebang (`#!/usr/bin/env python3`) | ✅ Works            | ❌ Ignored           |
| Direct execution (`./script.py`)   | ✅ Works            | ❌ Fails             |
| `python3` command                  | ✅ Always available | ⚠️ May need `python` |

**Rule 1**: Always use explicit `python3` in documentation, help text, and error messages.

```python
# BAD - Assumes shebang works
print("Usage: ./script.py <args>")

# GOOD - Explicit interpreter
print("Usage: python3 script.py <args>")
```

### 2. Path Handling

| Assumption    | macOS/Linux    | Windows            |
| ------------- | -------------- | ------------------ |
| `/` separator | ✅ Works       | ⚠️ Sometimes works |
| `\` separator | ❌ Escape char | ✅ Native          |

**Rule**: Use `pathlib.Path` for all path operations in Python.

```python
# BAD - String concatenation
path = base + "/" + filename

# GOOD - pathlib
from pathlib import Path
path = Path(base) / filename
```

For TypeScript, always use `path.join()`:

```typescript
// BAD
const fullPath = baseDir + '/' + filename;

// GOOD
import * as path from 'node:path';
const fullPath = path.join(baseDir, filename);
```

### 3. Line Endings

| Format        | macOS/Linux   | Windows       | Git           |
| ------------- | ------------- | ------------- | ------------- |
| `\n` (LF)     | ✅ Native     | ⚠️ Some tools | ✅ Normalized |
| `\r\n` (CRLF) | ⚠️ Extra char | ✅ Native     | Converted     |

**Rule**: Use `.gitattributes` to enforce consistent line endings.

```gitattributes
* text=auto eol=lf
*.sh text eol=lf
*.py text eol=lf
```

### 4. File Encoding

| Default Encoding | macOS/Linux | Windows             |
| ---------------- | ----------- | ------------------- |
| Terminal         | UTF-8       | Often CP1252 or GBK |
| File I/O         | UTF-8       | System locale       |

**Rule**: Always explicitly specify `encoding="utf-8"` and use `errors="replace"`.

```python
# BAD - Relies on system default
with open(file, "r") as f:
    content = f.read()

# GOOD - Explicit encoding with error handling
with open(file, "r", encoding="utf-8", errors="replace") as f:
    content = f.read()
```

### 5. External Tool API Contracts

When integrating with external tools, their API contracts are **implicit assumptions**.

**Rule**: Verify API formats from official documentation, don't guess.

```python
# BAD - Guessed format
output = {"continue": True, "message": "..."}

# GOOD - Verified format
output = {
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": "..."
    }
}
```

---

## Pre-Commit Checklist

Before committing cross-platform code:

- [ ] All Python invocations use `python3` explicitly (docs) or `sys.executable` (code)
- [ ] All TypeScript paths use `path.join()`
- [ ] No hardcoded path separators (`/` or `\`)
- [ ] All file I/O specifies `encoding="utf-8"` and `errors="replace"`
- [ ] External tool API formats verified from documentation
- [ ] Documentation matches code behavior

---

**Core Principle**: If it's not explicit, it's an assumption. And assumptions break.
