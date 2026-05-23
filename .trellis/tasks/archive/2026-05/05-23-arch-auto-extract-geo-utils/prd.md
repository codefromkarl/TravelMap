# arch-auto: Extract duplicated geo utilities to shared module

## Category
debt — code deduplication

## What to Change and Why

**Problem**: `haversineMeters()` function and `WALK_SPEED_MPM` constant are identically duplicated in:
- `src/services/hotel-service.ts` (lines 68, 169-181)
- `src/services/restaurant-service.ts` (lines 62, 445-457)

This violates the **Locality** principle — a change to the distance calculation algorithm or walking speed constant must be made in 2 places.

**Evidence paths**:
- `.trellis/tasks/05-22-trellis-idle-explorer/research/duplication-verification.md` (Section 1 & 2)
- `.trellis/tasks/05-22-trellis-idle-explorer/research/tools-services-architecture.md` (Section 5.3, 5.4)

**Solution**: Create `src/services/geo-utils.ts` with:
- `haversineMeters(lat1, lng1, lat2, lng2): number` — Haversine distance in meters
- `WALK_SPEED_MPM = 5000 / 60` — Walking speed in meters per minute

Then update hotel-service.ts and restaurant-service.ts to import from geo-utils.

## Scope
- CREATE: `src/services/geo-utils.ts`
- EDIT: `src/services/hotel-service.ts` — remove local haversineMeters + WALK_SPEED_MPM, add import
- EDIT: `src/services/restaurant-service.ts` — remove local haversineMeters + WALK_SPEED_MPM, add import

**No functional changes.** Pure code movement.

## Acceptance Criteria
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Related unit tests pass (`npm test -- --reporter=verbose src/__tests__/unit/services/hotel-service.test.ts src/__tests__/unit/services/restaurant-service.test.ts`)
- [ ] `haversineMeters` and `WALK_SPEED_MPM` exist only in `src/services/geo-utils.ts`
- [ ] Both hotel-service.ts and restaurant-service.ts import from geo-utils.ts
