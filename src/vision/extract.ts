// 写真から石の縁の輪郭を取る。SPEC「輪郭の取り方」の 1〜3。
// 1. 縮めた写真で、明るさのむらを消してから、背景と色の違うかたまりを探す（端に触れるものは石と見なさない）
// 2. 押された石、なければ真ん中に近いものを選ぶ
// 3. その周りを元の解像度で切り出し、もう一度輪郭を取る
import { DETECTION } from "../rules/detection";
import { perimeter, resample, signedArea, type Point } from "../geometry/polygon";
import { differenceMap, fitBackground, type BackgroundModel } from "./background";
import { boxBlur, marchingSquares } from "./contour";
import { downscale, type RGBAImage } from "./image";
import { close, fillHoles, label, otsu, threshold, type Blob } from "./mask";

export interface Candidate {
  /** 元の写真の座標 */
  cx: number;
  cy: number;
  /** 元の写真の座標での外接矩形 */
  box: { x: number; y: number; w: number; h: number };
  areaPx: number;
}

export interface Extraction {
  /** 元の写真の座標（px）での輪郭。時計回り／反時計回りは決めない */
  outlinePx: Point[];
  /** 石の部分の平均の色 */
  color: { r: number; g: number; b: number };
  /** 色が薄い（無色の石） */
  colorless: boolean;
  /** 選んだかたまり */
  selected: Candidate;
  /** 見つけた石の候補（選んだものを含む） */
  candidates: Candidate[];
  /** 端に触れたので除いたかたまりの数 */
  rejectedAtBorder: number;
  /** しきい値（色の差） */
  thresholds: { strong: number; weak: number };
}

export interface ExtractOptions {
  /** 押した位置（元の写真の座標）。なければ真ん中に近い石 */
  pick?: Point;
}

export class NoStoneError extends Error {}

export function extractStone(img: RGBAImage, options: ExtractOptions = {}, cfg = DETECTION.vision): Extraction {
  // 1. 粗い探し
  const factor = Math.max(1, Math.ceil(Math.max(img.width, img.height) / cfg.coarseMaxSide));
  const small = downscale(img, factor);
  const model = fitBackground(small, factor, img.width, img.height, cfg.backgroundIterations);
  const diff = differenceMap(small, model, factor);
  const w = small.width;
  const h = small.height;
  const minArea = cfg.minAreaRatio * w * h;
  // しきい値は 2 回決める。1 回目で写真の端に触れたかたまり（ケースの縁・影）を見つけ、
  // 2 回目はそれを除いて決め直す。端の濃い影にしきい値を引っぱられて、淡い石が消えるのを防ぐ。
  let pass = segment(diff, w, h, otsu(diff), cfg);
  const border = pass.blobs.filter((b) => b.touchesBorder).map((b) => b.id);
  if (border.length > 0) {
    const inBorder = new Set(border);
    const rest = diff.filter((_, i) => !inBorder.has(pass.labels[i]));
    const second = segment(diff, w, h, otsu(rest), cfg);
    if (second.blobs.some((b) => !b.touchesBorder && b.strong && b.area >= minArea)) pass = second;
  }
  const { labels, blobs, strongT, weakT } = pass;
  const rejectedAtBorder = blobs.filter((b) => b.touchesBorder && b.area >= minArea).length;
  const stones = blobs.filter((b) => !b.touchesBorder && b.strong && b.area >= minArea);
  if (stones.length === 0) throw new NoStoneError("石が見つかりませんでした。石が画面の 3 分の 1 くらいになるまで寄り、端に触れないように撮ってください。");

  const toCandidate = (b: Blob): Candidate => ({
    cx: (b.cx + 0.5) * factor - 0.5,
    cy: (b.cy + 0.5) * factor - 0.5,
    box: { x: b.minX * factor, y: b.minY * factor, w: (b.maxX - b.minX + 1) * factor, h: (b.maxY - b.minY + 1) * factor },
    areaPx: b.area * factor * factor,
  });

  // 2. 選ぶ
  let chosen: Blob | undefined;
  if (options.pick) {
    const px = Math.floor(options.pick.x / factor);
    const py = Math.floor(options.pick.y / factor);
    if (px >= 0 && py >= 0 && px < w && py < h) {
      const id = labels[py * w + px];
      chosen = stones.find((b) => b.id === id);
    }
    if (!chosen) chosen = nearest(stones, options.pick.x / factor, options.pick.y / factor);
  } else {
    chosen = nearest(stones, w / 2, h / 2);
  }

  // 3. 元の解像度で切り出してもう一度
  const refined = refine(img, model, chosen, factor, strongT, weakT, cfg);
  return {
    ...refined,
    selected: toCandidate(chosen),
    candidates: stones.map(toCandidate),
    rejectedAtBorder,
    thresholds: { strong: strongT, weak: weakT },
  };
}

