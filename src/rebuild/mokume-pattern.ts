// 「模様の試し」：木目金を、ある手順のとおりに作ったら、どんな模様になるかを計算する。画面に依存しない純粋な関数。
//
// 手順（本当の 11 の工程 A1〜A11 が、それぞれ 一致／一部／たどり着けず）から「作り方」（Recipe）を決め、
// その作り方で、板の中の層がどう動くかを、形の考え方だけで追う（金属の本当の流れや熱は計算しない）。
//
// - 層：色のちがう板（赤銅と銅）を交互に重ねる。上から 0, 1, 2, … 番。
// - 彫る（A8）：表から、丸いくぼみを掘る。深さは板の厚みの 1/3 まで（出典は mokume-values.ts）。
//   裏から打ち出す（Claude の手順）：裏から押して、層ごと表へ盛り上げる。
// - 平らにする（A9）：叩いて（または削って）平らにすると、その場所の深さ e の所にあった層が表に来る。
//   いまの深さ u（0＝表、1＝裏）にある物は、平らにする前は e + u(1 − e) の深さにあった。これをくり返しの回数だけさかのぼる。
// - つなぐ（A2・A4・A5・A6）：欠けた手順が多いほど、層の境に「つながらない所」が残る。そこは叩くと層がはがれる。
// - 表の色＝最後に平らに削った面が切る、元の層の色。断面＝同じ計算を、横から切った面で。
import { rng } from "./sim";
import { MOKUME_METALS, MOKUME_STACK, mv } from "./mokume-values";

export type Mark = "ok" | "part" | "miss";

/** 本当の工程の番号（research/mokume/answer.md） */
export const ANSWER_IDS = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"] as const;
export type AnswerId = (typeof ANSWER_IDS)[number];
export type Statuses = Record<AnswerId, Mark>;

/** 隠しておいた本当の手順：どれも、そのとおり */
export const TRUE_STATUSES: Statuses = Object.fromEntries(ANSWER_IDS.map((id) => [id, "ok"])) as Statuses;

/** 手順から読んだ作り方 */
export interface Recipe {
  /** 板を同じ大きさに切りそろえる（A1） */
  sameSize: boolean;
  /** 面をみがく（A2）・締めつけて固定する（A4）・熱してつなぐ（A5）・すぐ叩いて仕上げる（A6）。1＝した、0.5＝一部、0＝しない */
  polish: number;
  clamp: number;
  fuse: number;
  hotHammer: number;
  /** つながりの度合い（0〜1） */
  bond: number;
  /** 層の境のうち、つながらない所の割合（0〜1） */
  unbonded: number;
  /** 叩いて薄くのばす（A7） */
  thin: boolean;
  /** 表から彫る（A8） */
  carve: boolean;
  /** 裏から打ち出す（Claude の手順の文にある） */
  punch: boolean;
  /** 彫る・平らにする、の回数（A9。0 なら平らにしない） */
  cycles: number;
  /** 品物の形にする（A10） */
  form: boolean;
  /** 煮色で色を出す（A11）。1＝した、0.5＝一部、0＝しない */
  niiro: number;
}

const score = (m: Mark): number => (m === "ok" ? 1 : m === "part" ? mv("partial") : 0);

/**
 * 手順の 一致／一部／たどり着けず から、作り方を決める。
 * titles は、その手順の工程の名前（「裏から打ち出して…」があれば、打ち出しも入れる）。
 */
export function recipeFrom(st: Statuses, titles: readonly string[] = []): Recipe {
  const polish = score(st.A2);
  const clamp = score(st.A4);
  const fuse = score(st.A5);
  const hotHammer = score(st.A6);
  const wsum = mv("wPolish") + mv("wClamp") + mv("wFuse") + mv("wHotHammer");
  const bond = (mv("wPolish") * polish + mv("wClamp") * clamp + mv("wFuse") * fuse + mv("wHotHammer") * hotHammer) / wsum;
  const carve = st.A8 !== "miss";
  const punch = titles.some((t) => /打ち出/.test(t));
  return {
    sameSize: st.A1 === "ok",
    polish,
    clamp,
    fuse,
    hotHammer,
    bond,
    unbonded: Math.max(0, Math.min(1, mv("unbondedMax") * (1 - bond))),
    thin: st.A7 !== "miss",
    carve,
    punch,
    cycles: carve || punch ? (st.A9 === "ok" ? mv("cycles") : st.A9 === "part" ? 1 : 0) : 0,
    form: st.A10 !== "miss",
    niiro: score(st.A11),
  };
}

