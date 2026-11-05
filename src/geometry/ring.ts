// 石・石座・腕を 1 つの指輪にまとめる。画面に依存しない純粋な関数で、同じ入力なら同じ指輪が出る。
// 指輪の座標（shank.ts と同じ）：mm、x が指の向き、z が上、指の軸は x 軸、腕の内側のいちばん上は z ＝ 内径 ÷ 2。
// 石と石座は石の座標（stone.ts）で作り、z 軸まわりに回して（向き）、z 方向に持ち上げて置く。
// 持ち上げる量は「石の一番下が指から、石座の決めたすき間だけ離れる」ように決める。
import { GUIDES, type MetalId } from "../rules/guides";
import { buildSetting, type SettingParams, type SettingResult, type TriangleRange } from "./setting";
import { buildShank, weightG, type ShankHead, type ShankParams, type ShankResult, type ShankSeat } from "./shank";
import { buildStone, meshVolume, type StoneMesh, type StoneParams } from "./stone";
import { BALL_CUT, stoneSeatCut, type SeatCut } from "./notch";
import { buildEndSolder, buildSolder, collarInRing, railInRing, type Rail } from "./joint";
import { concat } from "./mesh";
import { joinMesh, nearestRails, type HeadJoin, type RailLine } from "./bridge";
import { findCorners } from "./corners";
import { buildTensionBand, type TensionOptions } from "./tension";

/** 向き：along（縦）＝ 石の長辺が指に沿う。across（横）＝ 長辺が指を横切る */
export type Orientation = "along" | "across";

export interface RingParams {
  stone: StoneParams;
  /** 石座（石の形と腕の厚みは、ここではなく stone と shank から渡す） */
  setting: Omit<SettingParams, "stone" | "shankThicknessMm">;
  shank: ShankParams;
  /** 既定は縦 */
  orientation?: Orientation;
  /**
   * 石座と腕の接点に、ロウの丸みの形を作るか。なければ、一体の石座（画面の形）の仕上げ（solidQuality が preview でない）のときだけ作る
   * （ロウの丸みは細かい形を作るので少し時間がかかる。動かしている間の粗い形と、管の形では作らない）
   */
  solder?: boolean;
  /** 真ん中の石（stone）を置く所：腕のいちばん上から、腕の外側に沿って測った長さ（mm、＋ は +y の側）。なければ 0（いちばん上） */
  atMm?: number;
  /** ほかに並べる石（石を並べる指輪。なければ一粒） */
  others?: readonly StonePlace[];
  /**
   * となりの石座（腕に沿って並べた順で、となり）を、短い線でつないで 1 つにするか（三石。ロウ付けで一つにする所）。
   * 輪どうしが joinMaxMm より離れていれば、つながない
   */
  joinHeads?: boolean;
  /** テンションのくぼみ・溝の深さなど（なければ GUIDES.tension の値） */
  tension?: TensionOptions;
}

/** つなぐ線を作る、輪の外の面どうしの間の上限（mm。形を作るための決まり：これより離れた石座は、短い線ではつながらない） */
const JOIN_MAX_MM = 1.2;

/** 並べる石 1 つ：石・石座・向きと、腕の上の場所 */
export interface StonePlace {
  stone: StoneParams;
  setting: Omit<SettingParams, "stone" | "shankThicknessMm">;
  orientation?: Orientation;
  /** 腕のいちばん上から、腕の外側に沿って測った長さ（mm、＋ は +y の側） */
  atMm: number;
  /** 石を上から見て回す角度（ラジアン、z 軸のまわり）。向き（orientation）より優先。三石のペアの先を外へ向けるとき */
  turnRad?: number;
}

/**
 * 石の座標 → 指輪の座標：z 軸まわりに rotationZ（ラジアン）回してから、z に translateZ 足し（ここまでが「その石の座標」：石が腕の真上）、
 * さらに x 軸（指の軸）のまわりに tiltRad 回す（腕に沿って石を置く所へ。なければ 0 ＝ いちばん上）
 */
