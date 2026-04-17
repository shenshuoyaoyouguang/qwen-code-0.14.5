/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Base directory for spec template files (relative to this source file).
 */
const TEMPLATES_BASE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../templates/qwen/spec',
);

/**
 * Converts a file URL to a platform-appropriate path string.
 * Safe for use in static initializers.
 */
function fileURLToPath(url: string): string {
  return url.startsWith('file://') ? url.slice(7) : url;
}

export interface SpecTemplate {
  /** Relative path within .qwen/spec/, e.g. "guides/index.md" */
  relPath: string;
  /** File content as a string */
  content: string;
}

/**
 * Reads the raw content of a single template file.
 * Throws if the file cannot be read.
 */
function readTemplate(relPath: string): string {
  const fullPath = path.join(TEMPLATES_BASE, relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

/** Minimal profile: 5 core files covering guides + backend. */
const MINIMAL_TEMPLATES: SpecTemplate[] = [
  { relPath: 'guides/index.md', content: readTemplate('guides/index.md') },
  {
    relPath: 'guides/code-reuse-thinking-guide.md',
    content: readTemplate('guides/code-reuse-thinking-guide.md'),
  },
  { relPath: 'backend/index.md', content: readTemplate('backend/index.md') },
  {
    relPath: 'backend/directory-structure.md',
    content: readTemplate('backend/directory-structure.md'),
  },
  {
    relPath: 'backend/quality-guidelines.md',
    content: readTemplate('backend/quality-guidelines.md'),
  },
];

/** Additional templates included only in the full profile. */
const FULL_EXTRA_TEMPLATES: SpecTemplate[] = [
  {
    relPath: 'guides/cross-platform-thinking-guide.md',
    content: readTemplate('guides/cross-platform-thinking-guide.md'),
  },
  { relPath: 'frontend/index.md', content: readTemplate('frontend/index.md') },
  {
    relPath: 'frontend/component-guidelines.md',
    content: readTemplate('frontend/component-guidelines.md'),
  },
  {
    relPath: 'frontend/state-management.md',
    content: readTemplate('frontend/state-management.md'),
  },
  {
    relPath: 'frontend/type-safety.md',
    content: readTemplate('frontend/type-safety.md'),
  },
  { relPath: 'testing/index.md', content: readTemplate('testing/index.md') },
  {
    relPath: 'testing/conventions.md',
    content: readTemplate('testing/conventions.md'),
  },
  {
    relPath: 'testing/integration-patterns.md',
    content: readTemplate('testing/integration-patterns.md'),
  },
  { relPath: 'packages/index.md', content: readTemplate('packages/index.md') },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the 5 minimal-profile spec templates. */
export function getMinimalTemplates(): SpecTemplate[] {
  return MINIMAL_TEMPLATES;
}

/** Returns the 9 extra templates added on top of minimal in the full profile. */
export function getFullExtraTemplates(): SpecTemplate[] {
  return FULL_EXTRA_TEMPLATES;
}

/** Returns minimal + full extra templates (all 14 files). */
export function getAllTemplates(): SpecTemplate[] {
  return [...MINIMAL_TEMPLATES, ...FULL_EXTRA_TEMPLATES];
}
