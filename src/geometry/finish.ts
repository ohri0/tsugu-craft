// 伝統の仕上げ（槌目・ミル打ち・布目象嵌）の設計の値と、ミル打ちの粒の形。画面に依存しない純粋な関数。
// - 槌目と布目象嵌は、形（STL）を変えない面の仕上げ。3D では材質で見せる（src/ui/hammer.ts）。
// - ミル打ちは本当の形：腕の外の面の両縁に、細い縁（低い山）と、半分沈んだ粒の列を作る。STL と図面に入る。
// 座標は指輪の座標（shank.ts と同じ）：x が指の軸、腕は y–z の面の円、いちばん上が +z。
import { GUIDES } from "../rules/guides.js";
import type { V3 } from "./mesh.js";
import { nunomeOf, nunomeWords, type NunomeDesign } from "./nunome.js";

export type TsuchimeSize = "small" | "medium" | "large";
/** 槌目の種類（鎚の面の形）：maru＝丸槌目、kaku＝角槌目（平槌目）、tate＝縦槌目（筋目）、arashi＝荒らし槌目 */
export type TsuchimeStyle = "maru" | "kaku" | "tate" | "arashi";
/** 槌目を打つ所：outer＝腕の外の面だけ、all＝外の面と横の面（指に当たる内側は打たない） */
export type TsuchimeArea = "outer" | "all";

export interface RingFinish {
  /** 槌目（なければ鏡面）。style がなければ丸槌目（前の記録） */
  tsuchime?: { size: TsuchimeSize; area: TsuchimeArea; style?: TsuchimeStyle };
  /** ミル打ち：edges＝腕の外の面の両縁に一列ずつ */
  milgrain?: "edges";
  /** 象嵌：nunome＝腕の外の真ん中に、色のちがう地金の帯の模様（布目象嵌） */
  inlay?: "nunome";
  /** 布目象嵌の模様と大きさ（なければ菱つなぎの はじめの値。前の記録はこれがない） */
  nunome?: NunomeDesign;
}

/**
 * ミル打ちを、画面の選ぶ欄と Claude の道具に出すか。形の処理（milgrainBeads）は残し、ここで隠せる。
 * 2026-11-07：細い縁に半分沈んだ粒の形に作り直し、寄りの絵で本物のミルに見えたので出す（docs/LOG.md）
 */
export const MILGRAIN_OFFERED = true;

export const TSUCHIME_LABEL: Record<TsuchimeSize, string> = { small: "小", medium: "中", large: "大" };
export const TSUCHIME_STYLE_LABEL: Record<TsuchimeStyle, string> = { maru: "丸槌目", kaku: "角槌目", tate: "縦槌目", arashi: "荒らし槌目" };
/** 槌目の種類の、ふつうの言葉の一行（画面と作り方） */
export const TSUCHIME_STYLE_NOTE: Record<TsuchimeStyle, string> = {
  maru: "丸みのある鎚（いも鎚）で打つ。丸いくぼみが重なり、やわらかく光る",
  kaku: "平らな鎚（ならし鎚）を少し傾けて打つ。平らな小さな面が角で接し、きらきら光る（平槌目とも）",
  tate: "細長い面の鎚で、腕に沿って細長い跡を並べる（筋目）。流れるような光",
  arashi: "面を荒らした鎚（荒らし鎚）で、細かく密に打つ。つやを抑えた、しっとりした面",
};
export const TSUCHIME_AREA_LABEL: Record<TsuchimeArea, string> = { outer: "腕の外側", all: "外側と横" };

/** 槌目の種類（記録に種類がなければ丸槌目） */
export const tsuchimeStyleOf = (t: NonNullable<RingFinish["tsuchime"]>): TsuchimeStyle => t.style ?? "maru";

/**
 * 槌目の跡の大きさ（mm。縦槌目は跡の幅、長さはその elongation 倍）と深さ（mm）。どれも**仮**。
 * 荒らし槌目は大きさを選ばない（細かく密に）
 */
