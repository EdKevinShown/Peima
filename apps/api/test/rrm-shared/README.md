# `apps/api/test/rrm-shared`

M5.1-r3 contract tests for `apps/api/src/modules/rrm-shared/`.

| File | Scope |
|------|--------|
| `support/contract.ts` | Shared key lists + `assertRrmSignalSummaryBaseV1` |
| `rrm-source-version.registry.spec.ts` | Registry guards (from r2) |
| `rrm-registry.contract.spec.ts` | Full registry meta consistency |
| `rrm-signal-summary.contract.spec.ts` | `RrmSignalSummaryBaseV1` envelope |
| `rrm-core-formula.contract.spec.ts` | Core I/O ↔ `computeRfiScenario` |
| `rrm-sim-result.registry-alignment.spec.ts` | Live `RrmSimResult` uses registry |

```bash
pnpm exec jest --config ./jest.config.cjs --testPathPattern=rrm-shared
```
