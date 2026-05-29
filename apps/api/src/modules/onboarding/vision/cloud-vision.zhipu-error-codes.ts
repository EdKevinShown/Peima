/**
 * P7.5-r7-d: Zhipu HTTP status → refusal code (facade maps cloud_zhipu_<code>).
 */

/** Refusal code suffix; facade prefixes with `cloud_zhipu_`. */
export function zhipuHttpErrorCodeFromStatus(status: number): string {
  switch (status) {
    case 400:
      return "http_400";
    case 401:
      return "http_401";
    case 403:
      return "http_403";
    case 404:
      return "http_404";
    case 413:
      return "http_413";
    case 429:
      return "http_429";
    case 500:
    case 502:
    case 503:
      return "http_5xx";
    default:
      return `http_${status}`;
  }
}

export function zhipuCloudVisionFallbackReasonFromRefusalCode(
  refusalCode: string,
): string {
  return `cloud_zhipu_${refusalCode}`;
}
