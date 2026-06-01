import { AXIS_LABELS } from "../../utils/questionnaireProfileDisplay";
import {
  getAxisIcon,
  getGroupIcon,
  strengthAriaLabel,
  strengthToLevel,
} from "../../utils/questionnaireProfileVisuals";

function StrengthMeter({ level, strength, uncertain }) {
  const safe = Math.max(1, Math.min(5, level));
  return (
    <div
      className={`qp-strength-meter${uncertain ? " qp-strength-meter--uncertain" : ""}`}
      role="img"
      aria-label={strengthAriaLabel(strength)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`qp-strength-meter__bar${i <= safe ? " qp-strength-meter__bar--on" : ""}`}
        />
      ))}
    </div>
  );
}

/**
 * @param {{ row: object; summary: { summary: string } }} props
 */
export default function DimensionVisualRow({ row, summary }) {
  const Icon = getAxisIcon(row.axisKey);
  const level = strengthToLevel(row.strength, row.sortScore);
  const uncertain = row.strength === "尚在权衡";

  return (
    <article
      className={`qp-dim-row qp-dim-row--visual${row.linked ? " qp-dim-row--linked" : ""}`}
    >
      <div className="qp-dim-row__icon-wrap" aria-hidden>
        <Icon size={24} strokeWidth={1.75} className="qp-dim-row__icon" />
      </div>
      <div className="qp-dim-row__content">
        <div className="qp-dim-row__head">
          <span className="qp-dim-row__name">{AXIS_LABELS[row.axisKey]}</span>
          {row.strength ? (
            <span
              className={`qp-dim-row__badge${uncertain ? " qp-dim-row__badge--open" : ""}`}
            >
              {row.strength}
            </span>
          ) : null}
        </div>
        <StrengthMeter level={level} strength={row.strength} uncertain={uncertain} />
        <p className="qp-dim-row__text">{summary.summary}</p>
      </div>
    </article>
  );
}

/**
 * @param {{ groupId: string; title: string; count: number }} props
 */
export function DimensionGroupSummary({ groupId, title, count }) {
  const Icon = getGroupIcon(groupId);
  return (
    <span className="qp-dim-group__summary-inner">
      <span className="qp-dim-group__summary-icon" aria-hidden>
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="qp-dim-group__summary-text">{title}</span>
      <span className="qp-dim-group__summary-count">{count} 项</span>
    </span>
  );
}
