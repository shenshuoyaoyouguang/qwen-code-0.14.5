# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

This document defines code quality standards. Update with your project's actual conventions.

---

## TypeScript Standards

### Required

- Enable strict mode in `tsconfig.json`
- Use explicit return types for public functions
- Handle all error cases explicitly
- Use `unknown` for untrusted external data, not `any`

### Recommended

```typescript
// GOOD - explicit types
async function getTask(id: string): Promise<Task | null> {
  // implementation
}

// GOOD - exhaustive switch handling
function handleStatus(status: TaskStatus): void {
  switch (status) {
    case 'planning':
      /* ... */ break;
    case 'in_progress':
      /* ... */ break;
    case 'completed':
      /* ... */ break;
    case 'blocked':
      /* ... */ break;
    // TypeScript ensures all cases handled
  }
}
```

---

## Error Handling

### DO

- Use typed errors where possible
- Log errors with sufficient context for debugging
- Handle errors at the appropriate level (don't swallow silently)

### DON'T

- Don't catch errors and do nothing
- Don't use `any` for error types
- Don't expose raw internal errors to users

---

## File Size

- **Target**: Under 500 lines per file
- **Maximum**: 1000 lines (hard limit)
- **Split trigger**: When a file exceeds its limit, split by responsibility

### Split Strategy

| Symptom                     | Action                         |
| --------------------------- | ------------------------------ |
| Single class over 500 lines | Split by method groups         |
| Many utility functions      | Extract to separate utils file |
| Complex type definitions    | Extract to separate types file |
| Long switch/if chains       | Extract to separate handlers   |

---

## Testing Standards

- Every public function has at least one test
- Error paths are tested explicitly
- Integration tests use real file system (not mocks where possible)

---

## Security

- Never log sensitive data (tokens, passwords)
- Validate all external input
- Use parameterized queries for database operations
- Follow principle of least privilege

---

## Performance

- Profile before optimizing
- Document any intentional trade-offs
- Use streaming for large file operations
- Set timeouts for all external calls
