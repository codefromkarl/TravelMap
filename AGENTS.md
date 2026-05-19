<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

## Subagents

- ALWAYS wait for all subagents to complete before yielding.
- Spawn subagents automatically when:
  - Parallelizable work (e.g., install + verify, npm test + typecheck, multiple tasks from plan)
  - Long-running or blocking tasks where a worker can run independently.
  - Isolation for risky changes or checks

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Testing Strategy (Layer 1: System Prompt)

When executing tests, follow this strategy to avoid wasted runs:

1. **Fail → Analyze → Fix → Verify**
   - When a test fails, DO NOT immediately re-run the same test.
   - First, read the failing test file to understand what it expects.
   - Then, read the code under test to identify the root cause.
   - Fix the issue, then run the test ONCE to verify.

2. **No Blind Retries**
   - Do not run the same test command more than 2 times in a row without code changes.
   - If a test fails twice, stop and report the failure details to the user.

3. **Test Output Parsing**
   - After running tests, summarize the results clearly:
     - Framework used (vitest/playwright/npm test)
     - Total tests / passed / failed
     - Names of failed tests
   - Use `grep` or `awk` to extract structured data from test output when needed.

4. **Scoped Testing**
   - Run only the specific test file related to your change.
   - Avoid running the full test suite unless explicitly requested.

## Debugging Strategy (Layer 1: System Prompt)

When fixing bugs or test failures, follow this strategy to avoid wasted cycles:

1. **Fail → Analyze → Fix → Verify (One Cycle)**
   - When a test or feature fails, DO NOT immediately retry.
   - Step 1: Read the failing test to understand expected behavior.
   - Step 2: Read the code under test to identify the root cause.
   - Step 3: Fix the root cause (not the symptom).
   - Step 4: Run the test ONCE to verify. If it still fails, go back to Step 1.

2. **No Blind Retries**
   - Do not run the same test or command more than 2 times in a row without code changes.
   - If retrying without changes, you are wasting tokens and time.

3. **Root Cause Over Symptom**
   - Do not patch around the problem (e.g., adding catch-all try/catch).
   - Understand WHY it failed, then fix the underlying cause.

4. **Stop and Report**
   - If the same issue persists after 2 fix attempts, STOP.
   - Report the failure details, your analysis, and the blocker to the user.

## File Read Efficiency (Layer 1: System Prompt)

1. **Avoid Repeated Reads**
   - If you have already read a file in this session, use the information already in context.
   - Do not re-read files that have not been edited since your last read.

2. **Batch Reads**
   - When you need multiple files, read them in one batch if possible.
   - Use `grep` or `find` to locate specific information instead of reading entire files.

3. **Respect Edit Hints**
   - When pi injects `[File Read Hint: ...]` into a read result, it means this file has been read multiple times.
   - Consider whether you really need to read it again, or if cached context is sufficient.
