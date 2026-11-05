// 腕の彫り：腕の外の面に、細い線の模様を浅く彫る。画面に依存しない純粋な関数。
//
// 模様は「場所ごとの深さ」で決まる。線の太さや窓の大きさは mm で考え、腕が細くなる所では模様も同じ割合で小さくなる（窓の形はそのまま）。
// 面の網目は一様に細かくせず、深さが変わる所だけを細かくする（線の縁がギザギザにならず、平らな所は軽いまま）。
// 指の側（内側）と石座のそば（腕の端とロウの丸み）は動かさないので、内径と石座とのつなぎは変わらない。
// 線の太さ・窓の割合は形を作るための決まりで、職人の目安の数ではない（**仮**。作者が見て直す）。
import { pushTri, type V3 } from "./mesh";

export type ReliefKind = "arch" | "diamond" | "wave" | "beads" | "lines" | "leaf";

export const RELIEF_KINDS: readonly ReliefKind[] = ["arch", "diamond", "wave", "beads", "lines", "leaf"];

export const RELIEF_LABEL: Record<ReliefKind, string> = { arch: "尖ったアーチ", diamond: "菱の格子", wave: "波の線", beads: "粒", lines: "横の筋", leaf: "葉とつる" };

export interface ReliefParams {
  kind: ReliefKind;
  /** 片側の腕に並べる数 */
  count: number;
  /** 彫りの深さ（mm） */
  depthMm: number;
  /** 彫る所：いちばん上から指のまわりに測った角度（度） */
  fromDeg: number;
  toDeg: number;
  /** 幅の向きに並べる数（なければ 1） */
  columns?: number;
  /** 大きく写す絵のための細かい網目（三角形が増える。入口の絵など。ふだんは使わない） */
  fine?: boolean;
  /** 動かしている間：形には彫らず、数だけ出す（すぐ返す。止まったら彫る） */
  draft?: boolean;
}

/**
 * 模様の形の決まり（形を作るための決まり。**仮**）。
 * lineMm：線の半分の太さ。edgeMm：腕の縁から、これより内には彫らない。colGapMm：列と列の間。
 * ratio：升の長さ ÷ 列の幅（模様ごと）。fadeCells：はじめと終わりの、この升の数で深さが 0 まで消える。
 * archRatio：アーチの尖った部分の高さ ÷ 窓の半分の幅（大きいほど鋭い）。archGapMm：窓と窓の間。
 * twoLightMm：窓の半分の幅がこれより広ければ、中に 2 つの小さな窓と丸窓を入れる（ゴシックの窓の組子）。
 */
const SHAPE = { lineMm: 0.15, edgeMm: 0.26, colGapMm: 0.2, ratio: { arch: 3.1, diamond: 1.3, wave: 3.4, beads: 1, lines: 1, leaf: 1.5 } as Record<ReliefKind, number>, fadeCells: 0.85, archRatio: 2.7, archGapMm: 0.14, twoLightMm: 0.72, archMaxHalf: 1.05, innerFloor: 0.28 };

/**
 * 網目の決まり（形を作るための決まり）。baseMm：土台の升の大きさ。minCellMm：いちばん小さい升。tolMm：土台の面との差がこれより小さければ分けない。
 * normalMm：面の向きを測る幅（升と同じくらいにすると、光の筋が出ない。線の壁の向きが少しなめらかになる）。
 * fine は、大きく写す絵のための細かい網目（三角形が増える。画面のふだんの形では使わない）
 */
export const RELIEF_MESH = { baseMm: 0.28, lattice: 16, normal: { minCellMm: 0.05, tolMm: 0.012, normalMm: 0.05 }, fine: { minCellMm: 0.022, tolMm: 0.005, normalMm: 0.024 } };

const TWO_PI = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** 線の断面：真ん中がいちばん深く、縁へなめらかに浅くなる（0〜1）。d：線の真ん中からの距離、w：線の半分の太さ */
function stroke(d: number, w: number): number {
  if (d >= w) return 0;
  const t = d / w;
  const k = 1 - t * t;
  return k * k;
}

/** 尖ったアーチの輪郭までの距離。x ≥ 0。y：肩の線から先の向きへ（先まで H、足もとまで −J）。b：半分の幅 */
function archDistance(x: number, y: number, b: number, H: number, J: number): number {
  if (y >= 0) {
    const R = (b * b + H * H) / (2 * b);
    const toApex = Math.hypot(x, y - H);
    if (y >= H) return toApex;
    return Math.min(Math.abs(Math.hypot(x + R - b, y) - R), toApex);
  }
  const dy = y + J;
  if (dy < 0) return x <= b ? -dy : Math.hypot(x - b, dy);
  return Math.min(Math.abs(x - b), x <= b ? dy : Infinity);
}