const RANK: Record<Mark, number> = { miss: 0, part: 1, ok: 2 };

/** 答え合わせの記録（research/mokume/trial-*.json の形）から、本当の工程ごとの 一致／一部／たどり着けず を出す。同じ番号はいちばん良いもの */
export function statusesFromTrial(t: { steps: { verdict: string; answer: string }[]; missed?: string[] }): Statuses {
  const st = Object.fromEntries(ANSWER_IDS.map((id) => [id, "miss"])) as Statuses;
  for (const s of t.steps) {
    const m: Mark = s.verdict === "ok" || s.verdict === "match" ? "ok" : s.verdict === "part" || s.verdict === "partial" ? "part" : "miss";
    for (const id of s.answer.match(/A\d+/g) ?? []) {
      if (!(ANSWER_IDS as readonly string[]).includes(id)) continue;
      const k = id as AnswerId;
      if (RANK[m] > RANK[st[k]]) st[k] = m;
    }
  }
  return st;
}

/** 組み立て直すの画面の採点（Grade：steps[].verdict が match/partial/miss、answer_ids）から */
export function statusesFromGrade(g: { steps: { verdict: string; answer_ids: string[] }[] }): Statuses {
  return statusesFromTrial({ steps: g.steps.map((s) => ({ verdict: s.verdict, answer: s.answer_ids.join("・") })) });
}

// ---- 形の計算 ----

export interface Bump {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** いちばん深い（高い）所。板の厚みに対して */
  d: number;
}

export interface Model {
  recipe: Recipe;
  layers: number;
  /** 回ごとの、彫ったくぼみ（0 回目には、打ち出しも入る） */
  cycles: Bump[][];
  /** 打ち出した所（断面の絵で、彫ったのと分けて描くため。計算では 0 回目のくぼみと同じに扱う） */
  punches: Bump[];
  /** 層の境ごとの、つながらない所を決める波（k＝1〜層の数−1） */
  holes: { waves: Wave[]; cut: number }[];
  /** ゆらぎの波 */
  wob: Wave[][];
  seed: number;
}

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

function makeBumps(rand: () => number, n: number, r: number, stretch: number): Bump[] {
  const max = mv("carveDepth");
  return Array.from({ length: n }, () => {
    const rr = r * (0.55 + 0.9 * rand());
    return {
      x: -0.08 + 1.16 * rand(),
      y: -0.08 + 1.16 * rand(),
      rx: rr,
      ry: rr * stretch * (0.8 + 0.4 * rand()),
      d: max * (0.55 + 0.45 * rand()),
    };
  });
}

/**
 * 作り方とたねから、計算の材料を作る。同じたねなら、本当の手順と Claude の手順で、1 回目に彫る所は同じ場所になる
 * （ちがいが手順のちがいだけから出るように）。
 */
const MAX_CYCLES = 4;

