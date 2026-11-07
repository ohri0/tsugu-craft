// 「この手順で作ると、どんな模様になるか」：どの技でも使える、重ねた板の模様の見込み。画面に依存しない純粋な関数。
//
// 木目金の試し（src/rebuild/mokume-pattern.ts）の考え方を、決まった操作の並びに広げた。
// 操作（PatternOp）を作る順に並べ、最後の板の表の点が、はじめに重ねた板のどの層から来たかを、後ろから順にさかのぼる（trace）。
// 表の色＝その層の材料の色。断面＝同じ計算を、横から切った面で。
// 形の考え方だけで追う見込み（仮）。金属の本当の流れ・熱・割れは計算しない。数はどれも仮（src/rebuild/pattern-values.ts）。
//
// 座標：x＝板の幅の向き、y＝板の長さの向き（その時の板の大きさで。重ねたときの幅を 1 とする）、u＝表からの深さ（0＝表、1＝裏）。
import { rng } from "./sim";
import { PATTERN_COLORS, PATTERN_LIMITS, PATTERN_METALS, PATTERN_VALUES, type MetalId } from "./pattern-values";

export type CarveShape = "dots" | "pits" | "lines" | "waves";
export type BondQuality = "good" | "partial" | "poor";
export type RearrangeMode = "edge_up" | "strips" | "tiles";
export type ColorKind = "none" | "etch" | "patina";

export type PatternOp =
  /** 色のちがう材料を重ねる（metals をくり返して count 枚） */
  | { op: "stack"; metals: MetalId[]; count: number }
  /** 熱して層をつなぐ（つながりの良さ） */
  | { op: "bond"; quality: BondQuality }
  /** のばして半分に切り、重ねる（times 回。層の数は 2 倍ずつ） */
  | { op: "fold"; times: number }
  /** 叩いて薄くのばす（厚みが 1/ratio。length＝長さの向きだけ、both＝縦横に） */
  | { op: "forge_thin"; ratio: number; direction: "length" | "both" }
  /** 棒にしてねじる（板の長さの中で turns 回まわす） */
  | { op: "twist"; turns: number }
  /** 表から彫る・穴をあける（top）か、裏から打ち出す（back）。depth は板の厚みに対して、size は板の幅に対して、across は幅の中の数 */
  | { op: "carve"; side: "top" | "back"; shape: CarveShape; depth: number; size: number; across: number }
  /** 叩いて平らにする */
  | { op: "flatten" }
  /** 表を平らに削る（depth は板の厚みに対して） */
  | { op: "grind"; depth: number }
  /** 切って並べかえる。edge_up＝横にして層のふちを表に、strips＝細く切って 1 本おきに向きを変える、tiles＝四角に切って 1 つおきに回す */
  | { op: "rearrange"; mode: RearrangeMode; pieces: number }
  /** 最後に色を出す（none＝しない、etch＝酸で地を出す、patina＝煮色のように色を出す） */
  | { op: "color"; kind: ColorKind };

export type OpName = PatternOp["op"];
export const OP_NAMES: OpName[] = ["stack", "bond", "fold", "forge_thin", "twist", "carve", "flatten", "grind", "rearrange", "color"];

/** 画面に出す操作の名前 */
export const OP_LABEL: Record<OpName, string> = {
  stack: "重ねる",
  bond: "熱してつなぐ",
  fold: "のばして切り、重ねる",
  forge_thin: "叩いて薄くのばす",
  twist: "ねじる",
  carve: "彫る・打ち出す",
  flatten: "叩いて平らにする",
  grind: "表を削る",
  rearrange: "切って並べかえる",
  color: "色を出す",
};

interface Wave {
  fx: number;
  fy: number;
  ph: number;
  a: number;
}

function makeWaves(rand: () => number, n: number, fmin: number, fmax: number): Wave[] {
  return Array.from({ length: n }, (_, k) => ({
    fx: (fmin + rand() * (fmax - fmin)) * (rand() < 0.5 ? -1 : 1),
    fy: (fmin + rand() * (fmax - fmin)) * (rand() < 0.5 ? -1 : 1),
    ph: rand() * Math.PI * 2,
    a: 1 / (k + 1),
  }));
}

