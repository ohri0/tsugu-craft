// 作り方：組んだ指輪（この石・このデザイン）から、鋳造と手作りの 2 通りの工程を、計算した数字つきで出す。画面に依存しない。
//
// 数字は、形から計算したもの（腕の材料の長さ、爪の線材の太さと長さ、座を彫る位置 など）。
// 手順は宝飾の一般的な作り方の例で、作者（宝飾の彫金職人）が確かめて直す。温度や縮みの量のように、
// 形から出せず出典もない数字は書かない（鋳造所・職人の値を使う、と書く）。
import type { RingDesign } from "../geometry/ring";
import { SHANK_SECTION_LABEL } from "../geometry/shank";
import { perimeter } from "../geometry/polygon";
import type { AlloyId, Detail } from "./process";
import { castSteps, finishStep, forgeSteps, settingStep } from "./steps";

export type Method = "cast" | "hand";

export interface Spec {
  label: string;
  value: string;
}

export interface Step {
  /** 工程の名前（詳しくの中身や道具を引くため） */
  id?: string;
  title: string;
  /** 1 行の説明 */
  text: string;
  specs: Spec[];
  /** 気をつける所（1 行、なければ空） */
  watch?: string;
  /** 「詳しく」の細かい手順（出典つき） */
  details?: Detail[];
}

const mm = (v: number, d = 1) => `${v.toFixed(d)} mm`;

export interface HowToInput {
  ring: RingDesign;
  /** 石の縁の形（mm） */
  outlineMm: readonly { x: number; y: number }[];
  longMm: number;
  widthMm: number;
  depthMm: number;
  metalLabel: string;
  /** 温度を出す地金（分からなければ null か省く） */
  alloy?: AlloyId | null;
}

/** 形から出す数字（どちらの作り方でも使う） */
export function measures(o: HowToInput) {
  const r = o.ring;
  const s = r.setting;
  const h = s.heights;
  const sh = r.shank;
  // 平たい線を丸めるときの長さ：（内径 ＋ 厚み）× π（厚みの真ん中の線の長さ）
  const shankLength = (sh.innerDiameterMm + sh.thicknessMm) * Math.PI;
  const girdleLen = perimeter(o.outlineMm as { x: number; y: number }[]);
  // 縁（ガードル）の下の高さ：石の一番下から下側（パビリオン）の高さ
  const girdleBottomZ = h.culetZ + h.pavilionMm;
  const prongWire = s.prongs.length
    ? {
        diameter: s.prongs[0].diameterMm,
        count: s.prongs.reduce((n, p) => n + p.legs, 0),
        // 石座の下の端から爪の先まで ＋ 先を整える分（線の太さ 1 本ぶん）
        length: Math.max(...s.prongs.map((p) => p.tipZ)) - h.baseZ + s.prongs[0].diameterMm,
        vCount: s.prongs.filter((p) => p.isV).length,
      }
    : null;
  return {
    shankLength,
    girdleLen,
    prongWire,
    // 爪の先から、座（石の縁が入る溝）までの深さ
    seatFromTip: h.tipZ !== null ? h.tipZ - girdleBottomZ : null,
    heightAboveFinger: h.heightAboveFingerMm,
    culetGap: r.culetGapMm,
    bezel: s.bezel ? { wall: s.bezel.wallMm, height: s.bezel.topZ - s.bezel.bottomZ, length: perimeter(s.bezel.innerOutline as { x: number; y: number }[]) } : null,
    galleryWire: s.rings[0]?.wireMm ?? null,
  };
}

