import { adminBadgeToneClass } from "./adminTheme";

const STATUS_TONE = {
  pending: "pending",
  queued: "pending",
  running: "pending",
  skipped: "skipped",
  applied: "applied",
  rolled_back: "rolled_back",
  failed: "failed",
  error: "failed",
  success: "success",
  completed: "success",
  ok: "ok",
  fallback: "fallback",
  disabled: "disabled",
  warning: "warning",
  blocked: "warning",
  p0: "p0",
};

function resolveTone(status, tone) {
  if (tone) return tone;
  if (!status) return "muted";
  const key = String(status).toLowerCase().replace(/\s+/g, "_");
  return STATUS_TONE[key] ?? "muted";
}

export default function AdminStatusBadge({ status, tone, label, className = "" }) {
  const text = label ?? status ?? "—";
  const resolved = resolveTone(status, tone);
  const cls = adminBadgeToneClass[resolved] ?? adminBadgeToneClass.muted;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-medium ${cls} ${className}`}
    >
      {text}
    </span>
  );
}
