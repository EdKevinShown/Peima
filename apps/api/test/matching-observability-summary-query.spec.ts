import { BadRequestException } from "@nestjs/common";
import {
  parseMatchingObservabilityLimitQuery,
  parseMatchingObservabilitySinceDaysQuery,
} from "../src/modules/admin/matching-observability-summary.service";

describe("matching observability summary query parsing", () => {
  it("uses defaults when query omitted", () => {
    expect(parseMatchingObservabilityLimitQuery(undefined)).toBe(500);
    expect(parseMatchingObservabilitySinceDaysQuery(undefined)).toBe(30);
  });

  it("accepts in-range integers", () => {
    expect(parseMatchingObservabilityLimitQuery("100")).toBe(100);
    expect(parseMatchingObservabilitySinceDaysQuery("7")).toBe(7);
  });

  it("rejects non-numeric and out-of-range values", () => {
    expect(() => parseMatchingObservabilityLimitQuery("abc")).toThrow(BadRequestException);
    expect(() => parseMatchingObservabilityLimitQuery("0")).toThrow(BadRequestException);
    expect(() => parseMatchingObservabilitySinceDaysQuery("99999")).toThrow(BadRequestException);
  });
});
