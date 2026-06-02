import AdminEmptyState from "./AdminEmptyState";

/**
 * Dark-themed data table for admin pages.
 * columns: { key, label, render?(row), className? }
 */
export default function AdminDataTable({
  columns,
  rows,
  rowKey = "id",
  emptyMessage = "暂无数据",
  highlightRow,
  className = "",
}) {
  if (!rows?.length) {
    return <AdminEmptyState message={emptyMessage} />;
  }

  return (
    <div className={`admin-table-wrap ${className}`}>
      <table className="w-full min-w-[520px] text-sm border-collapse">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-left font-semibold text-white/65 px-2 py-2.5 whitespace-nowrap text-xs ${col.className || ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const key = row[rowKey] ?? row.id ?? idx;
            const highlighted = highlightRow?.(row, idx);
            return (
              <tr
                key={key}
                className={`border-b border-white/5 last:border-0 ${
                  highlighted ? "bg-emerald-500/10" : "hover:bg-white/5"
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-2 py-2 text-white/85 align-top text-xs ${col.className || ""}`}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
