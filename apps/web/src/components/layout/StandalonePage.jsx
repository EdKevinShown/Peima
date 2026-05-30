import AppContent from "./AppContent";
import AppDarkPage from "./AppDarkPage";

/**
 * Standalone route page: dark shell + optional title/actions.
 */
export default function StandalonePage({
  title,
  subtitle,
  actions,
  children,
  maxWidth = "max-w-3xl",
  showHomeLink = true,
}) {
  return (
    <AppDarkPage maxWidth={maxWidth} showHomeLink={showHomeLink}>
      <AppContent title={title} subtitle={subtitle} actions={actions} maxWidth="max-w-none">
        {children}
      </AppContent>
    </AppDarkPage>
  );
}
