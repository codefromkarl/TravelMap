# Implementation plan

1. Implement confirmed Candidate A (preset interactive demo); Candidate B is out of scope.
2. Add guest UI markup, i18n strings, styling, and auth-module state transitions. Make initial unauthenticated status non-blocking and keep an explicit sign-in CTA visible.
3. For Candidate A, reconnect the existing preset-trip consumer path, restore visible result actions, and require auth at every real AI send boundary without changing `/api/chat` security.
4. Keep Candidate B and all anonymous `/api/chat` access out of scope; preserve existing JWT/KV enforcement.
5. Update user-facing help/README/structured-data claims where they conflict with the selected behavior and label preset data as non-real-time.
6. Add scoped Vitest coverage for auth UI state and preset behavior.
7. Add one production-hostname Playwright flow covering initial guest usability, the complete preset demo, state preservation, and sign-in CTA.
8. Run only the affected Vitest files, then the new Playwright file. Parse and report test totals/failures. Run broader lint/type checks only if scoped changes require them.

## Risky files and rollback points

- `web/functions/api/chat.js`, `web/functions/api/auth/status.js`, `web/functions/_lib/quota.js`: do not change; preserve authenticated proxy and quota semantics.
- `web/modules/auth/auth.js`: avoid reinstalling fetch interception or blocking the app on status failure.
- `web/index.html`, `web/styles/main.css`, `web/modules/infra/i18n.js`: these have nearby parallel work; patch only auth/guest sections.

## Validation commands

```bash
npx vitest run web/modules/__tests__/auth.test.js web/modules/__tests__/guest-demo.test.js web/modules/__tests__/welcome.test.js web/modules/__tests__/session.test.js web/modules/__tests__/i18n.test.js
npx playwright test web/__tests__/flows/guest-experience.spec.ts
npm run typecheck
node --check web/modules/auth/auth.js
node --check web/modules/guest-demo.js
```
