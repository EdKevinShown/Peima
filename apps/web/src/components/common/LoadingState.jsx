export default function LoadingState({ label = "加载中…", className = "" }) {
  return (
    <p className={`m-0 text-sm ${className || "text-white/50"}`} role="status">
      {label}
    </p>
  );
}