export interface RingTransform {
  rotationZ: number;
  translateZ: number;
  tiltRad?: number;
  /** 回したあとに、上から見てずらす量（mm）。テンションだけ（角を腕の幅の真ん中へ、開きを腕のいちばん上の真ん中へ）。なければ 0 */
  translateX?: number;
  translateY?: number;
}

/** 腕の上に置いた石 1 つ（石を並べた指輪では石の数だけ。0 番が真ん中の石 ＝ RingDesign の stone・setting） */
export interface PlacedStone {
  params: StoneParams;
  orientation: Orientation;
  stone: StoneMesh;
  setting: SettingResult;
  transform: RingTransform;
  /** 腕の上の場所（mm、腕の外側に沿って）と、その角度（ラジアン） */
  atMm: number;
  phi: number;
  /** ザグりの面（その石の座標：tilt を戻した座標） */
  seatCut: SeatCut;
  /** 石座の下の輪（その石の座標。爪留めでなければ null） */
  rail: Rail | null;
  culetGapMm: number;
  /** ringPositions.stone・ringPositions.setting の中で、この石の三角形の範囲（石座はロウの丸みもふくむ） */
  ranges: { stone: TriangleRange; setting: TriangleRange };
  solder: { contacts: number; filletMm: number } | null;
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
  /**
   * ザグり：石の下側が腕の上に入りこむ所を、腕の上から自動で削った深さ（mm）。削らなければ 0。
   * 深さ ＝ 石の先が腕に入りこむ深さ ＋ すき間（GUIDES.bezel.clearanceMm、石の縁と同じすき間）
   */
  notchDepthMm: number;
  /** ザグりに使う石の下の面（腕を作り直すときにも使う） */
  seatCut: SeatCut;
  /**
   * 石座と腕のロウ付け：接点の数・すみの丸みの大きさ（mm）・ringPositions.setting の中の三角形の範囲（石座の後ろ）。
   * 爪留めで、下の輪が腕に当たるときだけ（なければ null）
   */
  solder: { contacts: number; filletMm: number; triangles: { start: number; count: number } } | null;
  /** 地金の重さの見積もり（g）＝（腕 ＋ 石座）の体積 × 密度。部品の重なりも数えるので少し多め。目安 */
  metalWeightG: number;
  metal: MetalId;
  /** 腕の上の石ぜんぶ（0 番が真ん中の石。一粒なら 1 つ） */
  stones: PlacedStone[];
  /** となりの石座をつなぐ所（三石。つながなければ空）。形は、番号 b の石の石座の三角形の後ろに入る */
  joins: HeadJoin[];
}

