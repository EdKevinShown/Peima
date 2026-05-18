/** P7.10-r5a — shared legacy photo preview freeze notice (UI only). */

const bannerStyle = {
  marginBottom: "1rem",
  padding: "0.75rem 0.9rem",
  borderRadius: 8,
  border: "1px solid #fcd34d",
  background: "#fffbeb",
  color: "#78350f",
  fontSize: "0.86rem",
  lineHeight: 1.55,
};

export default function LegacyPhotoPreviewFreezeBanner({ variant = "onboarding" }) {
  const isLegacyPool = variant === "preview_pool";
  return (
    <div
      role="note"
      style={bannerStyle}
      data-legacy-photo-preview-freeze="p7.10-r5a"
    >
      <strong style={{ display: "block", marginBottom: "0.35rem" }}>
        {isLegacyPool ? "Legacy PreviewPool（已冻结）" : "照片预览匹配（已冻结）"}
      </strong>
      <span lang="en" style={{ display: "block", marginBottom: "0.35rem", color: "#92400e" }}>
        Photo preview matching is frozen and will be replaced by the P7.6 matching flow.
        Existing historical data remains available, but this entry point is no longer the
        recommended path.
      </span>
      照片预览匹配已冻结，后续将由 P7.6 匹配流程接管。历史数据仍可保留查看，但不再作为新的推荐入口。
      {isLegacyPool ? (
        <span style={{ display: "block", marginTop: "0.35rem", fontSize: "0.8rem" }}>
          开发排障：可查看已有池；「生成预览池」已禁用。Worker / MatchResult 写入未关闭。
        </span>
      ) : (
        <span style={{ display: "block", marginTop: "0.35rem", fontSize: "0.8rem" }}>
          进行中的 onboarding 仍可查看与确认；「重新生成」已禁用。新生产匹配请勿依赖此路径。
        </span>
      )}
    </div>
  );
}
