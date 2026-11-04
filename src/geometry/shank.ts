// 腕：内側が平らで、外側の断面（甲丸・平打ち・半甲丸・角・手で描いた形）を指のまわりに回した輪。画面に依存しない純粋な関数。
// 座標は指輪の座標（ring.ts と同じ）：mm、x が指の向き（指の付け根 → 指先）、z が上（石のある側）、
// y は x と z の両方に直角（右手系）。指の軸は x 軸そのもので、腕は y–z の面にある円。
// 腕の内側のいちばん上（指のいちばん上）は z ＝ 内径 ÷ 2 の所。
import { GUIDES, innerDiameterMm, type MetalId } from "../rules/guides";
import { closedPart, ringsToTube, type V3 } from "./mesh";
import { meshVolume } from "./stone";
import { BALL_CUT, ballCut, type BallCut, type SeatCut } from "./notch";
import { railSeatZ, type Rail } from "./joint";
import { adaptiveSample, sampleCurve, uniformKnots, validKnots } from "./bspline";

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
   * 左右は同じ形（真ん中で折り返す）。点はなめらかな線（B スプライン）の制御点で、線は点の内側を通る
   */
  sectionPoints?: readonly SectionPoint[];
  /** 手で描いた断面の線（左右の制御点と節。section が free のとき。sectionPoints より先に使う） */
  sectionCurve?: SectionCurve;
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
  /** 外側の断面の線（mm）：x は幅の向き（真ん中 0）、y は内側（指の側）からの高さ。右の端の内側 → 左の端の内側 */
  outlineMm: [number, number][];
  /** 指の横（φ ＝ −90°、−y の側）での腕の幅（mm）。肩がなければ widthMm と同じ。3D に印を置くときに使う */
  sideWidthMm: number;
  /**
   * ザグり（石の先が入る所を、腕の上から削った深さ。mm、外側のいちばん上から測る）。削っていなければ 0。
   * 厚み・幅・断面の線（thicknessMm・widthMm・outlineMm）は削る前の腕の値のまま（ザグりはわざと削った所なので、腕の確かめには入れない）
   */
  notchDepthMm: number;
  /** ザグりに使った球のビットの直径（mm）。削っていなければ 0 */
  notchBallDiameterMm: number;
  /** ザグりの球（真ん中の x・y、くぼみの底の z、半径）。削っていなければ null */
  notchBall: { cx: number; cy: number; bottomZ: number; radiusMm: number } | null;
  /**
   * 石ごとのザグりの球（石を並べた指輪では石の数だけ。石が 1 つなら notchBall と同じ 1 つ）。
   * 真ん中の x・y・底の z は、その石の座標（腕を x 軸のまわりに −phi 回して、石を真上に置いた座標）
   */
  notchBalls: { cx: number; cy: number; bottomZ: number; radiusMm: number; phi: number }[];
  /** 使った肩（なければ null） */
  head: ShankHead | null;
  /** 石座の下の輪を受ける座（溝）のいちばん深い所（mm。その所の腕の上の面から）。座を作らなければ 0 */
  railSeatDepthMm: number;
}

/**
 * 腕の上の、石 1 つ分の座：石の場所（腕のいちばん上からの角度 phi、ラジアン。x 軸のまわり、＋ は +y の側）と、
 * その石の座標（腕を −phi 回して石を真上に置いた座標）での、ザグりの面と石座の下の輪
 */
export interface ShankSeat {
  phi: number;
  cut?: SeatCut | null;
  rail?: Rail | null;
}

/** 座ごとの削り方（buildShank の中だけで使う） */
interface SeatWork {
  phi: number;
  c: number;
  s: number;
  ball: BallCut | null;
  seatZ: ((x: number, y: number) => number) | null;
  regions: Region[];
  railBoxes: Region[];
}

