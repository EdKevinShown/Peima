import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMe } from "../api/auth";
import { updateUser } from "../api/users";
import { getUserPreferencesOptional, upsertUserPreferences } from "../api/preferences";
import { mapAccountApiErrorMessage } from "../utils/accountApiErrorMap";
import {
  buildOnboardingPreferencePayload,
  buildOnboardingProfilePayload,
  onboardingStepFieldKeys,
} from "../utils/onboardingSubmitPayload";
import {
  ACCOUNT_CITY_VALUES,
  ACCOUNT_DISPLAY_GENDER,
  ACCOUNT_EDUCATION_VALUES,
  ACCOUNT_GENDER_VALUES,
  ACCOUNT_OCCUPATION_CATEGORY_VALUES,
  ACCOUNT_RELATIONSHIP_GOAL_VALUES,
  ageOptionsInclusive,
  heightOptionsCmInclusive,
} from "@peima/shared/constants";

/**
 * Step types
 *   - "text"   → free text
 *   - "number" → numeric input (age / height)
 *   - "choice" → pick one (auto-advance)
 *   - "long"   → textarea
 *   - "range"  → min / max pair (stored under keyMin / keyMax)
 *   - "multi"  → toggle-select multiple from a list
 *   - "select" → dropdown select (single)
 *
 * Each step belongs to `section`: "profile" (→ PATCH /users/:id)
 * or "preference" (→ PUT /preferences/:userId).
 */
const AGES = ageOptionsInclusive();
const HEIGHTS = heightOptionsCmInclusive();
const ONBOARDING_SELECT_OPTION_STYLE = { color: "#111827", backgroundColor: "#ffffff" };

const RAW_STEPS = [
  // ── Phase 1: about you ──
  { section: "profile", key: "nickname",  label: "你想被叫什么",       type: "text",   placeholder: "例：小安" },
  { section: "profile", key: "gender",    label: "你是",               type: "choice", options: Object.values(ACCOUNT_DISPLAY_GENDER) },
  { section: "profile", key: "age",       label: "你多大了",           type: "select", options: AGES, unit: "岁" },
  { section: "profile", key: "height",    label: "身高呢",             type: "select", options: HEIGHTS, unit: " 厘米" },
  { section: "profile", key: "city",      label: "你在哪座城市",       type: "select", options: ACCOUNT_CITY_VALUES },
  { section: "profile", key: "education", label: "最高学历",           type: "select", options: ACCOUNT_EDUCATION_VALUES },
  { section: "profile", key: "occupation",label: "你的职业",           type: "select", options: ACCOUNT_OCCUPATION_CATEGORY_VALUES },
  { section: "profile", key: "relationshipGoal", label: "你想要怎样的关系", type: "select",
    options: ACCOUNT_RELATIONSHIP_GOAL_VALUES },
  { section: "profile", key: "bio",       label: "一句话介绍你自己",    type: "long",
    placeholder: "兴趣、节奏、想遇到什么样的人…", skippable: true },

  // ── Phase 2: about Ta ──
  { section: "preference", phaseIntro: true, label: "接下来，聊聊你理想中的 Ta",
    sub: "别急，可以随时回来改，系统会越来越懂你" },
  { section: "preference", key: "__ageRange",    label: "Ta 的年龄在什么区间",  type: "range",
    keyMin: "minAge", keyMax: "maxAge",  unit: "岁", min: 16, max: 80,  defaults: [22, 35], skippable: true },
  { section: "preference", key: "__heightRange", label: "Ta 的身高大概多少",    type: "range",
    keyMin: "minHeight", keyMax: "maxHeight", unit: "cm", min: 140, max: 210, defaults: [160, 185], skippable: true },
  { section: "preference", key: "preferredCities", label: "你希望 Ta 在哪些城市", type: "multi",
    options: ["北京", "上海", "广州", "深圳", "杭州", "成都", "南京", "武汉"], allowCustom: true, skippable: true },
  { section: "preference", key: "educationPreferences", label: "Ta 的学历你介意吗", type: "multi",
    options: ["高中", "大专", "本科", "硕士", "博士"], skippable: true,
    sub: "多选即可，也可以全都不介意" },
  { section: "preference", key: "relationshipGoalPreferences", label: "关于关系目标，你能接受哪些", type: "multi",
    options: ["认真交往", "先从朋友开始", "开放关系", "步入婚姻", "暂不确定"], skippable: true },
  { section: "preference", key: "styleTags", label: "你喜欢什么样的气质", type: "multi",
    options: ["温柔", "有主见", "幽默", "文艺", "独立", "上进", "稳重", "随性", "运动", "宅"],
    allowCustom: true, skippable: true, sub: "点选你喜欢的（可多选）" },
];