export function tsuchimeSpec(t: NonNullable<RingFinish["tsuchime"]>): { markMm: number; depthMm: number; lengthMm: number } {
  const style = tsuchimeStyleOf(t);
  const base = style === "arashi" ? GUIDES.finish.tsuchimeStyle.arashi : GUIDES.finish.tsuchime[t.size];
  const long = style === "tate" ? GUIDES.finish.tsuchimeStyle.tate.elongation : 1;
  return { markMm: base.markMm, depthMm: base.depthMm, lengthMm: base.markMm * long };
}

/** 仕上げが 1 つでもあるか */
export function hasFinish(f: RingFinish | undefined): f is RingFinish {
  return !!f && (!!f.tsuchime || !!f.milgrain || !!f.inlay);
}

/** 槌目の言葉（例：丸槌目・中・腕の外側。荒らし槌目は大きさを言わない） */
export function tsuchimeWords(t: NonNullable<RingFinish["tsuchime"]>): string {
  const style = tsuchimeStyleOf(t);
  return [TSUCHIME_STYLE_LABEL[style], ...(style === "arashi" ? [] : [TSUCHIME_LABEL[t.size]]), TSUCHIME_AREA_LABEL[t.area]].join("・");
}

/** 仕上げの言葉（図面の表題欄・指示書・Claude への返事）。なければ空 */
export function finishWords(f: RingFinish | undefined, goldBase?: boolean): string[] {
  if (!f) return [];
  const out: string[] = [];
  if (f.tsuchime) out.push(`槌目（${tsuchimeWords(f.tsuchime)}）`);
  if (f.milgrain) out.push(`ミル打ち（腕の縁・粒 ø${GUIDES.finish.milgrain.beadMm.toFixed(2)} mm）`);
  if (f.inlay) out.push(`布目象嵌（${nunomeWords(nunomeOf(f)!, goldBase)}）`);
  return out;
}

// ---- ミル打ちの粒 ----

/** 粒の球（正二十面体を 2 回分けた、閉じた 320 の三角形）。半径 1、中心 0 の頂点と、三角形の頂点の番号 */
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: V3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const norm = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  verts = verts.map(norm);
  for (let level = 0; level < 2; level++) {
    const mid = new Map<string, number>();
    const at = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let i = mid.get(key);
      if (i === undefined) {
        const p = verts[a];
        const q = verts[b];
        i = verts.length;
        verts.push(norm([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]));
        mid.set(key, i);
      }
      return i;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = at(a, b);
      const bc = at(b, c);
      const ca = at(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return { verts, faces };
})();
/** 粒 1 つの三角形の数 */
export const BEAD_TRIANGLES = ICO.faces.length;
/** 細い縁の管のまわりの点の数 */
const RIM_AROUND = 12;
/** ミルの粒の、縁を横切る向きの細さ（粒は縁に沿って少し長い、だ円の球。腕の横の面から出ないため。形の値） */
const ACROSS = 0.72;

/** 腕の断面を切った所の線分（x：幅の向き、rho：指の軸からの距離） */
interface Seg {
  x0: number;
  r0: number;
  x1: number;
  r1: number;
}

/** 三角形を、指のまわりの角度の箱に分ける（切る面に近い三角形だけ見るため） */
function binTriangles(pos: Float32Array, bins: number): number[][] {
  const out: number[][] = Array.from({ length: bins }, () => []);
  const step = (2 * Math.PI) / bins;
  for (let t = 0; t < pos.length; t += 9) {
    const ph = [0, 3, 6].map((k) => Math.atan2(pos[t + k + 1], pos[t + k + 2]));
    let lo = Math.min(...ph);
    let hi = Math.max(...ph);
    // いちばん下（±π）をまたぐ三角形
    if (hi - lo > Math.PI) {
      const wrapped = ph.map((p) => (p < 0 ? p + 2 * Math.PI : p));
      lo = Math.min(...wrapped);
      hi = Math.max(...wrapped);
    }
    const i0 = Math.floor((lo + Math.PI) / step) - 1;
    const i1 = Math.floor((hi + Math.PI) / step) + 1;
    for (let i = i0; i <= i1; i++) out[((i % bins) + bins) % bins].push(t);
  }
  return out;
}

