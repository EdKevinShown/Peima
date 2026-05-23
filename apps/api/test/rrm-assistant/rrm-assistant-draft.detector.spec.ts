import {
  buildRrmAssistantDraftAssessment,
  detectRrmAssistantDraft,
} from "../../src/modules/rrm-assistant";

describe("rrm-assistant draft detector (M5.1-r7)", () => {
  it("maps greeting to very_low without advancement", () => {
    const d = detectRrmAssistantDraft("你好呀");
    expect(d.advancementDetected).toBe(false);
    expect(d.A_draft_bucket).toBe("very_low");
    expect(d.A_draft).toBe(0.05);
  });

  it("detects light invite as advancement with medium_to_high bucket", () => {
    const d = detectRrmAssistantDraft("周末有空一起喝咖啡吗？");
    expect(d.advancementDetected).toBe(true);
    expect(d.advancementType).toBe("light_invite");
    expect(d.A_draft_bucket).toBe("medium_to_high");
    expect(d.A_draft).toBe(0.42);
  });

  it("detects pressure language as very_high advancement", () => {
    const d = detectRrmAssistantDraft("怎么还不回我？今晚必须见面");
    expect(d.advancementDetected).toBe(true);
    expect(d.A_draft_bucket).toBe("very_high");
  });

  it("buildRrmAssistantDraftAssessment provides tone advice when no advancement", () => {
    const out = buildRrmAssistantDraftAssessment({
      draft: "哈哈，昨天那部电影挺好看的",
      observedSummary: {
        coldRisk: 0.2,
        R_obs: 0.1,
        suggestedAction: "maintain",
        insufficientData: false,
      } as any,
    });
    expect(out.actionFit).toBeNull();
    expect(out.detection.advancementDetected).toBe(false);
    expect(out.toneAdvice).toBeTruthy();
    expect(out.sourceVersion).toBe("rrm-assistant-v1");
  });

  it("omits tone path when advancement detected (ActionFit in r8)", () => {
    const out = buildRrmAssistantDraftAssessment({
      draft: "周末见面聊聊？",
    });
    expect(out.detection.advancementDetected).toBe(true);
    expect(out.toneAdvice).toBeNull();
    expect(out.actionFit).toBeNull();
  });
});