export function buildRing(p: RingParams): RingDesign {
  if (p.setting.style === "tension") return tensionRing(p);
  if ((p.others?.length ?? 0) > 0 || (p.atMm ?? 0) !== 0) return buildMulti(p);
  const orientation = p.orientation ?? "along";
  // 大きさを知るだけなので、場所ごとの形と彫りは作らない（彫りの網目は重い）
  const plain = buildShank({ ...p.shank, stations: undefined, relief: undefined, reliefMore: undefined });
  const rotationZ = orientation === "across" ? Math.PI / 2 : 0;
  // 腕の間に挟む石座は、下の輪の下の面を指の丸みに合わせる（石の座標で、指の軸は −rotationZ の向き）
  const between = p.setting.style === "prong" && p.setting.join === "between";
  const finger = between ? { innerRadiusMm: plain.innerRadiusMm, axisRad: -rotationZ, bandWidthMm: plain.widthMm } : undefined;
  const setting = buildSetting({ ...p.setting, stone: p.stone, shankThicknessMm: plain.thicknessMm, finger });
  const stone = buildStone(p.stone);
  const transform: RingTransform = {
    rotationZ,
    translateZ: plain.innerRadiusMm - setting.heights.fingerZ,
  };
  if (setting.collar) return betweenRing(p, orientation, setting, stone, transform);
  const ringStone = applyTransform(stone.positions, transform);
  const ringSetting = applyTransform(setting.positions, transform);
  // 石座の足が腕の中へ入る所の広さから、腕のいちばん上の肩を決めて、腕を作り直す
  // 一体の石座は足もとが腕の幅の中に入るので、腕の上をふくらませない（丸い線のまま石座につなぐ）
  // 石の下側が腕に入りこむ所は、腕の上をザグる（石の縁と同じすき間を残す）
  const seatCut = stoneSeatCut(p.stone, stone.heights, transform, GUIDES.bezel.clearanceMm);
  // 石座の下の輪が腕に当たる所は、腕の上を輪の形に合わせて削って座にし（joint.ts）、両側の接点にロウを流す
  const rail = railInRing(setting, transform);
  const shank = buildShank(setting.normals ? p.shank : { ...p.shank, head: p.shank.head ?? headFootprint(ringSetting, plain) }, seatCut, { rail });
  const wantSolder = p.solder ?? (p.setting.solid === true && p.setting.solidQuality !== "preview");
  const solder = rail && wantSolder ? buildSolder(rail, shank, seatCut) : null;
  const settingAll = solder?.positions.length ? concat([ringSetting, solder.positions]) : ringSetting;
  const settingNormals = setting.normals ? rotateNormals(setting.normals, transform.rotationZ) : undefined;
  const culetGapMm = stone.heights.culetZ + transform.translateZ - shank.innerRadiusMm;
  const metal = shank.metal;
  const solderInfo = solder && solder.contacts ? { contacts: solder.contacts, filletMm: solder.filletMm, triangles: { start: ringSetting.length / 9, count: solder.positions.length / 9 } } : null;
  return {
    params: p,
    orientation,
    stone,
    setting,
    shank,
    transform,
    ringPositions: {
      stone: ringStone,
      // ロウの丸みは石座の後ろに足す（爪の三角形の範囲は変わらない）
      setting: settingAll,
      shank: shank.positions,
      settingNormals: settingNormals && solder?.positions.length ? concat([settingNormals, solder.normals]) : settingNormals,
    },
    solder: solderInfo,
    culetGapMm,
    notchDepthMm: shank.notchDepthMm,
    seatCut,
    // ロウの丸みの形は、腕と輪の中に隠れる所もふくむので、重さには数えない（ロウはごく少し）
    metalWeightG: weightG(shank.volumeMm3 + meshVolume(setting.positions), metal),
    metal,
    stones: [
      {
        params: p.stone,
        orientation,
        stone,
        setting,
        transform,
        atMm: 0,
        phi: 0,
        seatCut,
        rail,
        culetGapMm,
        ranges: { stone: { start: 0, count: ringStone.length / 9 }, setting: { start: 0, count: settingAll.length / 9 } },
        solder: solderInfo ? { contacts: solderInfo.contacts, filletMm: solderInfo.filletMm } : null,
      },
    ],
    joins: [],
  };
}

/**
 * 腕の間に挟む石座の指輪（職人 石川の言葉 2026-11-04）：腕のいちばん上を、石座の下の輪（板を丸めた輪）の外の面まで切り、
 * 腕の両端の間に輪をはさむ。腕の端が輪の横に当たる所にロウの丸み。石の下は腕がないので、ザグらない（石の一番下は輪の中にある）
 */