function waveAt(ws: readonly Wave[], x: number, y: number): number {
  let v = 0;
  let s = 0;
  for (const w of ws) {
    v += w.a * Math.sin(2 * Math.PI * (w.fx * x + w.fy * y) + w.ph);
    s += w.a;
  }
  return s ? v / s : 0;
}

/** 決まった散らばり（同じ i, j, k, たねなら同じ 0〜1） */
function hash(i: number, j: number, k: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 974634469) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** ふちがなめらかなくぼみの形（中心で 1、ふちで 0） */
function profile(t: number): number {
  if (t >= 1) return 0;
  const s = 1 - t * t;
  return s * Math.sqrt(s);
}

/** 1 つの操作と、その時の板の大きさ（操作の前） */
interface Stage {
  op: Exclude<PatternOp, { op: "stack" }>;
  /** 元の並びの何番目か（0 から） */
  index: number;
  W: number;
  H: number;
  seed: number;
  /** 叩く操作の、横のゆらぎと層の波打ち */
  waves?: Wave[][];
  /** 彫ったあと、平らにされたか（裏から打ち出したものは、削られたか） */
  flattened?: boolean;
}

export interface Sim {
  ops: PatternOp[];
  metals: MetalId[];
  /** 重ねた枚数 */
  count: number;
  /** 最後の層の数（重ねる回数で増える） */
  layersFinal: number;
  stages: Stage[];
  /** 層の境のつながらない所の割合 */
  unbonded: number;
  holes: { waves: Wave[]; cut: number }[];
  plateWaves: Wave[];
  color: ColorKind;
  /** 見る所（最後の板の中の正方形） */
  view: { x0: number; y0: number; size: number };
  /** 最後の板の大きさ（重ねたときの幅を 1 として） */
  final: { W: number; H: number };
  /** 計算から分かる注意（やさしい日本語） */
  notes: string[];
  seed: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampTo = (v: number, r: readonly [number, number]) => clamp(v, r[0], r[1]);

/** 0〜1 の外に出たら、ふちで折り返す */
function reflect01(v: number): number {
  let t = v - 2 * Math.floor(v / 2);
  if (t > 1) t = 2 - t;
  return clamp(t, 0, 0.999999);
}

/** 操作の並びから、計算の材料を作る。並びは parsePatternOps などで確かめたもの（最初が stack）であること */
export function buildSim(ops: readonly PatternOp[], seed = 7): Sim {
  const first = ops[0];
  if (!first || first.op !== "stack") throw new Error("最初の操作は stack（重ねる）にしてください");
  const metals = first.metals.length ? first.metals : (["light", "dark"] as MetalId[]);
  const count = Math.round(clampTo(first.count, PATTERN_LIMITS.count));
  const notes: string[] = [];
  let W = 1;
  let H = 1;
  let layers = count;
  let bond: BondQuality | "none" = "none";
  let color: ColorKind = "none";
  const stages: Stage[] = [];
  for (const [index, op] of ops.entries()) {
    if (op.op === "stack") {
      if (index > 0) notes.push("重ねる操作が 2 回ありました。1 回目だけを使いました。");
      continue;
    }
    const st: Stage = { op, index, W, H, seed: seed + 7919 * (index + 1) };
    if (op.op === "forge_thin" || op.op === "flatten" || op.op === "fold") {
      const r = rng(st.seed);
      // [0] 横のゆらぎ x、[1] y、[2] 層の波打ち
      st.waves = [makeWaves(r, 4, 1, 4), makeWaves(r, 4, 1, 4), makeWaves(r, 6, 1.5, 9)];
    }
    stages.push(st);
    switch (op.op) {
      case "bond":
        bond = op.quality;
        break;
      case "fold": {
        const times = Math.round(clampTo(op.times, PATTERN_LIMITS.times));
        for (let t = 0; t < times; t++) {
          if (layers * 2 > PATTERN_VALUES.maxLayers) {
            notes.push(`層が ${PATTERN_VALUES.maxLayers} を超えるので、重ねる回数を ${t} 回で止めました（絵で見分けられないため）。`);
            (st.op as { times: number }).times = t;
            break;
          }
          layers *= 2;
        }
        break;
      }
      case "forge_thin": {
        const f = clampTo(op.ratio, PATTERN_LIMITS.ratio);
        if (op.direction === "length") H *= f;
        else {
          W *= Math.sqrt(f);
          H *= Math.sqrt(f);
        }
        break;
      }
      case "color":
        color = op.kind;
        break;
      default:
        break;
    }
  }
  // 彫ったあと、平らにされたか。裏から打ち出したものは、表を削らないと模様にならない
  for (const [i, st] of stages.entries()) {
    if (st.op.op !== "carve") continue;
    const later = stages.slice(i + 1).map((s) => s.op.op);
    st.flattened = st.op.side === "back" ? later.includes("grind") : later.some((o) => o === "flatten" || o === "grind" || o === "forge_thin" || o === "fold");
    if (!st.flattened) {
      notes.push(
        st.op.side === "back"
          ? "裏から打ち出したあと、表を削る手順がありません。盛り上がった所を削らないと、表に下の層は出ないので、模様は出ないとして描きました。"
          : "彫ったあと、平らにする手順がありません。表に凹凸が残ります（絵は、上から見たときの色です）。",
      );
    }
  }
  const has = (o: OpName) => stages.some((s) => s.op.op === o);
  const patterning = stages.some((s) => (s.op.op === "carve" && s.flattened !== false && (s.op.side === "top" || s.flattened)) || s.op.op === "twist" || s.op.op === "rearrange" || s.op.op === "grind");
  if (!patterning) notes.push("模様を出す手順（彫る・ねじる・削る・並べかえる）が無いので、表は、いちばん上の層の色だけになります。");
  if (!has("bond")) notes.push("層をつなぐ手順が見当たらないので、層の境に、つながらない所が多いとして描きました。");
  if (color === "none") notes.push("最後に色を出す手順が無いので、材料そのものの色で描きました。色の差は小さく見えます。");
  if (metals.length < 2) notes.push("材料が 1 つだけなので、層があっても色の差は出ません。");

  const unbonded = PATTERN_VALUES.unbonded[bond];
  const hr = rng(seed + 3000);
  const holes: Sim["holes"] = [];
  for (let k = 0; k < count; k++) {
    const waves = makeWaves(hr, 5, 2, 7);
    const vals: number[] = [];
    for (let j = 0; j < 30; j++) for (let i = 0; i < 30; i++) vals.push(waveAt(waves, (i + 0.5) / 30, (j + 0.5) / 30));
    vals.sort((a, b) => a - b);
    const cut = unbonded <= 0 ? -Infinity : vals[Math.min(vals.length - 1, Math.floor(unbonded * vals.length))];
    holes.push({ waves, cut });
  }
  const size = Math.min(W, H);
  return {
    ops: [...ops],
    metals,
    count,
    layersFinal: layers,
    stages,
    unbonded,
    holes,
    plateWaves: makeWaves(rng(seed + 4000), 4, 1, 4),
    color,
    view: { x0: (W - size) / 2, y0: (H - size) / 2, size },
    final: { W, H },
    notes,
    seed,
  };
}

/** 彫った（打ち出した）深さ（その時の板の厚みに対して 0〜1）。qx, qy はその時の板の幅を 1 とした位置 */
export function carveDepth(op: Extract<PatternOp, { op: "carve" }>, qx: number, qy: number, seed: number): number {
  const across = clampTo(op.across, PATTERN_LIMITS.across);
  const a = 1 / across;
  const depth = clampTo(op.depth, PATTERN_LIMITS.depth);
  const size = clampTo(op.size, PATTERN_LIMITS.size);
  if (op.shape === "lines" || op.shape === "waves") {
    // 幅の向きに走る溝を、長さの向きに a おきに（はしごの模様の溝）
    const y = op.shape === "waves" ? qy + 0.35 * a * Math.sin(2 * Math.PI * qx * Math.max(1, across / 3)) : qy;
    const t = y / a - Math.floor(y / a) - 0.5;
    return depth * profile(Math.abs(t * a) / size);
  }
  const i0 = Math.floor(qx / a);
  const j0 = Math.floor(qy / a);
  let d = 0;
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      let cx: number, cy: number, r: number, dd: number;
      if (op.shape === "dots") {
        // 決まった間かくの丸い穴（1 列おきに半分ずらす）
        cx = (i + 0.5 + (j % 2 === 0 ? 0 : 0.5)) * a;
        cy = (j + 0.5) * a;
        r = size;
        dd = depth;
      } else {
        cx = (i + 0.15 + 0.7 * hash(i, j, 1, seed)) * a;
        cy = (j + 0.15 + 0.7 * hash(i, j, 2, seed)) * a;
        r = size * (0.55 + 0.9 * hash(i, j, 3, seed));
        dd = depth * (0.55 + 0.45 * hash(i, j, 4, seed));
      }
      const dist = Math.hypot(qx - cx, qy - cy) / r;
      if (dist < 1) d = Math.max(d, dd * profile(dist));
    }
  }
  return d;
}

