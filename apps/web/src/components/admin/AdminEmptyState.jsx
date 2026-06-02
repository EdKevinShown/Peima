export default function AdminEmptyState({ message = "暂无数据", className = "" }) {
  return (
    <p className={`text-sm text-white/45 py-8 text-center ${className}`} role="status">
      {message}
    </p>
  );
}
