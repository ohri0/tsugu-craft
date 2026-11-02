// 石・石座・腕を 1 つの指輪にまとめる。画面に依存しない純粋な関数で、同じ入力なら同じ指輪が出る。
// 指輪の座標（shank.ts と同じ）：mm、x が指の向き、z が上、指の軸は x 軸、腕の内側のいちばん上は z ＝ 内径 ÷ 2。
// 石と石座は石の座標（stone.ts）で作り、z 軸まわりに回して（向き）、z 方向に持ち上げて置く。
// 持ち上げる量は「石の一番下が指から、石座の決めたすき間だけ離れる」ように決める。
import { GUIDES, type MetalId } from "../rules/guides";
import { buildSetting, type SettingParams, type SettingResult } from "./setting";
import { buildShank, weightG, type ShankParams, type ShankResult } from "./shank";
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
  ringPositions: { stone: Float32Array; setting: Float32Array; shank: Float32Array };
  /** 石の一番下と指のすき間（mm）。置いたあとの形から測り直した値 */
  culetGapMm: number;
  /** 地金の重さの見積もり（g）＝（腕 ＋ 石座）の体積 × 密度。部品の重なりも数えるので少し多め。目安 */
  metalWeightG: number;
  metal: MetalId;
}

export function buildRing(p: RingParams): RingDesign {
  const orientation = p.orientation ?? "along";
  const shank = buildShank(p.shank);
  const setting = buildSetting({ ...p.setting, stone: p.stone, shankThicknessMm: shank.thicknessMm });
  const stone = buildStone(p.stone);
  const transform: RingTransform = {
    rotationZ: orientation === "across" ? Math.PI / 2 : 0,
    translateZ: shank.innerRadiusMm - setting.heights.fingerZ,
  };
  const ringStone = applyTransform(stone.positions, transform);
  const ringSetting = applyTransform(setting.positions, transform);
  const culetGapMm = stone.heights.culetZ + transform.translateZ - shank.innerRadiusMm;
  const metal = shank.metal;
  return {
    params: p,
    orientation,
    stone,
    setting,
    shank,
    transform,
    ringPositions: { stone: ringStone, setting: ringSetting, shank: shank.positions },
    culetGapMm,
    metalWeightG: weightG(shank.volumeMm3 + meshVolume(setting.positions), metal),
    metal,
  };
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