function betweenRing(p: RingParams, orientation: Orientation, setting: SettingResult, stone: StoneMesh, transform: RingTransform): RingDesign {
  const collar = collarInRing(setting, transform)!;
  const ringStone = applyTransform(stone.positions, transform);
  const ringSetting = applyTransform(setting.positions, transform);
  const seatCut = stoneSeatCut(p.stone, stone.heights, transform, GUIDES.bezel.clearanceMm);
  const shank = buildShank({ ...p.shank, head: undefined }, undefined, { gap: { outline: collar.outer, low: { outline: collar.outerLow, topZ: collar.topZ, bottomZ: collar.bottomZ } } });
  const wantSolder = p.solder ?? (p.setting.solid === true && p.setting.solidQuality !== "preview");
  const solder = wantSolder ? buildEndSolder(collar, shank) : null;
  const settingAll = solder?.positions.length ? concat([ringSetting, solder.positions]) : ringSetting;
  const settingNormals = setting.normals ? rotateNormals(setting.normals, transform.rotationZ) : undefined;
  const culetGapMm = stone.heights.culetZ + transform.translateZ - shank.innerRadiusMm;
  const metal = shank.metal;
  const solderInfo = solder && solder.contacts ? { contacts: solder.contacts, filletMm: solder.filletMm, triangles: { start: ringSetting.length / 9, count: solder.positions.length / 9 } } : null;
  return {
    params: p,
    orientation,
    stone,
    setting,
    shank,
    transform,
    ringPositions: {
      stone: ringStone,
      setting: settingAll,
      shank: shank.positions,
      settingNormals: settingNormals && solder?.positions.length ? concat([settingNormals, solder.normals]) : settingNormals,
    },
    solder: solderInfo,
    culetGapMm,
    notchDepthMm: 0,
    seatCut,
    metalWeightG: weightG(shank.volumeMm3 + meshVolume(setting.positions), metal),
    metal,
    stones: [
      {
        params: p.stone,
        orientation,
        stone,
        setting,
        transform,
        atMm: 0,
        phi: 0,
        seatCut,
        rail: null,
        culetGapMm,
        ranges: { stone: { start: 0, count: ringStone.length / 9 }, setting: { start: 0, count: settingAll.length / 9 } },
        solder: solderInfo ? { contacts: solderInfo.contacts, filletMm: solderInfo.filletMm } : null,
      },
    ],
    joins: [],
  };
}

/**
 * テンション（挟む）の指輪（職人 石川の言葉 2026-11-05）：石座はなく、開いた腕の両はしに石の形を彫って挟む。
 * 石は一粒だけ。石座の形は空で、石の高さの数だけ持つ（確かめと画面が同じ入れ物を読めるように）
 */
function tensionRing(p: RingParams): RingDesign {
  const { shank, info } = buildTensionBand(p.shank, p.stone, { culetGapMm: p.setting.culetGapMm, ...p.tension });
  const stone = buildStone(p.stone);
  const h = stone.heights;
  const transform: RingTransform = { rotationZ: info.rotationZ, translateZ: info.girdleZ, translateX: info.translateX, translateY: info.translateY };
  const ringStone = applyTransform(stone.positions, transform);
  const fingerZ = shank.innerRadiusMm - info.girdleZ;
  const culetGapMm = h.culetZ - fingerZ;
  const empty = new Float32Array(0);
  const setting: SettingResult = {
    style: "tension",
    positions: empty,
    prongs: [],
    prongsOnArm: 0,
    collarBlocked: false,
    rings: [],
    bezel: null,
    heights: {
      ...h,
      fingerZ,
      shankTopZ: fingerZ + shank.thicknessMm,
      baseZ: fingerZ,
      culetGapMm,
      tipZ: null,
      upperRingZ: null,
      lowerRingZ: null,
      topZ: h.tableZ,
      heightAboveFingerMm: h.tableZ - fingerZ,
    },
    corners: findCorners(p.stone.outlineMm),
    minProngMm: 0,
    standardProngMm: 0,
    standardLengthMm: 0,
    lowerRail: null,
    upperRail: null,
    join: "on",
    collar: null,
    tension: info,
  };
  const seatCut = stoneSeatCut(p.stone, stone.heights, transform, GUIDES.bezel.clearanceMm);
  const metal = shank.metal;
  return {
    params: p,
    orientation: "along",
    stone,
    setting,
    shank,
    transform,
    ringPositions: { stone: ringStone, setting: empty, shank: shank.positions },
    solder: null,
    culetGapMm,
    notchDepthMm: 0,
    seatCut,
    metalWeightG: shank.weightG,
    metal,
    stones: [
      {
        params: p.stone,
        orientation: "along",
        stone,
        setting,
        transform,
        atMm: 0,
        phi: 0,
        seatCut,
        rail: null,
        culetGapMm,
        ranges: { stone: { start: 0, count: ringStone.length / 9 }, setting: { start: 0, count: 0 } },
        solder: null,
      },
    ],
    joins: [],
  };
}

