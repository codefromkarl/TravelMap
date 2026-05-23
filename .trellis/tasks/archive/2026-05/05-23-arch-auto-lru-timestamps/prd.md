# arch-auto: remove redundant lru timestamps

Category: debt / perf

## What to change and why

Remove redundant cache timestamp fields where the LRU cache TTL is already the authoritative freshness Interface.

Evidence:
- `.trellis/tasks/05-23-arch-auto-idle-exploration/research/backend-research.md` P0.1
- `.trellis/tasks/05-23-arch-auto-idle-exploration/research/synthesis.md` P0.1
- `src/services/route-service.ts`
- `src/services/multi-source-service.ts`
- `src/services/free-sources/index.ts`

The cache Modules currently store `{ result, timestamp }` while the LRU Adapter already has `ttl` configured. This duplicates freshness knowledge and reduces Locality.

## Scope

Only these files may be modified:
- `src/services/route-service.ts`
- `src/services/multi-source-service.ts`
- `src/services/free-sources/index.ts`

## Acceptance criteria

- Remove `timestamp` from internal cache entry types and cache writes in the scoped files.
- In `route-service`, use `if (cached)` instead of manually checking timestamp age because `allowStale: false` and TTL are already configured.
- No functional changes.
- `npm run typecheck` passes.
- Relevant tests pass if run by check agent.
