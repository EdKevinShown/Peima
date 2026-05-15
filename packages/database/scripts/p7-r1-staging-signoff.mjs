/**
 * P7.4-r1 staging signoff harness (local).
 * API + DB setup; prints JSON results for QA doc.
 * Run: pnpm dotenv -e ../../.env -- node scripts/p7-r1-staging-signoff.mjs
 * (from packages/database)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, "..", "..", "..");

function loadEnvFile() {
  try {
    const envPath = join(REPO, ".env");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}
loadEnvFile();

const API = (process.env.VITE_API_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const prisma = new PrismaClient();
const TEST_JPG = join(REPO, "dev-assets", "test-user-images", "test-user-images1.jpg");

const results = [];

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

async function api(method, path, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function registerUser(label) {
  const phone = `1${String(Date.now() + Math.floor(Math.random() * 1000)).slice(-10)}`;
  const { status, json } = await api("POST", "/auth/register", {
    body: { phone, nickname: `signoff-${label}` },
  });
  if (status !== 201 && status !== 200) {
    throw new Error(`register failed ${label}: ${status} ${JSON.stringify(json)}`);
  }
  return { userId: json.user.id, token: json.token, phone };
}

async function assignOperator(userId) {
  await prisma.userRole.upsert({
    where: { userId_roleCode: { userId, roleCode: "OPERATOR" } },
    create: { userId, roleCode: "OPERATOR", grantedBy: userId },
    update: { updatedAt: new Date() },
  });
}

async function photoStatus(token) {
  const { status, json } = await api("GET", "/onboarding/photo/status", { token });
  if (status !== 200) throw new Error(`photo status ${status}`);
  return json;
}

async function listImages(token, userId) {
  const { status, json } = await api("GET", `/images/user/${userId}`, { token });
  if (status !== 200) throw new Error(`list images ${status}`);
  return json;
}

async function createImageRow(userId, fields) {
  return prisma.userImage.create({
    data: {
      userId,
      imageUrl: `http://localhost:3000/uploads/user-images/signoff-${Date.now()}.jpg`,
      detectionStatus: "passed",
      reviewStatus: "not_required",
      detectionReasonCodes: [],
      ...fields,
    },
  });
}

async function uploadImage(token, userId) {
  const buf = readFileSync(TEST_JPG);
  const fd = new FormData();
  fd.append("userId", userId);
  fd.append("file", new Blob([buf], { type: "image/jpeg" }), "signoff.jpg");
  return api("POST", "/images/upload", { token, formData: fd });
}

function record(id, pass, detail, extra = {}) {
  results.push({ id, pass, detail, ...extra });
}

async function run() {
  log(`API base: ${API}`);
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing");
  }

  const admin = await registerUser("admin");
  await assignOperator(admin.userId);
  const adminToken = admin.token;
  const regularNoPerm = await registerUser("noperm");

  const pendingUser = await registerUser("pending");
  const pendingImg = await createImageRow(pendingUser.userId, {
    detectionStatus: "skipped",
    reviewStatus: "pending_review",
    detectionReasonCodes: ["DETECTION_SKIPPED_REVIEW"],
  });

  try {
    let r = await api("GET", "/admin/photo-review/items?reviewStatus=pending_review", {
      token: adminToken,
    });
    record("9-list", r.status === 200 && Array.isArray(r.json?.items), `list ${r.status}`);

    r = await api("GET", `/admin/photo-review/items/${pendingImg.id}`, { token: adminToken });
    record("9-detail", r.status === 200, `detail ${r.status}`);

    r = await api("POST", `/admin/photo-review/items/${pendingImg.id}/approve`, {
      token: adminToken,
      body: { note: "signoff approve" },
    });
    record(
      "9-approve",
      (r.status === 200 || r.status === 201) && r.json?.reviewStatus === "approved",
      `approve status=${r.status} review=${r.json?.reviewStatus}`,
    );

    const img2 = await createImageRow(pendingUser.userId, {
      detectionStatus: "skipped",
      reviewStatus: "pending_review",
    });
    r = await api("POST", `/admin/photo-review/items/${img2.id}/reject`, {
      token: adminToken,
      body: { reasonCodes: ["MANUAL_REJECTED"], note: "secret review note" },
    });
    record(
      "9-reject",
      (r.status === 200 || r.status === 201) && r.json?.reviewStatus === "rejected",
      `reject status=${r.status} review=${r.json?.reviewStatus}`,
    );

    const img3 = await createImageRow(pendingUser.userId, {
      detectionStatus: "skipped",
      reviewStatus: "pending_review",
    });
    r = await api("POST", `/admin/photo-review/items/${img3.id}/needs-reupload`, {
      token: adminToken,
      body: { reasonCodes: ["NEEDS_REUPLOAD"], note: "reupload note" },
    });
    record(
      "9-needs-reupload",
      (r.status === 200 || r.status === 201) &&
        r.json?.reviewStatus === "needs_reupload",
      `needs-reupload status=${r.status} review=${r.json?.reviewStatus}`,
    );

    r = await api("GET", `/admin/photo-review/items/${img3.id}`, { token: adminToken });
    record("9-detail-refresh", r.status === 200 && r.json?.reviewStatus === "needs_reupload", "refresh");

    r = await api("GET", `/admin/photo-review/items/${pendingImg.id}`, { token: adminToken });
    record("9-reviewNote-admin", r.status === 200 && r.json?.reviewNote != null, "admin reviewNote");
  } catch (e) {
    record("9-admin", false, String(e));
  }

  try {
    const r = await api("GET", "/admin/photo-review/items", { token: regularNoPerm.token });
    record("10-forbidden", r.status === 403, `status=${r.status}`);
  } catch (e) {
    record("10-forbidden", false, String(e));
  }

  try {
    const u = await registerUser("s1");
    const img = await createImageRow(u.userId, {
      detectionStatus: "passed",
      reviewStatus: "rejected",
      reviewReasonCodes: ["MANUAL_REJECTED"],
      reviewNote: "ADMIN_ONLY_NOTE_S1",
    });
    const st = await photoStatus(u.token);
    const imgs = await listImages(u.token, u.userId);
    const hasNote = JSON.stringify(imgs).includes("ADMIN_ONLY_NOTE");
    record(
      "1-rejected",
      !st.hasPassingPhoto &&
        st.nextStep === "photo_upload" &&
        st.photoGateMessageKey === "photo_rejected" &&
        !hasNote &&
        !("reviewNote" in st),
      `next=${st.nextStep} key=${st.photoGateMessageKey}`,
      { userId: u.userId, token: u.token, phone: u.phone },
    );
  } catch (e) {
    record("1-rejected", false, String(e));
  }

  try {
    const u = await registerUser("s2");
    await createImageRow(u.userId, {
      detectionStatus: "skipped",
      reviewStatus: "needs_reupload",
      reviewReasonCodes: ["NEEDS_REUPLOAD"],
    });
    const st = await photoStatus(u.token);
    record(
      "2-needs-reupload",
      !st.hasPassingPhoto &&
        st.nextStep === "photo_upload" &&
        st.photoGateMessageKey === "photo_needs_reupload",
      `key=${st.photoGateMessageKey}`,
      { userId: u.userId, token: u.token, phone: u.phone },
    );
  } catch (e) {
    record("2-needs-reupload", false, String(e));
  }

  try {
    const u = await registerUser("s3");
    await createImageRow(u.userId, {
      detectionStatus: "skipped",
      reviewStatus: "pending_review",
    });
    const st = await photoStatus(u.token);
    record(
      "3-pending-review",
      st.hasPassingPhoto && st.hasPhotoUnderReview && st.nextStep !== "photo_upload",
      `next=${st.nextStep}`,
      { userId: u.userId, token: u.token, phone: u.phone },
    );
  } catch (e) {
    record("3-pending-review", false, String(e));
  }

  try {
    const u = await registerUser("s4");
    await createImageRow(u.userId, { detectionStatus: "passed", reviewStatus: "rejected" });
    await createImageRow(u.userId, { detectionStatus: "failed", reviewStatus: "approved" });
    const st = await photoStatus(u.token);
    record(
      "4-mixed",
      st.hasPassingPhoto &&
        st.passingPhotoCount >= 1 &&
        st.photoGateMessageKey == null &&
        st.hasBlockedPhoto,
      `passing=${st.passingPhotoCount}`,
      { userId: u.userId, token: u.token, phone: u.phone },
    );
  } catch (e) {
    record("4-mixed", false, String(e));
  }

  try {
    const u = await registerUser("s5");
    await createImageRow(u.userId, { detectionStatus: "failed", reviewStatus: "approved" });
    const st = await photoStatus(u.token);
    record(
      "5-failed-approved",
      st.hasPassingPhoto && st.nextStep !== "photo_upload",
      `next=${st.nextStep}`,
      { userId: u.userId, token: u.token, phone: u.phone },
    );
  } catch (e) {
    record("5-failed-approved", false, String(e));
  }

  try {
    const u = await registerUser("s6");
    await createImageRow(u.userId, { detectionStatus: "passed", reviewStatus: "rejected" });
    const st = await photoStatus(u.token);
    record(
      "6-passed-rejected",
      !st.hasPassingPhoto && st.nextStep === "photo_upload",
      `next=${st.nextStep}`,
      { userId: u.userId, token: u.token, phone: u.phone },
    );
  } catch (e) {
    record("6-passed-rejected", false, String(e));
  }

  try {
    const u = await registerUser("s7");
    await createImageRow(u.userId, { detectionStatus: "passed", reviewStatus: "rejected" });
    const stBefore = await photoStatus(u.token);
    const up = await uploadImage(u.token, u.userId);
    const stAfter =
      up.status === 200 || up.status === 201 ? await photoStatus(u.token) : stBefore;
    record(
      "7-upload-recalc",
      stBefore.nextStep === "photo_upload" &&
        (stAfter.hasPassingPhoto
          ? ["photo_preference", "photo_preview", "questionnaire"].includes(stAfter.nextStep)
          : stAfter.nextStep === "photo_upload"),
      `upload=${up.status} after=${stAfter.nextStep} passing=${stAfter.hasPassingPhoto}`,
      { userId: u.userId, token: u.token, phone: u.phone },
    );
  } catch (e) {
    record("7-upload-recalc", false, String(e));
  }

  try {
    const u = await registerUser("s8");
    await createImageRow(u.userId, {
      detectionStatus: "passed",
      reviewStatus: "not_required",
      detectionScoreJson: { warnings: ["MULTIPLE_FACES"], primaryFace: { areaRatio: 0.2 } },
    });
    const st = await photoStatus(u.token);
    record(
      "8-multiple-faces",
      st.hasPassingPhoto && st.nextStep !== "photo_upload",
      `next=${st.nextStep}`,
      { userId: u.userId, token: u.token, phone: u.phone },
    );
  } catch (e) {
    record("8-multiple-faces", false, String(e));
  }

  const allPass = results.every((r) => r.pass);
  console.log(JSON.stringify({ allPass, results }, null, 2));
  process.exitCode = allPass ? 0 : 1;
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
