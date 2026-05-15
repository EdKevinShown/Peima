import {
  buildFaceDetectionScoreBlock,
  comparePrimaryFaceCandidate,
  computeAreaRatio,
  computeCenterDistance,
  computePrimaryScore,
  enrichFaceMetrics,
  selectPrimaryFaceIndex,
} from "../src/modules/images/user-image-primary-face";
import {
  mergeQualityAndFaceDetection,
  USER_IMAGE_DETECTION_RULES_VERSION_R1C,
} from "../src/modules/images/user-image-quality-detection";

describe("user-image-primary-face (P7.4-r1c-b)", () => {
  const imageWidth = 800;
  const imageHeight = 600;

  it("computeAreaRatio uses box area over image area", () => {
    expect(computeAreaRatio({ x: 0, y: 0, width: 400, height: 300 }, 800, 600)).toBeCloseTo(
      0.25,
      5,
    );
  });

  it("computeCenterDistance is 0 for centered face", () => {
    expect(
      computeCenterDistance({ x: 350, y: 250, width: 100, height: 100 }, 800, 600),
    ).toBeCloseTo(0, 5);
  });

  it("computePrimaryScore combines score, area, and center", () => {
    const s = computePrimaryScore(0.9, 0.2, 0);
    expect(s).toBeCloseTo(0.9 * 0.5 + 0.2 * 0.4 + 0.1, 5);
  });

  it("selectPrimaryFaceIndex picks highest primaryScore", () => {
    const a = enrichFaceMetrics(
      { score: 0.5, box: { x: 0, y: 0, width: 40, height: 40 } },
      imageWidth,
      imageHeight,
    );
    const b = enrichFaceMetrics(
      { score: 0.95, box: { x: 300, y: 200, width: 200, height: 250 } },
      imageWidth,
      imageHeight,
    );
    expect(selectPrimaryFaceIndex([a, b])).toBe(1);
  });

  it("tie-break prefers larger areaRatio when primaryScore ties", () => {
    const small = enrichFaceMetrics(
      { score: 0.8, box: { x: 0, y: 0, width: 50, height: 50 } },
      imageWidth,
      imageHeight,
    );
    const large = enrichFaceMetrics(
      { score: 0.8, box: { x: 100, y: 100, width: 300, height: 300 } },
      imageWidth,
      imageHeight,
    );
    large.primaryScore = small.primaryScore;
    expect(comparePrimaryFaceCandidate(large, small)).toBeLessThan(0);
    expect(selectPrimaryFaceIndex([small, large])).toBe(1);
  });

  it("tie-break prefers smaller centerDistance when score and area tie", () => {
    const offCenter = enrichFaceMetrics(
      { score: 0.85, box: { x: 0, y: 0, width: 200, height: 200 } },
      imageWidth,
      imageHeight,
    );
    const centered = enrichFaceMetrics(
      { score: 0.85, box: { x: 300, y: 200, width: 200, height: 200 } },
      imageWidth,
      imageHeight,
    );
    offCenter.primaryScore = centered.primaryScore;
    offCenter.areaRatio = centered.areaRatio;
    expect(selectPrimaryFaceIndex([offCenter, centered])).toBe(1);
  });

  it("tie-break prefers lower index when all metrics tie", () => {
    const f0 = enrichFaceMetrics(
      { score: 0.7, box: { x: 200, y: 150, width: 120, height: 120 } },
      imageWidth,
      imageHeight,
    );
    const f1 = enrichFaceMetrics(
      { score: 0.7, box: { x: 200, y: 150, width: 120, height: 120 } },
      imageWidth,
      imageHeight,
    );
    f1.primaryScore = f0.primaryScore;
    f1.areaRatio = f0.areaRatio;
    f1.centerDistance = f0.centerDistance;
    expect(selectPrimaryFaceIndex([f0, f1])).toBe(0);
  });

  it("buildFaceDetectionScoreBlock sets primaryFace for single face", () => {
    const block = buildFaceDetectionScoreBlock(
      [{ score: 0.91, box: { x: 10, y: 20, width: 120, height: 150 } }],
      imageWidth,
      imageHeight,
    );
    expect(block.faceCount).toBe(1);
    expect(block.primaryFace?.index).toBe(0);
    expect(block.faces[0]?.areaRatio).toBeGreaterThan(0);
    expect(block.faces[0]?.primaryScore).toBe(block.primaryFace?.primaryScore);
  });
});

describe("mergeQualityAndFaceDetection with primaryFace", () => {
  const baseMetrics = {
    width: 800,
    height: 600,
    sampleWidth: 320,
    sampleHeight: 240,
    meanLuma: 120,
    laplacianVariance: 80,
  };

  it("single face passed with primaryFace index 0", () => {
    const r = mergeQualityAndFaceDetection({
      metrics: baseMetrics,
      faceCount: 1,
      faces: [{ score: 0.9, box: { x: 300, y: 200, width: 180, height: 200 } }],
      faceDetectionEnabled: true,
    });
    expect(r.status).toBe("passed");
    expect(r.rulesVersion).toBe(USER_IMAGE_DETECTION_RULES_VERSION_R1C);
    expect(r.scoreJson?.face?.primaryFace?.index).toBe(0);
    expect(r.reasonCodes).toEqual([]);
  });

  it("multiple faces passed with MULTIPLE_FACES warning and primaryFace", () => {
    const r = mergeQualityAndFaceDetection({
      metrics: baseMetrics,
      faceCount: 2,
      faces: [
        { score: 0.5, box: { x: 0, y: 0, width: 40, height: 40 } },
        { score: 0.95, box: { x: 280, y: 180, width: 220, height: 240 } },
      ],
      faceDetectionEnabled: true,
    });
    expect(r.status).toBe("passed");
    expect(r.scoreJson?.warnings).toContain("MULTIPLE_FACES");
    expect(r.reasonCodes).not.toContain("MULTIPLE_FACES");
    expect(r.scoreJson?.face?.primaryFace?.index).toBe(1);
  });

  it("no face failed without primaryFace", () => {
    const r = mergeQualityAndFaceDetection({
      metrics: baseMetrics,
      faceCount: 0,
      faces: [],
      faceDetectionEnabled: true,
    });
    expect(r.status).toBe("failed");
    expect(r.reasonCodes).toEqual(["FACE_NOT_FOUND"]);
    expect(r.scoreJson?.face?.primaryFace).toBeUndefined();
    expect(r.rulesVersion).toBe(USER_IMAGE_DETECTION_RULES_VERSION_R1C);
  });
});
