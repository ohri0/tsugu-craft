// 布目象嵌の模様（2026-11-07 作者の頼み：模様を選んで、大きさ・線の太さ・帯の幅・金か銀を変える。作れない形は赤と理由で）。画面に依存しない純粋な関数。
// - 模様は、腕の外の面に広げた平らな座標（u：指のまわりに沿った長さ mm、いちばん上が 0。v：断面に沿った長さ mm、真ん中が 0）の線と面。
//   線（線材を打ちこむ）は折れ線、面（平金＝うすい板を打ちこむ）は多角形。3D では、この線と面を絵にして腕の面に貼る（src/ui/nunome-tex.ts）。
// - 作れるかの確かめ（checkNunome）は、手で打ちこめない・はがれる・欠ける形だけを見る（作者の言葉「能力が高ければ大体できる。でも不可能な形はある」）。
//   線の太さ・平金の厚み・となりの線との間の地・離れた小さなかけら・帯が腕の面に収まるか。値は GUIDES.inlay（目安帳で職人が上書きできる）。
// - 模様の形（くり返しの大きさ・比）は伝統の模様の形から自分で作った。大きさの はじめの値は **仮**（見た目の好み。作者が見て直す）。
import { GUIDES, type Guides } from "../rules/guides.js";

export type NunomePattern = "hishi" | "shippo" | "asanoha" | "seigaiha" | "kikko" | "ichimatsu" | "karakusa" | "suji" | "naname" | "jiyu";
export const NUNOME_PATTERNS: readonly NunomePattern[] = ["hishi", "shippo", "asanoha", "seigaiha", "kikko", "ichimatsu", "karakusa", "suji", "naname", "jiyu"];
export const NUNOME_LABEL: Record<NunomePattern, string> = {
  hishi: "菱つなぎ",
  shippo: "七宝",
  asanoha: "麻の葉",
  seigaiha: "青海波",
  kikko: "亀甲",
  ichimatsu: "市松",
  karakusa: "唐草",
  suji: "筋",
  naname: "斜め筋",
  jiyu: "自分の模様",
};
/** 模様の、ふつうの言葉の一行 */
export const NUNOME_NOTE: Record<NunomePattern, string> = {
  hishi: "ひし形を、すき間なくつないだ模様",
  shippo: "同じ大きさの円を、四分の一ずつ重ねてつないだ模様",
  asanoha: "六つの葉が星のように集まる、麻の葉の形",
  seigaiha: "半円の波を、うろこのように重ねた模様",
  kikko: "亀の甲羅のような、六角形の並び",
  ichimatsu: "四角を、色ちがいに交互に並べた模様（平金を打ちこむ）",
  karakusa: "つるが波のようにのび、先がくるりと巻く模様",
  suji: "腕に沿って、まっすぐな線を並べる",
  naname: "斜めの線を、同じ間かくで並べる",
  jiyu: "4 × 4 のマス目に描いた形を、くり返して並べる（平金を打ちこむ）",
};
/** 線で作る模様（線材）か、面で作る模様（平金）か */
export const NUNOME_FORM: Record<NunomePattern, "line" | "fill"> = {
  hishi: "line",
  shippo: "line",
  asanoha: "line",
  seigaiha: "line",
  kikko: "line",
  ichimatsu: "fill",
  karakusa: "line",
  suji: "line",
  naname: "line",
  jiyu: "fill",
};
/** 模様の大きさ（くり返し 1 つ分の大きさ mm）の はじめの値。**仮**（見た目の好み） */
export const NUNOME_SCALE: Record<NunomePattern, number> = {
  hishi: 1.0,
  shippo: 1.2,
  asanoha: 1.6,
  seigaiha: 2.6,
  kikko: 1.2,
  ichimatsu: 0.9,
  karakusa: 2.4,
  suji: 0.5,
  naname: 0.6,
  jiyu: 1.6,
};
/** 自分の模様のマス目の数（一辺） */
export const JIYU_N = 4;
/** 自分の模様の はじめのマス目（真ん中の 2 × 2） */
export const JIYU_DEFAULT = "0000011001100000";

export type NunomeMetal = "gold" | "silver";
export const NUNOME_METAL_LABEL: Record<NunomeMetal, string> = { gold: "純金", silver: "純銀" };

export interface NunomeDesign {
  pattern: NunomePattern;
  /** 模様の大きさ（くり返し 1 つ分。mm） */
  scaleMm: number;
  /** 線の太さ（打ちこむ線材の直径。mm） */
  lineMm: number;
  /** 帯の幅（腕の外の面の真ん中、断面に沿った長さ。mm） */
  widthMm: number;
  /** はめこむ地金（なければ地金で決める：金の地金には純銀、ほかには純金） */
  metal?: NunomeMetal;
  /** 帯の両縁の線（なければあり） */
  border?: boolean;
  /** 指のまわりのどこまで入れるか（1 ＝ 一周、0.5 ＝ 上の半周、0.34 ＝ 上の三分の一）。なければ一周 */
  around?: number;
  /** 平金の厚み（面の模様。mm）。なければ GUIDES.inlay.foilMm */
  foilMm?: number;
  /** 模様を回す（度） */
  rotateDeg?: number;
  /** 腕に沿う向きに伸ばす（1 ＝ そのまま） */
  stretch?: number;
  /** 上下に裏返す */
  mirror?: boolean;
  /** 腕に沿ってずらす（mm） */
  offsetMm?: number;
  /** 自分の模様のマス目（"0" と "1" が JIYU_N × JIYU_N。上の行から） */
  cells?: string;
}

/** 入力の広さ（画面のつまみと Claude の入力。作れるかは checkNunome が見るので、作れない値も入れられる） */
export const NUNOME_RANGE = {
  scaleMm: [0.2, 8],
  lineMm: [0.05, 1.5],
  widthMm: [0.4, 12],
  foilMm: [0.02, 0.6],
  rotateDeg: [-90, 90],
  stretch: [0.5, 2.5],
  offsetMm: [-10, 10],
} as const;
export const NUNOME_AROUND: readonly { v: number; label: string }[] = [
  { v: 1, label: "一周" },
  { v: 0.5, label: "上の半周" },
  { v: 0.34, label: "上の三分の一" },
];