/** 指のまわりの分け方と、内側の平らな所の分け方（形を作るための決まり） */
const AROUND = 128;
const FLAT = 6;
/**
 * 断面の形の決まり（形を作るための決まり。職人の目安の数ではない。**仮**：作者が見て、実物の線材に合わせて直す。
 * .claude/skills/jeweler-guides/SKILL.md の「腕とサイズ」にも書いた）。
 * どの断面も、なめらかな線（3 次の B スプライン）の制御点（線を引っぱる点）で決める。片側だけを書き、真ん中で折り返す。
 * 点は、真ん中のいちばん上（x ＝ 0）から、端の内側（y ＝ 0）へ順に。線は点を通らず、点の内側をなめらかに通る。
 * - 甲丸：半楕円（だ円の半分）に合わせた点（半楕円とのずれは幅の 0.1 % 以下）。
 * - 半甲丸：端は縦に立ち、上はゆるい丸み。
 * - 平打ち：上は平ら、角はなめらかに丸く、横は縦。
 * - 角：四角。角だけ小さく丸い。
 * turnDeg・stepLen：3D に使う点の細かさ（向きが turnDeg 度変わるか、stepLen 進むごとに点を置く。幅・厚みを 1 とした長さ）
 */
export const SECTION_SHAPE = {
  presets: {
    kouman: [[0, 1.109], [0.784, 0.784], [1, 0.262], [1, 0]],
    hangouman: [[0, 1], [0.5, 1], [0.95, 0.8], [1, 0.5], [1, 0]],
    hirauchi: [[0, 1], [0.4, 1], [0.72, 1], [1, 0.8], [1, 0.4], [1, 0]],
    kaku: [[0, 1], [0.5, 1], [0.86, 1], [1, 1], [1, 0.86], [1, 0.4], [1, 0]],
  } as Record<Exclude<ShankSection, "free">, [number, number][]>,
  turnDeg: 3,
  stepLen: 0.25,
};

/**
 * 手で描いた断面：なめらかな線の制御点（右の端の内側 → 上 → 左の端の内側。最初と最後の点は内側の線 y ＝ 0 の上）と節。
 * x は幅の位置（線の左右の端が −1 と 1）、y は高さ（いちばん高い所が 1）にそろえておく（normalizeCurve）。
 * 節がなければ等しい間隔
 */
export interface SectionCurve {
  points: SectionPoint[];
  knots?: number[];
}

/** 片側の点（真ん中 → 端）を折り返して、左右の点の列（右の端 → 左の端）にする */
export function curveFromHalf(half: readonly SectionPoint[]): SectionCurve {
  const h = cleanPoints(half);
  // 3 次の線には左右で 4 点以上いる（片側 2 点なら、間に 1 点足す）
  if (h.length < 3) h.splice(1, 0, { x: h[1].x / 2, y: h[0].y });
  const points = [...[...h].reverse().map((p) => ({ ...p })), ...h.slice(1).map((p) => ({ x: -p.x, y: p.y }))];
  return normalizeCurve({ points, knots: uniformKnots(points.length) });
}

/** 決まった断面の線（左右の制御点と節） */
export function presetCurve(section: ShankSection): SectionCurve {
  return curveFromHalf(sectionControlPoints(section));
}

/** 節を取り出す（なかったり、合わなかったりすれば、等しい間隔） */
export function curveKnots(c: SectionCurve): number[] {
  return validKnots(c.points.length, c.knots) ? [...c.knots!] : uniformKnots(c.points.length);
}

/** 線の大きさ（細かく取った線の左右の端と、いちばん高い所） */
export function curveExtent(c: SectionCurve): { xMin: number; xMax: number; yMax: number } {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMax = 0;
  for (const { p } of sampleCurve(c.points, curveKnots(c), 24)) {
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
    yMax = Math.max(yMax, p.y);
  }
  return { xMin, xMax, yMax };
}

/** 線の左右の端が −1 と 1、いちばん高い所が 1 になるよう、点を動かしてそろえる（形は同じ。線は点と同じように伸び縮みする） */
export function normalizeCurve(c: SectionCurve): SectionCurve {
  const knots = curveKnots(c);
  const { xMin, xMax, yMax } = curveExtent({ points: c.points, knots });
  const cx = (xMin + xMax) / 2;
  const hw = Math.max(1e-6, (xMax - xMin) / 2);
  const t = Math.max(1e-6, yMax);
  const points = c.points.map((p, i) => ({ x: (p.x - cx) / hw, y: i === 0 || i === c.points.length - 1 ? 0 : Math.max(0, p.y) / t }));
  return { points, knots };
}

