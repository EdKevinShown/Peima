import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOnboardingPreferencePayload,
  buildOnboardingProfilePayload,
  mapOnboardingGender,
  mapOnboardingOccupation,
  mapOnboardingRelationshipGoal,
  mapOnboardingRelationshipGoalPreferences,
} from "./onboardingSubmitPayload.js";

describe("onboardingSubmitPayload", () => {
  it("maps legacy Chinese gender labels to API enums", () => {
    assert.equal(mapOnboardingGender("男"), "male");
    assert.equal(mapOnboardingGender("女"), "female");
    assert.equal(mapOnboardingGender("male"), "male");
    assert.equal(mapOnboardingGender("其他"), null);
  });

  it("maps legacy relationship goal labels to structured values", () => {
    assert.equal(mapOnboardingRelationshipGoal("认真交往"), "认真恋爱");
    assert.equal(mapOnboardingRelationshipGoal("先从朋友开始"), "先认识了解");
    assert.equal(mapOnboardingRelationshipGoal("步入婚姻"), "结婚导向");
    assert.equal(mapOnboardingRelationshipGoal("暂不确定"), "暂不确定");
    assert.equal(mapOnboardingRelationshipGoal("认真恋爱"), "认真恋爱");
  });

  it("maps free-text occupation to 其他 when not in whitelist", () => {
    assert.equal(mapOnboardingOccupation("产品经理"), "其他");
    assert.equal(
      mapOnboardingOccupation("互联网 / IT / 通信"),
      "互联网 / IT / 通信",
    );
  });

  it("styleTags-only submit omits gender/occupation/relationshipGoal from profile payload", () => {
    const answers = {
      gender: "男",
      occupation: "产品经理",
      relationshipGoal: "认真交往",
      styleTags: ["清爽自然", "温柔"],
    };
    const touched = new Set(["styleTags"]);
    const profile = buildOnboardingProfilePayload(answers, touched);
    const pref = buildOnboardingPreferencePayload(answers, touched);

    assert.deepEqual(profile, {});
    assert.deepEqual(pref.styleTags, ["清爽自然"]);
  });

  it("full profile submit maps Chinese UI values to backend enums", () => {
    const answers = {
      nickname: "小安",
      gender: "女",
      age: 28,
      height: 165,
      city: "上海",
      education: "本科",
      occupation: "产品经理",
      relationshipGoal: "认真交往",
      bio: "hello",
      styleTags: ["温柔"],
    };
    const touched = new Set(Object.keys(answers));
    const profile = buildOnboardingProfilePayload(answers, touched);

    assert.equal(profile.gender, "female");
    assert.equal(profile.occupation, "其他");
    assert.equal(profile.relationshipGoal, "认真恋爱");
    assert.equal(profile.city, "上海");
    assert.equal(profile.education, "本科");
  });

  it("maps relationshipGoalPreferences multi-select legacy labels", () => {
    assert.deepEqual(
      mapOnboardingRelationshipGoalPreferences([
        "认真交往",
        "先从朋友开始",
        "暂不确定",
      ]),
      ["认真恋爱", "先认识了解", "暂不确定"],
    );
  });
});
