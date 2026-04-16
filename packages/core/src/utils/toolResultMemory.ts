/**
 * @license
 * Copyright 2025 Qwen Code
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part, PartListUnion } from '@google/genai';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentResultDisplay,
  ArtifactFileDiffResultDisplay,
  ArtifactResultDisplay,
  FileDiff,
  ToolArtifactRef,
  ToolResultDisplay,
} from '../tools/tools.js';

export interface ToolResultCompactionOptions {
  thresholdChars: number;
  thresholdLines: number;
  artifactDir?: string;
}

interface CompactedText {
  text: string;
  artifact?: ToolArtifactRef;
}

function countLines(text: string): number {
  return text.split('\n').length;
}

function createPreview(
  text: string,
  thresholdChars: number,
  thresholdLines: number,
): string {
  const lines = text.split('\n');
  if (text.length <= thresholdChars && lines.length <= thresholdLines) {
    return text;
  }

  const maxLines = Math.max(Math.min(thresholdLines, lines.length), 2);
  const headCount = Math.max(Math.floor(maxLines / 2), 1);
  const tailCount = Math.max(maxLines - headCount, 1);
  const head = lines.slice(0, headCount).join('\n');
  const tail = lines.slice(-tailCount).join('\n');
  const joined = `${head}\n...\n${tail}`;

  if (joined.length <= thresholdChars) {
    return joined;
  }

  return `${joined.slice(0, Math.max(thresholdChars - 3, 0))}...`;
}

function createPrimaryContentPreview(
  text: string,
  thresholdChars: number,
  thresholdLines: number,
): string {
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return '';
  }

  const selected: string[] = [];
  let usedChars = 0;

  for (const line of lines) {
    if (selected.length >= thresholdLines) {
      break;
    }
    const nextLength = usedChars + line.length + (selected.length > 0 ? 1 : 0);
    if (nextLength > thresholdChars) {
      const remaining = Math.max(
        thresholdChars - usedChars - (selected.length > 0 ? 1 : 0) - 3,
        0,
      );
      if (remaining > 0) {
        selected.push(`${line.slice(0, remaining)}...`);
      }
      break;
    }
    selected.push(line);
    usedChars = nextLength;
  }

  return selected.join('\n');
}

function formatByteSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (sizeBytes >= 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${sizeBytes} B`;
}

function writeArtifact(
  text: string,
  kind: ToolArtifactRef['kind'],
  options: ToolResultCompactionOptions,
): ToolArtifactRef | undefined {
  if (!options.artifactDir) {
    return;
  }

  try {
    fs.mkdirSync(options.artifactDir, { recursive: true });
    const ext =
      kind === 'diff' || kind === 'original_content' || kind === 'new_content'
        ? '.diff'
        : '.txt';
    const filePath = path.join(
      options.artifactDir,
      `${kind}_${crypto.randomBytes(6).toString('hex')}${ext}`,
    );
    fs.writeFileSync(filePath, text, 'utf8');
    return {
      kind,
      path: filePath,
      sizeBytes: Buffer.byteLength(text, 'utf8'),
      preview: createPreview(
        text,
        options.thresholdChars,
        options.thresholdLines,
      ),
      encoding: 'utf8',
    };
  } catch {
    return;
  }
}

function compactLargeText(
  text: string,
  kind: ToolArtifactRef['kind'],
  label: string,
  options: ToolResultCompactionOptions,
): CompactedText {
  const tooLarge =
    text.length > options.thresholdChars ||
    countLines(text) > options.thresholdLines;

  if (!tooLarge) {
    return { text };
  }

  const artifact = writeArtifact(text, kind, options);
  const preview =
    artifact?.preview ??
    createPreview(text, options.thresholdChars, options.thresholdLines);
  const summaryLines = [
    `${label} was omitted from in-memory session history (${formatByteSize(Buffer.byteLength(text, 'utf8'))}).`,
  ];
  if (artifact) {
    summaryLines.push(`Artifact saved: ${artifact.path}`);
  }
  summaryLines.push('', preview);

  return {
    text: summaryLines.join('\n'),
    artifact,
  };
}

function isFileDiffDisplay(display: ToolResultDisplay): display is FileDiff {
  return (
    typeof display === 'object' && display !== null && 'fileDiff' in display
  );
}

function isArtifactDisplay(
  display: ToolResultDisplay,
): display is ArtifactResultDisplay {
  return (
    typeof display === 'object' &&
    display !== null &&
    'type' in display &&
    display.type === 'artifact_reference'
  );
}

function compactFileDiffDisplay(
  display: FileDiff,
  options: ToolResultCompactionOptions,
): ArtifactFileDiffResultDisplay | FileDiff {
  const totalLength =
    display.fileDiff.length +
    (display.originalContent?.length ?? 0) +
    display.newContent.length;

  if (
    totalLength <= options.thresholdChars &&
    countLines(display.fileDiff) <= options.thresholdLines
  ) {
    return display;
  }

  const artifacts: ToolArtifactRef[] = [];
  const diffArtifact = writeArtifact(display.fileDiff, 'diff', options);
  if (diffArtifact) artifacts.push(diffArtifact);
  if (display.originalContent) {
    const originalArtifact = writeArtifact(
      display.originalContent,
      'original_content',
      options,
    );
    if (originalArtifact) artifacts.push(originalArtifact);
  }
  const newContentArtifact = writeArtifact(
    display.newContent,
    'new_content',
    options,
  );
  if (newContentArtifact) artifacts.push(newContentArtifact);

  const preview =
    createPrimaryContentPreview(
      display.newContent,
      options.thresholdChars,
      options.thresholdLines,
    ) ||
    diffArtifact?.preview ||
    createPreview(
      display.fileDiff,
      options.thresholdChars,
      options.thresholdLines,
    );

  const stats: string[] = [];
  if (display.diffStat) {
    if (display.diffStat.model_added_lines > 0) {
      stats.push(`+${display.diffStat.model_added_lines} lines`);
    }
    if (display.diffStat.model_removed_lines > 0) {
      stats.push(`-${display.diffStat.model_removed_lines} lines`);
    }
  }

  return {
    type: 'artifact_reference',
    summary: `Updated ${display.fileName}${stats.length ? ` (${stats.join(', ')})` : ''}. Showing the main written content only.`,
    preview,
    artifacts,
    fileDiff: display.fileDiff,
    fileName: display.fileName,
    originalContent: display.originalContent,
    newContent: display.newContent,
    diffStat: display.diffStat,
  };
}

function compactAgentDisplay(
  display: AgentResultDisplay,
  options: ToolResultCompactionOptions,
): AgentResultDisplay | ArtifactResultDisplay {
  const artifacts: ToolArtifactRef[] = [...(display.artifacts ?? [])];
  let result = display.result;

  if (typeof result === 'string') {
    const compacted = compactLargeText(
      result,
      'task_result',
      'Subagent result',
      options,
    );
    result = compacted.text;
    if (compacted.artifact) {
      artifacts.push(compacted.artifact);
    }
  }

  const toolCalls = display.toolCalls?.map((toolCall) => {
    const next = { ...toolCall };
    if (typeof next.result === 'string') {
      next.result = compactLargeText(
        next.result,
        'tool_result',
        `Nested tool result for ${toolCall.name}`,
        options,
      ).text;
    }
    if (typeof next.resultDisplay === 'string') {
      next.resultDisplay = compactLargeText(
        next.resultDisplay,
        'tool_result',
        `Nested tool display for ${toolCall.name}`,
        options,
      ).text;
    }
    return next;
  });

  return {
    ...display,
    result,
    artifacts: artifacts.length > 0 ? artifacts : display.artifacts,
    toolCalls,
  };
}

export function compactToolResultDisplay(
  resultDisplay: ToolResultDisplay | undefined,
  options: ToolResultCompactionOptions,
): ToolResultDisplay | undefined {
  if (resultDisplay === undefined) {
    return undefined;
  }

  if (typeof resultDisplay === 'string') {
    const compacted = compactLargeText(
      resultDisplay,
      'tool_result',
      'Tool result',
      options,
    );
    if (!compacted.artifact) {
      return compacted.text;
    }
    return {
      type: 'artifact_reference',
      summary: 'Showing only the main tool output content.',
      preview:
        createPrimaryContentPreview(
          resultDisplay,
          options.thresholdChars,
          options.thresholdLines,
        ) || compacted.artifact.preview,
      artifacts: [compacted.artifact],
    };
  }

  if (isArtifactDisplay(resultDisplay)) {
    return resultDisplay;
  }

  if (isFileDiffDisplay(resultDisplay)) {
    return compactFileDiffDisplay(resultDisplay, options);
  }

  if (
    typeof resultDisplay === 'object' &&
    resultDisplay !== null &&
    'type' in resultDisplay &&
    resultDisplay.type === 'task_execution'
  ) {
    return compactAgentDisplay(resultDisplay as AgentResultDisplay, options);
  }

  return resultDisplay;
}

export function compactFunctionResponseParts(
  parts: Part[],
  options: ToolResultCompactionOptions,
): Part[] {
  return parts.map((part) => {
    if (!('functionResponse' in part) || !part.functionResponse) {
      return part;
    }

    const response = part.functionResponse.response as
      | Record<string, unknown>
      | undefined;
    const output = response?.['output'];
    if (typeof output !== 'string') {
      return part;
    }

    const compacted = compactLargeText(
      output,
      'function_output',
      `Tool output for ${part.functionResponse.name || 'tool'}`,
      options,
    );

    if (compacted.text === output) {
      return part;
    }

    return {
      ...part,
      functionResponse: {
        ...part.functionResponse,
        response: {
          ...(response ?? {}),
          output: compacted.text,
        },
      },
    };
  });
}

export function compactPartListUnion(
  value: PartListUnion,
  options: ToolResultCompactionOptions,
): PartListUnion {
  if (typeof value === 'string') {
    return compactLargeText(value, 'function_output', 'Tool output', options)
      .text;
  }

  const parts = Array.isArray(value) ? value : [value];
  return compactFunctionResponseParts(parts as Part[], options);
}
