# Component Guidelines

> Component design patterns and best practices.

---

## Overview

Document your component conventions here.

---

## Structure

```
src/components/
├── Button/
│   ├── Button.tsx
│   ├── Button.test.tsx
│   └── index.ts
```

---

## Props

- Always define explicit prop types
- Use `interface` not `type` for component props
- Document required vs optional props

```typescript
interface ButtonProps {
  /** Button label */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Visual variant */
  variant?: 'primary' | 'secondary';
  /** Disabled state */
  disabled?: boolean;
}
```