export interface Trace {
  /** はじめに重ねた板の中での深さ（0＝表、1＝裏） */
  u0: number;
  /** はじめに重ねた板の中での位置（幅を 1 として） */
  x0: number;
  y0: number;
}

/** 最後の板の (x, y)（最後の板の大きさで）の深さ u にある物が、はじめに重ねた板のどこにあったか */
export function trace(sim: Sim, x: number, y: number, u: number): Trace {
  let px = x;
  let py = y;
  let uu = u;
  const A = PATTERN_VALUES.wobble;
  for (let s = sim.stages.length - 1; s >= 0; s--) {
    const st = sim.stages[s];
    const { W, H } = st;
    const op = st.op;
    switch (op.op) {
      case "forge_thin": {
        const f = clampTo(op.ratio, PATTERN_LIMITS.ratio);
        const ws = st.waves!;
        // のばす前の板では、層が少し波打っていた
        uu = reflect01(uu + PATTERN_VALUES.layerWave.forge * Math.sqrt(f) * waveAt(ws[2], px / (W * (op.direction === "both" ? Math.sqrt(f) : 1)), py / W));
        if (op.direction === "length") py /= f;
        else {
          px /= Math.sqrt(f);
          py /= Math.sqrt(f);
        }
        px += A * W * waveAt(ws[0], px / W, py / W);
        py += A * W * waveAt(ws[1], px / W, py / W);
        break;
      }
      case "flatten": {
        const ws = st.waves!;
        uu = reflect01(uu + PATTERN_VALUES.layerWave.flatten * waveAt(ws[2], px / W, py / W));
        px += A * W * waveAt(ws[0], px / W, py / W);
        py += A * W * waveAt(ws[1], px / W, py / W);
        break;
      }
      case "fold": {
        const ws = st.waves!;
        const times = Math.round(clampTo(op.times, [0, PATTERN_LIMITS.times[1]]));
        for (let t = 0; t < times; t++) {
          uu = reflect01(uu + PATTERN_VALUES.layerWave.fold * waveAt(ws[2], px / W + 0.37 * t, py / W));
          if (uu < 0.5) {
            uu = 2 * uu;
            py = py / 2;
          } else {
            uu = 2 * uu - 1;
            py = (py + H) / 2;
          }
        }
        break;
      }
      case "twist": {
        const turns = clampTo(op.turns, PATTERN_LIMITS.turns);
        const th = (2 * Math.PI * turns * py) / H;
        const cx = px / W - 0.5;
        const cu = uu - 0.5;
        const c = Math.cos(th);
        const sn = Math.sin(th);
        px = reflect01(cx * c + cu * sn + 0.5) * W;
        uu = reflect01(-cx * sn + cu * c + 0.5);
        break;
      }
      case "carve": {
        if (!st.flattened && op.side === "back") break;
        const e = carveDepth(op, px / W, py / W, st.seed);
        uu = e + uu * (1 - e);
        break;
      }
      case "grind": {
        const g = clampTo(op.depth, PATTERN_LIMITS.grind);
        uu = g + uu * (1 - g);
        break;
      }
      case "rearrange": {
        const n = Math.round(clampTo(op.pieces, PATTERN_LIMITS.pieces));
        if (op.mode === "edge_up") {
          const xn = clamp(px / W, 0, 0.999999);
          px = uu * W;
          uu = xn;
        } else if (op.mode === "strips") {
          const i = Math.floor(clamp(px / W, 0, 0.999999) * n);
          if (i % 2 === 1) {
            const w = W / n;
            px = i * w + (w - (px - i * w));
            py = H - py;
          }
        } else {
          const t = W / n;
          const i = Math.floor(px / t);
          const j = Math.floor(py / t);
          if ((((i + j) % 2) + 2) % 2 === 1) {
            const lx = px - i * t;
            const ly = py - j * t;
            px = i * t + ly;
            py = j * t + (t - lx);
          }
        }
        break;
      }
      default:
        break;
    }
  }
  // 板そのものの、わずかな波打ち
  uu = clamp(uu + (PATTERN_VALUES.waviness / sim.count) * waveAt(sim.plateWaves, px, py), 0, 0.999999);
  return { u0: uu, x0: px, y0: py };
}