/**
 * 石を並べた指輪：石ごとに、一粒と同じ石座（buildSetting）を作り、その石の座標（石が腕の真上）で高さを決め、
 * 腕に沿った場所へ、指の軸のまわりに回して置く（石座は腕の丸みに沿って、腕に直角に立つ）。
 * 腕は石ごとに、その石の真下をザグり、下の輪の座を作る（buildShank の seats）。ロウの丸みも石ごと。
 * 一粒の指輪の肩（石座の足を受ける広い所）は、石を並べるときは作らない（腕はどこも同じ幅）
 */
function buildMulti(p0: RingParams): RingDesign {
  // 石を並べた指輪の腕は、どこも同じ形（場所ごとの形は使わない。ザグりと座が腕のあちこちに来るため）
  const p: RingParams = { ...p0, shank: { ...p0.shank, stations: undefined, relief: undefined } };
  const plain = buildShank(p.shank);
  const outerR = plain.outerRadiusMm;
  const wantSolder = p.solder ?? (p.setting.solid === true && p.setting.solidQuality !== "preview");
  const places: StonePlace[] = [{ stone: p.stone, setting: p.setting, orientation: p.orientation, atMm: p.atMm ?? 0 }, ...(p.others ?? [])];
  const parts = places.map((pl) => {
    const orientation = pl.orientation ?? "along";
    // 腕の間に挟む付け方は、一粒の指輪だけ（石を並べる指輪は、腕の上にのせる）
    const setting = buildSetting({ ...pl.setting, join: "on", stone: pl.stone, shankThicknessMm: plain.thicknessMm });
    const stone = buildStone(pl.stone);
    const phi = pl.atMm / outerR;
    const local: RingTransform = { rotationZ: pl.turnRad ?? (orientation === "across" ? Math.PI / 2 : 0), translateZ: plain.innerRadiusMm - setting.heights.fingerZ };
    const transform: RingTransform = { ...local, tiltRad: phi };
    const seatCut = stoneSeatCut(pl.stone, stone.heights, local, GUIDES.bezel.clearanceMm);
    const rail = railInRing(setting, local);
    return { pl, orientation, setting, stone, phi, local, transform, seatCut, rail };
  });
  const seats: ShankSeat[] = parts.map((q) => ({ phi: q.phi, cut: q.seatCut, rail: q.rail }));
  // となりの石座をつなぐ：腕に沿って並べた順で となりの 2 つの、輪の中心の線どうしのいちばん近い 2 点を、輪と同じ太さの線で
  const joins: HeadJoin[] = [];
  if (p.joinHeads) {
    const rails = parts.map((q) =>
      [q.setting.upperRail, q.setting.lowerRail].flatMap((r): RailLine[] => (r ? [{ pts: r.pts.map(([x, y, z]) => placePoint(q.transform, x, y, z)), radiusMm: r.radiusMm }] : [])),
    );
    const order = parts.map((q, i) => ({ i, at: q.pl.atMm })).sort((x, y) => x.at - y.at);
    for (let k = 0; k + 1 < order.length; k++) {
      const a = Math.min(order[k].i, order[k + 1].i);
      const b = Math.max(order[k].i, order[k + 1].i);
      const n = nearestRails(rails[a], rails[b]);
      if (!n || n.gapMm > JOIN_MAX_MM) continue;
      joins.push({ a, b, from: n.from, to: n.to, radiusMm: Math.min(n.ra, n.rb) * GUIDES.multi.trio.joinWireRatio, gapMm: n.gapMm });
    }
  }
  const shank = buildShank({ ...p.shank, head: undefined }, undefined, { seats });
  const stoneArrs: Float32Array[] = [];
  const settingArrs: Float32Array[] = [];
  const normalArrs: Float32Array[] = [];
  let stoneTri = 0;
  let settingTri = 0;
  let volume = shank.volumeMm3;
  const placed: PlacedStone[] = parts.map((q) => {
    const sp = applyTransform(q.stone.positions, q.transform);
    let st = applyTransform(q.setting.positions, q.transform);
    let nr = rotateNormals(q.setting.normals ?? faceNormals(q.setting.positions), q.local.rotationZ, q.phi);
    let solder: PlacedStone["solder"] = null;
    if (q.rail && wantSolder) {
      // ロウの丸みは、その石の座標で作ってから、石の場所へ回す（腕は指の軸のまわりに回しても同じ形。ザグりの球だけ、その石のものにする）
      const b = shank.notchBalls.find((x) => Math.abs(x.phi - q.phi) < 1e-9);
      const view: ShankResult = { ...shank, notchBall: b ? { cx: b.cx, cy: b.cy, bottomZ: b.bottomZ, radiusMm: b.radiusMm } : null };
      const sd = buildSolder(q.rail, view, q.seatCut);
      if (sd.positions.length) {
        st = concat([st, applyTransform(sd.positions, { rotationZ: 0, translateZ: 0, tiltRad: q.phi })]);
        nr = concat([nr, rotateNormals(sd.normals, 0, q.phi)]);
      }
      if (sd.contacts) solder = { contacts: sd.contacts, filletMm: sd.filletMm };
    }
    for (const j of joins.filter((x) => x.b === parts.indexOf(q))) {
      const m = joinMesh(j);
      st = concat([st, m.positions]);
      nr = concat([nr, m.normals]);
      volume += meshVolume(m.positions);
    }
    stoneArrs.push(sp);
    settingArrs.push(st);
    normalArrs.push(nr);
    const ranges = { stone: { start: stoneTri, count: sp.length / 9 }, setting: { start: settingTri, count: st.length / 9 } };
    stoneTri += ranges.stone.count;
    settingTri += ranges.setting.count;
    volume += meshVolume(q.setting.positions);
    return {
      params: q.pl.stone,
      orientation: q.orientation,
      stone: q.stone,
      setting: q.setting,
      transform: q.transform,
      atMm: q.pl.atMm,
      phi: q.phi,
      seatCut: q.seatCut,
      rail: q.rail,
      culetGapMm: q.stone.heights.culetZ + q.local.translateZ - shank.innerRadiusMm,
      ranges,
      solder,
    };
  });
  const main = placed[0];
  const metal = shank.metal;
  return {
    params: p,
    orientation: main.orientation,
    stone: main.stone,
    setting: main.setting,
    shank,
    transform: main.transform,
    ringPositions: { stone: concat(stoneArrs), setting: concat(settingArrs), shank: shank.positions, settingNormals: concat(normalArrs) },
    solder: main.solder ? { ...main.solder, triangles: { start: main.setting.positions.length / 9, count: main.ranges.setting.count - main.setting.positions.length / 9 } } : null,
    culetGapMm: main.culetGapMm,
    notchDepthMm: shank.notchDepthMm,
    seatCut: main.seatCut,
    metalWeightG: weightG(volume, metal),
    metal,
    stones: placed,
    joins,
  };
}

