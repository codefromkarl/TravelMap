# Idle Exploration: P0 Deepening Opportunities
Date: 2026-05-23
Source: Existing research + verification

## Summary

Based on existing research files and verification, identified P0 candidates for auto-implementation.

## P0 Candidates (Trivial/Low-Risk, High Leverage)

### 1. Delete Dead Code: `error-utils.ts`
- **Category**: debt
- **Files**: `src/services/error-utils.ts`, `src/__tests__/unit/services/error-utils.test.ts`
- **Evidence**: `ContextualError`, `withContext`, `createServiceError` are only imported by their own test file. Not exported from `src/index.ts`. Not used by any production code.
- **Safety**: ✅ Pure deletion. Zero functional change.
- **Risk**: Trivial

### 2. Delete Dead Code: `session-persist-service.ts`
- **Category**: debt
- **Files**: `src/services/session-persist-service.ts`, `src/__tests__/unit/services/session-persist-service.test.ts`
- **Evidence**: Only imported by its own test file. Not exported from `src/index.ts`. Not used by any production code or web layer.
- **Safety**: ✅ Pure deletion. Zero functional change.
- **Risk**: Trivial

### 3. Delete Dead Code: `dianping-scrape-service.ts`
- **Category**: debt
- **Files**: `src/services/dianping-scrape-service.ts`, `src/__tests__/unit/services/dianping-scrape-service.test.ts`
- **Evidence**: Only imported by its own test file. Not exported from `src/index.ts`. Not used by any production code or web layer.
- **Safety**: ✅ Pure deletion. Zero functional change.
- **Risk**: Trivial

### 4. Delete Dead Code: `log-report.ts`
- **Category**: debt
- **Files**: `src/services/log-report.ts`, `src/__tests__/cross-layer/log-report.test.ts`
- **Evidence**: Only imported by tests. Not exported from `src/index.ts`. `web/functions/api/logs.ts` defines its own functions directly.
- **Safety**: ⚠️ Need to verify no production imports exist.
- **Risk**: Low

## P1 Candidates (Medium Risk, User Review Needed)

| # | Candidate | Category | Risk |
|---|-----------|----------|------|
| 1 | Delete `createApiClient` from `http-client.ts` | debt | Medium — has tests, documented API |
| 2 | Extract shared error handling utility for tools | arch | Medium — business-specific messages |
| 3 | Split God Modules (hotel/restaurant/weather/transport) | arch | Medium — requires careful seam design |
| 4 | Centralize domestic/international API routing | arch | Medium |

## P2/P3 Candidates (High Effort / Design Decisions)

| # | Candidate | Category |
|---|-----------|----------|
| 1 | Split `trip.ts` types file | arch |
| 2 | Delete unused `trace-context.ts` | debt (actually used — false positive) |
| 3 | Evaluate if `companion-service` and `image-recognize` tools are necessary | arch |

## Already Done

- ✅ `haversineMeters` + `WALK_SPEED_MPM` extracted to `geo-utils.ts`
