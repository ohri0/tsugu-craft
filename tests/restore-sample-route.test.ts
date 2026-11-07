import { describe, expect, it } from "vitest";
import { isBuiltInSample, MOYOU_SAMPLE_ID, MOYOU_SURFACE_SAMPLE_ID } from "../src/app/restore";

describe("途切れた技：組み込みの例を直接開く（2026-11-08）", () => {
  it("demo- の例は組み込みの例として読み込める", () => {
    expect(isBuiltInSample(MOYOU_SAMPLE_ID)).toBe(true);
    expect(isBuiltInSample(MOYOU_SURFACE_SAMPLE_ID)).toBe(true);
    expect(isBuiltInSample("demo-amadare")).toBe(true);
  });
  it("ほかの id や、物の名前（toString など）は例ではない", () => {
    expect(isBuiltInSample("abc123")).toBe(false);
    expect(isBuiltInSample("toString")).toBe(false);
  });
});
