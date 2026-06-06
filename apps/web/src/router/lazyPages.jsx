import { lazyPage } from "./lazyPage.jsx";

/** Admin / P76 / AI simulation / testing observability — loaded on demand. */
export const AdminPhotoReviewPage = lazyPage(() =>
  import("../pages/AdminPhotoReviewPage.jsx"),
);
export const AdminMyAiRecordsPage = lazyPage(() =>
  import("../pages/AdminMyAiRecordsPage.jsx"),
);
export const TestingObservabilityPage = lazyPage(() =>
  import("../pages/TestingObservabilityPage.jsx"),
);
export const AiSimulationJobTriagePage = lazyPage(() =>
  import("../pages/AiSimulationJobTriagePage.jsx"),
);
export const AiSimulationJobDiagnosticPage = lazyPage(() =>
  import("../pages/AiSimulationJobDiagnosticPage.jsx"),
);
export const P76AllowlistApplyMetaPage = lazyPage(() =>
  import("../pages/P76AllowlistApplyMetaPage.jsx"),
);
export const P76CanonicalRehearsalPage = lazyPage(() =>
  import("../pages/P76CanonicalRehearsalPage.jsx"),
);
export const P76CanonicalSidecarPage = lazyPage(() =>
  import("../pages/P76CanonicalSidecarPage.jsx"),
);
export const P76CanonicalSidecarApplyReviewPage = lazyPage(() =>
  import("../pages/P76CanonicalSidecarApplyReviewPage.jsx"),
);
export const LegacyPreviewPoolPage = lazyPage(() =>
  import("../pages/LegacyPreviewPoolPage.jsx"),
);