/** 角度 phi（いちばん上 0、+y の向きへ正）の半平面で腕を切った線分 */
function sliceAt(pos: Float32Array, tris: readonly number[], phi: number): Seg[] {
  const dy = Math.sin(phi);
  const dz = Math.cos(phi);
  // 面の向き（x 軸をふくむ面）：m ＝ (0, cos, −sin)
  const my = dz;
  const mz = -dy;
  const out: Seg[] = [];
  for (const t of tris) {
    const pts: [number, number][] = [];
    for (let k = 0; k < 3; k++) {
      const a = t + k * 3;
      const b = t + ((k + 1) % 3) * 3;
      const sa = pos[a + 1] * my + pos[a + 2] * mz;
      const sb = pos[b + 1] * my + pos[b + 2] * mz;
      if ((sa > 0) === (sb > 0)) continue;
      const u = sa / (sa - sb);
      const x = pos[a] + (pos[b] - pos[a]) * u;
      const y = pos[a + 1] + (pos[b + 1] - pos[a + 1]) * u;
      const z = pos[a + 2] + (pos[b + 2] - pos[a + 2]) * u;
      const rho = y * dy + z * dz;
      if (rho <= 0) continue;
      pts.push([x, rho]);
    }
    if (pts.length === 2) out.push({ x0: pts[0][0], r0: pts[0][1], x1: pts[1][0], r1: pts[1][1] });
  }
  return out;
}

/** 断面の、片側（s ＝ ±1）の縁の粒の置き場所：幅の位置 x、外の面の rho、外の面の向き（x と rho の成分） */
function edgeSpot(segs: readonly Seg[], s: 1 | -1, r: number): { x: number; rho: number; nx: number; nr: number } | null {
  if (!segs.length) return null;
  let half = 0;
  for (const g of segs) half = Math.max(half, s * g.x0, s * g.x1);
  const x = s * (half - r);
  let best: { x: number; rho: number; nx: number; nr: number } | null = null;
  for (const g of segs) {
    const lo = Math.min(g.x0, g.x1);
    const hi = Math.max(g.x0, g.x1);
    if (x < lo || x > hi || hi - lo < 1e-9) continue;
    const u = (x - g.x0) / (g.x1 - g.x0);
    const rho = g.r0 + (g.r1 - g.r0) * u;
    if (best && rho <= best.rho) continue;
    // 外向き（rho が増える側）の向き
    let nx = -(g.r1 - g.r0);
    let nr = g.x1 - g.x0;
    if (nr < 0) {
      nx = -nx;
      nr = -nr;
    }
    const l = Math.hypot(nx, nr) || 1;
    best = { x, rho, nx: nx / l, nr: nr / l };
  }
  return best;
}

