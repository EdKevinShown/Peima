import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getQuestionnaireQuestions,
  submitQuestionnaire,
} from "../api/questionnaire";
import { getToken } from "../api/auth";
import { getOnboardingPhotoStatus } from "../api/onboarding";
import LoadingState from "../components/common/LoadingState";
import UserIdWithName from "../components/common/UserIdWithName";
import { resolveUserId } from "../utils/resolveUserId";

export default function QuestionnairePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [questions, setQuestions] = useState([]);
  const [version, setVersion] = useState("");
  const [answers, setAnswers] = useState({});
  const [loadLoading, setLoadLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitOk, setSubmitOk] = useState(false);

  const [onboardingAllowed, setOnboardingAllowed] = useState(
    () => !userId || !getToken(),
  );

  useEffect(() => {
    if (!userId || !getToken()) {
      setOnboardingAllowed(true);
      return;
    }
    let cancelled = false;
    setOnboardingAllowed(false);
    void (async () => {
      try {
        const st = await getOnboardingPhotoStatus();
        if (cancelled) return;
        if (st.nextStep === "photo_upload") {
          navigate(
            `/onboarding/photo-upload?userId=${encodeURIComponent(userId)}`,
            { replace: true },
          );
          return;
        }
        if (st.nextStep === "photo_preference") {
          navigate(
            `/onboarding/photo-preference?userId=${encodeURIComponent(userId)}`,
            { replace: true },
          );
          return;
        }
        if (st.nextStep === "photo_preview") {
          navigate(
            `/onboarding/photo-preview?userId=${encodeURIComponent(userId)}`,
            { replace: true },
          );
          return;
        }
        if (st.nextStep === "questionnaire") {
          setOnboardingAllowed(true);
          return;
        }
        navigate(
          `/onboarding/photo-upload?userId=${encodeURIComponent(userId)}`,
          { replace: true },
        );
      } catch {
        if (!cancelled) setOnboardingAllowed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadLoading(true);
      setLoadError(null);
      try {
        const res = await getQuestionnaireQuestions();
        if (cancelled) return;
        setVersion(res.version);
        setQuestions(res.questions ?? []);
        setAnswers({});
        setSubmitOk(false);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e : new Error(String(e)));
          setQuestions([]);
        }
      } finally {
        if (!cancelled) setLoadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const answeredCount = useMemo(
    () => Object.keys(answers).filter((k) => answers[k]).length,
    [answers],
  );
  const total = questions.length;
  const formComplete =
    !!userId &&
    total > 0 &&
    answeredCount === total &&
    !submitLoading;

  const setAnswer = useCallback((questionKey, value) => {
    setSubmitOk(false);
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
  }, []);

  const onSubmit = useCallback(async () => {
    if (!userId) {
      setSubmitError(
        new Error(
          "缺少 userId：请在 URL 加 ?userId=xxx 或设置 localStorage.peimaUserId",
        ),
      );
      return;
    }
    if (total === 0) {
      setSubmitError(new Error("题目未加载完整"));
      return;
    }
    if (answeredCount < total) {
      setSubmitError(new Error("请答完全部题目后再提交"));
      return;
    }
    const payload = {
      userId,
      answers: questions.map((q) => ({
        questionKey: q.key,
        answerValue: answers[q.key],
      })),
    };
    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitOk(false);
    try {
      await submitQuestionnaire(payload);
      setSubmitOk(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSubmitLoading(false);
    }
  }, [userId, questions, answers, answeredCount, total]);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>轻量画像问卷</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        userId: <code><UserIdWithName userId={userId} /></code>
        {version ? (
          <>
            {" "}
            · 版本 <code>{version}</code>
          </>
        ) : null}
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link to="/">首页</Link>
      </p>

      {!onboardingAllowed && <LoadingState label="校验入门流程…" />}
      {onboardingAllowed && loadLoading && <LoadingState label="加载题目…" />}
      {onboardingAllowed && loadError && (
        <p style={{ color: "#b00020" }} role="alert">
          {loadError.message}
        </p>
      )}

      {onboardingAllowed &&
        !loadLoading &&
        !loadError &&
        questions.length > 0 && (
        <>
          <p style={{ color: "#666", marginBottom: "1rem" }}>
            已选 {answeredCount} / {total} 题
          </p>
          <ol style={{ paddingLeft: "1.1rem", margin: 0 }}>
            {questions.map((q, idx) => (
              <li key={q.key} style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                  {idx + 1}. {q.title}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                    marginLeft: "0.25rem",
                  }}
                >
                  {(q.options ?? []).map((opt) => (
                    <label
                      key={opt.value}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.4rem",
                        cursor: "pointer",
                        fontSize: "0.95rem",
                      }}
                    >
                      <input
                        type="radio"
                        name={q.key}
                        value={opt.value}
                        checked={answers[q.key] === opt.value}
                        onChange={() => setAnswer(q.key, opt.value)}
                      />
                      <span>
                        <strong>{opt.value}.</strong> {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ol>

          <div style={{ marginTop: "1.5rem" }}>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!formComplete}
            >
              {submitLoading ? "提交中…" : "提交问卷"}
            </button>
            {!userId && (
              <p style={{ color: "#856404", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                请先设置 userId 后再提交
              </p>
            )}
            {userId && total > 0 && answeredCount < total && (
              <p style={{ color: "#666", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                答满全部题目后可提交
              </p>
            )}
            {submitError && (
              <p style={{ color: "#b00020", marginTop: "0.75rem" }} role="alert">
                {submitError.message}
              </p>
            )}
            {submitOk && userId ? (
              <div style={{ marginTop: "1rem" }}>
                <p style={{ color: "#206020", margin: "0 0 0.65rem" }} role="status">
                  问卷已提交，画像已更新。
                </p>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/matching-waiting?userId=${encodeURIComponent(userId)}`)
                  }
                  style={{
                    padding: "0.65rem 1.25rem",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 8,
                    background: "#1e293b",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  下一步：前往匹配等待页
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </main>
  );
}
