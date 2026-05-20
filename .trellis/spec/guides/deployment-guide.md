# Deployment & CI/CD Guide

> How to deploy and verify the TravelAgent application.

---

## Overview

TravelAgent is deployed to **Cloudflare Pages** with Cloudflare Workers for API routes.

| Environment | URL | Branch |
|-------------|-----|--------|
| Production | https://travel-agent-ebl.pages.dev | `main` |
| Preview | https://preview.travel-agent-ebl.pages.dev | `preview` |
| Custom Domain | https://travel.codefromkarl.xyz | (needs binding) |

---

## Deployment Commands

### Manual Deployment

```bash
# Deploy to production
bash scripts/deploy.sh

# Deploy to preview
bash scripts/deploy.sh preview
```

### What Happens

1. Creates temp directory (excludes `config.local.js`)
2. Deploys to Cloudflare Pages via `wrangler`
3. Waits 5 seconds for CDN cache
4. Runs health check automatically

---

## Health Check

```bash
# Check production
bash scripts/health-check.sh

# Check preview
bash scripts/health-check.sh preview

# Check custom URL
bash scripts/health-check.sh https://custom-url.pages.dev
```

**Checks performed:**
- Page accessibility (HTTP 200)
- API endpoint response (OPTIONS preflight)
- Static assets loading (JS, CSS)
- Auth endpoint availability
- Response time (< 3s)

---

## CI/CD Pipeline

GitHub Actions workflow: `.github/workflows/deploy.yml`

### Jobs

| Job | Trigger | Purpose |
|-----|---------|---------|
| `quality` | push/PR to main | Biome lint + TypeScript check |
| `unit-test` | quality passes | Unit tests + coverage |
| `integration-test` | quality passes | Integration tests |
| `e2e-test` | quality passes | Playwright E2E tests |
| `deploy` | main push + all tests pass | Deploy to Cloudflare |
| `health-check` | deploy succeeds | Post-deploy verification |
| `preview` | PR created | Deploy preview + comment URL |

### Required Secrets

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for deployment |

---

## E2E Testing

### Local E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run against production
BASE_URL=https://travel-agent-ebl.pages.dev npm run test:e2e
```

### Test Files

| File | Coverage |
|------|----------|
| `page-load.spec.ts` | Page structure, title, responsive |
| `page-map.spec.ts` | Map rendering, markers, routes |
| `page-startup.spec.ts` | Startup flow, module loading |
| `interaction.spec.ts` | User interaction, chat, UI |
| `accessibility.spec.ts` | A11y, keyboard navigation |
| `e2e-chat-map.spec.ts` | Chat + map integration |

### Diagnostics

```bash
# Run startup diagnostics
npx tsx web/__tests__/diag-startup.ts
```

---

## Deployment Checklist

Before deploying:

- [ ] `npm run check` passes (lint + typecheck)
- [ ] `npm test` passes (unit tests)
- [ ] `npm run test:e2e` passes (E2E tests)
- [ ] No sensitive data in `config.local.js` (excluded by deploy script)

After deploying:

- [ ] Health check passes (`bash scripts/health-check.sh`)
- [ ] Manual verification of key features
- [ ] Check Cloudflare dashboard for errors

---

## Troubleshooting

### Deploy Fails

1. Check `CLOUDFLARE_API_TOKEN` is set
2. Verify wrangler is installed: `npx wrangler --version`
3. Check Cloudflare dashboard for quota limits

### Health Check Fails

1. Wait 30 seconds for CDN propagation
2. Check if Cloudflare Pages is having issues
3. Verify DNS resolution for custom domain

### E2E Tests Fail

1. Check if Playwright browsers are installed: `npx playwright install`
2. Verify `BASE_URL` is accessible
3. Check for console errors in test output
