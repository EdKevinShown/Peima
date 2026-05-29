# P7.6-r9e3f — Secret Rotation Note

> **Staging only** · no secret values in this file

## Status

| Secret class | Rotation status | Notes |
|--------------|-----------------|-------|
| `DATABASE_URL` (Supabase staging) | **requires_rotation_or_confirm** | Used in local `.env.staging` for bootstrap; confirm ops vault is canonical |
| `JWT_SECRET` (staging API) | **requires_rotation_or_confirm** | Align Render + local signing; never commit to artifacts |
| Readonly DB password | **requires_rotation_or_confirm** | `PEIMA_READONLY_DATABASE_URL` session-only |
| `PEIMA_ADMIN_SERVICE_TOKEN` | **requires_rotation_or_confirm** | Admin smoke / watch only |

## Policy

- Artifacts **must not** contain tokens, full connection strings, or JWT material
- After r9e3e fixture + r9e3f watch, ops should **rotate or confirm** staging secrets if they were exposed in local dev files
- Customer production credentials: **not used** in this slice