function segment(diff: Float32Array, w: number, h: number, t: number, cfg: typeof DETECTION.vision) {
  const strongT = Math.max(cfg.minThreshold, t);
  const weakT = Math.max(cfg.minThreshold * cfg.weakThresholdFactor, strongT * cfg.weakThresholdFactor);
  const weak = fillHoles(close(threshold(diff, weakT), w, h), w, h);
  const strong = threshold(diff, strongT);
  return { ...label(weak, w, h, strong), strongT, weakT };
}

function nearest(blobs: Blob[], x: number, y: number): Blob {
  let best = blobs[0];
  let bd = Infinity;
  for (const b of blobs) {
    const d = (b.cx - x) ** 2 + (b.cy - y) ** 2;
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

function refine(
  img: RGBAImage,
  model: BackgroundModel,
  blob: Blob,
  factor: number,
  strongT: number,
  weakT: number,
  cfg: typeof DETECTION.vision,
): Pick<Extraction, "outlinePx" | "color" | "colorless"> {
  const size = Math.max(blob.maxX - blob.minX + 1, blob.maxY - blob.minY + 1) * factor;
  const margin = Math.ceil(size * cfg.cropMarginRatio) + 2 * factor;
  const x0 = Math.max(0, blob.minX * factor - margin);
  const y0 = Math.max(0, blob.minY * factor - margin);
  const x1 = Math.min(img.width, (blob.maxX + 1) * factor + margin);
  const y1 = Math.min(img.height, (blob.maxY + 1) * factor + margin);
  const w = x1 - x0;
  const h = y1 - y0;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x1) * 4), y * w * 4);
  const crop: RGBAImage = { width: w, height: h, data };
  const diff = differenceMap(crop, model, 1, x0, y0);
  const weak = fillHoles(close(threshold(diff, weakT), w, h), w, h);
  const strong = threshold(diff, strongT);
  const { labels, blobs } = label(weak, w, h, strong);
  // 粗い探しで選んだかたまりの重心にいちばん近い、大きなかたまり
  const cx = (blob.cx + 0.5) * factor - x0;
  const cy = (blob.cy + 0.5) * factor - y0;
  const idAtCenter = labels[Math.min(h - 1, Math.max(0, Math.round(cy))) * w + Math.min(w - 1, Math.max(0, Math.round(cx)))];
  const target =
    blobs.find((b) => b.id === idAtCenter && b.strong) ??
    [...blobs].filter((b) => b.strong).sort((a, b) => b.area - a.area)[0];
  if (!target) throw new NoStoneError("石の縁を取り直せませんでした。");

  const field = new Float32Array(w * h);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < field.length; i++) {
    if (labels[i] === target.id) {
      field[i] = 1;
      r += data[i * 4];
      g += data[i * 4 + 1];
      b += data[i * 4 + 2];
      n++;
    }
  }
  const smooth = boxBlur(boxBlur(field, w, h, cfg.refineBlurRadius), w, h, cfg.refineBlurRadius);
  const loops = marchingSquares(smooth, w, h, 0.5);
  if (loops.length === 0) throw new NoStoneError("石の縁を取り直せませんでした。");
  const loop = loops.reduce((a, c) => (Math.abs(signedArea(c)) > Math.abs(signedArea(a)) ? c : a));
  const count = Math.max(64, Math.min(720, Math.round(perimeter(loop) / 2)));
  const outlinePx = resample(loop, count).map((p) => ({ x: p.x + x0, y: p.y + y0 }));
  const color = { r: r / n, g: g / n, b: b / n };
  const mx = Math.max(color.r, color.g, color.b);
  const mn = Math.min(color.r, color.g, color.b);
  const colorless = mx === 0 || (mx - mn) / mx < 0.12;
  return { outlinePx, color, colorless };
}
