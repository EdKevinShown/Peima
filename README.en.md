# Peima / 配吗

Languages: [中文](./README.md) · **English**

> This file is a detailed one-time English translation / snapshot of the main project README.  
> The Chinese [README.md](./README.md) and the documents under `docs/` remain the authoritative source if the two versions ever diverge.

Peima is an AI-assisted relationship matching MVP. The repository contains a user-facing web app, an admin surface, a NestJS API, a worker pipeline, Prisma/PostgreSQL persistence, and multiple bounded AI / RRM capabilities.

The project is best understood as two parallel tracks:

- **P-series**: product and application slices, such as login, questionnaire, preview pool, final match, chat, timeline, governance, Copilot, and AI-assisted UX surfaces.
- **M-series**: AI matching / RRM engineering milestones, such as RRM-Sim, Pairwise, RRM Top2 display, controlled hook jobs, Scoring V2, and evaluation surfaces.

The numbering schemes are independent. For example, an `M3.8` sub-milestone may contain internal `M0`-style labels that are not top-level repository phases.

---

## 1. Current Project Status

### P0 — Core Product Flow

The P0 chain is stable:

1. `/login`
2. `/questionnaire`
3. `/preview-pool`
4. `/matching-waiting`
5. worker batch matching
6. `/final-match`
7. `/chat`

The current implementation still includes rule-based and placeholder pieces. It should not be described as a fully autonomous AI matching platform.

### P1 — Structured Placeholder Layer

P1 delivered structured, product-visible scaffolding:

- `MatchResult.matchInsights`
- read-only chat summary surface
- preview pool item metadata
- worker logging and engineering cleanup
- shared copy / disclaimer constants

These are structural product slices and not proof of a fully model-driven matching engine.

### P2 / P2.5 — Chat, Feedback, Signals, Copilot Baseline

P2-MVP and P2.5 added the first usable relationship-interaction loop:

- persisted or generated chat summaries
- structured feedback
- explicit accept/dismiss profile suggestions
- behavior signals
- lightweight read-only analytics
- rule-based Copilot suggestions
- ChatPage integration
- a standalone Copilot page
- global analytics allowlist
- profile suggestion grouping and review UX

The Copilot baseline is read-only and does not write matching decisions.

### P3 — Relationship Timeline

P3 in this repository refers specifically to the relationship timeline slice, not all possible long-term P3 capabilities.

Completed:

- read-only timeline aggregate API
- `/chat/timeline`
- secondary entry from `/final-match`
- long-message pagination and "load more messages"

See [docs/P3/P3-relationship-timeline.md](./docs/P3/P3-relationship-timeline.md).

### P4 — Productization Slices

P4 completed several productization slices, including the readonly questionnaire profile v3:

- `GET /questionnaire/profile/:userId`
- `/questionnaire-profile`
- branch-level questionnaire profile aggregation
- labels, `displayPrimary`, and rule-based `overallExplanation`

This readonly profile does not imply that matching / worker ranking already consumes the v3 branch profile.

### P5 — Governance and Operations

P5 delivered operational foundations:

- lightweight RBAC
- suggestion center
- audit log system
- notification center
- admin analytics dashboard
- related API and UI flows

### P6 — Copilot, AI Result Slices, and Chat Profile Suggestions

P6 includes multiple bounded AI and UX slices. They are intentionally independent and do not form a unified multi-agent platform.

Completed slices include:

- **P6.1–P6.4**: Copilot real LLM path behind the existing read-only Copilot endpoint, with rule fallback.
- **P6.5**: Summary AI.
- **P6.6**: Match Explanation AI.
- **P6.7**: Final Match Primary Conclusion.
- **P6.8**: Conversation-driven profile completion suggestion generation.
- **P6.9**: Governance for the P6.8 generation endpoint.
- **P6.10**: ChatPage UX hinting aligned with P6.9 status codes.
- **P6.y**: Interaction Simulation Lite, a read-only first-chat prediction surface.