export interface MilgrainResult {
  /** 粒と細い縁の三角形（三角形ごとに 3 頂点 × xyz）と、なめらかに見せる頂点の向き */
  positions: Float32Array;
  normals: Float32Array;
  /** 粒の数と、粒の大きさ・間かく（mm） */
  count: number;
  beadMm: number;
  pitchMm: number;
  /** 粒の中心（粒ごとに xyz。確かめ用） */
  centers: Float32Array;
  /** 粒と細い縁の三角形の数（画面で、腕の三角形と分けるため） */
  triangles: number;
  /** 面の上に出た所の体積（mm³。重さに足す） */
  volumeMm3: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 縁の線の上の点：中心（面の上の点）、面の向き n、線に沿う向き t、その間 b（t・b・n で右手系） */
interface Frame {
  c: V3;
  n: V3;
  t: V3;
  b: V3;
}

/**
 * 腕の外の面の両縁に、ミル打ちを作る（作者の声 2026-11-07：「玉が乗っかってるだけ」を直す）。
 * 本物のミルは、縁の地金を鏨で押し上げた粒の列で、粒は縁の一部（地金に埋まった低い山）。粒どうしは「離さず、重ねず」。
 * - 粒：大きな球を深く沈めた、低い丸い山（高さ h ＝ domeRatio·d/2）。間かく ＝ 粒の大きさ d。
 *   となりの粒とは、山の高さの notchRatio の所で V 字に接する（すき間も、粒どうしをつなぐ首もない）。
 * - 細い縁：粒の列の下の、幅 rimWidthRatio·d、高さ rimHeightRatio·h の低い平たい山（だ円の管。両端は閉じる）。粒の足もとを縁につなぐ。
 * 粒の外側の足もとは、腕の横の面とそろう。
 * shankPositions：腕の三角形（指輪の座標）。avoid：石座の三角形（同じ座標。石座のそばには打たない）。
 * 腕の切れた端と石座のそばは、粒 1 つ分あけて止める。粒も縁も 1 つずつ閉じた形（STL に出せる）
 */
export function milgrainBeads(shankPositions: Float32Array, avoid: Float32Array | null, o: { beadMm?: number; domeRatio?: number; notchRatio?: number } = {}): MilgrainResult {
  const g = GUIDES.finish.milgrain;
  const d = o.beadMm ?? g.beadMm;
  const half = d / 2;
  // 粒の山：高さ h、となりとの V 字の所の高さ hn（t ＝ d/2 で球の面の高さが hn）。
  // 球の半径 Rs・中心の沈み sink：Rs − sink ＝ h、√(Rs² − (d/2)²) − sink ＝ hn
  const h = (o.domeRatio ?? g.domeRatio) * half;
  const hn = (o.notchRatio ?? g.notchRatio) * h;
  const Rs = (half * half + (h - hn) * (h - hn)) / (2 * (h - hn));
  const sink = Rs - h;
  // 粒の足もとの半径（となりと重なる）。粒の列は、足もとが腕の横の面にそろう所
  const r = Math.sqrt(Math.max(Rs * Rs - sink * sink, half * half));
  // 縁を横切る向きの、粒のいちばん外（球の中心の深さで）。粒の列は、ここが腕の横の面にそろう所に置く
  const rAcross = Rs * ACROSS;
  // 細い縁（だ円の管）：面の上の高さ hr、面での半幅 w。だ円の高さの半軸 c、沈み se、幅の半軸 a
  const hr = g.rimHeightRatio * h;
  const w = (g.rimWidthRatio * d) / 2;
  const rimC = 2 * hr;
  const rimSe = rimC - hr;
  const rimA = w / Math.sqrt(1 - (rimSe / rimC) ** 2);
  const BINS = 720;
  const bins = binTriangles(shankPositions, BINS);
  const binOf = (phi: number) => {
    const i = Math.floor(((phi + Math.PI) / (2 * Math.PI)) * BINS);
    return ((i % BINS) + BINS) % BINS;
  };
  // 外の半径のおおよそ（角度の刻みを決める）
  let outer = 0;
  let maxHalf = 0;
  for (let i = 0; i < shankPositions.length; i += 3) {
    outer = Math.max(outer, Math.hypot(shankPositions[i + 1], shankPositions[i + 2]));
    maxHalf = Math.max(maxHalf, Math.abs(shankPositions[i]));
  }
  // 石座のそば：腕の高さにある石座の点の、いちばん外の角度
  let headPhi = -1;
  if (avoid) {
    for (let i = 0; i < avoid.length; i += 3) {
      const rho = Math.hypot(avoid[i + 1], avoid[i + 2]);
      if (rho > outer + d + 0.3 || Math.abs(avoid[i]) > maxHalf + d) continue;
      headPhi = Math.max(headPhi, Math.abs(Math.atan2(avoid[i + 1], avoid[i + 2])));
    }
  }
  const margin = (r + 0.15) / Math.max(outer, 1);
  const stepPhi = d / 6 / Math.max(outer, 1);
  const n = Math.ceil((2 * Math.PI) / stepPhi);
  const positions: number[] = [];
  const centers: number[] = [];
  const normals: number[] = [];
  let count = 0;
  let volume = 0;
  // 面の上に出た所の体積：粒は高さ h の球の帽子（となりと重なる分は引かない。重さは多めに出る）、縁はだ円の切り口の上の分 × 長さ
  const beadV = (Math.PI * h * h * (3 * Rs - h)) / 3;
  const segA = rimA * rimC * (Math.acos(rimSe / rimC) - (rimSe / rimC) * Math.sqrt(1 - (rimSe / rimC) ** 2));
  const tri = (a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3) => {
    positions.push(...a, ...b, ...c);
    normals.push(...na, ...nb, ...nc);
  };
  for (const s of [1, -1] as const) {
    // 縁の線を、続いている所ごとに集める
    const runs: V3[][] = [];
    const norms: V3[][] = [];
    let run: V3[] = [];
    let nrun: V3[] = [];
    const close = () => {
      if (run.length > 1) {
        runs.push(run);
        norms.push(nrun);
      }
      run = [];
      nrun = [];
    };
    for (let k = 0; k <= n; k++) {
      const phi = -Math.PI + k * stepPhi;
      if (headPhi >= 0 && Math.abs(phi) < headPhi + margin) {
        close();
        continue;
      }
      const spot = edgeSpot(sliceAt(shankPositions, bins[binOf(phi)], phi), s, rAcross);
      if (!spot) {
        close();
        continue;
      }
      const sy = Math.sin(phi);
      const cz = Math.cos(phi);
      run.push([spot.x, spot.rho * sy, spot.rho * cz]);
      nrun.push([spot.nx, spot.nr * sy, spot.nr * cz]);
    }
    close();
    // いちばん下（±π）でつながる 2 つの線は 1 つに
    if (runs.length > 1) {
      const first = runs[0];
      const last = runs[runs.length - 1];
      if (Math.abs(Math.atan2(first[0][1], first[0][2]) + Math.PI) < stepPhi * 1.5 && Math.abs(Math.atan2(last[last.length - 1][1], last[last.length - 1][2]) - Math.PI) < stepPhi * 1.5) {
        runs[0] = [...last, ...first];
        norms[0] = [...norms[norms.length - 1], ...norms[0]];
        runs.pop();
        norms.pop();
      }
    }
    runs.forEach((line, li) => {
      const nl = norms[li];
      const acc = [0];
      for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1], line[i][2] - line[i - 1][2]));
      const L = acc[acc.length - 1];
      // 切れた端からは粒 1 つ分あける（はみ出さない）
      const usable = L - 2 * (r + 0.1);
      if (usable < 0) return;
      const m = Math.floor(usable / d) + 1;
      const start = (L - (m - 1) * d) / 2;
      /** 線の長さ at の所の、面の上の点と向き */
      let j = 0;
      const frameAt = (at: number): Frame => {
        while (j < acc.length - 2 && acc[j + 1] < at) j++;
        while (j > 0 && acc[j] > at) j--;
        const u = Math.min(1, Math.max(0, (at - acc[j]) / Math.max(acc[j + 1] - acc[j], 1e-9)));
        const p = line[j];
        const q = line[j + 1];
        const np = nl[j];
        const nq = nl[j + 1];
        const nn = unit([np[0] + (nq[0] - np[0]) * u, np[1] + (nq[1] - np[1]) * u, np[2] + (nq[2] - np[2]) * u]);
        const c: V3 = [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
        let t = sub(q, p);
        const tn = dot(t, nn);
        t = unit([t[0] - tn * nn[0], t[1] - tn * nn[1], t[2] - tn * nn[2]]);
        return { c, n: nn, t, b: cross(nn, t) };
      };
      // 細い縁：最初の粒の中心から最後の粒の中心まで（両端は粒の中に隠れる）。外の端は粒の足もとと同じ所、内へ広がる
      if (m > 1 && hr > 0) {
        const a0 = start;
        const a1 = start + (m - 1) * d;
        const segs = Math.max(2, Math.ceil(((a1 - a0) / d) * 4));
        const rings: { p: V3; n: V3 }[][] = [];
        const axis: V3[] = [];
        const inward = Math.max(0, w - rAcross);
        for (let k = 0; k <= segs; k++) {
          const at = a0 + ((a1 - a0) * k) / segs;
          const f = frameAt(at);
          // 両端の粒 1 つ分で、縁を細くして面の下へしまう（端が四角く見えない）
          const e = Math.min(1, Math.min(at - a0, a1 - at) / d);
          const sc = 0.1 + 0.9 * e * e * (3 - 2 * e);
          const ra = rimA * sc;
          const rc = rimC * sc;
          // 腕の真ん中の向き（b か −b のうち、x が真ん中へ向かう方）
          const sgn = f.b[0] * -s >= 0 ? 1 : -1;
          const ctr: V3 = [f.c[0] - f.n[0] * rimSe + sgn * f.b[0] * inward, f.c[1] - f.n[1] * rimSe + sgn * f.b[1] * inward, f.c[2] - f.n[2] * rimSe + sgn * f.b[2] * inward];
          axis.push(ctr);
          const ring: { p: V3; n: V3 }[] = [];
          for (let i = 0; i < RIM_AROUND; i++) {
            const a = (i / RIM_AROUND) * Math.PI * 2;
            // 管のまわり：b と n の面の、幅 rimA・高さ rimC のだ円
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            const p: V3 = [ctr[0] + ra * ca * f.b[0] + rc * sa * f.n[0], ctr[1] + ra * ca * f.b[1] + rc * sa * f.n[1], ctr[2] + ra * ca * f.b[2] + rc * sa * f.n[2]];
            const nv = unit([(ca / ra) * f.b[0] + (sa / rc) * f.n[0], (ca / ra) * f.b[1] + (sa / rc) * f.n[1], (ca / ra) * f.b[2] + (sa / rc) * f.n[2]]);
            ring.push({ p, n: nv });
          }
          rings.push(ring);
        }
        // 管の側面（外向きの面になる順。t × 管のまわりの向きの微分 ＝ −外向き なので、逆に回す）
        for (let k = 0; k < segs; k++) {
          for (let i = 0; i < RIM_AROUND; i++) {
            const i2 = (i + 1) % RIM_AROUND;
            const p00 = rings[k][i];
            const p01 = rings[k][i2];
            const p10 = rings[k + 1][i];
            const p11 = rings[k + 1][i2];
            tri(p00.p, p11.p, p10.p, p00.n, p11.n, p10.n);
            tri(p00.p, p01.p, p11.p, p00.n, p01.n, p11.n);
          }
        }
        // 両端のふた
        const f0 = frameAt(a0);
        const f1 = frameAt(a1);
        const back: V3 = [-f0.t[0], -f0.t[1], -f0.t[2]];
        for (let i = 0; i < RIM_AROUND; i++) {
          const i2 = (i + 1) % RIM_AROUND;
          tri(axis[0], rings[0][i2].p, rings[0][i].p, back, back, back);
          tri(axis[segs], rings[segs][i].p, rings[segs][i2].p, f1.t, f1.t, f1.t);
        }
        volume += segA * (a1 - a0);
      }
      for (let b = 0; b < m; b++) {
        const f = frameAt(start + b * d);
        const ctr: V3 = [f.c[0] - f.n[0] * sink, f.c[1] - f.n[1] * sink, f.c[2] - f.n[2] * sink];
        for (const face of ICO.faces) {
          const vs = face.map((vi) => {
            const [vx, vy, vz] = ICO.verts[vi];
            // 縁を横切る向き（b）だけ ACROSS 倍に細い だ円の球（腕の横の面から出ない）
            const p: V3 = [ctr[0] + Rs * (vx * f.t[0] + ACROSS * vy * f.b[0] + vz * f.n[0]), ctr[1] + Rs * (vx * f.t[1] + ACROSS * vy * f.b[1] + vz * f.n[1]), ctr[2] + Rs * (vx * f.t[2] + ACROSS * vy * f.b[2] + vz * f.n[2])];
            const nv = unit([vx * f.t[0] + (vy / ACROSS) * f.b[0] + vz * f.n[0], vx * f.t[1] + (vy / ACROSS) * f.b[1] + vz * f.n[1], vx * f.t[2] + (vy / ACROSS) * f.b[2] + vz * f.n[2]]);
            return { p, n: nv };
          });
          tri(vs[0].p, vs[1].p, vs[2].p, vs[0].n, vs[1].n, vs[2].n);
        }
        centers.push(...ctr);
        count++;
        volume += beadV;
      }
    });
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), centers: new Float32Array(centers), count, beadMm: d, pitchMm: d, triangles: positions.length / 9, volumeMm3: volume };
}