export function defaultNunome(pattern: NunomePattern = "hishi"): NunomeDesign {
  return { pattern, scaleMm: NUNOME_SCALE[pattern], lineMm: GUIDES.finish.nunome.lineMm, widthMm: GUIDES.finish.nunome.bandMm, border: true, around: 1, ...(pattern === "jiyu" ? { cells: JIYU_DEFAULT } : {}) };
}

/** 仕上げの記録から、布目象嵌の模様（前の記録は模様がなく、菱つなぎ） */
export function nunomeOf(f: { inlay?: "nunome"; nunome?: NunomeDesign } | undefined): NunomeDesign | null {
  if (!f?.inlay) return null;
  return { ...defaultNunome(f.nunome?.pattern ?? "hishi"), ...(f.nunome ?? {}) };
}

/** 模様の値の確かめ（入力の形。作れるかではない）。よければ null、だめなら理由 */
export function validateNunome(d: Partial<NunomeDesign>): string | null {
  if (d.pattern !== undefined && !NUNOME_PATTERNS.includes(d.pattern)) return `模様は ${NUNOME_PATTERNS.join(" / ")} のどれかです`;
  for (const k of Object.keys(NUNOME_RANGE) as (keyof typeof NUNOME_RANGE)[]) {
    const v = d[k];
    if (v === undefined) continue;
    const [lo, hi] = NUNOME_RANGE[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) return `模様の ${k} は ${lo}〜${hi} の数です（今は ${String(v)}）`;
  }
  if (d.around !== undefined && !NUNOME_AROUND.some((a) => a.v === d.around)) return `模様を入れる回りは ${NUNOME_AROUND.map((a) => a.v).join(" / ")} のどれかです`;
  if (d.metal !== undefined && d.metal !== "gold" && d.metal !== "silver") return "はめこむ地金は gold か silver です";
  if (d.border !== undefined && typeof d.border !== "boolean") return "縁の線は true か false です";
  if (d.mirror !== undefined && typeof d.mirror !== "boolean") return "裏返しは true か false です";
  if (d.cells !== undefined && (typeof d.cells !== "string" || !new RegExp(`^[01]{${JIYU_N * JIYU_N}}$`).test(d.cells))) return `自分の模様のマス目は "0" と "1" を ${JIYU_N * JIYU_N} 字で書きます`;
  return null;
}

/** はめこむ地金（選んでいなければ、金の地金には純銀、ほかには純金。金・銀は煮色で色が変わらない） */
export const nunomeMetal = (d: NunomeDesign, goldBase: boolean): NunomeMetal => d.metal ?? (goldBase ? "silver" : "gold");

// ---- 模様の形 ----

type V = [number, number];

/** くり返しの格子（a・b のベクトル）と、格子の点ごとに置く線と面（格子の点を 0 とした mm） */
interface Motif {
  a: V;
  b: V;
  lines: V[][];
  fills: V[][];
  /** 模様そのものの向き（斜め筋は 45°） */
  baseDeg?: number;
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): V[] => Array.from({ length: n + 1 }, (_, i) => {
  const t = a0 + ((a1 - a0) * i) / n;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as V;
});

const motifCache = new Map<string, Motif>();
function motifOf(d: NunomeDesign): Motif {
  const s = d.scaleMm;
  const key = `${d.pattern}_${s}_${d.cells ?? ""}`;
  const hit = motifCache.get(key);
  if (hit) return hit;
  let m: Motif;
  switch (d.pattern) {
    case "hishi": {
      // ひし形：横 s・縦 0.6 s（形の比は伝統の菱から。仮）
      const h = 0.6 * s;
      m = { a: [s, 0], b: [0, h], lines: [[[s / 2, 0], [s, h / 2], [s / 2, h], [0, h / 2], [s / 2, 0]]], fills: [] };
      break;
    }
    case "shippo": {
      // 正方形の格子の点に、半径 s/√2 の円（となりの円と四分の一ずつ重なる）
      m = { a: [s, 0], b: [0, s], lines: [arc(0, 0, s / Math.SQRT2, 0, 2 * Math.PI, 72)], fills: [] };
      break;
    }
    case "asanoha": {
      // 正三角形の格子の辺と、三角形の頂点から真ん中への線
      const h = (s * Math.sqrt(3)) / 2;
      const gu: V = [s / 2, h / 3];
      const gd: V = [s, (2 * h) / 3];
      m = {
        a: [s, 0],
        b: [s / 2, h],
        lines: [
          [[0, 0], [s, 0]],
          [[0, 0], [s / 2, h]],
          [[s, 0], [s / 2, h]],
          [[0, 0], gu],
          [[s, 0], gu],
          [[s / 2, h], gu],
          [[s, 0], gd],
          [[1.5 * s, h], gd],
          [[s / 2, h], gd],
        ],
        fills: [],
      };
      break;
    }
    case "kikko": {
      // 六角形（さしわたし s ＝ 平らな辺から辺まで）。となりと共有しない 3 辺だけを置く
      const c = s / Math.sqrt(3);
      const vk = (k: number): V => [c * Math.cos(((90 + 60 * k) * Math.PI) / 180), c * Math.sin(((90 + 60 * k) * Math.PI) / 180)];
      m = { a: [s, 0], b: [s / 2, 1.5 * c], lines: [[vk(4), vk(5), vk(0), vk(1)]], fills: [] };
      break;
    }
    case "seigaiha": {
      // 半径 R ＝ s/2 の半円を 3 重に。下の段（手前）の半円に隠れる所は描かない
      const R = s / 2;
      const a: V = [2 * R, 0];
      const b: V = [R, R / 2];
      const front: V[] = [];
      for (let j = -3; j <= -1; j++) for (let i = -4; i <= 4; i++) front.push([i * a[0] + j * b[0], i * a[1] + j * b[1]]);
      const hidden = (p: V) => front.some((q) => p[1] >= q[1] - 1e-9 && Math.hypot(p[0] - q[0], p[1] - q[1]) < R - 1e-6);
      const lines: V[][] = [];
      for (let k = 1; k <= 3; k++) {
        const pts = arc(0, 0, (R * k) / 3, 0, Math.PI, 48);
        let run: V[] = [];
        for (const p of pts) {
          if (hidden(p)) {
            if (run.length > 1) lines.push(run);
            run = [];
          } else run.push(p);
        }
        if (run.length > 1) lines.push(run);
      }
      m = { a, b, lines, fills: [] };
      break;
    }
    case "ichimatsu": {
      m = { a: [2 * s, 0], b: [s, s], lines: [], fills: [[[0, -s / 2], [s, -s / 2], [s, s / 2], [0, s / 2]]] };
      break;
    }
    case "karakusa": {
      // つる（波）と、山と谷でくるりと巻く先。一つの波の長さ s
      const amp = 0.18 * s;
      const stem: V[] = Array.from({ length: 33 }, (_, i) => [(s * i) / 32, amp * Math.sin((2 * Math.PI * i) / 32)] as V);
      const r0 = 0.16 * s;
      const start: V = [s / 4, amp];
      const curl: V[] = Array.from({ length: 41 }, (_, i) => {
        const t = (1.3 * Math.PI * i) / 40;
        const r = r0 * (1 - (0.45 * t) / (2 * Math.PI));
        return [start[0] + r0 + r * Math.cos(Math.PI - t), start[1] + r * Math.sin(Math.PI - t)] as V;
      });
      const curl2 = curl.map(([x, y]) => [s - x, -y] as V);
      m = { a: [s, 0], b: [s / 2, 0.95 * s], lines: [stem, curl, curl2], fills: [] };
      break;
    }
    case "suji":
    case "naname": {
      // 線の間かく s
      m = { a: [s, 0], b: [0, s], lines: [[[0, 0], [s, 0]]], fills: [], baseDeg: d.pattern === "naname" ? 45 : 0 };
      break;
    }
    case "jiyu": {
      const c = s / JIYU_N;
      const cells = d.cells ?? JIYU_DEFAULT;
      const fills: V[][] = [];
      for (let r = 0; r < JIYU_N; r++)
        for (let k = 0; k < JIYU_N; k++) {
          if (cells[r * JIYU_N + k] !== "1") continue;
          // 上の行が上（v の大きい側）
          const y0 = (JIYU_N - 1 - r) * c - s / 2;
          fills.push([[k * c, y0], [(k + 1) * c, y0], [(k + 1) * c, y0 + c], [k * c, y0 + c]]);
        }
      m = { a: [s, 0], b: [0, s], lines: [], fills };
      break;
    }
  }
  motifCache.set(key, m);
  return m;
}

