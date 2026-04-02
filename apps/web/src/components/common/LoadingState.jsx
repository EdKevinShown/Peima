export default function LoadingState({ label = "加载中…" }) {
  return (
    <p style={{ margin: 0, color: "#555" }} role="status">
      {label}
    </p>
  );
}
