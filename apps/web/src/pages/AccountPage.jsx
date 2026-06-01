import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import UserIdWithName from "../components/common/UserIdWithName";
import { getMe } from "../api/auth";
import {
  getUserPreferencesOptional,
  upsertUserPreferences,
} from "../api/preferences";
import { updateUser } from "../api/users";
import { resolveUserId } from "../utils/resolveUserId";
import { preferenceIntOrNull } from "../utils/preferenceIntOrNull.js";
import {
  ACCOUNT_CITY_VALUES,
  ACCOUNT_DISPLAY_GENDER,
  ACCOUNT_EDUCATION_VALUES,
  ACCOUNT_GENDER_VALUES,
  ACCOUNT_MAX_AGE,
  ACCOUNT_MAX_HEIGHT_CM,
  ACCOUNT_MIN_AGE,
  ACCOUNT_MIN_HEIGHT_CM,
  ACCOUNT_OCCUPATION_CATEGORY_VALUES,
  ACCOUNT_RELATIONSHIP_GOAL_VALUES,
  ageOptionsInclusive,
  heightOptionsCmInclusive,
} from "@peima/shared/constants";
import { mapAccountApiErrorMessage } from "../utils/accountApiErrorMap";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { toFriendlyUserMessage } from "../utils/friendlyErrors";
import AccountProfileSuggestionsSection from "../components/profile/AccountProfileSuggestionsSection";

const AGES = ageOptionsInclusive();
const HEIGHTS = heightOptionsCmInclusive();

/**
 * When a side is non-empty in the UI, enforce allowed range; empty = no constraint.
 * Uses the same coercion as the save payload (`preferenceIntOrNull`).
 */
function validatePreferenceAgeHeightInputs({
  minAge,
  maxAge,
  minHeight,
  maxHeight,
}) {
  const checkAgeSide = (raw) => {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    const n = preferenceIntOrNull(raw);
    if (n == null) {
      return "请从列表中选择年龄。";
    }
    if (n < ACCOUNT_MIN_AGE || n > ACCOUNT_MAX_AGE) {
      return `年龄请在 ${ACCOUNT_MIN_AGE}–${ACCOUNT_MAX_AGE} 岁之间选择。`;
    }
    return null;
  };
  const checkHeightSide = (raw) => {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    const n = preferenceIntOrNull(raw);
    if (n == null) {
      return "请从列表中选择身高。";
    }
    if (n < ACCOUNT_MIN_HEIGHT_CM || n > ACCOUNT_MAX_HEIGHT_CM) {
      return `身高请在 ${ACCOUNT_MIN_HEIGHT_CM}–${ACCOUNT_MAX_HEIGHT_CM} cm 之间选择。`;
    }
    return null;
  };

  return (
    checkAgeSide(minAge) ||
    checkAgeSide(maxAge) ||
    checkHeightSide(minHeight) ||
    checkHeightSide(maxHeight) ||
    null
  );
}

