// 腕：内側が平らで、外側の断面（甲丸・平打ち・半甲丸・角・手で描いた形）を指のまわりに回した輪。画面に依存しない純粋な関数。
// 座標は指輪の座標（ring.ts と同じ）：mm、x が指の向き（指の付け根 → 指先）、z が上（石のある側）、
// y は x と z の両方に直角（右手系）。指の軸は x 軸そのもので、腕は y–z の面にある円。
// 腕の内側のいちばん上（指のいちばん上）は z ＝ 内径 ÷ 2 の所。
import { GUIDES, innerDiameterMm, type MetalId } from "../rules/guides";
import { closedPart, ringsToTube, type V3 } from "./mesh";
import { meshVolume } from "./stone";

/** 腕の断面：甲丸・平打ち・半甲丸・角、と手で描いた形 */
export type ShankSection = "kouman" | "hirauchi" | "hangouman" | "kaku" | "free";
export const SHANK_SECTIONS = ["kouman", "hirauchi", "hangouman", "kaku"] as const;
export const SHANK_SECTION_LABEL: Record<ShankSection, string> = { kouman: "甲丸", hirauchi: "平打ち", hangouman: "半甲丸", kaku: "角", free: "手で描く" };

/** 断面の点（幅の位置 x：真ん中 0〜端 1、高さ y：内側 0〜いちばん厚い所 1） */
export interface SectionPoint {
  x: number;
  y: number;
}

export interface ShankParams {
  /** 号数（日本のサイズ） */
  gou: number;
  /** 幅（mm、指の向きの長さ）。なければ目安 */
  widthMm?: number;
  /** 厚み（mm、いちばん厚い真ん中）。なければ目安 */
  thicknessMm?: number;
  /** 地金。なければ K18 イエロー */
  metal?: MetalId;
  /** 断面。なければ甲丸 */
  section?: ShankSection;
  /**
   * 手で描いた断面（section が free のとき）：片側の形を決める点。真ん中のいちばん上（x ＝ 0）から、端の内側（y ＝ 0）へ順に。
   * 左右は同じ形（真ん中で折り返す）。点の間はなめらかな線でつなぐ
   */
  sectionPoints?: readonly SectionPoint[];
  /**
   * 石座を受ける肩。腕のいちばん上のまわりだけ幅を広げ、石座の足が腕の幅に収まるようにする。
   * なければ、どこも同じ幅（いちばん上で広げない）
   */
  head?: ShankHead;
}

export interface ShankHead {
  /** いちばん上の幅（mm）。腕の幅より狭ければ広げない */
  widthMm: number;
  /** その幅を保つ長さ（mm、腕の外側に沿って測る。真ん中が腕のいちばん上） */
  spanMm: number;
  /** 広い所から元の幅へ、なめらかに戻る長さ（mm、片側） */
  taperMm: number;
}

export interface ShankResult {
  /** 三角形ごとに 3 頂点 × xyz（頂点は共有しない） */
  positions: Float32Array;
  gou: number;
  innerDiameterMm: number;
  innerRadiusMm: number;
  /** 外側のいちばん上の半径（内径 ÷ 2 ＋ 厚み） */
  outerRadiusMm: number;
  widthMm: number;
  thicknessMm: number;
  section: ShankSection;
  metal: MetalId;
  /** 体積（mm³） */
  volumeMm3: number;
  /** 重さの見積もり（g）＝ 体積 × 地金の密度（目安） */
  weightG: number;
}

/** 指のまわりの分け方と、断面の丸みの分け方（形を作るための決まり） */
const AROUND = 128;
const DOME = 16;
const FLAT = 4;
/**
 * 断面の形の決まり（形を作るための決まり。職人の目安の数ではない。**仮**：作者が見て、実物の線材に合わせて直す。
 * .claude/skills/jeweler-guides/SKILL.md の「腕とサイズ」にも書いた）。
 * 平打ち・角は「角の丸い四角」（超楕円 |x|ⁿ ＋ |y|ⁿ ＝ 1 の上半分）で、n が大きいほど角が立つ。
 * 半甲丸は、端に縦の壁（いちばん厚い所の wall の高さ）があり、その上にゆるい丸み。
 * steps：断面の外側の線の点の数。spline：手で描いた点の間の点の数
 */
const SECTION_SHAPE = { hirauchiN: 4, kakuN: 9, hangoumanWall: 0.5, steps: 32, spline: 8 };

