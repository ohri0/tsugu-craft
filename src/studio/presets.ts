// よくある石の形（写真がなくても選べる）。輪郭を mm で作り、画面の側で白い紙の上の写真のように描いて、
// 写真と同じ読み取りに通す。大きさと深さは、よくある例（選んだあと、ノギスの値に変えられる）。画面に依存しない。
import type { Point } from "../geometry/polygon";

export interface StonePreset {
  id: string;
  name: string;
  /** 長辺 × 幅（mm） */
  longMm: number;
  widthMm: number;
  /** 深さの例（mm）。石ごとにちがうので、測った値に直す */
  depthMm: number;
}

export const PRESETS: StonePreset[] = [
  { id: "round", name: "ラウンド", longMm: 6.5, widthMm: 6.5, depthMm: 3.9 },
  { id: "oval", name: "オーバル", longMm: 8, widthMm: 6, depthMm: 3.7 },
  { id: "princess", name: "スクエア", longMm: 5.5, widthMm: 5.5, depthMm: 4 },
  { id: "emerald", name: "エメラルド", longMm: 8, widthMm: 6, depthMm: 4 },
  { id: "pear", name: "ペア", longMm: 9, widthMm: 6, depthMm: 3.7 },
  { id: "marquise", name: "マーキス", longMm: 10, widthMm: 5, depthMm: 3.2 },
];

/** 輪郭（mm、中心が原点、長辺が x）。反時計回り */
export function presetOutline(p: StonePreset, n = 128): Point[] {
  const a = p.longMm / 2;
  const b = p.widthMm / 2;
  const out: Point[] = [];
  switch (p.id) {
    case "round":
    case "oval":
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        out.push({ x: a * Math.cos(t), y: b * Math.sin(t) });
      }
      return out;
    case "princess":
      return [
        { x: -a, y: -b },
        { x: a, y: -b },
        { x: a, y: b },
        { x: -a, y: b },
      ];
    case "emerald": {
      const c = Math.min(a, b) * 0.32;
      return [
        { x: -a + c, y: -b },
        { x: a - c, y: -b },
        { x: a, y: -b + c },
        { x: a, y: b - c },
        { x: a - c, y: b },
        { x: -a + c, y: b },
        { x: -a, y: b - c },
        { x: -a, y: -b + c },
      ];
    }
    case "pear": {
      // 丸い方の円と、とがった先から円へ引いた 2 本の接線
      const r = b;
      const cx = -a + r;
      const d = a - cx;
      const al = Math.acos(r / d);
      const m = n - 1;
      for (let i = 0; i < m; i++) {
        const t = al + ((Math.PI * 2 - 2 * al) * i) / (m - 1);
        out.push({ x: cx + r * Math.cos(t), y: r * Math.sin(t) });
      }
      out.push({ x: a, y: 0 });
      return out;
    }
    case "marquise": {
      // 両端がとがった形：(±a, 0) と (0, ±b) を通る 2 つの円の弧
      const R = (a * a + b * b) / (2 * b);
      const half = n / 2;
      for (let i = 0; i < half; i++) {
        const x = a - (2 * a * i) / half;
        out.push({ x, y: Math.sqrt(R * R - x * x) - (R - b) });
      }
      for (let i = 0; i < half; i++) {
        const x = -a + (2 * a * i) / half;
        out.push({ x, y: -(Math.sqrt(R * R - x * x) - (R - b)) });
      }
      return out;
    }
  }
  return out;
}
