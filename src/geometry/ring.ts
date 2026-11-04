// 石・石座・腕を 1 つの指輪にまとめる。画面に依存しない純粋な関数で、同じ入力なら同じ指輪が出る。
// 指輪の座標（shank.ts と同じ）：mm、x が指の向き、z が上、指の軸は x 軸、腕の内側のいちばん上は z ＝ 内径 ÷ 2。
// 石と石座は石の座標（stone.ts）で作り、z 軸まわりに回して（向き）、z 方向に持ち上げて置く。
// 持ち上げる量は「石の一番下が指から、石座の決めたすき間だけ離れる」ように決める。
import { GUIDES, type MetalId } from "../rules/guides";
import { buildSetting, type SettingParams, type SettingResult } from "./setting";
import { buildShank, weightG, type ShankHead, type ShankParams, type ShankResult } from "./shank";
import { buildStone, meshVolume, type StoneMesh, type StoneParams } from "./stone";

/** 向き：along（縦）＝ 石の長辺が指に沿う。across（横）＝ 長辺が指を横切る */
export type Orientation = "along" | "across";

export interface RingParams {
  stone: StoneParams;
  /** 石座（石の形と腕の厚みは、ここではなく stone と shank から渡す） */
  setting: Omit<SettingParams, "stone" | "shankThicknessMm">;
  shank: ShankParams;
  /** 既定は縦 */
  orientation?: Orientation;
}

/** 石の座標 → 指輪の座標：z 軸まわりに rotationZ（ラジアン）回してから、z に translateZ 足す */
export interface RingTransform {
  rotationZ: number;
  translateZ: number;
}

export interface RingDesign {
  params: RingParams;
  orientation: Orientation;
  /** 石（石の座標のまま。heights も石の座標） */
  stone: StoneMesh;
  /** 石座（石の座標のまま） */
  setting: SettingResult;
  /** 腕（指輪の座標） */
  shank: ShankResult;
  transform: RingTransform;
  /** 指輪の座標に置いた、表示用の形 */
  ringPositions: { stone: Float32Array; setting: Float32Array; shank: Float32Array; settingNormals?: Float32Array };
  /** 石の一番下と指のすき間（mm）。置いたあとの形から測り直した値 */
  culetGapMm: number;
  /** 地金の重さの見積もり（g）＝（腕 ＋ 石座）の体積 × 密度。部品の重なりも数えるので少し多め。目安 */
  metalWeightG: number;
  metal: MetalId;
}

export function buildRing(p: RingParams): RingDesign {
  const orientation = p.orientation ?? "along";
  const plain = buildShank(p.shank);
  const setting = buildSetting({ ...p.setting, stone: p.stone, shankThicknessMm: plain.thicknessMm });
  const stone = buildStone(p.stone);
  const transform: RingTransform = {
    rotationZ: orientation === "across" ? Math.PI / 2 : 0,
    translateZ: plain.innerRadiusMm - setting.heights.fingerZ,
  };
  const ringStone = applyTransform(stone.positions, transform);
  const ringSetting = applyTransform(setting.positions, transform);
  // 石座の足が腕の中へ入る所の広さから、腕のいちばん上の肩を決めて、腕を作り直す
  // 一体の石座は足もとが腕の幅の中に入るので、腕の上をふくらませない（丸い線のまま石座につなぐ）
  const shank = setting.normals ? plain : buildShank({ ...p.shank, head: p.shank.head ?? headFootprint(ringSetting, plain) });
  const culetGapMm = stone.heights.culetZ + transform.translateZ - shank.innerRadiusMm;
  const metal = shank.metal;
  return {
    params: p,
    orientation,
    stone,
    setting,
    shank,
    transform,
    ringPositions: { stone: ringStone, setting: ringSetting, shank: shank.positions, settingNormals: setting.normals ? rotateNormals(setting.normals, transform.rotationZ) : undefined },
    culetGapMm,
    metalWeightG: weightG(shank.volumeMm3 + meshVolume(setting.positions), metal),
    metal,
  };
}

/**
 * 腕だけを作り直す（石と石座はそのまま）。断面の点を動かしている間に、3D の腕だけをすぐ変えるため。
 * 肩（石座の足を受ける広い所）は、今の石座から buildRing と同じように決める
 */
export function rebuildShank(ring: RingDesign, shank: ShankParams): ShankResult {
  const plain = buildShank(shank);
  return ring.setting.normals ? plain : buildShank({ ...shank, head: shank.head ?? headFootprint(ring.ringPositions.setting, plain) });
}

/**
 * 肩の決まり（形を作るための決まり）。zoneMm：腕の外側のいちばん上からこの高さまでにある石座の点を「腕へ入る足」とみなす。
 * marginMm：足のまわりに残す腕の幅（片側）。taperMm：肩から元の幅へ戻る長さ。
 * maxWidthRatio：肩の幅は腕の幅のこの倍まで（広げすぎると、印台のように重く見える）
 */
const SHOULDER = { zoneMm: 0, marginMm: 0.2, taperMm: 4.5, maxWidthRatio: 1.6 };

/** 石座が腕へ入る所（指輪の座標）を囲む、肩の幅と長さ */
function headFootprint(ringSetting: Float32Array, shank: ShankResult): ShankHead {
  let xMax = 0;
  let yMax = 0;
  const zTop = shank.outerRadiusMm + SHOULDER.zoneMm;
  for (let i = 0; i < ringSetting.length; i += 3) {
    if (ringSetting[i + 2] > zTop) continue;
    xMax = Math.max(xMax, Math.abs(ringSetting[i]));
    yMax = Math.max(yMax, Math.abs(ringSetting[i + 1]));
  }
  const widthMm = Math.min(shank.widthMm * SHOULDER.maxWidthRatio, Math.max(shank.widthMm, 2 * (xMax + SHOULDER.marginMm)));
  return { widthMm, spanMm: 2 * (yMax + SHOULDER.marginMm), taperMm: SHOULDER.taperMm };
}

/** 石の座標の形を、指輪の座標へ移す（新しい配列を返す） */
export function applyTransform(positions: Float32Array, t: RingTransform): Float32Array {
  const c = Math.cos(t.rotationZ);
  const s = Math.sin(t.rotationZ);
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    out[i] = x * c - y * s;
    out[i + 1] = x * s + y * c;
    out[i + 2] = positions[i + 2] + t.translateZ;
  }
  return out;
}

/** 地金の名前（画面に出す） */
export function metalName(metal: MetalId): string {
  return GUIDES.metals[metal].name;
}

/** 向き（法線）を z 軸まわりに回す（位置の移動はしない） */
function rotateNormals(n: Float32Array, rad: number): Float32Array {
  if (rad === 0) return n;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const out = new Float32Array(n.length);
  for (let i = 0; i < n.length; i += 3) {
    out[i] = n[i] * c - n[i + 1] * s;
    out[i + 1] = n[i] * s + n[i + 1] * c;
    out[i + 2] = n[i + 2];
  }
  return out;
}
