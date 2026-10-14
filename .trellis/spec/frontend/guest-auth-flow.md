# Guest Demo and Progressive Authentication

## 1. Scope / Trigger

Apply this contract to startup authentication, guest-facing itinerary samples, and every UI path that can start a custom AI request. The hosted app must remain useful when `/api/auth/status` reports an unauthenticated user or is temporarily unavailable.

## 2. Signatures

- `checkAuth(): Promise<boolean>` refreshes account state without blocking the application shell. Concurrent calls share one status request; its fetch and JSON body together have a 5000ms deadline.
- `requireAuth(): Promise<boolean>` is the gate immediately before a custom AI send or retry.
- `initGuestDemo(): void` wires the visible guest entry points and result controls.
- `loadPresetTrip(key): Promise<boolean>` loads repository-owned `TripPlan` data through the normal rendering, local-history, export, and share paths.
- Hosted `/api/chat` remains authenticated; the preset demo never calls it.

## 3. Contracts

- Install the hosted fetch proxy before Agent initialization, establish guest state immediately, and start `checkAuth()` in the background. Authentication is not part of shell readiness. An unauthenticated, malformed, failed or timed-out status check shows guest mode without a blocking login overlay.
- Hydrate only a current authentication epoch and a nonempty string `user.id`. Guest transition, logout, new authentication and hosted proxy 401 invalidate older checks; late status/proxy responses cannot restore old identity or quota. Logout resets local identity and quota immediately, before awaiting the server. A document-local sign-out latch prevents even fresh status checks from restoring a still-valid cookie after a pending/failed logout; explicit fresh authentication or a new OAuth document resets it.
- The deadline covers response headers and body even when a transport ignores abort; clear timers/listeners, and let a new check proceed after timeout. Authentication status deduplication does not replace sync's independent server identity verification.
- Keep the startup skeleton above guest controls until the chat auth gate and deferred map prompt listeners are installed; visible guest actions must already be interactive.
- Guest mode exposes a clear sign-in action and clearly labels preset dates, weather, prices, and booking information as non-live demo data.
- Loading a preset updates the normal itinerary state, message list, map rendering path, local history, and result actions without making an LLM request.
- Every custom generation, refinement, or retry path calls `requireAuth()` before adding a user message, changing the visible result state, or contacting `/api/chat`.
- When the auth gate fails, preserve the current preset, history, and pending user intent while presenting GitHub and Google sign-in choices.
- Local development on `localhost` and `127.0.0.1` remains able to exercise configured model providers without hosted OAuth.

## 4. Validation and Error Matrix

| Condition | Required result |
|---|---|
| `/api/auth/status` returns authenticated user | Hide guest banner and show account quota UI |
| Status is pending, returns 401, fails or times out | Keep the app and preset picker operable; pending status must not hold the skeleton |
| Status body stalls or carries malformed identity | Settle by the shared deadline and deny custom AI work |
| Old status/proxy reply arrives after logout or identity change | Ignore it; preserve the current identity, quota and sync boundary |
| Guest selects a preset | Render and save the sample; make zero `/api/chat` calls |
| Guest submits or retries a custom prompt | Stop before the AI call and open the sign-in dialog |
| Hosted `/api/chat` returns 401 after a stale session | Open sign-in dialog and do not discard the current itinerary |
| Preset map rendering fails | Keep the textual sample and local result actions available; log the rendering failure |

## 5. Good / Base / Bad Cases

- Good: the first hosted page load is interactive, a preset exercises the real map and export paths, and custom AI work asks for sign-in only when requested.
- Base: the auth-status endpoint is unavailable; the page degrades to the same guest experience and the first custom AI action is gated.
- Bad: startup authentication covers the application with an unclosable overlay, or a client-only counter pretends to authorize anonymous `/api/chat` requests.

## 6. Tests Required

- Unit-test 401/network-error, shared in-flight checks, header/body deadlines, retry after timeout, malformed identity and late replies after logout/401/new login.
- Unit-test `requireAuth()` as the gate for guest custom sends and as a no-op for authenticated or local-development sessions.
- Unit-test preset loading against the production `TripPlan` shape, message rendering, local save, result controls, and zero network calls.
- Keep one production-like Playwright flow on a non-localhost hostname for guest entry, preset map interaction, history/export visibility, and the custom-prompt sign-in gate.
- Keep a mobile assertion for a visible, accessible guest banner and sign-in control.

## 7. Wrong vs Correct

### Wrong

```js
await checkAuth();
showAuthOverlay();
agent.sendMessage(prompt);
```

### Correct

```js
await detectProxyMode();
onGuest();
void checkAuth(); // shell initialization proceeds while status is pending

if (await requireAuth()) {
  await agent.sendMessage(prompt);
}
```
