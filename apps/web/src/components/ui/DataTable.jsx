/**
 * Responsive data table with glass styling and horizontal scroll on narrow screens.
 *
 * columns: { key, label, render?(row), className? }
 * rows: array of objects with at least `id` or use rowKey prop
 */
export default function DataTable({
  columns,
  rows,
  rowKey = "id",
  emptyMessage = "暂无数据",
  highlightRow,
  className = "",
}) {
  if (!rows?.length) {
    return (
      <p className="text-sm text-white/45 py-6 text-center">{emptyMessage}</p>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-xl border border-white/10 ${className}`}>
      <table className="w-full min-w-[520px] text-sm border-collapse">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-left font-semibold text-white/70 px-3 py-2.5 whitespace-nowrap ${col.className || ""}`}
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
                    className={`px-3 py-2.5 text-white/85 align-top ${col.className || ""}`}
                  >
                    {col.render ? col.render(row, idx) : row[col.key]}
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
