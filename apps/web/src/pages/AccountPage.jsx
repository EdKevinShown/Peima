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

function csvToArray(s) {
  return String(s || "")
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
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
  const [preferredCities, setPreferredCities] = useState("");
  const [educationPreferences, setEducationPreferences] = useState("");
  const [occupationPreferences, setOccupationPreferences] = useState("");
  const [relationshipGoalPreferences, setRelationshipGoalPreferences] =
    useState("");
  const [styleTags, setStyleTags] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPref, setSavingPref] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请先 /login 或 URL ?userId="));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
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
        setRelationshipGoalPreferences(
          (pref.relationshipGoalPreferences || []).join(", "),
        );
        setStyleTags((pref.styleTags || []).join(", "));
      } else {
        setMinAge("");
        setMaxAge("");
        setMinHeight("");
        setMaxHeight("");
        setPreferredCities("");
        setEducationPreferences("");
        setOccupationPreferences("");
        setRelationshipGoalPreferences("");
        setStyleTags("");
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
    styleTags,
  ]);

  const field = (label, value, onChange, type = "text") => (
    <label style={{ display: "block", marginBottom: "0.65rem", fontSize: "0.88rem" }}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          display: "block",
          width: "100%",
          marginTop: 4,
          padding: "0.45rem 0.55rem",
          borderRadius: 6,
          border: "1px solid #ccc",
        }}
      />
    </label>
  );

  return (
    <main style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>账号与偏好</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        userId: <code>{userId || "（未设置）"}</code>
      </p>
      <p style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link to={`/my-images?userId=${encodeURIComponent(userId || "")}`}>
          我的图片
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
              与 <code>PATCH /users/:id</code> 对齐；手机号不可在此修改。
            </p>
            {field("昵称", nickname, setNickname)}
            {field("性别", gender, setGender)}
            {field("年龄", age, setAge, "number")}
            {field("城市", city, setCity)}
            {field("身高(cm)", height, setHeight, "number")}
            {field("学历", education, setEducation)}
            {field("职业", occupation, setOccupation)}
            {field("关系目标", relationshipGoal, setRelationshipGoal)}
            <label style={{ display: "block", marginBottom: "0.65rem", fontSize: "0.88rem" }}>
              简介
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 4,
                  padding: "0.45rem 0.55rem",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </label>
            <button type="button" onClick={onSaveProfile} disabled={savingProfile}>
              {savingProfile ? "保存中…" : "保存资料"}
            </button>
          </section>

          <section>
            <h2 style={{ fontSize: "1.05rem" }}>匹配偏好</h2>
            <p style={{ fontSize: "0.8rem", color: "#666" }}>
              <code>PUT /preferences/:userId</code>；多选用英文逗号分隔。
            </p>
            {field("年龄下限", minAge, setMinAge, "number")}
            {field("年龄上限", maxAge, setMaxAge, "number")}
            {field("身高下限", minHeight, setMinHeight, "number")}
            {field("身高上限", maxHeight, setMaxHeight, "number")}
            {field("倾向城市（逗号分隔）", preferredCities, setPreferredCities)}
            {field("学历偏好（逗号分隔）", educationPreferences, setEducationPreferences)}
            {field("职业偏好（逗号分隔）", occupationPreferences, setOccupationPreferences)}
            {field(
              "关系目标偏好（逗号分隔）",
              relationshipGoalPreferences,
              setRelationshipGoalPreferences,
            )}
            {field("风格标签（逗号分隔）", styleTags, setStyleTags)}
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
