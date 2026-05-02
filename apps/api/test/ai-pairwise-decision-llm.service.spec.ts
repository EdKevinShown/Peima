import type { RelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.types";
import { parseAndValidateRelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.validate";
import { AiPairwiseDecisionConfigService } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.config.service";
import { AiPairwiseDecisionLlmClient } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-llm.client";
import { AiPairwiseDecisionService } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.service";
import {
  buildRrmLitePairwiseDecisionSystemPrompt,
  buildRrmLitePairwiseDecisionUserMessage,
  extractJsonObjectFromText,
  normalizeAiPairwiseDecisionDraftFromShortlist,
  parseAndValidateAiPairwiseDecision,
} from "../src/modules/ai-pairwise-decision";

function shortlistFixture(): RelationshipShortlistTop2 {
  const raw = {
    schemaVersion: 1,
    sourceVersion: "relationship-shortlist-top2-v1",
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    shortlistFingerprint: "fp",
    candidates: [
      {
        candidateUserId: "cand-a",
        staticRank: 1,
        staticCompatibilityScore: 88,
        axisScoresSummary: { trust: 0.7 },
        majorStrengths: ["s1"],
        majorRisks: ["r1"],
        dealbreakerPassed: true,
        visualPoolRank: 1,
        reasonSummary: "r1",
      },
      {
        candidateUserId: "cand-b",
        staticRank: 2,
        staticCompatibilityScore: 70,
        axisScoresSummary: { trust: 0.5 },
        majorStrengths: ["s2"],
        majorRisks: [],
        dealbreakerPassed: true,
        reasonSummary: "r2",
      },
    ],
    generatedAt: "2026-05-01T12:00:00.000Z",
  };
  const v = parseAndValidateRelationshipShortlistTop2(raw);
  if (!v.ok) throw new Error("fixture invalid");
  return v.value;
}

function dims() {
  return {
    conversationFit: 0.7,
    emotionalSafety: 0.75,
    conflictRepair: 0.65,
    progressionFit: 0.72,
    longTermFit: 0.6,
    riskControl: 0.74,
  };
}

function block() {
  return {
    ...dims(),
    strongRisk: false,
    suggestedAction: "maintain" as const,
    progressionWindow: "open" as const,
    reasonSummary: "r",
  };
}

function validDecisionBody(aId: string, bId: string, winner: string, loser: string) {
  const d = dims();
  const b = block();
  return {
    schemaVersion: 1,
    sourceVersion: "rrm-lite-pairwise-decision-v1",
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    candidateAUserId: aId,
    candidateBUserId: bId,
    winnerCandidateId: winner,
    loserCandidateId: loser,
    decisionConfidence: 0.8,
    decisionScoreA: 78,
    decisionScoreB: 65,
    dimensions: { ...d },
    candidateA: { ...b, reasonSummary: "a" },
    candidateB: { ...b, reasonSummary: "b" },
    decisionReason: "test",
    fallbackUsed: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    generatedAt: "2026-05-01T12:01:00.000Z",
  };
}

describe("extractJsonObjectFromText", () => {
  it("parses fenced json", () => {
    const inner = JSON.stringify({ a: 1 });
    const r = extractJsonObjectFromText(`Here:\n\`\`\`json\n${inner}\n\`\`\``);
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.parse(r.jsonText)).toEqual({ a: 1 });
  });

  it("parses leading prose", () => {
    const o = { x: true };
    const r = extractJsonObjectFromText(`note\n${JSON.stringify(o)} tail`);
    expect(r.ok).toBe(true);
  });

  it("returns json_extract_error for invalid content", () => {
    const r = extractJsonObjectFromText("no brace here");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("json_extract_error");
  });
});

describe("AiPairwiseDecisionService", () => {
  const prev: Record<string, string | undefined> = {};

  function saveEnv() {
    const keys = [
      "AI_PAIRWISE_DECISION_ENABLED",
      "AI_PAIRWISE_DECISION_API_KEY",
      "AI_PAIRWISE_DECISION_BASE_URL",
      "AI_PAIRWISE_DECISION_MODEL",
    ];
    for (const k of keys) prev[k] = process.env[k];
  }

  function restoreEnv() {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  beforeEach(() => {
    saveEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  function makeService(llm: { completePairwiseDecisionPrompt: jest.Mock }) {
    const config = new AiPairwiseDecisionConfigService();
    const client = { completePairwiseDecisionPrompt: llm.completePairwiseDecisionPrompt } as unknown as AiPairwiseDecisionLlmClient;
    return new AiPairwiseDecisionService(config, client);
  }

  it("does not call LLM when disabled", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "0";
    const llm = { completePairwiseDecisionPrompt: jest.fn() };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureDetail.code).toBe("disabled");
    expect(llm.completePairwiseDecisionPrompt).not.toHaveBeenCalled();
  });

  it("returns missing_api_key when enabled but key empty", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    delete process.env.AI_PAIRWISE_DECISION_API_KEY;
    const llm = { completePairwiseDecisionPrompt: jest.fn() };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureDetail.code).toBe("missing_api_key");
    expect(llm.completePairwiseDecisionPrompt).not.toHaveBeenCalled();
  });

  it("accepts valid plain JSON from LLM", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const body = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.winnerCandidateId).toBe("cand-a");
      expect(r.rawMeta.fallbackUsed).toBe(false);
      expect(r.rawMeta.provider).toBeTruthy();
    }
  });

  it("accepts fenced JSON from LLM", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const body = validDecisionBody("cand-a", "cand-b", "cand-b", "cand-a");
    const wrapped = "```json\n" + JSON.stringify(body) + "\n```";
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: wrapped }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.winnerCandidateId).toBe("cand-b");
  });

  it("returns json_parse_error when extracted slice is not JSON", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({
        ok: true,
        content: `{ "broken": true, }`,
      }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureDetail.code).toBe("json_parse_error");
  });

  it("fails binding_conflict when A/B ids do not match shortlist order", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const body = validDecisionBody("cand-b", "cand-a", "cand-b", "cand-a");
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.code).toBe("binding_conflict");
      expect(r.failureDetail.path).toBe("candidateAUserId");
    }
  });

  it("returns schema_validation for invalid contract", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"), decisionScoreA: 101 };
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureDetail.code).toBe("schema_validation");
  });

  it("maps http error to structured failure", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const llm = {
      completePairwiseDecisionPrompt: jest
        .fn()
        .mockResolvedValue({ ok: false, kind: "http" as const, status: 401, detail: "{}" }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.code).toBe("llm_http_error");
      expect(r.failureDetail.httpStatus).toBe(401);
    }
  });

  it("maps timeout to structured failure", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: false, kind: "timeout" as const }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureDetail.code).toBe("llm_timeout");
  });

  it("user message payload excludes raw profile / phone fields", () => {
    const s = shortlistFixture();
    const user = buildRrmLitePairwiseDecisionUserMessage(s);
    const o = JSON.parse(user) as Record<string, unknown>;
    expect(o.phone).toBeUndefined();
    expect(o.bio).toBeUndefined();
    expect(o.nickname).toBeUndefined();
    expect(Object.keys(o)).not.toContain("relationProfile");
  });

  it("fills missing viewerUserId from shortlist then passes validation", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const s = shortlistFixture();
    const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b") };
    delete (body as Record<string, unknown>).viewerUserId;
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: s });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.viewerUserId).toBe("viewer-1");
  });

  it("fills missing poolId from shortlist then passes validation", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const s = shortlistFixture();
    const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b") };
    delete (body as Record<string, unknown>).poolId;
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: s });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.poolId).toBe("pool-1");
  });

  it("fills missing candidateAUserId / candidateBUserId from shortlist", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const s = shortlistFixture();
    const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b") };
    delete (body as Record<string, unknown>).candidateAUserId;
    delete (body as Record<string, unknown>).candidateBUserId;
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: s });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.candidateAUserId).toBe("cand-a");
      expect(r.value.candidateBUserId).toBe("cand-b");
    }
  });

  it("fills omitted appliedToFinalScore / appliedToWorkerRanking as false", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const s = shortlistFixture();
    const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b") };
    delete (body as Record<string, unknown>).appliedToFinalScore;
    delete (body as Record<string, unknown>).appliedToWorkerRanking;
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: s });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.appliedToFinalScore).toBe(false);
      expect(r.value.appliedToWorkerRanking).toBe(false);
    }
  });

  it("returns binding_conflict when LLM viewerUserId conflicts with shortlist", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"), viewerUserId: "wrong-viewer" };
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.code).toBe("binding_conflict");
      expect(r.failureDetail.path).toBe("viewerUserId");
      expect(r.failureDetail.expected).toBe("viewer-1");
      expect(r.failureDetail.actual).toBe("wrong-viewer");
    }
  });

  it("returns binding_conflict when LLM candidateAUserId conflicts with shortlist", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"), candidateAUserId: "cand-b" };
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.code).toBe("binding_conflict");
      expect(r.failureDetail.path).toBe("candidateAUserId");
    }
  });

  it("returns schema_validation when winnerCandidateId is not A or B", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const body = {
      ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
      winnerCandidateId: "cand-x",
      loserCandidateId: "cand-b",
    };
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.code).toBe("schema_validation");
      expect(r.failureDetail.path).toBe("winnerCandidateId");
    }
  });

  it("returns schema_validation when winnerCandidateId is missing", async () => {
    process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
    process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
    const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b") };
    delete (body as Record<string, unknown>).winnerCandidateId;
    const llm = {
      completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
    };
    const svc = makeService(llm);
    const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.code).toBe("schema_validation");
      expect(r.failureDetail.path).toBe("winnerCandidateId");
    }
  });

  describe("M3.8-M15B metadata literal tolerance", () => {
    it('normalizes schemaVersion "1.0" to 1 and passes validation', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"), schemaVersion: "1.0" };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.schemaVersion).toBe(1);
    });

    it('normalizes schemaVersion "1" to numeric 1', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"), schemaVersion: "1" };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.schemaVersion).toBe(1);
    });

    it("accepts schemaVersion 1.0 as JSON number 1", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"), schemaVersion: 1.0 };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.schemaVersion).toBe(1);
    });

    it('returns metadata_conflict for schemaVersion "2"', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"), schemaVersion: "2" };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("metadata_conflict");
        expect(r.failureDetail.path).toBe("schemaVersion");
      }
    });

    it('returns metadata_conflict for schemaVersion "v1"', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"), schemaVersion: "v1" };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("metadata_conflict");
        expect(r.failureDetail.path).toBe("schemaVersion");
      }
    });

    it('normalizes appliedToFinalScore string "false" to boolean false', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        appliedToFinalScore: "false" as unknown as boolean,
        appliedToWorkerRanking: false,
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.appliedToFinalScore).toBe(false);
    });

    it('returns metadata_conflict for appliedToFinalScore string "true"', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        appliedToFinalScore: "true" as unknown as boolean,
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("metadata_conflict");
        expect(r.failureDetail.path).toBe("appliedToFinalScore");
      }
    });

    it("fills missing sourceVersion with the frozen literal", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b") };
      delete (body as Record<string, unknown>).sourceVersion;
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.sourceVersion).toBe("rrm-lite-pairwise-decision-v1");
    });

    it("still returns schema_validation when winnerCandidateId is missing", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        schemaVersion: "1.0",
      };
      delete (body as Record<string, unknown>).winnerCandidateId;
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("winnerCandidateId");
      }
    });

    it("still returns schema_validation when decisionScoreA is out of range", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        schemaVersion: "1.0",
        decisionScoreA: 101,
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("decisionScoreA");
      }
    });
  });

  describe("M3.8-M15C sourceVersion system override", () => {
    it("succeeds when LLM already sends canonical sourceVersion", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.sourceVersion).toBe("rrm-lite-pairwise-decision-v1");
    });

    it('overwrites sourceVersion "1.0.0" to the frozen literal and succeeds', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"), sourceVersion: "1.0.0" };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.sourceVersion).toBe("rrm-lite-pairwise-decision-v1");
    });

    it("overwrites bogus sourceVersion string and succeeds", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = { ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"), sourceVersion: "wrong-version" };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.sourceVersion).toBe("rrm-lite-pairwise-decision-v1");
    });

    it("overwrites non-string sourceVersion with the frozen literal", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        sourceVersion: 12345 as unknown as string,
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.sourceVersion).toBe("rrm-lite-pairwise-decision-v1");
    });

    it("still returns binding_conflict when candidateAUserId conflicts (M15C does not relax bindings)", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        sourceVersion: "1.0.0",
        candidateAUserId: "cand-b",
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("binding_conflict");
        expect(r.failureDetail.path).toBe("candidateAUserId");
      }
    });

    it("still returns binding_conflict when viewerUserId conflicts", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        sourceVersion: "wrong",
        viewerUserId: "not-viewer-1",
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("binding_conflict");
        expect(r.failureDetail.path).toBe("viewerUserId");
      }
    });

    it("still returns schema_validation when winnerCandidateId is not A or B", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        sourceVersion: "1.0.0",
        winnerCandidateId: "cand-x",
        loserCandidateId: "cand-b",
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("winnerCandidateId");
      }
    });

    it('still returns metadata_conflict for appliedToFinalScore "true"', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        sourceVersion: "noise",
        appliedToFinalScore: "true" as unknown as boolean,
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("metadata_conflict");
        expect(r.failureDetail.path).toBe("appliedToFinalScore");
      }
    });

    it('still returns metadata_conflict for schemaVersion "2"', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const body = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        sourceVersion: "anything",
        schemaVersion: "2",
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("metadata_conflict");
        expect(r.failureDetail.path).toBe("schemaVersion");
      }
    });
  });

  describe("M3.8-M15D dimensions scalar hardening (extractUnitScalar)", () => {
    it("extracts dimensions.conversationFit from { score: 0.7 }", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        dimensions: { ...base.dimensions, conversationFit: { score: 0.7 } },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.dimensions.conversationFit).toBe(0.7);
    });

    it("extracts dimensions.conversationFit from { value: 0.7 }", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        dimensions: { ...base.dimensions, conversationFit: { value: 0.7 } },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.dimensions.conversationFit).toBe(0.7);
    });

    it("extracts dimensions.conversationFit from { rating: 0.7 }", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        dimensions: { ...base.dimensions, conversationFit: { rating: 0.7 } },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.dimensions.conversationFit).toBe(0.7);
    });

    it("does not scale dimensions.conversationFit { score: 70 } to 0.7", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        dimensions: { ...base.dimensions, conversationFit: { score: 70 } },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("dimensions.conversationFit");
      }
    });

    it("does not extract from { reason: string } only", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        dimensions: { ...base.dimensions, conversationFit: { reason: "too chatty" } },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failureDetail.code).toBe("schema_validation");
    });

    it('does not parse dimensions.conversationFit string "0.7"', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        dimensions: { ...base.dimensions, conversationFit: "0.7" },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("dimensions.conversationFit");
      }
    });

    it("does not unwrap decisionScoreA object", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = { ...base, decisionScoreA: { score: 80 } as unknown as number };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("decisionScoreA");
      }
    });

    it("still fails when decisionConfidence object has no extractable 0-1 number (M15H does not invent)", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = { ...base, decisionConfidence: { foo: 0.8 } as unknown as number };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("decisionConfidence");
      }
    });

    it("still fails when winnerCandidateId is invalid after dimension unwrap", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        dimensions: { ...base.dimensions, conversationFit: { score: 0.7 } },
        winnerCandidateId: "cand-x",
        loserCandidateId: "cand-b",
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("winnerCandidateId");
      }
    });

    it("prefers score over value when both are valid numbers", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        dimensions: { ...base.dimensions, conversationFit: { score: 0.2, value: 0.9 } },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.dimensions.conversationFit).toBe(0.2);
    });

    it("normalize + parseAndValidateAiPairwiseDecision accepts extracted dimensions", () => {
      const s = shortlistFixture();
      const raw = {
        ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
        dimensions: {
          ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b").dimensions,
          conversationFit: { score: 0.66 },
        },
      };
      const n = normalizeAiPairwiseDecisionDraftFromShortlist(raw, s);
      expect(n.ok).toBe(true);
      if (!n.ok) return;
      const v = parseAndValidateAiPairwiseDecision(n.draft);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value.dimensions.conversationFit).toBe(0.66);
    });
  });

  describe("M3.8-M15E strongRisk boolean hardening", () => {
    it('normalizes candidateA.strongRisk string "false" to boolean false', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, strongRisk: "false" as unknown as boolean },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateA.strongRisk).toBe(false);
    });

    it('normalizes candidateA.strongRisk string "true" to boolean true', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, strongRisk: "true" as unknown as boolean },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateA.strongRisk).toBe(true);
    });

    it('normalizes candidateB.strongRisk string " FALSE " to boolean false', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateB: { ...base.candidateB, strongRisk: " FALSE " as unknown as boolean },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateB.strongRisk).toBe(false);
    });

    it("normalizes candidateA.strongRisk from { value: false }", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, strongRisk: { value: false } as unknown as boolean },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateA.strongRisk).toBe(false);
    });

    it('normalizes candidateA.strongRisk from { value: "true" }', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, strongRisk: { value: "true" } as unknown as boolean },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateA.strongRisk).toBe(true);
    });

    it("does not add missing candidateA.strongRisk", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA },
        candidateB: { ...base.candidateB },
      };
      delete (body.candidateA as Record<string, unknown>).strongRisk;
      delete (body.candidateB as Record<string, unknown>).strongRisk;
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.strongRisk");
      }
    });

    it('does not normalize candidateA.strongRisk string "low"', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, strongRisk: "low" as unknown as boolean },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.strongRisk");
      }
    });

    it("does not normalize candidateA.strongRisk numeric 0", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, strongRisk: 0 as unknown as boolean },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.strongRisk");
      }
    });

    it("still fails when winnerCandidateId is invalid after strongRisk normalization", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, strongRisk: "false" as unknown as boolean },
        winnerCandidateId: "cand-x",
        loserCandidateId: "cand-b",
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("winnerCandidateId");
      }
    });

    it("still fails when decisionScoreA is out of range", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, strongRisk: "false" as unknown as boolean },
        decisionScoreA: 101,
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("decisionScoreA");
      }
    });
  });

  describe("M3.8-M15F candidate block nested scalar mapping", () => {
    it("hoists candidateA.conversationFit from candidateA.scores.conversationFit number", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.conversationFit;
      ca.scores = { conversationFit: 0.7 };
      const body = { ...base, candidateA: ca as (typeof base)["candidateA"] };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateA.conversationFit).toBe(0.7);
    });

    it("hoists candidateA.conversationFit from candidateA.dimensions.conversationFit object", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.conversationFit;
      ca.dimensions = { conversationFit: { score: 0.7 } };
      const body = { ...base, candidateA: ca as (typeof base)["candidateA"] };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateA.conversationFit).toBe(0.7);
    });

    it("hoists candidateB.progressionFit from candidateB.metrics.progressionFit object", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const cb = { ...base.candidateB } as Record<string, unknown>;
      delete cb.progressionFit;
      cb.metrics = { progressionFit: { value: 0.6 } };
      const body = { ...base, candidateB: cb as (typeof base)["candidateB"] };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateB.progressionFit).toBe(0.6);
    });

    it("still fails when candidateA.conversationFit missing and no nested scalar", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.conversationFit;
      const body = { ...base, candidateA: ca as (typeof base)["candidateA"] };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.conversationFit");
      }
    });

    it("does not copy root dimensions.conversationFit onto candidateA", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.conversationFit;
      const body = {
        ...base,
        dimensions: { ...base.dimensions, conversationFit: 0.7 },
        candidateA: ca as (typeof base)["candidateA"],
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.conversationFit");
      }
    });

    it('does not accept candidateA.conversationFit string "0.7"', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, conversationFit: "0.7" as unknown as number },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.conversationFit");
      }
    });

    it("does not accept candidateA.conversationFit 70 as 0–1", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, conversationFit: 70 },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.conversationFit");
      }
    });

    it("still fails when decisionScoreA is an object", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        decisionScoreA: { score: 80 } as unknown as number,
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("decisionScoreA");
      }
    });

    it("still fails when winnerCandidateId is invalid with nested candidate dims", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.conversationFit;
      ca.scores = { conversationFit: 0.72 };
      const body = {
        ...base,
        candidateA: ca as (typeof base)["candidateA"],
        winnerCandidateId: "cand-x",
        loserCandidateId: "cand-b",
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("winnerCandidateId");
      }
    });

    it("normalize + parseAndValidateAiPairwiseDecision accepts nested-hoisted candidate dims", () => {
      const s = shortlistFixture();
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.conversationFit;
      ca.ratings = { conversationFit: { rating: 0.55 } };
      const raw = {
        ...base,
        candidateA: ca,
      };
      const n = normalizeAiPairwiseDecisionDraftFromShortlist(raw, s);
      expect(n.ok).toBe(true);
      if (!n.ok) return;
      const v = parseAndValidateAiPairwiseDecision(n.draft);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value.candidateA.conversationFit).toBe(0.55);
    });
  });

  describe("M3.8-M15G candidate block nested enum mapping", () => {
    it("hoists candidateA.suggestedAction from candidateA.action.value", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.suggestedAction;
      ca.action = { value: "slow_down" };
      const body = { ...base, candidateA: ca as (typeof base)["candidateA"] };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateA.suggestedAction).toBe("slow_down");
    });

    it("hoists candidateA.suggestedAction from candidateA.recommendation.suggestedAction", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.suggestedAction;
      ca.recommendation = { suggestedAction: "maintain" };
      const body = { ...base, candidateA: ca as (typeof base)["candidateA"] };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateA.suggestedAction).toBe("maintain");
    });

    it("hoists candidateB.suggestedAction from candidateB.guidance.value", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const cb = { ...base.candidateB } as Record<string, unknown>;
      delete cb.suggestedAction;
      cb.guidance = { value: "stop_or_step_back" };
      const body = { ...base, candidateB: cb as (typeof base)["candidateB"] };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateB.suggestedAction).toBe("stop_or_step_back");
    });

    it("still fails when candidateA.suggestedAction missing and no nested literal", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.suggestedAction;
      const body = { ...base, candidateA: ca as (typeof base)["candidateA"] };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.suggestedAction");
      }
    });

    it('does not accept candidateA.suggestedAction "slow"', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, suggestedAction: "slow" as unknown as "maintain" },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.suggestedAction");
      }
    });

    it("does not accept candidateA.suggestedAction Chinese label", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, suggestedAction: "放慢" as unknown as "maintain" },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.suggestedAction");
      }
    });

    it("does not copy draft root suggestedAction onto candidateA", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.suggestedAction;
      const body = {
        ...base,
        suggestedAction: "maintain",
        candidateA: ca as (typeof base)["candidateA"],
      } as Record<string, unknown>;
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.suggestedAction");
      }
    });

    it("hoists candidateA.progressionWindow from candidateA.window.value", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.progressionWindow;
      ca.window = { value: "weak_open" };
      const body = { ...base, candidateA: ca as (typeof base)["candidateA"] };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.candidateA.progressionWindow).toBe("weak_open");
    });

    it("still fails for invalid candidateA.progressionWindow natural language", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        candidateA: { ...base.candidateA, progressionWindow: "稍后再说" as unknown as "open" },
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("candidateA.progressionWindow");
      }
    });

    it("still fails when winnerCandidateId is invalid after enum hoisting", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const ca = { ...base.candidateA } as Record<string, unknown>;
      delete ca.suggestedAction;
      ca.action = { value: "maintain" };
      const body = {
        ...base,
        candidateA: ca as (typeof base)["candidateA"],
        winnerCandidateId: "cand-x",
        loserCandidateId: "cand-b",
      };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("winnerCandidateId");
      }
    });
  });

  describe("M3.8-M15H decisionConfidence scalar mapping", () => {
    it("normalizes decisionConfidence from { score: 0.7 }", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = { ...base, decisionConfidence: { score: 0.7 } as unknown as number };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.decisionConfidence).toBe(0.7);
    });

    it("normalizes decisionConfidence from { value: 0.7 }", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = { ...base, decisionConfidence: { value: 0.7 } as unknown as number };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.decisionConfidence).toBe(0.7);
    });

    it("hoists decisionConfidence from top-level confidence when missing", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = { ...base, confidence: 0.7 } as Record<string, unknown>;
      delete body.decisionConfidence;
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.decisionConfidence).toBe(0.7);
    });

    it("hoists decisionConfidence from decision.confidence when missing", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        decision: { confidence: 0.7 },
      } as Record<string, unknown>;
      delete body.decisionConfidence;
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.decisionConfidence).toBe(0.7);
    });

    it("hoists decisionConfidence from pairwiseDecision.confidence object", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        pairwiseDecision: { confidence: { score: 0.7 } },
      } as Record<string, unknown>;
      delete body.decisionConfidence;
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.decisionConfidence).toBe(0.7);
    });

    it("still fails when decisionConfidence missing and no hoist sources", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = { ...base } as Record<string, unknown>;
      delete body.decisionConfidence;
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("decisionConfidence");
      }
    });

    it('does not accept decisionConfidence string "0.7"', async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = { ...base, decisionConfidence: "0.7" as unknown as number };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("decisionConfidence");
      }
    });

    it("does not accept decisionConfidence 70 as unit scalar", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = { ...base, decisionConfidence: 70 };
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("decisionConfidence");
      }
    });

    it("does not derive decisionConfidence from decisionScoreA/B alone", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        decisionScoreA: 90,
        decisionScoreB: 10,
      } as Record<string, unknown>;
      delete body.decisionConfidence;
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("decisionConfidence");
      }
    });

    it("still fails when winnerCandidateId is invalid after decisionConfidence hoist", async () => {
      process.env.AI_PAIRWISE_DECISION_ENABLED = "1";
      process.env.AI_PAIRWISE_DECISION_API_KEY = "k";
      const base = validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b");
      const body = {
        ...base,
        confidence: 0.82,
        winnerCandidateId: "cand-x",
        loserCandidateId: "cand-b",
      } as Record<string, unknown>;
      delete body.decisionConfidence;
      const llm = {
        completePairwiseDecisionPrompt: jest.fn().mockResolvedValue({ ok: true, content: JSON.stringify(body) }),
      };
      const svc = makeService(llm);
      const r = await svc.generateAiPairwiseDecision({ shortlist: shortlistFixture() });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failureDetail.code).toBe("schema_validation");
        expect(r.failureDetail.path).toBe("winnerCandidateId");
      }
    });
  });
});

