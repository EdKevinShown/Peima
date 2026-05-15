import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import { getMe } from "../api/auth";
import {
  getUserPreferencesOptional,
  upsertUserPreferences,
} from "../api/preferences";
import { updateUser } from "../api/users";
import { resolveUserId } from "../utils/resolveUserId";
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

const AGES = ageOptionsInclusive();
const HEIGHTS = heightOptionsCmInclusive();

/** Empty string → null so PATCH-like upsert clears bounds (“不限制”). */
function preferenceIntOrNull(raw) {
  if (raw === "" || raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

/** Scoped to this page only; avoids global CSS file. */
const ACCOUNT_PAGE_SCOPED_CSS = `
.account-page .account-field-label {
  display: block;
  margin-bottom: 0.65rem;
  font-size: 0.88rem;
}
.account-page .account-field-control-slot {
  margin-top: 4px;
  width: 100%;
  display: block;
}
.account-page .account-input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  line-height: normal;
  background-color: #fff;
}
.account-page .account-textarea {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-height: 88px;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.45;
  background-color: #fff;
  resize: vertical;
}
.account-page .account-select-wrap {
  position: relative;
  width: 100%;
}
.account-page .account-select {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 44px;
  padding: 0 40px 0 12px;
  margin: 0;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  line-height: normal;
  background-color: #fff;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}
.account-page .account-select-wrap::after {
  content: "";
  position: absolute;
  right: 14px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid #6b7280;
  border-bottom: 1.5px solid #6b7280;
  transform: translateY(-50%) rotate(45deg);
  pointer-events: none;
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

const chipBase = {
  margin: "4px 6px 0 0",
  padding: "0.35rem 0.55rem",
  borderRadius: 999,
  border: "1px solid #bbb",
  background: "#f5f5f5",
  cursor: "pointer",
  fontSize: "0.82rem",
};

function MultiChipGroup({ label, hint, options, selected, toggle }) {
  return (
    <div style={{ marginBottom: "0.85rem", fontSize: "0.88rem" }}>
      <span>{label}</span>
      {hint ? (
        <p
          style={{
            margin: "0.35rem 0 0",
            fontSize: "0.8rem",
            color: "#666",
            lineHeight: 1.45,
          }}
        >
          {hint}
        </p>
      ) : null}
      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap" }}>
        {options.map((tag) => {
          const on = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              style={{
                ...chipBase,
                borderColor: on ? "#1976d2" : "#bbb",
                background: on ? "#e3f2fd" : "#f5f5f5",
                fontWeight: on ? 600 : 400,
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

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
      setError(e instanceof Error ? e : new Error(String(e)));
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
      setProfileFieldError("请选择性别后再保存资料（必选：男或女）。");
      setSavingProfile(false);
      return;
    }
    const nick = nickname.trim();
    if (nick.length > 0 && (nick.length < 2 || nick.length > 20)) {
      setProfileFieldError("昵称长度为 2–20 字。");
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
      window.setTimeout(() => setOkHint(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
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

    if (minAge && maxAge) {
      const a = parseInt(minAge, 10);
      const b = parseInt(maxAge, 10);
      if (a > b) {
        setPrefRangeError("年龄下限不能大于上限。");
        setSavingPref(false);
        return;
      }
    }
    if (minHeight && maxHeight) {
      const a = parseInt(minHeight, 10);
      const b = parseInt(maxHeight, 10);
      if (a > b) {
        setPrefRangeError("身高下限不能大于上限。");
        setSavingPref(false);
        return;
      }
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
      window.setTimeout(() => setOkHint(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
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
    <main className="account-page" style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
      <style>{ACCOUNT_PAGE_SCOPED_CSS}</style>
      <h1 style={{ fontSize: "1.25rem" }}>账号与偏好</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        userId: <code>{userId || "（未设置）"}</code>
      </p>
      <p style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link
          to={`/onboarding/photo-upload?userId=${encodeURIComponent(userId || "")}`}
        >
          上传照片
        </Link>
        {" · "}
        <Link to={`/my-activity?userId=${encodeURIComponent(userId || "")}`}>
          P2 活动与统计
        </Link>
      </p>

      {loading && <LoadingState label="加载中…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}
      {okHint ? (
        <p style={{ color: "#0d6832" }} role="status">
          {okHint}
        </p>
      ) : null}

      {!loading && userId ? (
        <>
          <section style={{ marginBottom: "1.75rem" }}>
            <h2 style={{ fontSize: "1.05rem" }}>基本资料</h2>
            <p style={{ fontSize: "0.8rem", color: "#666" }}>
              与 <code>PATCH /users/:id</code> 对齐；性别为<strong>必选</strong>
              （<code>male</code> / <code>female</code>），用于匹配与第一印象预览池过滤。
            </p>
            <p style={{ fontSize: "0.78rem", color: "#555" }}>
              若生成预览池提示「请先完善性别信息后再生成预览池」，请在此选择性别并保存。
            </p>

            <label className="account-field-label">
              昵称（2–20 字，可空不修改）
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

            <fieldset
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "0.75rem",
                marginBottom: "0.75rem",
              }}
            >
              <legend style={{ fontSize: "0.88rem" }}>性别（必选）</legend>
              {ACCOUNT_GENDER_VALUES.map((v) => (
                <label
                  key={v}
                  style={{ marginRight: "1rem", fontSize: "0.88rem", cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="gender"
                    value={v}
                    checked={gender === v}
                    onChange={() => setGender(v)}
                  />{" "}
                  {ACCOUNT_DISPLAY_GENDER[v]}（{v}）
                </label>
              ))}
            </fieldset>

            <AccountSelect label="年龄" value={age} onChange={(e) => setAge(e.target.value)}>
              <option value="">请选择</option>
              {AGES.map((a) => (
                <option key={a} value={String(a)}>
                  {a}
                </option>
              ))}
            </AccountSelect>

            <AccountSelect label="所在地（省/直辖市）" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">请选择</option>
              {ACCOUNT_CITY_VALUES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </AccountSelect>

            <AccountSelect label="身高（cm）" value={height} onChange={(e) => setHeight(e.target.value)}>
              <option value="">请选择</option>
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
              <option value="">请选择</option>
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
              <option value="">请选择</option>
              {ACCOUNT_OCCUPATION_CATEGORY_VALUES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </AccountSelect>

            <AccountSelect
              label="关系目标"
              value={relationshipGoal}
              onChange={(e) => setRelationshipGoal(e.target.value)}
            >
              <option value="">请选择</option>
              {ACCOUNT_RELATIONSHIP_GOAL_VALUES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </AccountSelect>

            <label className="account-field-label">
              简介（非筛选主字段，最多 200 字）
              <div className="account-field-control-slot">
                <textarea
                  className="account-textarea"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={200}
                />
              </div>
            </label>

            {profileFieldError ? (
              <p style={{ color: "#b00020", fontSize: "0.85rem" }} role="alert">
                {profileFieldError}
              </p>
            ) : null}

            <button type="button" onClick={onSaveProfile} disabled={savingProfile}>
              {savingProfile ? "保存中…" : "保存资料"}
            </button>
          </section>

          <section>
            <h2 style={{ fontSize: "1.05rem" }}>匹配偏好</h2>
            <p style={{ fontSize: "0.8rem", color: "#666" }}>
              <code>PUT /preferences/:userId</code>；选项与资料字段同一套词表，便于硬门槛过滤。
            </p>
            <p style={{ fontSize: "0.78rem", color: "#555", marginTop: "-0.25rem" }}>
              以下均为<strong>可选</strong>：不选表示<strong>不限制</strong>；可只填年龄或身高的一侧（例如仅下限）。
            </p>

            <AccountSelect
              label="年龄下限"
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
            >
              <option value="">请选择</option>
              {AGES.map((a) => (
                <option key={a} value={String(a)}>
                  {a}
                </option>
              ))}
            </AccountSelect>
            <AccountSelect
              label="年龄上限"
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value)}
            >
              <option value="">请选择</option>
              {AGES.map((a) => (
                <option key={a} value={String(a)}>
                  {a}
                </option>
              ))}
            </AccountSelect>

            <AccountSelect
              label="身高下限（cm）"
              value={minHeight}
              onChange={(e) => setMinHeight(e.target.value)}
            >
              <option value="">请选择</option>
              {HEIGHTS.map((h) => (
                <option key={h} value={String(h)}>
                  {h}
                </option>
              ))}
            </AccountSelect>
            <AccountSelect
              label="身高上限（cm）"
              value={maxHeight}
              onChange={(e) => setMaxHeight(e.target.value)}
            >
              <option value="">请选择</option>
              {HEIGHTS.map((h) => (
                <option key={h} value={String(h)}>
                  {h}
                </option>
              ))}
            </AccountSelect>

            {prefRangeError ? (
              <p style={{ color: "#b00020", fontSize: "0.85rem" }} role="alert">
                {prefRangeError}
              </p>
            ) : null}

            <MultiChipGroup
              label="偏好地区（省/直辖市）（多选）"
              options={[...ACCOUNT_CITY_VALUES]}
              selected={preferredCities}
              toggle={toggleInList(setPreferredCities)}
            />
            <MultiChipGroup
              label="学历偏好（多选）"
              options={[...ACCOUNT_EDUCATION_VALUES]}
              selected={educationPreferences}
              toggle={toggleInList(setEducationPreferences)}
            />
            <MultiChipGroup
              label="职业偏好（多选）"
              options={[...ACCOUNT_OCCUPATION_CATEGORY_VALUES]}
              selected={occupationPreferences}
              toggle={toggleInList(setOccupationPreferences)}
            />
            <MultiChipGroup
              label="关系目标偏好（多选）"
              options={[...ACCOUNT_RELATIONSHIP_GOAL_VALUES]}
              selected={relationshipGoalPreferences}
              toggle={toggleInList(setRelationshipGoalPreferences)}
            />

            <button type="button" onClick={onSavePreferences} disabled={savingPref}>
              {savingPref ? "保存中…" : "保存偏好"}
            </button>
          </section>
        </>
      ) : null}

      <div style={{ marginTop: "1.25rem" }}>
        <button type="button" onClick={load} disabled={loading || !userId}>
          重新加载
        </button>
      </div>
    </main>
  );
}
