import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assessIdleStatus,
  buildExplorationPrompt,
  buildPiCommand,
  evaluateCooldown,
  type IdleExplorerOptions,
  parseDuration,
  parseIdleExplorerArgs,
  readTrellisTaskStatuses,
  runIdleExplorerTick,
} from "../../../services/trellis-idle-explorer.js";

let tempDirs: string[] = [];

async function makeTempRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "trellis-idle-explorer-"));
  tempDirs.push(dir);
  await mkdir(path.join(dir, ".trellis", "tasks"), { recursive: true });
  return dir;
}

async function writeTask(
  repoRoot: string,
  name: string,
  status: string,
  id?: string,
): Promise<void> {
  const taskDir = path.join(repoRoot, ".trellis", "tasks", name);
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, "task.json"),
    `${JSON.stringify({ id: id ?? name, title: `Task ${name}`, status }, null, 2)}\n`,
    "utf8",
  );
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("trellis idle explorer pure logic", () => {
  it("parses duration values with explicit units", () => {
    expect(parseDuration("250ms")).toBe(250);
    expect(parseDuration("2s")).toBe(2000);
    expect(parseDuration("3m")).toBe(180_000);
    expect(parseDuration("1.5h")).toBe(5_400_000);
    expect(parseDuration("1d")).toBe(86_400_000);
  });

  it("rejects invalid duration values", () => {
    expect(() => parseDuration("forever")).toThrow("Invalid duration");
    expect(() => parseDuration("-1s")).toThrow("Invalid duration");
  });

  it("parses CLI flags for once, dry-run, interval, cooldown, and max-runs", () => {
    const options = parseIdleExplorerArgs([
      "--once",
      "--dry-run",
      "--interval",
      "5m",
      "--cooldown",
      "2h",
      "--max-runs",
      "3",
      "--pi-bin",
      "pi-dev",
      "--skill-path",
      "/tmp/skill.md",
    ]);

    expect(options.once).toBe(true);
    expect(options.dryRun).toBe(true);
    expect(options.intervalMs).toBe(300_000);
    expect(options.cooldownMs).toBe(7_200_000);
    expect(options.maxRuns).toBe(3);
    expect(options.piBin).toBe("pi-dev");
    expect(options.skillPath).toBe("/tmp/skill.md");
  });

  it("marks in_progress and review tasks as busy", () => {
    const result = assessIdleStatus([
      { taskPath: ".trellis/tasks/one", id: "one", status: "planning" },
      { taskPath: ".trellis/tasks/two", id: "two", status: "in_progress" },
      { taskPath: ".trellis/tasks/three", id: "three", status: "review" },
      { taskPath: ".trellis/tasks/four", id: "four", status: "deferred" },
    ]);

    expect(result.isIdle).toBe(false);
    expect(result.busyTasks.map((task) => task.id)).toEqual(["two", "three"]);
  });

  it("treats planning and deferred tasks as idle", () => {
    const result = assessIdleStatus([
      { taskPath: ".trellis/tasks/one", id: "one", status: "planning" },
      { taskPath: ".trellis/tasks/two", id: "two", status: "deferred" },
    ]);

    expect(result.isIdle).toBe(true);
    expect(result.busyTasks).toHaveLength(0);
  });

  it("allows trigger when cooldown has no previous trigger", () => {
    const result = evaluateCooldown({}, new Date("2026-05-22T10:00:00Z"), 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remainingMs).toBe(0);
  });

  it("blocks trigger during cooldown window", () => {
    const result = evaluateCooldown(
      { lastTriggeredAt: "2026-05-22T09:59:30.000Z" },
      new Date("2026-05-22T10:00:00Z"),
      60_000,
    );

    expect(result.allowed).toBe(false);
    expect(result.remainingMs).toBe(30_000);
  });

  it("builds an exploration prompt with architecture vocabulary, subagent, and trellis task workflow", () => {
    const prompt = buildExplorationPrompt("/repo");

    expect(prompt).toContain("skill:improve-codebase-architecture");
    expect(prompt).toContain("Module, Interface, Depth, Seam, Adapter, Leverage, and Locality");
    expect(prompt).toContain("trellis-research subagent");
    expect(prompt).toContain("trellis-implement subagent");
    expect(prompt).toContain("trellis-check subagent");
    expect(prompt).toContain("task.py create");
    expect(prompt).toContain("task.py archive");
    expect(prompt).toContain("P0 candidate");
    expect(prompt).toContain("Historical debt cleanup");
    expect(prompt).toContain("Architecture standardization");
    expect(prompt).toContain("Performance optimization");
    expect(prompt).toContain("Security hardening");
    expect(prompt).toContain("OUT OF SCOPE");
    expect(prompt).toContain("No functional changes");
    expect(prompt).toContain("Local git commits are allowed");
    expect(prompt).toContain("Never git push to remote");
  });

  it("builds a pi command with skill path and prompt", () => {
    const command = buildPiCommand("pi", "/skills/improve/SKILL.md", "Explore safely");

    expect(command.command).toBe("pi");
    expect(command.args).toEqual([
      "--model",
      "cpa/gpt",
      "--skill",
      "/skills/improve/SKILL.md",
      "-p",
      "Explore safely",
    ]);
  });
});