/** Scoped to this page only. */
const ACCOUNT_PAGE_SCOPED_CSS = `
.account-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2.5rem;
}
.account-page__title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
  margin: 0 0 0.35rem;
}
.account-page__lead {
  margin: 0 0 1rem;
  font-size: 0.86rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.52);
}
.account-page__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  margin-bottom: 1.25rem;
  font-size: 0.85rem;
}
.account-page__nav a {
  color: rgba(255, 255, 255, 0.72);
  text-decoration: none;
}
.account-page__nav a:hover {
  color: #fff;
}
.account-page__section {
  margin-bottom: 1.75rem;
  padding: 1.1rem 1rem 1.2rem;
  border-radius: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(
    165deg,
    rgba(255, 255, 255, 0.055) 0%,
    rgba(255, 255, 255, 0.02) 55%,
    rgba(0, 0, 0, 0.08) 100%
  );
}
.account-page__section h2 {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: #fff;
}
.account-page__section-hint {
  margin: 0 0 1rem;
  font-size: 0.8rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.48);
}
.account-page .account-field-label {
  display: block;
  margin-bottom: 0.75rem;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.78);
}
.account-page .account-field-control-slot {
  margin-top: 0.35rem;
  width: 100%;
  display: block;
}
.account-page .account-input,
.account-page .account-textarea,
.account-page .account-select {
  box-sizing: border-box;
  display: block;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 0.75rem;
  font-size: 0.9rem;
  color: #fff;
  background: rgba(255, 255, 255, 0.07);
}
.account-page .account-input,
.account-page .account-select {
  height: 44px;
  padding: 0 12px;
}
.account-page .account-textarea {
  min-height: 88px;
  padding: 12px;
  line-height: 1.45;
  resize: vertical;
}
.account-page .account-select-wrap {
  position: relative;
  width: 100%;
}
.account-page .account-select {
  padding-right: 2.25rem;
  appearance: none;
  -webkit-appearance: none;
}
.account-page .account-select option {
  background: #1e1b3a;
  color: #fff;
}
.account-page .account-select-wrap::after {
  content: "";
  position: absolute;
  right: 14px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid rgba(255, 255, 255, 0.45);
  border-bottom: 1.5px solid rgba(255, 255, 255, 0.45);
  transform: translateY(-50%) rotate(45deg);
  pointer-events: none;
}
.account-page .account-gender-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}
.account-page .account-gender-btn {
  flex: 1;
  padding: 0.55rem 0.75rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.9rem;
  cursor: pointer;
}
.account-page .account-gender-btn--on {
  border-color: rgba(255, 107, 157, 0.45);
  background: linear-gradient(135deg, rgba(255, 107, 157, 0.32), rgba(196, 77, 255, 0.28));
  color: #fff;
}
.account-page .account-range-block {
  margin-bottom: 0.85rem;
}
.account-page .account-range-block__title {
  margin: 0 0 0.25rem;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.78);
}
.account-page .account-range-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.45rem;
  align-items: end;
}
.account-page .account-range-sep {
  padding-bottom: 0.65rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.4);
}
.account-page .account-range-row .account-field-label {
  margin-bottom: 0;
}
.account-page .account-chip-group__label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.78);
}
.account-page .account-chip-group__hint {
  margin: 0 0 0.45rem;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.45;
}
.account-page .account-chip-group {
  margin-bottom: 0.85rem;
}
.account-page .account-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.account-page .account-chip {
  padding: 0.4rem 0.7rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.8rem;
  cursor: pointer;
}
.account-page .account-chip--on {
  border-color: rgba(255, 107, 157, 0.45);
  background: linear-gradient(135deg, rgba(255, 107, 157, 0.32), rgba(196, 77, 255, 0.28));
  color: #fff;
}
.account-page .account-regions-details {
  margin-bottom: 0.85rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
}
.account-page .account-regions-details > summary {
  padding: 0.65rem 0.75rem;
  cursor: pointer;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.72);
  list-style: none;
}
.account-page .account-regions-details > summary::-webkit-details-marker {
  display: none;
}
.account-page .account-regions-details__body {
  padding: 0 0.75rem 0.75rem;
}
.account-page .account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.5rem;
}
.account-page .account-tech-id {
  margin: 0 0 0.75rem;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.38);
  font-family: ui-monospace, monospace;
}
`;

function AccountSelect({ label, value, onChange, children }) {
  return (
    <label className="account-field-label">
      {label}
      <div className="account-field-control-slot">
        <div className="account-select-wrap">
          <select className="account-select" value={value} onChange={onChange}>
            {children}
          </select>
        </div>
      </div>
    </label>
  );
}