/**
 * 断面の外側の線（幅の位置 ξ：−1〜1、高さ η：0〜1）。ξ ＝ +1 の端から −1 の端の手前まで（−1 の端は内側の平らな線の始まり）。
 * どの断面も、真ん中（ξ ＝ 0）の高さがいちばん厚く 1、幅の端が ±1 になるようにそろえる
 */
export function sectionOutline(section: ShankSection = "kouman", points?: readonly SectionPoint[]): [number, number][] {
  if (section === "kouman") {
    // これまでの甲丸のまま（半楕円）
    return Array.from({ length: DOME }, (_, i) => {
      const a = (Math.PI * i) / DOME;
      return [Math.cos(a), Math.sin(a)] as [number, number];
    });
  }
  if (section === "free") return freeOutline(points?.length ? points : sectionControlPoints("kouman"));
  const N = SECTION_SHAPE.steps;
  const out: [number, number][] = [];
  if (section === "hangouman") {
    const e = SECTION_SHAPE.hangoumanWall;
    out.push([1, 0]);
    for (let i = 0; i < N; i++) {
      const a = (Math.PI * i) / N;
      out.push([Math.cos(a), e + (1 - e) * Math.sin(a)]);
    }
    out.push([-1, e]);
    return out;
  }
  const n = section === "kaku" ? SECTION_SHAPE.kakuN : SECTION_SHAPE.hirauchiN;
  for (let i = 0; i < N; i++) {
    const a = (Math.PI * i) / N;
    const c = Math.cos(a);
    out.push([Math.sign(c) * Math.abs(c) ** (2 / n), Math.sin(a) ** (2 / n)]);
  }
  return out;
}

/** 手で描く前の、決まった断面の形の点（片側。真ん中のいちばん上 → 端の内側）。手で描く画面の始まりの形 */
export function sectionControlPoints(section: ShankSection): SectionPoint[] {
  if (section === "free") return sectionControlPoints("kouman");
  const angles = [90, 62, 36, 14, 0].map((d) => (d * Math.PI) / 180);
  if (section === "kouman") return angles.map((a) => ({ x: Math.cos(a), y: Math.sin(a) }));
  if (section === "hangouman") {
    const e = SECTION_SHAPE.hangoumanWall;
    return [...[90, 55, 25, 0].map((d) => (d * Math.PI) / 180).map((a) => ({ x: Math.cos(a), y: e + (1 - e) * Math.sin(a) })), { x: 1, y: 0 }];
  }
  const n = section === "kaku" ? SECTION_SHAPE.kakuN : SECTION_SHAPE.hirauchiN;
  // 角の丸い四角：上の面に 2 点、角の近くに 1 点、横の面に 1 点（指でつまみやすいよう、点が重ならない所に置く）
  const top = (x: number) => ({ x, y: (1 - x ** n) ** (1 / n) });
  const side = (y: number) => ({ x: (1 - y ** n) ** (1 / n), y });
  return [{ x: 0, y: 1 }, top(0.55), top(0.88), side(0.45), { x: 1, y: 0 }];
}

/**
 * 手で描いた点を、なめらかな線でつなぐ（片側を真ん中で折り返して、左右同じ形に）。
 * 点の間は、点を必ず通る曲線（向心のキャットマル・ロム）。最後に、幅の端が 1、真ん中の高さが 1 になるようそろえる
 */
export function freeOutline(points: readonly SectionPoint[]): [number, number][] {
  const half = cleanPoints(points);
  // ξ ＝ +1 の端 → 真ん中 → −1 の端
  const ctrl: SectionPoint[] = [...[...half].reverse(), ...half.slice(1).map((p) => ({ x: -p.x, y: p.y }))];
  const pts: [number, number][] = [];
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    for (let k = 0; k < SECTION_SHAPE.spline; k++) pts.push(catmull(p0, p1, p2, p3, k / SECTION_SHAPE.spline));
  }
  // 最後の点（−1 の端）は内側の平らな線の始まりと同じ所なので入れない。ただし端が浮いている（y > 0）なら入れる
  const last = ctrl[ctrl.length - 1];
  if (last.y > 1e-6) pts.push([last.x, last.y]);
  let xMax = 0;
  let yMax = 0;
  for (const [x, y] of pts) {
    xMax = Math.max(xMax, Math.abs(x));
    yMax = Math.max(yMax, y);
  }
  // 真ん中の高さを 1 に（真ん中がいちばん厚い。石座は腕のいちばん上の真ん中にのる）
  const yMid = Math.max(1e-3, half[0].y);
  return pts.map(([x, y]) => [x / Math.max(1e-6, xMax), Math.min(1, Math.max(0, y) / yMid)] as [number, number]);
}

