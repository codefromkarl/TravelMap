# Cloudflare Pages API Security

## Scenario: Server-managed LLM proxy

### 1. Scope / Trigger

Apply this contract whenever browser code calls a paid or credentialed upstream through `web/functions/`, especially `/api/chat`.

The browser must never receive, persist, log, or choose the server credential or upstream host. Cloudflare Pages Functions support only the binding subset documented for Pages. The Workers Rate Limiting binding is not in that subset; do not require `env.*.limit()` directly from a Pages Function. If strict coordination is required, deploy a separate Durable Object Worker and bind it to Pages.

### 2. Signatures

```text
POST /api/chat
Cookie: auth_token=<HttpOnly JWT>
Origin: <same origin as request URL>
Content-Type: application/json

context.env:
  JWT_SECRET: encrypted Secret, required
  LLM_API_KEY or provider-specific API key: encrypted Secret, required
  LLM_PROVIDER: plain server policy, required
  LLM_MODEL: plain server policy, required
  RATE_LIMIT_KV: KV binding, required
```

Pages Secret values are read only through `context.env`. Production operators must select **Encrypt** in Cloudflare Variables and Secrets. `.dev.vars` is local-only, ignored by Git, and excluded from deployment.

### 3. Contracts

- The client may send conversation parameters but must not send `_provider`, `baseUrl`, `baseURL`, `apiKey`, or `api_key`.
- Provider, model, URL, credential header, and redirect policy come from the server allowlist.
- Verify same origin, required bindings, JWT, and the KV user record before parsing or forwarding paid work.
- Enforce user and IP minute buckets before daily quota consumption. KV counters are eventual-consistency abuse controls, not accounting records.
- Consume daily quota before the upstream request. An accepted request can consume quota even when the provider fails.
- Set an upstream timeout and `redirect: "manual"`.
- Never return provider error bodies. Never log Authorization, Cookie, Secret values, request bodies, prompts, or provider responses.
- Production defense in depth requires a Cloudflare WAF Rate Limiting Rule and provider-side budget/alert. Strict counters require a separate Durable Object Worker.
- A root Pages middleware must return uncached 404 for `.dev.vars*`, `.env*`, `config.local.js`, and `*.map` before static fallback. Deployment exclusions alone do not invalidate an already cached sensitive asset.

### 4. Validation & Error Matrix

| Condition | HTTP | Stable code |
|---|---:|---|
| Cross-origin or `Sec-Fetch-Site: cross-site` | 403 | `FORBIDDEN_ORIGIN` |
| Missing `JWT_SECRET` or `RATE_LIMIT_KV` | 503 | `SECURITY_NOT_CONFIGURED` |
| Missing/invalid provider, model, or Secret | 503 | `PROVIDER_NOT_CONFIGURED` |
| Missing/invalid JWT or missing user record | 401 | `AUTH_REQUIRED` |
| KV minute limit exhausted | 429 | `RATE_LIMITED` |
| KV limiter unavailable | 503 | `RATE_LIMIT_UNAVAILABLE` |
| Daily quota exhausted | 429 | `QUOTA_EXCEEDED` |
| Invalid JSON/routing field/message schema | 400 | `INVALID_JSON` / `INVALID_REQUEST` |
| Oversized body | 413 | `REQUEST_TOO_LARGE` |
| Provider timeout/network/non-2xx | 502 | `UPSTREAM_ERROR` |

Errors contain only a stable code and generic message. They must not contain URLs, provider response details, stack traces, or credential fragments.

### 5. Good / Base / Bad Cases

- Good: Logged-in same-origin user, valid message body, minute and daily quota available. Function overwrites `model`, calls a constant allowlisted URL, and returns `X-Quota-Remaining`.
- Base: The provider returns 429 with a detailed body. Function records only provider name plus status and returns generic `502 UPSTREAM_ERROR`.
- Bad: Browser sends `{ "baseUrl": "https://attacker.example", "apiKey": "..." }`. Function rejects with 400 and makes no upstream call.

### 6. Tests Required

- Unit: missing JWT/KV/provider/model/Secret fails closed before `fetch`.
- Unit: no cookie and missing KV user return 401.
- Unit: cross-origin request returns 403 and wildcard CORS is absent.
- Unit: every client routing/key field returns 400 and `fetch` is not called.
- Unit: minute limit, KV failure, and daily quota return 429/503 without upstream calls.
- Unit: upstream URL and forwarded model exactly match server configuration; redirect mode is manual.
- Unit: provider response/error text is absent from the client response and logs.
- Build: `wrangler pages functions build` succeeds.
- Artifact: deploy secret scan rejects `.dev.vars`, `.env*`, local config, private keys, source maps, and credential-shaped values.
- Unit/hosted smoke: root middleware returns `404` plus `Cache-Control: no-store` for every blocked artifact path.
- Hosted smoke: verify 401/403/429, authenticated streaming, quota header, WAF rule, and no credential in Network/static assets/logs.

### 7. Wrong vs Correct

#### Wrong

```js
const upstream = body.baseUrl || env.LLM_BASE_URL;
return fetch(upstream, {
  headers: { Authorization: `Bearer ${env.LLM_API_KEY}` },
});
```

This lets the caller select where the server credential is sent.

#### Correct

```js
const provider = PROVIDERS[String(env.LLM_PROVIDER).toLowerCase()];
if (!provider || Object.hasOwn(body, "baseUrl")) {
  return invalidRequest();
}
return fetch(`${provider.baseUrl}${provider.path}`, {
  redirect: "manual",
  headers: { [provider.authHeader]: `${provider.authPrefix}${env.LLM_API_KEY}` },
});
```

The allowlist is code-owned, client routing fields are rejected, and production credentials remain encrypted Pages Secrets.

References: [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/), [Pages Secrets](https://developers.cloudflare.com/pages/functions/bindings/#secrets), [Workers Rate Limiting limitations and consistency](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
