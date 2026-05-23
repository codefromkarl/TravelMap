import { spawn } from "node:child_process";
import { constants, promises as fs } from "node:fs";
import path from "node:path";

export const BUSY_TASK_STATUSES = new Set(["in_progress", "review"]);
export const EXCLUDED_TASK_IDS = new Set(["trellis-idle-explorer"]);
export const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
export const DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const ZOMBIE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2h
export const DEFAULT_RUNTIME_DIR = path.join(".trellis", ".runtime", "idle-explorer");
export const DEFAULT_STATE_FILE = path.join(DEFAULT_RUNTIME_DIR, "state.json");
export const DEFAULT_LOCK_FILE = path.join(DEFAULT_RUNTIME_DIR, "lock");
export const DEFAULT_SKILL_PATH = path.join(
  process.env.HOME ?? "~",
  ".claude",
  "skills-store",
  "improve-codebase-architecture",
  "SKILL.md",
);

export interface IdleExplorerOptions {
  repoRoot: string;
  once: boolean;
  intervalMs: number;
  cooldownMs: number;
  dryRun: boolean;
  maxRuns?: number;
  piBin: string;
  skillPath: string;
  runtimeDir: string;
  stateFile: string;
  lockFile: string;
  now: () => Date;
  log: (message: string) => void;
}

export interface ParsedCliOptions {
  once: boolean;
  intervalMs: number;
  cooldownMs: number;
  dryRun: boolean;
  maxRuns?: number;
  piBin: string;
  skillPath: string;
}

export interface TrellisTaskStatus {
  taskPath: string;
  id: string;
  title?: string;
  status: string;
}

export interface IdleStatus {
  isIdle: boolean;
  busyTasks: TrellisTaskStatus[];
  allTasks: TrellisTaskStatus[];
}

export interface IdleExplorerState {
  lastTriggeredAt?: string;
  triggerCount?: number;
}

export interface CooldownResult {
  allowed: boolean;
  remainingMs: number;
  lastTriggeredAt?: Date;
}

export interface PiCommand {
  command: string;
  args: string[];
  prompt: string;
}

export type TickStatus = "busy" | "cooldown" | "max_runs" | "dry_run" | "triggered" | "locked";

export interface TickResult {
  status: TickStatus;
  idleStatus: IdleStatus;
  command?: PiCommand;
  exitCode?: number | null;
}