Not completed as a productized main path:

- unified AI agent orchestration
- multi-agent simulation as a product chain
- worker-driven full LLM orchestration
- model replacement of the primary matching decision layer

### M5 / M5.6 — RRM Top2 Controlled Production Path

M5 connects RRM to the enabled display read path. M5.5 and M5.6 close the controlled production path around metadata writers, hook jobs, dry-run consumers, controlled apply gates, shared apply services, and staging-style run records.

Important boundary:

- RRM may affect `displayCandidateUserId` / `displaySourceType` when gates and eligibility pass.
- RRM does **not** overwrite `MatchResult.candidateUserId`.
- RRM does **not** rewrite `finalScore`.
- `GET /matching/result` remains read-only.
- Production worker auto-polling / auto-apply for RRM hook jobs is **not** enabled as the default out-of-the-box behavior.

See:

- [docs/M5/M5-closure.md](./docs/M5/M5-closure.md)
- [docs/M5/M5.6-closure-rrm-top2-controlled-production-path.md](./docs/M5/M5.6-closure-rrm-top2-controlled-production-path.md)

### M5.1 — RRM Three-Layer Architecture

M5.1 is complete.

The architecture is:

```text
Layer 1 — RRM Core Formula
Layer 2 — RRM Signal Adapter
Layer 3 — RRM Consumer
```

Current delivery:

- **RRM-Sim** remains the only complete Core implementation.
- **RRM-Observed** provides observed chat signal summaries.
- **RRM-Assistant** detects draft advancement and computes ActionFit only when applicable.
- **RRM-Timeline** provides trend summaries and window-level `RFI_t` bands.
- **RRM-Eval** provides de-identified cohort-level evaluation metrics.
- **Pairwise** remains a comparator, not RRM Core.

See [docs/M5/M5.1-closeout.md](./docs/M5/M5.1-closeout.md).

### M6.0 — Scoring V2

M6.0 Scoring V2 has completed its core loop:

- questionnaire `q01`–`q30` are canonical
- Scoring V2 helper
- worker writes `scoreShadowV2`
- DB persistence verified
- API exposes `relationshipProfileScoreV2`
- FinalMatchPage has a V2 technical section and optional V2 primary score flag

Important boundary:

- `MatchResult.finalScore` is still the legacy v1 source of truth.
- worker winner / ranking has not been fully switched to V2.
- RRM has not been formally constrained to a V2-only Top2 subset.
- low-effort detection is not complete.

See [docs/M6/M6.0-index.md](./docs/M6/M6.0-index.md).

---

## 2. Architecture

```text
apps/
  web/       React + Vite user app
  admin/     React + Vite admin app
  api/       NestJS API
  worker/    Node.js worker, cron, batch jobs

packages/
  database/  Prisma schema, migrations, Prisma Client exports
  shared/    shared types, constants, scoring helpers
  config/    shared config placeholder
  scoring/   scoring placeholder
  sdk/       SDK placeholder

docs/        product, engineering, acceptance, and milestone documentation
```

Main runtime stack:

- Web: React + Vite
- API: NestJS
- Worker: Node.js + TypeScript + node-cron
- Database: Prisma + PostgreSQL
- Auth: JWT with Nest + passport-jwt
- Monorepo package manager: pnpm

---

## 3. Key Product Flow

Typical local product path:

1. Log in or register at `/login`.
2. Complete the questionnaire at `/questionnaire`.
3. Optionally inspect the readonly questionnaire profile at `/questionnaire-profile`.
4. Review the latest active preview pool at `/preview-pool`.
5. Enter `/matching-waiting`.
6. Enqueue or wait for matching.
7. Run worker batch matching or admin/test batch matching.
8. View the result at `/final-match`.
9. Enter `/chat`.
10. Optionally inspect `/copilot` and `/chat/timeline`.

