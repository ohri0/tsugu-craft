// 「この手順で作ると、どんな見た目になるか」の 2 つ目の計算：重ねない技。1 枚の板の表を、彫る・打つ・透かす・はめる・粒をつける・七宝を入れる。
// 画面に依存しない純粋な関数。重ねた層の模様（src/rebuild/pattern-sim.ts）とは別の考え方：
//   板の上の点ごとに、高さ（彫った深さ・打ち出した高さ・のせた粒）と、表の材料（地の金属・はめた金属・七宝）を、操作の順に重ねて決める。
//   絵は、その高さから面の向きを出し、左上からの光で陰と照りをつける（彫りや打ちの凹凸が、金属の光り方で見えるように）。
// 形の考え方だけの見込み（仮）。鏨の入り方・金属ののび・熱は計算しない。数はどれも仮（src/rebuild/pattern-values.ts）。
//
// 座標：x, y＝板の上の位置（板の幅を 1。見る所は板の全体）。高さは板の厚みを 1 とする（0＝もとの表）。
import { hexRgb, type Rgba } from "./pattern-sim";
import type { ColorKind } from "./pattern-sim";
import { PATTERN_COLORS, PATTERN_LIMITS, PATTERN_LOOK, PATTERN_METALS, RELIEF_VALUES, type MetalId } from "./pattern-values";

export type ReliefPath = "straight" | "wave" | "spiral" | "scatter" | "border";
export type EngraveStyle = "kebori" | "keribori" | "katakiri";

export type ReliefOp =
  /** 1 枚の板（地の金属）。最初に 1 回だけ */
  | { op: "plate"; metal: MetalId }
  /** 線を彫る。kebori＝細い V の線、keribori＝くさび形を連ねた線、katakiri＝片方だけ斜めに削いだ線 */
  | { op: "engrave"; style: EngraveStyle; path: ReliefPath; depth: number; size: number; across: number }
  /** 魚々子（ななこ）：小さな輪の鏨を打ち並べる */
  | { op: "nanako"; arrange: "rows" | "scatter"; size: number; across: number }
  /** 石目：細かな点をばらばらに打つ */
  | { op: "ishime"; size: number; across: number }
  /** 槌目：金槌の面の跡 */
  | { op: "tsuchime"; shape: "round" | "long"; depth: number; size: number }
  /** 透かし：形を切り抜く（後ろが見える） */
  | { op: "sukashi"; shape: "circles" | "petals" | "lattice" | "wave"; size: number; across: number }
  /** 打ち出し：裏から叩いて盛り上げる */
  | { op: "uchidashi"; shape: "bumps" | "ridges" | "wave"; height: number; size: number; across: number }
  /** 象嵌：溝やくぼみを彫り、別の金属をはめて平らに */
  | { op: "zogan"; metal: MetalId; path: ReliefPath | "dots"; size: number; across: number }
  /** 粒金：小さな粒をろう付けする */
  | { op: "granulate"; metal: MetalId; arrange: "cluster" | "line" | "border" | "scatter"; size: number; across: number }
  /** 七宝：線で区切った中に、色のガラスを入れて焼く */
  | { op: "shippo"; colors: MetalId[]; cells: "round" | "petal" | "hex"; size: number; across: number }
  /** 最後に色を出す */
  | { op: "color"; kind: ColorKind };

/** 板の上の 1 点の様子 */
export interface Pt {
  /** 表から彫った深さ（板の厚みに対して） */
  cut: number;
  /** 裏から打ち出して、板ごと上がった高さ */
  bend: number;
  /** 表にのせた物（粒）の高さ */
  add: number;
  /** のせた物の材料（materials の番号） */
  addMat: number;
  /** 表にはめた物（象嵌・七宝）の材料と、その深さ */
  fillMat: number;
  fill: number;
  /** 切り抜いた所 */
  hole: boolean;
  /** 七宝のガラス（照りが強い） */
  glass: boolean;
}

const fresh = (): Pt => ({ cut: 0, bend: 0, add: 0, addMat: 0, fillMat: 0, fill: 0, hole: false, glass: false });

