import AdminIdPill from "./AdminIdPill";

function metaLine(brief) {
  if (!brief) return null;
  const parts = [];
  if (brief.gender) parts.push(brief.gender);
  if (brief.age != null && Number.isFinite(brief.age)) parts.push(`${brief.age}岁`);
  if (brief.city) parts.push(brief.city);
  if (brief.phoneTail) parts.push(`尾号${brief.phoneTail}`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * @param {{ brief?: { userId: string, nickname?: string | null }, onSelectUserId?: (id: string) => void, role?: string }} props
 */
export default function TestingMatchUserCell({ brief, onSelectUserId, role }) {
  if (!brief?.userId) return <span className="text-white/35">—</span>;
  const label = brief.nickname?.trim() || "（无昵称）";
  const meta = metaLine(brief);
  const idBtn = onSelectUserId ? (
    <button
      type="button"
      className="text-left hover:text-white"
      onClick={() => onSelectUserId(brief.userId)}
    >
      <AdminIdPill id={brief.userId} truncate={0} title={brief.userId} />
    </button>
  ) : (
    <AdminIdPill id={brief.userId} truncate={0} title={brief.userId} />
  );

  return (
    <div className="min-w-[140px]">
      {role ? (
        <span className="text-[0.65rem] uppercase tracking-wide text-white/40">{role}</span>
      ) : null}
      <p className="text-sm font-medium text-white/90">{label}</p>
      {meta ? <p className="text-xs text-white/55 mt-0.5">{meta}</p> : null}
      <div className="mt-1">{idBtn}</div>
    </div>
  );
}