/**
 * 手で描いた点を、使える形に整える：x と y を 0〜1 に、最初は真ん中（x ＝ 0）、最後は端の内側（y ＝ 0）、x は順に大きく、
 * どの点も真ん中より高くしない（真ん中がいちばん厚い。石座がのる所）
 */
export function cleanPoints(points: readonly SectionPoint[]): SectionPoint[] {
  const clamp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const p = points.map((q) => ({ x: clamp(q.x), y: clamp(q.y) }));
  if (p.length < 2) return sectionControlPoints("kouman");
  p[0] = { x: 0, y: Math.max(0.05, p[0].y) };
  const n = p.length - 1;
  p[n] = { x: Math.max(p[n].x, 0.05), y: 0 };
  for (let i = 1; i <= n; i++) {
    p[i].x = Math.max(p[i].x, p[i - 1].x);
    p[i].y = Math.min(p[i].y, p[0].y);
  }
  return p;
}

function catmull(p0: SectionPoint, p1: SectionPoint, p2: SectionPoint, p3: SectionPoint, t: number): [number, number] {
  // 向心のキャットマル・ロム（点の間隔の平方根で重みを付ける。曲線が点の外へ大きくふくらまない）
  const d = (a: SectionPoint, b: SectionPoint) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: SectionPoint, b: SectionPoint, ta: number, tb: number): SectionPoint => {
    const k = tb - ta < 1e-9 ? 0 : (u - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  const c = lerp(b1, b2, t1, t2);
  return [c.x, c.y];
}

export function buildShank(p: ShankParams): ShankResult {
  const section = p.section ?? "kouman";
  const w = p.widthMm ?? GUIDES.shank.widthMm;
  // 角の断面は、厚みを決めていなければ幅と同じ（四角）
  const t = p.thicknessMm ?? (section === "kaku" ? w : GUIDES.shank.thicknessMm);
  const metal = p.metal ?? "k18y";
  const dIn = innerDiameterMm(p.gou);
  const r = dIn / 2;
  // 断面（ξ：幅の中の位置 −1〜1、ρ：指の軸からの距離）。内側の平らな所を −1 → +1、外側を +1 → −1
  const section2: [number, number][] = [];
  for (let i = 0; i < FLAT; i++) section2.push([-1 + (2 * i) / FLAT, r]);
  for (const [xi, eta] of sectionOutline(section, p.sectionPoints)) section2.push([xi, r + t * eta]);
  // 指のまわりの角度 φ での幅（肩のある所だけ広い）。φ = 0 がいちばん上（+z）
  const widthAt = shoulderWidth(w, r + t, p.head);
  // 断面の点ごとに、指のまわりを 1 周する輪
  const rings: V3[][] = section2.map(([xi, rho]) =>
    Array.from({ length: AROUND }, (_, k) => {
      const phi = (k / AROUND) * Math.PI * 2;
      return [(xi * widthAt(phi)) / 2, rho * Math.sin(phi), rho * Math.cos(phi)] as V3;
    }),
  );
  const tris: number[] = [];
  ringsToTube(rings, tris);
  const positions = closedPart(tris);
  const volumeMm3 = meshVolume(positions);
  return {
    positions,
    gou: p.gou,
    innerDiameterMm: dIn,
    innerRadiusMm: r,
    outerRadiusMm: r + t,
    widthMm: w,
    thicknessMm: t,
    section,
    metal,
    volumeMm3,
    weightG: weightG(volumeMm3, metal),
  };
}

/**
 * 指のまわりの角度 φ（ラジアン、いちばん上が 0）での腕の幅。肩がなければいつも w。
 * 肩があれば、いちばん上から外側に沿って spanMm / 2 までは広い幅、そこから taperMm でなめらかに（余弦の形で）元の幅へ戻る。
 */
function shoulderWidth(w: number, outerR: number, head: ShankHead | undefined): (phi: number) => number {
  if (!head || head.widthMm <= w) return () => w;
  return (phi) => {
    const a = Math.atan2(Math.sin(phi), Math.cos(phi)); // −π〜π にそろえる
    const s = Math.abs(a) * outerR - head.spanMm / 2;
    const k = s <= 0 ? 1 : s >= head.taperMm ? 0 : 0.5 * (1 + Math.cos((Math.PI * s) / head.taperMm));
    return w + (head.widthMm - w) * k;
  };
}

/** 体積（mm³）から重さ（g）の見積もり。1 cm³ ＝ 1000 mm³ */
export function weightG(volumeMm3: number, metal: MetalId): number {
  return (volumeMm3 / 1000) * GUIDES.metals[metal].densityGPerCm3;
}
