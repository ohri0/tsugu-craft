// 腕：内側が平らで、外側の断面（甲丸・平打ち・半甲丸・角・手で描いた形）を指のまわりに回した輪。画面に依存しない純粋な関数。
// 座標は指輪の座標（ring.ts と同じ）：mm、x が指の向き（指の付け根 → 指先）、z が上（石のある側）、
// y は x と z の両方に直角（右手系）。指の軸は x 軸そのもので、腕は y–z の面にある円。
// 腕の内側のいちばん上（指のいちばん上）は z ＝ 内径 ÷ 2 の所。
import { GUIDES, innerDiameterMm, type MetalId } from "../rules/guides";
import { closedPart, pushTri, ringsToTube, stackLoops, type V3 } from "./mesh";
import { meshVolume } from "./stone";
import { BALL_CUT, ballCut, type BallCut, type SeatCut } from "./notch";
import { railSeatZ, type Rail } from "./joint";
import { adaptiveSample, sampleCurve, uniformKnots, validKnots } from "./bspline";
import { makeLoft, type Loft, type LoftFrame, type LoftPlace } from "./shank-loft";
import { RELIEF_LABEL, RELIEF_MESH, adaptivePatch, combineFields, makeReliefField, rowTrace, rowsV, type ReliefParams } from "./shank-relief";

/** 腕の断面：甲丸・平打ち・半甲丸・角、丸線（内側も丸い）、と手で描いた形 */
export type ShankSection = "kouman" | "hirauchi" | "hangouman" | "kaku" | "maru" | "free";
export const SHANK_SECTIONS = ["kouman", "hirauchi", "hangouman", "kaku"] as const;
export const SHANK_SECTION_LABEL: Record<ShankSection, string> = { kouman: "甲丸", hirauchi: "平打ち", hangouman: "半甲丸", kaku: "角", maru: "丸線", free: "自由な線" };

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
  /**
   * 腕の場所ごとの形（なければ、どこも同じ形）。widthMm・thicknessMm・断面は、いちばん上（石座のそば）の形で、ここにはそれより下の場所を書く。
   * 丸線の腕・テンション・石を並べた指輪では使わない（どこも同じ形）
   */
  stations?: readonly ShankStation[];
  /** 腕の外の面に彫る模様（なければ彫らない）。丸線の腕・テンション・石を並べた指輪では使わない */
  relief?: ReliefParams;
  /** 重ねて彫る模様（縁の粒、肩の葉など。relief があるときだけ） */
  reliefMore?: readonly ReliefParams[];
}

/** 腕の場所の形（左右は同じ。shank-loft.ts がなめらかにつなぐ） */
export interface ShankStation {
  /** いちばん上から指のまわりに測った角度（度。180 がいちばん下） */
  atDeg: number;
  widthMm: number;
  thicknessMm: number;
  /** この場所の断面（なければ、ひとつ上の場所と同じ）。丸線は使えない */
  section?: Exclude<ShankSection, "maru">;
  /** この場所の断面の線（section が free のとき。section を書かずに curve だけでもよい） */
  curve?: SectionCurve;
  /** 腕を指の向きへ寄せる量（mm）。右の肩が指先の側へ寄ると、左の肩は付け根の側へ寄る（S の字の流れ）。いちばん下では 0 */
  swayMm?: number;
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
  /**
   * 腕の間に挟む石座のために、いちばん上を切った腕の両端（＋y の側と −y の側）。腕の真ん中（x ＝ 0）での端の y と、端の面の上と下の z。
   * 切っていなければ null
   */
  ends: { y: number; topZ: number; bottomZ: number }[] | null;
  /** 腕の場所ごとの形（どこも同じ形ならなし）。いちばん上から下へ */
  along?: { atDeg: number; widthMm: number; thicknessMm: number; outlineMm: [number, number][] }[];
  /** ぐるりと見て、いちばん細い幅（どこも同じ形ならなし。確かめに使う） */
  minWidthMm?: number;
  /** ぐるりと見て、いちばん薄い厚み（どの場所でも、いちばん厚い所の厚み。どこも同じ形ならなし） */
  minThicknessMm?: number;
  /** 面の向き（彫りのある腕だけ。positions と同じ並び）。あれば、画面はこの向きで光を当てる（線の縁がなめらかに見える） */
  normals?: Float32Array;
  /** 腕の彫り（なければなし）。peakUnderMm：彫る所の、いちばん厚い所から彫りの深さを引いた厚み。localUnderMm：彫った所の、指の側までの地金のいちばん薄い所 */
  relief?: ReliefParams & { fromDegUsed: number; toDegUsed: number; peakUnderMm: number; localUnderMm: number };
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
  } as Record<Exclude<ShankSection, "free" | "maru">, [number, number][]>,
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

/** いちばん上の形のまま保つ所に、石座の外へ足す余白（形を作るための決まり。ロウの丸みがこの中に収まるように。度） */
const HOLD_MARGIN_RAD = (5 * Math.PI) / 180;

/** 腕の彫りの、はじめと終わりの余白（形を作るための決まり。度。腕の端とロウの丸みから離す） */
const RELIEF_MARGIN_DEG = 2;