export function parseDuration(input: string): number {
  const value = input.trim();
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/i.exec(value);
  if (!match) {
    throw new Error(`Invalid duration: ${input}`);
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid duration: ${input}`);
  }

  const unit = (match[2] ?? "ms").toLowerCase();
  const multiplier: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return Math.round(amount * multiplier[unit]);
}

export function parseIdleExplorerArgs(argv: string[]): ParsedCliOptions {
  const options: ParsedCliOptions = {
    once: false,
    intervalMs: DEFAULT_INTERVAL_MS,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    dryRun: false,
    piBin: "pi",
    skillPath: DEFAULT_SKILL_PATH,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--once":
        options.once = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--interval":
        options.intervalMs = parseDuration(readFlagValue(argv, ++i, arg));
        break;
      case "--cooldown":
        options.cooldownMs = parseDuration(readFlagValue(argv, ++i, arg));
        break;
      case "--max-runs": {
        const maxRuns = Number.parseInt(readFlagValue(argv, ++i, arg), 10);
        if (!Number.isInteger(maxRuns) || maxRuns < 1) {
          throw new Error("--max-runs must be a positive integer");
        }
        options.maxRuns = maxRuns;
        break;
      }
      case "--pi-bin":
        options.piBin = readFlagValue(argv, ++i, arg);
        break;
      case "--skill":
      case "--skill-path":
        options.skillPath = readFlagValue(argv, ++i, arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function getDefaultOptions(
  repoRoot: string,
  cliOptions: ParsedCliOptions,
): IdleExplorerOptions {
  return {
    repoRoot,
    once: cliOptions.once,
    intervalMs: cliOptions.intervalMs,
    cooldownMs: cliOptions.cooldownMs,
    dryRun: cliOptions.dryRun,
    maxRuns: cliOptions.maxRuns,
    piBin: cliOptions.piBin,
    skillPath: cliOptions.skillPath,
    runtimeDir: path.join(repoRoot, DEFAULT_RUNTIME_DIR),
    stateFile: path.join(repoRoot, DEFAULT_STATE_FILE),
    lockFile: path.join(repoRoot, DEFAULT_LOCK_FILE),
    now: () => new Date(),
    log: (message) => console.log(message),
  };
}

export function assessIdleStatus(tasks: TrellisTaskStatus[]): IdleStatus {
  const busyTasks = tasks.filter((task) => BUSY_TASK_STATUSES.has(task.status));
  return {
    isIdle: busyTasks.length === 0,
    busyTasks,
    allTasks: tasks,
  };
}

export interface ZombieTask extends TrellisTaskStatus {
  ageMs: number;
}

export async function detectZombies(
  repoRoot: string,
  tasks: TrellisTaskStatus[],
  now: Date,
  thresholdMs: number = ZOMBIE_THRESHOLD_MS,
): Promise<ZombieTask[]> {
  const zombies: ZombieTask[] = [];
  for (const task of tasks) {
    if (!BUSY_TASK_STATUSES.has(task.status)) continue;
    const taskJsonPath = path.join(repoRoot, task.taskPath, "task.json");
    try {
      const stat = await fs.stat(taskJsonPath);
      const ageMs = now.getTime() - stat.mtimeMs;
      if (ageMs > thresholdMs) {
        zombies.push({ ...task, ageMs });
      }
    } catch {
      // task.json missing, skip
    }
  }
  return zombies;
}

export async function autoArchiveZombies(
  repoRoot: string,
  zombies: ZombieTask[],
  log: (msg: string) => void,
): Promise<string[]> {
  const archived: string[] = [];
  for (const zombie of zombies) {
    const taskName = zombie.taskPath.split("/").pop() ?? zombie.taskPath;
    const hours = Math.round(zombie.ageMs / 3_600_000);
    log(
      "[idle-explorer] zombie detected: " + taskName + " (stuck " + hours + "h), auto-archiving...",
    );
    try {
      const exitCode = await new Promise<number | null>((resolve) => {
        const child = spawn(
          "python3",
          ["./.trellis/scripts/task.py", "archive", taskName, "--no-commit"],
          { cwd: repoRoot, stdio: "pipe" },
        );
        child.on("close", (code) => resolve(code));
      });
      if (exitCode === 0) {
        log("[idle-explorer] archived: " + taskName);
        archived.push(taskName);
      } else {
        log("[idle-explorer] archive failed for " + taskName + " (code=" + exitCode + ")");
      }
    } catch (e) {
      log("[idle-explorer] archive error for " + taskName + ": " + String(e));
    }
  }
  return archived;
}

export async function readTrellisTaskStatuses(repoRoot: string): Promise<TrellisTaskStatus[]> {
  const tasksRoot = path.join(repoRoot, ".trellis", "tasks");
  let entries: string[];
  try {
    entries = await fs.readdir(tasksRoot);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }

  const tasks: TrellisTaskStatus[] = [];
  for (const entry of entries) {
    if (shouldSkipTaskDirectory(entry)) continue;

    const taskDir = path.join(tasksRoot, entry);
    const taskJsonPath = path.join(taskDir, "task.json");
    try {
      const stat = await fs.stat(taskDir);
      if (!stat.isDirectory()) continue;
      const raw = await fs.readFile(taskJsonPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const status = typeof parsed.status === "string" ? parsed.status : "unknown";
      const id = typeof parsed.id === "string" ? parsed.id : entry;
      const title = typeof parsed.title === "string" ? parsed.title : undefined;
      if (EXCLUDED_TASK_IDS.has(id)) continue;
      tasks.push({ taskPath: path.relative(repoRoot, taskDir), id, title, status });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") continue;
      throw new Error(`Failed to read ${taskJsonPath}: ${String(error)}`);
    }
  }

  return tasks.sort((a, b) => a.taskPath.localeCompare(b.taskPath));
}

function shouldSkipTaskDirectory(entry: string): boolean {
  const normalized = entry.toLowerCase();
  return (
    normalized === "archive" ||
    normalized === "archives" ||
    normalized === "archived" ||
    normalized.startsWith(".")
  );
}

export function evaluateCooldown(
  state: IdleExplorerState,
  now: Date,
  cooldownMs: number,
): CooldownResult {
  if (!state.lastTriggeredAt) {
    return { allowed: true, remainingMs: 0 };
  }

  const lastTriggeredAt = new Date(state.lastTriggeredAt);
  const elapsedMs = now.getTime() - lastTriggeredAt.getTime();
  if (!Number.isFinite(lastTriggeredAt.getTime()) || elapsedMs >= cooldownMs) {
    return { allowed: true, remainingMs: 0, lastTriggeredAt };
  }

  return {
    allowed: false,
    remainingMs: cooldownMs - elapsedMs,
    lastTriggeredAt,
  };
}

export function buildExplorationPrompt(repoRoot: string): string {
  return `You are running a safe Trellis idle exploration + auto-implementation pass for repository: ${repoRoot}.

## Scope (STRICT — never violate)

ONLY these four categories are in scope:
1. **Historical debt cleanup** — remove dead code, deduplicate patterns, extract shared utilities
2. **Architecture standardization** — align modules to proper depth/seam/adapter patterns per improve-codebase-architecture
3. **Performance optimization** — reduce unnecessary allocations, cache misses, redundant calls
4. **Security hardening** — fix unsafe patterns, input validation, secret handling, dependency risks

OUT OF SCOPE (never touch):
- Business logic, feature behavior, user-facing functionality
- API contracts, request/response shapes, tool schemas
- Agent prompts, LLM interaction flow, output formatting
- UI components, routes, pages, styling
- Test expectations (may refactor test infra, not assertions)

If a candidate touches anything out of scope, demote it to P1+ for user review — never auto-implement.

## Phase 1: Explore

Use skill:improve-codebase-architecture explicitly. Follow its vocabulary and constraints:
- Use the architecture terms Module, Interface, Depth, Seam, Adapter, Leverage, and Locality.
- Explore and identify deepening opportunities in the existing codebase.

Dispatch one or more trellis-research subagents to inspect the codebase and existing Trellis specs.
Ask the subagents to find architecture problems, repeated Modules, weak Seams, misplaced Adapters, low-Leverage abstractions, and Locality/Depth issues.
Persist ALL findings into the task's research/ directory.
Synthesize into a ranked list of deepening opportunities with evidence paths.
Classify each as P0 (trivial/low-risk, high leverage), P1 (medium), P2 (high effort), or P3 (design decision).

## Phase 2: Auto-implement P0 candidates

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
5. After implementation, dispatch the trellis-check subagent to verify quality.
6. If check passes, archive:
   python3 ./.trellis/scripts/task.py archive <task-dir> --no-commit
7. If check fails, leave the task in_progress for manual review.

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
- If uncertain whether a change affects functionality, skip it and report as P1 instead.`;
}

export function buildPiCommand(piBin: string, skillPath: string, prompt: string): PiCommand {
  return {
    command: piBin,
    args: ["--model", "cpa/gpt", "--skill", skillPath, "-p", prompt],
    prompt,
  };
}

export function formatCommand(command: PiCommand): string {
  return [command.command, ...command.args.map(shellQuote)].join(" ");
}

function shellQuote(value: string): string {
  if (/^[\w./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function readState(stateFile: string): Promise<IdleExplorerState> {
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    return JSON.parse(raw) as IdleExplorerState;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeState(stateFile: string, state: IdleExplorerState): Promise<void> {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(`${stateFile}.tmp`, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(`${stateFile}.tmp`, stateFile);
}

export interface LockResult {
  acquired: boolean;
  release?: () => Promise<void>;
  reason?: string;
}

export async function acquireLock(lockFile: string): Promise<LockResult> {
  await fs.mkdir(path.dirname(lockFile), { recursive: true });
  let handle: Awaited<ReturnType<typeof fs.open>>;
  try {
    handle = await fs.open(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      return { acquired: false, reason: `lock already exists: ${lockFile}` };
    }
    throw error;
  }

  await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, "utf8");
  await handle.close();

  return {
    acquired: true,
    release: async () => {
      await fs.rm(lockFile, { force: true });
    },
  };
}

export async function runIdleExplorerTick(options: IdleExplorerOptions): Promise<TickResult> {
  let tasks = await readTrellisTaskStatuses(options.repoRoot);

  // Zombie detection: auto-archive stuck tasks before idle check
  const zombies = await detectZombies(options.repoRoot, tasks, options.now());
  if (zombies.length > 0) {
    await autoArchiveZombies(options.repoRoot, zombies, options.log);
    tasks = await readTrellisTaskStatuses(options.repoRoot);
  }

  const idleStatus = assessIdleStatus(tasks);
  const busySummary = idleStatus.busyTasks
    .map((task) => `${task.taskPath}:${task.status}`)
    .join(", ");
  options.log(
    `[idle-explorer] ${options.now().toISOString()} status=${idleStatus.isIdle ? "idle" : "busy"} tasks=${tasks.length}${busySummary ? ` busy=[${busySummary}]` : ""}`,
  );

  if (!idleStatus.isIdle) {
    return { status: "busy", idleStatus };
  }

  const state = await readState(options.stateFile);
  if (options.maxRuns !== undefined && (state.triggerCount ?? 0) >= options.maxRuns) {
    options.log(`[idle-explorer] max-runs reached: ${state.triggerCount ?? 0}/${options.maxRuns}`);
    return { status: "max_runs", idleStatus };
  }

  const cooldown = evaluateCooldown(state, options.now(), options.cooldownMs);
  if (!cooldown.allowed) {
    options.log(
      `[idle-explorer] cooldown active: remaining=${formatDuration(cooldown.remainingMs)}`,
    );
    return { status: "cooldown", idleStatus };
  }

  const prompt = buildExplorationPrompt(options.repoRoot);
  const command = buildPiCommand(options.piBin, options.skillPath, prompt);
  options.log(`[idle-explorer] trigger-ready command=${formatCommand(command)}`);
  options.log(`[idle-explorer] exploration prompt:\n${prompt}`);

  if (options.dryRun) {
    options.log("[idle-explorer] dry-run enabled; not executing pi command");
    return { status: "dry_run", idleStatus, command };
  }

  const lock = await acquireLock(options.lockFile);
  if (!lock.acquired) {
    options.log(`[idle-explorer] skipping: ${lock.reason}`);
    return { status: "locked", idleStatus };
  }

  try {
    const exitCode = await runPiCommand(command, options.repoRoot);
    options.log(`[idle-explorer] pi exited code=${exitCode}`);
    await writeState(options.stateFile, {
      lastTriggeredAt: options.now().toISOString(),
      triggerCount: (state.triggerCount ?? 0) + 1,
    });
    return { status: "triggered", idleStatus, command, exitCode };
  } finally {
    await lock.release?.();
  }
}

export async function runIdleExplorerLoop(options: IdleExplorerOptions): Promise<void> {
  let runs = 0;
  while (true) {
    const result = await runIdleExplorerTick(options);
    if (result.status === "triggered" || result.status === "dry_run") {
      runs += 1;
    }

    if (result.status === "max_runs") {
      return;
    }

    if (options.once || (options.maxRuns !== undefined && runs >= options.maxRuns)) {
      return;
    }

    await sleep(options.intervalMs);
  }
}

function runPiCommand(command: PiCommand, cwd: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.ceil(ms / 60_000)}m`;
  return `${Math.ceil(ms / 3_600_000)}h`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
