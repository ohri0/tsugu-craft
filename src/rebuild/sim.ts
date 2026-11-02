// 組み立てた工程を、目で確かめる簡単な模型（重ねる → 彫る → 平らにする で、木目の模様が出るか）。画面に依存しない純粋な関数。
//
// 模型の考え方（ほんとうの金属の変形は計算しない。形の考え方だけ）：
// - 色のちがう金属の層を、下から順に重ねた板とする。層の厚みはどれも同じ。
// - 彫る：表から、丸いくぼみ（深さ・広さはいろいろ）を掘る。くぼみの深さを d(x, y) とする（0〜1、板の厚みに対して）。
// - 平らにする：彫った板を叩いて平らにすると、表に出るのは「その場所で、深さ d の所にあった層」になる。
//   だから、表の色 ＝ 深さ d(x, y) の層の色。くぼみのまわりに層が輪になって出る（木の年輪のような目）。
// - 層は叩くと少し波打つので、深さに小さなゆらぎを足す（木目の線がまっすぐな輪にならないように）。
// 確かめられること：彫らなければ一番上の層の色しか出ない。層が 1 色なら、彫っても模様は出ない。

export interface SimParams {
  /** 層の数 */
  layers: number;
  /** 層の色（下から順にくり返す） */
  palette: readonly string[];
  /** くぼみの数 */
  pits: number;
  /** くぼみの深さ（板の厚みに対して、0〜1） */
  depth: number;
  /** くぼみの広さ（画面の幅に対して） */
  radius: number;
  /** 層のゆらぎ（0〜1） */
  wobble: number;
  /** 乱数のたね（同じなら同じ模様） */
  seed: number;
}

export const METALS = {
  copper: "#b4643f",
  shakudo: "#2a2523",
  silver: "#d4d2cc",
  shibuichi: "#8b877f",
  gold: "#d7a83f",
} as const;

export const DEFAULT_SIM: SimParams = {
  layers: 20,
  palette: [METALS.copper, METALS.shakudo, METALS.silver, METALS.shakudo],
  pits: 22,
  depth: 0.7,
  radius: 0.17,
  wobble: 1,
  seed: 7,
};

/** 決まった乱数（seed が同じなら同じ並び） */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export interface Pit {
  x: number;
  y: number;
  r: number;
  d: number;
}

export function makePits(p: SimParams): Pit[] {
  const rand = rng(p.seed);
  return Array.from({ length: p.pits }, () => ({
    x: rand(),
    y: rand(),
    r: p.radius * (0.6 + 0.8 * rand()),
    d: p.depth * (0.6 + 0.4 * rand()),
  }));
}

/** なめらかなゆらぎ（いくつかの波を重ねたもの） */
function waves(x: number, y: number, seed: number): number {
  const rand = rng(seed + 101);
  let v = 0;
  for (let k = 0; k < 4; k++) {
    const fx = 2 + rand() * 6;
    const fy = 2 + rand() * 6;
    const ph = rand() * Math.PI * 2;
    v += Math.sin(x * fx * Math.PI + y * fy * Math.PI * 0.7 + ph) / (k + 1);
  }
  return v / 2.1;
}

/** 位置 (x, y)（0〜1）の、彫った深さ（0〜1）。丸いくぼみのいちばん深い所を取る */
export function carveDepth(pits: readonly Pit[], x: number, y: number): number {
  let d = 0;
  for (const p of pits) {
    const q = Math.hypot(x - p.x, y - p.y) / p.r;
    if (q < 1) d = Math.max(d, p.d * Math.sqrt(1 - q * q));
  }
  return d;
}

/** 深さ z（0＝表、1＝底）にある層の番号（上から 0） */
export function layerAt(z: number, layers: number): number {
  return Math.min(layers - 1, Math.max(0, Math.floor(z * layers)));
}

/** 上から k 番目の層の色（下から palette をくり返す） */
export function layerColor(k: number, p: SimParams): string {
  const fromBottom = p.layers - 1 - k;
  return p.palette[fromBottom % p.palette.length];
}

export type SimStage = "stack" | "carve" | "flat";

/**
 * 上から見た表の色を、n × n のこまの色の番号（上から何番目の層か）で返す。
 * - stack：重ねただけ（一番上の層）
 * - carve：彫ったところ（くぼみの底の層。ふちの段が見える）
 * - flat：平らにしたあと（深さ d の層。木目が出る）
 */
export function topView(p: SimParams, n: number, stage: SimStage): Uint8Array {
  const out = new Uint8Array(n * n);
  const pits = makePits(p);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n;
      const y = (j + 0.5) / n;
      let z = 0;
      if (stage === "carve") z = Math.min(0.999, carveDepth(pits, x, y));
      if (stage === "flat") {
        // 叩いて平らにすると、彫った形が少しのびてゆがみ、層も波打つ（その分だけ場所と深さをゆらす）
        const wx = x + p.wobble * 0.035 * waves(x, y, p.seed);
        const wy = y + p.wobble * 0.035 * waves(y, x, p.seed + 3);
        const d = carveDepth(pits, wx, wy);
        z = d > 0 ? Math.min(0.999, Math.max(0, d + p.wobble * 0.05 * waves(x * 1.7, y * 1.7, p.seed + 9))) : 0;
      }
      out[j * n + i] = layerAt(z, p.layers);
    }
  }
  return out;
}

/** 模様の細かさの目安：となりのこまと層がちがう割合（0〜1）。0 なら模様がない */
export function patternAmount(view: Uint8Array, n: number): number {
  let diff = 0;
  let all = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n - 1; i++) {
      all++;
      if (view[j * n + i] !== view[j * n + i + 1]) diff++;
    }
  }
  return all ? diff / all : 0;
}

/** 出てきた色の数（同じ色の層は 1 つと数える） */
export function colorsShown(view: Uint8Array, p: SimParams): number {
  const seen = new Set<string>();
  for (const k of view) seen.add(layerColor(k, p));
  return seen.size;
}
