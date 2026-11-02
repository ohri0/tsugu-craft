// 技法を、面の見た目（色と凹凸）として作る。写真を貼るのではなく、「その技で、どうしてその見た目になるか」から作る。
// - 木目金：色のちがう層を重ね、彫って、平らにする（src/rebuild/sim.ts の模型）。
// - 魚々子：小さな丸い鏨で、粒を一つずつ打ち並べる。粒の大きさと間（ピッチ）で決まる。
// - 布目象嵌：地に細かい刻み目を縦横に入れ、そこに金や銀の薄い線を打ち込む。
// - 鎚目：金づちで叩いた浅いくぼみが並ぶ。
// どれも「1 枚の大きさ（mm）」を持ち、形の面に、ほんとうの大きさでくり返して貼る。
import { DEFAULT_SIM, layerColor, makePits, carveDepth, layerAt, rng, type SimParams } from "../rebuild/sim";

export type TechniqueId = "plain" | "mokume" | "nanako" | "nunome" | "tsuchime";
export type MetalId = "k18" | "pt" | "sv" | "copper" | "shakudo" | "shibuichi" | "iron";

export const METALS: Record<MetalId, { name: string; color: string; note: string }> = {
  k18: { name: "K18", color: "#e2b866", note: "金" },
  pt: { name: "Pt900", color: "#d9d9db", note: "プラチナ" },
  sv: { name: "SV925", color: "#e4e4e6", note: "銀" },
  copper: { name: "銅", color: "#c06b45", note: "赤い" },
  shakudo: { name: "赤銅", color: "#2c2624", note: "銅に金を少し。煮色で黒" },
  shibuichi: { name: "四分一", color: "#8d8a83", note: "銀と銅。煮色で灰" },
  iron: { name: "鉄", color: "#3b3936", note: "布目象嵌の地" },
};

export interface TechniqueParams {
  /** 木目金：層の数・彫る深さ・くぼみの数 */
  layers: number;
  depth: number;
  pits: number;
  /** 魚々子：粒の大きさ（mm）と間（mm） */
  dotMm: number;
  pitchMm: number;
  /** 布目象嵌：刻み目の間（mm）・模様の大きさ（mm） */
  hatchMm: number;
  motifMm: number;
  /** 鎚目：くぼみの大きさ（mm） */
  dentMm: number;
  /** 乱数のたね */
  seed: number;
}

export const DEFAULT_PARAMS: TechniqueParams = {
  layers: 20,
  depth: 0.7,
  pits: 22,
  dotMm: 0.5,
  pitchMm: 0.65,
  hatchMm: 0.25,
  motifMm: 10,
  dentMm: 2.4,
  seed: 7,
};

export interface TechniqueInfo {
  id: TechniqueId;
  name: string;
  reading: string;
  /** ひとこと（何をする技か） */
  what: string;
  /** 使う地金（ふつう） */
  metals: MetalId[];
}

export const TECHNIQUES: TechniqueInfo[] = [
  { id: "plain", name: "磨き", reading: "みがき", what: "なめらかに磨いた面。", metals: ["k18", "pt", "sv"] },
  { id: "mokume", name: "木目金", reading: "もくめがね", what: "色のちがう金属を重ねてつなぎ、彫って平らにして、木目のような層を出す。", metals: ["copper", "shakudo", "sv"] },
  { id: "nanako", name: "魚々子", reading: "ななこ", what: "先が丸くくぼんだ鏨で、細かい粒を一つずつ打ち並べる。魚の卵のような地。", metals: ["shakudo", "k18", "copper"] },
  { id: "nunome", name: "布目象嵌", reading: "ぬのめぞうがん", what: "地に布の目のような細かい刻みを入れ、金や銀の薄い線を打ち込む。", metals: ["iron", "k18", "sv"] },
  { id: "tsuchime", name: "鎚目", reading: "つちめ", what: "金づちで叩いた浅いくぼみを、面いっぱいに並べる。", metals: ["sv", "copper", "k18"] },
];

