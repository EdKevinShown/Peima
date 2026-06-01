import AppContent from "./AppContent";

/**
 * Content wrapper for routes already inside MainAppShell.
 *
 * Previously also rendered AppDarkPage (orbs + "← 返回首页" link), but since
 * every logged-in subpage now sits inside MainAppShell — which already
 * provides the dark background, orbs, and a top-bar 首页 link — duplicating
 * those here produced doubled orbs and competing back-nav. This is now a
 * thin wrapper around AppContent (title/subtitle/actions + width).
 */
export default function StandalonePage({
  title,
  subtitle,
  actions,
  children,
  maxWidth = "max-w-3xl",
  // showHomeLink prop kept for backwards compat; ignored.
  // eslint-disable-next-line no-unused-vars
  showHomeLink = true,
}) {
  return (
    <div className={`mx-auto w-full px-4 py-6 ${maxWidth}`}>
      <AppContent title={title} subtitle={subtitle} actions={actions} maxWidth="max-w-none">
        {children}
      </AppContent>
    </div>
  );
}