/** 尖ったアーチの中か */
function archInside(x: number, y: number, b: number, H: number, J: number): boolean {
  if (y >= H || y <= -J) return false;
  if (y <= 0) return x < b;
  const R = (b * b + H * H) / (2 * b);
  return Math.hypot(x + R - b, y) < R;
}

/** 窓 1 つの深さの割合。lx：列の真ん中から幅の向きへ。y：升の始まり（石座の側）から下へ（mm）。b：窓の半分の幅、L：升の長さ、w：線の半分の太さ */
function archWindow(lx: number, y: number, b: number, L: number, w: number): number {
  const top = SHAPE.archGapMm / 2;
  const bottom = L - SHAPE.archGapMm / 2;
  const H = Math.min(SHAPE.archRatio * b, (bottom - top) * 0.62);
  const spring = top + H;
  const J = bottom - spring;
  const x = Math.abs(lx);
  const yUp = spring - y;
  let d = archDistance(x, yUp, b, H, J);
  const inside = archInside(x, yUp, b, H, J);
  if (b >= SHAPE.twoLightMm) {
    // 2 つの小さな窓と、その上の丸窓
    const b2 = b / 2 - w * 0.2;
    const H2 = Math.min(SHAPE.archRatio * b2, J * 0.5 + H * 0.3);
    const spring2 = spring + H * 0.42;
    d = Math.min(d, archDistance(Math.abs(x - b / 2), spring2 - y, b2, H2, bottom - spring2));
    const rc = b * 0.3;
    const yc = spring2 - H2 - rc * 1.05;
    if (yc - rc > top + H * 0.28) d = Math.min(d, Math.abs(Math.hypot(lx, y - yc) - rc));
  }
  const line = stroke(d, w);
  // 窓の中は、ごく浅く下げる（窓が窓に見える。線より浅い）
  return inside ? Math.max(line, SHAPE.innerFloor * smooth(d / (w * 1.4))) : line;
}

/** 窓の列の数：幅の広い面では、窓が広がりすぎないように列を増やす（縦に細長いまま） */
function columnsOf(kind: ReliefKind, U: number, cols: number): number {
  return kind === "arch" ? Math.max(cols, Math.round(U / SHAPE.archMaxHalf)) : cols;
}