/** 面に貼る 1 枚：色（map）と凹凸（bump）。widthMm × heightMm の大きさでくり返す */
export interface Surface {
  color: HTMLCanvasElement;
  bump: HTMLCanvasElement | null;
  widthMm: number;
  heightMm: number;
  /** 磨きの度合い（0 でつるつる） */
  roughness: number;
  /** 地金らしさ（1 で金属） */
  metalness: number;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function hex(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** 技法の面を作る。base は地金（木目金では使わない） */
export function makeSurface(t: TechniqueId, base: MetalId, p: TechniqueParams, mokumePalette?: readonly string[]): Surface {
  switch (t) {
    case "mokume":
      return mokume(p, mokumePalette);
    case "nanako":
      return nanako(base, p);
    case "nunome":
      return nunome(base, p);
    case "tsuchime":
      return tsuchime(base, p);
    default: {
      const [c, g] = canvas(4, 4);
      g.fillStyle = METALS[base].color;
      g.fillRect(0, 0, 4, 4);
      return { color: c, bump: null, widthMm: 10, heightMm: 10, roughness: 0.12, metalness: 1 };
    }
  }
}

export const MOKUME_PALETTES: { name: string; colors: string[] }[] = [
  { name: "銅・赤銅・銀", colors: [METALS.copper.color, METALS.shakudo.color, METALS.sv.color, METALS.shakudo.color] },
  { name: "銅・四分一", colors: [METALS.copper.color, METALS.shibuichi.color] },
  { name: "金・銀・赤銅", colors: [METALS.k18.color, METALS.sv.color, METALS.shakudo.color, METALS.sv.color] },
];

function mokume(p: TechniqueParams, palette: readonly string[] = MOKUME_PALETTES[0].colors): Surface {
  const sim: SimParams = { ...DEFAULT_SIM, layers: p.layers, depth: p.depth, pits: p.pits, seed: p.seed, palette };
  const n = 640;
  const [c, g] = canvas(n, n);
  const [b, gb] = canvas(n, n);
  const img = g.createImageData(n, n);
  const bimg = gb.createImageData(n, n);
  const pits = makePits(sim);
  const rand = rng(sim.seed + 101);
  const waves: [number, number, number, number][] = Array.from({ length: 4 }, (_, k) => [1 + Math.floor(rand() * 4), 1 + Math.floor(rand() * 4), rand() * Math.PI * 2, 1 / (k + 1)]);
  const wv = (x: number, y: number, s: number) => waves.reduce((a, [fx, fy, ph, w]) => a + Math.sin(2 * Math.PI * (x * fx + y * fy) + ph + s) * w, 0) / 2.1;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n;
      const y = (j + 0.5) / n;
      const wx = x + sim.wobble * 0.035 * wv(x, y, 0);
      const wy = y + sim.wobble * 0.035 * wv(y, x, 1.3);
      const d = carveDepth(pits, wx, wy);
      const z = d > 0 ? Math.min(0.999, Math.max(0, d + sim.wobble * 0.05 * wv(x * 2, y * 2, 2.1))) : 0;
      const k = layerAt(z, sim.layers);
      const [r, gg, bb] = hex(layerColor(k, sim));
      const o = 4 * (j * n + i);
      img.data.set([r, gg, bb, 255], o);
      // 層の境目にわずかな段（煮色のあとの、金属ごとの硬さのちがいで出る浅い起伏）
      const v = 128 + (k % 2) * 6;
      bimg.data.set([v, v, v, 255], o);
    }
  }
  g.putImageData(img, 0, 0);
  gb.putImageData(bimg, 0, 0);
  return { color: c, bump: b, widthMm: 24, heightMm: 24, roughness: 0.32, metalness: 0.75 };
}