export interface Relief {
  ops: ReliefOp[];
  /** 使う材料（0 番が地の金属） */
  materials: MetalId[];
  color: ColorKind;
  notes: string[];
  facts: string;
  seed: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampTo = (v: number, r: readonly [number, number]) => clamp(v, r[0], r[1]);

/** 決まった散らばり（同じ i, j, k, たねなら同じ 0〜1） */
function hash(i: number, j: number, k: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 974634469) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const jit = (i: number, j: number, k: number, seed: number) => 2 * hash(i, j, k, seed) - 1;

/** ふちがなめらかなくぼみの形（中心で 1、ふちで 0） */
function bowl(t: number): number {
  if (t >= 1) return 0;
  const s = 1 - t * t;
  return s * Math.sqrt(s);
}

/** 操作の並びから、計算の材料を作る。最初は plate であること */
export function buildRelief(ops: readonly ReliefOp[], seed = 7): Relief {
  const first = ops[0];
  if (!first || first.op !== "plate") throw new Error("最初の操作は plate（1 枚の板）にしてください");
  const materials: MetalId[] = [first.metal];
  let color: ColorKind = "none";
  const notes: string[] = [];
  for (const op of ops.slice(1)) {
    if (op.op === "plate") notes.push("板の操作が 2 回ありました。1 回目だけを使いました。");
    if ((op.op === "zogan" || op.op === "granulate") && !materials.includes(op.metal)) materials.push(op.metal);
    if (op.op === "shippo") for (const c of op.colors) if (!materials.includes(c)) materials.push(c);
    if (op.op === "color") color = op.kind;
  }
  const names = ops.slice(1).filter((o) => o.op !== "color");
  if (!names.length) notes.push("飾りの手順が無いので、平らな板のままです。");
  if (ops.some((o) => o.op === "sukashi")) notes.push("透かした所は、後ろの暗い地が見えるとして描きました。");
  if (ops.some((o) => o.op === "shippo")) notes.push("七宝の色は、絵のための色（仮）です。");
  if (color === "none" && (first.metal === "shakudo" || first.metal === "shibuichi")) notes.push("最後に色を出す手順が無いので、地の金属は磨いたままの色で描きました。");
  return { ops: [...ops], materials, color, notes, facts: `1 枚の板（${PATTERN_METALS[first.metal].name.replace(/（.*）/, "")}）に、${names.length} つの手順`, seed };
}

// ---- 線の道すじ ----

/** 点から、道すじの線までの距離。along＝線にそった位置、side＝線のどちら側か（＋−） */
export interface PathHit {
  d: number;
  along: number;
  side: number;
}

/** across 本の線（またはそれに当たる数）の道すじのうち、いちばん近い線。手で彫るので、線ごとに少しゆらぐ */
export function pathHit(path: ReliefPath, across: number, x: number, y: number, seed: number): PathHit {
  const n = Math.max(1, Math.round(across));
  const W = RELIEF_VALUES.hand;
  switch (path) {
    case "straight":
    case "wave": {
      const gap = 1 / n;
      const k0 = Math.floor(y / gap);
      let best: PathHit = { d: Infinity, along: x, side: 1 };
      for (let k = k0 - 1; k <= k0 + 1; k++) {
        const amp = path === "wave" ? 0.32 * gap : W * gap * 0.4;
        const f = path === "wave" ? 2 : 1 + hash(k, 0, 3, seed);
        const cy = (k + 0.5) * gap + W * gap * jit(k, 0, 1, seed) + amp * Math.sin(2 * Math.PI * (f * x + hash(k, 0, 2, seed)));
        const sd = y - cy;
        if (Math.abs(sd) < best.d) best = { d: Math.abs(sd), along: x, side: Math.sign(sd) || 1 };
      }
      return best;
    }
    case "border": {
      // 板のふちにそって、四角の枠の線を n 本
      const gap = RELIEF_VALUES.borderGap;
      const e = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5));
      let best: PathHit = { d: Infinity, along: 0, side: 1 };
      for (let k = 0; k < n; k++) {
        const r = 0.5 - RELIEF_VALUES.borderInset - k * gap;
        const sd = r - e;
        if (Math.abs(sd) < best.d) best = { d: Math.abs(sd), along: Math.abs(x - 0.5) > Math.abs(y - 0.5) ? y : x, side: Math.sign(sd) || 1 };
      }
      return best;
    }
    case "spiral": {
      // 真ん中からの渦（n 巻き）
      const dx = x - 0.5;
      const dy = y - 0.5;
      const r = Math.hypot(dx, dy);
      const gap = 0.46 / n;
      const th = Math.atan2(dy, dx) / (2 * Math.PI) + 0.5;
      const t = r / gap - th;
      const k = Math.round(t);
      const sd = (t - k) * gap;
      if (r > 0.47 + gap / 2) return { d: Infinity, along: 0, side: 1 };
      return { d: Math.abs(sd), along: (k + th) * 2 * Math.PI * r, side: Math.sign(sd) || 1 };
    }
    case "scatter": {
      // 短い線を、ばらばらの向きに散らす（草の葉や雨のように）
      const cell = 1 / n;
      const i0 = Math.floor(x / cell);
      const j0 = Math.floor(y / cell);
      let best: PathHit = { d: Infinity, along: 0, side: 1 };
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          const cx = (i + 0.5 + 0.35 * jit(i, j, 4, seed)) * cell;
          const cy = (j + 0.5 + 0.35 * jit(i, j, 5, seed)) * cell;
          const a = Math.PI * (0.15 + 0.4 * hash(i, j, 6, seed));
          const half = cell * (0.28 + 0.18 * hash(i, j, 7, seed));
          const ux = Math.cos(a);
          const uy = Math.sin(a);
          const px = x - cx;
          const py = y - cy;
          const t = clamp(px * ux + py * uy, -half, half);
          const sd = -px * uy + py * ux;
          const d = Math.hypot(px - t * ux, py - t * uy);
          if (d < best.d) best = { d, along: t + half, side: Math.sign(sd) || 1 };
        }
      }
      return best;
    }
  }
}

