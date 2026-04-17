/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SpecTemplate } from './initSpecTemplates.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface PlanResult {
  /** Files that do not yet exist and will be created. */
  toCreate: string[];
  /** Existing files whose content differs and will be overwritten. */
  toOverwrite: string[];
  /** Existing files whose content already matches — no action needed. */
  unchanged: string[];
  /** All files that would be modified (toCreate + toOverwrite). */
  conflicts: string[];
}

export interface ApplyResult {
  /** Number of new files created. */
  created: number;
  /** Number of existing files overwritten. */
  overwritten: number;
  /** Any errors that occurred during application. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Phase 1: plan
// ---------------------------------------------------------------------------

/**
 * Scans the target directory and classifies each template file into one of:
 * - toCreate     : file does not exist
 * - toOverwrite  : file exists and content differs
 * - unchanged    : file exists and content matches
 *
 * Does NOT write anything to disk.
 */
export function planScaffold(
  targetDir: string,
  templates: SpecTemplate[],
): PlanResult {
  const toCreate: string[] = [];
  const toOverwrite: string[] = [];
  const unchanged: string[] = [];

  for (const tmpl of templates) {
    const destPath = path.join(targetDir, '.qwen', 'spec', tmpl.relPath);

    if (!fs.existsSync(destPath)) {
      toCreate.push(tmpl.relPath);
    } else {
      // File exists — check content
      const existing = fs.readFileSync(destPath, 'utf8');
      if (existing === tmpl.content) {
        unchanged.push(tmpl.relPath);
      } else {
        toOverwrite.push(tmpl.relPath);
      }
    }
  }

  return {
    toCreate,
    toOverwrite,
    unchanged,
    conflicts: [...toCreate, ...toOverwrite],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates all ancestor directories for `destPath` if they do not already exist.
 * Silently succeeds if the directory already exists.
 */
function ensureParentDir(destPath: string): void {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Phase 2: apply
// ---------------------------------------------------------------------------

/**
 * Executes the scaffold plan by writing all `toCreate` and `toOverwrite`
 * files to `targetDir/.qwen/spec/`.
 *
 * - Idempotent: parent directories are created as needed.
 * - Does not touch `unchanged` files.
 * - Errors are collected and returned rather than thrown.
 */
export function applyScaffold(
  targetDir: string,
  plan: PlanResult,
  templates: SpecTemplate[],
): ApplyResult {
  const errors: string[] = [];
  let created = 0;
  let overwritten = 0;

  // Build a quick lookup: relPath -> content
  const contentMap = new Map(templates.map((t) => [t.relPath, t.content]));

  for (const relPath of [...plan.toCreate, ...plan.toOverwrite]) {
    const content = contentMap.get(relPath);
    if (content === undefined) {
      errors.push(`Template not found for: ${relPath}`);
      continue;
    }

    const destPath = path.join(targetDir, '.qwen', 'spec', relPath);

    try {
      ensureParentDir(destPath);
      fs.writeFileSync(destPath, content, 'utf8');

      if (plan.toCreate.includes(relPath)) {
        created++;
      } else {
        overwritten++;
      }
    } catch (err) {
      errors.push(
        `Failed to write ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { created, overwritten, errors };
}