/** Fields we consider "essential" for gating */
export function getProfileMissingFields(me) {
  const missing = [];
  if (!me) {
    return ["性别", "年龄", "所在城市", "身高"];
  }
  if (!me.gender) missing.push("性别");
  if (!me.age) missing.push("年龄");
  if (!me.city) missing.push("所在城市");
  if (!me.height) missing.push("身高");
  return missing;
}

export function isProfileIncomplete(me) {
  return getProfileMissingFields(me).length > 0;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [touchedKeys, setTouchedKeys] = useState(() => new Set());
  const [customInputs, setCustomInputs] = useState({});  // per-step typed "custom" tags buffer
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const userId = useMemo(() => localStorage.getItem("peimaUserId") || "", []);
  const [stepsLoaded, setStepsLoaded] = useState(false);
  const [visibleStepKeys, setVisibleStepKeys] = useState(null);

  const isFilledValue = useCallback((v) => {
    if (v == null) return false;
    const s = String(v).trim();
    return s.length > 0;
  }, []);

  const steps = useMemo(() => {
    if (!stepsLoaded || !visibleStepKeys) return RAW_STEPS;
    return RAW_STEPS.filter((s) => {
      if (s.phaseIntro) return true;
      if (!s.key) return true;
      return visibleStepKeys.has(s.key);
    });
  }, [stepsLoaded, visibleStepKeys]);

  const countableCount = useMemo(
    () => steps.filter((s) => !s.phaseIntro).length,
    [steps],
  );

  const hasSteps = steps.length > 0;
  const step = hasSteps ? steps[stepIdx] ?? null : null;

  // Count progress ignoring phaseIntro screens
  const countIdxOfStep = useMemo(() => {
    let n = 0;
    for (let i = 0; i <= stepIdx; i += 1) {
      if (!steps[i]?.phaseIntro) n += 1;
    }
    return n;
  }, [stepIdx, steps]);

  const progress = countableCount > 0 ? (countIdxOfStep / countableCount) * 100 : 0;

  /* Prefill */
  useEffect(() => {
    if (!userId) { navigate("/login", { replace: true }); return; }
    (async () => {
      try {
        const me = await getMe();
        const pref = await getUserPreferencesOptional(userId);

        const genderRaw = String(me?.gender ?? "").trim();
        const genderUi =
          (ACCOUNT_GENDER_VALUES.includes(genderRaw) && ACCOUNT_DISPLAY_GENDER[genderRaw]) ||
          (genderRaw === "男" || genderRaw === "女" ? genderRaw : "");

        const ageUi = me?.age != null ? String(me.age) : "";
        const heightUi = me?.height != null ? String(me.height) : "";

        setAnswers({
          nickname: me.nickname || "",
          gender: genderUi,
          age: AGES.includes(Number(ageUi)) ? ageUi : "",
          height: HEIGHTS.includes(Number(heightUi)) ? heightUi : "",
          city: ACCOUNT_CITY_VALUES.includes(me.city) ? me.city : "",
          education: ACCOUNT_EDUCATION_VALUES.includes(me.education) ? me.education : "",
          occupation: ACCOUNT_OCCUPATION_CATEGORY_VALUES.includes(me.occupation) ? me.occupation : "",
          relationshipGoal: ACCOUNT_RELATIONSHIP_GOAL_VALUES.includes(me.relationshipGoal) ? me.relationshipGoal : "",
          bio: me.bio || "",
          minAge: pref?.minAge ?? "",
          maxAge: pref?.maxAge ?? "",
          minHeight: pref?.minHeight ?? "",
          maxHeight: pref?.maxHeight ?? "",
          preferredCities: pref?.preferredCities ?? [],
          educationPreferences: pref?.educationPreferences ?? [],
          relationshipGoalPreferences: pref?.relationshipGoalPreferences ?? [],
          styleTags: pref?.styleTags ?? [],
        });

        // Freeze visible steps at entry time (based on already-saved data only).
        // This prevents "click once then current step disappears" perceived auto-skip.
        const nextVisible = new Set();
        for (const s of RAW_STEPS) {
          if (s.phaseIntro || !s.key) continue;
          if (s.section === "profile") {
            const v = {
              nickname: me.nickname || "",
              gender: genderUi,
              age: AGES.includes(Number(ageUi)) ? ageUi : "",
              height: HEIGHTS.includes(Number(heightUi)) ? heightUi : "",
              city: ACCOUNT_CITY_VALUES.includes(me.city) ? me.city : "",
              education: ACCOUNT_EDUCATION_VALUES.includes(me.education)
                ? me.education
                : "",
              occupation: ACCOUNT_OCCUPATION_CATEGORY_VALUES.includes(me.occupation)
                ? me.occupation
                : "",
              relationshipGoal: ACCOUNT_RELATIONSHIP_GOAL_VALUES.includes(
                me.relationshipGoal,
              )
                ? me.relationshipGoal
                : "",
              bio: me.bio || "",
            }[s.key];
            if (!isFilledValue(v)) nextVisible.add(s.key);
            continue;
          }
          if (s.section === "preference") {
            if (s.type === "range") {
              const hasRange =
                (pref?.[s.keyMin] ?? null) != null || (pref?.[s.keyMax] ?? null) != null;
              if (!hasRange) nextVisible.add(s.key);
              continue;
            }
            if (s.type === "multi") {
              const arr = Array.isArray(pref?.[s.key]) ? pref[s.key] : [];
              if (arr.length === 0) nextVisible.add(s.key);
              continue;
            }
            nextVisible.add(s.key);
          }
        }
        setVisibleStepKeys(nextVisible);
        setStepsLoaded(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, navigate]);

  useEffect(() => {
    // When steps are re-built after prefill, start from the first missing profile field.
    if (!stepsLoaded) return;
    setStepIdx(0);
    setTouchedKeys(new Set());
  }, [stepsLoaded]);

  useEffect(() => {
    // Steps can shrink dynamically after each answer (filled fields are removed).
    // Clamp index to prevent rendering with an out-of-range step.
    if (!steps.length) return;
    setStepIdx((prev) => {
      const max = steps.length - 1;
      return prev > max ? max : prev;
    });
  }, [steps.length]);

  const setAnswer = useCallback((key, val) => {
    setTouchedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setAnswers((prev) => ({ ...prev, [key]: val }));
  }, []);

  const markStepTouched = useCallback((s) => {
    const keys = onboardingStepFieldKeys(s);
    if (!keys.length) return;
    setTouchedKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
  }, []);

  /* Current-step helpers */
  const getVal = (k) => answers[k];
  const currentValue = step && step.key ? getVal(step.key) : undefined;

  const canProceed = useMemo(() => {
    if (!step) return true;
    if (step.phaseIntro) return true;
    if (step.skippable) return true;
    switch (step.type) {
      case "text":
      case "long":
        return typeof currentValue === "string" && currentValue.trim().length > 0;
      case "number":
        return currentValue !== "" && currentValue !== null && currentValue !== undefined;
      case "select":
        return currentValue !== "" && currentValue !== null && currentValue !== undefined;
      case "choice":
        return !!currentValue;
      case "range": {
        const lo = answers[step.keyMin];
        const hi = answers[step.keyMax];
        return lo !== "" && hi !== "" && lo != null && hi != null && Number(lo) <= Number(hi);
      }
      case "multi":
        return Array.isArray(currentValue) && currentValue.length > 0;
      default:
        return true;
    }
  }, [step, currentValue, answers]);

  const goBack = useCallback(() => {
    if (!step) {
      navigate("/home", { replace: true });
      return;
    }
    if (stepIdx === 0) navigate("/home", { replace: true });
    else setStepIdx((i) => i - 1);
  }, [stepIdx, navigate]);

  const submitAll = useCallback(async () => {
    if (!userId) return;
    if (!step) {
      navigate("/home", { replace: true });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const effectiveTouched = new Set([
        ...touchedKeys,
        ...onboardingStepFieldKeys(step),
      ]);
      const profilePayload = buildOnboardingProfilePayload(
        answers,
        effectiveTouched,
      );
      const prefPayload = buildOnboardingPreferencePayload(
        answers,
        effectiveTouched,
      );

      if (Object.keys(profilePayload).length > 0) {
        const updated = await updateUser(userId, profilePayload);
        if (updated?.nickname) {
          localStorage.setItem("peimaUserNickname", updated.nickname);
        }
      }
      if (Object.keys(prefPayload).length > 0) {
        await upsertUserPreferences(userId, prefPayload);
      }
      navigate("/home", { replace: true });
    } catch (e) {
      setError(mapAccountApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [userId, answers, touchedKeys, step, navigate]);

  const goNext = useCallback(() => {
    if (!step) {
      navigate("/home", { replace: true });
      return;
    }
    if (!canProceed && !step.skippable && !step.phaseIntro) return;
    markStepTouched(step);
    if (stepIdx === steps.length - 1) void submitAll();
    else setStepIdx((i) => i + 1);
  }, [stepIdx, canProceed, submitAll, step, markStepTouched, steps.length, navigate]);

  const onInputKeyDown = (e) => {
    if (e.key === "Enter" && step && step.type !== "long") {
      e.preventDefault();
      goNext();
    }
  };

  /** Toggle a tag in a multi-select array */
  const toggleMulti = (key, tag) => {
    const arr = Array.isArray(answers[key]) ? answers[key] : [];
    const next = arr.includes(tag) ? arr.filter((t) => t !== tag) : [...arr, tag];
    setAnswer(key, next);
  };

  /** Commit the custom-tag input buffer into the multi array */
  const addCustomTag = (key) => {
    const raw = customInputs[key];
    if (!raw || !raw.trim()) return;
    const arr = Array.isArray(answers[key]) ? answers[key] : [];
    const t = raw.trim();
    if (!arr.includes(t)) setAnswer(key, [...arr, t]);
    setCustomInputs((p) => ({ ...p, [key]: "" }));
  };

  const isLast = hasSteps && stepIdx === steps.length - 1;

  return (
    <div className="min-h-dvh flex flex-col px-5 py-6 relative overflow-hidden">
      <div className="orb orb-pink" />
      <div className="orb orb-purple" />

      {/* Header: back + progress */}
      <div className="relative z-10 flex items-center justify-between mb-6">
        <button type="button" onClick={goBack} disabled={saving}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
          ←
        </button>
        {step && !step.phaseIntro && (
          <span className="text-xs text-white/40 tabular-nums">
            {countIdxOfStep} / {countableCount || 1}
          </span>
        )}
        {step && step.phaseIntro && <span />}
      </div>

      {/* Progress bar */}
      <div className="relative z-10 h-[3px] rounded-full mb-12 overflow-hidden"
           style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full transition-all duration-500 ease-out"
             style={{
               width: `${progress}%`,
               background: "linear-gradient(90deg, #ff6b9d 0%, #c44dff 100%)",
               boxShadow: "0 0 12px rgba(255,107,157,0.5)",
             }} />
      </div>

      {/* Question body */}
      <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        {loading ? (
          <p className="text-white/40 text-center">加载中…</p>
        ) : !hasSteps ? (
          <div className="animate-fade-in text-center text-white/80">
            <h1 className="font-serif font-bold text-2xl mb-3">
              资料已完善啦
            </h1>
            <p className="text-sm text-white/60 mb-6">
              你当前的资料和偏好已经足够用于匹配了，可以直接返回首页继续使用。
            </p>
            <button
              type="button"
              className="btn-primary px-5 py-2 text-sm"
              onClick={() => navigate("/home", { replace: true })}
            >
              返回首页
            </button>
          </div>
        ) : (
          <div key={stepIdx} className="animate-fade-in">
            {step && step.phaseIntro ? (
              <>
                <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Part 2</p>
                <h1 className="font-serif font-bold text-white text-3xl sm:text-4xl leading-snug mb-4"
                    style={{ letterSpacing: "-0.01em" }}>
                  {step.label}
                </h1>
                <p className="text-white/45 text-sm">{step.sub}</p>
              </>
            ) : (
              <>
                {step && (
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-3">
                    第 {countIdxOfStep} 题 {step.skippable ? "· 可跳过" : ""}
                  </p>
                )}
                <h1 className="font-serif font-bold text-white text-3xl sm:text-4xl leading-snug mb-3"
                    style={{ letterSpacing: "-0.01em" }}>
                  {step.label}
                </h1>
                {step.sub && <p className="text-white/40 text-sm mb-8">{step.sub}</p>}
                {!step.sub && <div className="mb-10" />}

                {step.type === "text" && (
                  <input autoFocus type="text" className="input-glass text-xl py-4"
                         placeholder={step.placeholder}
                         value={currentValue ?? ""}
                         onChange={(e) => setAnswer(step.key, e.target.value)}
                         onKeyDown={onInputKeyDown}
                         maxLength={40} />
                )}

                {step.type === "select" && (
                  <select
                    autoFocus
                    value={currentValue ?? ""}
                    className="input-glass text-xl py-4"
                    onChange={(e) => setAnswer(step.key, e.target.value)}
                  >
                    <option value="" style={ONBOARDING_SELECT_OPTION_STYLE}>
                      {step.placeholder ?? "选填"}
                    </option>
                    {(step.options ?? []).map((opt) => (
                      <option
                        key={String(opt)}
                        value={String(opt)}
                        style={ONBOARDING_SELECT_OPTION_STYLE}
                      >
                        {step.unit ? `${opt}${step.unit}` : opt}
                      </option>
                    ))}
                  </select>
                )}

                {step.type === "number" && (
                  <div className="flex items-baseline gap-3">
                    <input autoFocus type="number" inputMode="numeric"
                           className="input-glass text-3xl py-4 text-center font-semibold tabular-nums"
                           value={currentValue ?? ""}
                           onChange={(e) => setAnswer(step.key, e.target.value)}
                           onKeyDown={onInputKeyDown}
                           min={step.min} max={step.max}
                           style={{ maxWidth: "140px" }} />
                    <span className="text-white/50 text-base">{step.unit}</span>
                  </div>
                )}

                {step.type === "choice" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {step.options.map((opt) => {
                      const selected = currentValue === opt;
                      return (
                        <button key={opt} type="button"
                                onClick={() => setAnswer(step.key, opt)}
                                className="rounded-2xl py-4 px-5 text-base font-medium transition-all duration-200 text-left"
                                style={selected
                                  ? { background: "linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)", color: "white",
                                      boxShadow: "0 8px 24px rgba(255,107,157,0.35)", border: "1px solid rgba(255,255,255,0.2)" }
                                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)",
                                      border: "1px solid rgba(255,255,255,0.12)" }}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {step.type === "long" && (
                  <textarea autoFocus rows={4}
                            className="input-glass text-base py-3 resize-none"
                            placeholder={step.placeholder}
                            value={currentValue ?? ""}
                            onChange={(e) => setAnswer(step.key, e.target.value)}
                            maxLength={300}
                            style={{ minHeight: "120px" }} />
                )}

                {step.type === "range" && (
                  <RangeInput step={step} answers={answers} setAnswer={setAnswer} />
                )}

                {step.type === "multi" && (
                  <MultiChoice step={step} answers={answers}
                               toggle={(tag) => toggleMulti(step.key, tag)}
                               customInputs={customInputs}
                               setCustomInputs={setCustomInputs}
                               addCustomTag={() => addCustomTag(step.key)} />
                )}
              </>
            )}

            {error && <p className="mt-4 text-sm text-red-300/90">{error}</p>}
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="relative z-10 max-w-md w-full mx-auto mt-8 flex items-center gap-3">
        {hasSteps ? (
          <>
            <button
              type="button"
              onClick={goBack}
              disabled={saving}
              className="btn-ghost flex-shrink-0 px-5 py-3 text-sm"
            >
              {stepIdx === 0 ? "返回" : "上一步"}
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={
                saving ||
                (!canProceed && step && !step.skippable && !step.phaseIntro)
              }
              className="btn-primary flex-1 py-3"
            >
              {saving
                ? "保存中…"
                : isLast
                ? canProceed
                  ? "完成 →"
                  : "跳过并完成"
                : step && step.phaseIntro
                ? "好的，继续 →"
                : canProceed
                ? "下一步 →"
                : step && step.skippable
                ? "跳过 →"
                : "下一步 →"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/home", { replace: true })}
            className="btn-primary flex-1 py-3"
          >
            返回首页
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── Sub-components ───────── */

function RangeInput({ step, answers, setAnswer }) {
  const lo = answers[step.keyMin];
  const hi = answers[step.keyMax];
  const apply = (min, max) => { setAnswer(step.keyMin, min); setAnswer(step.keyMax, max); };
  const handleApplyDefaults = () => apply(step.defaults[0], step.defaults[1]);
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <span className="block text-[11px] text-white/40 mb-1 ml-1">下限</span>
          <input type="number" inputMode="numeric"
                 className="input-glass text-2xl py-3 text-center font-semibold tabular-nums"
                 value={lo ?? ""}
                 onChange={(e) => setAnswer(step.keyMin, e.target.value)}
                 min={step.min} max={step.max} placeholder={String(step.defaults[0])} />
        </div>
        <span className="text-white/30 pt-5">—</span>
        <div className="flex-1">
          <span className="block text-[11px] text-white/40 mb-1 ml-1">上限</span>
          <input type="number" inputMode="numeric"
                 className="input-glass text-2xl py-3 text-center font-semibold tabular-nums"
                 value={hi ?? ""}
                 onChange={(e) => setAnswer(step.keyMax, e.target.value)}
                 min={step.min} max={step.max} placeholder={String(step.defaults[1])} />
        </div>
        <span className="text-white/50 text-sm pt-5">{step.unit}</span>
      </div>
      {(lo === "" || lo == null) && (hi === "" || hi == null) && (
        <button type="button" onClick={handleApplyDefaults}
                className="mt-4 text-xs text-white/50 hover:text-white/80 transition-all underline underline-offset-4">
          用推荐范围 · {step.defaults[0]}–{step.defaults[1]} {step.unit}
        </button>
      )}
    </div>
  );
}

function MultiChoice({ step, answers, toggle, customInputs, setCustomInputs, addCustomTag }) {
  const selected = Array.isArray(answers[step.key]) ? answers[step.key] : [];
  const customVal = customInputs[step.key] || "";
  // Show all options + any custom entries already in selected that weren't in the option list
  const unknown = selected.filter((s) => !step.options.includes(s));
  const all = [...step.options, ...unknown];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {all.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)}
                    className="rounded-full px-4 py-2 text-sm font-medium transition-all"
                    style={on
                      ? { background: "linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)", color: "white",
                          boxShadow: "0 4px 16px rgba(255,107,157,0.35)" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)",
                          border: "1px solid rgba(255,255,255,0.12)" }}>
              {opt}
            </button>
          );
        })}
      </div>

      {step.allowCustom && (
        <div className="mt-4 flex items-center gap-2">
          <input type="text" className="input-glass flex-1 py-2 text-sm"
                 placeholder="自定义，回车添加"
                 value={customVal}
                 onChange={(e) => setCustomInputs((p) => ({ ...p, [step.key]: e.target.value }))}
                 onKeyDown={(e) => {
                   if (e.key === "Enter") { e.preventDefault(); addCustomTag(); }
                 }}
                 maxLength={16} />
          <button type="button" onClick={addCustomTag}
                  className="btn-ghost px-4 py-2 text-sm">加</button>
        </div>
      )}
    </div>
  );
}

// (named exports: getProfileMissingFields / isProfileIncomplete)
