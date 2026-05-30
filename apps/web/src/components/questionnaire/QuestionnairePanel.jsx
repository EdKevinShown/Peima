import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getQuestionnaireQuestions,
  submitQuestionnaire,
} from "../../api/questionnaire";
import { getToken } from "../../api/auth";
import { getOnboardingPhotoStatus } from "../../api/onboarding";
import LoadingState from "../common/LoadingState";
import UserIdWithName from "../common/UserIdWithName";
import { useAdminAccess } from "../../hooks/useAdminAccess";
import { toFriendlyUserMessage } from "../../utils/friendlyErrors";

const WIZARD_SCOPED_CSS = `
.q-wizard-progress {
  margin: 0 0 1rem;
}
.q-wizard-progress__meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.55);
}
.q-wizard-progress__meta strong {
  color: #fff;
  font-weight: 600;
}
.q-wizard-progress__track {
  height: 6px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.q-wizard-progress__fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, rgba(255, 107, 157, 0.9), rgba(196, 77, 255, 0.85));
  transition: width 0.25s ease;
}
.q-wizard-card {
  padding: 1.1rem 1rem 1.15rem;
  border-radius: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(
    165deg,
    rgba(255, 255, 255, 0.055) 0%,
    rgba(255, 255, 255, 0.02) 55%,
    rgba(0, 0, 0, 0.08) 100%
  );
}
.q-wizard-card__title {
  margin: 0 0 1rem;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.45;
  color: #fff;
}
.q-wizard-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.q-wizard-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.75rem 0.85rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.9rem;
  line-height: 1.45;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.q-wizard-option:hover {
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.09);
}
.q-wizard-option--on {
  border-color: rgba(255, 107, 157, 0.45);
  background: linear-gradient(135deg, rgba(255, 107, 157, 0.28), rgba(196, 77, 255, 0.22));
  color: #fff;
}
.q-wizard-option__letter {
  display: inline-block;
  min-width: 1.25rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}
.q-wizard-option--on .q-wizard-option__letter {
  color: #ffd4e8;
}
.q-wizard-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1.25rem;
  align-items: center;
}
.q-wizard-hint {
  margin: 0.65rem 0 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.42);
}
.q-wizard-tech {
  margin: 0.35rem 0 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.35);
  font-family: ui-monospace, monospace;
}
`;

/**
 * @param {{
 *   userId: string;
 *   embedded?: boolean;
 *   skipOnboardingRedirect?: boolean;
 *   onSubmitted?: () => void;
 * }} props
 */
