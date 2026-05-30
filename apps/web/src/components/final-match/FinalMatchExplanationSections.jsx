import { useMemo } from "react";
import {
  plainWhyBullets,
  buildPlainCoexistence,
  buildPlainChatPredictionBullets,
  reviewStaticScoreBand,
} from "./finalMatchPlainLanguage";

/**
 * Plain-language sections (dark theme).
 */
export default function FinalMatchExplanationSections({
  isRrmDisplay,
  insights,
  openingTopics,
  interactionSim,
  interactionSimLoading,
  interactionSimError,
  onFetchInteractionSim,
  matchReview,
  matchReviewLoading,
  matchReviewError,
  onRequestMatchReview,
}) {
  const whyLines = useMemo(() => plainWhyBullets(isRrmDisplay), [isRrmDisplay]);
  const coexist = useMemo(() => buildPlainCoexistence(insights, matchReview), [insights, matchReview]);

  const topics = Array.isArray(openingTopics) ? openingTopics.filter((t) => typeof t === "string" && t.trim()) : [];
  const generatedChatBullets = useMemo(() => {
    if (interactionSim == null || typeof interactionSim !== "object") return [];
    return buildPlainChatPredictionBullets(interactionSim, topics).slice(0, 4);
  }, [interactionSim, topics]);

  const reviewScore = matchReview?.reviewStaticScore;
  const hasReview = matchReview && typeof reviewScore === "number";
  const band = hasReview ? reviewStaticScoreBand(reviewScore) : "";

  return (
    <div className="flex flex-col gap-3">
      <section className="final-match-section" aria-labelledby="why-recommend-heading">
        <h2 id="why-recommend-heading" className="text-base font-semibold text-white mb-2">
          为什么推荐
        </h2>
        {isRrmDisplay ? (
          <div className="mb-3 rounded-xl bg-white/[0.05] border border-white/8 px-3 py-2 text-sm text-white/70 leading-relaxed">
            <div className="font-semibold text-white/90">关系节奏推荐已启用</div>
            <div className="mt-1">系统在基础适配候选中，参考相处节奏来决定本轮展示对象。</div>
          </div>
        ) : null}
        <ul className="m-0 pl-5 text-sm text-white/70 leading-relaxed space-y-1.5">
          {whyLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="final-match-section" aria-labelledby="coexist-heading">
        <h2 id="coexist-heading" className="text-base font-semibold text-white mb-2">
          相处建议
        </h2>
        <div className="flex flex-col gap-2 text-sm text-white/70 leading-relaxed">
          <div>
            <strong className="text-white/90">建议节奏：</strong>
            {coexist.rhythm}
          </div>
          <div>
            <strong className="text-white/90">需要留意：</strong>
            {coexist.caution}
          </div>
          <div>
            <strong className="text-white/90">聊天方式：</strong>
            {coexist.chat}
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onRequestMatchReview}
            disabled={matchReviewLoading}
            className="btn-ghost text-sm py-2 px-4"
          >
            {matchReviewLoading ? "正在获取相处参考" : hasReview ? "刷新相处参考" : "获取相处参考"}
          </button>
          {matchReviewError ? (
            <p className="mt-2 text-sm text-pink-300/90">暂时无法生成相处参考，请稍后再试。</p>
          ) : null}
          {hasReview ? (
            <div className="mt-2 text-xs text-white/50 leading-relaxed">
              <span className="text-white/75 font-medium">相处参考：{band}</span>
              {typeof reviewScore === "number" ? (
                <span className="ml-1">（{Math.round(reviewScore)} / 100，仅供参考）</span>
              ) : null}
              <p className="mt-1">不会改变本轮推荐结果。</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="final-match-section" aria-labelledby="first-chat-heading">
        <h2 id="first-chat-heading" className="text-base font-semibold text-white mb-2">
          第一次可以这样聊
        </h2>
        {topics.length ? (
          <>
            <p className="text-xs font-medium text-white/45 mb-1.5">可以先问：</p>
            <ul className="m-0 mb-3 pl-5 text-sm text-white/70 leading-relaxed space-y-1">
              {topics.slice(0, 3).map((t, i) => (
                <li key={i}>{t.trim()}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mb-3 text-sm text-white/50">
            可以从周末安排、最近开心的小事、平时的生活节奏这类轻松话题开始。
          </p>
        )}
        <button
          type="button"
          onClick={onFetchInteractionSim}
          disabled={interactionSimLoading}
          className="btn-ghost text-sm py-2 px-4"
        >
          {interactionSimLoading ? "正在生成聊天预判" : "生成初次聊天预判"}
        </button>
        {interactionSimError ? (
          <p className="mt-2 text-sm text-pink-300/90 leading-relaxed">
            暂时无法生成聊天预判，请稍后再试。你也可以先从轻松话题开始聊天。
          </p>
        ) : null}
        {generatedChatBullets.length > 0 ? (
          <>
            <p className="text-xs font-medium text-white/45 mt-3 mb-1.5">生成后的聊天建议：</p>
            <ul className="m-0 pl-5 text-sm text-white/60 leading-relaxed space-y-1">
              {generatedChatBullets.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