export interface NunomeLayout {
  design: NunomeDesign;
  /** 外の面の一周（mm） */
  circumferenceMm: number;
  /** 帯の半分の幅（mm） */
  halfMm: number;
  /** 模様を入れる所の指のまわりの範囲（u0〜u1 mm。一周なら −C/2〜C/2） */
  u0: number;
  u1: number;
  full: boolean;
  /** 線（線材）の切れはし。縁の線は borders */
  lines: V[][];
  borders: V[][];
  /** 面（平金） */
  fills: V[][];
  /** 一周にちょうど並ぶように合わせたくり返しの長さ（mm。回した模様は合わせない） */
  repeatMm: number;
  /** 線の長さの合計（mm）と、平金の面積（mm²） */
  wireLengthMm: number;
  foilAreaMm2: number;
}

const rot = (p: V, deg: number): V => {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};

/** 線分を四角に切る（Liang–Barsky）。残る部分の t の範囲 */
function clipSeg(p: V, q: V, x0: number, x1: number, y0: number, y1: number): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const sides: [number, number][] = [
    [-dx, p[0] - x0],
    [dx, x1 - p[0]],
    [-dy, p[1] - y0],
    [dy, y1 - p[1]],
  ];
  for (const [pp, qq] of sides) {
    if (Math.abs(pp) < 1e-12) {
      if (qq < 0) return null;
      continue;
    }
    const r = qq / pp;
    if (pp < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return t1 - t0 > 1e-9 ? [t0, t1] : null;
}

/** 多角形を四角に切る（Sutherland–Hodgman） */
function clipPoly(poly: V[], x0: number, x1: number, y0: number, y1: number): V[] {
  const edges: [(p: V) => boolean, (p: V, q: V) => V][] = [
    [(p) => p[0] >= x0, (p, q) => [x0, p[1] + ((q[1] - p[1]) * (x0 - p[0])) / (q[0] - p[0])]],
    [(p) => p[0] <= x1, (p, q) => [x1, p[1] + ((q[1] - p[1]) * (x1 - p[0])) / (q[0] - p[0])]],
    [(p) => p[1] >= y0, (p, q) => [p[0] + ((q[0] - p[0]) * (y0 - p[1])) / (q[1] - p[1]), y0]],
    [(p) => p[1] <= y1, (p, q) => [p[0] + ((q[0] - p[0]) * (y1 - p[1])) / (q[1] - p[1]), y1]],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    if (!out.length) break;
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const p = src[i];
      const q = src[(i + 1) % src.length];
      const ip = inside(p);
      const iq = inside(q);
      if (ip) out.push(p);
      if (ip !== iq) out.push(cut(p, q));
    }
  }
  return out;
}

const polyArea = (p: readonly V[]) => Math.abs(p.reduce((s, a, i) => {
  const b = p[(i + 1) % p.length];
  return s + a[0] * b[1] - b[0] * a[1];
}, 0)) / 2;
const polyLen = (p: readonly V[]) => p.reduce((s, a, i) => (i ? s + Math.hypot(a[0] - p[i - 1][0], a[1] - p[i - 1][1]) : 0), 0);

/**
 * 模様を帯に並べる。circumferenceMm：模様を入れる面の一周（外の半径 × 2π）。
 * 回していない模様は、一周にちょうど整数個並ぶように、腕に沿う向きの大きさを少しだけ合わせる（継ぎ目が出ない）。回した模様は合わせない（継ぎ目は手のひら側）
 */
