# Matching observability tests (P7.11-r1 / M4.4-M2)

Modular layout for Admin matching observability (`buildMatchingObservabilitySummary` + HTTP).

| Module | File | What it covers |
|--------|------|----------------|
| Contract | `support/contract.ts` | Required report keys; forbidden ID/prompt fields |
| Fixtures | `support/fixtures.ts` | Shared numeric / meta samples |
| Prisma mock | `support/prisma.mock.ts` | In-memory Prisma stub for builder tests |
| Builder · pairwise | `builder.pairwise.spec.ts` | `pairwise.*` aggregates |
| Builder · simulation | `builder.simulation.spec.ts` | `simulation.*` aggregates |
| Builder · finalize | `builder.finalize-meta.spec.ts` | `finalizeMeta.*` + meta parse |
| Builder · match/preview | `builder.match-preview.spec.ts` | `matchAndPreview.*` |
| Builder · empty | `builder.empty-window.spec.ts` | Zero-row window |
| Contract · shape | `contract.report-shape.spec.ts` | Full report contract (rich mock) |
| Service · query | `service.query.spec.ts` | `limit` / `sinceDays` parsing |
| Service · wiring | `service.wiring.spec.ts` | Service delegates to builder (mock) |
| Admin HTTP | `admin.controller.spec.ts` | JWT admin gate + error mapping |
| Stub · DB e2e | `stubs/db-integration.e2e.stub.spec.ts` | Real `DATABASE_URL` parity (todo) |
| Stub · CLI parity | `stubs/cli-api-parity.stub.spec.ts` | CLI vs API numeric parity (todo) |
| Stub · M4.1 | `stubs/m42-four-source.stub.spec.ts` | Four-source agreement not in summary (todo) |

Run all:

```bash
cd apps/api
pnpm exec jest --config ./jest.config.cjs --testPathPattern=matching-observability
```
