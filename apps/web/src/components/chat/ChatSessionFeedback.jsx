import { useCallback, useMemo, useState } from "react";

/** 对外展示的快捷心情（映射 1–5 结构化评分） */
const MOOD_OPTIONS = [
  { value: 5, emoji: "😊", label: "挺开心" },
  { value: 4, emoji: "🙂", label: "还不错" },
  { value: 3, emoji: "😐", label: "一般" },
  { value: 2, emoji: "😕", label: "有点别扭" },
  { value: 1, emoji: "😞", label: "不太想聊了" },
];

const CONTINUE_OPTIONS = [
  { value: 5, label: "想继续聊" },
  { value: 3, label: "再看看" },
  { value: 1, label: "先缓缓" },
];

/** 根据整体感受推导 P6.12 各维度（用户不必逐项打分） */
export function deriveFeedbackDimensions(overall, overrides = {}) {
  const o = overall;
  return {
    continueIntent: overrides.continueIntent ?? o,
    comfortLevel: overrides.comfortLevel ?? o,
    replyQuality: overrides.replyQuality ?? o,
    safetyFeeling: overrides.safetyFeeling ?? o,
    awkwardness: overrides.awkwardness ?? Math.max(1, Math.min(5, 6 - o)),
  };
}

/**
 * 聊后感受：主路径为点选心情 + 可选续聊意愿与留言。
 */
export default function ChatSessionFeedback({
  overallRating,
  onOverallRatingChange,
  continueIntent,
  onContinueIntentChange,
  comment,
  onCommentChange,
  submitting,
  resultMessage,
  errorMessage,
  onSubmit,
  showAdvanced = false,
}) {
  const [showMore, setShowMore] = useState(false);
  const [advanced, setAdvanced] = useState(() =>
    deriveFeedbackDimensions(overallRating, { continueIntent }),
  );

  const syncAdvancedFromOverall = useCallback(
    (overall) => {
      setAdvanced((prev) =>
        deriveFeedbackDimensions(overall, {
          continueIntent: prev.continueIntent ?? continueIntent,
        }),
      );
    },
    [continueIntent],
  );

  const handleMood = (value) => {
    onOverallRatingChange(value);
    if (value <= 2) onContinueIntentChange(1);
    else if (value >= 4) onContinueIntentChange(5);
    else onContinueIntentChange(3);
    syncAdvancedFromOverall(value);
  };

  const derivedPreview = useMemo(
    () => deriveFeedbackDimensions(overallRating, { continueIntent }),
    [overallRating, continueIntent],
  );

  const handleSubmit = () => {
    const dims = showAdvanced
      ? { ...deriveFeedbackDimensions(overallRating, { continueIntent }), ...advanced }
      : deriveFeedbackDimensions(overallRating, { continueIntent });
    onSubmit(dims);
  };

  if (resultMessage) {
    return (
      <div className="chat-feedback-quick chat-feedback-quick--done" aria-live="polite">
        <p className="chat-feedback-quick__thanks">{resultMessage}</p>
      </div>
    );
  }

  return (
    <div className="chat-feedback-quick" aria-label="聊后感受">
      <p className="chat-feedback-quick__title">这次聊得怎么样？</p>
      <p className="chat-feedback-quick__hint">点一下就好，对方看不到，也不影响匹配。</p>

      <div className="chat-mood-chips" role="group" aria-label="整体感受">
        {MOOD_OPTIONS.map((m) => (
          <button
            key={m.value}
            type="button"
            className={`chat-mood-chip${overallRating === m.value ? " chat-mood-chip--on" : ""}`}
            disabled={submitting}
            aria-pressed={overallRating === m.value}
            onClick={() => handleMood(m.value)}
          >
            <span className="chat-mood-chip__emoji" aria-hidden>
              {m.emoji}
            </span>
            <span className="chat-mood-chip__label">{m.label}</span>
          </button>
        ))}
      </div>

      <p className="chat-feedback-quick__sub">还想再聊聊吗？</p>
      <div className="chat-continue-chips" role="group" aria-label="续聊意愿">
        {CONTINUE_OPTIONS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`chat-continue-chip${continueIntent === c.value ? " chat-continue-chip--on" : ""}`}
            disabled={submitting}
            aria-pressed={continueIntent === c.value}
            onClick={() => onContinueIntentChange(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <textarea
        className="input-glass chat-feedback-quick__comment"
        rows={2}
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        placeholder="想说一句可以写这里（可不填）"
        disabled={submitting}
      />

      <div className="chat-feedback-quick__actions">
        <button
          type="button"
          className="btn-primary text-sm py-2.5 px-5"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "提交中…" : "好了"}
        </button>
        {errorMessage ? <span className="chat-status-err">{errorMessage}</span> : null}
      </div>

      {showAdvanced ? (
        <details
          className="chat-feedback-advanced"
          open={showMore}
          onToggle={(e) => setShowMore(e.currentTarget.open)}
        >
          <summary>细项打分（管理员）</summary>
          <p className="chat-feedback-advanced__note">
            自动推导：续聊 {derivedPreview.continueIntent} · 舒适 {derivedPreview.comfortLevel} · 回应{" "}
            {derivedPreview.replyQuality} · 安全 {derivedPreview.safetyFeeling} · 别扭{" "}
            {derivedPreview.awkwardness}
          </p>
          {[
            ["续聊意愿", "continueIntent"],
            ["舒适度", "comfortLevel"],
            ["对方回应", "replyQuality"],
            ["安全感", "safetyFeeling"],
            ["别扭感", "awkwardness"],
          ].map(([label, key]) => (
            <label key={key} className="chat-feedback-advanced__row">
              {label}
              <select
                value={advanced[key] ?? derivedPreview[key]}
                onChange={(e) =>
                  setAdvanced((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                }
                disabled={submitting}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </details>
      ) : null}
    </div>
  );
}
