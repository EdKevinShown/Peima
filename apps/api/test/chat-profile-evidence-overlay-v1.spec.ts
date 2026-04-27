import {
  QUESTIONS,
  isQuestionProductionReady,
} from "../src/modules/questionnaire/data/questions";
import { parseTag } from "../src/modules/questionnaire/questionnaire.scorer";
import {
  clampEvidenceWeight,
  freshnessFromMinutesSinceLastActivity,
  sessionQualityFromMessageCount,
} from "../src/modules/profile-suggestion/chat-profile-evidence-v1.weights";
import {
  recalcEffectiveProfileChatOverlayV1,
  type ChatProfileEvidenceRowInput,
} from "../src/modules/profile-suggestion/chat-profile-effective-overlay-v1.recalc";

function buildGreedyCanonicalAnswers(
  targets: Record<number, string>,
): { questionKey: string; answerValue: string }[] {
  const answers: { questionKey: string; answerValue: string }[] = [];
  for (const q of QUESTIONS) {
    if (!isQuestionProductionReady(q.key)) continue;
    let bestScore = -Infinity;
    let bestVal = q.options[0]!.value;
    for (const opt of q.options) {
      let score = 0;
      for (const tag of opt.tags) {
        const p = parseTag(tag);
        if (!p) continue;
        const want = targets[p.axisId];
        if (want === undefined) continue;
        if (p.band === want) score += 10;
        else score -= 50;
      }
      if (score > bestScore) {
        bestScore = score;
        bestVal = opt.value;
      }
    }
    answers.push({ questionKey: q.key, answerValue: bestVal });
  }
  return answers;
}

function iso(ms: number) {
  return new Date(ms);
}

describe("chat-profile-evidence-v1 weights", () => {
  it("maps message counts to session quality buckets", () => {
    expect(sessionQualityFromMessageCount(0).weight).toBe(0.55);
    expect(sessionQualityFromMessageCount(2).bucket).toBe("very_short_probe");
    expect(sessionQualityFromMessageCount(5).weight).toBe(0.85);
    expect(sessionQualityFromMessageCount(15).weight).toBe(1.0);
    expect(sessionQualityFromMessageCount(30).weight).toBe(1.1);
  });

  it("maps freshness minutes to buckets", () => {
    expect(freshnessFromMinutesSinceLastActivity(0).weight).toBe(1.0);
    expect(freshnessFromMinutesSinceLastActivity(15).weight).toBe(0.9);
    expect(freshnessFromMinutesSinceLastActivity(45).weight).toBe(0.75);
    expect(freshnessFromMinutesSinceLastActivity(120).weight).toBe(0.6);
    expect(freshnessFromMinutesSinceLastActivity(1500).weight).toBe(0.3);
  });

  it("clamps evidenceWeight to [0, 1.15]", () => {
    expect(clampEvidenceWeight(1.1, 1.0)).toBe(1.1);
    expect(clampEvidenceWeight(2, 2)).toBe(1.15);
    expect(clampEvidenceWeight(0.5, 0.5)).toBe(0.25);
  });
});