export function howToMake(o: HowToInput, method: Method): Step[] {
  const r = o.ring;
  const m = measures(o);
  const sh = r.shank;
  const s = r.setting;
  const head: Spec[] = [
    { label: "石", value: `${o.longMm.toFixed(2)} × ${o.widthMm.toFixed(2)} × ${o.depthMm.toFixed(2)} mm` },
    { label: "号", value: `${sh.gou} 号（内径 ${mm(sh.innerDiameterMm)}）` },
  ];
  const settingSpecs: Spec[] =
    s.style === "bezel" && m.bezel
      ? [
          { label: "覆輪の壁", value: `厚み ${mm(m.bezel.wall, 2)} ・ 高さ ${mm(m.bezel.height)}` },
          { label: "帯の長さ", value: `約 ${mm(m.bezel.length)}（内側の周）` },
        ]
      : m.prongWire
        ? [
            { label: "爪", value: `${s.prongs.length} か所${m.prongWire.vCount ? `（うち V 字 ${m.prongWire.vCount}）` : ""}` },
            { label: "爪の線材", value: `ø ${mm(m.prongWire.diameter, 2)} × ${m.prongWire.count} 本 ・ 1 本 約 ${mm(m.prongWire.length)}` },
          ]
        : [];
  const seat = settingStep(
    s.style === "bezel" ? "bezel" : "prong",
    s.style === "bezel"
      ? []
      : [...(m.seatFromTip !== null ? [{ label: "座の位置", value: `爪の先から 約 ${mm(m.seatFromTip, 2)} 下` }] : []), { label: "石と指のすき間", value: mm(m.culetGap, 2) }],
    s.style === "bezel" ? "一か所から倒さず、向かい合う所を交互に。" : m.prongWire && m.prongWire.vCount ? "V 字の爪は、角の先が金属に当たらないよう逃がす。" : "爪は向かい合う 2 本ずつ倒す。",
    s.bezel?.coverMm,
  );
  const finish = finishStep([{ label: "地金", value: `${o.metalLabel} ・ 約 ${r.metalWeightG.toFixed(1)} g` }], "爪の先を丸め、ヤスリの跡を消して、全体を磨く。");
  const alloy = o.alloy ?? null;

  if (method === "cast") {
    return [
      ...castSteps({
        modelSpecs: [...head, { label: "腕", value: `${SHANK_SECTION_LABEL[sh.section]} ・ 幅 ${mm(sh.widthMm)} × 厚み ${mm(sh.thicknessMm)}` }, ...settingSpecs],
        sprueAt: "腕の下（石座の反対側）",
        metalLabel: o.metalLabel,
        weightG: r.metalWeightG,
        alloy,
        innerMm: sh.innerDiameterMm,
        gou: sh.gou,
      }),
      seat,
      finish,
    ];
  }
  return [
    ...forgeSteps({
      materialText: "腕の線と、石座の材料を用意する。",
      materialSpecs: [
        ...head,
        { label: "腕の線", value: `${SHANK_SECTION_LABEL[sh.section]} ${mm(sh.widthMm)} × ${mm(sh.thicknessMm)} ・ 長さ 約 ${mm(m.shankLength)}` },
        ...settingSpecs,
        ...(m.galleryWire && s.style !== "bezel" ? [{ label: "支えの輪", value: `ø ${mm(m.galleryWire, 2)} ・ 長さ 約 ${mm(m.girdleLen)}（石の縁の周）` }] : []),
      ],
      alloy,
      innerMm: sh.innerDiameterMm,
      gou: sh.gou,
    }),
    s.style === "bezel"
      ? { id: "bezel_make", title: "覆輪を作る", text: "帯を石の縁に沿わせて輪にし、ロウ付けする。", specs: settingSpecs, watch: "石を当てて、すき間がないか確かめる。" }
      : { id: "head", title: "石座を組む", text: "支えの輪に爪の線を立て、ロウ付けする。", specs: settingSpecs, watch: m.prongWire?.vCount ? "V 字の爪は、石の尖った角に合わせて置く。" : "爪は石の周りに均等に。" },
    { id: "attach", title: "石座を腕に付ける", text: "腕のいちばん上に石座をのせ、ロウ付けする。", specs: [{ label: "指から石座の上まで", value: mm(m.heightAboveFinger, 2) }, { label: "石と指のすき間", value: mm(m.culetGap, 2) }] },
    seat,
    finish,
  ];
}
