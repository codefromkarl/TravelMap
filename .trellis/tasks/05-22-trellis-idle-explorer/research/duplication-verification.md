# Duplication Verification Report
Date: 2026-05-23

## 1. `haversineMeters()` — Confirmed Identical Duplication

**hotel-service.ts:169-181**:
```ts
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

**restaurant-service.ts:445-457**: Identical implementation (only diff: comment says "地球半径（米）")

**Usage**:
- hotel-service.ts:285 — `haversineMeters(center.latitude, center.longitude, lat, lng)`
- restaurant-service.ts:199 — `haversineMeters(center.latitude, center.longitude, lat, lng)`

**Safety**: ✅ Pure extraction. Zero functional change.

## 2. `WALK_SPEED_MPM` — Confirmed Identical Duplication

**hotel-service.ts:68**: `const WALK_SPEED_MPM = 5000 / 60;`
**restaurant-service.ts:62**: `const WALK_SPEED_MPM = 5000 / 60;`

**Usage**:
- hotel-service.ts:229,296,352 — `Math.ceil(distance / WALK_SPEED_MPM)`
- restaurant-service.ts:139,215,273 — `Math.ceil(distance / WALK_SPEED_MPM)`

**Safety**: ✅ Pure extraction. Zero functional change.

## 3. Error Handling Pattern in Tools — Confirmed Repetition

All 8 tool files have identical catch blocks:
```ts
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `...message...` }],
    details: { ..., error: msg },
  };
}
```

Files: weather.ts:40, hotels.ts:91, attractions.ts:76, restaurants.ts:67, transport.ts:72, geocode.ts:33, discover.ts:123, supply-enrich.ts:119

**Note**: Error messages are user-facing and different per tool. Extraction would need parameterized messages.
**Safety**: ⚠️ Medium — extracting the pattern is safe but messages are business-specific. Demote to P1.

## 4. `createApiClient()` — Confirmed Dead Code in Production

- Defined at: http-client.ts:184
- Used ONLY in: `src/__tests__/unit/services/http-client.test.ts`
- NOT re-exported from `src/index.ts`
- NOT imported by any service file (all use `fetchWithTimeout` or `fetchWithRetry` directly)

**Safety**: ⚠️ It has tests and is documented as an intended API. Deleting is a design decision. Demote to P1+.

## 5. `isDomesticCity()` Usage — Confirmed in 3 Service Callers

- hotel-service.ts:13 (import), hotel-service.ts:411 (call)
- restaurant-service.ts:13 (import), restaurant-service.ts:317 (call)
- supply-validation-service.ts:22 (import), supply-validation-service.ts:283 (call)
- dual-map-service.ts:78 (definition), dual-map-service.ts:293 (internal use)

That's 3 external callers + 1 internal. Not 4+ as originally claimed but still 3 identical routing patterns.

## 6. `as any` in Production Code

Only one instance in production code (non-test): `src/tools/action-links.ts:61`
```ts
const tl = (attr as any).reservationTimeline;
```
This is a type-safety gap — `reservationTimeline` is added by the post-processor but not reflected in the `Attraction` type.

**Safety**: ⚠️ Fixing requires type changes (business logic). Out of scope for auto-implementation.

## P0 Candidates for Auto-Implementation

| # | Candidate | Category | Files Changed | Risk |
|---|-----------|----------|---------------|------|
| 1 | Extract `haversineMeters` + `WALK_SPEED_MPM` → `geo-utils.ts` | debt | 1 new + 2 edited | Trivial |
