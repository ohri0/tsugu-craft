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
import { flowerBump, layerCoordOf, layerEdges, leafBump, nearestSpot, spotsFor, type SpotOpts } from "./pattern-spots";

export type ReliefPath = "straight" | "wave" | "spiral" | "scatter" | "border" | "scroll" | "coils";
/** 彫る線だけの道すじ：outline＝前に打ち出した帯・ふくらみのふち（高さの半分の所）にそった線（2026-11-08：打ち出した波のふちを線鏨で締める技のため） */
export type EngravePath = ReliefPath | "outline";
export type EngraveStyle = "kebori" | "keribori" | "katakiri";

export type ReliefOp =
  /**
   * 1 枚の板（地の金属）。最初に 1 回だけ。under があれば、色のちがう金属を重ねてつないだ板（metal が表の層、under はその下の層を上から順に。
   * thickness が無ければ、どの層も同じ厚さとして描く）。彫った・打った深さで、下の層の色が出る（2026-11-07 夜：重ねた板の表を彫る技のため）。
   * thickness＝層の厚さの割合（表の層から順に。2026-11-08：赤銅を薄めにする案のように、層ごとの厚さを変えるため）
   */
  | { op: "plate"; metal: MetalId; under?: MetalId[]; thickness?: number[] }
  /** 線を彫る。kebori＝細い V の線、keribori＝くさび形を連ねた線、katakiri＝片方だけ斜めに削いだ線 */
  | { op: "engrave"; style: EngraveStyle; path: EngravePath; depth: number; size: number; across: number }
  /** 魚々子（ななこ）：小さな輪の鏨を打ち並べる */
  | { op: "nanako"; arrange: "rows" | "scatter"; size: number; across: number }
  /** 石目：細かな点をばらばらに打つ */
  | { op: "ishime"; size: number; across: number }
  /** 槌目：金槌の面の跡 */
  | { op: "tsuchime"; shape: "round" | "long"; depth: number; size: number }
  /**
   * 透かし：形を切り抜く（後ろが見える）。ground＝地を全部抜き、のせた線・粒・七宝と、ふちの枠だけを残す（より線の透かし細工など。手順の順によらず、最後に抜く）。
   * count（このあとの count も同じ）＝並べる・散らす物を、板全体でちょうどこの数にする（無いか 0 なら、幅の中に across の格子。板全体では across の 2 乗）
   */
  | { op: "sukashi"; shape: "circles" | "petals" | "lattice" | "wave" | "ground"; size: number; across: number; count?: number }
  /** 打ち出し：裏から叩いて盛り上げる */
  | { op: "uchidashi"; shape: "bumps" | "ridges" | "wave" | "petals" | "leaves"; height: number; size: number; across: number; count?: number }
  /** 象嵌：溝やくぼみを彫り、別の金属をはめて平らに */
  | { op: "zogan"; metal: MetalId; path: ReliefPath | "dots" | "pits"; size: number; across: number; count?: number }
  /**
   * 粒金：小さな粒をろう付けする。wave・spiral・scroll・coils は、線の道すじにそって粒を詰めて並べ、より線（細い線を 2 本よったもの）のように描く
   * （上から見たより線は、斜めに並んだ粒の列に見える。線金・より線の細工のため）
   */
  | { op: "granulate"; metal: MetalId; arrange: "cluster" | "line" | "border" | "scatter" | "wave" | "spiral" | "scroll" | "coils"; size: number; across: number; count?: number }
  /** 七宝：線で区切った中に、色のガラスを入れて焼く。wire は区切りの線の金属（なければ地の金属） */
  | { op: "shippo"; colors: MetalId[]; cells: "round" | "petal" | "hex"; size: number; across: number; wire?: MetalId; count?: number }
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
  /** 使う材料（0 番が地の金属。重ねた板なら表の層） */
  materials: MetalId[];
  /** 重ねた板の層の材料の番号（上から。1 枚の金属なら [0]） */
  layers: number[];
  /** 層の厚さを変えたときの、層のさかいの深さ（0 から 1 まで、層の数 + 1 個）。同じ厚さなら無い */
  edges?: number[];
  color: ColorKind;
  notes: string[];
  facts: string;
  seed: number;
  /** 計算の途中で覚えておく答え（散らした草の株を置く所）。同じ板なら同じ */
  cache?: Map<string, number>;
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
  const add = (m: MetalId) => {
    if (!materials.includes(m)) materials.push(m);
    return materials.indexOf(m);
  };
  const layers = [0, ...(first.under ?? []).slice(0, PATTERN_LIMITS.metals[1] - 1).map(add)];
  const edges = layerEdges(first.thickness, layers.length);
  let color: ColorKind = "none";
  const notes: string[] = [];
  for (const op of ops.slice(1)) {
    if (op.op === "plate") notes.push("板の操作が 2 回ありました。1 回目だけを使いました。");
    if (op.op === "zogan" || op.op === "granulate") add(op.metal);
    if (op.op === "shippo") {
      for (const c of op.colors) add(c);
      if (op.wire) add(op.wire);
    }
    if (op.op === "color") color = op.kind;
  }
  const names = ops.slice(1).filter((o) => o.op !== "color");
  if (!names.length) notes.push("飾りの手順が無いので、平らな板のままです。");
  if (ops.some((o) => o.op === "sukashi")) notes.push("透かした所は、後ろの暗い地が見えるとして描きました。");
  if (layers.length > 1)
    notes.push(
      edges
        ? `重ねた板の ${layers.length} つの層は、厚さの割合 ${first.thickness!.slice(0, layers.length).map(fmt).join(":")}（仮）として描きました。彫った深さで下の層の色が出ます。`
        : `重ねた板の ${layers.length} つの層は、同じ厚さ（仮）として描きました。彫った深さで下の層の色が出ます。`,
    );
  ops.forEach((o, i) => {
    if (o.op === "engrave" && o.path === "outline" && !ops.slice(1, i).some((q) => q.op === "uchidashi"))
      notes.push("打ち出しのふちにそう線は、その前に打ち出す手順が無いので、彫らずに描きました。");
  });
  if (ops.some((o) => o.op === "shippo")) notes.push("七宝の色は、絵のための色（仮）です。");
  if (ops.some((o) => o.op === "granulate" && clampTo(o.size, PATTERN_LIMITS.size) * RELIEF_VALUES.grainScale > ropeMax(o.arrange, clampTo(o.across, PATTERN_LIMITS.across))))
    notes.push("線にそってつけた粒（より線）が太く、となりの線と重なるので、線の間にすき間が残る太さまで細くして描きました。");
  if (color === "none" && (first.metal === "shakudo" || first.metal === "shibuichi")) notes.push("最後に色を出す手順が無いので、地の金属は磨いたままの色で描きました。");
  const plateName = layers.map((k) => PATTERN_METALS[materials[k]].name.replace(/（.*）/, "")).join("・");
  return { ops: [...ops], materials, layers, ...(edges ? { edges } : {}), color, notes, facts: `${layers.length > 1 ? `重ねた板（上から${plateName}）` : `1 枚の板（${plateName}）`}に、${names.length} つの手順`, seed };
}

