import { pickHeroMainIntro } from "./finalMatchNarrative";

/**
 * Top hero — score + short intro (dark theme).
 */
export default function FinalMatchHero({
  isRrmDisplay,
  finalScore,
  createdAt,
  formatScoreDisplay,
  formatDateShort,
  primaryResolution,
}) {
  const intro = pickHeroMainIntro(isRrmDisplay);
  const pr = primaryResolution ?? { kind: "legacy", finalScore };
  const isV2Primary = pr.kind === "v2";
  const scoreLabel = isRrmDisplay ? "基础适配指数" : "匹配指数";

  return (
    <header className="pb-4 mb-4 border-b border-white/[0.07]">
      <h1 className="text-lg font-bold text-white mb-2">本轮匹配说明</h1>
      <p className="text-sm text-white/75 leading-relaxed font-medium mb-4">{intro}</p>

      <div className="pt-1">
        {isV2Primary ? (
          <>
            <p className="text-xs text-white/45 tracking-wide mb-1">{pr.title}</p>
            <p className="text-4xl font-extrabold leading-none">
              <span className="text-gradient">{pr.scoreText}</span>
              <span className="text-xl font-bold text-white/80 ml-1">{pr.suffix}</span>
            </p>
            {pr.subtitle ? (
              <p className="mt-2 text-sm font-semibold text-white/85">{pr.subtitle}</p>
            ) : null}
            {pr.footnote ? (
              <p className="mt-2 text-xs text-white/50 leading-relaxed">{pr.footnote}</p>
            ) : null}
          </>
        ) : isRrmDisplay ? (
          <>
            <p className="text-xs text-white/45 mb-1">{scoreLabel}</p>
            <p className="text-4xl font-extrabold text-gradient leading-none">
              {formatScoreDisplay(finalScore)}
            </p>
            <p className="mt-2 text-xs text-white/50 leading-relaxed">
              分数来自基础资料与问卷适配度；展示对象还结合了相处节奏判断。
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-white/45 mb-1">{scoreLabel}</p>
            <p className="text-4xl font-extrabold text-gradient leading-none">
              {formatScoreDisplay(finalScore)}
            </p>
          </>
        )}
        {pr.kind === "legacy_fallback" && pr.heroHint ? (
          <p className="mt-2 text-xs text-amber-200/80 leading-relaxed" role="status">
            {pr.heroHint}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-white/35">结果更新于 {formatDateShort(createdAt)}</p>
      </div>
    </header>
  );
}
