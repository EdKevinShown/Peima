/**
 * questionnaire.scorer 受控回归（G-q25 / draft 闸门 / q01–q12+q14–q15+q25 canonical=15 与 q06 的 5D·5E）。
 * 运行：pnpm --filter @peima/api run test:e2e -- questionnaire.scorer.regression
 * （无需 DATABASE_URL；不启动 Nest 应用。）
 */
import * as questions from "../src/modules/questionnaire/data/questions";
import { scoreQuestionnaireG1r } from "../src/modules/questionnaire/questionnaire.scorer";

function withMockedProductionReady(
  keys: readonly string[],
  fn: () => void,
): void {
  const keySet = new Set(keys);
  const origReady = questions.isQuestionProductionReady;
  const spy = jest
    .spyOn(questions, "isQuestionProductionReady")
    .mockImplementation((key: string) => {
      if (keySet.has(key)) return true;
      return origReady(key);
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
}

function expectAllNullExcept(
  out: ReturnType<typeof scoreQuestionnaireG1r>,
  expected: Partial<Record<keyof ReturnType<typeof scoreQuestionnaireG1r>, number | null>>,
) {
  const keys = [
    "attachmentStyle",
    "emotionalExpression",
    "communicationStyle",
    "conflictHandling",
    "loveLanguage",
    "securityNeed",
    "controlNeed",
    "independence",
    "loyaltyView",
    "jealousyTendency",
    "moneyAttitude",
    "careerPriority",
    "lifePace",
    "socialNeed",
    "emotionalStability",
    "sexualValues",
    "familyView",
    "marriageExpectation",
    "childrenIntent",
    "riskPreference",
  ] as const;

  for (const k of keys) {
    const want = Object.prototype.hasOwnProperty.call(expected, k)
      ? expected[k]
      : null;
    const got = out[k];
    if (want === null || want === undefined) {
      expect(got).toBeNull();
    } else {
      expect(got).not.toBeNull();
      expect(got!).toBeCloseTo(want as number, 6);
    }
  }
}

describe("questionnaire.scorer regression (G-q25 / draft / q06-5E)", () => {
  /** G-q25-only：仅 q25=A，与 questions.ts 当前 q25 选项 A tags 对齐 */
  it("G-q25-only", () => {
    const out = scoreQuestionnaireG1r([
      { questionKey: "q25", answerValue: "A" },
    ]);

    expect(out.confidence).toBe(1 / 15);
    expectAllNullExcept(out, {
      emotionalExpression: 1,
      communicationStyle: 1,
      conflictHandling: 1,
      jealousyTendency: 1,
    });
  });

  /** G-draft-only-q01to12：q13 与 q16+ 仍为 draft；本用例仅答 canonical 的 q01+q06 */
  it("G-draft-only-q01to12", () => {
    const out = scoreQuestionnaireG1r([
      { questionKey: "q01", answerValue: "A" },
      { questionKey: "q06", answerValue: "A" },
    ]);

    expect(out.confidence).toBe(2 / 15);
    expectAllNullExcept(out, {
      attachmentStyle: 0.25,
      emotionalExpression: 0.5,
      communicationStyle: 0.5,
      conflictHandling: 0,
      loveLanguage: 0.625,
      securityNeed: 1,
      independence: 0,
    });
  });

  /** G-draft-plus-q25：q01 与 q25 一并参与聚合（confidence 分母=15） */
  it("G-draft-plus-q25", () => {
    const only25 = scoreQuestionnaireG1r([
      { questionKey: "q25", answerValue: "A" },
    ]);
    const mixed = scoreQuestionnaireG1r([
      { questionKey: "q01", answerValue: "A" },
      { questionKey: "q25", answerValue: "A" },
    ]);

    expect(only25).toEqual({
      attachmentStyle: null,
      emotionalExpression: 1,
      communicationStyle: 1,
      conflictHandling: 1,
      loveLanguage: null,
      securityNeed: null,
      controlNeed: null,
      independence: null,
      loyaltyView: null,
      jealousyTendency: 1,
      moneyAttitude: null,
      careerPriority: null,
      lifePace: null,
      socialNeed: null,
      emotionalStability: null,
      sexualValues: null,
      familyView: null,
      marriageExpectation: null,
      childrenIntent: null,
      riskPreference: null,
      confidence: 1 / 15,
    });
    expect(mixed).toEqual({
      attachmentStyle: 0,
      emotionalExpression: 0.75,
      communicationStyle: 0.75,
      conflictHandling: 0.5,
      loveLanguage: null,
      securityNeed: null,
      controlNeed: null,
      independence: 0,
      loyaltyView: null,
      jealousyTendency: 1,
      moneyAttitude: null,
      careerPriority: null,
      lifePace: null,
      socialNeed: null,
      emotionalStability: null,
      sexualValues: null,
      familyView: null,
      marriageExpectation: null,
      childrenIntent: null,
      riskPreference: null,
      confidence: 2 / 15,
    });
  });

  /** G-q06-5E-optionA：受控将 q06 视为可计分，验证 5E 进轴 5 */
  it("G-q06-5E-optionA", () => {
    withMockedProductionReady(["q06"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q06", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        attachmentStyle: 0.5,
        loveLanguage: 0.625,
        securityNeed: 1,
      });
    });
  });

  /** G-q01-multi-A：q01 选项 A 多轴打点（1C/2B/3B/4C/8C） */
  it("G-q01-multi-A", () => {
    withMockedProductionReady(["q01"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q01", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        attachmentStyle: 0,
        emotionalExpression: 0.5,
        communicationStyle: 0.5,
        conflictHandling: 0,
        independence: 0,
      });
    });
  });

  /** G-q03-multi-A：q03 选项 A 多轴（含轴 5/6/7/9/10/20） */
  it("G-q03-multi-A", () => {
    withMockedProductionReady(["q03"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q03", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        attachmentStyle: 0.5,
        loveLanguage: 0,
        securityNeed: 1,
        controlNeed: 1,
        loyaltyView: 1,
        jealousyTendency: 1,
        riskPreference: 0.5,
      });
    });
  });

  /** G-q06-multi-C：q06 选项 C 多轴（5C/12A/3A/1A） */
  it("G-q06-multi-C", () => {
    withMockedProductionReady(["q06"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q06", answerValue: "C" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        attachmentStyle: 1,
        communicationStyle: 1,
        loveLanguage: 0,
        careerPriority: 1,
      });
    });
  });

  /** G-q06-5D-optionB：轴 5 为 D 档 + 2A/3B/6A */
  it("G-q06-5D-optionB", () => {
    withMockedProductionReady(["q06"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q06", answerValue: "B" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        emotionalExpression: 1,
        communicationStyle: 0.5,
        loveLanguage: 0,
        securityNeed: 1,
      });
    });
  });

  /** G-q02-multi-A：1C/2B/3A/6C/8C/14C */
  it("G-q02-multi-A", () => {
    withMockedProductionReady(["q02"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q02", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        attachmentStyle: 0,
        emotionalExpression: 0.5,
        communicationStyle: 1,
        securityNeed: 0,
        independence: 0,
        socialNeed: 0,
      });
    });
  });

  /** G-q04-multi-A：11A/20A/13A */
  it("G-q04-multi-A", () => {
    withMockedProductionReady(["q04"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q04", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        moneyAttitude: 1,
        lifePace: 1,
        riskPreference: 1,
      });
    });
  });

  /** G-q05-multi-A：1A/5D/6B/8B/10C（含轴 5 为 D） */
  it("G-q05-multi-A", () => {
    withMockedProductionReady(["q05"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q05", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        attachmentStyle: 1,
        loveLanguage: 0,
        securityNeed: 0.5,
        independence: 0.5,
        jealousyTendency: 0,
      });
    });
  });

  /** G-q07-multi-A：2A/3A/4A/7B/15A */
  it("G-q07-multi-A", () => {
    withMockedProductionReady(["q07"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q07", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        emotionalExpression: 1,
        communicationStyle: 1,
        conflictHandling: 1,
        controlNeed: 0.5,
        emotionalStability: 1,
      });
    });
  });

  /** G-q08-multi-A：1C/6C/8C/10C */
  it("G-q08-multi-A", () => {
    withMockedProductionReady(["q08"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q08", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        attachmentStyle: 0,
        securityNeed: 0,
        independence: 0,
        jealousyTendency: 0,
      });
    });
  });

  /** G-q09-multi-A：9A/10C/1A */
  it("G-q09-multi-A", () => {
    withMockedProductionReady(["q09"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q09", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        attachmentStyle: 1,
        loyaltyView: 1,
        jealousyTendency: 0,
      });
    });
  });

  /** G-q10-multi-A：13C/20B/15B */
  it("G-q10-multi-A", () => {
    withMockedProductionReady(["q10"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q10", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        lifePace: 0,
        emotionalStability: 0.5,
        riskPreference: 0.5,
      });
    });
  });

  /** G-q11-multi-A：18A/6A/20B */
  it("G-q11-multi-A", () => {
    withMockedProductionReady(["q11"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q11", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        securityNeed: 1,
        marriageExpectation: 1,
        riskPreference: 0.5,
      });
    });
  });

  /** G-q12-multi-A：10C/1A/8C */
  it("G-q12-multi-A", () => {
    withMockedProductionReady(["q12"], () => {
      const out = scoreQuestionnaireG1r([
        { questionKey: "q12", answerValue: "A" },
      ]);

      expect(out.confidence).toBe(1 / 15);
      expectAllNullExcept(out, {
        attachmentStyle: 1,
        independence: 0,
        jealousyTendency: 0,
      });
    });
  });

  /** G-q14-option-A：1B/6B */
  it("G-q14-option-A", () => {
    const out = scoreQuestionnaireG1r([
      { questionKey: "q14", answerValue: "A" },
    ]);

    expect(out.confidence).toBe(1 / 15);
    expectAllNullExcept(out, {
      attachmentStyle: 0.5,
      securityNeed: 0.5,
    });
  });

  /** G-q15-option-A：2B/10B */
  it("G-q15-option-A", () => {
    const out = scoreQuestionnaireG1r([
      { questionKey: "q15", answerValue: "A" },
    ]);

    expect(out.confidence).toBe(1 / 15);
    expectAllNullExcept(out, {
      emotionalExpression: 0.5,
      jealousyTendency: 0.5,
    });
  });
});