// ---- 線の道すじ ----

/** 点から、道すじの線までの距離。along＝線にそった位置、side＝線のどちら側か（＋−）、(nx, ny)＝side が＋の側を向く向き、wf＝その所の線の太さの割合（先が細い線） */
export interface PathHit {
  d: number;
  along: number;
  side: number;
  nx: number;
  ny: number;
  wf: number;
}

const MISS: PathHit = { d: Infinity, along: 0, side: 1, nx: 0, ny: 1, wf: 1 };

/**
 * 先が細くなる、少し曲がった一筆（草の葉・唐草の葉）。根元 (bx, by) から、向き a に長さ L。bend＝先の横のずれ（長さに対して）。
 * 根元がいちばん太く、先でとがる
 */
function bladeHit(x: number, y: number, bx: number, by: number, a: number, L: number, bend: number, along0 = 0): PathHit {
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const px = x - bx;
  const py = y - by;
  const l = px * ux + py * uy;
  const t = clamp(l / L, 0, 1);
  const c = bend * L * t * t;
  const q = -px * uy + py * ux - c;
  // 曲がった線の向き（t での接線）に直した法線
  const slope = 2 * bend * t;
  const k = 1 / Math.hypot(1, slope);
  const nx = (-uy - slope * ux) * k;
  const ny = (ux - slope * uy) * k;
  const out = l < 0 ? -l : l > L ? l - L : 0;
  const d = Math.hypot(q * k, out);
  return { d, along: along0 + t * L, side: Math.sign(q) || 1, nx, ny, wf: Math.pow(1 - t, 0.75) * Math.min(1, 0.35 + t * 6) };
}

const nearer = (a: PathHit, b: PathHit) => (b.d < a.d ? b : a);