/**
 * 断面の外側の線（幅の位置 ξ：−1〜1、高さ η：0〜1）。右の端の内側から、左の端の内側まで（両端をふくむ）。
 * なめらかな線を、曲がる所ほど細かく取る。どの断面も、幅の端が ±1、いちばん高い所が 1
 */
export function sectionOutline(section: ShankSection = "kouman", points?: readonly SectionPoint[], curve?: SectionCurve): [number, number][] {
  const c = section === "free" ? (curve?.points.length ? normalizeCurve(curve) : curveFromHalf(points?.length ? points : sectionControlPoints("kouman"))) : presetCurve(section);
  return adaptiveSample(c.points, curveKnots(c), SECTION_SHAPE.turnDeg, SECTION_SHAPE.stepLen).map((p) => [p.x, Math.max(0, p.y)] as [number, number]);
}

/** 決まった断面の片側の制御点（真ん中のいちばん上 → 端の内側） */
export function sectionControlPoints(section: ShankSection): SectionPoint[] {
  const key = section === "free" ? "kouman" : section;
  return SECTION_SHAPE.presets[key].map(([x, y]) => ({ x, y }));
}

/** 片側の点（真ん中 → 端）を、なめらかな線にする（左右同じ形。幅の端が ±1、いちばん高い所が 1） */
export function freeOutline(points: readonly SectionPoint[]): [number, number][] {
  return sectionOutline("free", points);
}

/**
 * 片側の点を、使える形に整える：x は 0 以上、y は 0〜（いちばん高い点の 1.5 倍まで）、最初は真ん中（x ＝ 0）、最後は端の内側（y ＝ 0）
 */
export function cleanPoints(points: readonly SectionPoint[]): SectionPoint[] {
  const fin = (v: number) => (Number.isFinite(v) ? v : 0);
  const p = points.map((q) => ({ x: Math.max(0, fin(q.x)), y: Math.max(0, fin(q.y)) }));
  if (p.length < 2) return SECTION_SHAPE.presets.kouman.map(([x, y]) => ({ x, y }));
  p[0] = { x: 0, y: Math.max(0.05, p[0].y) };
  const n = p.length - 1;
  p[n] = { x: Math.max(p[n].x, 0.05), y: 0 };
  return p;
}

/**
 * 腕を作る。cut があれば、石の先の真下を、球のビットで腕の上からザグる（notch.ts の ballCut）。
 * 削る所のまわりだけ、腕の点を細かく足してから（断面の線の点と、指のまわりの点を足す。三角形のつながりは格子のまま）、点を下げる。
 * どの点も格子の中にあるので、閉じた形のまま。notchStepMm：削る所の三角形の辺の長さ（なければ BALL_CUT.stepMm）
 */
