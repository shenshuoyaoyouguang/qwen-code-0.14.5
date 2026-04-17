# Testing Conventions

> Naming, structure, and organization for tests.

---

## Overview

Document your testing conventions here.

---

## Naming

- Test files: `*.test.ts` or `*.test.tsx`
- Describe: "it should [behavior]"
- Arrange-Act-Assert pattern

---

## Structure

```typescript
describe('FeatureName', () => {
  describe('methodName', () => {
    it('should do X when Y', () => {
      // Arrange
      const input = createInput();

      // Act
      const result = method(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```
