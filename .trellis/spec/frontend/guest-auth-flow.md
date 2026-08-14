# Guest Demo and Progressive Authentication

## 1. Scope / Trigger

Apply this contract to startup authentication, guest-facing itinerary samples, and every UI path that can start a custom AI request. The hosted app must remain useful when `/api/auth/status` reports an unauthenticated user or is temporarily unavailable.

## 2. Signatures

- `checkAuth(): Promise<boolean>` refreshes account state without blocking the application shell.
- `requireAuth(): Promise<boolean>` is the gate immediately before a custom AI send or retry.
- `initGuestDemo(): void` wires the visible guest entry points and result controls.
- `loadPresetTrip(key): Promise<boolean>` loads repository-owned `TripPlan` data through the normal rendering, local-history, export, and share paths.
- Hosted `/api/chat` remains authenticated; the preset demo never calls it.

## 3. Contracts

- An unauthenticated or failed status check shows the application in guest mode and must not show a blocking login overlay.
- Guest mode exposes a clear sign-in action and clearly labels preset dates, weather, prices, and booking information as non-live demo data.
- Loading a preset updates the normal itinerary state, message list, map rendering path, local history, and result actions without making an LLM request.
- Every custom generation, refinement, or retry path calls `requireAuth()` before adding a user message, changing the visible result state, or contacting `/api/chat`.
- When the auth gate fails, preserve the current preset, history, and pending user intent while presenting GitHub and Google sign-in choices.
- Local development on `localhost` and `127.0.0.1` remains able to exercise configured model providers without hosted OAuth.

## 4. Validation and Error Matrix

| Condition | Required result |
|---|---|
| `/api/auth/status` returns authenticated user | Hide guest banner and show account quota UI |
| Status returns 401 or the request fails | Show guest banner; keep the app and preset picker operable |
| Guest selects a preset | Render and save the sample; make zero `/api/chat` calls |
| Guest submits or retries a custom prompt | Stop before the AI call and open the sign-in dialog |
| Hosted `/api/chat` returns 401 after a stale session | Open sign-in dialog and do not discard the current itinerary |
| Preset map rendering fails | Keep the textual sample and local result actions available; log the rendering failure |

## 5. Good / Base / Bad Cases

- Good: the first hosted page load is interactive, a preset exercises the real map and export paths, and custom AI work asks for sign-in only when requested.
- Base: the auth-status endpoint is unavailable; the page degrades to the same guest experience and the first custom AI action is gated.
- Bad: startup authentication covers the application with an unclosable overlay, or a client-only counter pretends to authorize anonymous `/api/chat` requests.

## 6. Tests Required

- Unit-test 401 and network-error startup as non-blocking guest states.
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
await checkAuth(); // unauthenticated users remain in the app shell

if (await requireAuth()) {
  await agent.sendMessage(prompt);
}
```
