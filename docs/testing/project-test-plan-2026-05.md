# Peima Project Test Plan (2026-05)

## 1. Goal

Validate that core user journeys and critical services are stable after recent M5/P7 changes:

- API read/write contracts remain backward compatible.
- Worker batch-match path is safe-by-default and testable in local allowlist mode.
- Web smoke paths (`/preview-pool`, `/matching-waiting`, `/final-match`) work with real API data.
- Regressions are caught early via layered tests (unit -> module -> integration -> pressure baseline).

## 2. Scope

In scope:

- `apps/api` unit and module/controller tests.
- `apps/worker` unit tests around scoring, queue processing, writer gate.
- API integration/e2e tests under `apps/api/test/*.e2e-spec.ts`.
- Local pressure baseline for key GET/POST endpoints.

Out of scope:

- Third-party SLA verification.
- Full production-grade distributed load testing.

## 3. Test Layers and Definition

### 3.1 Unit Tests

Purpose: pure logic and policy validation with deterministic inputs.

Priority modules:

- test-hook policies (`test-match.policy` and related allowlist gates)
- RRM pure computations (assistant/timeline/eval)
- shortlist/prescreen rules and score projections
- worker writer gate and selector logic

Pass condition:

- all affected unit suites green
- new branches introduced by the change are covered

### 3.2 Module Tests (Nest TestingModule)

Purpose: verify controller/service/provider wiring, auth guards, and exception mapping.

Priority modules:

- `TestController`
- `ChatController` readonly RRM endpoints
- `AdminController` newly added readonly/eval hooks

Pass condition:

- key endpoints delegate to expected services
- missing auth/user context returns expected 401/403 paths

### 3.3 Integration / E2E

Purpose: validate end-to-end API behavior against database state and route contracts.

Priority flows:

1. enqueue -> batch-match -> `GET /matching/result/:userId`
2. preview-pool latest fetch + readonly shortlist contract
3. RRM readonly summary endpoints and admin aggregate endpoint

Pass condition:

- no contract-breaking response shape change
- sidecar/readonly invariants hold (`appliedToMatchResult: false` where required)

### 3.4 Pressure Baseline (Local)

Purpose: detect obvious stability issues before merge.

Baseline approach:

- run burst/concurrency against:
  - `GET /matching/status/:userId`
  - `GET /matching/result/:userId`
  - `GET /preview-pool/user/:userId/latest`
- collect:
  - success rate
  - p50/p95 latency
  - error count

Suggested minimal target (local dev):

- success rate >= 99%
- no process crash
- no sustained error spikes

## 4. Commands

From repo root:

```bash
# API unit/module specs
pnpm --filter @peima/api test

# API e2e specs
pnpm --filter @peima/api test:e2e

# Worker unit specs
pnpm --filter @peima/worker test

# Type checks
pnpm --filter @peima/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @peima/worker exec tsc -p tsconfig.json --noEmit
```

Note: if `@peima/api` has no `test:e2e` script in package manifest, run e2e with:

```bash
pnpm --filter @peima/api exec jest --config ./jest-e2e.config.cjs
```

## 5. Current Focus (this change set)

Added/updated testable surfaces:

- dev/test allowlist capabilities in `/test/matching/capabilities`
- `/test/preview-pool/seed-latest` dev-only seed path
- worker local allowlist override for writing `MatchResult` in smoke tests

Required checks for this batch:

1. `apps/api/test/test-match.policy.spec.ts` passes
2. `apps/api/test/test.controller.spec.ts` passes
3. `apps/worker/test/p710-r9-old-photo-matching-writer-shutdown.spec.ts` passes
4. local smoke run for allowlisted users produces `MatchResult`

## 6. Risks and Mitigations

- Risk: dev-only hooks leak to non-allowlisted users  
  Mitigation: strict env-gated allowlist checks in both capability API and mutating endpoints.

- Risk: legacy writer accidentally reopened globally  
  Mitigation: keep global shutdown default; only per-user allowlist override in local test mode.

- Risk: test flakiness from live DB state  
  Mitigation: use deterministic seed + explicit queue setup for smoke paths.

## 7. Test Matrix Snapshot (2026-05-27)

Latest local run:

| Suite | Command | Result |
| --- | --- | --- |
| API unit/module | `pnpm --filter @peima/api test` | 212 suites, 1916+ tests passed (after controller DI fix) |
| API e2e (dev smoke) | `pnpm --filter @peima/api test:e2e -- test-dev-smoke-hooks.e2e-spec.ts` | 4/4 passed |
| Worker unit | `pnpm --filter @peima/worker test` | 8/8 suites, 97 tests passed |

Full journey e2e (added):

```bash
pnpm --filter @peima/api test:e2e -- matching-full-journey.e2e-spec.ts
```

Covers: preview-pool seed → `POST /matching/enqueue` → `POST /test/matching/run-batch-once` (worker subprocess) → `GET /matching/status` ready → `GET /matching/result` with row; second case runs `tools/local-pressure-baseline.mjs` against the test HTTP listener.

Frontend manual smoke: [frontend-smoke-checklist.md](./frontend-smoke-checklist.md)

Backend QA + fallback manual guide (owner sign-off): [backend-qa-and-fallback-manual-guide.md](./backend-qa-and-fallback-manual-guide.md)

Fallback env gate spec: `apps/api/test/runtime-fallback-path-gates.spec.ts`

Known gaps to continue:

- web layer automated tests (Playwright / RTL)
- scheduled CI job to run matrix on every PR (include full-journey e2e when DB available)

## 8. Pressure Baseline Tool

Script: `tools/local-pressure-baseline.mjs`

Example:

```bash
node tools/local-pressure-baseline.mjs \
  --baseUrl http://127.0.0.1:3000 \
  --token "<jwt>" \
  --userId "<viewerUserId>" \
  --concurrency 20 \
  --requests 200 \
  --path all
```

Outputs JSON with `successRate`, `p50Ms`, `p95Ms`, and status histogram.

## 9. Merge Gate

Before merge:

- all touched unit/module/e2e suites green
- smoke flow verified for at least two allowlisted users
- this document updated if scope/commands change