describe("M3.8-M15A normalize + parseAndValidateAiPairwiseDecision", () => {
  it("produces a valid AiPairwiseDecision after normalization", () => {
    const s = shortlistFixture();
    const raw = {
      ...validDecisionBody("cand-a", "cand-b", "cand-a", "cand-b"),
    };
    delete (raw as Record<string, unknown>).viewerUserId;
    delete (raw as Record<string, unknown>).poolId;
    delete (raw as Record<string, unknown>).schemaVersion;
    delete (raw as Record<string, unknown>).sourceVersion;
    delete (raw as Record<string, unknown>).candidateAUserId;
    delete (raw as Record<string, unknown>).candidateBUserId;
    delete (raw as Record<string, unknown>).appliedToFinalScore;
    delete (raw as Record<string, unknown>).appliedToWorkerRanking;
    delete (raw as Record<string, unknown>).generatedAt;
    const n = normalizeAiPairwiseDecisionDraftFromShortlist(raw, s);
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    const v = parseAndValidateAiPairwiseDecision(n.draft);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.viewerUserId).toBe(s.viewerUserId);
      expect(v.value.poolId).toBe(s.poolId);
    }
  });
});

describe("buildRrmLitePairwiseDecisionSystemPrompt (M15A)", () => {
  it("requires JSON-only output and forbids markdown / transcript", () => {
    const sys = buildRrmLitePairwiseDecisionSystemPrompt();
    const lower = sys.toLowerCase();
    expect(sys).toMatch(/JSON object only/i);
    expect(lower).toContain("no markdown");
    expect(lower).toContain("transcript");
  });
});
