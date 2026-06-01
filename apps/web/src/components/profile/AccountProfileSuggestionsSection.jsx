import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ProfileSuggestionCard from "./ProfileSuggestionCard";
import { normalizeP6ReviewSummary } from "./P6ReviewSummary.helpers.js";
import P6ReviewSummary, { P6ProposedPatchDetails } from "./P6ReviewSummary.jsx";
import {
  acceptProfileSuggestion,
  dismissProfileSuggestion,
  listMyProfileSuggestions,
} from "../../api/profile";
import {
  getConversation,
  postProfileCompletionSuggestion,
  ProfileCompletionSuggestionRequestError,
} from "../../api/chat";

const P6_8_SOURCE = "p6.8-profile-completion-chat-ai-v1";

/**
 * @param {{ userId: string; conversationId?: string }} props
 */
export default function AccountProfileSuggestionsSection({ userId, conversationId = "" }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateMsg, setGenerateMsg] = useState(null);
  const [generateErr, setGenerateErr] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    try {
      const data = await listMyProfileSuggestions();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (e) {
      setSuggestions([]);
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      return;
    }
    let cancelled = false;
    getConversation(conversationId)
      .then((data) => {
        if (!cancelled) setConversation(data);
      })
      .catch(() => {
        if (!cancelled) setConversation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const pendingForConversation = useMemo(() => {
    if (!conversationId) return null;
    return (
      suggestions.find(
        (s) =>
          s.status === "pending" &&
          s.sourceVersion === P6_8_SOURCE &&
          s.sourceConversationId === conversationId,
      ) ?? null
    );
  }, [suggestions, conversationId]);

  const pendingReview = useMemo(
    () => (pendingForConversation ? normalizeP6ReviewSummary(pendingForConversation) : null),
    [pendingForConversation],
  );

  const hasPendingForConv = Boolean(pendingForConversation);
  const noMessages =
    conversationId &&
    conversation &&
    Array.isArray(conversation.messages) &&
    conversation.messages.length === 0;

  const onGenerate = useCallback(async () => {
    if (!conversationId || generateBusy || hasPendingForConv || noMessages) return;
    setGenerateErr(null);
    setGenerateMsg(null);
    setGenerateBusy(true);
    try {
      await postProfileCompletionSuggestion(conversationId);
      await load();
      setGenerateMsg("已生成，请在下方确认");
      window.setTimeout(() => setGenerateMsg(null), 3200);
    } catch (e) {
      if (e instanceof ProfileCompletionSuggestionRequestError) {
        const map = {
          401: "请先登录",
          403: "无权为该会话生成",
          409: "已有待处理建议",
          422: "暂时无法生成",
          503: "功能未启用",
          502: "生成失败，请稍后重试",
        };
        setGenerateErr(map[e.status] || e.message);
      } else {
        setGenerateErr(e instanceof Error ? e.message : "请求失败");
      }
    } finally {
      setGenerateBusy(false);
    }
  }, [conversationId, generateBusy, hasPendingForConv, noMessages, load]);

  const onHandlePending = useCallback(
    async (action) => {
      if (!pendingForConversation || actionBusy) return;
      setActionBusy(true);
      try {
        if (action === "accept") {
          await acceptProfileSuggestion(pendingForConversation.id);
        } else {
          await dismissProfileSuggestion(pendingForConversation.id);
        }
        await load();
      } finally {
        setActionBusy(false);
      }
    },
    [pendingForConversation, actionBusy, load],
  );

  const chatHref = userId ? `/chat?userId=${encodeURIComponent(userId)}` : "/chat";

  return (
    <section className="account-page__section">
      <h2>画像更新建议</h2>
      <p className="account-page__section-hint">
        根据聊天整理的问卷补充建议，需你确认后才会写入关系画像。
      </p>

      {conversationId ? (
        <div className="account-profile-suggest-block">
          <p className="account-page__section-hint" style={{ marginBottom: "0.5rem" }}>
            当前关联会话：已带上聊天 ID，可直接生成。
          </p>
          {pendingReview ? <P6ReviewSummary model={pendingReview} compact /> : null}
          {pendingForConversation ? (
            <P6ProposedPatchDetails
              proposedPatch={pendingForConversation.proposedPatch}
              id={pendingForConversation.id}
            />
          ) : null}
          {hasPendingForConv ? (
            <div className="account-actions" style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                className="btn-primary text-sm py-2 px-4"
                disabled={actionBusy}
                onClick={() => void onHandlePending("accept")}
              >
                采纳建议
              </button>
              <button
                type="button"
                className="btn-ghost text-sm py-2 px-3"
                disabled={actionBusy}
                onClick={() => void onHandlePending("dismiss")}
              >
                暂不采纳
              </button>
            </div>
          ) : (
            <>
              {noMessages ? (
                <p className="chat-status-warn" style={{ fontSize: "0.85rem" }}>
                  该会话还没有消息，先聊几句再生成效果更好。
                </p>
              ) : null}
              <button
                type="button"
                className="btn-ghost text-sm py-2 px-4 mt-2"
                disabled={generateBusy || noMessages}
                onClick={() => void onGenerate()}
              >
                {generateBusy ? "生成中…" : "根据这次聊天生成建议"}
              </button>
            </>
          )}
          {generateMsg ? (
            <p className="chat-status-ok" style={{ fontSize: "0.85rem", marginTop: "0.35rem" }}>
              {generateMsg}
            </p>
          ) : null}
          {generateErr ? (
            <p className="chat-status-err" style={{ fontSize: "0.85rem", marginTop: "0.35rem" }}>
              {generateErr}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="account-page__section-hint">
          从
          {" "}
          <Link to={chatHref}>聊天</Link>
          {" "}
          进入某次对话后，点「资料 · 画像建议」可带上会话并在此生成。
        </p>
      )}

      <ProfileSuggestionCard
        suggestions={suggestions}
        loadError={loadError}
        onRefresh={load}
        variant="dark"
      />
    </section>
  );
}