/** 模様の深さの割合（0〜1）。u：腕に沿って、石座の側から 0〜count。x：幅の向きの位置（mm。真ん中 0）。L：u の 1 あたりの長さ（mm）。arc：外の面の線の長さの半分（mm）。cols：列の数 */
export function reliefPattern(kind: ReliefKind, u: number, x: number, L: number, arc: number, cols0: number): number {
  const E = Math.min(SHAPE.edgeMm, arc * 0.3);
  const U = arc - E;
  if (U <= 0 || Math.abs(x) >= U + SHAPE.lineMm) return 0;
  const cols = columnsOf(kind, U, cols0);
  const n = Math.floor(u);
  const f = u - n;
  const gap = cols > 1 ? SHAPE.colGapMm : 0;
  const b = (2 * U - (cols - 1) * gap) / cols / 2;
  const k = Math.min(cols - 1, Math.max(0, Math.floor((x + U + gap / 2) / (2 * b + gap))));
  const lx = x - (-U + b + k * (2 * b + gap));
  const w = Math.min(SHAPE.lineMm, b * 0.3);
  const y = f * L;
  switch (kind) {
    case "arch":
      return archWindow(lx, y, b, L, w);
    case "diamond": {
      // 菱の格子と、両わきの枠の線
      const q = lx / (2 * b);
      const a = u + q;
      const c = u - q;
      const unit = 1 / Math.hypot(1 / L, 1 / (2 * b));
      const lat = Math.abs(lx) <= b ? Math.min(Math.abs(a - Math.round(a)), Math.abs(c - Math.round(c))) * unit : Infinity;
      return stroke(Math.min(lat, Math.abs(Math.abs(lx) - b)), w * 0.85);
    }
    case "wave": {
      // 腕に沿う波の線（列の数だけ）
      // 波の高さは、波の長さに対して低く（山形の線にならないように）
      const A = Math.min(b * 0.62, L * 0.13);
      const x0 = A * Math.sin(2 * Math.PI * u);
      const slope = Math.hypot(1, (A * 2 * Math.PI * Math.cos(2 * Math.PI * u)) / L);
      return stroke(Math.abs(lx - x0) / slope, w);
    }
    case "beads": {
      // 丸いくぼみの列
      const rb = Math.min(L * 0.36, b * 0.72);
      const dist = Math.hypot(y - L / 2, lx);
      return dist >= rb ? 0 : Math.sqrt(1 - (dist / rb) ** 2);
    }
    case "lines": {
      // 腕を横切る筋（両はしは丸く終わる）
      const dy = Math.abs(y - L / 2);
      return stroke(Math.abs(lx) <= b ? dy : Math.hypot(dy, Math.abs(lx) - b), w * 0.85);
    }
    case "leaf": {
      // 真ん中のつると、左右交互の葉（輪郭の線）
      const A = b * 0.26;
      const stemX = A * Math.sin(Math.PI * (u - 0.5));
      const stemSlope = Math.hypot(1, (A * Math.PI * Math.cos(Math.PI * (u - 0.5))) / L);
      const stem = Math.abs(lx - stemX) / stemSlope;
      const sign = n % 2 === 0 ? 1 : -1;
      const dx = lx - sign * b * 0.52;
      const dy = y - L / 2;
      const cs = Math.cos(0.75);
      const sn = Math.sin(0.75) * sign;
      const p = dy * cs + dx * sn;
      const r = -dy * sn + dx * cs;
      const Lf = Math.min(L * 0.44, b * 0.62);
      const H = 0.44 * Lf * Math.max(0, 1 - (p / Lf) ** 2);
      const leaf = Math.abs(p) <= Lf ? Math.abs(Math.abs(r) - H) : Math.hypot(Math.abs(p) - Lf, r);
      return stroke(Math.min(stem, leaf), w * 0.8);
    }
  }
}

/** 断面の行ごとの v（外の面の線の長さの割合で、右の端 1 → 左の端 −1。行の座標は mm の比に直して測る） */
export function rowsV(rows: readonly (readonly [number, number])[], w: number, t: number): number[] {
  const len = [0];
  for (let i = 1; i < rows.length; i++) len.push(len[i - 1] + Math.hypot(((rows[i][0] - rows[i - 1][0]) * w) / 2, (rows[i][1] - rows[i - 1][1]) * t));
  const total = len[len.length - 1] || 1;
  return len.map((l) => 1 - (2 * l) / total);
}

/** 線の長さが step 以下になるよう、断面の行を細かくする（行 j と j ＋ 1 の間の割合 s の所に行を足す） */
export function rowTrace(rows: readonly (readonly [number, number])[], w: number, t: number, step: number): { j: number; s: number }[] {
  const out: { j: number; s: number }[] = [];
  for (let j = 0; j + 1 < rows.length; j++) {
    out.push({ j, s: 0 });
    const n = Math.ceil(Math.hypot(((rows[j + 1][0] - rows[j][0]) * w) / 2, (rows[j + 1][1] - rows[j][1]) * t) / step);
    for (let k = 1; k < n; k++) out.push({ j, s: k / n });
  }
  out.push({ j: rows.length - 1, s: 0 });
  return out;
}

export interface ReliefField {
  /** 彫る所（角度。ラジアン） */
  a0: number;
  a1: number;
  /** 断面の行 r（小数）と指のまわりの角度 φ での深さ（mm） */
  depth(r: number, phi: number): number;
  /** この行に模様が出ることがあるか（網目を分ける範囲を決める） */
  rowMayCarve(r: number): boolean;
}

/**
 * 腕に沿った模様の場を作る。升の長さは、その場所の列の幅に比例する（腕が細くなると窓も小さくなる）。
 * at(a)：いちばん上からの角度 a での、幅・厚み・外の面の線の長さの半分
 */