/** 唐草の 1 列（つるの波・巻いた先・葉）。u, v は列の中の位置（列の高さを 1）。g は列の高さ（距離をもとの大きさにもどす） */
function scrollHit(u: number, v: number, k: number, g: number, seed: number): PathHit {
  const S = RELIEF_VALUES.scroll;
  const w = (2 * Math.PI) / S.period;
  const A = S.amp;
  // つる：ゆるい波（列ごとに少し位相をずらす）
  const p0 = 2 * Math.PI * hash(k, 0, 31, seed);
  const f = A * Math.sin(w * u + p0);
  const fd = A * w * Math.cos(w * u + p0);
  const kk = 1 / Math.hypot(1, fd);
  let best: PathHit = { d: Math.abs(v - f) * kk * g, along: u * g, side: Math.sign(v - f) || 1, nx: -fd * kk, ny: kk, wf: 1 };
  const turns = S.turns * 2 * Math.PI;
  const m0 = Math.floor((w * u + p0 - Math.PI / 2) / Math.PI);
  for (let m = m0 - 1; m <= m0 + 1; m++) {
    // 波の山（谷）の頂
    const um = (Math.PI / 2 + m * Math.PI - p0) / w;
    const s = ((m % 2) + 2) % 2 === 0 ? 1 : -1;
    const vm = s * A;
    // 渦：頂で、つると同じ向きに出て、外へ巻きながら細くなる
    const R0 = S.curl;
    const cx = um;
    const cy = vm + s * R0;
    const du = u - cx;
    const dv = v - cy;
    const r = Math.hypot(du, dv);
    const th0 = (-s * Math.PI) / 2;
    let base = (s * (Math.atan2(dv, du) - th0)) % (2 * Math.PI);
    if (base < 0) base += 2 * Math.PI;
    for (let q = 0; q < 2; q++) {
      const phi = base + 2 * Math.PI * q;
      if (phi > turns) break;
      const rr = R0 * (1 - (0.8 * phi) / turns);
      const sd = r - rr;
      const d = Math.abs(sd) * g;
      if (d < best.d) {
        best = { d, along: R0 * phi * g, side: Math.sign(sd) || 1, nx: r > 1e-9 ? du / r : 0, ny: r > 1e-9 ? dv / r : 1, wf: 1 - (0.65 * phi) / turns };
      }
    }
    // 葉：つるの節（頂と次の谷の間）から、前へ、渦と同じ側へ
    const uz = um + S.period / 4;
    const vz = A * Math.sin(w * uz + p0);
    const slope = Math.atan(A * w * Math.cos(w * uz + p0));
    const leaf = bladeHit(u, v, uz, vz, slope + s * S.leafAngle, S.leaf, s * 0.3);
    const t = clamp(leaf.along / S.leaf, 0, 1);
    // 葉は、根元と先が細く、真ん中が太い
    leaf.wf = S.leafWidth * 2.6 * Math.sqrt(t) * (1 - t);
    leaf.d *= g;
    leaf.along *= g;
    best = nearer(best, leaf);
  }
  return best;
}

/** 横に流れる線（まっすぐ・波）の、点に近い 3 本それぞれ（上・同じ列・下）。打ち出しの波の帯は、3 本の帯を足して、帯の重なりに折れ目を作らない */
export function rowHits(path: "straight" | "wave", across: number, x: number, y: number, seed: number): PathHit[] {
  const n = Math.max(1, Math.round(across));
  const W = RELIEF_VALUES.hand;
  const gap = 1 / n;
  const k0 = Math.floor(y / gap);
  const out: PathHit[] = [];
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const amp = path === "wave" ? 0.32 * gap : W * gap * 0.4;
    const f = path === "wave" ? 2 : 1 + hash(k, 0, 3, seed);
    const arg = 2 * Math.PI * (f * x + hash(k, 0, 2, seed));
    const cy = (k + 0.5) * gap + W * gap * jit(k, 0, 1, seed) + amp * Math.sin(arg);
    const fd = amp * 2 * Math.PI * f * Math.cos(arg);
    const kk = 1 / Math.hypot(1, fd);
    const sd = y - cy;
    out.push({ d: Math.abs(sd) * kk, along: x, side: Math.sign(sd) || 1, nx: -fd * kk, ny: kk, wf: 1 });
  }
  return out;
}

