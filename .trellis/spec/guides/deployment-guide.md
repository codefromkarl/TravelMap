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

1. Builds an explicit allowlisted artifact with `scripts/build-deploy-artifact.mjs`.
2. Independently revalidates paths, content, references, and manifest hashes.
3. Deploys only `artifact/site` with the repository-pinned Wrangler.
4. Returns the exact Cloudflare `pages.dev` deployment URL; CI runs smoke checks against that URL.

The executable contract and rejection matrix live in [Release Pipeline Contract](../backend/release-pipeline.md).

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
- `index.html` accessibility (HTTP 200 plus an HTML marker)
- Every local JS/CSS reference in `index.html`, including at least one content-addressed `modules/` or `styles/` asset
- Chat and auth Functions (blocking OPTIONS 200/204 preflight)
- Index response time (< 3s, blocking)

CI passes only the exact Wrangler deployment URL to this script. A smoke failure happens after the remote upload, so it means “deployed but post-deploy verification failed,” not “deployment was prevented.”

---

## CI/CD Pipeline

GitHub Actions workflows: `.github/workflows/ci.yml` produces the validated artifact; `.github/workflows/deploy.yml` consumes only successful `workflow_run` artifacts.

### Jobs

| Job | Trigger | Purpose |
|-----|---------|---------|
| `static` | push/PR to main | Biome lint + TypeScript check |
| `tests` | static passes | Unit, integration and coverage |
| `e2e` | static passes | PR-scoped Page Map or main full Playwright |
| `ai-eval` | validation run | Explicit skip without secrets; fail-closed when configured |
| `build-artifact` | all required validation passes | Build and upload immutable allowlisted artifact |
| `production` | successful main CI workflow_run | Revalidate, deploy once, smoke exact URL |
| `preview` | successful PR CI workflow_run | Deploy isolated `pr-N` preview, smoke exact URL |

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
- [ ] `npm run test:coverage` passes (unit/integration/coverage; nested Playwright skipped)
- [ ] `npm run test:e2e` passes (E2E tests)
- [ ] Deploy artifact builder and independent validator agree on manifest SHA
- [ ] No tracked `.dev.vars`, source maps, test files, local server files, or secret-like values in the artifact

After deploying:

- [ ] Health check passes (`bash scripts/health-check.sh`)
- [ ] Manual verification of key features
- [ ] Check Cloudflare dashboard for errors

---

## Troubleshooting

### Deploy Fails

1. Check `CLOUDFLARE_API_TOKEN` is set
2. Verify the locked Wrangler is installed: `node_modules/.bin/wrangler --version`
3. Check Cloudflare dashboard for quota limits

### Health Check Fails

1. Wait 30 seconds for CDN propagation
2. Check if Cloudflare Pages is having issues
3. Verify DNS resolution for custom domain

### E2E Tests Fail

1. Check if Playwright browsers are installed: `npx playwright install`
2. Verify `BASE_URL` is accessible
3. Check for console errors in test output
