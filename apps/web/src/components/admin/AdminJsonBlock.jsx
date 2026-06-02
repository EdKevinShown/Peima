import { adminJsonPre } from "./adminTheme";

export default function AdminJsonBlock({ value, maxHeightClass = "max-h-60", className = "" }) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className={`${adminJsonPre} ${maxHeightClass} ${className}`}>{text}</pre>
  );
}