The restored `/preview-pool` page is currently a **read-only latest pool viewer**. It does not restore the removed legacy `POST /preview-pool/generate` writer path.

---

## 4. Key Pages

- `/login`: register / log in, stores `peimaToken` and `peimaUserId`.
- `/questionnaire`: loads the current questionnaire and submits the full answer set.
- `/questionnaire-profile`: readonly questionnaire profile v3.
- `/onboarding/photo-upload`: upload or update onboarding photos.
- `/onboarding/photo-preference`: photo / visual preference step.
- `/preview-pool`: readonly latest active preview pool and shortlist contract viewer.
- `/matching-waiting`: matching status and orchestration / job bridge surface.
- `/final-match`: final match result, display candidate, score display, technical details, and optional AI/RRM readouts.
- `/chat`: conversation messages, summaries, feedback, profile suggestions, and related chat UX.
- `/chat/timeline`: read-only relationship timeline.
- `/copilot`: standalone read-only Copilot insight page.
- `/my-activity`: feedback and activity surface.
- `/admin/photo-review`: photo review admin surface.
- `/admin/ai-sim-job-triage` and `/admin/ai-sim-job-diagnostic`: AI simulation diagnostics.
- `/admin/p76/*`: controlled P7.6 / P7.10 admin review and sidecar surfaces.

---

## 5. Key APIs

### Public or lightly protected endpoints

- `POST /auth/register`
- `POST /auth/login`
- `GET /questionnaire/questions`
- `GET /questionnaire/profile/:userId`

### JWT-protected user endpoints

- `GET /auth/me`
- `POST /images`
- `GET /images/user/:userId`
- `DELETE /images/:id`
- `POST /questionnaire/submit`
- `GET /preview-pool/user/:userId/latest`
- `POST /matching/enqueue`
- `GET /matching/status/:userId`
- `GET /matching/result/:userId`
- `GET /summary-ai/conversations/:conversationId`
- `GET /match-explanation-ai/match-results/:matchResultId`
- `GET /interaction-simulation-lite/match-results/:matchResultId`
- `GET /match-readout-fusion/match-results/:matchResultId`
- `POST /chat/conversations`
- `GET /chat/conversations/:conversationId`
- `POST /chat/messages`
- `GET /chat/conversations/:conversationId/timeline`
- `GET /chat/conversations/:conversationId/summary`
- `POST /chat/conversations/:conversationId/summary/generate`
- `POST /chat/conversations/:conversationId/profile-completion-suggestion`
- `GET /chat/conversations/:conversationId/rrm-observed-summary`
- `POST /chat/conversations/:conversationId/rrm-assistant-draft-assessment`
- `GET /chat/conversations/:conversationId/rrm-timeline-summary`
- `POST /feedback`
- `GET /feedback/mine`
- `POST /profile-suggestions`
- `GET /profile-suggestions/mine`
- `POST /profile-suggestions/:id/accept`
- `POST /profile-suggestions/:id/dismiss`
- `POST /behavior-signals`
- `GET /behavior-signals/mine`
- `GET /analytics/p2-overview/mine`
- `GET /copilot/conversations/:conversationId/insights`

### Admin / internal endpoints

- `GET /admin/capabilities`
- `POST /admin/batch-match/run-once`
- `GET /admin/matching-observability/summary`
- `GET /admin/rrm-observation/summary`
- `GET /admin/rrm-eval/aggregate`
- `POST /admin/post-pool-deep-screen/run-orchestration-mvp`
- `GET /admin/ai-simulation/v1/jobs`
- `GET /admin/ai-simulation/v1/jobs/:jobId`
- `POST /admin/ai-simulation/v1/jobs/:jobId/run`
- `POST /admin/ai-pairwise-decision/jobs`
- `POST /admin/ai-pairwise-decision/jobs/:jobId/run`
- `GET /admin/ai-pairwise-decision/jobs/:jobId`

