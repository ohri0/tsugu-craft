// 腕（甲丸）：内側が平ら、外側が丸く盛り上がった輪。画面に依存しない純粋な関数。
// 座標は指輪の座標（ring.ts と同じ）：mm、x が指の向き（指の付け根 → 指先）、z が上（石のある側）、
// y は x と z の両方に直角（右手系）。指の軸は x 軸そのもので、腕は y–z の面にある円。
// 腕の内側のいちばん上（指のいちばん上）は z ＝ 内径 ÷ 2 の所。
import { GUIDES, innerDiameterMm, type MetalId } from "../rules/guides";
import { closedPart, ringsToTube, type V3 } from "./mesh";
import { meshVolume } from "./stone";

export interface ShankParams {
  /** 号数（日本のサイズ） */
  gou: number;
  /** 幅（mm、指の向きの長さ）。なければ目安 */
  widthMm?: number;
  /** 厚み（mm、いちばん厚い真ん中）。なければ目安 */
  thicknessMm?: number;
  /** 地金。なければ K18 イエロー */
  metal?: MetalId;
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

export function buildShank(p: ShankParams): ShankResult {
  const w = p.widthMm ?? GUIDES.shank.widthMm;
  const t = p.thicknessMm ?? GUIDES.shank.thicknessMm;
  const metal = p.metal ?? "k18y";
  const dIn = innerDiameterMm(p.gou);
  const r = dIn / 2;
  // 断面（ξ：幅の中の位置 −1〜1、ρ：指の軸からの距離）。内側の平らな所を −1 → +1、外側の丸みを +1 → −1
  const section: [number, number][] = [];
  for (let i = 0; i < FLAT; i++) section.push([-1 + (2 * i) / FLAT, r]);
  for (let i = 0; i < DOME; i++) {
    const a = (Math.PI * i) / DOME;
    section.push([Math.cos(a), r + t * Math.sin(a)]);
  }
  // 指のまわりの角度 φ での幅（肩のある所だけ広い）。φ = 0 がいちばん上（+z）
  const widthAt = shoulderWidth(w, r + t, p.head);
  // 断面の点ごとに、指のまわりを 1 周する輪
  const rings: V3[][] = section.map(([xi, rho]) =>
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