/** 石の座標の点 (x, y, z) を、その石の場所へ置いたときの指輪の座標 */
export function placePoint(t: RingTransform, x: number, y: number, z: number): [number, number, number] {
  const c = Math.cos(t.rotationZ);
  const s = Math.sin(t.rotationZ);
  const px = x * c - y * s + (t.translateX ?? 0);
  const py = x * s + y * c + (t.translateY ?? 0);
  const pz = z + t.translateZ;
  const a = t.tiltRad ?? 0;
  if (a === 0) return [px, py, pz];
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return [px, py * ca + pz * sa, -py * sa + pz * ca];
}

/**
 * 腕だけを作り直す（石と石座はそのまま）。断面の点を動かしている間に、3D の腕だけをすぐ変えるため。
 * 肩（石座の足を受ける広い所）は、今の石座から buildRing と同じように決める。ザグりも同じ球のビットで削り、石座の座も作る（動かしている間は、削る所の格子を粗くして速くする。ロウの丸みは指を離したときに作る）
 */
export function rebuildShank(ring: RingDesign, shank0: ShankParams): ShankResult {
  if (ring.setting.style === "tension") return buildTensionBand(shank0, ring.params.stone, { culetGapMm: ring.params.setting.culetGapMm, ...ring.params.tension }).shank;
  // 動かしている間は、彫りを作らない（格子が細かく、指の動きに遅れる）。指を離したら入る
  const shank: ShankParams = { ...shank0, relief: undefined };
  const collar = collarInRing(ring.setting, ring.transform);
  if (collar) return buildShank({ ...shank, head: undefined }, undefined, { gap: { outline: collar.outer } });
  if (ring.stones.length > 1 || ring.stones[0]?.phi) {
    const seats = ring.stones.map((st, i) => ({ phi: st.phi, cut: i === 0 ? ring.seatCut : st.seatCut, rail: st.rail }));
    return buildShank({ ...shank, head: undefined, stations: undefined, relief: undefined }, undefined, { notchStepMm: BALL_CUT.dragStepMm, seats });
  }
  const opts = { notchStepMm: BALL_CUT.dragStepMm, rail: railInRing(ring.setting, ring.transform) };
  if (ring.setting.normals) return buildShank(shank, ring.seatCut, opts);
  const plain = buildShank(shank);
  return buildShank({ ...shank, head: shank.head ?? headFootprint(ring.ringPositions.setting, plain) }, ring.seatCut, opts);
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
  const a = t.tiltRad ?? 0;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const dx = t.translateX ?? 0;
  const dy = t.translateY ?? 0;
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const py = x * s + y * c + dy;
    const pz = positions[i + 2] + t.translateZ;
    out[i] = x * c - y * s + dx;
    out[i + 1] = a === 0 ? py : py * ca + pz * sa;
    out[i + 2] = a === 0 ? pz : -py * sa + pz * ca;
  }
  return out;
}

