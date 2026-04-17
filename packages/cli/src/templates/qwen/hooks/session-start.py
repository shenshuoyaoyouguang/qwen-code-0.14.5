#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Qwen Code Session Start Hook - Inject Trellis context into Qwen Code sessions.

Output format follows Qwen Code hook protocol:
  stdout JSON -> { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "..." } }

Adapted from Trellis session-start.py for Qwen Code.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


def should_skip_injection() -> bool:
    """Check if we should skip context injection."""
    return os.environ.get("QWEN_NON_INTERACTIVE") == "1"


def read_file(path: Path, fallback: str = "") -> str:
    """Read file content with fallback."""
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError, OSError):
        return fallback


def run_python_script(script_path: Path, cwd: Path | None = None) -> str:
    """Run a Python script and capture output."""
    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        cmd = [sys.executable, "-W", "ignore", str(script_path)]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            cwd=str(cwd or script_path.parent),
            env=env,
        )
        return result.stdout if result.returncode == 0 else ""
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError, OSError):
        return ""


def get_project_root() -> Path:
    """Get the project root directory (cwd of the running process)."""
    return Path.cwd()


def get_trellis_dir(root: Path) -> Path | None:
    """Get the Trellis directory if it exists."""
    trellis_dir = root / ".trellis"
    if trellis_dir.exists():
        return trellis_dir
    qwen_dir = root / ".qwen"
    if qwen_dir.exists():
        return qwen_dir
    return None


def read_active_task(tasks_dir: Path) -> dict | None:
    """Read the currently active task from the tasks index."""
    index_path = tasks_dir / "index.json"
    if not index_path.exists():
        return None
    try:
        index_data = json.loads(index_path.read_text(encoding="utf-8"))
        active_id = index_data.get("active_task_id")
        if active_id:
            task_file = tasks_dir / f"TASK-{active_id}.json"
            if task_file.exists():
                return json.loads(task_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, KeyError, OSError):
        pass
    return None


def list_active_tasks(tasks_dir: Path) -> list[dict]:
    """List all in-progress tasks."""
    index_path = tasks_dir / "index.json"
    if not index_path.exists():
        return []
    try:
        index_data = json.loads(index_path.read_text(encoding="utf-8"))
        tasks = []
        for task_id, rel_path in index_data.get("tasks", {}).items():
            task_file = tasks_dir / rel_path
            if task_file.exists():
                try:
                    task = json.loads(task_file.read_text(encoding="utf-8"))
                    if task.get("status") in ("in_progress", "planning"):
                        tasks.append(task)
                except (json.JSONDecodeError, OSError):
                    continue
        return tasks
    except (json.JSONDecodeError, KeyError, OSError):
        return []


def read_recent_journal(task_id: str, tasks_dir: Path, limit: int = 3) -> str:
    """Read recent journal entries for a task."""
    journal_dir = tasks_dir.parent / f".task-{task_id}"
    if not journal_dir.exists():
        return "(no journal)"
    try:
        entries = sorted(journal_dir.glob("journal-*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
        recent = entries[:limit]
        if not recent:
            return "(no journal entries)"
        sections = []
        for entry in recent:
            content = entry.read_text(encoding="utf-8", errors="replace")
            lines = content.split("\n")
            summary = "\n".join(lines[:10])
            sections.append(f"### {entry.name}\n\n{summary}\n")
        return "\n".join(sections)
    except (OSError, PermissionError):
        return "(cannot read journal)"


def load_relevant_specs(project_root: Path, task: dict | None = None) -> str:
    """Load relevant spec files based on task context."""
    qwen_dir = project_root / ".qwen"
    spec_dir = qwen_dir / "spec"
    if not spec_dir.exists():
        return ""
    sections = []
    guides_index = spec_dir / "guides" / "index.md"
    if guides_index.exists():
        sections.append(f"## Project Guides\n\n{read_file(guides_index)}")
    if task:
        dev_type = task.get("dev_type", "")
        scope = task.get("scope", "")
        domains = []
        if dev_type:
            domains.append(dev_type)
        if scope and scope not in domains:
            domains.append(scope)
        for domain in domains:
            domain_dir = spec_dir / domain
            if domain_dir.exists():
                index_file = domain_dir / "index.md"
                if index_file.exists():
                    sections.append(f"## {domain.title()} Guidelines\n\n{read_file(index_file)}")
    if not sections:
        return ""
    return "\n\n".join(sections)


def format_task_section(task: dict | None, tasks_dir: Path) -> str:
    """Format current task section."""
    if not task:
        return "## Current Task\n\n(none)\n"
    task_id = task.get("id", "unknown")
    title = task.get("title", task.get("name", "Untitled"))
    status = task.get("status", "unknown")
    priority = task.get("priority", "P2")
    description = task.get("description", "")[:200]
    lines = [
        "## Current Task\n",
        f"- **ID**: `{task_id}`",
        f"- **Title**: {title}",
        f"- **Status**: {status}",
        f"- **Priority**: {priority}",
    ]
    if description:
        lines.append(f"- **Description**: {description}")
    return "\n".join(lines) + "\n"


def format_active_tasks_section(tasks: list[dict]) -> str:
    """Format active tasks list section."""
    if not tasks:
        return "## Active Tasks\n\n(none)\n"
    lines = ["## Active Tasks\n"]
    for task in tasks[:5]:
        task_id = task.get("id", "?")
        title = task.get("title", task.get("name", "Untitled"))
        status = task.get("status", "?")
        priority = task.get("priority", "P2")
        lines.append(f"- `{task_id}` [{status}] {priority} - {title}")
    return "\n".join(lines) + "\n"


def build_context() -> str:
    """Build the Trellis context string."""
    root = get_project_root()
    trellis_dir = get_trellis_dir(root)
    if not trellis_dir:
        return ""
    sections = []
    tasks_dir = trellis_dir / "tasks"
    if tasks_dir.exists():
        active_task = read_active_task(tasks_dir)
        sections.append(format_task_section(active_task, tasks_dir))
        active_tasks = list_active_tasks(tasks_dir)
        sections.append(format_active_tasks_section(active_tasks))
        if active_task and active_task.get("id"):
            journal_summary = read_recent_journal(active_task["id"], tasks_dir, limit=2)
            sections.append(f"## Recent Journal\n\n{journal_summary}\n")
    specs = load_relevant_specs(root, active_task)
    if specs:
        sections.append(f"## Project Specifications\n\n{specs}\n")
    sections.append(
        "## Quick Reference\n\n"
        "- Run `/task list` to see all tasks\n"
        "- Run `/task start <id>` to start a task\n"
        "- Read `.qwen/spec/guides/index.md` for project guidelines\n"
    )
    return "\n".join(sections)


def main():
    """Main entry point."""
    if should_skip_injection():
        sys.exit(0)
    context = build_context()
    if not context:
        sys.exit(0)
    output = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        }
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
