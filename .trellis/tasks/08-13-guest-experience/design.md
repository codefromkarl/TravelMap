# Guest experience technical design

## Candidate A: preset interactive demo (selected)

```text
No authenticated session
  -> GET /api/auth/status returns unauthenticated
  -> frontend enters guest-demo state without blocking overlay
  -> visitor selects an existing preset TripPlan
  -> local rendering drives itinerary, map, route, history, export, and share
  -> custom prompt or AI refinement calls requireAuth before /api/chat
  -> OAuth returns to the current path; browser-local trip remains available
```

- Reuse `web/modules/data/preset-trips.js`; do not duplicate sample data.
- Mark preset dates, weather, prices, and availability as demonstration data rather than current travel advice.
- Keep `/api/chat` JWT/KV contract unchanged. Guest demo interactions must make zero model proxy calls.
- Put the guest/sign-in CTA in the visible map chat header, not the deprecated hidden header.
- Restore visible result actions so “complete flow” includes map, export, and sharing rather than only a static sample.

## Candidate B: real anonymous AI trial (not selected; retained for decision history)

### Architecture and boundaries

```text
No/invalid auth cookie
  -> GET /api/auth/status
  -> create signed guest id + KV guest record
  -> Set-Cookie HttpOnly guest token
  -> return authenticated:false, guest:true, guest quota view
  -> frontend hides blocking overlay and shows guest status / sign-in CTA

LLM request
  -> same-origin + binding/provider validation
  -> verify token
  -> resolve principal: authenticated user or guest
  -> user/IP minute limits
  -> consume principal-specific quota
  -> fixed allowlisted upstream
  -> quota headers + streaming response
```

### Identity and storage contract

- Reuse the existing signed `auth_token` transport so browser proxy behavior stays simple, but add a signed `kind: "guest"` claim and a random `guest_<uuid>` subject.
- A guest token is useful only when a matching `guest:<id>` KV record exists. A forged subject or deleted/expired record fails closed.
- Guest records contain no profile or email. Store creation time, last-seen time if useful, and usage counters only.
- Use a shorter guest expiry than authenticated users. Cookie remains `HttpOnly; Secure; SameSite=Lax; Path=/`.
- Do not derive the guest subject from IP or fingerprinting. IP remains a secondary rate-limit signal only.

### Quota contract

- Keep authenticated `FREE_TIER.maxApiCalls` behavior unchanged.
- Add a separate `GUEST_TIER.maxApiCalls` constant.
- Both principal types share one quota consumption result shape so `/api/chat` does not duplicate forwarding/security logic.
- Guest entitlement is expressed publicly as one complete plan plus one refinement, but enforcement remains a hard raw-call cap because the agent may make multiple server calls per product operation and client operation labels are untrusted.
- Establish the initial guest cap from measured deterministic full-plan/refinement runs with safety headroom; document that it is a cost guard rather than exact business accounting.

### API contracts

### `GET /api/auth/status`

- Authenticated token + user record: existing `authenticated:true` response.
- Valid guest token + guest record: `authenticated:false`, `guest:true`, non-sensitive guest identity, and guest quota.
- Missing/invalid token: create guest record and cookie, then return the same guest response.
- Missing security bindings or KV failure: retain 503 fail-closed behavior; frontend may keep public UI visible but paid requests remain unavailable.

### `POST /api/chat`

- Valid user principal: existing behavior.
- Valid guest principal: use guest quota and same rate/security checks.
- Missing/invalid principal record: `401 AUTH_REQUIRED`.
- Exhausted guest quota: `429 GUEST_QUOTA_EXCEEDED`; do not call upstream.

## Shared frontend states

- `checking`: app initializes; no modal blocks public UI.
- `guest-demo`: show a compact guest banner/status, sample-trip CTA, and sign-in CTA.
- `guest-ai`: if Candidate B is selected, show the real guest benefit/remaining calls and sign-in CTA.
- `authenticated`: hide guest status; show existing profile/quota UI.
- `auth unavailable`: public UI remains visible; first paid action receives a clear service-unavailable error.
- `guest exhausted`: show login overlay or non-destructive dialog only in response to paid action; dismissal keeps existing trip accessible.

## Compatibility and migration

- Existing OAuth callback replaces the guest cookie with an authenticated token. Local IndexedDB conversation/history stays in the browser and therefore survives the redirect.
- No migration of guest KV usage into a new user's free tier for MVP.
- Existing direct authenticated requests, provider allowlist, quota header, and tests remain supported.

## Security and operations

- Guest access increases paid-request exposure. Keep IP/user minute buckets, required KV/JWT bindings, request size/schema validation, provider fixed routing, timeout, redacted responses, WAF rules, and provider spend alerts.
- KV counters are eventual-consistency controls, not strong accounting. Production cost safety still relies on WAF/provider budgets; strict coordination would require a Durable Object.
- Rollback is to stop creating guest sessions and return the existing unauthenticated status/401 behavior; frontend must then offer sign-in without exposing secrets or attempting direct providers.
