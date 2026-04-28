import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import { getMe } from "../api/auth";
import {
  getUserPreferencesOptional,
  upsertUserPreferences,
} from "../api/preferences";
import { updateUser } from "../api/users";
import { resolveUserId } from "../utils/resolveUserId";

const GENDERS = ["男", "女", "其他"];
const EDUCATIONS = ["高中", "大专", "本科", "硕士", "博士"];
const GOALS = ["认真交往", "先从朋友开始", "开放关系", "步入婚姻", "暂不确定"];

function csvToArray(s) {
  return String(s || "")
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Reusable text / number input with glass styling */
function Field({ label, value, onChange, type = "text", placeholder, suffix }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/45 mb-1.5 ml-1">{label}</span>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-glass"
        />
        {suffix ? (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

/** Choice pills — pick one from a small set */
function ChoicePills({ label, value, onChange, options }) {
  return (
    <div>
      <span className="block text-xs font-medium text-white/45 mb-2 ml-1">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <button key={opt} type="button" onClick={() => onChange(selected ? "" : opt)}
                    className="rounded-full px-4 py-2 text-sm font-medium transition-all"
                    style={selected
                      ? { background: "linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)", color: "white", boxShadow: "0 4px 16px rgba(255,107,157,0.35)" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.12)" }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [okHint, setOkHint] = useState("");

  // Profile
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");
  const [height, setHeight] = useState("");
  const [education, setEducation] = useState("");
  const [occupation, setOccupation] = useState("");
  const [relationshipGoal, setRelationshipGoal] = useState("");
  const [bio, setBio] = useState("");

  // Preferences
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [minHeight, setMinHeight] = useState("");
  const [maxHeight, setMaxHeight] = useState("");
  const [preferredCities, setPreferredCities] = useState("");
  const [educationPreferences, setEducationPreferences] = useState("");
  const [occupationPreferences, setOccupationPreferences] = useState("");
  const [relationshipGoalPreferences, setRelationshipGoalPreferences] = useState("");
  const [styleTags, setStyleTags] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPref, setSavingPref] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请先登录"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const me = await getMe();
      if (me.id !== userId) {
        setError(new Error("URL 上的 userId 与当前登录账户不一致"));
        setLoading(false);
        return;
      }
      setNickname(me.nickname ?? "");
      setGender(me.gender ?? "");
      setAge(me.age != null ? String(me.age) : "");
      setCity(me.city ?? "");
      setHeight(me.height != null ? String(me.height) : "");
      setEducation(me.education ?? "");
      setOccupation(me.occupation ?? "");
      setRelationshipGoal(me.relationshipGoal ?? "");
      setBio(me.bio ?? "");

      const pref = await getUserPreferencesOptional(userId);
      if (pref) {
        setMinAge(pref.minAge != null ? String(pref.minAge) : "");
        setMaxAge(pref.maxAge != null ? String(pref.maxAge) : "");
        setMinHeight(pref.minHeight != null ? String(pref.minHeight) : "");
        setMaxHeight(pref.maxHeight != null ? String(pref.maxHeight) : "");
        setPreferredCities((pref.preferredCities || []).join(", "));
        setEducationPreferences((pref.educationPreferences || []).join(", "));
        setOccupationPreferences((pref.occupationPreferences || []).join(", "));
        setRelationshipGoalPreferences((pref.relationshipGoalPreferences || []).join(", "));
        setStyleTags((pref.styleTags || []).join(", "));
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const onSaveProfile = useCallback(async () => {
    if (!userId) return;
    setSavingProfile(true);
    setError(null);
    setOkHint("");
    try {
      const payload = {
        nickname: nickname.trim() || undefined,
        gender: gender.trim() || undefined,
        age: age.trim() === "" ? undefined : parseInt(age, 10),
        city: city.trim() || undefined,
        height: height.trim() === "" ? undefined : parseInt(height, 10),
        education: education.trim() || undefined,
        occupation: occupation.trim() || undefined,
        relationshipGoal: relationshipGoal.trim() || undefined,
        bio: bio.trim() || undefined,
      };
      await updateUser(userId, payload);
      if (nickname.trim()) localStorage.setItem("peimaUserNickname", nickname.trim());
      setOkHint("资料已保存");
      window.setTimeout(() => setOkHint(""), 2500);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSavingProfile(false);
    }
  }, [userId, nickname, gender, age, city, height, education, occupation, relationshipGoal, bio]);

  const onSavePreferences = useCallback(async () => {
    if (!userId) return;
    setSavingPref(true);
    setError(null);
    setOkHint("");
    try {
      await upsertUserPreferences(userId, {
        minAge: minAge.trim() === "" ? undefined : parseInt(minAge, 10),
        maxAge: maxAge.trim() === "" ? undefined : parseInt(maxAge, 10),
        minHeight: minHeight.trim() === "" ? undefined : parseInt(minHeight, 10),
        maxHeight: maxHeight.trim() === "" ? undefined : parseInt(maxHeight, 10),
        preferredCities: csvToArray(preferredCities),
        educationPreferences: csvToArray(educationPreferences),
        occupationPreferences: csvToArray(occupationPreferences),
        relationshipGoalPreferences: csvToArray(relationshipGoalPreferences),
        styleTags: csvToArray(styleTags),
      });
      setOkHint("偏好已保存");
      window.setTimeout(() => setOkHint(""), 2500);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSavingPref(false);
    }
  }, [userId, minAge, maxAge, minHeight, maxHeight, preferredCities, educationPreferences, occupationPreferences, relationshipGoalPreferences, styleTags]);

  return (
    <div className="min-h-dvh relative overflow-hidden">
      <div className="orb orb-pink" />
      <div className="orb orb-purple" />

      <div className="relative z-10 max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button type="button" onClick={() => navigate(-1)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
            ←
          </button>
          <h1 className="text-lg font-bold text-gradient">我的资料</h1>
          <div className="w-9" />
        </div>

        {loading && <LoadingState label="加载中…" />}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-2xl text-sm text-red-300 border border-red-400/25"
               style={{ background: "rgba(255,80,80,0.10)" }}>
            {error.message}
          </div>
        )}
        {okHint && (
          <div className="mb-4 px-4 py-3 rounded-2xl text-sm text-green-300 border border-green-400/25 animate-fade-in"
               style={{ background: "rgba(80,220,140,0.10)" }}>
            {okHint}
          </div>
        )}

        {!loading && userId && (
          <div className="space-y-8 animate-slide-up">
            {/* ── Profile ── */}
            <section className="glass rounded-3xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold text-white">基本资料</h2>
                  <p className="text-xs text-white/35 mt-0.5">从问卷里来的，随时可以调整</p>
                </div>
                <Link to="/onboarding"
                      className="text-xs px-3 py-1.5 rounded-full text-white/70 hover:text-white transition-all"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  重新填写
                </Link>
              </div>

              <div className="space-y-5">
                <Field label="昵称" value={nickname} onChange={setNickname} placeholder="小安" />
                <ChoicePills label="性别" value={gender} onChange={setGender} options={GENDERS} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="年龄" value={age} onChange={setAge} type="number" suffix="岁" />
                  <Field label="身高" value={height} onChange={setHeight} type="number" suffix="cm" />
                </div>
                <Field label="城市" value={city} onChange={setCity} placeholder="上海" />
                <ChoicePills label="学历" value={education} onChange={setEducation} options={EDUCATIONS} />
                <Field label="职业" value={occupation} onChange={setOccupation} placeholder="产品经理" />
                <ChoicePills label="关系目标" value={relationshipGoal} onChange={setRelationshipGoal} options={GOALS} />
                <label className="block">
                  <span className="block text-xs font-medium text-white/45 mb-1.5 ml-1">简介</span>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="input-glass resize-none"
                    placeholder="兴趣、节奏、想遇到什么样的人…"
                    style={{ minHeight: "90px" }}
                  />
                </label>
                <button type="button" onClick={onSaveProfile} disabled={savingProfile}
                        className="btn-primary w-full">
                  {savingProfile ? "保存中…" : "保存资料"}
                </button>
              </div>
            </section>

            {/* ── Matching preferences ── */}
            <section className="glass rounded-3xl p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-white">匹配偏好</h2>
                <p className="text-xs text-white/35 mt-0.5">告诉我们你想遇到什么样的人</p>
              </div>

              <div className="space-y-5">
                <div>
                  <span className="block text-xs font-medium text-white/45 mb-2 ml-1">年龄范围</span>
                  <div className="flex items-center gap-3">
                    <Field label="" value={minAge} onChange={setMinAge} type="number" placeholder="下限" />
                    <span className="text-white/30">—</span>
                    <Field label="" value={maxAge} onChange={setMaxAge} type="number" placeholder="上限" />
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-medium text-white/45 mb-2 ml-1">身高范围 (cm)</span>
                  <div className="flex items-center gap-3">
                    <Field label="" value={minHeight} onChange={setMinHeight} type="number" placeholder="下限" />
                    <span className="text-white/30">—</span>
                    <Field label="" value={maxHeight} onChange={setMaxHeight} type="number" placeholder="上限" />
                  </div>
                </div>
                <Field label="倾向城市（英文逗号分隔）" value={preferredCities} onChange={setPreferredCities}
                       placeholder="上海, 北京, 杭州" />
                <Field label="学历偏好" value={educationPreferences} onChange={setEducationPreferences}
                       placeholder="本科, 硕士" />
                <Field label="职业偏好" value={occupationPreferences} onChange={setOccupationPreferences}
                       placeholder="产品, 设计, 工程师" />
                <Field label="关系目标偏好" value={relationshipGoalPreferences} onChange={setRelationshipGoalPreferences}
                       placeholder="认真交往" />
                <Field label="风格标签" value={styleTags} onChange={setStyleTags}
                       placeholder="文艺, 户外, 温柔" />
                <button type="button" onClick={onSavePreferences} disabled={savingPref}
                        className="btn-primary w-full">
                  {savingPref ? "保存中…" : "保存偏好"}
                </button>
              </div>
            </section>

            <div className="text-center">
              <Link to={`/my-images?userId=${encodeURIComponent(userId)}`}
                    className="text-xs text-white/40 hover:text-white/70 transition-all">
                → 管理我的照片
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