export function buildShank(p: ShankParams, cut?: SeatCut, opts: { notchStepMm?: number; rail?: Rail | null; seats?: readonly ShankSeat[] } = {}): ShankResult {
  const section = p.section ?? "kouman";
  const w = p.widthMm ?? GUIDES.shank.widthMm;
  // 角の断面は、厚みを決めていなければ幅と同じ（四角）
  const t = p.thicknessMm ?? (section === "kaku" ? w : GUIDES.shank.thicknessMm);
  const metal = p.metal ?? "k18y";
  const dIn = innerDiameterMm(p.gou);
  const r = dIn / 2;
  // 外側の線は右の端の内側（y ＝ 0）から左の端の内側まで
  const outer = sectionOutline(section, p.sectionPoints, p.sectionCurve);
  // 指のまわりの角度 φ での幅（肩のある所だけ広い）。φ = 0 がいちばん上（+z）
  const widthAt = shoulderWidth(w, r + t, p.head);
  // 石ごとの座（石が 1 つなら、いちばん上の 1 つ）。石の場所（φ）ごとに、その石の座標（石が真上に来るよう回した座標）で削る
  const seatList: readonly ShankSeat[] = opts.seats ?? (cut || opts.rail ? [{ phi: 0, cut, rail: opts.rail ?? null }] : []);
  const step = opts.notchStepMm ?? BALL_CUT.stepMm;
  const work: SeatWork[] = seatList.map((sd) => {
    const topZ = bandTop(outer, r, t, widthAt, sd.phi);
    const ball = sd.cut ? ballCut(sd.cut, topZ, r + t) : null;
    // 石座の下の輪が腕に入りこむ所（接点）に、輪の形の座（溝）を作る
    const regions: Region[] = [];
    if (ball) regions.push({ xMin: ball.cx - ball.reachMm, xMax: ball.cx + ball.reachMm, yMin: ball.cy - ball.reachMm, yMax: ball.cy + ball.reachMm, zMin: ball.bottomZ - BALL_CUT.easeMm });
    const rail = sd.rail ?? null;
    if (rail) regions.push(...railRegions(rail, topZ));
    return { phi: sd.phi, c: Math.cos(sd.phi), s: Math.sin(sd.phi), ball, seatZ: rail ? railSeatZ(rail) : null, regions, railBoxes: regions.slice(ball ? 1 : 0) };
  });
  const active = work.filter((wk) => wk.regions.length);
  let outerRows = outer;
  let phis = Array.from({ length: AROUND }, (_, k) => (k / AROUND) * Math.PI * 2);
  if (active.length) ({ outerRows, phis } = refineAround(outer, phis, r, t, widthAt, active, step));
  // 断面（ξ：幅の中の位置 −1〜1、ρ：指の軸からの距離）。内側の平らな所を −1 → +1、外側を +1 → −1
  const section2: [number, number][] = [];
  const xR = outer[0][0];
  const xL = outer[outer.length - 1][0];
  for (let i = 0; i < FLAT; i++) section2.push([xL + ((xR - xL) * i) / FLAT, r]);
  for (const [xi, eta] of outerRows.slice(0, -1)) section2.push([xi, r + t * eta]);
  // 断面の点ごとに、指のまわりを 1 周する輪
  const rings: V3[][] = section2.map(([xi, rho], i) =>
    phis.map((phi) => {
      const x = (xi * widthAt(phi)) / 2;
      let y = rho * Math.sin(phi);
      let z = rho * Math.cos(phi);
      // 外側の点だけ削る。指の側（内径の円）より下へは下げない
      if (i >= FLAT)
        for (const wk of active) {
          // その石の座標へ（x 軸のまわりに −φ 回す）。石の真上の側（cos > 0）だけ
          const yl = y * wk.c - z * wk.s;
          let zl = y * wk.s + z * wk.c;
          if (zl <= 0) continue;
          let zc = wk.ball ? wk.ball.carve(x, yl, zl) : zl;
          if (wk.seatZ && wk.railBoxes.some((b) => x >= b.xMin && x <= b.xMax && yl >= b.yMin && yl <= b.yMax)) zc = Math.min(zc, wk.seatZ(x, yl));
          if (zc < zl) {
            zl = Math.max(zc, Math.sqrt(Math.max(0, r * r - yl * yl)));
            y = yl * wk.c + zl * wk.s;
            z = -yl * wk.s + zl * wk.c;
          }
        }
      return [x, y, z] as V3;
    }),
  );
  const balls = work.flatMap((wk) => (wk.ball ? [{ cx: wk.ball.cx, cy: wk.ball.cy, bottomZ: wk.ball.bottomZ, radiusMm: wk.ball.radiusMm, phi: wk.phi }] : []));
  const ball = balls[0] ?? null;
  const notchDepthMm = balls.reduce((m, b) => Math.max(m, r + t - b.bottomZ), 0);
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
    outlineMm: outer.map(([xi, eta]) => [(xi * w) / 2, eta * t] as [number, number]),
    sideWidthMm: widthAt(-Math.PI / 2),
    notchDepthMm,
    notchBallDiameterMm: ball ? 2 * ball.radiusMm : 0,
    notchBall: ball ? { cx: ball.cx, cy: ball.cy, bottomZ: ball.bottomZ, radiusMm: ball.radiusMm } : null,
    notchBalls: balls,
    head: p.head && p.head.widthMm > w ? p.head : null,
    railSeatDepthMm: work.reduce((m, wk) => wk.railBoxes.reduce((mm, b) => Math.max(mm, b.depth ?? 0), m), 0),
  };
}

