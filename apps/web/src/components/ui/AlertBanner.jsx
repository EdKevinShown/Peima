const variants = {
  error: "border-red-400/40 bg-red-500/10 text-red-100",
  warn: "border-amber-400/40 bg-amber-500/10 text-amber-50",
  info: "border-sky-400/40 bg-sky-500/10 text-sky-50",
  success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-50",
  admin: "border-amber-400/50 bg-amber-500/15 text-amber-50",
};

export default function AlertBanner({ variant = "info", title, children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${variants[variant] || variants.info} ${className}`}
      role={variant === "error" ? "alert" : undefined}
    >
      {title ? <p className="font-semibold mb-1">{title}</p> : null}
      {children}
    </div>
  );
}