export function makeReliefField(p: ReliefParams, o: { a0: number; a1: number; v: readonly number[]; innerR: number; at: (a: number) => { w: number; t: number; arc: number } }): ReliefField {
  const { a0, a1, v } = o;
  const count = Math.max(1, Math.round(p.count));
  const cols = Math.max(1, Math.round(p.columns ?? 1));
  const N = 192;
  const uT = new Float64Array(N + 1);
  const LT = new Float64Array(N + 1);
  const arcT = new Float64Array(N + 1);
  let cum = 0;
  const da = (a1 - a0) / N;
  const samples = Array.from({ length: N + 1 }, (_, i) => o.at(a0 + da * i));
  const ratio = SHAPE.ratio[p.kind];
  // 升の長さのもと：列の幅 × 割合
  const L0 = samples.map((s) => {
    const U = Math.max(0.1, s.arc - Math.min(SHAPE.edgeMm, s.arc * 0.3));
    return Math.max(0.2, (2 * U) / columnsOf(p.kind, U, cols)) * ratio;
  });
  for (let i = 0; i <= N; i++) {
    uT[i] = cum;
    if (i < N) cum += ((o.innerR + samples[i].t) * da) / L0[i];
  }
  const k = count / cum;
  let arcMax = 0;
  for (let i = 0; i <= N; i++) {
    uT[i] *= k;
    LT[i] = L0[i] / k;
    arcT[i] = samples[i].arc;
    arcMax = Math.max(arcMax, samples[i].arc);
  }
  const lerp = (t: Float64Array, s: number) => {
    const i = Math.min(N - 1, Math.floor(s));
    return t[i] + (t[i + 1] - t[i]) * (s - i);
  };
  const vAt = (r: number) => {
    const j = Math.min(v.length - 2, Math.max(0, Math.floor(r)));
    return v[j] + (v[j + 1] - v[j]) * (r - j);
  };
  const fade = SHAPE.fadeCells;
  // 模様が出ることがある幅（腕の縁からの余白の外）
  const vMax = 1 - (SHAPE.edgeMm * 0.3 - 0.02) / Math.max(arcMax, 0.2);
  return {
    a0,
    a1,
    rowMayCarve: (r) => Math.abs(vAt(r)) < vMax,
    depth(r, phi) {
      // いちばん上からの角度（φ は腕の端の分だけ 0〜2π の外へ出ることがある）
      const p0 = phi < 0 ? phi + TWO_PI : phi > TWO_PI ? phi - TWO_PI : phi;
      const a = p0 > Math.PI ? TWO_PI - p0 : p0;
      if (a <= a0 || a >= a1) return 0;
      const s = (a - a0) / da;
      const u = lerp(uT, s);
      // はじめと終わりは、深さが 0 まで なめらかに消える
      const env = smooth(u / fade) * smooth((count - u) / fade);
      if (env <= 0) return 0;
      const arc = lerp(arcT, s);
      const d = reliefPattern(p.kind, u, vAt(r) * arc, lerp(LT, s), arc, cols);
      return d <= 0 ? 0 : p.depthMm * d * env;
    },
  };
}

export interface PatchOptions {
  /** 断面の行の範囲と、指のまわりの列の範囲（どちらも番号。r0〜r1、c0〜c1 の升を作る） */
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  /** その所の深さ（mm。r・c は小数） */
  depth: (r: number, c: number) => number;
  /** その所の点。整数の r・c では、外の格子の点と同じ値を返すこと */
  vertex: (r: number, c: number) => V3;
  /** 行 k と k ＋ 1、列 j と j ＋ 1 の間の長さ（mm） */
  rowMm: (k: number) => number;
  colMm: (j: number) => number;
  /** いちばん小さい升（mm）と、面との差の許し（mm） */
  minCellMm: number;
  tolMm: number;
  /** 面の向き。true：(r, c) → (r, c＋1) → (r＋1, c＋1) → (r＋1, c)（ringsToTube と同じ）。false は逆回り（stackLoops と同じ） */
  tubeOrder: boolean;
  /** その所の面の向き（光の当たり方）。seg は升のある行の区間（折れ目の向こうを見ないため）。r は seg〜seg＋1 */
  normal: (seg: number, r: number, c: number) => V3;
}

/**
 * 面の一部を、深さが変わる所だけ細かく分けて三角形にする。外の縁の升は深さが 0 なので分けない（外の格子とそのままつながる）。
 * 分け方のちがう升どうしの辺には、となりの点を入れてから三角形にする（すき間が出ない）
 */
