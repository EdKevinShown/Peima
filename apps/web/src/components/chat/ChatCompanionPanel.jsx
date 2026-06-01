import { Link } from "react-router-dom";
import { relationshipStateLabel } from "../../utils/chatCompanionLabels";

function TipList({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="chat-companion__list">
      {items.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

/**
 * 聊天页侧边栏：人性化「聊伴小记」，不提供代发/填入输入框。
 */
export default function ChatCompanionPanel({
  peerName = null,
  summary = null,
  summaryLoadError = null,
  summaryGenerating = false,
  onGenerateSummary,
  onRefreshAll,
  insights = null,
  copilotLoadError = null,
  showTechnicalMeta = false,
  feedbackHref = null,
}) {
  const mood = relationshipStateLabel(insights?.relationshipState);
  const hasSummary = Boolean(summary?.summary);
  const tips = [
    ...(insights?.communicationAdvice ?? []),
    ...(insights?.riskHints ?? []),
  ].filter(Boolean);
  const topics = insights?.suggestedTopics ?? [];
  const empty = !hasSummary && !mood && tips.length === 0 && topics.length === 0;

  return (
    <div className="chat-companion">
      {peerName ? (
        <p className="chat-companion__peer">
          关于你和 <strong>{peerName}</strong> 的这段聊天
        </p>
      ) : null}

      {mood ? <p className="chat-companion__mood">{mood}</p> : null}

      <section className="chat-companion__section" aria-labelledby="chat-companion-summary">
        <div className="chat-companion__section-head">
          <h3 id="chat-companion-summary">聊到哪了</h3>
          <button type="button" className="chat-companion__link-btn" onClick={onRefreshAll}>
            刷新
          </button>
        </div>

        {summaryLoadError ? (
          <p className="chat-companion__muted chat-companion__err" role="alert">
            暂时读不到摘要，稍后再试
          </p>
        ) : null}

        {hasSummary ? (
          <>
            <p className="chat-companion__prose">{summary.summary}</p>
            {summary.chatStageHint ? (
              <p className="chat-companion__muted">{summary.chatStageHint}</p>
            ) : null}
          </>
        ) : !summaryLoadError ? (
          <p className="chat-companion__muted">
            {empty ? "先聊几句，我会帮你记下这段对话的重点。" : "摘要还在准备中…"}
          </p>
        ) : null}

        {onGenerateSummary ? (
          <button
            type="button"
            className="chat-companion__link-btn chat-companion__link-btn--block"
            disabled={summaryGenerating}
            onClick={onGenerateSummary}
          >
            {summaryGenerating ? "正在整理…" : "根据最新消息重新整理"}
          </button>
        ) : null}
      </section>

      <section className="chat-companion__section" aria-labelledby="chat-companion-tips">
        <h3 id="chat-companion-tips">相处小贴士</h3>
        {copilotLoadError ? (
          <p className="chat-companion__muted chat-companion__err" role="alert">
            小贴士暂时加载不了
          </p>
        ) : tips.length > 0 ? (
          <TipList items={tips} />
        ) : (
          <p className="chat-companion__muted">根据聊天节奏，会在这里给你一些轻松的提醒。</p>
        )}
      </section>

      {topics.length > 0 ? (
        <section className="chat-companion__section" aria-labelledby="chat-companion-topics">
          <h3 id="chat-companion-topics">如果想找话聊</h3>
          <p className="chat-companion__muted chat-companion__topics-hint">
            只是方向参考，用你自己的话说就好。
          </p>
          <div className="chat-companion__topics">
            {topics.map((t) => (
              <span key={t} className="chat-companion__topic">
                {t}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {showTechnicalMeta && insights?.relationshipState ? (
        <p className="chat-companion__tech">
          调试：{insights.relationshipState}
          {insights.sourceType ? ` · ${insights.sourceType}` : ""}
        </p>
      ) : null}

      {feedbackHref ? (
        <Link to={feedbackHref} className="chat-companion__feedback-cta">
          留下这次聊天的感受 →
        </Link>
      ) : null}

      <p className="chat-companion__footnote">小记与反馈只有你能看到，不会发给对方。</p>
    </div>
  );
}