/**
 * 削る前の腕の上の面の高さ z(x, y)（腕がない所は −Infinity）。外側の線（ξ, η）と、指のまわりの幅から求める。
 * 上から見た (x, y) の真下の点を、φ ＝ asin(y ÷ ρ)、ξ ＝ 2x ÷ 幅(φ)、ρ ＝ 内側の半径 ＋ 厚み × η(ξ) を数回くり返して探す
 */
function bandTop(outer: [number, number][], r: number, t: number, widthAt: (phi: number) => number, phi0 = 0): (x: number, y: number) => number {
  const etaAt = (xi: number) => {
    let eta = -Infinity;
    for (let j = 0; j + 1 < outer.length; j++) {
      const [x0, e0] = outer[j];
      const [x1, e1] = outer[j + 1];
      if ((xi - x0) * (xi - x1) > 0 || x0 === x1) continue;
      eta = Math.max(eta, e0 + ((e1 - e0) * (xi - x0)) / (x1 - x0));
    }
    return eta;
  };
  return (x, y) => {
    let rho = r + t;
    for (let it = 0; it < 4; it++) {
      if (Math.abs(y) >= rho) return -Infinity;
      const eta = etaAt((2 * x) / widthAt(Math.asin(y / rho) + phi0));
      if (eta === -Infinity) return -Infinity;
      rho = r + t * eta;
    }
    return Math.abs(y) >= rho ? -Infinity : Math.sqrt(rho * rho - y * y);
  };
}

/** 腕を削る所（上から見た箱と、削るいちばん低い z） */
interface Region {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  /** 削る深さ（その所の腕の上の面から。座のときだけ） */
  depth?: number;
}

/**
 * 石座の下の輪が腕の上に入りこむ所（接点）の箱。輪の下の面が、腕の上の面より下にある輪の点を、ひと続きごとに囲む。
 * 箱は輪の半径だけ広げる。zMin は輪の下の面
 */
function railRegions(rail: Rail, topZ: (x: number, y: number) => number): Region[] {
  const a = rail.radiusMm;
  const n = rail.pts.length;
  const under = rail.pts.map(([x, y, z]) => z - a < topZ(x, y));
  const start = under.indexOf(false);
  if (start < 0) return [];
  const out: Region[] = [];
  let cur: Region | null = null;
  for (let s = 0; s <= n; s++) {
    const i = (start + s) % n;
    const [x, y, z] = rail.pts[i];
    if (under[i] && s < n) {
      cur ??= { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity, zMin: Infinity, depth: 0 };
      cur.depth = Math.max(cur.depth!, topZ(x, y) - (z - a));
      cur.xMin = Math.min(cur.xMin, x - a);
      cur.xMax = Math.max(cur.xMax, x + a);
      cur.yMin = Math.min(cur.yMin, y - a);
      cur.yMax = Math.max(cur.yMax, y + a);
      cur.zMin = Math.min(cur.zMin, z - a);
    } else if (cur) {
      // ひと続きが終わったら、箱を閉じる
      out.push(cur);
      cur = null;
    }
  }
  const pad = 2 * a;
  return out.map((b) => ({ ...b, xMin: b.xMin - pad, xMax: b.xMax + pad, yMin: b.yMin - pad, yMax: b.yMax + pad }));
}

/**
 * 削る所のまわりだけ、格子を細かくする。
 * 断面の線：削る所にかかる区間を、長さ step ごとに分ける（もとの線の上に点を足すだけなので、削らない所の形は変わらない）。
 * 指のまわり：削る所にかかる角度の区間を、外側で長さ step ごとに分ける。
 * 球のビットがあれば、石の先の真下に、ちょうど格子の点が来るよう、その所でも分ける（くぼみの底がちょうど深さになる）
 */