Protected endpoints validate the token user against the request `userId`, `senderUserId`, or ownership context where applicable.

---

## 6. RRM Capabilities and Boundaries

RRM is not "one formula everywhere". The project uses the M5.1 three-layer model.

### Core

The only full Core implementation is RRM-Sim:

- source version: `rrm-sim-v1`
- main evaluator: `evaluateRrmSimFromSimulationV2`
- formula helper: `computeRfiScenario`

### Signal Adapters

- `rrm-observed-v1`: observed chat signal summary.
- `rrm-assistant-v1`: draft classification and ActionFit when a draft contains advancement.
- `rrm-timeline-v1`: trend summary and advancement-window rhythm bands.

### Consumers

- `rrm-eval-v1`: de-identified cohort evaluation aggregate.
- final match explanation / readout surfaces: consume existing summaries; do not recompute RFI.
- admin observability: observes pipeline health and aggregates; does not drive matching decisions.

### Non-goals

- Pairwise is not RRM Core.
- Feedback is not an RFI calculator.
- Eval does not compute per-user RFI.
- Chat / Timeline / Observed data must not masquerade as `rrm-sim-v1`.
- RRM read paths do not rewrite `candidateUserId` or `finalScore`.

---

## 7. Local Development

### Requirements

- Node.js >= 20
- pnpm >= 9
- PostgreSQL
- Docker / Docker Compose for local infrastructure if desired

### Install

```bash
pnpm install
```

### Start local services

Use separate terminals:

```bash
pnpm dev:api
pnpm dev:web
pnpm dev:worker
```

Common local addresses:

- Web: `http://localhost:5173`
- API: check `.env` / `API_PORT` and the API startup log
- Admin app: usually `http://localhost:5174` when started with `pnpm dev:admin`

### Build checks

```bash
pnpm --filter @peima/api build
pnpm --filter @peima/web build
```

### RRM / integration test smoke

```bash
cd apps/api
pnpm exec jest --config ./jest.config.cjs --testPathPattern="rrm-shared|rrm-sim|rrm-observed|rrm-assistant|rrm-timeline|rrm-eval|rrm-observation|matching-observability"
```

---

## 8. Environment Variables

The root `.env` controls local runtime behavior. Important keys include:

- `DATABASE_URL`
- `DOCKER_DATABASE_URL`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `VITE_API_BASE_URL`
- `API_PORT`
- `PEIMA_ADMIN_USER_IDS`
- `P2_ANALYTICS_GLOBAL_OVERVIEW_USER_IDS`
- `PEIMA_TEST_MATCH_*`
- `AI_*`
- `AI_SIMULATION_V1_*`
- `AI_PAIRWISE_DECISION_*`
- `SUMMARY_AI_*`
- `MATCH_EXPLANATION_AI_*`
- `FINAL_MATCH_CONCLUSION_AI_*`
- `MATCH_REVIEW_AI_*`
- `INTERACTION_SIMULATION_LITE_*`
- `PROFILE_COMPLETION_AI_*`

Do not commit:

- `.env`
- API keys
- database passwords
- local export files
- temporary debug files
- extracted docx artifacts

When copying environment variables from external files, keep local database keys aligned with the local PostgreSQL instance. An API key bundle may accidentally overwrite `DATABASE_URL` or `POSTGRES_PASSWORD`.

---

## 9. Docker Quick Start

This is for local smoke testing, not a production-grade deployment.

```bash
cp .env.example .env
docker compose up -d postgres
docker compose run --rm api pnpm --filter @peima/database db:migrate -- --name docker_init
docker compose up -d --build api worker web
```

