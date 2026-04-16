/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from '../i18n/index.js';

/**
 * 工具显示描述的本地化映射
 * 键为工具名称，值为 i18n 翻译键
 * 如果当前语言没有对应翻译，返回 undefined，调用方应 fallback 到原始英文描述
 */
const TOOL_DISPLAY_DESC_KEYS: Record<string, string> = {
  read_file: 'tool_desc:read_file',
  write_file: 'tool_desc:write_file',
  edit: 'tool_desc:edit',
  run_shell_command: 'tool_desc:run_shell_command',
  grep_search: 'tool_desc:grep_search',
  ripgrep_search: 'tool_desc:ripgrep_search',
  glob: 'tool_desc:glob',
  list_directory: 'tool_desc:list_directory',
  save_memory: 'tool_desc:save_memory',
  todo_write: 'tool_desc:todo_write',
  web_fetch: 'tool_desc:web_fetch',
  web_search: 'tool_desc:web_search',
  agent: 'tool_desc:agent',
  skill: 'tool_desc:skill',
  exit_plan_mode: 'tool_desc:exit_plan_mode',
  ask_user_question: 'tool_desc:ask_user_question',
  lsp: 'tool_desc:lsp',
  cron_create: 'tool_desc:cron_create',
  cron_list: 'tool_desc:cron_list',
  cron_delete: 'tool_desc:cron_delete',
};

/**
 * 获取工具的本地化显示描述
 * 如果当前语言没有对应翻译，返回 undefined，调用方应 fallback 到原始英文描述
 */
export function getToolDisplayDescription(
  toolName: string,
): string | undefined {
  const key = TOOL_DISPLAY_DESC_KEYS[toolName];
  if (!key) return undefined;
  const translation = t(key);
  // t() 在找不到翻译时返回 key 本身，此时应 fallback
  if (translation === key) return undefined;
  return translation;
}