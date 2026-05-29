import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  getCanonicalQuestionKeys,
  getQuestionKeys,
  isQuestionProductionReady,
  QUESTIONS,
} from "../src/modules/questionnaire/data/questions";
import { QuestionnaireService } from "../src/modules/questionnaire/questionnaire.service";
import { scoreQuestionnaireG1r } from "../src/modules/questionnaire/questionnaire.scorer";

describe("M6.0-Q2 — q29 / q30 canonical (30 题计分闸门)", () => {
  it("QUESTIONS 中 canonical 为 30 题", () => {
    expect(QUESTIONS.filter((q) => q.sourceTier === "canonical")).toHaveLength(30);
    expect(QUESTIONS.every((q) => q.sourceTier === "canonical")).toBe(true);
  });

  it("getCanonicalQuestionKeys 长度为 30 且含 q29、q30", () => {
    const keys = getCanonicalQuestionKeys();
    expect(keys).toHaveLength(30);
    expect(keys).toContain("q29");
    expect(keys).toContain("q30");
  });

  it("isQuestionProductionReady(q29) 与 q30 为 true", () => {
    expect(isQuestionProductionReady("q29")).toBe(true);
    expect(isQuestionProductionReady("q30")).toBe(true);
  });

  it("scoreQuestionnaireG1r 仅答 q29 时纳入计分且 confidence 分母为 30", () => {
    const out = scoreQuestionnaireG1r([
      { questionKey: "q29", answerValue: "A" },
    ]);
    expect(out.confidence).toBeCloseTo(1 / 30, 10);
    expect(out.emotionalExpression).not.toBeNull();
    expect(out.securityNeed).not.toBeNull();
  });

  it("q29 不同答案改变 tags 指向的轴值", () => {
    const a = scoreQuestionnaireG1r([{ questionKey: "q29", answerValue: "A" }]);
    const d = scoreQuestionnaireG1r([{ questionKey: "q29", answerValue: "D" }]);
    expect(a.emotionalExpression).not.toEqual(d.emotionalExpression);
    expect(a.careerPriority).not.toEqual(d.careerPriority);
  });

  it("q30 不同答案改变 tags 指向的轴值", () => {
    const oa = scoreQuestionnaireG1r([{ questionKey: "q30", answerValue: "A" }]);
    const ob = scoreQuestionnaireG1r([{ questionKey: "q30", answerValue: "B" }]);
    expect(oa.lifePace).not.toEqual(ob.lifePace);
    expect(oa.loveLanguage).not.toEqual(ob.loveLanguage);
  });

  it("缺 q30 时 submit 校验失败（BadRequest）", async () => {
    const $transaction = jest.fn();
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u-q2-missing" }),
      },
      $transaction,
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestionnaireService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    const service = moduleRef.get(QuestionnaireService);
    const keys = getQuestionKeys().filter((k) => k !== "q30");
    const answers = keys.map((questionKey) => ({
      questionKey,
      answerValue: "A",
    }));

    await expect(
      service.submit({ userId: "u-q2-missing", answers }),
    ).rejects.toThrow(BadRequestException);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("30 题键齐全且合法时 submit 进入事务并返回 profile", async () => {
    const upsertResult = {
      userId: "u-q2-full",
      confidence: 1,
    } as Record<string, unknown>;

    const tx = {
      questionnaireAnswer: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 30 }),
      },
      userProfile: {
        upsert: jest.fn().mockResolvedValue(upsertResult),
      },
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u-q2-full" }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestionnaireService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    const service = moduleRef.get(QuestionnaireService);
    const answers = getQuestionKeys().map((questionKey) => ({
      questionKey,
      answerValue: "A" as const,
    }));

    const res = await service.submit({ userId: "u-q2-full", answers });
    expect(res.answersSaved).toBe(30);
    expect(res.profile).toEqual(upsertResult);
    expect(tx.questionnaireAnswer.deleteMany).toHaveBeenCalled();
    expect(tx.questionnaireAnswer.createMany).toHaveBeenCalled();
    expect(tx.userProfile.upsert).toHaveBeenCalled();
  });
});