export function buildModel(recipe: Recipe, seed = 11): Model {
  const layers = mv("layers");
  const stretch = mv("stretch");
  const first = recipe.carve ? makeBumps(rng(seed), mv("pits1"), mv("pitSize1"), stretch) : [];
  const punches = recipe.punch ? makeBumps(rng(seed + 1000), mv("punches"), mv("punchSize"), stretch) : [];
  const cycles: Bump[][] = [];
  for (let c = 0; c < Math.min(MAX_CYCLES, recipe.cycles); c++) {
    if (c === 0) cycles.push([...first, ...punches]);
    else cycles.push(recipe.carve ? makeBumps(rng(seed + 2000 * c), mv("pits2"), mv("pitSize2"), stretch) : []);
  }
  // 平らにしない（cycles 0）でも、彫った・打ち出した形は断面の絵に要る
  if (recipe.cycles === 0 && (first.length || punches.length)) cycles.push([...first, ...punches]);
  const hr = rng(seed + 3000);
  const holes: Model["holes"] = [];
  for (let k = 0; k < layers; k++) {
    const waves = makeWaves(hr, 5, 2, 7);
    // つながらない所が、ちょうど unbonded の割合になる切りどころ（波の値の分位）
    const vals: number[] = [];
    for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) vals.push(waveAt(waves, (i + 0.5) / 40, (j + 0.5) / 40));
    vals.sort((a, b) => a - b);
    const cut = recipe.unbonded <= 0 ? -Infinity : vals[Math.min(vals.length - 1, Math.floor(recipe.unbonded * vals.length))];
    holes.push({ waves, cut });
  }
  const wr = rng(seed + 4000);
  // 回ごとに横の 2 つ（x と y）＋最後に板の波打ち。数をそろえて、作り方によらず同じ波にする
  const wob = Array.from({ length: 2 * MAX_CYCLES + 1 }, () => makeWaves(wr, 4, 1, 4));
  return { recipe, layers, cycles, punches, holes, wob, seed };
}

/** その回の、彫った（打ち出した）深さ（板の厚みに対して 0〜1） */
export function depthAt(bumps: readonly Bump[], x: number, y: number): number {
  let d = 0;
  for (const b of bumps) {
    const dx = (x - b.x) / b.rx;
    if (dx <= -1 || dx >= 1) continue;
    const dy = (y - b.y) / b.ry;
    if (dy <= -1 || dy >= 1) continue;
    const q = dx * dx + dy * dy;
    if (q < 1) {
      // ふちがなめらかなくぼみ（鏨で彫った丸い溝を、叩いてならした形に近く）
      const s = 1 - q;
      d = Math.max(d, b.d * s * Math.sqrt(s));
    }
  }
  return d;
}

/** 平らにする回数（計算でさかのぼる回数）。平らにしない作り方では 0 */
const flatCycles = (m: Model) => Math.min(MAX_CYCLES, m.recipe.cycles);

export interface Trace {
  /** 元の板の中での深さ（0＝表、1＝裏） */
  u0: number;
  /** 元の板の中での位置（層のつながらない所を引くため） */
  x0: number;
  y0: number;
}

/** 最後の板の (x, y) の深さ u（0＝表）にある物が、元の重ねた板のどこにあったか */
export function trace(m: Model, x: number, y: number, u: number): Trace {
  let px = x;
  let py = y;
  let uu = u;
  const A = mv("wobble");
  for (let c = flatCycles(m) - 1; c >= 0; c--) {
    // 叩いたときのゆらぎで、横に少しずれる
    const qx = px + A * waveAt(m.wob[2 * c], px, py);
    const qy = py + A * waveAt(m.wob[2 * c + 1], px, py);
    const e = depthAt(m.cycles[c], qx, qy);
    uu = e + uu * (1 - e);
    px = qx;
    py = qy;
  }
  // 板そのものの、わずかな波打ち
  uu += 0.25 * (1 / m.layers) * waveAt(m.wob[m.wob.length - 1], px, py);
  return { u0: uu, x0: px, y0: py };
}

/** 深さ（元の板の中）の層の番号（上から 0） */
export function layerOf(m: Model, u0: number): number {
  return Math.min(m.layers - 1, Math.max(0, Math.floor(u0 * m.layers)));
}

/** 層の境 k（k 番の層の上の面。1〜層の数−1）が、元の位置 (x, y) でつながっていないか */
export function unbondedAt(m: Model, k: number, x: number, y: number): boolean {
  if (k < 1 || k >= m.layers) return false;
  const h = m.holes[k];
  return h.cut > -Infinity && waveAt(h.waves, x, y) < h.cut;
}

/** 上から k 番の層の金属 */
export function metalOf(k: number): keyof typeof MOKUME_METALS {
  return MOKUME_STACK[k % MOKUME_STACK.length];
}