describe("recalcEffectiveProfileChatOverlayV1", () => {
  const targets: Record<number, string> = {};
  for (let a = 1; a <= 20; a += 1) targets[a] = "A";
  const answers = buildGreedyCanonicalAnswers(targets);

  function ev(
    partial: Omit<ChatProfileEvidenceRowInput, "acceptedAt"> & {
      acceptedAt?: Date;
    },
  ): ChatProfileEvidenceRowInput {
    return {
      acceptedAt: partial.acceptedAt ?? iso(1_700_000_000_000),
      conversationId: partial.conversationId,
      axisId: partial.axisId,
      branch: partial.branch,
      evidenceWeight: partial.evidenceWeight,
    };
  }

  it("axis with no chat evidence stays baseline_only", () => {
    const out = recalcEffectiveProfileChatOverlayV1({
      answers,
      evidences: [],
      computedAt: new Date(),
    });
    expect(out.axes["1"].state).toBe("baseline_only");
    expect(out.axes["1"].finalEffectiveBranch).toBe(
      out.axes["1"].questionnaireBaselineBranch,
    );
  });

  it("questionnaire baseline B and no chat evidence: baseline_only on first axis with dominant B", () => {
    const targetsB: Record<number, string> = {};
    for (let a = 1; a <= 20; a += 1) targetsB[a] = "B";
    const answersB = buildGreedyCanonicalAnswers(targetsB);
    const out = recalcEffectiveProfileChatOverlayV1({
      answers: answersB,
      evidences: [],
      computedAt: new Date(),
    });
    let axisWithB: number | null = null;
    for (let a = 1; a <= 20; a += 1) {
      if (out.axes[String(a)].questionnaireBaselineBranch === "B") {
        axisWithB = a;
        break;
      }
    }
    expect(axisWithB).not.toBeNull();
    const ax = out.axes[String(axisWithB!)];
    expect(ax.state).toBe("baseline_only");
    expect(ax.finalEffectiveBranch).toBe("B");
  });

  it("questionnaire baseline B: 1 / 2 / 3 independent B evidences → observing, leaning, stable (reinforced)", () => {
    const targetsB: Record<number, string> = {};
    for (let a = 1; a <= 20; a += 1) targetsB[a] = "B";
    const answersB = buildGreedyCanonicalAnswers(targetsB);
    const base = recalcEffectiveProfileChatOverlayV1({
      answers: answersB,
      evidences: [],
      computedAt: new Date(),
    });
    let axisId = 1;
    for (let a = 1; a <= 20; a += 1) {
      if (base.axes[String(a)].questionnaireBaselineBranch === "B") {
        axisId = a;
        break;
      }
    }
    expect(base.axes[String(axisId)].questionnaireBaselineBranch).toBe("B");
    const w = 0.9;
    const mk = (conv: string) =>
      ev({
        conversationId: conv,
        axisId,
        branch: "B",
        evidenceWeight: w,
      });
    const o1 = recalcEffectiveProfileChatOverlayV1({
      answers: answersB,
      evidences: [mk("c1")],
      computedAt: new Date(),
    });
    expect(o1.axes[String(axisId)].state).toBe("observing");
    expect(o1.axes[String(axisId)].finalEffectiveBranch).toBe("B");
    const o2 = recalcEffectiveProfileChatOverlayV1({
      answers: answersB,
      evidences: [mk("c1"), mk("c2")],
      computedAt: new Date(),
    });
    expect(o2.axes[String(axisId)].state).toBe("leaning");
    expect(o2.axes[String(axisId)].finalEffectiveBranch).toBe("B");
    const o3 = recalcEffectiveProfileChatOverlayV1({
      answers: answersB,
      evidences: [mk("c1"), mk("c2"), mk("c3")],
      computedAt: new Date(),
    });
    expect(o3.axes[String(axisId)].state).toBe("stable");
    expect(o3.axes[String(axisId)].finalEffectiveBranch).toBe("B");
  });

  it("questionnaire baseline B: 3 opposing sessions with coverage gates → stable toward leading branch", () => {
    const targetsB: Record<number, string> = {};
    for (let a = 1; a <= 20; a += 1) targetsB[a] = "B";
    const answersB = buildGreedyCanonicalAnswers(targetsB);
    const base = recalcEffectiveProfileChatOverlayV1({
      answers: answersB,
      evidences: [],
      computedAt: new Date(),
    });
    let axisId = 1;
    for (let a = 1; a <= 20; a += 1) {
      if (base.axes[String(a)].questionnaireBaselineBranch === "B") {
        axisId = a;
        break;
      }
    }
    expect(base.axes[String(axisId)].questionnaireBaselineBranch).toBe("B");
    const oppose =
      ["A", "C", "D", "E"].find((x) => x !== "B") ?? "A";
    const w = 0.9;
    const out = recalcEffectiveProfileChatOverlayV1({
      answers: answersB,
      evidences: [
        ev({
          conversationId: "c1",
          axisId,
          branch: oppose,
          evidenceWeight: w,
        }),
        ev({
          conversationId: "c2",
          axisId,
          branch: oppose,
          evidenceWeight: w,
        }),
        ev({
          conversationId: "c3",
          axisId,
          branch: oppose,
          evidenceWeight: w,
        }),
      ],
      computedAt: new Date(),
    });
    const ax = out.axes[String(axisId)];
    expect(ax.state).toBe("stable");
    expect(ax.finalEffectiveBranch).toBe(oppose);
    expect(ax.questionnaireBaselineBranch).toBe("B");
  });

  it("dedupes by conversationId+axisId using latest accept for per-session direction", () => {
    const t0 = 1_700_000_000_000;
    const evidences: ChatProfileEvidenceRowInput[] = [
      ev({
        conversationId: "c1",
        axisId: 1,
        branch: "B",
        evidenceWeight: 0.5,
        acceptedAt: iso(t0),
      }),
      ev({
        conversationId: "c1",
        axisId: 1,
        branch: "A",
        evidenceWeight: 0.9,
        acceptedAt: iso(t0 + 60_000),
      }),
    ];
    const out = recalcEffectiveProfileChatOverlayV1({
      answers,
      evidences,
      computedAt: new Date(),
    });
    const a1 = out.axes["1"];
    expect(a1.independentConversationCount).toBe(1);
    expect(a1.state).toBe("observing");
  });

  it("1 / 2 / 3 independent sessions on axis with questionnaire (chat aligns with questionnaire dominant)", () => {
    const baseOnly = recalcEffectiveProfileChatOverlayV1({
      answers,
      evidences: [],
      computedAt: new Date(),
    });
    let axisId = 1;
    let b1: string | null = null;
    for (let a = 1; a <= 20; a += 1) {
      const b = baseOnly.axes[String(a)].questionnaireBaselineBranch;
      if (b) {
        axisId = a;
        b1 = b;
        break;
      }
    }
    expect(b1).not.toBeNull();
    const w = 0.9;
    const e1 = recalcEffectiveProfileChatOverlayV1({
      answers,
      evidences: [
        ev({
          conversationId: "c1",
          axisId,
          branch: b1!,
          evidenceWeight: w,
        }),
      ],
      computedAt: new Date(),
    });
    expect(e1.axes[String(axisId)].state).toBe("observing");

    const e2 = recalcEffectiveProfileChatOverlayV1({
      answers,
      evidences: [
        ev({
          conversationId: "c1",
          axisId,
          branch: b1!,
          evidenceWeight: w,
        }),
        ev({
          conversationId: "c2",
          axisId,
          branch: b1!,
          evidenceWeight: w,
        }),
      ],
      computedAt: new Date(),
    });
    expect(e2.axes[String(axisId)].state).toBe("leaning");

    const e3 = recalcEffectiveProfileChatOverlayV1({
      answers,
      evidences: [
        ev({
          conversationId: "c1",
          axisId,
          branch: b1!,
          evidenceWeight: w,
        }),
        ev({
          conversationId: "c2",
          axisId,
          branch: b1!,
          evidenceWeight: w,
        }),
        ev({
          conversationId: "c3",
          axisId,
          branch: b1!,
          evidenceWeight: w,
        }),
      ],
      computedAt: new Date(),
    });
    expect(e3.axes[String(axisId)].state).toBe("stable");
    expect(e3.axes[String(axisId)].finalEffectiveBranch).toBe(b1);
  });

  it("questionnaire baseline B: 3 opposing sessions without coverage share → leaning at baseline", () => {
    const targetsB: Record<number, string> = {};
    for (let a = 1; a <= 20; a += 1) targetsB[a] = "B";
    const answersB = buildGreedyCanonicalAnswers(targetsB);
    const base = recalcEffectiveProfileChatOverlayV1({
      answers: answersB,
      evidences: [],
      computedAt: new Date(),
    });
    let axisId = 1;
    for (let a = 1; a <= 20; a += 1) {
      if (base.axes[String(a)].questionnaireBaselineBranch === "B") {
        axisId = a;
        break;
      }
    }
    const oppose =
      ["A", "C", "D", "E"].find((x) => x !== "B") ?? "A";
    const t0 = 1_700_000_000_000;
    const out = recalcEffectiveProfileChatOverlayV1({
      answers: answersB,
      evidences: [
        ev({
          conversationId: "c1",
          axisId,
          branch: "B",
          evidenceWeight: 7,
          acceptedAt: iso(t0),
        }),
        ev({
          conversationId: "c1",
          axisId,
          branch: oppose,
          evidenceWeight: 10,
          acceptedAt: iso(t0 + 1),
        }),
        ev({
          conversationId: "c2",
          axisId,
          branch: oppose,
          evidenceWeight: 1,
          acceptedAt: iso(t0 + 2),
        }),
        ev({
          conversationId: "c3",
          axisId,
          branch: oppose,
          evidenceWeight: 1,
          acceptedAt: iso(t0 + 3),
        }),
      ],
      computedAt: new Date(),
    });
    const ax = out.axes[String(axisId)];
    expect(ax.state).toBe("leaning");
    expect(ax.finalEffectiveBranch).toBe("B");
    expect(ax.leadingBranch).toBe(oppose);
  });

  it("mixed_conflict keeps questionnaire baseline when present", () => {
    const w = 0.85;
    const out = recalcEffectiveProfileChatOverlayV1({
      answers,
      evidences: [
        ev({
          conversationId: "c1",
          axisId: 2,
          branch: "A",
          evidenceWeight: w,
        }),
        ev({
          conversationId: "c2",
          axisId: 2,
          branch: "B",
          evidenceWeight: w,
        }),
      ],
      computedAt: new Date(),
    });
    const a2 = out.axes["2"];
    expect(a2.state).toBe("mixed_conflict");
    expect(a2.questionnaireBaselineBranch).toBe("A");
    expect(a2.finalEffectiveBranch).toBe("A");
  });

  it("no questionnaire baseline: 2 aligned sessions -> leaning with final branch", () => {
    const emptyAnswers: { questionKey: string; answerValue: string }[] = [];
    const w = 1.0;
    const out = recalcEffectiveProfileChatOverlayV1({
      answers: emptyAnswers,
      evidences: [
        ev({
          conversationId: "c1",
          axisId: 3,
          branch: "C",
          evidenceWeight: w,
        }),
        ev({
          conversationId: "c2",
          axisId: 3,
          branch: "C",
          evidenceWeight: w,
        }),
      ],
      computedAt: new Date(),
    });
    const a3 = out.axes["3"];
    expect(a3.questionnaireBaselineBranch).toBeNull();
    expect(a3.state).toBe("leaning");
    expect(a3.finalEffectiveBranch).toBe("C");
  });
});