/** across 本の線（またはそれに当たる数）の道すじのうち、いちばん近い線。手で彫るので、線ごとに少しゆらぐ */
export function pathHit(path: ReliefPath, across: number, x: number, y: number, seed: number): PathHit {
  const n = Math.max(1, Math.round(across));
  switch (path) {
    case "straight":
    case "wave": {
      let best: PathHit = MISS;
      for (const h of rowHits(path, n, x, y, seed)) if (h.d < best.d) best = h;
      return best;
    }
    case "border": {
      // 板のふちにそって、四角の枠の線を n 本
      const gap = RELIEF_VALUES.borderGap;
      const ex = Math.abs(x - 0.5);
      const ey = Math.abs(y - 0.5);
      const e = Math.max(ex, ey);
      // side が＋＝枠の内側。その向き
      const nx = ex > ey ? -Math.sign(x - 0.5) : 0;
      const ny = ex > ey ? 0 : -Math.sign(y - 0.5);
      let best: PathHit = MISS;
      for (let k = 0; k < n; k++) {
        const r = 0.5 - RELIEF_VALUES.borderInset - k * gap;
        const sd = r - e;
        if (Math.abs(sd) < best.d) best = { d: Math.abs(sd), along: ex > ey ? y : x, side: Math.sign(sd) || 1, nx, ny, wf: 1 };
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
      if (r > 0.47 + gap / 2) return MISS;
      return { d: Math.abs(sd), along: (k + th) * 2 * Math.PI * r, side: Math.sign(sd) || 1, nx: r > 1e-9 ? dx / r : 0, ny: r > 1e-9 ? dy / r : 1, wf: 1 };
    }
    case "coils": {
      // 小さな渦（2 巻き）を、n × n に互い違いに並べる（より線の渦を並べた透かし細工など）。渦ごとに巻きはじめの向きを変える
      const cell = 1 / n;
      const g = nearestGrid(x, y, n, 0, seed, 41);
      const R = RELIEF_VALUES.coil * cell;
      const gap = R / 2;
      if (g.d > R + gap / 2) return MISS;
      const th = (Math.atan2(g.dy, g.dx) / (2 * Math.PI) + 0.5 + hash(g.i, g.j, 42, seed)) % 1;
      const t = g.d / gap - th;
      const k = Math.round(t);
      const sd = (t - k) * gap;
      const r = g.d;
      return { d: Math.abs(sd), along: (k + th) * 2 * Math.PI * r, side: Math.sign(sd) || 1, nx: r > 1e-9 ? g.dx / r : 0, ny: r > 1e-9 ? g.dy / r : 1, wf: 1 };
    }
    case "scroll": {
      // 唐草：横に流れるつるが波打ち、山と谷ごとに外へ巻き、節から葉が出る。n 列
      const g = 1 / n;
      const k0 = Math.floor(y / g);
      let best: PathHit = MISS;
      for (let k = k0 - 1; k <= k0 + 1; k++) {
        if (k < 0 || k >= n) continue;
        best = nearer(best, scrollHit(x / g + 0.37 * k, y / g - (k + 0.5), k, g, seed));
      }
      return best;
    }
    case "scatter": {
      // 草：根元から 2〜3 本の葉が、上へ向かって少し開いて伸びる。先は細くとがる（引っかき傷にならないように、向きをそろえる）
      const cell = 1 / n;
      const i0 = Math.floor(x / cell);
      const j0 = Math.floor(y / cell);
      let best: PathHit = MISS;
      for (let j = j0 - 1; j <= j0 + 2; j++) {
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          for (const b of tuft(i, j, cell, seed)) best = nearer(best, bladeHit(x, y, b.bx, b.by, b.a, b.L, b.bend));
        }
      }
      return best;
    }
  }
}

/** 草の 1 株の葉（根元・向き・長さ・曲がり）。同じ i, j, たねなら同じ */
export function tuft(i: number, j: number, cell: number, seed: number, alt = 0): { bx: number; by: number; a: number; L: number; bend: number; k: number }[] {
  // alt＝置きなおす回数（0 がはじめの所。穴にかかるときに、株ごとずらす）
  const bx = (i + 0.5 + (alt ? 0.45 : 0.3) * jit(i, j, 4 + 40 * alt, seed)) * cell;
  const by = (j + 0.8 + (alt ? 0.4 : 0.15) * jit(i, j, 5 + 40 * alt, seed)) * cell;
  // 株ごとに少しかたむく（風になびくように、どの株も同じ向きへ寄せる）
  const lean = 0.18 + 0.12 * jit(i, j, 6, seed);
  const count = hash(i, j, 7, seed) < 0.4 ? 2 : 3;
  const out = [];
  for (let k = 0; k < count; k++) {
    const spread = count === 2 ? (k === 0 ? -0.3 : 0.25) : (k - 1) * 0.36;
    const a = -Math.PI / 2 + lean + spread + 0.06 * jit(i, j, 10 + k, seed);
    const L = cell * (k === 1 || count === 2 ? 0.62 : 0.46) * (0.85 + 0.3 * hash(i, j, 14 + k, seed));
    out.push({ bx, by, a, L, bend: 0.12 + 0.1 * (spread + lean), k });
  }
  return out;
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

/** 数の短い書き方（2・1.5） */
const fmt = (v: number) => String(Math.round(v * 100) / 100);

/**
 * 並べる・散らす物の、いちばん近い中心と、ならした「幅の中の数」n。
 * count（板全体の数）があれば、ちょうどその数を板の上に置く（spots）。無ければ、前と同じ幅の中に n の格子（板全体では n の 2 乗）
 */
function nearestItem(
  op: object & { count?: number },
  x: number,
  y: number,
  n: number,
  jitter: number,
  seed: number,
  k: number,
  stagger: boolean,
  arrange: SpotOpts["arrange"],
  margin?: (a: number) => number,
): { d: number; dx: number; dy: number; i: number; j: number; n: number } {
  const c = op.count ? clampTo(op.count, PATTERN_LIMITS.items) : 0;
  if (c < 1) return { ...nearestGrid(x, y, n, jitter, seed, k, stagger), n };
  const a = Math.sqrt(1 / Math.round(c));
  const s = spotsFor(op, c, 1, 1, seed + k, { arrange, jitter, stagger, ...(margin ? { margin: margin(a) } : {}) });
  return { ...nearestSpot(s, x, y), n: 1 / s.a };
}

/** 左上からの光（面の向きと、片切彫りの面を光へ向けるのに使う） */
const LIGHT = [-0.55, -0.6, 0.58] as const;

/**
 * 散らした草（scatter）の、いちばん近い葉。前の手順で穴をあけた所（透かし）にかかる株は、株ごと置きなおし（いくつかの所のうち、まわりがいちばんあいている所）、
 * どこにも置けなければ彫らない（穴をよけて、地のあいた所に草を置く）。株ごとの置き場所は、いちど調べたら覚えておく（同じ板なら同じ）
 */
function grassHit(r: Relief, idx: number, across: number, w: number, x: number, y: number, seed: number): PathHit {
  const n = Math.max(1, Math.round(across));
  const cell = 1 / n;
  const i0 = Math.floor(x / cell);
  const j0 = Math.floor(y / cell);
  let best: PathHit = MISS;
  const cache = (r.cache ??= new Map());
  const m = w * 2;
  /** 株のまわりのあき（穴やふちから離れているほど大きい。穴にかかれば -1） */
  const room = (bs: ReturnType<typeof tuft>) => {
    let score = 0;
    for (const b of bs) {
      const ux = Math.cos(b.a);
      const uy = Math.sin(b.a);
      for (const t of [0, 0.5, 1]) {
        const cx = b.bx + ux * b.L * t - uy * b.bend * b.L * t * t;
        const cy = b.by + uy * b.L * t + ux * b.bend * b.L * t * t;
        for (const k of [1, 3, 6]) {
          for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const X = cx + ox * m * k;
            const Y = cy + oy * m * k;
            const bad = X < 0 || Y < 0 || X > 1 || Y > 1 || rim(X, Y) < RELIEF_VALUES.borderInset + 0.035 || pointAt(r, X, Y, idx).hole;
            if (bad && k === 1) return -1;
            if (!bad) score++;
          }
        }
      }
    }
    return score;
  };
  for (let j = j0 - 1; j <= j0 + 2; j++) {
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      const key = `${idx}:${i}:${j}`;
      let alt = cache.get(key);
      if (alt === undefined) {
        // いくつかの置き場所のうち、まわりがいちばんあいている所（穴と穴の間のまん中に寄る）
        alt = -1;
        let top = -1;
        for (let a = 0; a < RELIEF_VALUES.grassTries; a++) {
          const sc = room(tuft(i, j, cell, seed, a));
          if (sc > top) {
            top = sc;
            alt = sc >= 0 ? a : -1;
          }
        }
        cache.set(key, alt);
      }
      if (alt >= 0) for (const b of tuft(i, j, cell, seed, alt)) best = nearer(best, bladeHit(x, y, b.bx, b.by, b.a, b.L, b.bend));
    }
  }
  return best;
}

