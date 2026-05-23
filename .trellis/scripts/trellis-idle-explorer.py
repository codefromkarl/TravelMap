#!/usr/bin/env python3
"""Trellis Idle Explorer — 空闲时自动探索 + 实施 P0 架构改进。

放到任意项目的 .trellis/scripts/ 下即可使用。

Usage:
    python3 .trellis/scripts/trellis-idle-explorer.py --once --dry-run
    python3 .trellis/scripts/trellis-idle-explorer.py --interval 30m
    python3 .trellis/scripts/trellis-idle-explorer.py --interval 1h --cooldown 1d --max-runs 3
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Constants ────────────────────────────────────────────────────────────────

BUSY_STATUSES = {"in_progress", "review"}
EXCLUDED_TASK_IDS = {"trellis-idle-explorer"}
SKIP_DIRS = {"archive", "archives", "archived"}
DEFAULT_INTERVAL_S = 3600        # 1h
DEFAULT_COOLDOWN_S = 86400       # 24h
ZOMBIE_THRESHOLD_S = 7200        # 2h — auto-archive stuck tasks after this
RUNTIME_DIR = ".trellis/.runtime/idle-explorer"
STATE_FILE = os.path.join(RUNTIME_DIR, "state.json")
LOCK_FILE = os.path.join(RUNTIME_DIR, "lock")
DEFAULT_SKILL = os.path.expanduser(
    "~/.claude/skills-store/improve-codebase-architecture/SKILL.md"
)

# ── Duration parser ──────────────────────────────────────────────────────────

UNIT_MAP = {"ms": 0.001, "s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_duration(raw: str) -> float:
    """Parse '30m', '1h', '2d', '500ms' into seconds."""
    m = re.fullmatch(r"(\d+(?:\.\d+)?)(ms|s|m|h|d)?", raw.strip(), re.I)
    if not m:
        raise ValueError(f"Invalid duration: {raw}")
    val = float(m.group(1))
    unit = (m.group(2) or "s").lower()
    return val * UNIT_MAP[unit]


# ── Task scanning ────────────────────────────────────────────────────────────

def scan_tasks(repo_root: Path) -> list[dict]:
    """Read .trellis/tasks/*/task.json, skip archive/excluded."""
    tasks_dir = repo_root / ".trellis" / "tasks"
    if not tasks_dir.is_dir():
        return []
    results = []
    for entry in sorted(tasks_dir.iterdir()):
        if not entry.is_dir():
            continue
        name = entry.name.lower()
        if name in SKIP_DIRS or name.startswith("."):
            continue
        tj = entry / "task.json"
        if not tj.is_file():
            continue
        try:
            data = json.loads(tj.read_text("utf-8"))
        except Exception:
            continue
        tid = data.get("id", entry.name)
        if tid in EXCLUDED_TASK_IDS:
            continue
        results.append({
            "path": str(entry.relative_to(repo_root)),
            "id": tid,
            "title": data.get("title", ""),
            "status": data.get("status", "unknown"),
        })
    return results


def is_idle(tasks: list[dict]) -> tuple[bool, list[dict]]:
    busy = [t for t in tasks if t["status"] in BUSY_STATUSES]
    return len(busy) == 0, busy


def detect_zombies(repo_root: Path, tasks: list[dict], now: float, threshold_s: float) -> list[dict]:
    """Find in_progress tasks that have been stuck longer than threshold."""
    zombies = []
    for t in tasks:
        if t["status"] not in BUSY_STATUSES:
            continue
        task_dir = repo_root / t["path"]
        task_json = task_dir / "task.json"
        if not task_json.is_file():
            continue
        mtime = task_json.stat().st_mtime
        age_s = now - mtime
        if age_s > threshold_s:
            t["age_s"] = age_s
            zombies.append(t)
    return zombies


def auto_archive_zombies(repo_root: Path, zombies: list[dict]) -> list[str]:
    """Archive zombie tasks via task.py archive --no-commit. Returns archived names."""
    archived = []
    for t in zombies:
        task_name = t["path"].split("/")[-1]
        print(f"[idle-explorer] zombie detected: {task_name} (stuck {int(t['age_s'] // 3600)}h), auto-archiving...")
        try:
            result = subprocess.run(
                ["python3", "./.trellis/scripts/task.py", "archive", task_name, "--no-commit"],
                cwd=str(repo_root), capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0:
                print(f"[idle-explorer] archived: {task_name}")
                archived.append(task_name)
            else:
                print(f"[idle-explorer] archive failed for {task_name}: {result.stderr.strip()}")
        except Exception as e:
            print(f"[idle-explorer] archive error for {task_name}: {e}")
    return archived


# ── State / Cooldown / Lock ─────────────────────────────────────────────────

def read_state(repo_root: Path) -> dict:
    p = repo_root / STATE_FILE
    if not p.is_file():
        return {}
    try:
        return json.loads(p.read_text("utf-8"))
    except Exception:
        return {}


def write_state(repo_root: Path, state: dict) -> None:
    p = repo_root / STATE_FILE
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2) + "\n", "utf-8")
    tmp.rename(p)


def check_cooldown(state: dict, now: float, cooldown_s: float) -> tuple[bool, float]:
    """Return (allowed, remaining_s)."""
    last = state.get("lastTriggeredAt")
    if not last:
        return True, 0.0
    try:
        last_ts = datetime.fromisoformat(last).timestamp()
    except Exception:
        return True, 0.0
    elapsed = now - last_ts
    if elapsed >= cooldown_s:
        return True, 0.0
    return False, cooldown_s - elapsed


def acquire_lock(repo_root: Path) -> tuple[bool, object]:
    """Try to acquire exclusive lock. Return (acquired, release_fn_or_reason)."""
    lf = repo_root / LOCK_FILE
    lf.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(str(lf), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return False, f"lock already exists: {lf}"
    except Exception as e:
        return False, str(e)
    os.write(fd, f"{os.getpid()}\n{datetime.now(timezone.utc).isoformat()}\n".encode())
    os.close(fd)
    def release():
        lf.unlink(missing_ok=True)
    return True, release


# ── Prompt builder ───────────────────────────────────────────────────────────

def build_prompt(repo_root: Path) -> str:
    rr = str(repo_root)
    return f"""You are running a safe Trellis idle exploration + auto-implementation pass for repository: {rr}.

## CRITICAL: Session lifecycle

You MUST complete ALL phases before your session ends. Do NOT exit early.
- After dispatching a subagent, WAIT for it to finish. Do not assume it succeeded.
- After subagent completes, YOU run the archive command yourself.
- If any step fails, log the failure and continue to the next candidate.
- At the end, output a final summary of what was done.

## Scope (STRICT \u2014 never violate)

ONLY these four categories are in scope:
1. **Historical debt cleanup** \u2014 remove dead code, deduplicate patterns, extract shared utilities
2. **Architecture standardization** \u2014 align modules to proper depth/seam/adapter patterns per improve-codebase-architecture
3. **Performance optimization** \u2014 reduce unnecessary allocations, cache misses, redundant calls
4. **Security hardening** \u2014 fix unsafe patterns, input validation, secret handling, dependency risks

OUT OF SCOPE (never touch):
- Business logic, feature behavior, user-facing functionality
- API contracts, request/response shapes, tool schemas
- Agent prompts, LLM interaction flow, output formatting
- UI components, routes, pages, styling
- Test expectations (may refactor test infra, not assertions)

If a candidate touches anything out of scope, demote it to P1+ for user review \u2014 never auto-implement.

## Phase 1: Explore

Use skill:improve-codebase-architecture explicitly. Follow its vocabulary and constraints:
- Use the architecture terms Module, Interface, Depth, Seam, Adapter, Leverage, and Locality.
- Explore and identify deepening opportunities in the existing codebase.

Dispatch ONE trellis-research subagent to inspect the codebase and existing Trellis specs.
WAIT for the subagent to complete before continuing.
Persist ALL findings into the task's research/ directory.
Synthesize into a ranked list of deepening opportunities with evidence paths.
Classify each as P0 (trivial/low-risk, high leverage), P1 (medium), P2 (high effort), or P3 (design decision).

## Phase 2: Auto-implement P0 candidates (max 3 per session)

Process at most 3 P0 candidates to avoid session timeout.
For EACH P0 candidate that is strictly within scope (debt/arch/perf/security only):

1. Create a Trellis task:
   python3 ./.trellis/scripts/task.py create "arch-auto: <short title>" --slug arch-auto-<slug>
2. Write a prd.md with:
   - Category: debt / arch / perf / security
   - What to change and why (reference evidence paths)
   - Acceptance criteria (lint, typecheck, tests pass)
   - Scope: only the specific files mentioned
   - Explicit statement: "No functional changes"
3. Start the task:
   python3 ./.trellis/scripts/task.py start <task-dir>
4. Dispatch the trellis-implement subagent to execute the code change.
5. WAIT for the subagent to complete. Do not proceed until it finishes.
6. After implementation, dispatch the trellis-check subagent to verify quality.
7. WAIT for the check subagent to complete.
8. YOU run the archive command directly (do NOT rely on subagent):
   python3 ./.trellis/scripts/task.py archive <task-dir> --no-commit
9. If archive fails (e.g. merge conflict), leave the task in_progress and note it in your report.

## Phase 3: Report

Output a summary:
- P0 tasks implemented and archived (category + what changed)
- P1/P2/P3 candidates left for user decision
- Any implementation failures that need manual review

## Safety

- Local git commits are allowed (needed for Trellis task workflow).
- Never git push to remote.
- Never deploy or run deploy scripts.
- Never run browser automation.
- Only modify code within the specific files identified in P0 candidates.
- If uncertain whether a change affects functionality, skip it and report as P1 instead."""


def build_pi_command(skill_path: str, prompt: str, model: str = "cpa/gpt") -> list[str]:
    return ["pi", "--model", model, "--skill", skill_path, "-p", prompt]


def run_pi_with_fallback(cmd: list[str], cwd: str, fallback_model: str) -> int:
    """Run pi command. If exit code != 0, retry with fallback model."""
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode == 0:
        return 0
    print(f"[idle-explorer] primary model failed (code={result.returncode}), retrying with {fallback_model}")
    fallback_cmd = cmd.copy()
    for i, arg in enumerate(fallback_cmd):
        if arg == "--model" and i + 1 < len(fallback_cmd):
            fallback_cmd[i + 1] = fallback_model
            break
    result2 = subprocess.run(fallback_cmd, cwd=cwd)
    return result2.returncode


# ── Tick / Loop ──────────────────────────────────────────────────────────────

def tick(repo_root: Path, *, dry_run: bool, cooldown_s: float,
         max_runs: int | None, skill_path: str, model: str, fallback_model: str, now: float) -> str:
    """Run one check cycle. Returns status string."""
    ts = datetime.fromtimestamp(now, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    tasks = scan_tasks(repo_root)

    # Zombie detection: auto-archive stuck tasks before idle check
    zombies = detect_zombies(repo_root, tasks, now, ZOMBIE_THRESHOLD_S)
    if zombies:
        auto_archive_zombies(repo_root, zombies)
        tasks = scan_tasks(repo_root)

    idle, busy = is_idle(tasks)
    busy_summary = ", ".join(f"{t['path']}:{t['status']}" for t in busy)
    print(f"[idle-explorer] {ts} status={'idle' if idle else 'busy'} tasks={len(tasks)}"
          + (f" busy=[{busy_summary}]" if busy_summary else ""))

    if not idle:
        return "busy"

    state = read_state(repo_root)
    triggered = state.get("triggerCount", 0)
    if max_runs is not None and triggered >= max_runs:
        print(f"[idle-explorer] max-runs reached: {triggered}/{max_runs}")
        return "max_runs"

    allowed, remaining = check_cooldown(state, now, cooldown_s)
    if not allowed:
        h = int(remaining // 3600)
        m = int((remaining % 3600) // 60)
        print(f"[idle-explorer] cooldown active: remaining={h}h{m}m")
        return "cooldown"

    prompt = build_prompt(repo_root)
    cmd = build_pi_command(skill_path, prompt, model)
    print(f"[idle-explorer] trigger-ready command={' '.join(cmd[:4])} ...")

    if dry_run:
        print("[idle-explorer] dry-run enabled; not executing pi command")
        print(f"[idle-explorer] exploration prompt:\n{prompt}")
        return "dry_run"

    acquired, release_or_reason = acquire_lock(repo_root)
    if not acquired:
        print(f"[idle-explorer] skipping: {release_or_reason}")
        return "locked"

    try:
        print("[idle-explorer] launching pi ...")
        exit_code = run_pi_with_fallback(cmd, str(repo_root), fallback_model)
        print(f"[idle-explorer] pi exited code={exit_code}")
        write_state(repo_root, {
            "lastTriggeredAt": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
            "triggerCount": triggered + 1,
        })
        return "triggered"
    finally:
        if callable(release_or_reason):
            release_or_reason()


def main() -> int:
    parser = argparse.ArgumentParser(description="Trellis Idle Explorer")
    parser.add_argument("--once", action="store_true", help="Single check then exit")
    parser.add_argument("--interval", default="1h", help="Check interval (e.g. 30m, 1h, 2h)")
    parser.add_argument("--cooldown", default="1d", help="Cooldown between triggers (e.g. 1h, 1d)")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without executing")
    parser.add_argument("--max-runs", type=int, default=None, help="Max triggers before stopping")
    parser.add_argument("--skill", default=DEFAULT_SKILL, help="Path to SKILL.md")
    parser.add_argument("--model", default="cpa/gpt", help="Primary model for pi")
    parser.add_argument("--fallback-model", default="cpa/mimo3", help="Fallback model if primary fails")
    args = parser.parse_args()

    repo_root = Path.cwd()
    interval_s = parse_duration(args.interval)
    cooldown_s = parse_duration(args.cooldown)

    print(f"[idle-explorer] starting: interval={interval_s}s cooldown={cooldown_s}s "
          f"dry_run={args.dry_run} max_runs={args.max_runs}")

    runs = 0
    while True:
        status = tick(
            repo_root,
            dry_run=args.dry_run,
            cooldown_s=cooldown_s,
            max_runs=args.max_runs,
            skill_path=args.skill,
            model=args.model,
            fallback_model=args.fallback_model,
            now=time.time(),
        )
        if status in ("triggered", "dry_run"):
            runs += 1
        if status == "max_runs":
            return 0
        if args.once or (args.max_runs is not None and runs >= args.max_runs):
            return 0
        time.sleep(interval_s)


if __name__ == "__main__":
    sys.exit(main())
