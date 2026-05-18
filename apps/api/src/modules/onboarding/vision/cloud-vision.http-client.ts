/**
 * P7.5-r7-c1: injectable HTTP fetch for cloud vision (test mocks).
 */

export type CloudVisionHttpFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export function defaultCloudVisionHttpFetch(): CloudVisionHttpFetch {
  if (typeof globalThis.fetch !== "function") {
    return async () => {
      throw new Error("VISION_CLOUD_FETCH_UNAVAILABLE");
    };
  }
  return (url, init) => globalThis.fetch(url, init);
}
