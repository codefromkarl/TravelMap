# Guest end-to-end experience

## Goal and user value

Let a first-time visitor understand and operate TravelMap before creating an account. The visitor can explore a complete preset itinerary through the real map, route, local-history, export, and share paths. Registration or sign-in is requested only when the visitor asks for custom AI generation or AI refinement.

## Confirmed facts

- Production startup currently calls `/api/auth/status`; every unauthenticated or failed status check opens a blocking login overlay.
- Production `/api/chat` requires an authenticated JWT plus a matching KV user record, so hiding the overlay alone cannot enable the AI planning flow.
- The previous help page promised one complete guest itinerary plus one refinement, while the runtime did not implement any safe anonymous AI entitlement.
- Existing `skipLogin` translations and `.guest-banner` styles are not wired to DOM or behavior.
- The current quota is counted per LLM proxy call. A complete agent run may make many proxy calls, so guest entitlement cannot be implemented as only two raw HTTP calls.
- Existing Playwright runs use `127.0.0.1`, where authentication is short-circuited, and therefore do not prove the production guest path.
- A prior client-only guest mode was removed because localStorage quota was trivially bypassable. The new design must keep identity, quota, and abuse controls server-side.

## Requirements

### Entry and navigation

- A production visitor without an account can immediately use the main UI; no blocking login overlay appears on initial load.
- The UI clearly identifies guest mode and provides an always-available sign-in action.
- Public browsing and the visitor's already-generated itinerary remain available after guest AI entitlement is exhausted.

### Guest entitlement

- The guest experience must not rely on a client-asserted identity or client-only quota.
- The repository's existing preset itineraries may be used to demonstrate the complete product flow without paid model calls.
- The selected preset mode does not send guest traffic to `/api/chat`; the authenticated proxy keeps its existing JWT/KV, same-origin, provider, quota, validation, and fail-closed controls.

### Progressive authentication

- A guest custom-generation, refinement, or retry action is rejected in the UI before contacting the upstream provider.
- The UI presents sign-in as the next step without discarding the current conversation, itinerary, or pending user text.
- OAuth links preserve only a safe same-origin return path.
- Existing authenticated-user behavior and quota remain unchanged.

### Internationalization and accessibility

- Guest status, benefit, sign-in action, and exhaustion guidance are available in Chinese, English, and Japanese.
- Guest/sign-in controls have accessible names, keyboard focus, and mobile-size touch targets.

## Acceptance criteria

1. On a production-like hostname with no cookie, the app is operable and the login overlay is not visible.
2. The selected guest mode is explicit and makes no `/api/chat` request.
3. In preset demo mode, a visitor can load a complete clearly-labelled sample itinerary and use map, route, history, export, and sharing interactions before sign-in.
4. Editing localStorage cannot grant paid model access because hosted `/api/chat` still requires the existing authenticated server session.
5. The UI displays guest state and a sign-in CTA, then switches to the existing user/quota state after authentication.
6. A gated custom AI action opens a non-destructive sign-in prompt while keeping the current sample and local history accessible.
7. Scoped frontend auth/preset tests and a production-hostname guest browser flow cover the guest entry and auth boundary.
8. Existing authenticated auth/chat unit behavior remains unchanged.

## Out of scope

- Merging anonymous and authenticated usage histories across devices.
- Password/email registration; existing OAuth providers remain the account entry points.
- Removing server-side authentication, quota, rate limiting, provider allowlists, or secret isolation.
- Deployment, Cloudflare binding changes, WAF configuration, or production rollout in this task unless separately authorized.

## Open questions

- None blocking implementation.

## Confirmed product decision

- Use the preset interactive demo. Visitors can operate a complete sample itinerary, map, route, local history, export, and sharing before signing in.
- Require sign-in before custom AI generation or AI refinement. Do not open the paid model proxy to anonymous traffic.
- This decision was confirmed by the user on 2026-08-13.
