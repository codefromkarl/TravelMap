# Delete Dead Code: error-utils.ts

## Category
debt

## What to Change
Delete `src/services/error-utils.ts` and its test file `src/__tests__/unit/services/error-utils.test.ts`.

## Why
- `ContextualError`, `withContext`, `createServiceError` are only imported by their own test file
- Not exported from `src/index.ts`
- Not used by any production code in the project
- The file is dead code — removing it reduces maintenance burden and confusion

## Evidence
- `grep -rn "from.*error-utils" src/` shows only `src/__tests__/unit/services/error-utils.test.ts` imports it
- `src/index.ts` does not export anything from `error-utils.ts`
- No production code (services, tools, agent) imports from `error-utils.ts`

## Acceptance Criteria
- [ ] `src/services/error-utils.ts` is deleted
- [ ] `src/__tests__/unit/services/error-utils.test.ts` is deleted
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No other files are modified

## Scope
Only these files:
- `src/services/error-utils.ts` (delete)
- `src/__tests__/unit/services/error-utils.test.ts` (delete)

## Explicit Statement
No functional changes. This is pure dead code removal.