Useful checks:

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f web
```

Expected signs:

- Postgres / API / worker / web are up.
- API maps routes and listens on the configured port.
- worker logs `worker started`.
- Web is available at the configured Vite port.

---

## 10. Minimal Manual Smoke Test

For a quick end-to-end confidence check:

1. Start API and Web.
2. Open `http://localhost:5173`.
3. Log in with a test account.
4. Open `/preview-pool`.
5. Confirm the latest active preview pool appears, or the page clearly reports no active pool.
6. Open `/matching-waiting`.
7. Run or wait for matching jobs.
8. Open `/final-match`.
9. Enter `/chat`.
10. If a conversation exists, check `/chat/timeline`, Copilot, and RRM chat summaries.

For RRM-specific smoke:

- `GET /chat/conversations/:conversationId/rrm-observed-summary`
- `POST /chat/conversations/:conversationId/rrm-assistant-draft-assessment`
- `GET /chat/conversations/:conversationId/rrm-timeline-summary`
- `GET /admin/rrm-eval/aggregate`

These endpoints are read-only relative to `MatchResult` and scoring.

---

## 11. Current Limitations

The repository is a broad MVP and engineering validation surface. It is not yet:

- a fully autonomous AI relationship platform
- a unified multi-agent orchestration product
- a production-grade all-LLM matching engine
- a system where AI simulation automatically determines every match result
- a system where RRM rewrites `finalScore`
- a system where RRM overwrites `MatchResult.candidateUserId`
- a system where all production worker pollers / auto-apply flows are enabled by default

Scoring V2, RRM Top2, Pairwise, Copilot, interaction simulation, and profile suggestions are all bounded capabilities with explicit contracts.

---

## 12. Repository Map

```text
apps/api
  NestJS API: auth, users, preferences, images, preview-pool, questionnaire,
  matching, chat, feedback, profile suggestions, analytics, Copilot,
  RRM adapters, admin endpoints, AI result-layer endpoints.

apps/web
  User-facing React app: login, questionnaire, profile, preview pool,
  matching wait, final match, chat, timeline, Copilot, activity, diagnostics.

apps/admin
  Admin React app and operational pages.

apps/worker
  Batch matching, cron, AI job consumers, pairwise worker polling.

packages/database
  Prisma schema, migrations, PrismaClient exports, observability helpers.

packages/shared
  Shared runtime constants, types, preference/scoring helpers.

docs
  Phase plans, implementation notes, closeouts, acceptance records, runbooks.
```

---

## 13. Documentation Index

### M-series

- [M5.1 RRM three-layer closeout](./docs/M5/M5.1-closeout.md)
- [M5 closure](./docs/M5/M5-closure.md)
- [M5.6 RRM Top2 controlled production path](./docs/M5/M5.6-closure-rrm-top2-controlled-production-path.md)
- [M6.0 index](./docs/M6/M6.0-index.md)
- [M3.8 Top2 + Pairwise closure](./docs/M3/M3.8-top2-pairwise-ai-decision-simulation-closure.md)
- [M4 overall AI matching phase one closure](./docs/M4/M4-overall-ai-matching-phase-one-closure.md)

### P-series

- [P3 relationship timeline](./docs/P3/P3-relationship-timeline.md)
- [P4 questionnaire profile v3](./docs/P4/P4.3-questionnaire-profile-v3.md)
- [P5 operations and history plan](./docs/P5/P5-operations-and-history-plan.md)
- [P6 docs index](./docs/P6/README.md)
- [P6 current status](./docs/P6/P6-current-status-v0.md)
- [P6 operating notes](./docs/P6/P6-operating-notes-v0.md)

### Useful acceptance / spec docs

- [P6.8 conversation profile completion round 1](./docs/P6/acceptance/P6.8-conversation-profile-completion-round1.md)
- [P6.9 governance round 1](./docs/P6/acceptance/P6.9-conversation-profile-suggestion-governance-round1.md)
- [P6.10 UX hinting round 1](./docs/P6/acceptance/P6.10-conversation-profile-suggestion-ux-hinting-round1.md)
- [P6.y interaction simulation lite](./docs/P6/specs/P6.y-interaction-simulation-lite.md)

---

## 14. License

Private / TBD
