import {
  parseScoreBreakdownFromReasonSummary,
  type ViewerSafeScoreBreakdown,
} from "../src/modules/matching/matching-score-breakdown";

function expectBreakdown(
  actual: ViewerSafeScoreBreakdown,
  expected: ViewerSafeScoreBreakdown,
) {
  expect(actual).toEqual(expected);
}

describe("parseScoreBreakdownFromReasonSummary", () => {
  it("parses standard v1 reasonSummary", () => {
    const s =
      "Selected by finalScore v1 (previewPoolScore=0.8, preferenceScore=1, styleScore=1, profileScore=0.821217).";
    expectBreakdown(parseScoreBreakdownFromReasonSummary(s), {
      previewPoolScore: 0.8,
      preferenceScore: 1,
      styleScore: 1,
      profileScore: 0.821217,
      source: "reason_summary_v1",
    });
  });

  it("parses many fractional digits", () => {
    const s =
      "Selected by finalScore v1 (previewPoolScore=0.79, preferenceScore=0.333333, styleScore=0.5, profileScore=0.793412).";
    expectBreakdown(parseScoreBreakdownFromReasonSummary(s), {
      previewPoolScore: 0.79,
      preferenceScore: 0.333333,
      styleScore: 0.5,
      profileScore: 0.793412,
      source: "reason_summary_v1",
    });
  });

  it("parses integer 1 and 0", () => {
    const s =
      "Selected by finalScore v1 (previewPoolScore=0, preferenceScore=1, styleScore=0, profileScore=1).";
    expectBreakdown(parseScoreBreakdownFromReasonSummary(s), {
      previewPoolScore: 0,
      preferenceScore: 1,
      styleScore: 0,
      profileScore: 1,
      source: "reason_summary_v1",
    });
  });

  it("allows leading / trailing whitespace", () => {
    const s =
      "  Selected by finalScore v1 (previewPoolScore=0.6, preferenceScore=0.7, styleScore=0.8, profileScore=0.9).  \n";
    expectBreakdown(parseScoreBreakdownFromReasonSummary(s), {
      previewPoolScore: 0.6,
      preferenceScore: 0.7,
      styleScore: 0.8,
      profileScore: 0.9,
      source: "reason_summary_v1",
    });
  });

  it("returns missing for null", () => {
    expectBreakdown(parseScoreBreakdownFromReasonSummary(null), {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "missing",
    });
  });

  it("returns missing for empty string", () => {
    expectBreakdown(parseScoreBreakdownFromReasonSummary(""), {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "missing",
    });
    expectBreakdown(parseScoreBreakdownFromReasonSummary("   "), {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "missing",
    });
  });

  it("returns parse_failed for unrelated text", () => {
    expectBreakdown(parseScoreBreakdownFromReasonSummary("legacy manual pick"), {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "parse_failed",
    });
  });

  it("returns parse_failed when v1 prefix but trailing junk", () => {
    const s =
      "Selected by finalScore v1 (previewPoolScore=0.8, preferenceScore=1, styleScore=1, profileScore=0.8). extra";
    expectBreakdown(parseScoreBreakdownFromReasonSummary(s), {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "parse_failed",
    });
  });

  it("returns parse_failed when values out of [0,1]", () => {
    const s =
      "Selected by finalScore v1 (previewPoolScore=1.1, preferenceScore=1, styleScore=1, profileScore=0.8).";
    expectBreakdown(parseScoreBreakdownFromReasonSummary(s), {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "parse_failed",
    });
  });

  it("does not leak raw reasonSummary in the return shape", () => {
    const raw = "Selected by finalScore v1 (previewPoolScore=0.8, preferenceScore=1, styleScore=1, profileScore=0.1).";
    const out = parseScoreBreakdownFromReasonSummary(raw);
    expect(Object.keys(out).sort()).toEqual([
      "preferenceScore",
      "previewPoolScore",
      "profileScore",
      "source",
      "styleScore",
    ]);
    expect(JSON.stringify(out)).not.toContain("Selected by");
  });
});