// ---- 1 点の様子 ----

/** 格子に並んだ点（1 列おきに半分ずらす）。jitter は間かくに対して */
function nearestGrid(x: number, y: number, n: number, jitter: number, seed: number, k: number, stagger = true): { d: number; dx: number; dy: number; i: number; j: number } {
  const a = 1 / n;
  const i0 = Math.floor(x / a);
  const j0 = Math.floor(y / a);
  let best = { d: Infinity, dx: 0, dy: 0, i: 0, j: 0 };
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      const cx = (i + 0.5 + (stagger && j % 2 !== 0 ? 0.5 : 0) + jitter * jit(i, j, k, seed)) * a;
      const cy = (j + 0.5 + jitter * jit(i, j, k + 1, seed)) * a;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d < best.d) best = { d, dx, dy, i, j };
    }
  }
  return best;
}

/** 板のふちからの近さ（透かしを、ふちの近くに開けない） */
const rim = (x: number, y: number) => Math.min(x, y, 1 - x, 1 - y);

/** 操作の並びのとおりに、点 (x, y) の様子を決める */
export function pointAt(r: Relief, x: number, y: number): Pt {
  const p = fresh();
  const V = RELIEF_VALUES;
  for (const [idx, op] of r.ops.entries()) {
    const seed = r.seed + 7919 * (idx + 1);
    switch (op.op) {
      case "engrave": {
        const w = clampTo(op.size, PATTERN_LIMITS.size) * V.lineScale;
        const depth = clampTo(op.depth, PATTERN_LIMITS.depth);
        const h = pathHit(op.path, clampTo(op.across, PATTERN_LIMITS.across), x, y, seed);
        let c = 0;
        if (op.style === "kebori") {
          if (h.d < w) c = depth * (1 - h.d / w);
        } else if (op.style === "keribori") {
          // くさびを連ねる：一打ちごとに、太い所から細くなる
          const L = w * V.keriLength;
          const ph = h.along / L - Math.floor(h.along / L);
          const we = w * (1.25 - 0.95 * ph);
          if (ph < 0.9 && h.d < we) c = depth * (1 - h.d / we) * (0.6 + 0.4 * (1 - ph));
        } else {
          // 片切彫り：片方は立った壁、もう片方はなだらかに浅くなる
          const sd = h.side * h.d;
          const wall = w * 0.18;
          if (sd >= 0 && sd < w * 1.6) c = depth * (1 - sd / (w * 1.6));
          else if (sd < 0 && sd > -wall) c = depth * (1 + sd / wall);
        }
        if (c > 0) {
          p.cut = Math.max(p.cut, c);
          if (p.fill && c > 0.02) p.fill = Math.max(0, p.fill - c);
        }
        break;
      }
      case "nanako": {
        const n = clampTo(op.across, PATTERN_LIMITS.across) * V.nanakoScale;
        const g = nearestGrid(x, y, n, op.arrange === "rows" ? V.nanakoJitter : 0.32, seed, 1);
        const R = Math.min(0.48 / n, clampTo(op.size, PATTERN_LIMITS.size) * V.punchScale);
        const t = g.d / R;
        if (t < 1.15) {
          // 輪の溝と、真ん中に残る小さな粒
          const ring = Math.exp(-(((t - 0.78) / 0.16) ** 2));
          const dome = t < 0.6 ? 0.05 * (1 - (t / 0.6) ** 2) : 0;
          p.cut = Math.max(0, p.cut + V.nanakoDepth * ring - dome);
        }
        break;
      }
      case "ishime": {
        const n = clampTo(op.across, PATTERN_LIMITS.across) * V.ishimeScale;
        const g = nearestGrid(x, y, n, 0.45, seed, 3, false);
        const R = clampTo(op.size, PATTERN_LIMITS.size) * V.punchScale * (0.6 + 0.8 * hash(g.i, g.j, 9, seed));
        if (g.d < R) p.cut = Math.max(p.cut, V.ishimeDepth * bowl(g.d / R) * (0.6 + 0.4 * hash(g.i, g.j, 10, seed)));
        break;
      }
      case "tsuchime": {
        // 金槌の面の跡：となり合う丸いくぼみ。くぼみの間が、細い稜線になる
        const s = clampTo(op.size, PATTERN_LIMITS.size) * V.hammerScale;
        const sx = op.shape === "long" ? 0.45 : 1;
        const g = nearestGrid(x * sx, y, 1 / s, 0.38, seed, 5);
        const d = Math.hypot(g.dx / sx, g.dy) / s;
        p.cut += clampTo(op.depth, PATTERN_LIMITS.depth) * V.hammerDepth * Math.max(0, 1 - d * d * 0.9);
        break;
      }
      case "sukashi": {
        const n = clampTo(op.across, PATTERN_LIMITS.across);
        const R = clampTo(op.size, PATTERN_LIMITS.size);
        if (rim(x, y) < V.pierceRim) break;
        let hole = false;
        if (op.shape === "lattice") {
          const u = ((x + y) * n) / Math.SQRT2;
          const v = ((x - y) * n) / Math.SQRT2;
          const bar = clamp(0.5 - R * n, 0.08, 0.42);
          hole = Math.abs(u - Math.floor(u) - 0.5) < 0.5 - bar && Math.abs(v - Math.floor(v) - 0.5) < 0.5 - bar;
        } else if (op.shape === "wave") {
          const gap = 1 / n;
          const k = Math.floor(y / gap);
          const cy = (k + 0.5) * gap + 0.25 * gap * Math.sin(2 * Math.PI * (2 * x + hash(k, 0, 2, seed)));
          hole = Math.abs(y - cy) < Math.min(R, gap * 0.3) && rim(x, y) > V.pierceRim + 0.04;
        } else {
          const g = nearestGrid(x, y, n, 0.06, seed, 7);
          const a = Math.atan2(g.dy, g.dx) + hash(g.i, g.j, 8, seed);
          const rr = op.shape === "petals" ? R * (0.45 + 0.55 * Math.abs(Math.cos(2.5 * a))) : R;
          hole = g.d < Math.min(rr, 0.45 / n);
        }
        if (hole) p.hole = true;
        break;
      }
      case "uchidashi": {
        const n = clampTo(op.across, PATTERN_LIMITS.across);
        const H = clampTo(op.height, PATTERN_LIMITS.depth) * V.reliefHeight;
        const s = clampTo(op.size, PATTERN_LIMITS.size);
        let b = 0;
        if (op.shape === "bumps") {
          const g = nearestGrid(x, y, n, 0.12, seed, 11);
          b = Math.exp(-((g.d / s) ** 2));
        } else if (op.shape === "ridges") {
          const t = (y * n) % 1;
          b = Math.exp(-(((t - 0.5) / (s * n)) ** 2));
        } else b = 0.5 + 0.5 * Math.sin(2 * Math.PI * (n * y + 0.4 * Math.sin(2 * Math.PI * x)));
        // ふちは平らに残す
        p.bend += H * b * Math.min(1, rim(x, y) / 0.08);
        break;
      }
      case "zogan": {
        const w = clampTo(op.size, PATTERN_LIMITS.size) * V.lineScale;
        const n = clampTo(op.across, PATTERN_LIMITS.across);
        let inside = false;
        if (op.path === "dots") inside = nearestGrid(x, y, n, 0.08, seed, 13).d < Math.min(w * 2.2, 0.45 / n);
        else inside = pathHit(op.path, n, x, y, seed).d < w;
        if (inside && !p.hole) {
          p.fillMat = r.materials.indexOf(op.metal);
          p.fill = V.inlayDepth;
          p.cut = 0;
          p.glass = false;
        }
        break;
      }
      case "granulate": {
        const R = clampTo(op.size, PATTERN_LIMITS.size) * V.grainScale;
        const n = clampTo(op.across, PATTERN_LIMITS.across);
        let d = Infinity;
        if (op.arrange === "cluster") {
          // 7 つの粒を寄せた房を、格子に
          const g = nearestGrid(x, y, n, 0.1, seed, 15);
          for (let k = -1; k < 6; k++) {
            const a = (k * Math.PI) / 3;
            const ox = k < 0 ? 0 : 2 * R * Math.cos(a);
            const oy = k < 0 ? 0 : 2 * R * Math.sin(a);
            d = Math.min(d, Math.hypot(g.dx - ox, g.dy - oy));
          }
        } else if (op.arrange === "scatter") d = nearestGrid(x, y, n, 0.4, seed, 17, false).d;
        else {
          const h = pathHit(op.arrange === "line" ? "straight" : "border", n, x, y, seed);
          const t = h.along / (2 * R);
          d = Math.hypot(h.d, (t - Math.round(t)) * 2 * R);
        }
        if (d < R && !p.hole) {
          const a = Math.sqrt(R * R - d * d) * V.grainHeight;
          if (a > p.add) {
            p.add = a;
            p.addMat = r.materials.indexOf(op.metal);
          }
        }
        break;
      }
      case "shippo": {
        const n = clampTo(op.across, PATTERN_LIMITS.across);
        const g = nearestGrid(x, y, n, op.cells === "hex" ? 0 : 0.05, seed, 19);
        const a = 1 / n;
        let e: number;
        if (op.cells === "petal") {
          const ang = Math.atan2(g.dy, g.dx);
          e = g.d / (a * 0.5 * (0.6 + 0.4 * Math.abs(Math.cos(3 * ang))));
        } else e = g.d / (a * (op.cells === "hex" ? 0.577 : 0.5));
        const wire = V.wire / a;
        if (p.hole) break;
        if (e < 1 - wire) {
          const cols: MetalId[] = op.colors.length ? op.colors : ["enamel_blue"];
          p.fillMat = r.materials.indexOf(cols[Math.floor(hash(g.i, g.j, 21, seed) * cols.length) % cols.length]);
          p.fill = V.enamelDepth;
          p.cut = 0;
          p.glass = true;
          // 焼いたガラスは、わずかに丸く盛り上がる
          p.add = Math.max(p.add, 0.04 * (1 - e * e));
          p.addMat = p.fillMat;
        } else if (e < 1 + wire * 0.2) {
          p.cut = 0;
          p.add = Math.max(p.add, 0.05);
          p.addMat = 0;
        } else {
          // 線の外の地も、少し彫りくぼめてある
          p.cut = Math.max(p.cut, 0.0);
        }
        break;
      }
      default:
        break;
    }
  }
  return p;
}