/** 彫りを作る。行の細かさを足してから呼ぶ */
function reliefOf(p: ShankParams, loft: Loft, flat: number, r: number, t: number, holdRad: number) {
  const rel = p.relief!;
  const v = rowsV(loft.rows[0], p.widthMm ?? GUIDES.shank.widthMm, t);
  const field = combineFields(
    [rel, ...(p.reliefMore ?? [])].map((q) => {
      const a0 = Math.max((q.fromDeg * Math.PI) / 180, holdRad + (RELIEF_MARGIN_DEG * Math.PI) / 180);
      const a1 = Math.max(a0 + 0.05, Math.min(Math.PI, (q.toDeg * Math.PI) / 180));
      return makeReliefField(q, {
        a0,
        a1,
        v,
        innerR: r,
        at: (a) => {
          const f = loft.frame(a);
          return { w: f.w, t: f.t, arc: loft.arcHalf(f) };
        },
      });
    }),
  );
  const { a0, a1 } = field;
  const keep = GUIDES.band.relief.keepMm;
  /** 彫ったあとの点（x、ρ）。面の向きに沈める（急な面でも同じ深さに見え、腕の輪郭が欠けない）。薄い所では浅くして、指の側までの地金を残す */
  const surface = (i: number, phi: number, f: LoftFrame, wOverride?: number): [number, number] => {
    const q = loft.point(i, flat, f, r, wOverride);
    if (i < flat) return q;
    const d0 = field.depth(i - flat, phi);
    if (d0 <= 0) return q;
    const [nx, nr] = loft.normalAt(i - flat, f);
    const d = Math.min(d0, Math.max(0, (q[1] - r - keep) / Math.max(nr, 0.35)));
    return [q[0] - d * nx, q[1] - d * nr];
  };
  const mesh = rel.fine ? RELIEF_MESH.fine : RELIEF_MESH.normal;
  /** その角度での、幅・厚み・流れの変わり方（角度あたり）。近い角度は使い回す */
  const slopes = new Map<number, { dw: number; dt: number; ds: number }>();
  const slopeAt = (phi: number) => {
    const id = Math.round(phi * 2000);
    let q = slopes.get(id);
    if (!q) {
      const eps = 0.01;
      const fa = loft.frame(phi - eps);
      const fb = loft.frame(phi + eps);
      q = { dw: (fb.w - fa.w) / (2 * eps), dt: (fb.t - fa.t) / (2 * eps), ds: (fb.sway - fa.sway) / (2 * eps) };
      slopes.set(id, q);
    }
    return q;
  };
  /** 外の面の向き（3 次元）。seg：行の区間、sf：その中の割合。彫りの深さの傾きぶん傾ける */
  const normalOuter = (seg: number, sf: number, phi: number): V3 => {
    const f = loft.frame(phi);
    const [tx, tp] = loft.tangentIn(seg, sf, f);
    const sn = Math.sin(phi);
    const cs = Math.cos(phi);
    const q = loft.point(flat + seg + sf, flat, f, r);
    // 指のまわりの向き（場所で形が変わるぶんもふくむ）
    const sl = slopeAt(phi);
    const dx = ((q[0] - f.sway) / Math.max(f.w, 1e-6)) * sl.dw + sl.ds;
    const dr = ((q[1] - r) / Math.max(f.t, 1e-6)) * sl.dt;
    const cx = dx;
    const cy = dr * sn + q[1] * cs;
    const cz = dr * cs - q[1] * sn;
    const lc = Math.hypot(cx, cy, cz) || 1;
    const ux = cx / lc;
    const uy = cy / lc;
    const uz = cz / lc;
    const rx = tx;
    const ry = tp * sn;
    const rz = tp * cs;
    // 外向き：線の進む向きと指のまわりの向きに直角で、断面の外向きの側
    let nx = ry * uz - rz * uy;
    let ny = rz * ux - rx * uz;
    let nz = rx * uy - ry * ux;
    if (nx * tp + (ny * -tx * sn + nz * -tx * cs) < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    // 彫りの傾き
    const pa = phi < 0 ? phi + Math.PI * 2 : phi > Math.PI * 2 ? phi - Math.PI * 2 : phi;
    const aa = pa > Math.PI ? Math.PI * 2 - pa : pa;
    if (aa > field.a0 && aa < field.a1) {
      const rm = loft.rowMmAt(seg, f) || 1;
      const stepR = Math.min(0.5, mesh.normalMm / rm);
      const stepPhi = mesh.normalMm / lc;
      const rr = seg + sf;
      const gr = (field.depth(rr + stepR, phi) - field.depth(rr - stepR, phi)) / (2 * stepR * rm);
      const gc = (field.depth(rr, phi + stepPhi) - field.depth(rr, phi - stepPhi)) / (2 * stepPhi * lc);
      if (gr !== 0 || gc !== 0) {
        nx += gr * rx + gc * ux;
        ny += gr * ry + gc * uy;
        nz += gr * rz + gc * uz;
      }
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  return { a0, a1, field, surface, normalOuter, mesh };
}

/**
 * 彫りのある腕の、格子の三角形と面の向きを作る（彫る所は飛ばす）。
 * k：断面の点の番号（内側の平らな行 flat 本 ＋ 外側の行、m 本で 1 周）、j：指のまわりの列（cols 本。wrap なら 1 周）。
 * tubeOrder：ringsToTube の向き（false は stackLoops の向き）
 */
function reliefGrid(o: {
  m: number;
  cols: number;
  wrap: boolean;
  flat: number;
  tubeOrder: boolean;
  at: (k: number, j: number) => V3;
  phiAt: (k: number, j: number) => number;
  skip: (k: number, j: number) => boolean;
  normalOuter: (seg: number, sf: number, phi: number) => V3;
  isCrease: (row: number) => boolean;
  tris: number[];
  normals: number[];
}): void {
  const { m, cols, flat } = o;
  const cache = new Map<number, V3>();
  /** 点 (k, j) の面の向き。quad：四角が断面のどの区間か（k の行が折れ目なら、四角の側の向きを使う） */
  const vn = (k: number, j: number, quad: number): V3 => {
    const phi = o.phiAt(k, j);
    if (quad < flat) return [0, -Math.sin(phi), -Math.cos(phi)];
    const seg = quad - flat;
    const kk = k === 0 ? m : k;
    const sf = kk - flat - seg;
    const row = kk - flat;
    const id = (kk * 200003 + j) * 2 + (o.isCrease(row) && sf === 1 ? 1 : 0);
    let q = cache.get(id);
    if (!q) {
      q = o.normalOuter(seg, sf, phi);
      cache.set(id, q);
    }
    return q;
  };
  const jEnd = o.wrap ? cols : cols - 1;
  for (let k = 0; k < m; k++)
    for (let j = 0; j < jEnd; j++) {
      if (o.skip(k, j)) continue;
      const k2 = (k + 1) % m;
      const j2 = (j + 1) % cols;
      const a = o.at(k, j);
      const b = o.at(k, j2);
      const c = o.at(k2, j2);
      const d = o.at(k2, j);
      const na = vn(k, j, k);
      const nb = vn(k, j2, k);
      const nc = vn(k2, j2, k);
      const nd = vn(k2, j, k);
      if (o.tubeOrder) {
        pushTri(o.tris, a, b, c);
        pushTri(o.tris, a, c, d);
        pushTri(o.normals, na, nb, nc);
        pushTri(o.normals, na, nc, nd);
      } else {
        pushTri(o.tris, a, d, c);
        pushTri(o.tris, a, c, b);
        pushTri(o.normals, na, nd, nc);
        pushTri(o.normals, na, nc, nb);
      }
    }
}

/** 彫りのある腕の positions と normals（裏返すときは、面の向きの並びも同じに） */
function closedWithNormals(tris: number[], normals: number[]): { positions: Float32Array; normals: Float32Array } {
  const flipped = meshVolume(new Float32Array(tris)) < 0;
  const n = new Float32Array(normals);
  if (flipped) {
    for (let i = 0; i < n.length; i += 9)
      for (let c = 0; c < 3; c++) {
        const v = n[i + 3 + c];
        n[i + 3 + c] = n[i + 6 + c];
        n[i + 6 + c] = v;
      }
  }
  return { positions: closedPart(tris), normals: n };
}

/** 彫る所の行の範囲（外側の行の番号）。外に、深さ 0 の行を 2 本ずつ残す（いちばん外の升は分けないので） */
function patchRows(field: ReturnType<typeof combineFields>, rows: number): [number, number] {
  let lo = 0;
  while (lo < rows - 1 && !field.rowMayCarve(lo)) lo++;
  let hi = rows - 1;
  while (hi > lo && !field.rowMayCarve(hi)) hi--;
  return [Math.max(0, lo - 2), Math.min(rows - 2, hi + 2)];
}

/** 角度の並びに、彫る所（左右）の細かい角度を足す。phis は 0〜2π の小さい順 */
function refinePhis(phis: readonly number[], a0: number, a1: number, stepRad: number): number[] {
  const out = [...phis];
  const n = Math.ceil((a1 - a0) / stepRad);
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    out.push(a, Math.PI * 2 - a);
  }
  return [...new Set(out.map((v) => Math.round(v * 1e7) / 1e7))].filter((v) => v >= 0 && v < Math.PI * 2 - 1e-9).sort((x, y) => x - y);
}

/** 腕の場所ごとの形を作る（使わない腕なら null） */
function loftOf(p: ShankParams, section: ShankSection, w: number, t: number, outer: [number, number][]): Loft | null {
  if (section === "maru" || (!p.stations?.length && !p.relief)) return null;
  // 彫りだけのときも、同じ形のまま行と格子を細かくするので、ロフトの作りを使う
  if (!p.stations?.length) return makeLoft({ widthMm: w, thicknessMm: t, outline: outer }, [{ at: Math.PI, widthMm: w, thicknessMm: t, outline: outer, swayMm: 0 }]);
  // 断面を書いていない場所は、ひとつ上の場所と同じ断面
  let prev = outer;
  const places: LoftPlace[] = p.stations.map((st) => {
    if (st.curve?.points.length) prev = sectionOutline("free", undefined, st.curve);
    else if (st.section) prev = sectionOutline(st.section);
    return { at: (Math.min(180, Math.max(0, st.atDeg)) * Math.PI) / 180, widthMm: st.widthMm, thicknessMm: st.thicknessMm, outline: prev, swayMm: st.swayMm ?? 0 };
  });
  return makeLoft({ widthMm: w, thicknessMm: t, outline: outer }, places);
}

/** 腕の場所ごとの形を、結果に入れる */
function loftResult(p: ShankParams, loft: Loft | null): Pick<ShankResult, "along" | "minWidthMm" | "minThicknessMm"> {
  if (!loft || !p.stations?.length) return {};
  return { along: loft.samples(), ...loft.extremes() };
}

/** 彫りの下に残る地金を測る（確かめに使う） */
function reliefResult(p: ShankParams, loft: Loft, flat: number, rel: NonNullable<ReturnType<typeof reliefOf>>, radius: number): NonNullable<ShankResult["relief"]> {
  const n = loft.rows[0].length;
  let peakUnder = Infinity;
  let localUnder = Infinity;
  const steps = 96;
  for (let k = 0; k <= steps; k++) {
    const phi = rel.a0 + ((rel.a1 - rel.a0) * k) / steps;
    const f = loft.frame(phi);
    let top = 0;
    for (let i = 0; i < n; i++) top = Math.max(top, loft.point(i + flat, flat, f, 0)[1]);
    // 線を点で取った細かさのぶん、いちばん高い所はわずかに低い。決めた厚みに近ければ、決めた厚みで数える
    if (Math.abs(top - f.t) < 0.005 * f.t) top = f.t;
    peakUnder = Math.min(peakUnder, top - Math.max(p.relief!.depthMm, ...(p.reliefMore ?? []).map((q) => q.depthMm)));
    for (let i = 0; i < n; i++) {
      if (rel.field.depth(i, phi) <= 0) continue;
      const q = rel.surface(i + flat, phi, f);
      // 薄くて彫らなかった所は数えない
      if (q[1] < loft.point(i + flat, flat, f, radius)[1] - 1e-9) localUnder = Math.min(localUnder, q[1] - radius);
    }
  }
  return { ...p.relief!, fromDegUsed: (rel.a0 * 180) / Math.PI, toDegUsed: (rel.a1 * 180) / Math.PI, peakUnderMm: peakUnder, localUnderMm: Number.isFinite(localUnder) ? localUnder : peakUnder };
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
  if (section === "maru") return roundWireOutline();
  const c = section === "free" ? (curve?.points.length ? normalizeCurve(curve) : curveFromHalf(points?.length ? points : sectionControlPoints("kouman"))) : presetCurve(section);
  return adaptiveSample(c.points, curveKnots(c), SECTION_SHAPE.turnDeg, SECTION_SHAPE.stepLen).map((p) => [p.x, Math.max(0, p.y)] as [number, number]);
}

/** 丸線の断面を 1 周する点の数（形を作るための決まり。2 度ごと） */
const ROUND_WIRE_POINTS = 180;

/** 丸線の断面（ξ：−1〜1、η：0〜1）：いちばん下（指の側）から右 → 上 → 左 → いちばん下。最初と最後の点は同じ所（内側の平らな所がない） */
function roundWireOutline(): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= ROUND_WIRE_POINTS; i++) {
    const a = -Math.PI / 2 + (i / ROUND_WIRE_POINTS) * Math.PI * 2;
    out.push(i === 0 || i === ROUND_WIRE_POINTS ? [0, 0] : [Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
  }
  return out;
}

/** 決まった断面の片側の制御点（真ん中のいちばん上 → 端の内側）。丸線は線で決めないので、手で描き始めるときは甲丸から */
export function sectionControlPoints(section: ShankSection): SectionPoint[] {
  const key = section === "free" || section === "maru" ? "kouman" : section;
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
export function buildShank(p: ShankParams, cut?: SeatCut, opts: { notchStepMm?: number; rail?: Rail | null; seats?: readonly ShankSeat[]; gap?: BandGap | null } = {}): ShankResult {
  const section = p.section ?? "kouman";
  const w = p.widthMm ?? GUIDES.shank.widthMm;
  // 角の断面と丸線は、厚みを決めていなければ幅と同じ（四角・まん丸）
  const t = p.thicknessMm ?? (section === "kaku" || section === "maru" ? w : GUIDES.shank.thicknessMm);
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
  if (opts.gap) return openBand(p, { section, w, t, metal, dIn, r, outer, gap: opts.gap });
  const active = work.filter((wk) => wk.regions.length);
  // 腕の場所ごとの形：削る所と肩の中は、いちばん上の形のまま
  const loft = loftOf(p, section, w, t, outer);
  let hold = 0;
  if (loft) {
    hold = p.head ? (p.head.spanMm / 2 + p.head.taperMm) / (r + t) : 0;
    for (const wk of active)
      for (const g of wk.regions) {
        const y = Math.max(Math.abs(g.yMin), Math.abs(g.yMax));
        hold = Math.max(hold, Math.abs(wk.phi) + Math.asin(Math.min(1, y / (r + t))) + HOLD_MARGIN_RAD);
      }
    loft.setHold(hold);
    // 彫りの土台の升の大きさまで、腕の幅の向きの行を細かくする
    if (p.relief && !p.relief.draft) loft.refine(rowTrace(loft.rows[0], w, t, RELIEF_MESH.baseMm));
  }
  const topRows = loft ? loft.rows[0] : outer;
  let outerRows = topRows;
  let phis = Array.from({ length: AROUND }, (_, k) => (k / AROUND) * Math.PI * 2);
  if (active.length) {
    const trace: { j: number; s: number }[] = [];
    ({ outerRows, phis } = refineAround(topRows, phis, r, t, widthAt, active, step, trace));
    loft?.refine(trace);
  }
  // 断面（ξ：幅の中の位置 −1〜1、ρ：指の軸からの距離）。内側の平らな所を −1 → +1、外側を +1 → −1
  const section2: [number, number][] = [];
  const xR = outer[0][0];
  const xL = outer[outer.length - 1][0];
  // 内側の平らな所（丸線にはない）
  const flat = xR - xL > 1e-9 ? FLAT : 0;
  for (let i = 0; i < flat; i++) section2.push([xL + ((xR - xL) * i) / flat, r]);
  for (const [xi, eta] of outerRows.slice(0, -1)) section2.push([xi, r + t * eta]);
  const reliefAll = loft && p.relief ? reliefOf(p, loft, flat, r, t, hold) : null;
  const relief = p.relief?.draft ? null : reliefAll;
  const baseStep = RELIEF_MESH.baseMm / (r + t);
  if (relief) phis = refinePhis(phis, relief.a0 - baseStep, relief.a1 + baseStep, baseStep);
  const frames = loft ? phis.map((phi) => loft.frame(phi)) : null;
  // 断面の点ごとに、指のまわりを 1 周する輪
  const rings: V3[][] = section2.map(([xi, rho0], i) =>
    phis.map((phi, pk) => {
      // 腕の場所ごとの形なら、その場所の断面。肩はその上に足す
      const lofted = loft && frames ? (relief ? relief.surface(i, phi, frames[pk], shoulderWidth(frames[pk].w, r + t, p.head)(phi)) : loft.point(i, flat, frames[pk], r, shoulderWidth(frames[pk].w, r + t, p.head)(phi))) : null;
      const x = lofted ? lofted[0] : (xi * widthAt(phi)) / 2;
      const rho = lofted ? lofted[1] : rho0;
      let y = rho * Math.sin(phi);
      let z = rho * Math.cos(phi);
      // 外側の点だけ削る。指の側（内径の円）より下へは下げない
      if (i >= flat)
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
  const reliefNormals: number[] = [];
  if (relief && loft) {
    // 彫る所だけ、深さが変わる所を細かく分けた網目にする。ほかはこれまでの格子
    const [pr0, pr1] = patchRows(relief.field, outerRows.length);
    const near = (target: number) => {
      let best = 0;
      phis.forEach((q, k) => {
        if (Math.abs(q - target) < Math.abs(phis[best] - target)) best = k;
      });
      return best;
    };
    const arms: [number, number][] = [
      [near(relief.a0 - baseStep), near(relief.a1 + baseStep)],
      [near(Math.PI * 2 - relief.a1 - baseStep), near(Math.PI * 2 - relief.a0 + baseStep)],
    ];
    const skip = (k: number, j: number) => k - flat >= pr0 && k - flat < pr1 && arms.some(([c0, c1]) => j >= c0 && j < c1);
    reliefGrid({
      m: section2.length,
      cols: phis.length,
      wrap: true,
      flat,
      tubeOrder: true,
      at: (k, j) => rings[k][j],
      phiAt: (_k, j) => phis[j],
      skip,
      normalOuter: relief.normalOuter,
      isCrease: (row) => loft.isCrease(row),
      tris,
      normals: reliefNormals,
    });
    const rowLen = (kk: number) => {
      const f = loft.frame(relief.a0);
      const q0 = loft.point(flat + kk, flat, f, r);
      const q1 = loft.point(flat + kk + 1, flat, f, r);
      return Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
    };
    for (const [c0, c1] of arms)
      adaptivePatch(
        {
          r0: pr0,
          r1: pr1,
          c0,
          c1,
          tubeOrder: true,
          minCellMm: relief.mesh.minCellMm,
          tolMm: relief.mesh.tolMm,
          depth: (rr, cc) => {
            const j = Math.floor(cc);
            return relief.field.depth(rr, phis[j] + (phis[j + 1] - phis[j]) * (cc - j));
          },
          vertex: (rr, cc) => {
            const j = Math.floor(cc);
            const phi = cc === j ? phis[j] : phis[j] + (phis[j + 1] - phis[j]) * (cc - j);
            const f = loft.frame(phi);
            const q = relief.surface(flat + rr, phi, f, shoulderWidth(f.w, r + t, p.head)(phi));
            return [q[0], q[1] * Math.sin(phi), q[1] * Math.cos(phi)];
          },
          rowMm: rowLen,
          colMm: (j) => (phis[j + 1] - phis[j]) * (r + t),
          normal: (seg, rr, cc) => {
            const j = Math.floor(cc);
            return relief.normalOuter(seg, rr - seg, phis[j] + (phis[j + 1] - phis[j]) * (cc - j));
          },
        },
        tris,
        reliefNormals,
      );
  } else ringsToTube(rings, tris);
  const lit = relief ? closedWithNormals(tris, reliefNormals) : null;
  const positions = lit ? lit.positions : closedPart(tris);
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
    sideWidthMm: loft ? loft.frame(-Math.PI / 2).w : widthAt(-Math.PI / 2),
    notchDepthMm,
    notchBallDiameterMm: ball ? 2 * ball.radiusMm : 0,
    notchBall: ball ? { cx: ball.cx, cy: ball.cy, bottomZ: ball.bottomZ, radiusMm: ball.radiusMm } : null,
    notchBalls: balls,
    head: p.head && p.head.widthMm > w ? p.head : null,
    railSeatDepthMm: work.reduce((m, wk) => wk.railBoxes.reduce((mm, b) => Math.max(mm, b.depth ?? 0), m), 0),
    ends: null,
    ...loftResult(p, loft),
    ...(reliefAll && loft ? { relief: reliefResult(p, loft, flat, reliefAll, r) } : {}),
    ...(lit ? { normals: lit.normals } : {}),
  };
}

/**
 * 腕の間に挟む石座のための、いちばん上を切った腕（指輪の座標）。outline は上から見た、石座の下の輪の外の線（閉じた線、xy）。
 * 腕の外側の線の点ごとに、その点の幅の位置 x で輪の外の線の +y と −y の所を探し、腕はそこから先（指のまわりの残りの所）だけを作る。
 * 腕の端の面は、輪の外の面にぴったり沿う（輪の外の面は縦なので、端の面も縦の曲がった面）。端は overlapMm だけ輪の壁に入れる
 */
export interface BandGap {
  outline: readonly [number, number][];
  /** 腕の端を、輪の外の面からこれだけ輪の中へ入れる（mm。すき間が見えないように。なければ BAND_GAP_OVERLAP_MM） */
  overlapMm?: number;
  /** 輪が円すいのとき：下の面の高さの外の線（outline と同じ点の並び）と、上の面・下の面の高さ（指輪の座標） */
  low?: { outline: readonly [number, number][]; topZ: number; bottomZ: number };
}

/** 腕の端を輪の壁へ入れる長さ（mm。形を作るための決まり） */
export const BAND_GAP_OVERLAP_MM = 0.03;

/** 上から見た閉じた線と、x ＝ 一定 の線が交わる所の y（小さい順） */
function crossingsAtX(poly: readonly [number, number][], x: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    if (ax === bx || ax > x === bx > x) continue;
    out.push(ay + ((by - ay) * (x - ax)) / (bx - ax));
  }
  return out.sort((a, b) => a - b);
}

function openBand(
  p: ShankParams,
  c: { section: ShankSection; w: number; t: number; metal: MetalId; dIn: number; r: number; outer: [number, number][]; gap: BandGap },
): ShankResult {
  const { w, t, r, outer } = c;
  const ov = c.gap.overlapMm ?? BAND_GAP_OVERLAP_MM;
  const loft = loftOf(p, c.section, w, t, outer);
  // 彫りの土台の升の大きさまで、腕の幅の向きの行を細かくする
  if (loft && p.relief && !p.relief.draft) loft.refine(rowTrace(loft.rows[0], w, t, RELIEF_MESH.baseMm));
  const topRows = loft ? loft.rows[0] : outer;
  // 断面（ξ、ρ）：内側の平らな所を −1 → +1、外側を +1 → −1（閉じた断面の線）
  const sec: [number, number][] = [];
  const xR = topRows[0][0];
  const xL = topRows[topRows.length - 1][0];
  const flat = xR - xL > 1e-9 ? FLAT : 0;
  for (let i = 0; i < flat; i++) sec.push([xL + ((xR - xL) * i) / flat, r]);
  for (const [xi, eta] of topRows.slice(0, -1)) sec.push([xi, r + t * eta]);
  // 断面の点ごとの、端の角度（＋の側の端 φS、−の側の端 φE ＝ 2π ＋ asin(…)）
  const ends = sec.map(([xi, rho]) => {
    const x = (xi * w) / 2;
    // 下の輪は円すいで、下へ行くほど内へ寄る。腕の端も、その高さの輪の外の線に合わせる（上の端の線で切ると、腕の下の方が輪から離れた。2026-11-05 作者）
    const endY = (pick: (ys: number[]) => number, off: number) => {
      let ys = crossingsAtX(c.gap.outline, x);
      if (!ys.length) return 0;
      let y = pick(ys) + off;
      const low = c.gap.low;
      if (low) {
        for (let it = 0; it < 3; it++) {
          const z = Math.sqrt(Math.max(0, rho * rho - y * y));
          const a = Math.max(0, Math.min(1, (low.topZ - z) / (low.topZ - low.bottomZ || 1)));
          const line = c.gap.outline.map((q, i) => [q[0] + (low.outline[i][0] - q[0]) * a, q[1] + (low.outline[i][1] - q[1]) * a] as [number, number]);
          ys = crossingsAtX(line, x);
          if (!ys.length) break;
          y = pick(ys) + off;
        }
      }
      return y;
    };
    const yP = endY((ys) => ys[ys.length - 1], -ov);
    const yM = endY((ys) => ys[0], ov);
    const asin = (y: number) => Math.asin(Math.max(-1, Math.min(1, y / rho)));
    return { x, rho, s: asin(yP), e: 2 * Math.PI + asin(yM) };
  });
  // 腕の場所ごとの形：腕の端（石座の下の輪に当たる所）とロウの丸みは、いちばん上の形のまま
  const holdRad = ends.reduce((m, q) => Math.max(m, Math.abs(q.s), Math.abs(2 * Math.PI - q.e)), 0) + HOLD_MARGIN_RAD;
  if (loft) loft.setHold(holdRad);
  const reliefAll = loft && p.relief ? reliefOf(p, loft, flat, r, t, holdRad) : null;
  const relief = p.relief?.draft ? null : reliefAll;
  // 腕の端から端までの割合 u の並び。彫る所は土台の升の大きさに
  let us = Array.from({ length: AROUND + 1 }, (_, k) => k / AROUND);
  let arms: [number, number][] = [];
  const s0 = ends.reduce((m, q) => m + q.s, 0) / ends.length;
  const e0 = ends.reduce((m, q) => m + q.e, 0) / ends.length;
  const baseStep = RELIEF_MESH.baseMm / (r + t);
  if (relief) {
    // 行ごとに腕の端の角度が少しちがうので、余白はそのぶん広く
    const slip = ends.reduce((m, q) => Math.max(m, Math.abs(q.s - s0), Math.abs(q.e - e0)), 0) + baseStep;
    const toU = (phi: number) => (phi - s0) / (e0 - s0);
    const from = relief.a0 - slip;
    const to = relief.a1 + slip;
    const n = Math.ceil((to - from) / baseStep);
    for (let k = 0; k <= n; k++) {
      const a = from + ((to - from) * k) / n;
      us.push(toU(a), toU(Math.PI * 2 - a));
    }
    us = [...new Set(us.map((v) => Math.round(v * 1e7) / 1e7))].filter((v) => v >= 0 && v <= 1).sort((x, y) => x - y);
    const near = (target: number) => {
      let best = 0;
      us.forEach((q, k) => {
        if (Math.abs(q - target) < Math.abs(us[best] - target)) best = k;
      });
      return best;
    };
    arms = [
      [near(toU(from)), near(toU(to))],
      [near(toU(Math.PI * 2 - to)), near(toU(Math.PI * 2 - from))],
    ];
  }
  const loops: V3[][] = [];
  for (const u of us) {
    loops.push(ends.map(({ x, rho, s, e }, i) => {
      const phi = s + (e - s) * u;
      if (!loft) return [x, rho * Math.sin(phi), rho * Math.cos(phi)] as V3;
      const f = loft.frame(phi);
      const [xx, rr] = relief ? relief.surface(i, phi, f) : loft.point(i, flat, f, r);
      return [xx, rr * Math.sin(phi), rr * Math.cos(phi)] as V3;
    }));
  }
  const tris: number[] = [];
  const reliefNormals: number[] = [];
  if (relief && loft) {
    const [pr0, pr1] = patchRows(relief.field, topRows.length);
    const skip = (i: number, k: number) => i - flat >= pr0 && i - flat < pr1 && arms.some(([c0, c1]) => k >= c0 && k < c1);
    reliefGrid({
      m: sec.length,
      cols: loops.length,
      wrap: false,
      flat,
      tubeOrder: false,
      at: (i, k) => loops[k][i],
      phiAt: (i, k) => ends[i].s + (ends[i].e - ends[i].s) * us[k],
      skip,
      normalOuter: relief.normalOuter,
      isCrease: (row) => loft.isCrease(row),
      tris,
      normals: reliefNormals,
    });
    const phiAt = (rr: number, cc: number) => {
      const k = Math.floor(cc);
      const u = cc === k ? us[k] : us[k] + (us[k + 1] - us[k]) * (cc - k);
      const j = Math.floor(rr);
      const fr = rr - j;
      const q0 = ends[flat + j];
      if (fr === 0) return q0.s + (q0.e - q0.s) * u;
      const q1 = ends[flat + j + 1];
      const ss = q0.s + (q1.s - q0.s) * fr;
      const ee = q0.e + (q1.e - q0.e) * fr;
      return ss + (ee - ss) * u;
    };
    const rowLen = (kk: number) => {
      const f = loft.frame(relief.a0);
      const q0 = loft.point(flat + kk, flat, f, r);
      const q1 = loft.point(flat + kk + 1, flat, f, r);
      return Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
    };
    for (const [c0, c1] of arms)
      adaptivePatch(
        {
          r0: pr0,
          r1: pr1,
          c0,
          c1,
          tubeOrder: false,
          minCellMm: relief.mesh.minCellMm,
          tolMm: relief.mesh.tolMm,
          depth: (rr, cc) => relief.field.depth(rr, phiAt(rr, cc)),
          vertex: (rr, cc) => {
            const phi = phiAt(rr, cc);
            const f = loft.frame(phi);
            const q = relief.surface(flat + rr, phi, f);
            return [q[0], q[1] * Math.sin(phi), q[1] * Math.cos(phi)];
          },
          rowMm: rowLen,
          colMm: (k) => (us[k + 1] - us[k]) * (e0 - s0) * (r + t),
          normal: (seg, rr, cc) => relief.normalOuter(seg, rr - seg, phiAt(rr, cc)),
        },
        tris,
        reliefNormals,
      );
  } else stackLoops(loops, tris);
  // 両端のふた：断面の真ん中の点から扇に
  const cap = (loop: V3[], flip: boolean) => {
    const m: V3 = [0, 0, 0];
    for (const q of loop) for (let a = 0; a < 3; a++) m[a] += q[a] / loop.length;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      if (flip) tris.push(...m, ...b, ...a);
      else tris.push(...m, ...a, ...b);
      if (relief) {
        // ふたは石座の下の輪の中に隠れる面。面の向きはそのまま
        const ux = a[0] - m[0], uy = a[1] - m[1], uz = a[2] - m[2];
        const vx = b[0] - m[0], vy = b[1] - m[1], vz = b[2] - m[2];
        const sgn = flip ? -1 : 1;
        const nx = (uy * vz - uz * vy) * sgn, ny = (uz * vx - ux * vz) * sgn, nz = (ux * vy - uy * vx) * sgn;
        const l = Math.hypot(nx, ny, nz) || 1;
        const q: V3 = [nx / l, ny / l, nz / l];
        pushTri(reliefNormals, q, q, q);
      }
    }
  };
  cap(loops[0], false);
  cap(loops[loops.length - 1], true);
  const lit = relief ? closedWithNormals(tris, reliefNormals) : null;
  const positions = lit ? lit.positions : closedPart(tris);
  const volumeMm3 = meshVolume(positions);
  // 腕の端の、腕の真ん中（x ＝ 0）での位置と、上と下の z
  const endAt = (sgn: 1 | -1) => {
    const ys = crossingsAtX(c.gap.outline, 0);
    const y = ys.length ? (sgn > 0 ? ys[ys.length - 1] - ov : ys[0] + ov) : 0;
    const zOf = (rho: number) => Math.sqrt(Math.max(0, rho * rho - y * y));
    return { y, bottomZ: zOf(r), topZ: zOf(r + t) };
  };
  return {
    positions,
    gou: p.gou,
    innerDiameterMm: c.dIn,
    innerRadiusMm: r,
    outerRadiusMm: r + t,
    widthMm: w,
    thicknessMm: t,
    section: c.section,
    metal: c.metal,
    volumeMm3,
    weightG: weightG(volumeMm3, c.metal),
    outlineMm: outer.map(([xi, eta]) => [(xi * w) / 2, eta * t] as [number, number]),
    sideWidthMm: loft ? loft.frame(-Math.PI / 2).w : w,
    notchDepthMm: 0,
    notchBallDiameterMm: 0,
    notchBall: null,
    notchBalls: [],
    head: null,
    railSeatDepthMm: 0,
    ends: [endAt(1), endAt(-1)],
    ...loftResult(p, loft),
    ...(reliefAll && loft ? { relief: reliefResult(p, loft, flat, reliefAll, r) } : {}),
    ...(lit ? { normals: lit.normals } : {}),
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
  /** 行ごとに、元の線のどこか（腕の場所ごとの形で、ほかの場所の断面にも同じ行を足すため） */
  trace?: { j: number; s: number }[],
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
    trace?.push({ j, s: 0 });
    const zTop = r + t * Math.max(e0, e1);
    const near = seats.some((sd) => sd.regions.some((g) => Math.max(x0, x1) * half0 >= g.xMin - margin && Math.min(x0, x1) * half0 <= g.xMax + margin && zTop >= g.zMin - 0.05 * t));
    if (!near) continue;
    const length = Math.hypot((x1 - x0) * half0, (e1 - e0) * t);
    const cuts = centers.filter((c) => c.jC === j).map((c) => (c.xiC - x0) / (x1 - x0));
    for (const s of splitParams(length, cuts, step)) {
      outerRows.push([x0 + (x1 - x0) * s, e0 + (e1 - e0) * s]);
      trace?.push({ j, s });
    }
  }
  outerRows.push(outer[outer.length - 1]);
  trace?.push({ j: outer.length - 1, s: 0 });
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

/**
 * 腕の大きさの言葉（画面・図面・指示書）。場所ごとの形なら、石座のそばと、いちばん下を書く。
 * mm は単位の前の数の小数の桁
 */
export function shankSizeWords(sh: Pick<ShankResult, "widthMm" | "thicknessMm" | "along">, digits = 1): string {
  const f = (v: number) => v.toFixed(digits);
  const top = `${f(sh.widthMm)} × ${f(sh.thicknessMm)} mm`;
  const low = sh.along?.[sh.along.length - 1];
  if (!low || (Math.abs(low.widthMm - sh.widthMm) < 0.005 && Math.abs(low.thicknessMm - sh.thicknessMm) < 0.005)) return top;
  return `石座のそば ${top} → 下 ${f(low.widthMm)} × ${f(low.thicknessMm)} mm`;
}

/** 腕の彫りの言葉（指示書）。なければ null */
export function reliefWords(sh: Pick<ShankResult, "relief">): string | null {
  const r = sh.relief;
  return r ? `${RELIEF_LABEL[r.kind]} ${r.count} つ（片側）・深さ ${r.depthMm.toFixed(2)} mm` : null;
}

/** 体積（mm³）から重さ（g）の見積もり。1 cm³ ＝ 1000 mm³ */
export function weightG(volumeMm3: number, metal: MetalId): number {
  return (volumeMm3 / 1000) * GUIDES.metals[metal].densityGPerCm3;
}
