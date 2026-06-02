export default function AdminKpiGrid({ items, className = "" }) {
  if (!items?.length) return null;
  return (
    <section className={`mb-4 ${className}`} aria-label="聚合指标">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map((item) => (
          <div
            key={item.key ?? item.label}
            title={item.hint}
            className={`glass rounded-xl px-3 py-2 border ${
              item.p0 || item.danger
                ? "border-red-400/35 bg-red-500/10"
                : "border-white/10"
            }`}
          >
            <div className="text-[0.65rem] text-white/45 mb-0.5 truncate">{item.label}</div>
            <div
              className={`text-lg font-semibold ${
                item.p0 || item.danger ? "text-red-200" : "text-white"
              }`}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
