# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory contains guidelines for the `src/` directory — TypeScript backend using pi-agent-core framework.

**Language**: All documentation is in **English** (with Chinese comments where appropriate).

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | ✅ Active |
| [Database Guidelines](./database-guidelines.md) | Storage patterns (LRU cache, no SQL) | ✅ Active |
| [Error Handling](./error-handling.md) | Error types, fallback strategies | ✅ Active |
| [Quality Guidelines](./quality-guidelines.md) | Testing, linting, code review | ✅ Active |
| [Testing Roadmap](./testing-roadmap.md) | Test iteration plan (Phase 1-4) | ✅ Active |
| [Testing Strategy](./testing-strategy.md) | Mock routing, test layers, fixtures | ✅ Active |
| [Logging Guidelines](./logging-guidelines.md) | Log levels, URL sanitization | ✅ Active |

---

## Quick Reference

### Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: pi-agent-core (Agent orchestration)
- **HTTP Client**: Custom `http-client.ts` with timeout/retry
- **Testing**: Vitest + MSW
- **Linting**: Biome
- **Type Check**: TypeScript strict mode

### Key Commands

```bash
npm run check        # Biome lint + format + tsc typecheck
npm run lint         # Biome check only
npm run typecheck    # TypeScript only
npm test             # Vitest
npm run test:unit    # Unit tests only
npm run test:integration  # Integration tests
```

### Key Files

| File | Role |
|------|------|
| `src/index.ts` | Package entry (exports) |
| `src/agent/travel-agent.ts` | Core Agent class |
| `src/tools/index.ts` | Tool registration |
| `src/services/http-client.ts` | HTTP with timeout/retry |
| `src/services/error-utils.ts` | Error context helpers |
| `src/__tests__/mocks/handlers.ts` | MSW mock handlers |
| `src/__tests__/mocks/fixtures.ts` | Test data factories |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.
