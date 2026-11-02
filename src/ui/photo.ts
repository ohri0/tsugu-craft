// 写真を読み込み、輪郭を重ねて描く。写真はサーバーに送らない（ブラウザの中だけ）。
import type { Point } from "../geometry/polygon";
import type { Corner } from "../geometry/corners";
import type { Extraction } from "../vision/extract";

/** 長い辺がこれより大きい写真は縮める（メモリのため。石を 3 分の 1 に撮れば十分な細かさ） */
const MAX_SIDE = 4000;

export async function loadPhoto(file: File): Promise<ImageData> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return g.getImageData(0, 0, c.width, c.height);
}

export function imageToCanvas(img: ImageData): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c;
}

interface Overlay {
  extraction?: Extraction;
  corners?: Corner[];
  ends?: [Point, Point];
}

/** 全体の写真：輪郭（緑）、ほかの候補（点線）、尖った角（赤） */
export function drawWhole(target: HTMLCanvasElement, photo: HTMLCanvasElement, o: Overlay) {
  const w = target.clientWidth || 300;
  const s = w / photo.width;
  target.width = Math.round(w * devicePixelRatio);
  target.height = Math.round(photo.height * s * devicePixelRatio);
  const g = target.getContext("2d")!;
  const k = s * devicePixelRatio;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(photo, 0, 0, target.width, target.height);
  g.setTransform(k, 0, 0, k, 0, 0);
  if (o.extraction) {
    g.setLineDash([6 / s, 4 / s]);
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 1.5 / s;
    for (const c of o.extraction.candidates) {
      if (c === o.extraction.selected || (c.cx === o.extraction.selected.cx && c.cy === o.extraction.selected.cy)) continue;
      g.strokeRect(c.box.x, c.box.y, c.box.w, c.box.h);
    }
    g.setLineDash([]);
    strokeOutline(g, o.extraction.outlinePx, 2.5 / s);
  }
  drawCorners(g, o.corners, 1 / s);
}

/** 石の拡大：選んだ石の周りを切り出して、輪郭と長辺を重ねる */
export function drawZoom(target: HTMLCanvasElement, photo: HTMLCanvasElement, o: Overlay) {
  const e = o.extraction;
  const w = target.clientWidth || 200;
  target.width = Math.round(w * devicePixelRatio);
  target.height = Math.round(w * devicePixelRatio);
  const g = target.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#ddd";
  g.fillRect(0, 0, target.width, target.height);
  if (!e) return;
  const b = e.selected.box;
  const side = Math.max(b.w, b.h) * 1.35;
  const x0 = b.x + b.w / 2 - side / 2;
  const y0 = b.y + b.h / 2 - side / 2;
  const k = target.width / side;
  g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  g.drawImage(photo, 0, 0);
  const px = 1 / k;
  strokeOutline(g, e.outlinePx, 2 * devicePixelRatio * px);
  if (o.ends) {
    g.setLineDash([6 * px * devicePixelRatio, 4 * px * devicePixelRatio]);
    g.strokeStyle = "rgba(30,30,30,0.7)";
    g.lineWidth = 1.2 * devicePixelRatio * px;
    g.beginPath();
    g.moveTo(o.ends[0].x, o.ends[0].y);
    g.lineTo(o.ends[1].x, o.ends[1].y);
    g.stroke();
    g.setLineDash([]);
  }
  drawCorners(g, o.corners, devicePixelRatio * px);
}

function strokeOutline(g: CanvasRenderingContext2D, pts: Point[], lw: number) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.strokeStyle = "#19c24a";
  g.lineWidth = lw;
  g.stroke();
}

function drawCorners(g: CanvasRenderingContext2D, corners: Corner[] | undefined, unit: number) {
  for (const c of corners ?? []) {
    g.beginPath();
    g.arc(c.point.x, c.point.y, 7 * unit, 0, Math.PI * 2);
    g.strokeStyle = "#e0342b";
    g.lineWidth = 2.5 * unit;
    g.stroke();
  }
}

/** 画面上で押した位置 → 写真の座標 */
export function eventToPhoto(ev: MouseEvent, canvas: HTMLCanvasElement, photo: HTMLCanvasElement): Point {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * photo.width, y: ((ev.clientY - r.top) / r.height) * photo.height };
}
