# arch-auto: harden blank target links

Category: security

## What to change and why

Add `rel="noopener noreferrer"` to existing static HTML anchors that use `target="_blank"` but do not already specify a safe `rel`.

Evidence:
- `.trellis/tasks/05-23-arch-auto-idle-exploration/research/frontend-research.md` P0
- `.trellis/tasks/05-23-arch-auto-idle-exploration/research/synthesis.md` P0.2
- `web/index.html`
- `web/help.html`

The link Module/Interface pattern is inconsistent: some blank-target anchors already use `rel="noopener noreferrer"`, while a few static anchors do not. This is a security-hardening cleanup at the HTML seam.

## Scope

Only these files may be modified:
- `web/index.html`
- `web/help.html`

## Acceptance criteria

- Every `target="_blank"` anchor in the scoped files has `rel="noopener noreferrer"`.
- Existing hrefs, text, classes, styles, and layout remain unchanged.
- No functional changes.
- `npm run typecheck` passes if applicable.
- Relevant frontend/static checks pass if run by check agent.
