// 布目象嵌の模様を、腕の面に貼る絵にする（src/geometry/nunome.ts の線と面を、そのまま描く）。
// 絵の横は指のまわりの一周（左の端が手のひら側、真ん中がいちばん上）、縦は帯の幅（上が +s の側）。白い所がはめこんだ地金。
import * as THREE from "three";
import { nunomeLayout, type NunomeDesign } from "../geometry/nunome";

/** 1 mm を何点で描くか（絵の横は 4096 点まで） */
const PX_PER_MM = 64;
const cache = new Map<string, THREE.CanvasTexture>();

export function nunomeTexture(d: NunomeDesign, circumferenceMm: number): THREE.CanvasTexture {
  const key = `${JSON.stringify(d)}_${circumferenceMm.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const lay = nunomeLayout(d, circumferenceMm);
  const C = circumferenceMm;
  const H = lay.halfMm;
  const ppm = Math.min(PX_PER_MM, 4096 / C);
  const W = Math.max(64, Math.ceil(C * ppm));
  const Hp = Math.max(8, Math.min(1024, Math.ceil(2 * H * ppm)));
  const sy = Hp / (2 * H);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Hp;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, Hp);
  const X = (u: number) => ((u + C / 2) / C) * W;
  const Y = (v: number) => (H - v) * sy;
  g.fillStyle = "#fff";
  for (const pg of lay.fills) {
    g.beginPath();
    pg.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))));
    g.closePath();
    g.fill();
  }
  g.strokeStyle = "#fff";
  g.lineWidth = d.lineMm * ppm;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  for (const pl of [...lay.lines, ...lay.borders]) pl.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))));
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  // 古い絵は捨てる（模様を動かすたびに増えないように）
  if (cache.size > 12) {
    const first = cache.keys().next().value as string;
    cache.get(first)?.dispose();
    cache.delete(first);
  }
  cache.set(key, tex);
  return tex;
}