export function nunomeLayout(d: NunomeDesign, circumferenceMm: number, o: { clipU?: [number, number] } = {}): NunomeLayout {
  const C = circumferenceMm;
  const m = motifOf(d);
  const H = d.widthMm / 2;
  const lw = d.lineMm;
  const border = d.border !== false;
  const full = (d.around ?? 1) >= 0.999;
  const L = full ? C : C * (d.around ?? 1);
  const u0 = o.clipU ? Math.max(-L / 2, o.clipU[0]) : -L / 2;
  const u1 = o.clipU ? Math.min(L / 2, o.clipU[1]) : L / 2;
  const deg = (m.baseDeg ?? 0) + (d.rotateDeg ?? 0);
  let stretch = d.stretch ?? 1;
  const unrotated = Math.abs(((deg % 180) + 180) % 180) < 1e-9 && Math.abs(m.a[1]) < 1e-12;
  let repeat = m.a[0] * stretch;
  if (unrotated) {
    const n = Math.max(1, Math.round(C / repeat));
    stretch *= C / (n * repeat);
    repeat = C / n;
  }
  const flip = d.mirror ? -1 : 1;
  const off = d.offsetMm ?? 0;
  const toWorld = (p: V): V => {
    const r = rot([p[0] * stretch, p[1] * flip], deg);
    return [r[0] + off, r[1]];
  };
  // 帯（線の中心が入る所）
  const hc = Math.max(0, H - lw / 2);
  const hf = border ? Math.max(0, H - lw) : H;
  // 必要な格子の番号の範囲：帯の四隅を模様の座標へ戻して、格子の番号を出す
  const inv = (u: number, v: number): V => {
    const r = rot([u - off, v], -deg);
    return [r[0] / stretch, (r[1] * flip)];
  };
  const det = m.a[0] * m.b[1] - m.a[1] * m.b[0];
  const ij = (p: V): V => [(p[0] * m.b[1] - p[1] * m.b[0]) / det, (m.a[0] * p[1] - m.a[1] * p[0]) / det];
  let imin = Infinity;
  let imax = -Infinity;
  let jmin = Infinity;
  let jmax = -Infinity;
  for (const [u, v] of [[u0, -H], [u1, -H], [u0, H], [u1, H]] as V[]) {
    const [i, j] = ij(inv(u, v));
    imin = Math.min(imin, i);
    imax = Math.max(imax, i);
    jmin = Math.min(jmin, j);
    jmax = Math.max(jmax, j);
  }
  const pad = 3;
  const lines: V[][] = [];
  const fills: V[][] = [];
  for (let j = Math.floor(jmin) - pad; j <= Math.ceil(jmax) + pad; j++)
    for (let i = Math.floor(imin) - pad; i <= Math.ceil(imax) + pad; i++) {
      const ox = i * m.a[0] + j * m.b[0];
      const oy = i * m.a[1] + j * m.b[1];
      for (const pl of m.lines) {
        const w = pl.map((p) => toWorld([p[0] + ox, p[1] + oy]));
        let run: V[] = [];
        for (let k = 1; k < w.length; k++) {
          const c = clipSeg(w[k - 1], w[k], u0, u1, -hc, hc);
          if (!c) {
            if (run.length > 1) lines.push(run);
            run = [];
            continue;
          }
          const a: V = [w[k - 1][0] + (w[k][0] - w[k - 1][0]) * c[0], w[k - 1][1] + (w[k][1] - w[k - 1][1]) * c[0]];
          const b: V = [w[k - 1][0] + (w[k][0] - w[k - 1][0]) * c[1], w[k - 1][1] + (w[k][1] - w[k - 1][1]) * c[1]];
          if (!run.length) run.push(a);
          else if (Math.hypot(run[run.length - 1][0] - a[0], run[run.length - 1][1] - a[1]) > 1e-7) {
            if (run.length > 1) lines.push(run);
            run = [a];
          }
          run.push(b);
          if (c[1] < 1 - 1e-9) {
            lines.push(run);
            run = [];
          }
        }
        if (run.length > 1) lines.push(run);
      }
      for (const pg of m.fills) {
        const w = pg.map((p) => toWorld([p[0] + ox, p[1] + oy]));
        const c = clipPoly(w, u0, u1, -hf, hf);
        if (c.length >= 3 && polyArea(c) > 1e-6) fills.push(c);
      }
    }
  const borders: V[][] = border ? [[[u0, -hc], [u1, -hc]], [[u0, hc], [u1, hc]]] : [];
  return {
    design: d,
    circumferenceMm: C,
    halfMm: H,
    u0,
    u1,
    full,
    lines,
    borders,
    fills,
    repeatMm: repeat,
    wireLengthMm: [...lines, ...borders].reduce((s, l) => s + polyLen(l), 0),
    foilAreaMm2: fills.reduce((s, f) => s + polyArea(f), 0),
  };
}

// ---- 腕の面：象嵌の帯を入れられる所 ----

export interface FaceSpan {
  /** 断面のいちばん上の真ん中から、左（−x）と右（+x）へ、帯を入れられる面の長さ（断面に沿って mm） */
  leftMm: number;
  rightMm: number;
  /** 真ん中が角（溝の底・山の頂）の上か */
  centerCorner: boolean;
}

/**
 * 断面の外の線から、象嵌の帯を入れられる面の広さを出す（真ん中から左右へ、角か横の面に当たるまで）。
 * pts：断面の線（x：幅の向き、y：指の側からの高さ）。外の線の右の端 → 上 → 左の端の順（閉じた線なら、そのあと内の線）
 */
