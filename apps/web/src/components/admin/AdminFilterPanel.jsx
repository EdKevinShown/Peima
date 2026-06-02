export default function AdminFilterPanel({ title = "筛选", actions, children, className = "" }) {
  return (
    <section className={`glass rounded-2xl p-4 mb-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <strong className="text-sm text-white/80">{title}</strong>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">{children}</div>
    </section>
  );
}