/** はじめに重ねた板の、上から k 番の層（0 から） */
export function layerOf(sim: Sim, u0: number): number {
  return Math.min(sim.count - 1, Math.max(0, Math.floor(u0 * sim.count)));
}

/** k 番の層の材料 */
export const metalOf = (sim: Sim, k: number): MetalId => sim.metals[k % sim.metals.length];

/** 層の境 k（k 番の層の上の面）が、はじめの位置 (x, y) でつながっていないか */
export function unbondedAt(sim: Sim, k: number, x: number, y: number): boolean {
  if (k < 1 || k >= sim.count) return false;
  const h = sim.holes[k];
  return h.cut > -Infinity && waveAt(h.waves, x, y) < h.cut;
}

/** 層ごとの色（最後の色の出し方で） */
export function layerColors(sim: Sim): string[] {
  return Array.from({ length: sim.count }, (_, k) => PATTERN_METALS[metalOf(sim, k)][sim.color === "none" ? "raw" : sim.color]);
}

// ---- 表（上から見た面） ----

export interface Surface {
  n: number;
  /** こまごとの層の番号 */
  layer: Uint16Array;
  /** こまごとの、層がはがれて口を開けた所（1） */
  defect: Uint8Array;
}

/** 最後の板の見る所を、上から n × n のこまで見る */
export function surface(sim: Sim, n: number): Surface {
  const out: Surface = { n, layer: new Uint16Array(n * n), defect: new Uint8Array(n * n) };
  surfaceRows(sim, out, 0, n);
  return out;
}