export function faceSpan(pts: readonly { x: number; y: number }[], closed: boolean, g: Guides = GUIDES): FaceSpan {
  // 0.02 mm ごとに置き直す
  const src = closed ? [...pts, pts[0]] : [...pts];
  const P: V[] = [];
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1];
    const b = src[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.02));
    for (let k = 0; k < n; k++) P.push([a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n]);
  }
  if (!closed) P.push([src[src.length - 1].x, src[src.length - 1].y]);
  const N = P.length;
  // いちばん上の真ん中：x ＝ 0 をまたぐ所のうち、いちばん高い所
  let i0 = -1;
  let best = -Infinity;
  for (let i = 0; i < N - (closed ? 0 : 1); i++) {
    const a = P[i];
    const b = P[(i + 1) % N];
    if ((a[0] > 0) === (b[0] > 0) && a[0] !== 0) continue;
    const t = Math.abs(b[0] - a[0]) < 1e-12 ? 0 : a[0] / (a[0] - b[0]);
    const y = a[1] + (b[1] - a[1]) * t;
    if (y > best) {
      best = y;
      i0 = i;
    }
  }
  if (i0 < 0) return { leftMm: 0, rightMm: 0, centerCorner: false };
  const at = (i: number): V | null => (closed ? P[((i % N) + N) % N] : i >= 0 && i < N ? P[i] : null);
  const W = 3;
  const cornerRad = (g.inlay.faceCornerDeg * Math.PI) / 180;
  const tiltCos = Math.cos((g.inlay.faceTiltDeg * Math.PI) / 180);
  /** その点での向きの変わり（前後 W 点の向きの差） */
  const turn = (i: number): number => {
    const a = at(i - W);
    const b = at(i);
    const c = at(i + W);
    if (!a || !b || !c) return 0;
    const d1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const d2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let t = d2 - d1;
    while (t > Math.PI) t -= 2 * Math.PI;
    while (t < -Math.PI) t += 2 * Math.PI;
    return Math.abs(t);
  };
  /** 外向きの面の向き（線の進む向き (dx, dy) に対して (dy, −dx)）の上向きの成分 */
  const up = (i: number, dir: 1 | -1): number => {
    const a = at(i);
    const b = at(i + dir);
    if (!a || !b) return -1;
    const dx = (b[0] - a[0]) * dir;
    const dy = (b[1] - a[1]) * dir;
    const l = Math.hypot(dx, dy) || 1;
    return -dx / l;
  };
  const centerCorner = turn(i0) > cornerRad || turn(i0 + 1) > cornerRad;
  const walk = (dir: 1 | -1): { len: number; side: number } => {
    let len = 0;
    let i = dir === 1 ? i0 + 1 : i0;
    let last = at(i);
    if (!last) return { len: 0, side: 0 };
    // 真ん中の点からの長さ
    const c0: V = [0, best];
    len = Math.hypot(last[0] - c0[0], last[1] - c0[1]);
    for (let k = 0; k < N; k++) {
      if (centerCorner) break;
      if (turn(i) > cornerRad || up(i, dir) < tiltCos) break;
      const nx = at(i + dir);
      if (!nx) break;
      len += Math.hypot(nx[0] - last[0], nx[1] - last[1]);
      last = nx;
      i += dir;
    }
    return { len: centerCorner ? 0 : len, side: last[0] };
  };
  const f = walk(1);
  const b = walk(-1);
  // 進む向きのどちらが左（−x）か
  const leftIsF = f.side < b.side;
  return { leftMm: leftIsF ? f.len : b.len, rightMm: leftIsF ? b.len : f.len, centerCorner };
}

// ---- 作れるかの確かめ ----

export type NunomeCheck = "nunome-line" | "nunome-gap" | "nunome-piece" | "nunome-fit" | "nunome-foil";

export interface NunomeIssue {
  check: NunomeCheck;
  title: string;
  current: string;
  required: string;
  currentValue: number;
  requiredValue: number;
  /** なぜ作れないか（手で打ちこめない・はがれる・欠ける） */
  why: string;
  /** 直し方の名前と、直した模様 */
  fixLabel: string;
  patch: Partial<NunomeDesign>;
}

export interface NunomeContext {
  circumferenceMm: number;
  /** 腕の面の広さ（分からなければ null：帯が収まるかは見ない） */
  face: FaceSpan | null;
}

const mm = (v: number, d = 2) => `${v.toFixed(d)} mm`;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * いちばん狭い地のすき間（となりの線・平金との間の地の幅。mm）。帯の真ん中の近くを細かいマス目にして、
 * 地のまとまりごとに「入るいちばん大きな円の直径」を出し、そのいちばん小さい値を返す。地がなければ Infinity
 */
