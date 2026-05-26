# Peima / 配吗

Languages: [中文](./README.md) · **English**

Peima is an AI-assisted relationship matching MVP. The repository combines a user-facing matching flow, a NestJS API, a worker pipeline, Prisma/PostgreSQL persistence, and a set of RRM (Relationship Rhythm Model) read-only / controlled-display capabilities.

This English README is a compact bilingual entry point. The detailed and most up-to-date project history is still maintained in the Chinese [README.md](./README.md) and the milestone documents under `docs/`.

## Current Status

- **P0**: The core product flow is stable: login, questionnaire, preview pool, matching wait, final match, and chat.
- **P1**: Structured placeholder capabilities are in place, including match insights, chat summaries, preview pool metadata, worker engineering, and copy guardrails.
- **P2 / P2.5**: Chat summaries, structured feedback, profile suggestions with explicit accept/dismiss, behavior signals, lightweight analytics, Copilot read-only suggestions, and related web UX improvements have landed.
- **P3**: The relationship timeline slice is complete: readonly timeline API, `/chat/timeline`, Final Match secondary entry, and long-message pagination.
- **P5**: Governance and operations features are in place: lightweight RBAC, suggestion center, audit logs, notifications, and admin analytics.
- **P6**: Copilot LLM support, independent AI result-layer slices, chat-driven profile completion suggestions, governance, and ChatPage UX hinting have been implemented as bounded product slices.
- **M5 / M5.6**: RRM Top2 controlled display path is closed. It may affect `displayCandidateUserId` / `displaySourceType` when gates and eligibility pass, but it does **not** overwrite `MatchResult.candidateUserId`, does **not** rewrite `finalScore`, and keeps `GET /matching/result` read-only.
- **M5.1**: RRM three-layer architecture is closed: Core / Signal Adapter / Consumer. See [M5.1 closeout](./docs/M5/M5.1-closeout.md).
- **M6.0**: Scoring V2 core loop is complete as shadow/API/UI capability, but it has not replaced worker ranking or `MatchResult.finalScore` as the production source of truth.

## Architecture

```text
apps/web       React + Vite user app
apps/admin     React + Vite admin app
apps/api       NestJS API
apps/worker    Node.js worker / cron / batch jobs
packages/database Prisma schema, migrations, Prisma Client
packages/shared   Shared types, constants, and scoring helpers
docs/          Product and engineering milestone documentation
```

## Key Product Flow

1. Log in at `/login`.
2. Complete the questionnaire at `/questionnaire`.
3. Review the readonly questionnaire profile at `/questionnaire-profile` when available.
4. Review the latest readonly preview pool at `/preview-pool`.
5. Enter `/matching-waiting`.
6. Run or wait for matching jobs.
7. View `/final-match`.
8. Continue to `/chat`, `/copilot`, and `/chat/timeline`.

## Important Boundaries

- The current system is **not** a fully autonomous multi-agent matching platform.
- AI and RRM capabilities are delivered as bounded slices unless explicitly documented otherwise.
- RRM does **not** rewrite `MatchResult.candidateUserId`.
- RRM does **not** rewrite `finalScore`.
- Read paths such as `GET /matching/result` must remain read-only.
- The restored `/preview-pool` page is readonly. The legacy `POST /preview-pool/generate` / writer path remains removed.
- Production worker auto-polling / auto-apply for RRM hook jobs is **not** enabled by default.

## Local Development

Requirements:

- Node.js >= 20
- pnpm >= 9
- PostgreSQL, usually through local Docker or a local Postgres instance

Install dependencies:

```bash
pnpm install
```

Start services in separate terminals:

```bash
pnpm dev:api
pnpm dev:web
pnpm dev:worker
```

Common local URLs:

- Web: `http://localhost:5173`
- API: check `.env` / `API_PORT` and the API startup log

Build checks:

```bash
pnpm --filter @peima/api build
pnpm --filter @peima/web build
```

## Environment Notes

The root `.env` controls local runtime behavior. Important keys include:

- `DATABASE_URL`
- `JWT_SECRET`
- `VITE_API_BASE_URL`
- `PEIMA_ADMIN_USER_IDS`
- AI provider keys such as `AI_*`, `SUMMARY_AI_*`, `MATCH_REVIEW_AI_*`, and related module-specific prefixes

Do not commit `.env`, API keys, database credentials, or temporary local artifacts.

## Documentation Map

- [Chinese README](./README.md): full project status and detailed milestone notes.
- [M5.1 RRM three-layer closeout](./docs/M5/M5.1-closeout.md): Core / Adapter / Consumer delivery summary.
- [M5 closure](./docs/M5/M5-closure.md): RRM Top2 display path and controlled production path context.
- [M6.0 index](./docs/M6/M6.0-index.md): Scoring V2 milestones.
- [P6 docs index](./docs/P6/README.md): Copilot and AI result-layer slices.
- [P3 relationship timeline](./docs/P3/P3-relationship-timeline.md): timeline API and UI closeout.

## License

Private / TBD
