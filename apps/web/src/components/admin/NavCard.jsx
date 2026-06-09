import { Link } from "react-router-dom";

export default function NavCard({ to, Icon, title, desc }) {
  return (
    <Link
      to={to}
      className="glass rounded-2xl p-4 flex items-start gap-3 transition-colors duration-200 hover:bg-white/[0.12] group no-underline"
    >
      <span
        className="flex-shrink-0 mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,107,157,0.18) 0%, rgba(196,77,255,0.14) 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <Icon size={18} strokeWidth={1.7} className="text-white/90" />
      </span>
      <div>
        <p className="text-sm font-semibold text-white group-hover:text-gradient">{title}</p>
        <p className="text-xs text-white/45 mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}