/** 表の高さ（板の厚みを 1。もとの表が 0） */
export const heightOf = (p: Pt) => p.bend - p.cut + p.add;

/** 表に見える材料の番号 */
export const topMat = (p: Pt) => (p.add > 0.001 ? p.addMat : p.fill > 0 ? p.fillMat : 0);

/** 材料ごとの色（r, g, b） */
export function reliefColors(r: Relief): [number, number, number][] {
  return r.materials.map((m) => hexRgb(PATTERN_METALS[m][r.color === "none" ? "raw" : r.color]));
}

// ---- 絵 ----

/** 決まった細かいざらつき（-1〜1） */
function grain(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 1023) / 1023 - 0.5) * 2;
}

/** 断面を切る行（上から 0〜1）。表の高さと材料が、いちばん多く変わる所 */
export function reliefSectionRow(r: Relief): number {
  let best = 0.5;
  let bestScore = -1;
  for (let k = 0; k <= 24; k++) {
    const row = 0.25 + (0.5 * k) / 24;
    let score = 0;
    let last: Pt | null = null;
    for (let i = 0; i < 120; i++) {
      const p = pointAt(r, (i + 0.5) / 120, row);
      if (last && (topMat(p) !== topMat(last) || p.hole !== last.hole || Math.abs(heightOf(p) - heightOf(last)) > 0.02)) score++;
      last = p;
    }
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

/**
 * 上から見た面の絵（n × n）。高さから面の向きを出し、左上からの光で陰と照りをつける。透かした所は、後ろの暗い地と、落ちる影。
 * band で、上から band[0]〜band[1] の帯だけを描く。
 */
export async function reliefTopAsync(
  r: Relief,
  n: number,
  ss: number,
  pause: () => Promise<void>,
  stop: () => boolean = () => false,
  band: readonly [number, number] = [0, 1],
): Promise<Rgba | null> {
  const N = n * ss;
  const j0 = Math.max(0, Math.min(n - 1, Math.floor(band[0] * n)));
  const j1 = Math.max(j0 + 1, Math.min(n, Math.ceil(band[1] * n)));
  const J0 = Math.max(0, j0 * ss - 2);
  const J1 = Math.min(N, j1 * ss + 2);
  const rowsN = J1 - J0;
  const H = new Float32Array(N * rowsN);
  const M = new Uint8Array(N * rowsN);
  const G = new Uint8Array(N * rowsN);
  const HOLE = 255;
  const chunk = Math.max(4, Math.round(16000 / N));
  for (let J = J0; J < J1; J++) {
    for (let I = 0; I < N; I++) {
      const p = pointAt(r, (I + 0.5) / N, (J + 0.5) / N);
      const o = (J - J0) * N + I;
      H[o] = heightOf(p);
      M[o] = p.hole ? HOLE : topMat(p);
      G[o] = p.glass && p.add > 0.001 ? 1 : 0;
    }
    if ((J - J0) % chunk === chunk - 1) {
      await pause();
      if (stop()) return null;
    }
  }
  const cols = reliefColors(r);
  const bg = hexRgb(PATTERN_COLORS.air);
  const L = PATTERN_LOOK;
  // 高さ（板の厚み）を、板の幅の割合に直す。厚みは幅のおよそ 1/30（仮）
  const zs = RELIEF_VALUES.thickness * N;
  const lx = -0.55;
  const ly = -0.6;
  const lz = 0.58;
  const rows = j1 - j0;
  const data = new Uint8ClampedArray(n * rows * 4);
  const at = (I: number, J: number) => {
    const ii = clamp(I, 0, N - 1);
    const jj = clamp(J, J0, J1 - 1) - J0;
    return jj * N + ii;
  };
  const sh = Math.max(1, Math.round(RELIEF_VALUES.shadow * N));
  for (let j = j0; j < j1; j++) {
    for (let i = 0; i < n; i++) {
      let R = 0;
      let Gc = 0;
      let B = 0;
      for (let dj = 0; dj < ss; dj++) {
        for (let di = 0; di < ss; di++) {
          const I = i * ss + di;
          const J = j * ss + dj;
          const o = at(I, J);
          if (M[o] === HOLE) {
            // 透かしの中：暗い地。左上のふちの近くは、板の影でさらに暗く
            const shade = M[at(I - sh, J - sh)] !== HOLE ? 0.55 : 1;
            R += bg[0] * shade;
            Gc += bg[1] * shade;
            B += bg[2] * shade;
            continue;
          }
          const hx = (H[at(I + 1, J)] - H[at(I - 1, J)]) * 0.5 * zs;
          const hy = (H[at(I, J + 1)] - H[at(I, J - 1)]) * 0.5 * zs;
          // 面の向き（-hx, -hy, 1）と光
          const nl = 1 / Math.hypot(hx, hy, 1);
          const ndl = (-hx * lx - hy * ly + lz) * nl;
          const diff = Math.max(0, ndl);
          // 照り（真上から見る）
          const hz = lz + 1;
          const hl = 1 / Math.hypot(lx, ly, hz);
          const ndh = Math.max(0, (-hx * lx - hy * ly + hz) * nl * hl);
          const glass = G[o] === 1;
          const spec = Math.pow(ndh, glass ? 60 : 18) * (glass ? 0.55 : 0.32);
          const c = cols[M[o]];
          const f = 0.42 + 0.78 * diff;
          R += c[0] * f + 255 * spec;
          Gc += c[1] * f + 255 * spec;
          B += c[2] * f + 250 * spec;
        }
      }
      const k = ss * ss;
      const x = (i + 0.5) / n;
      const y = (j + 0.5) / n;
      const t = (x + y) / 2;
      let f = t < 0.5 ? 1 + L.light * (1 - 2 * t) : 1 - L.shadow * (2 * t - 1);
      f *= 1 + L.grain * grain(i, j);
      const q = 4 * ((j - j0) * n + i);
      data[q] = (R / k) * f;
      data[q + 1] = (Gc / k) * f;
      data[q + 2] = (B / k) * f;
      data[q + 3] = 255;
    }
  }
  return { w: n, h: rows, data };
}

/** 断面の絵（w × h）。板の厚みを高さの半分ほどに大きくして描く。上が表。空気は透明 */
export function reliefSectionImage(r: Relief, w: number, h: number, row = 0.5, ss = 2): Rgba {
  const W = w * ss;
  const Hh = h * ss;
  const cols = reliefColors(r);
  const data = new Uint8ClampedArray(w * h * 4);
  const pts: Pt[] = [];
  for (let I = 0; I < W; I++) pts.push(pointAt(r, (I + 0.5) / W, row));
  // 厚み 1 を、絵の高さの何割にするか。打ち出しと粒の高さまで、絵におさまるように
  let lo = 0;
  let hi = 1;
  for (const p of pts) {
    lo = Math.min(lo, p.bend);
    hi = Math.max(hi, 1 + p.bend + p.add);
  }
  const T = Math.min(Hh * 0.46, (Hh * 0.8) / (hi - lo));
  const base = Hh / 2 + (T * (lo + hi)) / 2;
  const acc = new Float32Array(w * h * 4);
  for (let I = 0; I < W; I++) {
    const p = pts[I];
    if (p.hole) continue;
    const top = base - T * (1 + p.bend - p.cut);
    const bottom = base - T * p.bend;
    const surf = base - T * (1 + p.bend);
    for (let J = 0; J < Hh; J++) {
      const yc = J + 0.5;
      let m = -1;
      let rimLight = 1;
      if (p.add > 0.001 && yc >= top - T * p.add && yc < top) m = p.addMat;
      else if (yc >= top && yc < bottom) {
        m = p.fill > 0 && yc < surf + T * p.fill ? p.fillMat : 0;
        if (yc < top + 1.5 * ss) rimLight = 1.2;
      }
      if (m < 0) continue;
      const c = cols[m];
      const f = (1.05 - 0.12 * (J / Hh)) * rimLight;
      const o = 4 * (Math.floor(J / ss) * w + Math.floor(I / ss));
      acc[o] += c[0] * f;
      acc[o + 1] += c[1] * f;
      acc[o + 2] += c[2] * f;
      acc[o + 3] += 1;
    }
  }
  for (let i = 0; i < w * h; i++) {
    const m = acc[4 * i + 3];
    if (!m) continue;
    const g = 1 + 0.03 * grain(i % w, Math.floor(i / w));
    data[4 * i] = (acc[4 * i] / m) * g;
    data[4 * i + 1] = (acc[4 * i + 1] / m) * g;
    data[4 * i + 2] = (acc[4 * i + 2] / m) * g;
    data[4 * i + 3] = Math.round((255 * m) / (ss * ss));
  }
  return { w, h, data };
}