/** surface の j0〜j1 行だけを埋める（画面で少しずつ描くため） */
export function surfaceRows(sim: Sim, out: Surface, j0: number, j1: number): void {
  const { n, layer, defect } = out;
  const { x0, y0, size } = sim.view;
  for (let j = j0; j < Math.min(n, j1); j++) {
    for (let i = 0; i < n; i++) {
      const t = trace(sim, x0 + ((i + 0.5) / n) * size, y0 + ((j + 0.5) / n) * size, 0);
      const s = t.u0 * sim.count;
      layer[j * n + i] = layerOf(sim, t.u0);
      const k = Math.ceil(s);
      defect[j * n + i] = k - s < PATTERN_VALUES.openDepth && unbondedAt(sim, k, t.x0, t.y0) ? 1 : 0;
    }
  }
}

// ---- 断面（横から切った面） ----

export const AIR = -1;
export const GAP = -2;

export interface Section {
  w: number;
  h: number;
  cells: Int16Array;
}

/** 見る所の真ん中（または row：見る所の上から 0〜1）を、幅の向きに切った断面。上が表 */
export function section(sim: Sim, w: number, h: number, row = 0.5): Section {
  const cells = new Int16Array(w * h).fill(AIR);
  const { x0, y0, size } = sim.view;
  const y = y0 + row * size;
  // 平らにしていない最後の彫り（表に凹凸が残る）
  const open = sim.stages.filter((s) => s.op.op === "carve" && s.op.side === "top" && !s.flattened);
  for (let i = 0; i < w; i++) {
    const x = x0 + ((i + 0.5) / w) * size;
    let top = 0;
    for (const st of open) if (st.op.op === "carve") top = Math.max(top, carveDepth(st.op, x / st.W, y / st.W, st.seed));
    for (let j = 0; j < h; j++) {
      const u = (j + 0.5) / h;
      if (u < top) continue;
      const t = trace(sim, x, y, u);
      const s = t.u0 * sim.count;
      const k = Math.round(s);
      cells[j * w + i] = Math.abs(s - k) < 0.12 && unbondedAt(sim, k, t.x0, t.y0) ? GAP : layerOf(sim, t.u0);
    }
  }
  return { w, h, cells };
}