function nanako(base: MetalId, p: TechniqueParams): Surface {
  // 粒は六角に並べる（列ごとに半分ずらす）。1 枚に 12 × 8 列ぶん
  const cols = 12;
  const rows = 8;
  const wMm = cols * p.pitchMm;
  const hMm = rows * p.pitchMm * Math.sqrt(3);
  const pxPerMm = Math.min(96, 1024 / wMm);
  const W = Math.round(wMm * pxPerMm);
  const H = Math.round(hMm * pxPerMm);
  const [c, g] = canvas(W, H);
  const [b, gb] = canvas(W, H);
  g.fillStyle = METALS[base].color;
  g.fillRect(0, 0, W, H);
  gb.fillStyle = "#606060";
  gb.fillRect(0, 0, W, H);
  const r = (p.dotMm / 2) * pxPerMm;
  const step = p.pitchMm * pxPerMm;
  const rowH = (step * Math.sqrt(3)) / 2;
  const rand = rng(p.seed);
  const [cr, cg, cb] = hex(METALS[base].color);
  for (let row = -1; row <= rows * 2 + 1; row++) {
    for (let col = -1; col <= cols + 1; col++) {
      // 手で打つので、位置がわずかにずれる
      const x = col * step + (row % 2 ? step / 2 : 0) + (rand() - 0.5) * step * 0.08;
      const y = row * rowH + (rand() - 0.5) * step * 0.08;
      for (const [dx, dy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H]]) {
        // 凹凸：粒は丸く盛り上がり、まわりは鏨のふちで細く沈む
        const gr = gb.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r * 1.15);
        gr.addColorStop(0, "#f0f0f0");
        gr.addColorStop(0.7, "#b0b0b0");
        gr.addColorStop(0.86, "#202020");
        gr.addColorStop(1, "rgba(96,96,96,0)");
        gb.fillStyle = gr;
        gb.beginPath();
        gb.arc(x + dx, y + dy, r * 1.15, 0, Math.PI * 2);
        gb.fill();
        // 色：粒の頭が光り、ふちが暗い
        const gc = g.createRadialGradient(x + dx - r * 0.3, y + dy - r * 0.3, 0, x + dx, y + dy, r * 1.1);
        gc.addColorStop(0, `rgb(${Math.min(255, cr + 70)},${Math.min(255, cg + 60)},${Math.min(255, cb + 50)})`);
        gc.addColorStop(0.6, METALS[base].color);
        gc.addColorStop(1, `rgb(${cr * 0.45},${cg * 0.45},${cb * 0.45})`);
        g.fillStyle = gc;
        g.beginPath();
        g.arc(x + dx, y + dy, r * 1.05, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return { color: c, bump: b, widthMm: wMm, heightMm: hMm, roughness: 0.38, metalness: 0.9 };
}

function nunome(base: MetalId, p: TechniqueParams): Surface {
  // 地：刻み目を 3 方向に。模様：青海波（波の重なり）の線を、金で打ち込む
  const size = p.motifMm;
  const pxPerMm = 1024 / size;
  const N = 1024;
  const [c, g] = canvas(N, N);
  const [b, gb] = canvas(N, N);
  g.fillStyle = METALS[base].color;
  g.fillRect(0, 0, N, N);
  gb.fillStyle = "#707070";
  gb.fillRect(0, 0, N, N);
  const pitch = p.hatchMm * pxPerMm;
  for (const ang of [0, 60, 120]) {
    const a = (ang * Math.PI) / 180;
    gb.save();
    gb.translate(N / 2, N / 2);
    gb.rotate(a);
    gb.strokeStyle = "#3c3c3c";
    gb.lineWidth = Math.max(1, pitch * 0.25);
    for (let k = -N; k <= N; k += pitch) {
      gb.beginPath();
      gb.moveTo(k, -N);
      gb.lineTo(k, N);
      gb.stroke();
    }
    gb.restore();
  }
  // 地の色にも刻みの影を薄く
  g.globalAlpha = 0.25;
  g.drawImage(b, 0, 0);
  g.globalAlpha = 1;
  // 青海波：半径 R の円弧を 3 重に、半分ずつずらして並べる
  const R = N / 2.2;
  const gold = METALS.k18.color;
  const lw = Math.max(2, 0.08 * pxPerMm);
  for (let row = -1; row <= 6; row++) {
    for (let col = -1; col <= 3; col++) {
      const cx = col * 2 * R + (row % 2 ? R : 0);
      const cy = row * (R / 2);
      for (const k of [1, 0.66]) {
        for (const ctx of [g, gb]) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, R * k, Math.PI, 2 * Math.PI);
          ctx.strokeStyle = ctx === g ? gold : "#e8e8e8";
          ctx.lineWidth = lw;
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }
  // 下の円が上の円を隠す（重なりの順）ので、もう一度後ろの行から塗り直す形にはせず、線だけ見せる（象嵌の線）
  return { color: c, bump: b, widthMm: size, heightMm: size, roughness: 0.45, metalness: 0.7 };
}

function tsuchime(base: MetalId, p: TechniqueParams): Surface {
  const size = p.dentMm * 8;
  const N = 384;
  const [c, g] = canvas(N, N);
  const [b, gb] = canvas(N, N);
  const rand = rng(p.seed + 5);
  const pts = Array.from({ length: 40 }, () => [rand() * N, rand() * N] as const);
  const bimg = gb.createImageData(N, N);
  const cimg = g.createImageData(N, N);
  const [cr, cg, cb] = hex(METALS[base].color);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [x, y] of pts) {
        for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N], [N, N], [-N, -N], [N, -N], [-N, N]]) {
          const d = Math.hypot(i - x - ox, j - y - oy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      }
      // 金づちの丸いくぼみ：真ん中が低く、まわりへなめらかに上がる。境目はやわらかい稜線
      const cell = (d1 + d2) / 2;
      const q = Math.min(1, d1 / Math.max(1, cell));
      const v = Math.round(70 + 150 * q * q);
      const o = 4 * (j * N + i);
      bimg.data.set([v, v, v, 255], o);
      const s = 0.92 + 0.12 * q;
      cimg.data.set([Math.min(255, cr * s), Math.min(255, cg * s), Math.min(255, cb * s), 255], o);
    }
  }
  gb.putImageData(bimg, 0, 0);
  g.putImageData(cimg, 0, 0);
  return { color: c, bump: b, widthMm: size, heightMm: size, roughness: 0.18, metalness: 1 };
}
