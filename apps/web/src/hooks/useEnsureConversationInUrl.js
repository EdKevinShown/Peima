import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createConversation } from "../api/chat";
import { resolveUserId } from "../utils/resolveUserId";

/** Dedupe concurrent createConversation for same userId (e.g. React StrictMode). */
const pendingCreatesByUserId = new Map();

function getOrStartCreateConversation(userId) {
  let p = pendingCreatesByUserId.get(userId);
  if (!p) {
    p = createConversation(userId).finally(() => {
      pendingCreatesByUserId.delete(userId);
    });
    pendingCreatesByUserId.set(userId, p);
  }
  return p;
}

/**
 * When URL has viewer userId but no conversationId, call createConversation(userId)
 * then replace URL with ?conversationId=&userId= — same contract as FinalMatchPage.
 */
export function useEnsureConversationInUrl(searchParams) {
  const navigate = useNavigate();
  const location = useLocation();
  const conversationId = searchParams.get("conversationId")?.trim() || "";
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const [ensureConversationError, setEnsureConversationError] = useState(null);

  useEffect(() => {
    if (conversationId || !userId) {
      setEnsureConversationError(null);
      return;
    }

    let cancelled = false;
    setEnsureConversationError(null);

    getOrStartCreateConversation(userId)
      .then((conv) => {
        if (cancelled) return;
        const q = new URLSearchParams();
        q.set("conversationId", conv.id);
        q.set("userId", userId);
        navigate(`${location.pathname}?${q.toString()}`, { replace: true });
      })
      .catch((e) => {
        if (cancelled) return;
        setEnsureConversationError(e instanceof Error ? e : new Error(String(e)));
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, userId, navigate, location.pathname]);

  const shouldHoldForConversationBootstrap = Boolean(
    userId && !conversationId && !ensureConversationError,
  );

  return { ensureConversationError, shouldHoldForConversationBootstrap };
}
