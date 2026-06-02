export default function AdminIdPill({ id, truncate = 10, title, className = "" }) {
  if (!id) return <span className="text-white/35">—</span>;
  const s = String(id);
  const display =
    truncate && s.length > truncate + 3 ? `${s.slice(0, truncate)}…` : s;
  return (
    <code
      title={title ?? s}
      className={`inline-block font-mono text-[0.68rem] px-1.5 py-0.5 rounded-md bg-white/8 border border-white/10 text-white/75 ${className}`}
    >
      {display}
    </code>
  );
}
