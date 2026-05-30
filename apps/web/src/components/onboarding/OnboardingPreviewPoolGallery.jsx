import { useState } from "react";
import UserIdWithName from "../common/UserIdWithName";

const POOL_PLACEHOLDER = "/pool-silhouettes.png";

const TIER_SKIP = new Set([
  "aesthetic_fit",
  "style_similar",
  "reflow",
  "clear",
  "blurred",
  "hidden",
]);

const SCORE_REASON_SKIP = new Set([
  "aesthetic_tag_overlap",
  "style_tag_similarity",
  "reflow_explore_baseline",
  "vision_fallback_baseline",
]);

const SCORE_REASON_LABELS = {
  aesthetic_tag_overlap: "审美标签重合度高",
  style_tag_similarity: "气质与风格相近",
  reflow_explore_baseline: "探索性推荐",
  vision_fallback_baseline: "综合偏好匹配",
};

const DISPLAY_MODE_LABELS = {
  clear: "清晰",
  blurred: "朦胧",
  hidden: "待解锁",
};

function fmtScore(n) {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : null;
}

function LockIcon() {
  return (
    <svg width="18" height="22" viewBox="0 0 20 24" fill="none" aria-hidden>
      <rect x="2" y="10" width="16" height="13" rx="3" fill="rgba(255,255,255,0.28)" />
      <path
        d="M6 10V7a4 4 0 018 0v3"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function extractStyleTagsForDisplay(item) {
  const raw = [
    ...(item.itemMeta?.reasonTags ?? []),
    ...(item.itemMeta?.tags ?? []),
  ];
  const out = [];
  const seen = new Set();
  for (const t of raw) {
    const s = String(t ?? "").trim();
    if (!s) continue;
    if (TIER_SKIP.has(s)) continue;
    if (SCORE_REASON_SKIP.has(s)) continue;
    if (s.startsWith("tier=")) continue;
    if (s.startsWith("preview_pool_tier")) continue;
    if (s.includes(":fill")) continue;
    if (/^p7\./.test(s) || /^score_/.test(s) || s.includes("_shadow")) continue;
    if (/^[a-z0-9_:]+$/.test(s) && !/[\u4e00-\u9fff]/.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function tierLabel(item) {
  return (
    item.itemMeta?.shortHint ||
    (item.candidateType === "aesthetic_fit"
      ? "审美契合"
      : item.candidateType === "style_similar"
        ? "风格相似"
        : "回流探索")
  );
}

function extractScoreReasonExplanation(item) {
  const tags = item.itemMeta?.reasonTags ?? [];
  for (const raw of tags) {
    const key = String(raw ?? "").replace(/:fill$/, "");
    if (SCORE_REASON_LABELS[key]) return SCORE_REASON_LABELS[key];
    if (String(raw).includes(":fill")) return "综合分补足";
  }
  return null;
}

function SilhouetteFallback({ blurred }) {
  return (
    <div
      className="absolute inset-0 bg-cover bg-center"
      style={{
        backgroundImage: `url("${POOL_PLACEHOLDER}")`,
        filter: blurred ? "blur(10px)" : undefined,
        transform: blurred ? "scale(1.06)" : undefined,
      }}
    />
  );
}

function CardPhoto({ item, imageUrl }) {
  const mode = item.displayMode;
  const [broken, setBroken] = useState(false);
  const showPhoto = Boolean(imageUrl) && !broken;

  if (mode === "hidden") {
    return (
      <>
        <SilhouetteFallback blurred={false} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#120a28]/55 via-[#0c0820]/75 to-[#08041a]/90" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <LockIcon />
          <span className="text-xs text-white/55 tracking-wide">待解锁</span>
        </div>
      </>
    );
  }

  return (
    <>
      {showPhoto ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={mode === "blurred" ? { filter: "blur(10px)", transform: "scale(1.05)" } : undefined}
          onError={() => setBroken(true)}
        />
      ) : (
        <SilhouetteFallback blurred={mode === "blurred"} />
      )}
      {mode === "blurred" ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(160,120,255,0.14) 100%)",
          }}
        />
      ) : null}
    </>
  );
}

function PreviewCard({ item, imageUrl }) {
  const styleTags = extractStyleTagsForDisplay(item);
  const label = tierLabel(item);
  const scoreText = fmtScore(item.baseScore);
  const reasonText = extractScoreReasonExplanation(item);
  const modeLabel = DISPLAY_MODE_LABELS[item.displayMode] ?? item.displayMode;
  const detailParts = [
    reasonText,
    styleTags.length > 0 ? styleTags.join("、") : null,
  ].filter(Boolean);

  return (
    <article className="relative h-full min-h-0 rounded-2xl overflow-hidden">
      <div className="absolute inset-0">
        <CardPhoto item={item} imageUrl={imageUrl} />
      </div>

      {/* 与落地页一致的暗角，无硬边框 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(12,8,28,0.08) 0%, rgba(12,8,28,0.35) 45%, rgba(8,4,20,0.88) 100%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-80"
        style={{
          background:
            "linear-gradient(90deg, rgba(13,13,26,0.2) 0%, transparent 18%, transparent 82%, rgba(13,13,26,0.2) 100%)",
        }}
      />

      <span className="absolute top-2 left-2 z-10 text-[10px] font-medium text-white/90 px-2 py-0.5 rounded-full backdrop-blur-md bg-white/10">
        #{item.rankInPool}
      </span>

      <div className="absolute bottom-0 left-0 right-0 z-10 p-2.5 pt-6 pointer-events-none">
        <p className="text-sm font-semibold text-white truncate leading-tight drop-shadow-sm">
          <UserIdWithName userId={item.candidateUserId} variant="nameOnly" />
        </p>
        <p className="mt-1 text-[11px] text-white/75 leading-snug">
          <span>{label}</span>
          <span className="text-white/35 mx-1">·</span>
          <span className="text-white/60">{modeLabel}</span>
          {scoreText != null ? (
            <>
              <span className="text-white/35 mx-1">·</span>
              <span className="tabular-nums text-white/80">分 {scoreText}</span>
            </>
          ) : null}
        </p>
        {detailParts.length > 0 ? (
          <p className="mt-0.5 text-[10px] text-white/50 leading-snug line-clamp-2">
            {detailParts.join(" · ")}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/**
 * 2×3 grid: photo-first tiles, text on gradient (no boxed chrome).
 */
export default function OnboardingPreviewPoolGallery({ items, resolveImageUrl }) {
  const sorted = [...items].sort((a, b) => a.rankInPool - b.rankInPool);

  return (
    <div
      className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full animate-slide-up"
      style={{
        height: "calc(100dvh - 9.75rem)",
        maxHeight: "40rem",
        minHeight: "20rem",
        gridTemplateRows: "repeat(3, minmax(0, 1fr))",
      }}
    >
      {sorted.map((item) => (
        <PreviewCard
          key={item.id}
          item={item}
          imageUrl={resolveImageUrl(item.itemMeta?.candidateImageUrl ?? "")}
        />
      ))}
    </div>
  );
}