export default function QuestionnairePanel({
  userId,
  embedded = false,
  skipOnboardingRedirect = false,
  onSubmitted,
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDebugMode = useMemo(() => searchParams.get("debug") === "1", [searchParams]);
  const { isAdmin } = useAdminAccess();
  const showDebug = isDebugMode && isAdmin;

  const [questions, setQuestions] = useState([]);
  const [version, setVersion] = useState("");
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadLoading, setLoadLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitOk, setSubmitOk] = useState(false);
  const [onboardingAllowed, setOnboardingAllowed] = useState(
    () => skipOnboardingRedirect || !userId || !getToken(),
  );

  useEffect(() => {
    if (skipOnboardingRedirect) {
      setOnboardingAllowed(true);
      return;
    }
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
  }, [userId, navigate, skipOnboardingRedirect]);

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
        setCurrentIndex(0);
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
    !!userId && total > 0 && answeredCount === total && !submitLoading;

  const currentQuestion = total > 0 ? questions[currentIndex] : null;
  const currentAnswered = currentQuestion
    ? Boolean(answers[currentQuestion.key])
    : false;
  const isFirst = currentIndex <= 0;
  const isLast = total > 0 && currentIndex >= total - 1;
  const stepPct = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  const setAnswer = useCallback((questionKey, value) => {
    setSubmitOk(false);
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
  }, []);

  const goBack = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    if (!currentAnswered) return;
    setCurrentIndex((i) => Math.min(total - 1, i + 1));
  }, [currentAnswered, total]);

  const onSubmit = useCallback(async () => {
    if (!userId) {
      setSubmitError(new Error("缺少 userId"));
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
    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitOk(false);
    try {
      await submitQuestionnaire({
        userId,
        answers: questions.map((q) => ({
          questionKey: q.key,
          answerValue: answers[q.key],
        })),
      });
      setSubmitOk(true);
      onSubmitted?.();
    } catch (e) {
      setSubmitError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSubmitLoading(false);
    }
  }, [userId, questions, answers, answeredCount, total, onSubmitted]);

  const subtitleClass = embedded ? "text-xs text-white/50 mt-1" : "text-sm text-white/50 mt-1.5";

  if (submitOk && userId) {
    return (
      <div className={embedded ? "w-full" : undefined}>
        <style>{WIZARD_SCOPED_CSS}</style>
        <div className="q-wizard-card">
          <p className="text-sm text-emerald-300/90 mb-3" role="status">
            问卷已提交，你的关系画像已更新。
          </p>
          <button
            type="button"
            className="btn-primary text-sm py-2.5 px-5"
            onClick={() =>
              navigate(`/matching-waiting?userId=${encodeURIComponent(userId)}`)
            }
          >
            下一步：前往匹配
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "w-full" : undefined}>
      <style>{WIZARD_SCOPED_CSS}</style>
      {!embedded ? (
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white">轻量画像问卷</h2>
          <p className={subtitleClass}>
            一题一页，选好后可进入下一题；全部答完即可提交。
          </p>
          {showDebug ? (
            <p className="q-wizard-tech">
              userId <UserIdWithName userId={userId} />
              {version ? <> · 版本 {version}</> : null}
            </p>
          ) : null}
        </div>
      ) : (
        <p className={`${subtitleClass} mb-2`}>
          轻量画像问卷
          {showDebug && version ? (
            <span className="text-white/35"> · {version}</span>
          ) : null}
        </p>
      )}

      {!onboardingAllowed && <LoadingState label="校验入门流程…" />}
      {onboardingAllowed && loadLoading && <LoadingState label="加载题目…" />}
      {onboardingAllowed && loadError ? (
        <p className="text-sm text-pink-300" role="alert">
          {toFriendlyUserMessage(loadError.message)}
        </p>
      ) : null}

      {onboardingAllowed && !loadLoading && !loadError && currentQuestion ? (
        <>
          <div className="q-wizard-progress" aria-live="polite">
            <div className="q-wizard-progress__meta">
              <span>
                第 <strong>{currentIndex + 1}</strong> / {total} 题
              </span>
              <span>已答 {answeredCount} 题</span>
            </div>
            <div
              className="q-wizard-progress__track"
              role="progressbar"
              aria-valuenow={currentIndex + 1}
              aria-valuemin={1}
              aria-valuemax={total}
              aria-label="问卷进度"
            >
              <div
                className="q-wizard-progress__fill"
                style={{ width: `${stepPct}%` }}
              />
            </div>
          </div>

          <div className="q-wizard-card">
            <h3 className="q-wizard-card__title">{currentQuestion.title}</h3>
            <ul className="q-wizard-options" role="listbox" aria-label="选项">
              {(currentQuestion.options ?? []).map((opt) => {
                const on = answers[currentQuestion.key] === opt.value;
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={`q-wizard-option${on ? " q-wizard-option--on" : ""}`}
                      onClick={() => setAnswer(currentQuestion.key, opt.value)}
                    >
                      <span className="q-wizard-option__letter">{opt.value}.</span>{" "}
                      {opt.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            {!currentAnswered ? (
              <p className="q-wizard-hint">请先选择一个选项</p>
            ) : null}
          </div>

          <div className="q-wizard-nav">
            <button
              type="button"
              className="btn-ghost text-sm py-2 px-4"
              onClick={goBack}
              disabled={isFirst}
            >
              上一题
            </button>
            {!isLast ? (
              <button
                type="button"
                className="btn-primary text-sm py-2.5 px-5"
                onClick={goNext}
                disabled={!currentAnswered}
              >
                下一题
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary text-sm py-2.5 px-5"
                onClick={() => void onSubmit()}
                disabled={!formComplete || submitLoading}
              >
                {submitLoading ? "提交中…" : "提交问卷"}
              </button>
            )}
          </div>

          {!userId ? (
            <p className="q-wizard-hint">请先登录后再提交问卷</p>
          ) : null}
          {userId && isLast && answeredCount < total ? (
            <p className="q-wizard-hint">
              还有 {total - answeredCount} 题未作答，可用「上一题」回去补选
            </p>
          ) : null}
          {submitError ? (
            <p className="text-sm text-pink-300 mt-3" role="alert">
              {toFriendlyUserMessage(submitError.message)}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