function MultiChipGroup({ label, hint, options, selected, toggle }) {
  return (
    <div className="account-chip-group">
      {label ? <span className="account-chip-group__label">{label}</span> : null}
      {hint ? <p className="account-chip-group__hint">{hint}</p> : null}
      <div className="account-chips">
        {options.map((tag) => {
          const on = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`account-chip${on ? " account-chip--on" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(tag)}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccountRangeRow({ title, minValue, maxValue, onMinChange, onMaxChange, options, unit = "" }) {
  const suffix = unit ? ` ${unit}` : "";
  return (
    <div className="account-range-block">
      <p className="account-range-block__title">{title}</p>
      <div className="account-range-row">
        <AccountSelect label="从" value={minValue} onChange={onMinChange}>
          <option value="">不限</option>
          {options.map((n) => (
            <option key={n} value={String(n)}>
              {n}
              {suffix}
            </option>
          ))}
        </AccountSelect>
        <span className="account-range-sep">至</span>
        <AccountSelect label="到" value={maxValue} onChange={onMaxChange}>
          <option value="">不限</option>
          {options.map((n) => (
            <option key={n} value={String(n)}>
              {n}
              {suffix}
            </option>
          ))}
        </AccountSelect>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const conversationIdFromUrl = useMemo(
    () => searchParams.get("conversationId")?.trim() || "",
    [searchParams],
  );
  const isDebugMode = useMemo(() => searchParams.get("debug") === "1", [searchParams]);
  const { isAdmin } = useAdminAccess();
  const showDebug = isDebugMode && isAdmin;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [okHint, setOkHint] = useState("");

  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");
  const [height, setHeight] = useState("");
  const [education, setEducation] = useState("");
  const [occupation, setOccupation] = useState("");
  const [relationshipGoal, setRelationshipGoal] = useState("");
  const [bio, setBio] = useState("");

  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [minHeight, setMinHeight] = useState("");
  const [maxHeight, setMaxHeight] = useState("");
  const [preferredCities, setPreferredCities] = useState([]);
  const [educationPreferences, setEducationPreferences] = useState([]);
  const [occupationPreferences, setOccupationPreferences] = useState([]);
  const [relationshipGoalPreferences, setRelationshipGoalPreferences] =
    useState([]);

  const [profileFieldError, setProfileFieldError] = useState("");
  const [prefRangeError, setPrefRangeError] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPref, setSavingPref] = useState(false);

  const toggleInList = useCallback((setter) => (tag) => {
    setter((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请先 /login 或 URL ?userId="));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setProfileFieldError("");
    setPrefRangeError("");
    try {
      const me = await getMe();
      if (me.id !== userId) {
        setError(
          new Error("URL 的 userId 与当前登录用户不一致，请改为当前账号 id"),
        );
        setLoading(false);
        return;
      }
      setNickname(me.nickname ?? "");
      const gRaw = String(me.gender ?? "").trim().toLowerCase();
      if (me.gender === "男" || gRaw === "m") setGender("male");
      else if (me.gender === "女" || gRaw === "f") setGender("female");
      else setGender(ACCOUNT_GENDER_VALUES.includes(me.gender) ? me.gender : "");
      setAge(me.age != null ? String(me.age) : "");
      setCity(ACCOUNT_CITY_VALUES.includes(me.city) ? me.city : "");
      setHeight(me.height != null ? String(me.height) : "");
      setEducation(ACCOUNT_EDUCATION_VALUES.includes(me.education)
        ? me.education
        : "");
      setOccupation(ACCOUNT_OCCUPATION_CATEGORY_VALUES.includes(me.occupation)
        ? me.occupation
        : "");
      setRelationshipGoal(
        ACCOUNT_RELATIONSHIP_GOAL_VALUES.includes(me.relationshipGoal)
          ? me.relationshipGoal
          : "",
      );
      setBio(me.bio ?? "");

      const pref = await getUserPreferencesOptional(userId);
      if (pref) {
        setMinAge(pref.minAge != null ? String(pref.minAge) : "");
        setMaxAge(pref.maxAge != null ? String(pref.maxAge) : "");
        setMinHeight(pref.minHeight != null ? String(pref.minHeight) : "");
        setMaxHeight(pref.maxHeight != null ? String(pref.maxHeight) : "");
        setPreferredCities(
          (pref.preferredCities || []).filter((c) =>
            ACCOUNT_CITY_VALUES.includes(c),
          ),
        );
        setEducationPreferences(
          (pref.educationPreferences || []).filter((c) =>
            ACCOUNT_EDUCATION_VALUES.includes(c),
          ),
        );
        setOccupationPreferences(
          (pref.occupationPreferences || []).filter((c) =>
            ACCOUNT_OCCUPATION_CATEGORY_VALUES.includes(c),
          ),
        );
        setRelationshipGoalPreferences(
          (pref.relationshipGoalPreferences || []).filter((c) =>
            ACCOUNT_RELATIONSHIP_GOAL_VALUES.includes(c),
          ),
        );
      } else {
        setMinAge("");
        setMaxAge("");
        setMinHeight("");
        setMaxHeight("");
        setPreferredCities([]);
        setEducationPreferences([]);
        setOccupationPreferences([]);
        setRelationshipGoalPreferences([]);
      }
    } catch (e) {
      setError(new Error(mapAccountApiErrorMessage(e)));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSaveProfile = useCallback(async () => {
    if (!userId) return;
    setSavingProfile(true);
    setError(null);
    setOkHint("");
    setProfileFieldError("");
    if (!gender) {
      setProfileFieldError("请先选择性别。");
      setSavingProfile(false);
      return;
    }
    const nick = nickname.trim();
    if (nick.length > 0 && (nick.length < 2 || nick.length > 20)) {
      setProfileFieldError("昵称请填写 2–20 个字。");
      setSavingProfile(false);
      return;
    }
    if (bio.length > 200) {
      setProfileFieldError("简介请控制在 200 字以内。");
      setSavingProfile(false);
      return;
    }
    try {
      const payload = {
        ...(nick ? { nickname: nick } : {}),
        gender,
        ...(age ? { age: parseInt(age, 10) } : {}),
        ...(city ? { city } : {}),
        ...(height ? { height: parseInt(height, 10) } : {}),
        ...(education ? { education } : {}),
        ...(occupation ? { occupation } : {}),
        ...(relationshipGoal ? { relationshipGoal } : {}),
        ...(bio.trim() ? { bio: bio.trim() } : {}),
      };
      await updateUser(userId, payload);
      setOkHint("资料已保存");
    } catch (e) {
      setError(new Error(mapAccountApiErrorMessage(e)));
    } finally {
      setSavingProfile(false);
    }
  }, [
    userId,
    nickname,
    gender,
    age,
    city,
    height,
    education,
    occupation,
    relationshipGoal,
    bio,
  ]);

  const onSavePreferences = useCallback(async () => {
    if (!userId) return;
    setSavingPref(true);
    setError(null);
    setOkHint("");
    setPrefRangeError("");

    const ma = preferenceIntOrNull(minAge);
    const xa = preferenceIntOrNull(maxAge);
    if (ma != null && xa != null && ma > xa) {
      setPrefRangeError("年龄「从」不能大于「到」。");
      setSavingPref(false);
      return;
    }
    const mh = preferenceIntOrNull(minHeight);
    const xh = preferenceIntOrNull(maxHeight);
    if (mh != null && xh != null && mh > xh) {
      setPrefRangeError("身高「从」不能大于「到」。");
      setSavingPref(false);
      return;
    }

    const boundErr = validatePreferenceAgeHeightInputs({
      minAge,
      maxAge,
      minHeight,
      maxHeight,
    });
    if (boundErr) {
      setPrefRangeError(boundErr);
      setSavingPref(false);
      return;
    }

    try {
      await upsertUserPreferences(userId, {
        minAge: preferenceIntOrNull(minAge),
        maxAge: preferenceIntOrNull(maxAge),
        minHeight: preferenceIntOrNull(minHeight),
        maxHeight: preferenceIntOrNull(maxHeight),
        preferredCities,
        educationPreferences,
        occupationPreferences,
        relationshipGoalPreferences,
      });
      setOkHint("偏好已保存");
    } catch (e) {
      setError(new Error(mapAccountApiErrorMessage(e)));
    } finally {
      setSavingPref(false);
    }
  }, [
    userId,
    minAge,
    maxAge,
    minHeight,
    maxHeight,
    preferredCities,
    educationPreferences,
    occupationPreferences,
    relationshipGoalPreferences,
  ]);

  return (
    <main className="app-themed-content account-page">
      <style>{ACCOUNT_PAGE_SCOPED_CSS}</style>
      <h1 className="account-page__title">我的资料</h1>
      <p className="account-page__lead">完善资料后，匹配和预览会更准。偏好条件都可以留空，表示不限制。</p>
      {showDebug ? (
        <p className="account-tech-id">
          userId: <UserIdWithName userId={userId} />
        </p>
      ) : null}
      <nav className="account-page__nav" aria-label="快捷入口">
        <Link to="/">首页</Link>
        <span aria-hidden>·</span>
        <Link to={`/onboarding/photo-upload?userId=${encodeURIComponent(userId || "")}`}>
          上传照片
        </Link>
        <span aria-hidden>·</span>
        <Link to={`/my-activity?userId=${encodeURIComponent(userId || "")}`}>我的动态</Link>
      </nav>

      {loading && <LoadingState label="加载中…" />}
      {error && (
        <p className="chat-status-err" role="alert">
          {toFriendlyUserMessage(error.message)}
        </p>
      )}
      {okHint ? (
        <p className="chat-status-ok mb-3" role="status">
          {okHint}
        </p>
      ) : null}

      {!loading && userId ? (
        <>
          <section className="account-page__section">
            <h2>关于你</h2>
            <p className="account-page__section-hint">性别需要选择一项，其余可按需填写。</p>

            <label className="account-field-label">
              昵称
              <div className="account-field-control-slot">
                <input
                  type="text"
                  className="account-input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={20}
                />
              </div>
            </label>

            <div className="account-field-label" style={{ marginBottom: "0.5rem" }}>
              性别
              <div className="account-gender-row" role="group" aria-label="性别">
                {ACCOUNT_GENDER_VALUES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`account-gender-btn${gender === v ? " account-gender-btn--on" : ""}`}
                    aria-pressed={gender === v}
                    onClick={() => setGender(v)}
                  >
                    {ACCOUNT_DISPLAY_GENDER[v]}
                  </button>
                ))}
              </div>
            </div>

            <AccountSelect label="年龄" value={age} onChange={(e) => setAge(e.target.value)}>
              <option value="">选填</option>
              {AGES.map((a) => (
                <option key={a} value={String(a)}>
                  {a}
                </option>
              ))}
            </AccountSelect>

            <AccountSelect label="所在城市" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">选填</option>
              {ACCOUNT_CITY_VALUES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </AccountSelect>

            <AccountSelect label="身高（cm）" value={height} onChange={(e) => setHeight(e.target.value)}>
              <option value="">选填</option>
              {HEIGHTS.map((h) => (
                <option key={h} value={String(h)}>
                  {h} cm
                </option>
              ))}
            </AccountSelect>

            <AccountSelect
              label="学历"
              value={education}
              onChange={(e) => setEducation(e.target.value)}
            >
              <option value="">选填</option>
              {ACCOUNT_EDUCATION_VALUES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </AccountSelect>

            <AccountSelect
              label="职业"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
            >
              <option value="">选填</option>
              {ACCOUNT_OCCUPATION_CATEGORY_VALUES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </AccountSelect>

            <AccountSelect
              label="关系期待"
              value={relationshipGoal}
              onChange={(e) => setRelationshipGoal(e.target.value)}
            >
              <option value="">选填</option>
              {ACCOUNT_RELATIONSHIP_GOAL_VALUES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </AccountSelect>

            <label className="account-field-label">
              一句话介绍自己（选填，最多 200 字）
              <div className="account-field-control-slot">
                <textarea
                  className="account-textarea"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={200}
                  placeholder="例如：喜欢户外，周末常去爬山…"
                />
              </div>
            </label>

            {profileFieldError ? (
              <p className="chat-status-err" style={{ fontSize: "0.85rem" }} role="alert">
                {profileFieldError}
              </p>
            ) : null}

            <div className="account-actions">
              <button
                type="button"
                className="btn-primary text-sm py-2.5 px-5"
                onClick={onSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? "保存中…" : "保存资料"}
              </button>
            </div>
          </section>

          <section className="account-page__section">
            <h2>希望认识怎样的人</h2>
            <p className="account-page__section-hint">
              以下都可不选；年龄和身高可以只填「从」或只填「到」。
            </p>

            <AccountRangeRow
              title="年龄"
              minValue={minAge}
              maxValue={maxAge}
              onMinChange={(e) => setMinAge(e.target.value)}
              onMaxChange={(e) => setMaxAge(e.target.value)}
              options={AGES}
            />
            <AccountRangeRow
              title="身高（cm）"
              minValue={minHeight}
              maxValue={maxHeight}
              onMinChange={(e) => setMinHeight(e.target.value)}
              onMaxChange={(e) => setMaxHeight(e.target.value)}
              options={HEIGHTS}
            />

            {prefRangeError ? (
              <p className="chat-status-err" style={{ fontSize: "0.85rem" }} role="alert">
                {prefRangeError}
              </p>
            ) : null}

            <details className="account-regions-details">
              <summary>
                偏好地区（已选 {preferredCities.length} 个，不选表示不限）
              </summary>
              <div className="account-regions-details__body">
                <MultiChipGroup
                  label=""
                  options={[...ACCOUNT_CITY_VALUES]}
                  selected={preferredCities}
                  toggle={toggleInList(setPreferredCities)}
                />
              </div>
            </details>

            <MultiChipGroup
              label="学历"
              hint="可多选，不选表示不限"
              options={[...ACCOUNT_EDUCATION_VALUES]}
              selected={educationPreferences}
              toggle={toggleInList(setEducationPreferences)}
            />
            <MultiChipGroup
              label="职业"
              hint="可多选，不选表示不限"
              options={[...ACCOUNT_OCCUPATION_CATEGORY_VALUES]}
              selected={occupationPreferences}
              toggle={toggleInList(setOccupationPreferences)}
            />
            <MultiChipGroup
              label="关系期待"
              hint="可多选，不选表示不限"
              options={[...ACCOUNT_RELATIONSHIP_GOAL_VALUES]}
              selected={relationshipGoalPreferences}
              toggle={toggleInList(setRelationshipGoalPreferences)}
            />

            <div className="account-actions">
              <button
                type="button"
                className="btn-primary text-sm py-2.5 px-5"
                onClick={onSavePreferences}
                disabled={savingPref}
              >
                {savingPref ? "保存中…" : "保存偏好"}
              </button>
              <button
                type="button"
                className="btn-ghost text-sm py-2 px-4"
                onClick={load}
                disabled={loading || !userId}
              >
                重新加载
              </button>
            </div>
          </section>

          <AccountProfileSuggestionsSection
            userId={userId}
            conversationId={conversationIdFromUrl}
          />
        </>
      ) : null}
    </main>
  );
}
