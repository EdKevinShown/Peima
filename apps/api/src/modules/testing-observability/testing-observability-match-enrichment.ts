import type { PrismaService } from "../../common/prisma/prisma.service";
import type {
  TestingMatchDebugSummary,
  TestingMatchUserBrief,
} from "./testing-observability.types";

function phoneTail(phone: string | null | undefined): string | null {
  const p = String(phone ?? "").trim();
  if (p.length < 4) return p || null;
  return p.slice(-4);
}

function normGender(g: string | null | undefined): string | null {
  const s = String(g ?? "").trim().toLowerCase();
  if (s === "male" || s === "m" || s === "男") return "男";
  if (s === "female" || s === "f" || s === "女") return "女";
  return s ? String(g).trim() : null;
}

function toBrief(row: {
  id: string;
  nickname: string;
  gender: string;
  age: number | null;
  city: string;
  phone: string;
}): TestingMatchUserBrief {
  const nickname = row.nickname?.trim() || null;
  return {
    userId: row.id,
    nickname,
    gender: normGender(row.gender),
    age: row.age,
    city: row.city?.trim() || null,
    phoneTail: phoneTail(row.phone),
  };
}

function fallbackBrief(userId: string): TestingMatchUserBrief {
  return {
    userId,
    nickname: null,
    gender: null,
    age: null,
    city: null,
    phoneTail: null,
  };
}

export function formatTestingMatchUserLabel(brief: TestingMatchUserBrief): string {
  if (brief.nickname) return brief.nickname;
  if (brief.phoneTail) return `尾号${brief.phoneTail}`;
  return brief.userId;
}

export function formatTestingMatchUserMeta(brief: TestingMatchUserBrief): string {
  const parts: string[] = [];
  if (brief.gender) parts.push(brief.gender);
  if (brief.age != null && Number.isFinite(brief.age)) parts.push(`${brief.age}岁`);
  if (brief.city) parts.push(brief.city);
  return parts.join(" · ");
}

export type TestingMatchDebugSummaryEnriched = TestingMatchDebugSummary & {
  viewer: TestingMatchUserBrief;
  candidate: TestingMatchUserBrief;
  displayCandidate: TestingMatchUserBrief | null;
  pairingSummary: string;
  pairingDetail: string;
  isMutualMatch: boolean;
  displayCandidateDiffers: boolean;
};

export async function enrichTestingMatchSummaries(
  prisma: PrismaService,
  items: TestingMatchDebugSummary[],
): Promise<TestingMatchDebugSummaryEnriched[]> {
  if (items.length === 0) return [];

  const ids = new Set<string>();
  for (const it of items) {
    ids.add(it.viewerUserId);
    ids.add(it.candidateUserId);
    if (it.displayCandidateUserId?.trim()) {
      ids.add(it.displayCandidateUserId.trim());
    }
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      nickname: true,
      gender: true,
      age: true,
      city: true,
      phone: true,
    },
  });
  const byId = new Map(users.map((u) => [u.id, toBrief(u)]));

  const directedPairs = new Set(
    items.map((it) => `${it.viewerUserId}\t${it.candidateUserId}`),
  );

  const reverseRows =
    items.length > 0
      ? await prisma.matchResult.findMany({
          where: {
            OR: items.map((it) => ({
              userId: it.candidateUserId,
              candidateUserId: it.viewerUserId,
            })),
          },
          select: { userId: true, candidateUserId: true },
        })
      : [];
  const reversePairs = new Set(
    reverseRows.map((r) => `${r.userId}\t${r.candidateUserId}`),
  );

  return items.map((it) => {
    const viewer = byId.get(it.viewerUserId) ?? fallbackBrief(it.viewerUserId);
    const candidate =
      byId.get(it.candidateUserId) ?? fallbackBrief(it.candidateUserId);
    const displayId = it.displayCandidateUserId?.trim() || it.candidateUserId;
    const displayCandidateDiffers = displayId !== it.candidateUserId;
    const displayCandidate = displayCandidateDiffers
      ? (byId.get(displayId) ?? fallbackBrief(displayId))
      : null;

    const viewerLabel = formatTestingMatchUserLabel(viewer);
    const candidateLabel = formatTestingMatchUserLabel(candidate);
    const viewerMeta = formatTestingMatchUserMeta(viewer);
    const candidateMeta = formatTestingMatchUserMeta(candidate);

    const pairingSummary = `${viewerLabel} → ${candidateLabel}`;
    const pairingDetail = [
      viewerMeta ? `${viewerLabel}（${viewerMeta}）` : viewerLabel,
      candidateMeta ? `${candidateLabel}（${candidateMeta}）` : candidateLabel,
    ].join(" → ");

    return {
      ...it,
      viewer,
      candidate,
      displayCandidate,
      pairingSummary,
      pairingDetail,
      isMutualMatch:
        directedPairs.has(`${it.candidateUserId}\t${it.viewerUserId}`) ||
        reversePairs.has(`${it.candidateUserId}\t${it.viewerUserId}`),
      displayCandidateDiffers,
    };
  });
}