/** 層ごとの色（煮色の前か後か。煮色が「一部」なら、あいだの色） */
export function layerColors(m: Model, afterNiiro: boolean): string[] {
  return Array.from({ length: m.layers }, (_, k) => {
    const metal = MOKUME_METALS[metalOf(k)];
    if (!afterNiiro || m.recipe.niiro <= 0) return metal.raw;
    if (m.recipe.niiro >= 1) return metal.niiro;
    return mix(metal.raw, metal.niiro, m.recipe.niiro);
  });
}

export function hexRgb(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  const h = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${h(r1, r2)}${h(g1, g2)}${h(b1, b2)}`;
}

// ---- 表（上から見た面） ----

export const NO_DEFECT = 0;
export const DEFECT = 1;

export interface Surface {
  n: number;
  /** こまごとの層の番号 */
  layer: Uint8Array;
  /** こまごとの、層がはがれて口を開けた所（1） */
  defect: Uint8Array;
}

/** はがれが表に口を開ける、表から層の境までの近さ（層の厚みを 1 として） */
const OPEN_DEPTH = 0.55;

/** 最後に平らに削った面（深さ grind）を、上から n × n のこまで見る。x0, y0, size で見る所をしぼれる */
export function surface(m: Model, n: number, view: { x0: number; y0: number; size: number } = { x0: 0, y0: 0, size: 1 }): Surface {
  const layer = new Uint8Array(n * n);
  const defect = new Uint8Array(n * n);
  const g = flatCycles(m) > 0 ? mv("grind") : 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = view.x0 + ((i + 0.5) / n) * view.size;
      const y = view.y0 + ((j + 0.5) / n) * view.size;
      const t = trace(m, x, y, g);
      const s = t.u0 * m.layers;
      layer[j * n + i] = layerOf(m, t.u0);
      const k = Math.ceil(s);
      if (k - s < OPEN_DEPTH && unbondedAt(m, k, t.x0, t.y0)) defect[j * n + i] = DEFECT;
    }
  }
  return { n, layer, defect };
}

/** はがれた所の割合（0〜1） */
export function defectShare(s: Surface): number {
  let d = 0;
  for (const v of s.defect) d += v;
  return s.defect.length ? d / s.defect.length : 0;
}

// ---- 断面（横から切った面） ----

export type Stage = 1 | 2 | 3 | 4;
/** 断面のこまの印：0 以上は層の番号 */
export const AIR = -1;
export const GAP = -2;

export interface Section {
  w: number;
  h: number;
  cells: Int16Array;
  /** 板の上の線と下の線（こまの行。締めつける鉄の板を描くため） */
  top: number;
  bottom: number;
  /** 板の左右のはし（こまの列） */
  left: number;
  right: number;
}

/** 断面を切る行。1 回目に彫る所と打ち出す所が、いちばん多く通る y（本当の手順と Claude の手順で同じ所を切るために、作り方によらない） */
export function sectionRow(seed = 11): number {
  const carve = makeBumps(rng(seed), mv("pits1"), mv("pitSize1"), mv("stretch"));
  const punch = makeBumps(rng(seed + 1000), mv("punches"), mv("punchSize"), mv("stretch"));
  let best = 0.5;
  let bestScore = -1;
  for (let k = 0; k <= 40; k++) {
    const y = 0.2 + (0.6 * k) / 40;
    let s = 0;
    for (let i = 0; i < 200; i++) {
      const x = (i + 0.5) / 200;
      s += (depthAt(carve, x, y) > 0.05 ? 1 : 0) + (depthAt(punch, x, y) > 0.05 ? 1.5 : 0);
    }
    if (s > bestScore) {
      bestScore = s;
      best = y;
    }
  }
  return best;
}

/** 開いたはがれの幅（層の厚みを 1 として。一体にした直後は細く、叩いて平らにすると開く） */
const GAP_HALF: Record<Stage, number> = { 1: 0, 2: 0.09, 3: 0.13, 4: 0.2 };

/**
 * 各段の断面を w × h のこまで描く。
 * ① 板を重ねる（板と板の間に少しすき間。切りそろえていなければ、はしがそろわない）
 * ② 一体にする（つながらない所は、層の境に細いすき間）
 * ③ 彫る／打ち出す（のばした板の一部。1 回目）
 * ④ 平らにする・削る（くり返しのあと。はがれが開く）
 */
export function section(m: Model, stage: Stage, w: number, h: number, row = sectionRow(m.seed)): Section {
  const cells = new Int16Array(w * h).fill(AIR);
  const N = m.layers;
  const pad = Math.round(h * 0.12);
  const H = h - 2 * pad;
  if (stage === 1 || stage === 2) {
    const left = Math.round(w * 0.05);
    const right = w - left;
    const top = pad;
    const bottom = pad + H;
    if (stage === 1) {
      // 板 N 枚とすき間 N−1（すき間は板の 1/4）
      const unit = H / (N + 0.25 * (N - 1));
      const rand = rng(m.seed + 5000);
      for (let k = 0; k < N; k++) {
        const y0 = top + k * unit * 1.25;
        const y1 = y0 + unit;
        // 切りそろえていなければ、板ごとにはしがずれる
        const a = m.recipe.sameSize ? left : left + Math.round((rand() - 0.2) * w * 0.07);
        const b = m.recipe.sameSize ? right : right - Math.round((rand() - 0.2) * w * 0.07);
        for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.max(0, a); x < Math.min(w, b); x++) cells[y * w + x] = k;
      }
      return { w, h, cells, top, bottom, left, right };
    }
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const u = (y + 0.5 - top) / H;
        const s = u * N;
        const k = Math.round(s);
        const mx = (x + 0.5) / w;
        cells[y * w + x] = Math.abs(s - k) < GAP_HALF[2] && unbondedAt(m, k, mx, row) ? GAP : layerOf(m, u);
      }
    }
    return { w, h, cells, top, bottom, left, right };
  }
  // ③④：のばした板（薄い）。上に打ち出しの盛り上がりの場所をとる
  const T = (m.recipe.thin ? mv("thin") : 1) * H * (m.recipe.thin ? 1 : 0.6);
  const top = Math.round(pad + H * 0.3);
  const bottom = Math.round(top + T);
  for (let x = 0; x < w; x++) {
    const mx = (x + 0.5) / w;
    if (stage === 3) {
      const c0 = m.cycles[0] ?? [];
      const carve = depthAt(c0.slice(0, c0.length - m.punches.length), mx, row);
      const lift = depthAt(m.punches, mx, row);
      for (let y = 0; y < h; y++) {
        // v：板の上の線を 0、下の線を 1。打ち出した所は、層ごと lift だけ上へ
        const v = (y + 0.5 - top) / T;
        const u = v + lift;
        if (u < carve || u < 0 || u > 1) continue;
        const s = u * N;
        const k = Math.round(s);
        cells[y * w + x] = Math.abs(s - k) < GAP_HALF[3] && unbondedAt(m, k, mx, row) ? GAP : layerOf(m, u + 0.25 * (1 / N) * waveAt(m.wob[m.wob.length - 1], mx, row));
      }
      continue;
    }
    const g = flatCycles(m) > 0 ? mv("grind") : 0;
    for (let y = top; y < bottom; y++) {
      const v = (y + 0.5 - top) / T;
      const t = trace(m, mx, row, g + v * (1 - g));
      const s = t.u0 * N;
      const k = Math.round(s);
      cells[y * w + x] = Math.abs(s - k) < GAP_HALF[4] && unbondedAt(m, k, t.x0, t.y0) ? GAP : layerOf(m, t.u0);
    }
  }
  return { w, h, cells, top, bottom, left: 0, right: w };
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

/** 表に出た層の数 */
export function layersShown(s: Surface): number {
  return new Set(s.layer).size;
}

/** 断面の中の、はがれのこまの数 */
export function gapCells(sec: Section): number {
  let n = 0;
  for (const v of sec.cells) if (v === GAP) n++;
  return n;
}