/** 地金の名前（画面に出す） */
export function metalName(metal: MetalId): string {
  return GUIDES.metals[metal].name;
}

/** 向き（法線）を z 軸まわりに rad 回し、そのあと x 軸のまわりに tilt 回す（位置の移動はしない） */
function rotateNormals(n: Float32Array, rad: number, tilt = 0): Float32Array {
  if (rad === 0 && tilt === 0) return n;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const ca = Math.cos(tilt);
  const sa = Math.sin(tilt);
  const out = new Float32Array(n.length);
  for (let i = 0; i < n.length; i += 3) {
    const y = n[i] * s + n[i + 1] * c;
    const z = n[i + 2];
    out[i] = n[i] * c - n[i + 1] * s;
    out[i + 1] = y * ca + z * sa;
    out[i + 2] = -y * sa + z * ca;
  }
  return out;
}

/** 三角形ごとの面の向き（頂点の向きのない形を、向きのある形と一緒に並べるとき） */
function faceNormals(p: Float32Array): Float32Array {
  const out = new Float32Array(p.length);
  for (let t = 0; t < p.length; t += 9) {
    const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
    const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (let k = 0; k < 3; k++) {
      out[t + k * 3] = nx;
      out[t + k * 3 + 1] = ny;
      out[t + k * 3 + 2] = nz;
    }
  }
  return out;
}