/** 操作の並びのとおりに、点 (x, y) の様子を決める（upto＝その番号の手前の操作まで） */
export function pointAt(r: Relief, x: number, y: number, upto = r.ops.length): Pt {
  const p = fresh();
  const V = RELIEF_VALUES;
  /** 地を全部抜く透かし（ground）があるか。のせた物が決まってから、最後に抜く */
  let ground = false;
  for (const [idx, op] of r.ops.entries()) {
    if (idx >= upto) break;
    const seed = r.seed + 7919 * (idx + 1);
    switch (op.op) {
      case "engrave": {
        const w = clampTo(op.size, PATTERN_LIMITS.size) * V.lineScale;
        const depth = clampTo(op.depth, PATTERN_LIMITS.depth);
        // 散らす草と唐草は、枠の内に（ふちの枠を彫る技と、ぶつからないように）
        if (p.hole || ((op.path === "scatter" || op.path === "scroll") && rim(x, y) < V.borderInset + 0.035)) break;
        const n = clampTo(op.across, PATTERN_LIMITS.across);
        const h = op.path === "scatter" ? grassHit(r, idx, n, w, x, y, seed) : op.path === "outline" ? outlineHit(r, idx, x, y) : pathHit(op.path, n, x, y, seed);
        if (h.d === Infinity) break;
        const ww = w * h.wf;
        let c = 0;
        if (op.style === "kebori") {
          if (h.d < ww) c = depth * (1 - h.d / ww) * Math.min(1, 0.4 + h.wf);
        } else if (op.style === "keribori") {
          // くさびを連ねる：一打ちごとに、太い所から細くなる
          const L = w * V.keriLength;
          const ph = h.along / L - Math.floor(h.along / L);
          const we = ww * (1.25 - 0.95 * ph);
          if (ph < 0.9 && h.d < we) c = depth * (1 - h.d / we) * (0.6 + 0.4 * (1 - ph));
        } else {
          // 片切彫り：片方は鏨を立てた鋭い壁、もう片方は平らに斜めに浅くなる面（光を受ける側へ向ける）
          const flip = h.nx * LIGHT[0] + h.ny * LIGHT[1] > 0 ? -1 : 1;
          const sd = h.side * h.d * flip;
          const face = ww * V.bevelFace;
          const wall = ww * V.bevelWall;
          const dd = depth * Math.min(1, 0.35 + h.wf);
          if (sd >= 0 && sd < face) c = dd * (1 - sd / face);
          else if (sd < 0 && sd > -wall) c = dd * (1 + sd / wall);
        }
        if (c > 0) {
          p.cut = Math.max(p.cut, c);
          if (p.fill && c > 0.02) p.fill = Math.max(0, p.fill - c);
        }
        break;
      }
      case "nanako": {
        // はめた金属の所と、前に彫った線の中は、よけて打つ（仮。魚々子は地を詰める打ち方。前は彫った溝の中にも輪が入った。2026-11-07 夜）
        if (p.fill > 0 || p.hole || p.cut > V.nanakoSkip) break;
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
        if (p.fill > 0 || p.hole) break;
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
        if (op.shape === "ground") {
          ground = true;
          break;
        }
        if (rim(x, y) < V.pierceRim) break;
        // 抜く形は、ふちの残しの内側に割り付ける（形がふちにかからないように）
        const m = V.pierceRim + 0.02;
        const sc = 1 - 2 * m;
        const X = (x - m) / sc;
        const Y = (y - m) / sc;
        let hole = false;
        if (op.shape === "lattice") {
          const u = ((X + Y) * n) / Math.SQRT2;
          const v = ((X - Y) * n) / Math.SQRT2;
          const bar = clamp(0.5 - R * n, 0.08, 0.42);
          hole = Math.abs(u - Math.floor(u) - 0.5) < 0.5 - bar && Math.abs(v - Math.floor(v) - 0.5) < 0.5 - bar;
        } else if (op.shape === "wave") {
          const gap = 1 / n;
          const k = Math.floor(y / gap);
          const cy = (k + 0.5) * gap + 0.25 * gap * Math.sin(2 * Math.PI * (2 * x + hash(k, 0, 2, seed)));
          hole = Math.abs(y - cy) < Math.min(R, gap * 0.3) && rim(x, y) > V.pierceRim + 0.04;
        } else {
          const g = nearestItem(op, X, Y, n, 0.04, seed, 7, false, "rows");
          // 割り付けた n × n の中の形だけ（外の形が、ふちの残しにかからないように）。板全体の数で置いたときは、どれも内にある
          if (!op.count && (g.i < 0 || g.j < 0 || g.i >= n || g.j >= n)) break;
          const a = Math.atan2(g.dy, g.dx) + hash(g.i, g.j, 8, seed);
          const rmax = Math.min(R, (0.45 * sc) / g.n);
          const rr = op.shape === "petals" ? rmax * (0.45 + 0.55 * Math.abs(Math.cos(2.5 * a))) : rmax;
          hole = g.d * sc < rr;
        }
        if (hole) p.hole = true;
        break;
      }
      case "uchidashi":
        p.bend += uchidashiBend(op, x, y, seed, waveSeed(r, seed));
        break;
      case "zogan": {
        const w = clampTo(op.size, PATTERN_LIMITS.size) * V.lineScale;
        const n = clampTo(op.across, PATTERN_LIMITS.across);
        let inside = false;
        // 丸くはめる：size は丸の半径。dots＝並べる、pits＝ばらばらに散らす（前は半径に 2.2 をかけていて、丸がふくらみ、となりと触れた）
        // count があれば、板全体でその数（手がかりの「10 ほど」が、そのまま 10 の丸になる。2026-11-08）
        if (op.path === "dots") {
          const g = nearestItem(op, x, y, n, 0.08, seed, 13, true, "rows");
          inside = g.d < Math.min(w, 0.45 / g.n);
        } else if (op.path === "pits") {
          const g = nearestItem(op, x, y, n, 0.25, seed, 13, false, "scatter", (a) => Math.min(0.24 * a, w) + 0.04);
          inside = g.d < Math.min(w, 0.24 / g.n);
        }
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
        const n = clampTo(op.across, PATTERN_LIMITS.across);
        const R = Math.min(clampTo(op.size, PATTERN_LIMITS.size) * V.grainScale, ropeMax(op.arrange, n));
        let d = Infinity;
        if (op.arrange === "cluster") {
          // 7 つの粒を寄せた房を、格子に
          const g = nearestItem(op, x, y, n, 0.1, seed, 15, true, "rows");
          for (let k = -1; k < 6; k++) {
            const a = (k * Math.PI) / 3;
            const ox = k < 0 ? 0 : 2 * R * Math.cos(a);
            const oy = k < 0 ? 0 : 2 * R * Math.sin(a);
            d = Math.min(d, Math.hypot(g.dx - ox, g.dy - oy));
          }
        } else if (op.arrange === "scatter") d = nearestItem(op, x, y, n, 0.4, seed, 17, false, "scatter", () => R + 0.04).d;
        else if (op.arrange !== "line" && op.arrange !== "border") {
          // より線：道すじにそって、粒を詰めて並べる
          const h = pathHit(op.arrange, n, x, y, seed);
          const pitch = R * V.ropePitch;
          const t = h.along / pitch;
          d = h.d === Infinity ? Infinity : Math.hypot(h.d, (t - Math.round(t)) * pitch);
        } else {
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
        // 板全体の数で置くときは、ずらさない（区切りの線が、となりの区切りとの間に必ず残るように）
        const g = nearestItem(op, x, y, n, op.cells === "hex" || op.count ? 0 : 0.05, seed, 19, true, "rows");
        const a = 1 / g.n;
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
          // 区切りの線は、ガラスの底から表まで立つ壁（前は表の上の小さな出っぱりだけで、断面に線が見えなかった。2026-11-08 のくらべで分かった）
          const wm = op.wire ? r.materials.indexOf(op.wire) : 0;
          p.cut = 0;
          p.fill = V.enamelDepth;
          p.fillMat = wm;
          p.add = Math.max(p.add, 0.05);
          p.addMat = wm;
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
  if (ground && !p.hole) {
    // 地を抜く：ふちは太い枠として平らに残し、その内は、のせた線・粒・七宝の所だけ残す
    if (rim(x, y) < V.groundFrame) {
      p.add = 0;
      p.fill = 0;
      p.cut = 0;
      p.glass = false;
    } else if (p.add <= 0.001 && p.fill <= 0) p.hole = true;
  }
  return p;
}

type Uchidashi = Extract<ReliefOp, { op: "uchidashi" }>;

/** 打ち出し 1 回で、点 (x, y) が盛り上がる高さ（板の厚みを 1）。wseed は波の道すじのたね。edge＝ふちを平らに残す（ふちの線を探すときは残さない） */
function uchidashiBend(op: Uchidashi, x: number, y: number, seed: number, wseed: number, edge = true): number {
  const n = clampTo(op.across, PATTERN_LIMITS.across);
  const H = clampTo(op.height, PATTERN_LIMITS.depth) * RELIEF_VALUES.reliefHeight;
  const s = clampTo(op.size, PATTERN_LIMITS.size);
  let b = 0;
  if (op.shape === "bumps") {
    // 手で打ち出すので、ふくらみごとに大きさと形が少しちがう（わずかに楕円・かたより）
    const g = nearestItem(op, x, y, n, 0.12, seed, 11, true, "rows");
    const a = Math.PI * hash(g.i, g.j, 12, seed);
    const e = 1 + 0.18 * jit(g.i, g.j, 13, seed);
    const ss = s * (1 + 0.15 * jit(g.i, g.j, 14, seed));
    const u = (g.dx * Math.cos(a) + g.dy * Math.sin(a)) * e;
    const v = (-g.dx * Math.sin(a) + g.dy * Math.cos(a)) / e;
    b = Math.exp(-((Math.hypot(u, v) / ss) ** 2)) * (1 + 0.25 * Math.tanh(u / ss) * hash(g.i, g.j, 15, seed));
  } else if (op.shape === "petals") {
    // 花：真ん中の小さな丸と、まわりの 5 枚の花びら
    const g = nearestItem(op, x, y, n, 0.06, seed, 11, true, "rows");
    b = flowerBump(g.dx, g.dy, Math.min(s * 2.2, 0.46 / g.n), 2 * Math.PI * hash(g.i, g.j, 12, seed));
  } else if (op.shape === "leaves") {
    // 葉：根元から先へ細くなる葉の形のふくらみ
    const g = nearestItem(op, x, y, n, 0.1, seed, 11, true, "rows");
    b = leafBump(g.dx, g.dy, Math.min(s * 2.4, 0.48 / g.n), -Math.PI / 4 + 0.5 * jit(g.i, g.j, 12, seed));
  } else if (op.shape === "ridges") {
    const t = (y * n) % 1;
    b = Math.exp(-(((t - 0.5) / (s * n)) ** 2));
  } else {
    // 波：波の線（彫る線の wave と同じ道すじ）にそって盛り上がる帯が n 本。前は板いっぱいのゆるい波で、低いと見えなかった（2026-11-07 夜）。
    // 同じ板に wave の線を彫る・はめる手順があれば、その線と同じ所に盛り上げる（波のふちや背に線を入れる技のため）
    b = rowHits("wave", n, x, y, wseed).reduce((a, h) => a + Math.exp(-((h.d / s) ** 2)), 0);
  }
  // ふちは平らに残す
  return H * b * (edge ? Math.min(1, rim(x, y) / 0.08) : 1);
}

/** upto の手前までの打ち出しで盛り上がった高さと、打ち出しの高さの和（ふちを平らに残す分は入れない。ふちに、にせの線が出ないように） */
function bendBefore(r: Relief, x: number, y: number, upto: number): { b: number; H: number } {
  let b = 0;
  let H = 0;
  for (const [idx, op] of r.ops.entries()) {
    if (idx >= upto) break;
    if (op.op !== "uchidashi") continue;
    const seed = r.seed + 7919 * (idx + 1);
    b += uchidashiBend(op, x, y, seed, waveSeed(r, seed), false);
    H += clampTo(op.height, PATTERN_LIMITS.depth) * RELIEF_VALUES.reliefHeight;
  }
  return { b, H };
}

/**
 * 前に打ち出した帯・ふくらみのふち（高さが半分の所）までの距離。高さの傾きで割って、距離に直す。
 * side が＋＝ふくらみの内側。前は線を帯の背か、等しい間にしか引けず、「波のふちに線」が描けなかった（2026-11-08）
 */
function outlineHit(r: Relief, idx: number, x: number, y: number): PathHit {
  // 平らに残したふちには、線を引かない
  if (rim(x, y) < RELIEF_VALUES.outlineInset) return MISS;
  const f = (X: number, Y: number) => {
    const { b, H } = bendBefore(r, X, Y, idx);
    return H > 0 ? b / H - 0.5 : NaN;
  };
  const f0 = f(x, y);
  if (!Number.isFinite(f0)) return MISS;
  const e = RELIEF_VALUES.outlineStep;
  const gx = (f(x + e, y) - f(x - e, y)) / (2 * e);
  const gy = (f(x, y + e) - f(x, y - e)) / (2 * e);
  const g = Math.hypot(gx, gy);
  // ほぼ平らな所（ふくらみの外や頂）には、ふちは無い
  if (g < RELIEF_VALUES.outlineFlat) return MISS;
  const nx = gx / g;
  const ny = gy / g;
  return { d: Math.abs(f0) / g, along: -ny * x + nx * y, side: Math.sign(f0) || 1, nx, ny, wf: 1 };
}

/**
 * 線にそって粒を詰める（より線）ときの、粒の半径の上限。となりの線（渦のとなりの巻き・となりの列）との間の 3 割まで。
 * 太すぎると、渦が線の見えない円盤になった（2026-11-07 夜）。房・散らす・列・ふちは上限なし
 */
function ropeMax(arrange: string, across: number): number {
  const n = Math.max(1, Math.round(across));
  const gap = arrange === "wave" ? 1 / n : arrange === "spiral" ? 0.46 / n : arrange === "coils" ? (RELIEF_VALUES.coil / n) / 2 : arrange === "scroll" ? (RELIEF_VALUES.scroll.curl * 0.6) / n : Infinity;
  return RELIEF_VALUES.ropeGap * gap;
}

/** 打ち出しの波を、同じ板の wave の線（彫る・はめる）と同じ所にするための、道すじのたね */
function waveSeed(r: Relief, own: number): number {
  const j = r.ops.findIndex((o) => (o.op === "engrave" || o.op === "zogan") && o.path === "wave");
  return j < 0 ? own : r.seed + 7919 * (j + 1);
}

/** 表の高さ（板の厚みを 1。もとの表が 0） */
export const heightOf = (p: Pt) => p.bend - p.cut + p.add;

/** 重ねた板で、表からの深さ d（板の厚みを 1）にある層の材料の番号。edges は層の厚さを変えたときの、層のさかいの深さ */
export function layerAt(layers: readonly number[] | undefined, d: number, edges?: readonly number[]): number {
  if (!layers || layers.length < 2) return layers?.[0] ?? 0;
  return layers[Math.min(layers.length - 1, Math.max(0, Math.floor(layerCoordOf(edges, layers.length, d))))];
}

/** 表に見える材料の番号。重ねた板なら、彫った深さの層 */
export const topMat = (p: Pt, layers?: readonly number[], edges?: readonly number[]) => (p.add > 0.001 ? p.addMat : p.fill > 0 ? p.fillMat : layerAt(layers, p.cut, edges));

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
      // 材料のさかい（はめた金属・粒・七宝）と透かしを重く数える（細かな打ち跡だけの行を選ばないように）
      if (last && (topMat(p, r.layers, r.edges) !== topMat(last, r.layers, r.edges) || p.hole !== last.hole)) score += 4;
      else if (last && Math.abs(heightOf(p) - heightOf(last)) > 0.02) score++;
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
      M[o] = p.hole ? HOLE : topMat(p, r.layers, r.edges);
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
  const [lx, ly, lz] = LIGHT;
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
        m = p.fill > 0 && yc < surf + T * p.fill ? p.fillMat : layerAt(r.layers, (yc - surf) / T, r.edges);
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
    // 煮色の黒い地でも、暗い背景から板が見分けられるように、少し明るく
    const lift = 16;
    data[4 * i] = (acc[4 * i] / m) * g + lift;
    data[4 * i + 1] = (acc[4 * i + 1] / m) * g + lift;
    data[4 * i + 2] = (acc[4 * i + 2] / m) * g + lift;
    data[4 * i + 3] = Math.round((255 * m) / (ss * ss));
  }
  return { w, h, data };
}
