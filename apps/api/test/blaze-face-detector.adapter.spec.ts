import {
  DEFAULT_FACE_DETECTION_INFER_TIMEOUT_MS,
  getFaceDetectionInferTimeoutMs,
  raceWithTimeout,
} from "../src/modules/images/user-image-face-detection.adapter";

describe("blaze-face-detector adapter helpers (P7.4-r1b-f1)", () => {
  let prevInferTimeout: string | undefined;

  beforeEach(() => {
    prevInferTimeout = process.env.FACE_DETECTION_INFER_TIMEOUT_MS;
    delete process.env.FACE_DETECTION_INFER_TIMEOUT_MS;
  });

  afterEach(() => {
    if (prevInferTimeout === undefined) {
      delete process.env.FACE_DETECTION_INFER_TIMEOUT_MS;
    } else {
      process.env.FACE_DETECTION_INFER_TIMEOUT_MS = prevInferTimeout;
    }
  });

  it("getFaceDetectionInferTimeoutMs defaults to 8000", () => {
    expect(getFaceDetectionInferTimeoutMs()).toBe(
      DEFAULT_FACE_DETECTION_INFER_TIMEOUT_MS,
    );
  });

  it("getFaceDetectionInferTimeoutMs reads env override", () => {
    process.env.FACE_DETECTION_INFER_TIMEOUT_MS = "12000";
    expect(getFaceDetectionInferTimeoutMs()).toBe(12000);
  });

  it("raceWithTimeout rejects when infer exceeds limit", async () => {
    await expect(
      raceWithTimeout(
        () => new Promise((resolve) => setTimeout(() => resolve("ok"), 80)),
        20,
      ),
    ).rejects.toThrow("face detection timeout");
  });

  it("raceWithTimeout resolves when infer finishes in time", async () => {
    await expect(
      raceWithTimeout(
        () => new Promise((resolve) => setTimeout(() => resolve("ok"), 10)),
        200,
      ),
    ).resolves.toBe("ok");
  });
});

describe("BlazeFaceDetectorAdapter load/infer split (mocked)", () => {
  const mockEstimateFaces = jest.fn();
  const mockLoad = jest.fn();
  const mockDispose = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockEstimateFaces.mockReset();
    mockLoad.mockReset();
    mockDispose.mockReset();
    jest.doMock("@tensorflow/tfjs", () => ({
      tensor3d: jest.fn(() => ({ dispose: mockDispose })),
    }));
    jest.doMock("@tensorflow-models/blazeface", () => ({
      load: mockLoad,
    }));
  });

  afterEach(() => {
    jest.dontMock("@tensorflow/tfjs");
    jest.dontMock("@tensorflow-models/blazeface");
  });

  async function freshAdapter() {
    const { BlazeFaceDetectorAdapter } = await import(
      "../src/modules/images/blaze-face-detector.adapter"
    );
    return new BlazeFaceDetectorAdapter();
  }

  const rgbInput = {
    rgb: new Uint8Array(3 * 4 * 4).fill(128),
    width: 4,
    height: 4,
  };

  it("slow load then fast infer succeeds (load not subject to infer timeout)", async () => {
    mockLoad.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                estimateFaces: mockEstimateFaces.mockResolvedValue([]),
              }),
            60,
          );
        }),
    );
    const adapter = await freshAdapter();
    const r = await adapter.detectFaces(rgbInput);
    expect(r.faceCount).toBe(0);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it("infer timeout throws face detection timeout", async () => {
    mockLoad.mockResolvedValue({
      estimateFaces: mockEstimateFaces.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 200)),
      ),
    });
    process.env.FACE_DETECTION_INFER_TIMEOUT_MS = "30";
    const adapter = await freshAdapter();
    await expect(adapter.detectFaces(rgbInput)).rejects.toThrow(
      "face detection timeout",
    );
  });

  it("concurrent detectFaces share one load call", async () => {
    let resolveLoad: (m: { estimateFaces: jest.Mock }) => void;
    mockLoad.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const adapter = await freshAdapter();
    const p1 = adapter.detectFaces(rgbInput);
    const p2 = adapter.detectFaces(rgbInput);
    resolveLoad!({
      estimateFaces: mockEstimateFaces.mockResolvedValue([
        {
          topLeft: [0, 0],
          bottomRight: [10, 10],
          probability: 0.9,
        },
      ]),
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(r1.faceCount).toBe(1);
    expect(r2.faceCount).toBe(1);
  });

  it("load failure clears promise so next call retries load", async () => {
    mockLoad
      .mockRejectedValueOnce(new Error("load failed"))
      .mockResolvedValueOnce({
        estimateFaces: mockEstimateFaces.mockResolvedValue([]),
      });
    const adapter = await freshAdapter();
    await expect(adapter.detectFaces(rgbInput)).rejects.toThrow("load failed");
    const r = await adapter.detectFaces(rgbInput);
    expect(r.faceCount).toBe(0);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });
});
