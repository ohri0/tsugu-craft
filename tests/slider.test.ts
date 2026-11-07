// 数のつまみ：打った数を、範囲の中のいちばん近い目盛りにそろえる
import { describe, expect, it } from "vitest";
import { formatValue, liveWait, snapValue } from "../src/studio/slider";

describe("数のつまみ", () => {
  it("目盛りにそろえる", () => {
    expect(snapValue("0.83", 0.4, 1.6, 0.05)).toBe(0.85);
    expect(snapValue(0.82, 0.4, 1.6, 0.05)).toBe(0.8);
    expect(snapValue("12", 5, 25, 1)).toBe(12);
    expect(snapValue("12.4", 5, 25, 1)).toBe(12);
  });
  it("範囲の外は端にそろえる", () => {
    expect(snapValue("3", 0.4, 1.6, 0.05)).toBe(1.6);
    expect(snapValue("-1", 5, 25, 1)).toBe(5);
  });
  it("単位や全角の空白が付いていても読む。読めなければ null", () => {
    expect(snapValue("0.9 mm", 0.4, 1.6, 0.05)).toBe(0.9);
    expect(snapValue("", 0.4, 1.6, 0.05)).toBeNull();
    expect(snapValue("あ", 0.4, 1.6, 0.05)).toBeNull();
    expect(snapValue("０．９", 0.4, 1.6, 0.05)).toBe(0.9);
  });
  it("表示は目盛りの桁で", () => {
    expect(formatValue(0.8, 0.05)).toBe("0.80");
    expect(formatValue(12, 1)).toBe("12");
    expect(formatValue(2.2, 0.1)).toBe("2.2");
  });
  it("動かしている間の作り直しは、前にかかった時間と同じだけ休む（長くても 400 ms）", () => {
    // 軽い作り直し（ほぼ 0 ms）：すぐ次へ
    expect(liveWait(1000, 0, 1000)).toBe(0);
    // 30 ms かかった：終わってから 30 ms は待つ
    expect(liveWait(1000, 30, 1010)).toBe(20);
    expect(liveWait(1000, 30, 1040)).toBe(0);
    // とても遅い機械でも、待つのは 400 ms まで
    expect(liveWait(1000, 2000, 1000)).toBe(400);
  });
});
