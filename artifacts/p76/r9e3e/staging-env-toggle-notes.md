# P7.6-r9e3e — Staging Render Env Toggle Notes

> **OPS ONLY** — contains fixture viewer IDs for Render dashboard. Do not treat as public evidence artifact.
> Machine-readable manifest: `tmp/p76-r9e3e-fixture-manifest.json` (gitignored under `tmp/`).

## Before GET smoke (enable read path)

Set on **peima-api-staging** (Render):

```env
PEIMA_P76_READ_PATH_ENABLED=1
PEIMA_P76_READ_PATH_VIEWER_IDS=cmpbylu4900006z38vyzal2bc,cmpbylu4r00016z382ovbkxo8,cmpbylu4x00026z38qmxenj9m,cmpbylu5200036z38istwvpz9,cmpbylu5800046z38wfh1i3vd
PEIMA_P76_READ_PATH_SOURCE_VERSION=p7.6-r7j3-staging-cohort-v1
PEIMA_P76_READ_PATH_REQUIRE_PM_SIGNOFF=1
PEIMA_P76_READ_PATH_REQUIRE_OPS_SIGNOFF=1
PEIMA_P76_READ_PATH_FALLBACK_LEGACY=1
PEIMA_P76_READ_PATH_SAFE_FALLBACK=1
PEIMA_P76_READ_PATH_STRICT_VIOLATION_BLOCK=1
PEIMA_P76_PRODUCTION_PERCENT=0
PEIMA_P76_PRODUCTION_PERCENT_ENABLED=0
PEIMA_P76_PRODUCTION_KILL_SWITCH=0
```

Redeploy / restart API after saving env.

## After GET smoke (restore safe default)

```env
PEIMA_P76_READ_PATH_ENABLED=0
PEIMA_P76_READ_PATH_VIEWER_IDS=
PEIMA_P76_PRODUCTION_PERCENT=0
PEIMA_P76_PRODUCTION_PERCENT_ENABLED=0
PEIMA_P76_PRODUCTION_KILL_SWITCH=1
```

Then run disabled-phase check: `node tmp/p76-r9e3e-staging-get-smoke.mjs`
