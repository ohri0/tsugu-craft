import { describe, expect, it } from "vitest";
import { findCorners } from "../src/geometry/corners";
import { extent } from "../src/geometry/polygon";
import { extractStone, NoStoneError } from "../src/vision/extract";
import { ellipse, rounded, synth, triangle } from "./helpers/synth";

// 50 px / mm 相当。三角の石を、白い紙（左上が明るく右下が暗い）の上に置いた写真
const W = 1200;
const H = 900;
const stone = rounded(triangle(620, 470, 444, 376, 0.35), 6);
const truth = extent(stone);

describe("写真から輪郭を取る", () => {
  const img = synth({
    width: W,
    height: H,
    paper: [[250, 248, 244], [200, 196, 190]],
    shapes: [{ outline: stone, color: [214, 150, 170] }],
    noise: 6,
    borderShadow: true,
  });
  const r = extractStone(img);

  it("長辺と幅が 0.5% 以内で合う", () => {
    const e = extent(r.outlinePx);
    expect(Math.abs(e.long - truth.long) / truth.long).toBeLessThan(0.005);
    expect(Math.abs(e.width - truth.width) / truth.width).toBeLessThan(0.005);
  });
  it("尖った角を 3 か所見つける", () => {
    expect(findCorners(r.outlinePx)).toHaveLength(3);
  });
  it("写真の端に触れる影は石と見なさない", () => {
    expect(r.candidates).toHaveLength(1);
    expect(r.rejectedAtBorder).toBeGreaterThanOrEqual(1);
  });
  it("石の色を取る（色のある石）", () => {
    expect(r.color.r).toBeGreaterThan(r.color.g + 30);
    expect(r.colorless).toBe(false);
  });
});

describe("選び方", () => {
  const big = ellipse(800, 450, 150, 110);
  const small = ellipse(300, 300, 90, 90);
  const img = synth({
    width: W,
    height: H,
    paper: [[245, 245, 245], [235, 235, 235]],
    shapes: [{ outline: big, color: [90, 140, 200] }, { outline: small, color: [90, 140, 200] }],
    noise: 4,
  });
  it("押さなければ真ん中に近い石", () => {
    const r = extractStone(img);
    expect(r.candidates).toHaveLength(2);
    expect(extent(r.outlinePx).long).toBeCloseTo(300, -1);
  });
  it("押した石を選ぶ", () => {
    const r = extractStone(img, { pick: { x: 300, y: 300 } });
    expect(extent(r.outlinePx).long).toBeCloseTo(180, -1);
  });
});

describe("むずかしい写真", () => {
  it("淡い石（紙との色の差が小さい）でも縁を取る", () => {
    const img = synth({
      width: W,
      height: H,
      paper: [[246, 244, 240], [226, 222, 216]],
      shapes: [{ outline: stone, color: [222, 210, 214] }],
      noise: 4,
    });
    const e = extent(extractStone(img).outlinePx);
    expect(Math.abs(e.width - truth.width) / truth.width).toBeLessThan(0.02);
  });
  it("無色の石を黒い紙の上で", () => {
    const img = synth({
      width: W,
      height: H,
      paper: [[20, 20, 22], [40, 40, 44]],
      shapes: [{ outline: stone, color: [190, 190, 195] }],
      noise: 5,
    });
    const r = extractStone(img);
    expect(r.colorless).toBe(true);
    expect(Math.abs(extent(r.outlinePx).long - truth.long) / truth.long).toBeLessThan(0.005);
  });
  it("石がなければ、撮り方を添えて知らせる", () => {
    const img = synth({ width: 400, height: 300, paper: [[240, 240, 240], [230, 230, 230]], shapes: [], noise: 3 });
    expect(() => extractStone(img)).toThrow(NoStoneError);
  });
});

describe("試作で読み違えた写真（淡い石 ＋ 端の影）", () => {
  it("端の濃い影にしきい値を引っぱられず、淡い石の幅を読む", () => {
    const img = synth({
      width: W,
      height: H,
      paper: [[246, 244, 240], [226, 222, 216]],
      shapes: [{ outline: stone, color: [222, 210, 214] }],
      noise: 5,
      borderShadow: true,
    });
    const r = extractStone(img);
    const e = extent(r.outlinePx);
    expect(Math.abs(e.width - truth.width) / truth.width).toBeLessThan(0.02);
    expect(findCorners(r.outlinePx)).toHaveLength(3);
  });
});
