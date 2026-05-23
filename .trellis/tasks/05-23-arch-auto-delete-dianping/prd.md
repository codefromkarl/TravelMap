# Delete Dead Code: dianping-scrape-service.ts

## Category
debt

## What to Change
Delete `src/services/dianping-scrape-service.ts` and its test file `src/__tests__/unit/services/dianping-scrape-service.test.ts`.

## Why
- Only imported by its own test file
- Not exported from `src/index.ts`
- Not used by any production code or web layer
- The file is dead code — removing it reduces maintenance burden

## Evidence
- `grep -rn "from.*dianping-scrape" src/` shows only `src/__tests__/unit/services/dianping-scrape-service.test.ts` imports it
- `src/index.ts` does not export anything from `dianping-scrape-service.ts`
- No production code (services, tools, agent, web) imports from `dianping-scrape-service.ts`

## Acceptance Criteria
- [ ] `src/services/dianping-scrape-service.ts` is deleted
- [ ] `src/__tests__/unit/services/dianping-scrape-service.test.ts` is deleted
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No other files are modified

## Scope
Only these files:
- `src/services/dianping-scrape-service.ts` (delete)
- `src/__tests__/unit/services/dianping-scrape-service.test.ts` (delete)

## Explicit Statement
No functional changes. This is pure dead code removal.
