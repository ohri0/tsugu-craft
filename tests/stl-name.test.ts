import { describe, expect, it } from "vitest";
import { stlFileName } from "../src/studio/stl-name";

describe("STL のファイル名", () => {
  it("作れない所がなければ、そのままの名前", () => {
    expect(stlFileName("継ぐ_ラウンド_11号", 0)).toBe("継ぐ_ラウンド_11号.stl");
  });
  it("作れない所があるまま書き出すと「_確かめ前」が付く", () => {
    expect(stlFileName("継ぐ_ラウンド_11号", 2)).toBe("継ぐ_ラウンド_11号_確かめ前.stl");
  });
});
