// テンションの形を、本物の網目で測る（石と地金の重なり・本当のすき間・石の先と指・腕の内側との関係）。
// npx tsx scripts/tension-measure.ts [号 ...]  で一覧を出す。--svg=フォルダ で断面の SVG も書く。形は変えない。
import { writeFileSync } from "node:fs";
import { buildRing, type RingDesign } from "../src/geometry/ring";
import type { StoneParams } from "../src/geometry/stone";
import { checkRing } from "../src/rules/checks";
import { PRESETS, presetOutline } from "../src/studio/presets";
import { measureOutline } from "../src/geometry/measure";
import { probe, surfaceSamples, topology } from "../tests/helpers/solid-probe";
import realTriangle from "../tests/fixtures/real-triangle-outline.json";

export interface Measure {
  name: string;
  gapMm: number;
  culetGapMm: number;
  fingerClearMm: number;
  liftMm: number;
  shells: number;
  open: number;
  overlapPts: number;
  overlapMaxMm: number;
  overlapAt: string;
  metalInStone: number;
  minClearMm: number;
  beyondPlane: [number, number];
  floor: [number, number];
  culetBelowArmMm: number;
  tableBelowArmMm: number;
  checks: string[];
}

export function measureRing(name: string, ring: RingDesign, stepMm = 0.04): Measure {
  const info = ring.setting.tension!;
  const metal = ring.ringPositions.shank;
  const stone = ring.ringPositions.stone;
  const pm = probe(metal);
  const ps = probe(stone);
  const shape = topology(metal);
  let overlapPts = 0, overlapMaxMm = 0, overlapAt = "";
  let minClearMm = Infinity;
  let fingerClearMm = Infinity;
  const r = ring.shank.innerRadiusMm;
  const beyond = [0, 0];
  let sampled = 0;
  surfaceSamples(stone, stepMm, (x, y, z) => {
    fingerClearMm = Math.min(fingerClearMm, Math.hypot(y, z) - r);
    const side = y >= 0 ? 0 : 1;
    if (Math.abs(x) <= ring.shank.widthMm / 2) beyond[side] = Math.max(beyond[side], Math.abs(y) - info.gapMm / 2);
    // 地金に届きそうな所だけを細かく見る（端の面より少し手前から奥）
    if (Math.abs(y) < info.gapMm / 2 - 0.25) return;
    if (pm.inside(x, y, z)) {
      overlapPts++;
      const d = pm.distance(x, y, z, 0.7);
      if (Number.isFinite(d) && d > overlapMaxMm) {
        overlapMaxMm = d;
        overlapAt = `x ${x.toFixed(2)} y ${y.toFixed(2)} z-girdle ${(z - info.girdleZ).toFixed(2)}`;
      }
      return;
    }
    if (Math.abs(x) > ring.shank.widthMm / 2 + 0.3) return;
    sampled++;
    if (sampled % 7 !== 0) return;
    const d = pm.distance(x, y, z, 0.3);
    if (d < minClearMm) minClearMm = d;
  });
  let metalInStone = 0;
  for (let i = 0; i < metal.length; i += 3) if (ps.inside(metal[i], metal[i + 1], metal[i + 2])) metalInStone++;
  // 腕の真ん中（x ＝ 0）の、端の面の内側の z（石の先と比べる）と、外側の z（石の上面と比べる）
  const h = ring.stone.heights;
  const tableZ = info.girdleZ + h.tableZ;
  const culetZ = info.girdleZ + h.culetZ;
  const armIn = Math.max(...info.ends.map((e) => e.wireBottomZ));
  const armTop = Math.max(...info.ends.map((e) => e.wireTopZ));
  const floor: [number, number] = [0, 0];
  info.ends.forEach((e, i) => {
    const hits = pm.hitsAlongY(0, info.girdleZ).filter((y) => Math.sign(y) === e.side);
    floor[i] = hits.length ? Math.min(...hits.map((y) => Math.abs(y))) - info.gapMm / 2 : NaN;
  });
  return {
    name,
    gapMm: info.gapMm,
    culetGapMm: ring.culetGapMm,
    fingerClearMm,
    liftMm: info.liftMm,
    shells: shape.shells,
    open: shape.open,
    overlapPts,
    overlapMaxMm,
    overlapAt,
    metalInStone,
    minClearMm,
    beyondPlane: [beyond[0], beyond[1]],
    floor,
    culetBelowArmMm: armIn - culetZ,
    tableBelowArmMm: armTop - tableZ,
    checks: checkRing(ring).map((p) => p.check),
  };
}

/** 面の切り口：x ＝ x0（y–z の面）か z ＝ z0（x–y の面）で切った線の集まり */
export function slice(p: Float32Array, axis: 0 | 2, at: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const [u, v] = axis === 0 ? [1, 2] : [0, 1];
  for (let o = 0; o < p.length; o += 9) {
    const pts: [number, number][] = [];
    for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
      const da = p[o + a + axis] - at;
      const db = p[o + b + axis] - at;
      if (da === 0 && db === 0) continue;
      if (da * db > 0) continue;
      const k = da / (da - db);
      pts.push([p[o + a + u] + (p[o + b + u] - p[o + a + u]) * k, p[o + a + v] + (p[o + b + v] - p[o + a + v]) * k]);
    }
    if (pts.length >= 2) out.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
  }
  return out;
}