// ---- 比べるための数 ----

/** 模様の細かさの目安：となりのこまと層がちがう割合（0〜1） */
export function fineness(s: Surface): number {
  let diff = 0;
  let all = 0;
  const { n, layer } = s;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n - 1; i++) {
      all++;
      if (layer[j * n + i] !== layer[j * n + i + 1]) diff++;
    }
  }
  return all ? diff / all : 0;
}

/** 表に出た色の数（材料の数で数える） */
export function metalsShown(sim: Sim, s: Surface): number {
  return new Set(Array.from(s.layer, (k) => metalOf(sim, k))).size;
}

/** はがれた所の割合（0〜1） */
export function defectShare(s: Surface): number {
  let d = 0;
  for (const v of s.defect) d += v;
  return s.defect.length ? d / s.defect.length : 0;
}

// ---- 絵（画面とファイルで同じ） ----

function hexRgb(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** 決まった細かいざらつき（金属の地の手ざわり） */
function grain(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 1023) / 1023 - 0.5) * 2;
}

export interface Rgba {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

/** 上から見た面の絵（n × n）。ss 倍の細かさで計算して平均する（細かい層が、ぎざぎざの縞にならないように） */
export function surfaceImage(sim: Sim, n: number, ss = 1): Rgba {
  const surf = surface(sim, n * ss);
  return paintSurface(sim, surf, n, ss);
}

/** surfaceImage を、行ごとに pause をはさんで計算する（画面が固まらないように）。stop が true を返したら null */
export async function surfaceImageAsync(sim: Sim, n: number, ss: number, pause: () => Promise<void>, stop: () => boolean = () => false): Promise<Rgba | null> {
  const N = n * ss;
  const surf: Surface = { n: N, layer: new Uint16Array(N * N), defect: new Uint8Array(N * N) };
  const chunk = Math.max(4, Math.round(24000 / N));
  for (let j = 0; j < N; j += chunk) {
    surfaceRows(sim, surf, j, j + chunk);
    await pause();
    if (stop()) return null;
  }
  return paintSurface(sim, surf, n, ss);
}

function paintSurface(sim: Sim, surf: Surface, n: number, ss: number): Rgba {
  const N = surf.n;
  const cols = layerColors(sim).map(hexRgb);
  const gap = hexRgb(PATTERN_COLORS.gap);
  const inside = hexRgb(PATTERN_COLORS.gapInside);
  const data = new Uint8ClampedArray(n * n * 4);
  const def = (i: number, j: number) => i >= 0 && j >= 0 && i < N && j < N && surf.defect[j * N + i] === 1;
  const k = ss * ss;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dj = 0; dj < ss; dj++) {
        for (let di = 0; di < ss; di++) {
          const I = i * ss + di;
          const J = j * ss + dj;
          let c: readonly number[];
          if (def(I, J)) c = !def(I - ss, J) || !def(I + ss, J) || !def(I, J - ss) || !def(I, J + ss) ? gap : inside;
          else c = cols[surf.layer[J * N + I]];
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const s = (1 + 0.045 * grain(i, j)) / k;
      const o = 4 * (j * n + i);
      data[o] = r * s;
      data[o + 1] = g * s;
      data[o + 2] = b * s;
      data[o + 3] = 255;
    }
  }
  return { w: n, h: n, data };
}

/** 断面の絵（w × h）。空気は透明 */
export function sectionImage(sim: Sim, w: number, h: number, row = 0.5): Rgba {
  const sec = section(sim, w, h, row);
  const cols = layerColors(sim).map(hexRgb);
  const gap = hexRgb(PATTERN_COLORS.gap);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = sec.cells[j * w + i];
      if (v === AIR) continue;
      const o = 4 * (j * w + i);
      const s = 1.04 - 0.08 * (j / h) + 0.035 * grain(i, j);
      const c = v === GAP ? gap : cols[v].map((x) => x * s);
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 255;
    }
  }
  return { w, h, data };
}
