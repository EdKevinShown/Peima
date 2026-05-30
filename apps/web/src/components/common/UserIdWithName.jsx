import { useEffect, useState } from "react";
import { getUser } from "../../api/users";

const nicknameCache = new Map();
const inflight = new Map();

async function loadNickname(userId) {
  if (!userId) return "";
  if (nicknameCache.has(userId)) return nicknameCache.get(userId) || "";
  if (inflight.has(userId)) return inflight.get(userId);
  const p = getUser(userId)
    .then((u) => {
      const name = (u?.nickname || "").trim();
      nicknameCache.set(userId, name);
      return name;
    })
    .catch(() => {
      nicknameCache.set(userId, "");
      return "";
    })
    .finally(() => {
      inflight.delete(userId);
    });
  inflight.set(userId, p);
  return p;
}

/**
 * @param {{ userId?: string, variant?: "idWithName" | "nameOnly" }} props
 * - idWithName: 昵称（userId）或仅 userId
 * - nameOnly: 仅昵称，无昵称时显示「未设置昵称」
 */
export default function UserIdWithName({ userId, variant = "idWithName" }) {
  const id = (userId || "").trim();
  const [nickname, setNickname] = useState(() =>
    id && nicknameCache.has(id) ? nicknameCache.get(id) || "" : "",
  );

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setNickname("");
      return;
    }
    if (nicknameCache.has(id)) {
      setNickname(nicknameCache.get(id) || "");
      return;
    }
    void loadNickname(id).then((name) => {
      if (!cancelled) setNickname(name || "");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return <>（未设置）</>;
  if (variant === "nameOnly") {
    return <>{nickname || "未设置昵称"}</>;
  }
  if (!nickname) return <>{id}</>;
  return (
    <>
      {nickname}（{id}）
    </>
  );
}

