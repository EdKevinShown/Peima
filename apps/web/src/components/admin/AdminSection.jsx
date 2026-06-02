export default function AdminSection({ title, children, className = "" }) {
  return (
    <section className={`glass rounded-2xl p-4 sm:p-5 mb-4 ${className}`}>
      {title ? <h2 className="text-sm font-semibold text-white/80 mb-3">{title}</h2> : null}
      {children}
    </section>
  );
}
