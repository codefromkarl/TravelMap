# Release Pipeline Contract

## Scenario: Immutable Cloudflare Pages Artifact

### 1. Scope / Trigger

- Trigger: any change to CI, Cloudflare Pages deployment, public web assets, Functions, asset hashing, or release scripts.
- Goal: validation produces one immutable artifact; deployment consumes that exact artifact without rebuilding or copying the repository.

### 2. Signatures

```bash
node scripts/build-deploy-artifact.mjs <artifact-dir>
node scripts/validate-deploy-artifact.mjs <artifact-dir>
bash scripts/deploy.sh --artifact <artifact-dir> --branch <main|preview|pr-N>
```

Manual commands `bash scripts/deploy.sh` and `bash scripts/deploy.sh preview` first build and validate a temporary artifact.

### 3. Contracts

- The builder copies only the explicit public allowlist into `<artifact-dir>/site`, runs the repository-pinned Wrangler with `pages functions build --outdir=<fresh-temp-dir>`, accepts only one regular non-symlink non-empty `index.js`, copies it to `site/_worker.js`, cleans the temp directory, hashes assets, and writes `manifest.json`.
- `site/_worker.js` is Module Worker JavaScript, never a Worker upload envelope. Builder and validator reject multipart boundaries, `Content-Disposition: form-data`, and `name="metadata"` before deployment.
- The validator independently rechecks paths, content, local-reference closure, per-file hashes, and aggregate SHA-256. Validation is read-only and fail-closed.
- CI writes `source.json` with workflow, run, attempt, event, repository, ref, SHA, branch, PR number, and PR head SHA.
- Deploy downloads the exact `travelmap-pages-<run-id>-<run-attempt>` artifact and compares every source identity field before invoking `deploy.sh`.
- In GitHub Actions, `DEPLOY_SOURCE_SHA` is required and `deploy.sh` forwards it to Wrangler as `--commit-hash=<validated-workflow-run-sha>`; an invalid or missing CI SHA fails before upload.
- Only `artifact/site` may be passed to Pages. Repository roots, `web/`, rsync trees, source maps, tests, local server files, and secret files are forbidden inputs.
- Post-deploy smoke receives the exact Wrangler URL, requests the content-addressed JS/CSS references parsed from its `index.html`, and treats chat/auth Function preflight failures as blocking.
- Runtime: Node `22.19.0`; Wrangler is the exact package-lock version at `node_modules/.bin/wrangler`.
- Blocking browser validation uses `playwright.config.ts`, starts from a completed-onboarding storage state, and excludes only the explicit `LEGACY_E2E_SPECS` list. The excluded specs remain runnable through `npm run test:e2e:legacy`; this non-blocking lane must not be presented as release evidence.

### 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Unexpected path, symlink, source map, secret-like value, or missing local reference | Artifact build/validation fails before upload |
| Functions build or asset hashing fails | Artifact build fails; deployment does not continue |
| Functions output is missing, empty, a symlink, not exactly one `index.js`, or contains multipart markers | Artifact build fails before manifest creation; the fresh temp output is removed |
| Manifest file hash or aggregate SHA differs | Validator fails |
| Workflow conclusion/repository/source identity differs | Deploy is skipped or fails before upload |
| CI source SHA is absent/invalid or differs from the validated workflow run | Deploy fails before Wrangler upload |
| Wrangler returns zero, multiple, non-HTTPS, or lookalike `pages.dev` URLs | Deploy fails and emits no deployment URL |
| Referenced hashed asset is missing, chat/auth OPTIONS is not 200/204, or index takes at least 3 seconds | Post-deploy smoke fails the deploy job; the remote mutation is reported as already performed |
| AI secrets are absent | CI records explicit skip; permitted only on PR validation |
| Configured AI evaluation fails | CI fails; no failure suppression is allowed |

### 5. Good / Base / Bad Cases

- Good: CI validates code and E2E, builds one allowlisted artifact, then trusted deployment revalidates and deploys it once.
- Base: local manual deployment builds a temporary artifact through the same builder and validator.
- Bad: deploy runs `rsync web/`, rebuilds Functions, calls floating `npx wrangler`, or treats hashing/Functions failures as warnings.

### 6. Tests Required

- `deploy-artifact-safety.test.ts`: allowlist, secret/source-map rejection, reference closure, manifest hashes, real pinned-Wrangler JavaScript output, multipart rejection, strict Functions output shape/cleanup, real-bundle false-positive regressions, and fake-Wrangler shell contracts.
- `ci-workflow-contract.test.ts`: Node version, unique validation workflow, producer/consumer identity, permissions, artifact naming, PR preview, reports, and exact-URL smoke.
- Any legacy browser quarantine must have an explicit filename in `LEGACY_E2E_SPECS`, remain runnable via `playwright.legacy.config.ts`, and have a contract assertion. Do not expand it to suppress a new product regression.
- `health-check-contract.test.ts`: actual index-referenced hashed assets are requested; chat 404 and auth 5xx each force a non-zero smoke result.
- A real builder and independent validator run must return the same aggregate SHA and file count.
- An isolated directory without sibling `../pi` must pass `npm ci --ignore-scripts` and `npm run typecheck`.

### 7. Wrong vs Correct

#### Wrong

```bash
rsync -a web/ /tmp/deploy/
npx wrangler pages deploy /tmp/deploy/ || echo "warning"
wrangler pages functions build web/functions --outfile=site/_worker.js
```

#### Correct

```bash
functions_dir="$(mktemp -d)"
node_modules/.bin/wrangler pages functions build web/functions --outdir="$functions_dir"
# Fail unless the only output is a regular, non-empty index.js; reject multipart markers.
cp "$functions_dir/index.js" artifact/site/_worker.js
node scripts/build-deploy-artifact.mjs "$artifact_dir"
node scripts/validate-deploy-artifact.mjs "$artifact_dir"
DEPLOY_SOURCE_SHA="$validated_sha" \
  bash scripts/deploy.sh --artifact "$artifact_dir" --branch "pr-$pr_number"
bash scripts/health-check.sh "$exact_deployment_url"
```

The direct `pages functions build` dependency is pinned and guarded only as a release-recovery measure. Replacing this Cloudflare-internal build command with a supported compiler/build pipeline requires a separate migration task.

## Scanner Gotcha: Syntax-looking Text Is Not Always Runtime Code

Large bundles contain protocol fields, JSDoc, URLs, regular expressions, and templates that resemble secrets or imports. Never disable scanning for the whole bundle. Add a locally provable exception plus paired tests:

- `clientSecret: "client_secret"` is allowed only when normalized key and value are identical;
- a synthetic long value under the same key remains rejected;
- import-like text inside comments is ignored;
- a real local import after a URL/string remains part of reference closure.