// ---- 腕の面の、断面に沿った長さ（槌目と象嵌の模様を、腕の丸みで伸ばさないため） ----

/**
 * 腕の三角形の頂点ごとに、断面に沿って測った長さ（mm、いちばん上の真ん中から。+x の側が正）を返す。
 * 甲丸のように縁で面が立つ腕でも、幅の位置 x のかわりにこの長さで模様を並べれば、跡が縁でつぶれない（作者の声 2026-11-07：「腕の曲がりで伸ばさない」）。
 * 腕は、指のまわりの角度ごとに断面の点が並ぶ形（ロフト・回した形）。同じ角度の点を集め、断面の中の点のまわりの角度の順に並べて長さを足す。
 * 点の少ない所（石座の切りこみなど）は、その点のまわりの角度 × 距離 でおおよそを出す。
 * innerRadiusMm：指に当たる内側の半径（断面の中の点を、その少し外に置く）
 */
export function sectionArc(positions: ArrayLike<number>, innerRadiusMm: number): Float32Array {
  const nv = Math.floor(positions.length / 3);
  const out = new Float32Array(nv);
  const phi = new Float64Array(nv);
  const rr = new Float64Array(nv);
  let rMax = innerRadiusMm;
  for (let i = 0; i < nv; i++) {
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    phi[i] = Math.atan2(y, z);
    rr[i] = Math.hypot(y, z);
    rMax = Math.max(rMax, rr[i]);
  }
  // 断面の中の点：内側から、厚みの 0.35 の所（どの断面でも、外の面と横の面がこの点から見て角度の順に並ぶ）
  const cy0 = innerRadiusMm + 0.35 * Math.max(0.2, rMax - innerRadiusMm);
  const order = Array.from({ length: nv }, (_, i) => i).sort((a, b) => phi[a] - phi[b]);
  const rough = (i: number, cx: number, cy: number) => {
    const dx = positions[i * 3] - cx;
    const dr = rr[i] - cy;
    return Math.atan2(dx, dr) * Math.hypot(dx, dr);
  };
  let k = 0;
  while (k < nv) {
    // 同じ角度の点（2e-5 ラジアンより近い）
    let e = k + 1;
    while (e < nv && phi[order[e]] - phi[order[e - 1]] < 2e-5) e++;
    const idx = order.slice(k, e);
    // 重なった点を 1 つに
    const uniq = new Map<string, { x: number; r: number }>();
    for (const i of idx) uniq.set(`${positions[i * 3].toFixed(5)}_${rr[i].toFixed(5)}`, { x: positions[i * 3], r: rr[i] });
    const pts = [...uniq.values()];
    if (pts.length < 8) {
      for (const i of idx) out[i] = rough(i, 0, cy0);
    } else {
      let x0 = Infinity;
      let x1 = -Infinity;
      let r0 = Infinity;
      let r1 = -Infinity;
      for (const p of pts) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        r0 = Math.min(r0, p.r);
        r1 = Math.max(r1, p.r);
      }
      const cx = (x0 + x1) / 2;
      const cy = r0 + 0.35 * (r1 - r0);
      const ang = (p: { x: number; r: number }) => Math.atan2(p.x - cx, p.r - cy);
      pts.sort((a, b) => ang(a) - ang(b));
      const acc = [0];
      for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].r - pts[i - 1].r));
      // いちばん上の真ん中（角度 0）の長さ
      let s0 = 0;
      for (let i = 1; i < pts.length; i++) {
        const a0 = ang(pts[i - 1]);
        const a1 = ang(pts[i]);
        if (a0 <= 0 && a1 >= 0) {
          s0 = acc[i - 1] + (a1 > a0 ? ((0 - a0) / (a1 - a0)) * (acc[i] - acc[i - 1]) : 0);
          break;
        }
      }
      const at = new Map<string, number>();
      pts.forEach((p, i) => at.set(`${p.x.toFixed(5)}_${p.r.toFixed(5)}`, acc[i] - s0));
      for (const i of idx) out[i] = at.get(`${positions[i * 3].toFixed(5)}_${rr[i].toFixed(5)}`) ?? rough(i, cx, cy);
    }
    k = e;
  }
  return out;
}
