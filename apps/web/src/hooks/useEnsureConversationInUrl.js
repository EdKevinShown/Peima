import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createConversation } from "../api/chat";
import { resolveUserId } from "../utils/resolveUserId";

/** Dedupe concurrent createConversation for same userId + peer. */
const pendingCreates = new Map();

function createKey(userId, peerUserId) {
  return `${userId}::${peerUserId ?? ""}`;
}

function getOrStartCreateConversation(userId, peerUserId) {
  const key = createKey(userId, peerUserId);
  let p = pendingCreates.get(key);
  if (!p) {
    p = createConversation(userId, peerUserId ? { peerUserId } : undefined).finally(
      () => {
        pendingCreates.delete(key);
      },
    );
    pendingCreates.set(key, p);
  }
  return p;
}

/**
 * When URL has peerUserId but no conversationId, create conversation then replace URL.
 * Bare /chat?userId= only shows friend picker (no auto-create).
 */
export function useEnsureConversationInUrl(searchParams) {
  const navigate = useNavigate();
  const location = useLocation();
  const conversationId = searchParams.get("conversationId")?.trim() || "";
  const peerUserId = searchParams.get("peerUserId")?.trim() || "";
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const [ensureConversationError, setEnsureConversationError] = useState(null);

  useEffect(() => {
    if (conversationId || !userId || !peerUserId) {
      setEnsureConversationError(null);
      return;
    }

    let cancelled = false;
    setEnsureConversationError(null);

    getOrStartCreateConversation(userId, peerUserId)
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
  }, [conversationId, userId, peerUserId, navigate, location.pathname]);

  const shouldHoldForConversationBootstrap = Boolean(
    userId && peerUserId && !conversationId && !ensureConversationError,
  );

  const showFriendPicker = Boolean(userId && !conversationId && !peerUserId);

  return {
    ensureConversationError,
    shouldHoldForConversationBootstrap,
    showFriendPicker,
  };
}