function refineAround(
  outer: [number, number][],
  phis0: number[],
  r: number,
  t: number,
  widthAt: (phi: number) => number,
  seats: readonly SeatWork[],
  step: number,
): { outerRows: [number, number][]; phis: number[] } {
  const top = r + t;
  const margin = 2 * step;
  // 球のビットの真ん中の、指のまわりの角度（指輪の座標）と、断面の上の位置
  const centers = seats.flatMap((sd) => {
    const ball = sd.ball;
    if (!ball) return [];
    const phiL = Math.asin(Math.max(-1, Math.min(1, ball.cy / top)));
    const half = widthAt(phiL + sd.phi) / 2;
    const xiC = ball.cx / half;
    // 石の先の真下を通る区間（いちばん上にあるもの）
    let jC = -1;
    for (let j = 0; j + 1 < outer.length; j++) {
      const [x0, e0] = outer[j];
      const [x1, e1] = outer[j + 1];
      if ((xiC - x0) * (xiC - x1) > 0 || x0 === x1) continue;
      if (jC < 0 || Math.max(e0, e1) > Math.max(outer[jC][1], outer[jC + 1][1])) jC = j;
    }
    // φ は 0〜2π で数えるので、そろえる
    let pc = phiL + sd.phi;
    pc = ((pc % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return [{ xiC, jC, pc }];
  });
  const half0 = Math.max(...seats.map((sd) => widthAt(sd.phi) / 2));
  const outerRows: [number, number][] = [];
  for (let j = 0; j + 1 < outer.length; j++) {
    const [x0, e0] = outer[j];
    const [x1, e1] = outer[j + 1];
    outerRows.push(outer[j]);
    const zTop = r + t * Math.max(e0, e1);
    const near = seats.some((sd) => sd.regions.some((g) => Math.max(x0, x1) * half0 >= g.xMin - margin && Math.min(x0, x1) * half0 <= g.xMax + margin && zTop >= g.zMin - 0.05 * t));
    if (!near) continue;
    const length = Math.hypot((x1 - x0) * half0, (e1 - e0) * t);
    const cuts = centers.filter((c) => c.jC === j).map((c) => (c.xiC - x0) / (x1 - x0));
    for (const s of splitParams(length, cuts, step)) outerRows.push([x0 + (x1 - x0) * s, e0 + (e1 - e0) * s]);
  }
  outerRows.push(outer[outer.length - 1]);
  // 指のまわり：上から見て（その石の座標で）、削る所の y の幅にかかる、石の側の区間
  const phis: number[] = [];
  const n = phis0.length;
  for (let k = 0; k < n; k++) {
    const a = phis0[k];
    const b = k + 1 < n ? phis0[k + 1] : Math.PI * 2;
    phis.push(a);
    const hit = seats.some((sd) => {
      const al = a - sd.phi;
      const bl = b - sd.phi;
      if (Math.cos(al) <= 0 || Math.cos(bl) <= 0) return false;
      const ya = top * Math.sin(al);
      const yb = top * Math.sin(bl);
      return sd.regions.some((g) => Math.max(ya, yb) >= g.yMin - margin && Math.min(ya, yb) <= g.yMax + margin);
    });
    if (!hit) continue;
    const cuts = centers.filter((c) => c.pc > a && c.pc < b).map((c) => (c.pc - a) / (b - a));
    for (const s of splitParams((b - a) * top, cuts, step)) phis.push(a + (b - a) * s);
  }
  return { outerRows, phis };
}

/** 0〜1 の区間を、長さ length の線として step 以下に分ける点（0 と 1 はふくまない）。cuts の所でも必ず分ける */
function splitParams(length: number, cuts: number[], step: number): number[] {
  const marks = [0, ...cuts.filter((c) => c > 1e-6 && c < 1 - 1e-6), 1];
  const out: number[] = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const a = marks[i];
    const b = marks[i + 1];
    const pieces = Math.max(1, Math.ceil(((b - a) * length) / step));
    for (let q = i === 0 ? 1 : 0; q < pieces; q++) out.push(a + ((b - a) * q) / pieces);
  }
  return out;
}

/**
 * 指のまわりの角度 φ（ラジアン、いちばん上が 0）での腕の幅。肩がなければいつも w。
 * 肩があれば、いちばん上から外側に沿って spanMm / 2 までは広い幅、そこから taperMm でなめらかに（余弦の形で）元の幅へ戻る。
 */
export function shoulderWidth(w: number, outerR: number, head: ShankHead | undefined): (phi: number) => number {
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
