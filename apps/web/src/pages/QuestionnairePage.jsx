import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import AppContent from "../components/layout/AppContent";
import QuestionnairePanel from "../components/questionnaire/QuestionnairePanel";
import { resolveUserId } from "../utils/resolveUserId";

export default function QuestionnairePage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  return (
    <AppContent maxWidth="max-w-2xl">
      <QuestionnairePanel userId={userId} />
    </AppContent>
  );
}