export function narrowestGround(whole: NunomeLayout, g: Guides = GUIDES): number {
  const d = whole.design;
  const m = motifOf(d);
  const H = whole.halfMm;
  const lw = d.lineMm;
  const cell = Math.max(Math.hypot(...m.a), Math.hypot(...m.b)) * Math.max(1, d.stretch ?? 1);
  const span = Math.min((whole.u1 - whole.u0) / 2, Math.max(3 * cell, 2.5));
  const ua = Math.max(whole.u0, -span);
  const ub = Math.min(whole.u1, span);
  const lay = nunomeLayout(d, whole.circumferenceMm, { clipU: [ua - 0.5, ub + 0.5] });
  // マス目の細かさ：線と目安のすき間の 1/8 より細かく（多すぎるときは粗く）
  let h = Math.max(0.006, Math.min(lw, g.inlay.minGapMm, d.scaleMm) / 8);
  h = Math.max(h, Math.sqrt(((ub - ua) * 2 * H) / 400000));
  const nx = Math.max(4, Math.ceil((ub - ua) / h));
  const ny = Math.max(4, Math.ceil((2 * H) / h));
  const inlay = new Uint8Array(nx * ny);
  const X = (i: number) => ua + (i + 0.5) * h;
  const Y = (j: number) => -H + (j + 0.5) * h;
  const stroke = (pl: V[]) => {
    for (let k = 1; k < pl.length; k++) {
      const p = pl[k - 1];
      const q = pl[k];
      const i0 = Math.max(0, Math.floor((Math.min(p[0], q[0]) - lw - ua) / h));
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(p[0], q[0]) + lw - ua) / h));
      const j0 = Math.max(0, Math.floor((Math.min(p[1], q[1]) - lw + H) / h));
      const j1 = Math.min(ny - 1, Math.ceil((Math.max(p[1], q[1]) + lw + H) / h));
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const l2 = dx * dx + dy * dy || 1e-12;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const x = X(i);
          const y = Y(j);
          const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2));
          if (Math.hypot(x - p[0] - dx * t, y - p[1] - dy * t) <= lw / 2) inlay[j * nx + i] = 1;
        }
    }
  };
  for (const pl of [...lay.lines, ...lay.borders]) if (pl.some((p) => p[0] >= ua - 2 && p[0] <= ub + 2)) stroke(pl);
  for (const pg of lay.fills) {
    const xs = pg.map((p) => p[0]);
    const ys = pg.map((p) => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - ua) / h));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) - ua) / h));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) + H) / h));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(...ys) + H) / h));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = X(i);
        const y = Y(j);
        let inside = false;
        for (let k = 0, l = pg.length - 1; k < pg.length; l = k++) {
          const a = pg[k];
          const b = pg[l];
          if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        if (inside) inlay[j * nx + i] = 1;
      }
  }
  // 地の各点から、いちばん近い金銀までの距離（2 回の一次元の距離の変換）
  const INF = 1e12;
  const f = new Float64Array(nx * ny);
  for (let k = 0; k < f.length; k++) f[k] = inlay[k] ? 0 : INF;
  const dt1 = (get: (k: number) => number, set: (k: number, v: number) => void, n: number) => {
    const v = new Int32Array(n);
    const z = new Float64Array(n + 1);
    const ff = new Float64Array(n);
    for (let q = 0; q < n; q++) ff[q] = get(q);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (ff[q] + q * q - (ff[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (ff[q] + q * q - (ff[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      set(q, (q - v[k]) * (q - v[k]) + ff[v[k]]);
    }
  };
  for (let i = 0; i < nx; i++) dt1((j) => f[j * nx + i], (j, val) => (f[j * nx + i] = val), ny);
  for (let j = 0; j < ny; j++) dt1((i) => f[j * nx + i], (i, val) => (f[j * nx + i] = val), nx);
  // 地のまとまり
  // 地のまとまりごとに、入るいちばん大きな円。円が帯の縁（縁の線の内側の端・縁の線がなければ帯の端）や、見ている所の端に当たる所は使わない
  //（帯で切った半端な地や、見ている所で切れた地は、その円の大きさが本当の地の幅ではない）。斜めの筋のように縁から縁へのびる地も、真ん中で測れる
  const seen = new Uint8Array(nx * ny);
  const edgeIn = d.border !== false ? H - lw : H;
  let narrow = Infinity;
  let counted = 0;
  let ground = 0;
  const stack: number[] = [];
  for (let s0 = 0; s0 < nx * ny; s0++) {
    if (inlay[s0] || seen[s0]) continue;
    seen[s0] = 1;
    stack.push(s0);
    let maxAll = 0;
    const comp: number[] = [];
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      const i = k % nx;
      const j = (k - i) / nx;
      maxAll = Math.max(maxAll, f[k]);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const kk = b * nx + a;
        if (inlay[kk] || seen[kk]) continue;
        seen[kk] = 1;
        stack.push(kk);
      }
    }
    const count = comp.length;
    if (count > 3) ground += count;
    // 線が交わる鋭い角に残る、マス目 1〜3 つの地は、マス目の見かけ（数えない）
    if (count <= 3) continue;
    // いちばん大きな円（に近い円）を、縁や見ている所の端から離して置けない地（帯で切った半端な地）は数えない。
    // 筋のように、同じ大きさの円を縁から離して置ける地は数える
    let free = false;
    for (const k of comp) {
      if (f[k] < 0.81 * maxAll) continue;
      const i = k % nx;
      const j = (k - i) / nx;
      const room = Math.min(edgeIn - Math.abs(Y(j)), X(i) - ua, ub - X(i));
      if (room > Math.sqrt(f[k]) * h + 2 * h) {
        free = true;
        break;
      }
    }
    if (!free) continue;
    counted++;
    narrow = Math.min(narrow, 2 * Math.sqrt(maxAll) * h);
  }
  // 線の模様なのに、地がほとんど残らない：線どうしがつながってしまっている
  if (!counted && ground < 0.02 * nx * ny && (lay.lines.length || lay.fills.length)) return 0;
  return narrow;
}

/** 線分どうしのいちばん近い距離 */
function segDist(p1: V, q1: V, p2: V, q2: V): number {
  const pt = (p: V, a: V, b: V) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  };
  const cr = (a: V, b: V, c: V) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (cr(p1, q1, p2) * cr(p1, q1, q2) < 0 && cr(p2, q2, p1) * cr(p2, q2, q1) < 0) return 0;
  return Math.min(pt(p1, p2, q2), pt(q1, p2, q2), pt(p2, p1, q1), pt(q2, p1, q1));
}

export interface Sliver {
  kind: "wire" | "foil";
  /** 大きさ（線は長さ、平金は 4 × 面積 ÷ 周） */
  sizeMm: number;
  at: V;
}

/**
 * 離れた小さなかけら：ほかの線や平金とつながらず、目安（GUIDES.inlay.minPieceMm）より小さい金銀の切れはし。
 * 帯の端（縁の線がないとき）や、半周の端で切れた模様にできやすい。一周の継ぎ目で切れた物は、向こう側とつながるので数えない
 */
export function slivers(lay: NunomeLayout, g: Guides = GUIDES): Sliver[] {
  const min = g.inlay.minPieceMm;
  const lw = lay.design.lineMm;
  const out: Sliver[] = [];
  const atSeam = (pts: V[]) => lay.full && pts.some((p) => Math.abs(p[0] - lay.u0) < 1e-6 || Math.abs(p[0] - lay.u1) < 1e-6);
  // 線分を、腕に沿う向きの箱に分ける（近い物だけ比べる）
  const BIN = 1;
  const bins = new Map<number, { piece: number; a: V; b: V }[]>();
  const all = [...lay.lines, ...lay.borders];
  all.forEach((pl, pi) => {
    for (let k = 1; k < pl.length; k++) {
      const a = pl[k - 1];
      const b = pl[k];
      for (let x = Math.floor(Math.min(a[0], b[0]) / BIN); x <= Math.floor(Math.max(a[0], b[0]) / BIN); x++) {
        const list = bins.get(x) ?? [];
        list.push({ piece: pi, a, b });
        bins.set(x, list);
      }
    }
  });
  const near = (pl: V[], self: number, reach: number): boolean => {
    for (let k = 1; k < pl.length; k++) {
      const a = pl[k - 1];
      const b = pl[k];
      for (let x = Math.floor((Math.min(a[0], b[0]) - reach) / BIN); x <= Math.floor((Math.max(a[0], b[0]) + reach) / BIN); x++)
        for (const s of bins.get(x) ?? []) if (s.piece !== self && segDist(a, b, s.a, s.b) <= reach) return true;
      for (const f of lay.fills) if (f.some((q) => segDist(a, b, q, q) <= reach + lw / 2)) return true;
    }
    return false;
  };
  lay.lines.forEach((pl, pi) => {
    const len = polyLen(pl) + lw;
    if (len >= min || atSeam(pl)) return;
    if (near(pl, pi, lw * 0.9 + 1e-6)) return;
    out.push({ kind: "wire", sizeMm: len, at: pl[0] });
  });
  // 平金：辺を分け合う物は 1 つのかけら（角だけで接する市松は、別のかけら）
  const fills = lay.fills;
  const parent = fills.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const shared = new Float64Array(fills.length);
  const sharedLen = (a: V[], b: V[]): number => {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      const q = a[(i + 1) % a.length];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const l = Math.hypot(dx, dy);
      if (l < 1e-9) continue;
      for (let k = 0; k < b.length; k++) {
        const r = b[k];
        const t = b[(k + 1) % b.length];
        // 同じ線の上か
        const c1 = Math.abs((dx * (r[1] - p[1]) - dy * (r[0] - p[0])) / l);
        const c2 = Math.abs((dx * (t[1] - p[1]) - dy * (t[0] - p[0])) / l);
        if (c1 > 1e-6 || c2 > 1e-6) continue;
        const tr = ((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / (l * l);
        const tt = ((t[0] - p[0]) * dx + (t[1] - p[1]) * dy) / (l * l);
        const o = Math.min(1, Math.max(tr, tt)) - Math.max(0, Math.min(tr, tt));
        if (o > 0) s += o * l;
      }
    }
    return s;
  };
  for (let i = 0; i < fills.length; i++)
    for (let k = i + 1; k < fills.length; k++) {
      const s = sharedLen(fills[i], fills[k]);
      if (s > 1e-6) {
        parent[find(i)] = find(k);
        shared[i] += s;
        shared[k] += s;
      }
    }
  const groups = new Map<number, number[]>();
  fills.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  for (const ids of groups.values()) {
    if (ids.some((i) => atSeam(fills[i]))) continue;
    const A = ids.reduce((s, i) => s + polyArea(fills[i]), 0);
    const P = ids.reduce((s, i) => s + polyLen([...fills[i], fills[i][0]]) - shared[i], 0);
    const size = P > 0 ? (4 * A) / P : 0;
    if (size < min) out.push({ kind: "foil", sizeMm: size, at: fills[ids[0]][0] });
  }
  return out;
}

/**
 * 模様が作れるか。作れない所だけを、理由と直し方つきで返す（好みは見ない）。
 * - 線の太さ：打ちこむ線材の直径が資料の幅（0.15〜1.0 mm）の外。細すぎる線は切れて溝に入らず、太すぎる線は布目で留まらない。
 * - 平金の厚み（面の模様）：目安の外（**仮**）。
 * - 地のすき間：となりの線との間の地が、布目の溝 2 本分より狭い（**仮**）。
 * - 小さなかけら：ほかとつながらない、目安より小さい金銀（**仮**）。
 * - 帯が腕の面に収まるか：帯の端から面の角まで、目安の残しがあるか（**仮**）
 */
export function checkNunome(d: NunomeDesign, ctx: NunomeContext, g: Guides = GUIDES): NunomeIssue[] {
  const t = g.inlay;
  const out: NunomeIssue[] = [];
  const form = NUNOME_FORM[d.pattern];
  const usesWire = form === "line" || d.border !== false;
  if (usesWire && d.lineMm < t.wireMinMm - 1e-9) {
    out.push({
      check: "nunome-line",
      title: "線が細すぎる",
      current: `線の太さ ${mm(d.lineMm)}`,
      required: `${mm(t.wireMinMm)} 以上（資料の線の太さ）`,
      currentValue: d.lineMm,
      requiredValue: t.wireMinMm,
      why: `打ちこむ純金・純銀の線は、直径 ${t.wireMinMm}〜${t.wireMaxMm} mm くらい（京都の象嵌の工房の解説）。これより細い線は、打つと切れたり、布目の溝に食いこまず浮いたりする`,
      fixLabel: "線を太くする",
      patch: { lineMm: t.wireMinMm },
    });
  }
  if (usesWire && d.lineMm > t.wireMaxMm + 1e-9) {
    out.push({
      check: "nunome-line",
      title: "線が太すぎる",
      current: `線の太さ ${mm(d.lineMm)}`,
      required: `${mm(t.wireMaxMm)} 以下（資料の線の太さ）`,
      currentValue: d.lineMm,
      requiredValue: t.wireMaxMm,
      why: "布目象嵌の線は直径 1 mm 以下（政府広報の記事・京都の象嵌の工房の解説）。太い線は布目の針だけでは押さえきれず、はがれやすい。太く見せたいときは、平金（うすい板）の模様にする",
      fixLabel: "線を細くする",
      patch: { lineMm: t.wireMaxMm },
    });
  }
  if (form === "fill") {
    const foil = d.foilMm ?? t.foilMm;
    if (foil < t.foilMinMm - 1e-9 || foil > t.foilMaxMm + 1e-9) {
      const thin = foil < t.foilMinMm;
      out.push({
        check: "nunome-foil",
        title: thin ? "平金がうすすぎる" : "平金が厚すぎる",
        current: `平金の厚み ${mm(foil)}`,
        required: `${mm(t.foilMinMm)}〜${mm(t.foilMaxMm)}（仮の目安）`,
        currentValue: foil,
        requiredValue: thin ? t.foilMinMm : t.foilMaxMm,
        why: thin ? "うすすぎる平金は、鹿の角で打つと破れたり、布目の針に食いこむ前にのびて切れたりする（厚みの数字は資料にない。仮の目安）" : "厚すぎる平金は、布目の針に食いこまず、縁が浮いてはがれやすい（厚みの数字は資料にない。仮の目安）",
        fixLabel: thin ? "平金を厚くする" : "平金をうすくする",
        patch: { foilMm: thin ? t.foilMinMm : t.foilMaxMm },
      });
    }
  }
  const lay = nunomeLayout(d, ctx.circumferenceMm);
  const gap = narrowestGround(lay, g);
  if (gap < t.minGapMm - 1e-9) {
    // 直し方：模様を大きくして、地を広げる（線の太さはそのまま）。大きくした模様でもう一度測って、足りるまで
    // 地の幅は、おおよそ 模様の大きさ × k − 線の太さ。測った値から k を出して、目安に届く大きさを見積もり、1 度だけ測って足す
    const k = Math.max(0.05, (Math.max(0, gap) + d.lineMm) / d.scaleMm);
    let scale = r2(((t.minGapMm + d.lineMm) / k) * 1.05 + 0.02);
    if (narrowestGround(nunomeLayout({ ...d, scaleMm: scale }, ctx.circumferenceMm), g) < t.minGapMm) scale = r2(scale * 1.25);
    out.push({
      check: "nunome-gap",
      title: "線と線の間がせまい",
      current: `いちばんせまい地 ${mm(Math.max(0, gap))}`,
      required: `${mm(t.minGapMm)} 以上（仮の目安）`,
      currentValue: Math.max(0, gap),
      requiredValue: t.minGapMm,
      why: `布目の溝は 1 mm に 7〜8 本（京象嵌）。線と線の間の地が、溝 2 本分（約 ${mm(2 * t.grooveMm)}）よりせまいと、となりの線を打つときに地と前の線がつぶれ、線どうしがつながってしまう（仮の目安）`,
      fixLabel: "模様を大きくする",
      patch: { scaleMm: Math.min(scale, NUNOME_RANGE.scaleMm[1]) },
    });
  }
  const sl = slivers(lay, g);
  if (sl.length) {
    const small = sl.reduce((a, b) => (b.sizeMm < a.sizeMm ? b : a));
    const foil = sl.some((x) => x.kind === "foil");
    out.push({
      check: "nunome-piece",
      title: `離れた小さなかけら（${sl.length} か所）`,
      current: `いちばん小さい ${mm(small.sizeMm)}`,
      required: `${mm(t.minPieceMm)} 以上（仮の目安）`,
      currentValue: small.sizeMm,
      requiredValue: t.minPieceMm,
      why: `ほかの線とつながらない、小さな${foil ? "平金" : "線の切れはし"}は、布目の針に留まる所が少なく、打つと飛んだり、あとではがれたりする（仮の目安）`,
      fixLabel: foil ? "模様を大きくする" : "縁の線をつける",
      patch: foil || d.border !== false ? { scaleMm: r2(Math.min(NUNOME_RANGE.scaleMm[1], d.scaleMm * Math.max(1.2, t.minPieceMm / Math.max(small.sizeMm, 0.05)))) } : { border: true },
    });
  }
  if (ctx.face) {
    const f = ctx.face;
    const room = Math.min(f.leftMm, f.rightMm) - t.edgeMarginMm;
    if (lay.halfMm > room + 1e-9) {
      const fit = r2(Math.floor(Math.max(0, 2 * room) * 20) / 20);
      out.push({
        check: "nunome-fit",
        title: f.centerCorner ? "帯の真ん中が、面の角の上" : "帯が腕の面からはみ出す",
        current: f.centerCorner ? "真ん中が溝の底か山の頂" : `帯の幅 ${mm(d.widthMm)}`,
        required: f.centerCorner ? "平らかゆるい面の上" : `${mm(Math.max(0, 2 * room))} 以下（面の角から ${mm(t.edgeMarginMm)} 残す。仮の目安）`,
        currentValue: d.widthMm,
        requiredValue: Math.max(0, 2 * room),
        why: f.centerCorner
          ? `腕の面が真ん中で鋭く折れている（${t.faceCornerDeg}° より鋭い）。折れ目の上には、鏨で布目を切れず、線も角の槌でしっかり打てない（仮の目安）`
          : `腕の面の角（${t.faceCornerDeg}° より鋭い折れ目）や横の面には、布目を切れない。角のそばの布目は欠けやすいので、角から ${mm(t.edgeMarginMm)} 残す（仮の目安）`,
        fixLabel: "帯を細くする",
        patch: { widthMm: Math.max(NUNOME_RANGE.widthMm[0], fit) },
      });
    }
  }
  return out;
}

/** 模様の言葉（作り方・図面・Claude への返事） */
export function nunomeWords(d: NunomeDesign, goldBase?: boolean): string {
  const metal = d.metal || goldBase !== undefined ? NUNOME_METAL_LABEL[nunomeMetal(d, !!goldBase)] : "";
  const around = NUNOME_AROUND.find((a) => a.v === (d.around ?? 1))?.label ?? "一周";
  const form = NUNOME_FORM[d.pattern] === "fill" ? `平金 ${mm(d.foilMm ?? GUIDES.inlay.foilMm)}` : `線 ${mm(d.lineMm)}`;
  return [NUNOME_LABEL[d.pattern], `帯 ${mm(d.widthMm, 1)}`, form, metal, around].filter(Boolean).join("・");
}

let svgId = 0;
/**
 * 模様の小さな絵（SVG の文字）。帯の上の真ん中あたりを、wMm の長さだけ。線は太さのまま、平金は面で。
 * 選ぶ欄の見本と、作り方の札に使う
 */
export function nunomeSvg(d: NunomeDesign, o: { circumferenceMm: number; wMm?: number; ink?: string; ground?: string; cls?: string }): string {
  const lay = nunomeLayout({ ...d, around: 1 }, o.circumferenceMm);
  const w = o.wMm ?? Math.max(4, d.widthMm * 2.2);
  const H = lay.halfMm;
  const pad = 0.15;
  const inWin = (pl: V[]) => pl.some((p) => Math.abs(p[0]) <= w / 2 + 1);
  const f = (v: number) => v.toFixed(3);
  const path = (pl: V[]) => `M${pl.map((p) => `${f(p[0])} ${f(-p[1])}`).join("L")}`;
  const lines = [...lay.lines, ...lay.borders].filter(inWin).map(path).join("");
  const fills = lay.fills.filter(inWin).map((pg) => `${path(pg)}Z`).join("");
  const ink = o.ink ?? "currentColor";
  const id = `nmc${++svgId}`;
  return `<svg class="${o.cls ?? "nm-svg"}" viewBox="${f(-w / 2)} ${f(-H - pad)} ${f(w)} ${f(2 * H + 2 * pad)}" aria-hidden="true"><rect x="${f(-w / 2)}" y="${f(-H)}" width="${f(w)}" height="${f(2 * H)}" fill="${o.ground ?? "none"}"/><clipPath id="${id}"><rect x="${f(-w / 2)}" y="${f(-H)}" width="${f(w)}" height="${f(2 * H)}"/></clipPath><g clip-path="url(#${id})">${fills ? `<path d="${fills}" fill="${ink}"/>` : ""}${lines ? `<path d="${lines}" fill="none" stroke="${ink}" stroke-width="${f(d.lineMm)}" stroke-linecap="round" stroke-linejoin="round"/>` : ""}</g></svg>`;
}