export function adaptivePatch(o: PatchOptions, out: number[], normalsOut: number[]): void {
  const M = RELIEF_MESH.lattice;
  const key = (rI: number, cI: number) => rI * 2000003 + cI;
  const H = (rI: number, cI: number) => o.depth(rI / M, cI / M);
  const corners = new Set<number>();
  const leaves: [number, number, number, number][] = [];
  const spanR = (ri0: number, ri1: number) => (o.rowMm(Math.floor(ri0 / M)) * (ri1 - ri0)) / M;
  const spanC = (ci0: number, ci1: number) => (o.colMm(Math.floor(ci0 / M)) * (ci1 - ci0)) / M;
  const split = (ri0: number, ri1: number, ci0: number, ci1: number) => {
    const canR = ri1 - ri0 >= 2 && spanR(ri0, ri1) > o.minCellMm;
    const canC = ci1 - ci0 >= 2 && spanC(ci0, ci1) > o.minCellMm;
    let goR = false;
    let goC = false;
    if (canR || canC) {
      // 土台の升は細かく見る（細い線を見落とさない）
      const n = ri1 - ri0 >= M && ci1 - ci0 >= M ? 4 : 2;
      const grid: number[][] = [];
      for (let a = 0; a <= n; a++) {
        const row: number[] = [];
        for (let b = 0; b <= n; b++) row.push(H(ri0 + ((ri1 - ri0) * a) / n, ci0 + ((ci1 - ci0) * b) / n));
        grid.push(row);
      }
      let errR = 0;
      let errC = 0;
      let err = 0;
      for (let a = 0; a <= n; a++)
        for (let b = 0; b <= n; b++) {
          const ta = a / n;
          const tb = b / n;
          const bil = (grid[0][0] * (1 - tb) + grid[0][n] * tb) * (1 - ta) + (grid[n][0] * (1 - tb) + grid[n][n] * tb) * ta;
          err = Math.max(err, Math.abs(grid[a][b] - bil));
          errR = Math.max(errR, Math.abs(grid[a][b] - (grid[0][b] * (1 - ta) + grid[n][b] * ta)));
          errC = Math.max(errC, Math.abs(grid[a][b] - (grid[a][0] * (1 - tb) + grid[a][n] * tb)));
        }
      const tol = o.tolMm;
      goR = canR && errR > tol;
      goC = canC && errC > tol;
      // どちらの向きにも線の上は変わらないのに、ねじれているとき
      if (!goR && !goC && err > tol) {
        goR = canR;
        goC = canC;
      }
    }
    if (!goR && !goC) {
      leaves.push([ri0, ri1, ci0, ci1]);
      for (const [r, c] of [[ri0, ci0], [ri0, ci1], [ri1, ci0], [ri1, ci1]]) corners.add(key(r, c));
      return;
    }
    const rm = goR ? Math.floor((ri0 + ri1) / 2) : ri1;
    const cm = goC ? Math.floor((ci0 + ci1) / 2) : ci1;
    split(ri0, rm, ci0, cm);
    if (goC) split(ri0, rm, cm, ci1);
    if (goR) split(rm, ri1, ci0, cm);
    if (goR && goC) split(rm, ri1, cm, ci1);
  };
  for (let k = o.r0; k < o.r1; k++)
    for (let j = o.c0; j < o.c1; j++) {
      // いちばん外の升は分けない（外の格子とつながる辺に、余計な点を作らない）
      if (k === o.r0 || k === o.r1 - 1 || j === o.c0 || j === o.c1 - 1) {
        leaves.push([k * M, (k + 1) * M, j * M, (j + 1) * M]);
        for (const [r, c] of [[k, j], [k, j + 1], [k + 1, j], [k + 1, j + 1]]) corners.add(key(r * M, c * M));
      } else split(k * M, (k + 1) * M, j * M, (j + 1) * M);
    }
  // となりの升との大きさの差を 2 倍までにする（大きな升の細長い三角形が、光の筋に見えないように）
  for (let pass = 0; pass < 3; pass++) {
    const next: [number, number, number, number][] = [];
    let changed = false;
    for (const leaf of leaves) {
      const [ri0, ri1, ci0, ci1] = leaf;
      const outerR = ri0 < (o.r0 + 1) * M || ri1 > (o.r1 - 1) * M;
      const outerC = ci0 < (o.c0 + 1) * M || ci1 > (o.c1 - 1) * M;
      // 辺の途中の点の数を数える（2 つ以上なら、となりが 2 倍より細かい）
      let onCEdge = 0;
      let onCEdge2 = 0;
      for (let c = ci0 + 1; c < ci1; c++) {
        if (corners.has(key(ri0, c))) onCEdge++;
        if (corners.has(key(ri1, c))) onCEdge2++;
      }
      let onREdge = 0;
      let onREdge2 = 0;
      for (let r = ri0 + 1; r < ri1; r++) {
        if (corners.has(key(r, ci0))) onREdge++;
        if (corners.has(key(r, ci1))) onREdge2++;
      }
      const splitC = !outerR && !outerC && ci1 - ci0 >= 2 && Math.max(onCEdge, onCEdge2) > 1;
      const splitR = !outerR && !outerC && ri1 - ri0 >= 2 && Math.max(onREdge, onREdge2) > 1;
      if (!splitC && !splitR) {
        next.push(leaf);
        continue;
      }
      changed = true;
      const rm = splitR ? Math.floor((ri0 + ri1) / 2) : ri1;
      const cm = splitC ? Math.floor((ci0 + ci1) / 2) : ci1;
      const add = (a: number, b: number, c: number, d: number) => {
        next.push([a, b, c, d]);
        for (const [r, cc] of [[a, c], [a, d], [b, c], [b, d]]) corners.add(key(r, cc));
      };
      add(ri0, rm, ci0, cm);
      if (splitC) add(ri0, rm, cm, ci1);
      if (splitR) add(rm, ri1, ci0, cm);
      if (splitR && splitC) add(rm, ri1, cm, ci1);
    }
    leaves.length = 0;
    leaves.push(...next);
    if (!changed) break;
  }
  const cache = new Map<number, V3>();
  const point = (rI: number, cI: number): V3 => {
    const id = key(rI, cI);
    let q = cache.get(id);
    if (!q) {
      q = o.vertex(rI / M, cI / M);
      cache.set(id, q);
    }
    return q;
  };
  const normalCache = new Map<number, V3>();
  const normalAt = (seg: number, rI: number, cI: number): V3 => {
    // 折れ目の行の点は、升のある側ごとに向きがちがう
    const id = key(rI, cI) * 2 + (rI === (seg + 1) * M ? 1 : 0);
    let q = normalCache.get(id);
    if (!q) {
      q = o.normal(seg, rI / M, cI / M);
      normalCache.set(id, q);
    }
    return q;
  };
  const tri = (a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3) => {
    if (o.tubeOrder) {
      pushTri(out, a, b, c);
      pushTri(normalsOut, na, nb, nc);
    } else {
      pushTri(out, a, c, b);
      pushTri(normalsOut, na, nc, nb);
    }
  };
  for (const [ri0, ri1, ci0, ci1] of leaves) {
    const seg = Math.floor(ri0 / M);
    // 升のまわりの点を順に（となりの細かい升の角も入れる）
    const loop: [number, number][] = [];
    for (let c = ci0; c < ci1; c++) if (c === ci0 || corners.has(key(ri0, c))) loop.push([ri0, c]);
    for (let r = ri0; r < ri1; r++) if (r === ri0 || corners.has(key(r, ci1))) loop.push([r, ci1]);
    for (let c = ci1; c > ci0; c--) if (c === ci1 || corners.has(key(ri1, c))) loop.push([ri1, c]);
    for (let r = ri1; r > ri0; r--) if (r === ri1 || corners.has(key(r, ci0))) loop.push([r, ci0]);
    if (loop.length === 4) {
      // 深さの差の小さい対角線で分ける（線の縁がのこぎりの歯にならない）
      const [a, b, c, d] = loop.map(([r, cc]) => point(r, cc));
      const [na, nb, nc, nd] = loop.map(([r, cc]) => normalAt(seg, r, cc));
      const [ha, hb, hc, hd] = loop.map(([r, cc]) => H(r, cc));
      if (Math.abs(ha - hc) <= Math.abs(hb - hd)) {
        tri(a, b, c, na, nb, nc);
        tri(a, c, d, na, nc, nd);
      } else {
        tri(a, b, d, na, nb, nd);
        tri(b, c, d, nb, nc, nd);
      }
      continue;
    }
    // 辺の途中に点があるときは、真ん中の点から扇に
    const center = o.vertex((ri0 + ri1) / 2 / M, (ci0 + ci1) / 2 / M);
    const nCenter = o.normal(seg, (ri0 + ri1) / 2 / M, (ci0 + ci1) / 2 / M);
    for (let i = 0; i < loop.length; i++) {
      const [r1, c1] = loop[i];
      const [r2, c2] = loop[(i + 1) % loop.length];
      tri(center, point(r1, c1), point(r2, c2), nCenter, normalAt(seg, r1, c1), normalAt(seg, r2, c2));
    }
  }
}