describe("trellis idle explorer task scanning", () => {
  it("reads task statuses and ignores archive directories", async () => {
    const repoRoot = await makeTempRepo();
    await writeTask(repoRoot, "05-22-active", "review");
    await writeTask(repoRoot, "05-22-planning", "planning");
    await writeTask(repoRoot, "archive", "in_progress");

    const tasks = await readTrellisTaskStatuses(repoRoot);

    expect(tasks.map((task) => `${task.id}:${task.status}`)).toEqual([
      "05-22-active:review",
      "05-22-planning:planning",
    ]);
  });

  it("excludes the idle-explorer task itself to avoid self-blocking", async () => {
    const repoRoot = await makeTempRepo();
    await writeTask(repoRoot, "05-22-idle-self", "in_progress", "trellis-idle-explorer");
    await writeTask(repoRoot, "05-22-planning", "planning");

    const tasks = await readTrellisTaskStatuses(repoRoot);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("05-22-planning");
  });

  it("does not prepare a command when busy tasks exist", async () => {
    const repoRoot = await makeTempRepo();
    await writeTask(repoRoot, "05-22-active", "in_progress");
    const logs: string[] = [];

    const result = await runIdleExplorerTick(makeOptions(repoRoot, logs));

    expect(result.status).toBe("busy");
    expect(result.command).toBeUndefined();
    expect(logs.join("\n")).toContain("status=busy");
  });

  it("prepares but does not execute command in idle dry-run mode", async () => {
    const repoRoot = await makeTempRepo();
    await writeTask(repoRoot, "05-22-planning", "planning");
    const logs: string[] = [];

    const result = await runIdleExplorerTick(makeOptions(repoRoot, logs));

    expect(result.status).toBe("dry_run");
    expect(result.command?.args[0]).toBe("--model");
    expect(result.command?.args[1]).toBe("cpa/gpt");
    expect(result.command?.args[2]).toBe("--skill");
    expect(result.command?.prompt).toContain("trellis-research");
    expect(logs.join("\n")).toContain("trigger-ready command=");
  });

  it("does not prepare command while cooldown is active", async () => {
    const repoRoot = await makeTempRepo();
    await writeTask(repoRoot, "05-22-planning", "planning");
    const stateFile = path.join(repoRoot, ".trellis", ".runtime", "idle-explorer", "state.json");
    await mkdir(path.dirname(stateFile), { recursive: true });
    await writeFile(
      stateFile,
      JSON.stringify({ lastTriggeredAt: "2026-05-22T09:59:30.000Z" }),
      "utf8",
    );
    const logs: string[] = [];

    const result = await runIdleExplorerTick(makeOptions(repoRoot, logs));
    const state = await readFile(stateFile, "utf8");

    expect(result.status).toBe("cooldown");
    expect(result.command).toBeUndefined();
    expect(state).toContain("2026-05-22T09:59:30.000Z");
  });

  it("skips tick gracefully when lock is already held", async () => {
    const repoRoot = await makeTempRepo();
    await writeTask(repoRoot, "05-22-planning", "planning");
    const lockFile = path.join(repoRoot, ".trellis", ".runtime", "idle-explorer", "lock");
    await mkdir(path.dirname(lockFile), { recursive: true });
    await writeFile(lockFile, "99999\n2026-05-22T09:59:00.000Z\n", "utf8");
    const logs: string[] = [];

    const result = await runIdleExplorerTick({ ...makeOptions(repoRoot, logs), dryRun: false });

    expect(result.status).toBe("locked");
    expect(result.command).toBeUndefined();
    expect(logs.join("\n")).toContain("skipping: lock already exists");
    // lock file preserved (not deleted)
    const lockContent = await readFile(lockFile, "utf8");
    expect(lockContent).toContain("99999");
  });
});

function makeOptions(repoRoot: string, logs: string[]): IdleExplorerOptions {
  return {
    repoRoot,
    once: true,
    intervalMs: 60_000,
    cooldownMs: 60_000,
    dryRun: true,
    piBin: "pi",
    skillPath: "/skills/improve-codebase-architecture/SKILL.md",
    runtimeDir: path.join(repoRoot, ".trellis", ".runtime", "idle-explorer"),
    stateFile: path.join(repoRoot, ".trellis", ".runtime", "idle-explorer", "state.json"),
    lockFile: path.join(repoRoot, ".trellis", ".runtime", "idle-explorer", "lock"),
    now: () => new Date("2026-05-22T10:00:00.000Z"),
    log: (message) => logs.push(message),
  };
}