/** 断面の SVG（x ＝ 0 と 縁の高さ）。金は地金、水色は石、点線は指の円 */
export function sectionSvg(ring: RingDesign, title: string): string {
  const info = ring.setting.tension!;
  const s = 70;
  const r = ring.shank.innerRadiusMm;
  const W = 1500, H = 720;
  const toY = (y: number) => 370 + y * s;
  const toZ = (z: number, z0: number) => 330 - (z - z0) * s;
  const z0 = info.girdleZ;
  const lines = (segs: [number, number, number, number][], stroke: string, w: number, fx: (a: number) => number, fy: (a: number) => number) =>
    `<path d="${segs.map((q) => `M${fx(q[0]).toFixed(1)} ${fy(q[1]).toFixed(1)}L${fx(q[2]).toFixed(1)} ${fy(q[3]).toFixed(1)}`).join("")}" stroke="${stroke}" stroke-width="${w}" fill="none"/>`;
  const metalX = slice(ring.ringPositions.shank, 0, 1e-4);
  const stoneX = slice(ring.ringPositions.stone, 0, 1e-4);
  const finger: string[] = [];
  for (let a = -40; a <= 40; a += 1) {
    const t = (a * Math.PI) / 180;
    finger.push(`${toY(r * Math.sin(t)).toFixed(1)},${toZ(r * Math.cos(t), z0).toFixed(1)}`);
  }
  const left = `<g>${lines(metalX, "#b8860b", 2, toY, (z) => toZ(z, z0))}${lines(stoneX, "#1e88e5", 2, toY, (z) => toZ(z, z0))}<polyline points="${finger.join(" ")}" stroke="#d33" stroke-dasharray="6 5" fill="none" stroke-width="1.5"/></g>`;
  const fx2 = (x: number) => 1090 + x * s * 0.9;
  const fy2 = (y: number) => 370 - y * s * 0.9;
  const metalZ = slice(ring.ringPositions.shank, 2, info.girdleZ + 1e-4);
  const stoneZ = slice(ring.ringPositions.stone, 2, info.girdleZ + 1e-4);
  const right = `<g>${lines(metalZ, "#b8860b", 2, fx2, fy2)}${lines(stoneZ, "#1e88e5", 2, fx2, fy2)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><text x="16" y="28" font-size="22" font-family="sans-serif">${title}</text><text x="16" y="56" font-size="16" font-family="sans-serif" fill="#555">左：腕の幅の真ん中で切った断面（y-z）。赤の点線＝指の円。右：石の縁の高さで切った断面（上から。上下が腕の周りの向き）</text>${left}${right}</svg>`;
}

export function presetStone(id: string, k = 1): StoneParams {
  const p = PRESETS.find((x) => x.id === id)!;
  return { outlineMm: presetOutline(p).map((q) => ({ x: q.x * k, y: q.y * k })), longMm: p.longMm * k, widthMm: p.widthMm * k, depthMm: p.depthMm * k };
}

/** 写真から読んだ既定の三角（8.88 × 4.24 mm） */
export function realTriangleStone(): StoneParams {
  const m = measureOutline({ outlinePx: realTriangle as { x: number; y: number }[], longMm: 8.88 });
  return { outlineMm: m.outlineMm, longMm: m.longMm, widthMm: m.widthMm, depthMm: 4.24 };
}

if (process.argv[1]?.endsWith("tension-measure.ts")) {
  const args = process.argv.slice(2);
  const svgDir = args.find((a) => a.startsWith("--svg="))?.slice(6);
  const gous = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const list: [string, StoneParams][] = [["三角", realTriangleStone()], ...PRESETS.map((p) => [p.name, presetStone(p.id)] as [string, StoneParams])];
  for (const gou of gous.length ? gous : [11, 16]) {
    console.log(`\n=== ${gou} 号（φ4 丸線）===`);
    for (const [name, stone] of list) {
      const ring = buildRing({ stone, setting: { style: "tension", culetGapMm: 0.5 }, shank: { gou, metal: "k18y", section: "maru", widthMm: 4, thicknessMm: 4 } });
      const m = measureRing(name, ring);
      console.log(
        `${name.padEnd(6, "　")} 開き ${m.gapMm.toFixed(2)} 先と指 ${m.culetGapMm.toFixed(2)}（測 ${m.fingerClearMm.toFixed(2)}） 持上 ${m.liftMm.toFixed(2)} 形 ${m.shells} 開辺 ${m.open} 重なり ${m.overlapPts} 点 最深 ${m.overlapMaxMm.toFixed(3)} ${m.overlapAt} 金が石の中 ${m.metalInStone} 最小すき間 ${m.minClearMm.toFixed(3)} 入り[${m.beyondPlane.map((v) => v.toFixed(2))}] 底[${m.floor.map((v) => v.toFixed(2))}] 先が腕の内より下 ${m.culetBelowArmMm.toFixed(2)} 上面が腕の上より下 ${m.tableBelowArmMm.toFixed(2)} 確かめ[${m.checks.join(",")}]`,
      );
      if (svgDir) writeFileSync(`${svgDir}/section-${gou}-${name}.svg`, sectionSvg(ring, `${name} ${gou} 号 φ4 開き ${m.gapMm.toFixed(2)} mm 石の先と指 ${m.culetGapMm.toFixed(2)} mm`));
    }
  }
}
