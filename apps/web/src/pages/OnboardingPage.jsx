import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMe } from "../api/auth";
import { updateUser } from "../api/users";
import { getUserPreferencesOptional, upsertUserPreferences } from "../api/preferences";

/**
 * Step types
 *   - "text"   → free text
 *   - "number" → numeric input (age / height)
 *   - "choice" → pick one (auto-advance)
 *   - "long"   → textarea
 *   - "range"  → min / max pair (stored under keyMin / keyMax)
 *   - "multi"  → toggle-select multiple from a list
 *
 * Each step belongs to `section`: "profile" (→ PATCH /users/:id)
 * or "preference" (→ PUT /preferences/:userId).
 */
const STEPS = [
  // ── Phase 1: about you ──
  { section: "profile", key: "nickname",  label: "你想被叫什么",       type: "text",   placeholder: "例：小安" },
  { section: "profile", key: "gender",    label: "你是",               type: "choice", options: ["男", "女", "其他"] },
  { section: "profile", key: "age",       label: "你多大了",           type: "number", unit: "岁", min: 16, max: 80 },
  { section: "profile", key: "height",    label: "身高呢",             type: "number", unit: "cm", min: 140, max: 210 },
  { section: "profile", key: "city",      label: "你在哪座城市",       type: "text",   placeholder: "例：上海" },
  { section: "profile", key: "education", label: "最高学历",           type: "choice", options: ["高中", "大专", "本科", "硕士", "博士"] },
  { section: "profile", key: "occupation",label: "你的职业",           type: "text",   placeholder: "例：产品经理" },
  { section: "profile", key: "relationshipGoal", label: "你想要怎样的关系", type: "choice",
    options: ["认真交往", "先从朋友开始", "开放关系", "步入婚姻", "暂不确定"] },
  { section: "profile", key: "bio",       label: "一句话介绍你自己",    type: "long",
    placeholder: "兴趣、节奏、想遇到什么样的人…", skippable: true },

  // ── Phase 2: about Ta ──
  { section: "preference", phaseIntro: true, label: "接下来，聊聊你理想中的 Ta",
    sub: "别急，可以随时回来改，系统会越来越懂你" },
  { section: "preference", key: "__ageRange",    label: "Ta 的年龄在什么区间",  type: "range",
    keyMin: "minAge", keyMax: "maxAge",  unit: "岁", min: 16, max: 80,  defaults: [22, 35] },
  { section: "preference", key: "__heightRange", label: "Ta 的身高大概多少",    type: "range",
    keyMin: "minHeight", keyMax: "maxHeight", unit: "cm", min: 140, max: 210, defaults: [160, 185] },
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
function isProfileIncomplete(me) {
  if (!me) return true;
  return !me.gender || !me.age || !me.city || !me.height;
}

/** Total "countable" steps (excludes intro screens) */
const COUNTABLE = STEPS.filter((s) => !s.phaseIntro).length;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [customInputs, setCustomInputs] = useState({});  // per-step typed "custom" tags buffer
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const userId = useMemo(() => localStorage.getItem("peimaUserId") || "", []);
  const step = STEPS[stepIdx];

  // Count progress ignoring phaseIntro screens
  const countIdxOfStep = useMemo(() => {
    let n = 0;
    for (let i = 0; i <= stepIdx; i++) if (!STEPS[i].phaseIntro) n++;
    return n;
  }, [stepIdx]);
  const progress = (countIdxOfStep / COUNTABLE) * 100;

  /* Prefill */
  useEffect(() => {
    if (!userId) { navigate("/login", { replace: true }); return; }
    (async () => {
      try {
        const me = await getMe();
        const pref = await getUserPreferencesOptional(userId);
        setAnswers({
          nickname: me.nickname || "",
          gender: me.gender || "",
          age: me.age ?? "",
          height: me.height ?? "",
          city: me.city || "",
          education: me.education || "",
          occupation: me.occupation || "",
          relationshipGoal: me.relationshipGoal || "",
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
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, navigate]);

  const setAnswer = useCallback((key, val) => {
    setAnswers((prev) => ({ ...prev, [key]: val }));
  }, []);

  /* Current-step helpers */
  const getVal = (k) => answers[k];
  const currentValue = step.key ? getVal(step.key) : undefined;

  const canProceed = useMemo(() => {
    if (step.phaseIntro) return true;
    if (step.skippable) return true;
    switch (step.type) {
      case "text":
      case "long":
        return typeof currentValue === "string" && currentValue.trim().length > 0;
      case "number":
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
    if (stepIdx === 0) navigate("/home", { replace: true });
    else setStepIdx((i) => i - 1);
  }, [stepIdx, navigate]);

  const submitAll = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      const profilePayload = {};
      const prefPayload = {};
      for (const s of STEPS) {
        if (s.phaseIntro) continue;
        if (s.type === "range") {
          const lo = answers[s.keyMin];
          const hi = answers[s.keyMax];
          if (lo !== "" && lo != null) profilePayload[s.keyMin] = undefined; // skip in profile
          if (hi !== "" && hi != null) profilePayload[s.keyMax] = undefined;
          if (lo !== "" && lo != null) prefPayload[s.keyMin] = parseInt(String(lo), 10);
          if (hi !== "" && hi != null) prefPayload[s.keyMax] = parseInt(String(hi), 10);
          continue;
        }
        const v = answers[s.key];
        if (v === "" || v === null || v === undefined) continue;
        const target = s.section === "profile" ? profilePayload : prefPayload;
        if (s.type === "number") {
          const n = typeof v === "number" ? v : parseInt(String(v), 10);
          if (!Number.isNaN(n)) target[s.key] = n;
        } else if (s.type === "multi") {
          target[s.key] = Array.isArray(v) ? v.filter(Boolean) : [];
        } else {
          target[s.key] = String(v).trim();
        }
      }

      // Clean undefined out of profilePayload
      Object.keys(profilePayload).forEach((k) => {
        if (profilePayload[k] === undefined) delete profilePayload[k];
      });

      const updated = await updateUser(userId, profilePayload);
      if (updated?.nickname) {
        localStorage.setItem("peimaUserNickname", updated.nickname);
      }
      if (Object.keys(prefPayload).length > 0) {
        await upsertUserPreferences(userId, prefPayload);
      }
      navigate("/home", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [userId, answers, navigate]);

  const goNext = useCallback(() => {
    if (!canProceed && !step.skippable && !step.phaseIntro) return;
    if (stepIdx === STEPS.length - 1) void submitAll();
    else setStepIdx((i) => i + 1);
  }, [stepIdx, canProceed, submitAll, step]);

  const onInputKeyDown = (e) => {
    if (e.key === "Enter" && step.type !== "long") {
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

  const isLast = stepIdx === STEPS.length - 1;

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
        {!step.phaseIntro && (
          <span className="text-xs text-white/40 tabular-nums">{countIdxOfStep} / {COUNTABLE}</span>
        )}
        {step.phaseIntro && <span />}
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
        ) : (
          <div key={stepIdx} className="animate-fade-in">
            {step.phaseIntro ? (
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
                <p className="text-xs text-white/30 uppercase tracking-widest mb-3">
                  第 {countIdxOfStep} 题 {step.skippable ? "· 可跳过" : ""}
                </p>
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
                                onClick={() => { setAnswer(step.key, opt); setTimeout(goNext, 180); }}
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
        <button type="button" onClick={goBack} disabled={saving}
                className="btn-ghost flex-shrink-0 px-5 py-3 text-sm">
          {stepIdx === 0 ? "返回" : "上一步"}
        </button>
        <button type="button" onClick={goNext}
                disabled={saving || (!canProceed && !step.skippable && !step.phaseIntro)}
                className="btn-primary flex-1 py-3">
          {saving ? "保存中…"
            : isLast ? (canProceed ? "完成 →" : "跳过并完成")
            : step.phaseIntro ? "好的，继续 →"
            : (canProceed ? "下一步 →" : (step.skippable ? "跳过 →" : "下一步 →"))}
        </button>
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

/* Exported for Login gating */
export { isProfileIncomplete };
