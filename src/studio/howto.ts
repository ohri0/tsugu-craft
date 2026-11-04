// 作り方：組んだ指輪（この石・このデザイン）から、鋳造と手作りの 2 通りの工程を、計算した数字つきで出す。画面に依存しない。
//
// 数字は、形から計算したもの（腕の材料の長さ、爪の線材の太さと長さ、座を彫る位置 など）。
// 手順は宝飾の一般的な作り方の例で、作者（宝飾の彫金職人）が確かめて直す。温度や縮みの量のように、
// 形から出せず出典もない数字は書かない（鋳造所・職人の値を使う、と書く）。
import type { PlacedStone, RingDesign } from "../geometry/ring";
import { SHANK_SECTION_LABEL } from "../geometry/shank";
import { perimeter } from "../geometry/polygon";
import { GUIDES } from "../rules/guides";
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
  if ((o.ring.stones?.length ?? 1) > 1) return multiSteps(o, method);
  return soloSteps(o, method);
}

/** 石の場所の言葉（腕のいちばん上から、腕に沿って） */
export function placeText(st: Pick<PlacedStone, "atMm">): string {
  if (Math.abs(st.atMm) < 0.005) return "腕のいちばん上";
  return `腕のいちばん上から、腕に沿って ${st.atMm > 0 ? "右" : "左"}へ ${mm(Math.abs(st.atMm), 2)}`;
}

/**
 * 石を並べた指輪：石ごとに、一粒と同じ石座の作り方をくり返す（石座を組む・腕に付ける・石を留める）。
 * 腕と仕上げは 1 回。石の番号は 3D・確かめと同じ（石 1 ＝ 真ん中の石）
 */
function multiSteps(o: HowToInput, method: Method): Step[] {
  const r = o.ring;
  const one = (st: PlacedStone): Step[] =>
    soloSteps({ ...o, ring: { ...r, setting: st.setting, culetGapMm: st.culetGapMm, solder: st.solder ? { ...st.solder, triangles: { start: 0, count: 0 } } : null, notchDepthMm: 0 }, outlineMm: st.params.outlineMm, longMm: st.params.longMm, widthMm: st.params.widthMm, depthMm: st.params.depthMm }, method);
  const per = r.stones.map((st, i) => ({ st, i, steps: one(st) }));
  const base = per[0].steps;
  const name = (i: number, t: string) => `${t}（石 ${i + 1}）`;
  const tag = (i: number, st: PlacedStone, x: Step): Step => ({ ...x, title: name(i, x.title), specs: [{ label: "場所", value: placeText(st) }, ...x.specs] });
  const layout: Step = {
    id: "layout",
    title: "石の並びを腕に写す",
    text: `腕の外側に、石の真ん中の位置を ${r.stones.length} か所、ケガキで印をつける（腕のいちばん上から、腕に沿って測る）。`,
    specs: r.stones.map((st, i) => ({ label: `石 ${i + 1}`, value: `${st.params.longMm.toFixed(2)} mm ・ ${placeText(st)}` })),
    watch: "石座は腕に直角に立てる（腕の丸みに沿って、石の向きが少しずつ外へ開く）。",
  };
  const zaguri = r.notchDepthMm > 0 ? [{ label: "ザグり", value: `石ごとに、石の先の真下 ・ いちばん深い所 ${mm(r.notchDepthMm, 2)}（3D データに入っている）` }] : [];
  if (method === "cast") {
    // 原型（3D データ）に石座がぜんぶ入っているので、型と鋳造は 1 回。石留めだけ石ごとに
    // 石留めは、最後の「仕上げ」の前（castSteps のあと）
    const seatIdx = base.length - 2;
    const head = base.slice(0, seatIdx);
    const tail = base.slice(seatIdx + 1);
    const model = head.map((x, k) => (k === 0 ? { ...x, specs: [...x.specs, ...layout.specs, ...zaguri] } : x));
    const seats = per.map(({ st, i, steps }) => tag(i, st, steps[seatIdx]));
    return [...model, ...seats, ...tail];
  }
  // 手作り：材料と腕は 1 回、石座を組む・付ける・留めるは石ごと
  const idx = (id: string) => base.findIndex((x) => x.id === id);
  const iHead = idx("head") >= 0 ? idx("head") : idx("bezel_make");
  const iAttach = idx("attach");
  const before = base.slice(0, iHead);
  const finish = base[base.length - 1];
  const heads = per.map(({ st, i, steps }) => tag(i, st, steps[iHead]));
  const attaches = per.map(({ st, i, steps }) => tag(i, st, steps[iAttach]));
  const seats = per.map(({ st, i, steps }) => tag(i, st, steps[iAttach + 1]));
  return [...before, ...heads, layout, ...attaches, ...seats, finish];
}

function soloSteps(o: HowToInput, method: Method): Step[] {
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
        modelSpecs: [
          ...head,
          { label: "腕", value: `${SHANK_SECTION_LABEL[sh.section]} ・ 幅 ${mm(sh.widthMm)} × 厚み ${mm(sh.thicknessMm)}` },
          ...(r.notchDepthMm > 0 ? [{ label: "ザグり", value: `腕の上 深さ ${mm(r.notchDepthMm, 2)}・丸いくぼみ 直径 約 ${mm(r.shank.notchBallDiameterMm, 1)}（3D データに入っている）` }] : []),
          ...(r.solder ? [{ label: "石座の座", value: `腕の上に、下の輪の形の溝 深さ ${mm(r.shank.railSeatDepthMm, 2)}（3D データに入っている。ロウの丸みは原型に入れない）` }] : []),
          ...settingSpecs,
        ],
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
    {
      id: "attach",
      title: "石座を腕に付ける",
      // 石の先が腕に入りこむときは、形の方でもうザグってある（geometry/notch.ts、球のビット）。
      // 石座の下の輪が腕を横切る所は、腕の上を輪の形に合わせて削り（座）、両側の接点にロウを流す（geometry/joint.ts）
      text: attachText(r),
      specs: [
        { label: "指から石座の上まで", value: mm(m.heightAboveFinger, 2) },
        { label: "石と指のすき間", value: mm(m.culetGap, 2) },
        ...(r.notchDepthMm > 0 ? [{ label: "ザグり", value: `深さ ${mm(r.notchDepthMm, 2)}・丸いビット 直径 約 ${mm(r.shank.notchBallDiameterMm, 1)}（石とのすき間 ${mm(GUIDES.bezel.clearanceMm, 2)} を含む）` }] : []),
        ...(r.solder ? [{ label: "石座の座", value: `腕の上に、下の輪の形の溝 深さ ${mm(r.shank.railSeatDepthMm, 2)}（${r.solder.contacts} か所）` }, { label: "ロウ付け", value: `接点 ${r.solder.contacts} か所・すみの丸み 約 ${mm(r.solder.filletMm, 2)}（仮の目安）` }] : []),
      ],
    },
    seat,
    finish,
  ];
}

/**
 * 「石座を腕に付ける」の文。どこを、どう付けるか：
 * 石の先が腕に入りこむときは、先に丸いビットでザグる。下の輪が腕を横切る所は、腕の上を輪の丸みに合わせてヤスリで削り、
 * 石座がぐらつかずに座るようにする。両側の接点に小さなロウを置いて流す
 */
function attachText(r: RingDesign): string {
  const zaguri = r.notchDepthMm > 0 ? `石の先が当たる所は、丸いビット（直径 約 ${mm(r.shank.notchBallDiameterMm, 1)}）を真上から下ろして、腕の上を深さ ${mm(r.notchDepthMm, 2)} ザグる。` : "";
  if (!r.solder) return `${zaguri}腕のいちばん上に石座をのせ、ロウ付けする。`;
  const where = r.solder.contacts === 2 ? "石座の下の輪が腕を横切る 2 か所（腕に沿って前と後ろ）" : "石座の下の輪が腕にのる所";
  return `${zaguri}${where}は、腕の上を輪の丸みに合わせてヤスリで削り（深さ ${mm(r.shank.railSeatDepthMm, 2)}）、石座がぐらつかずに座るようにする。両側の接点に小さなロウを置いて流す（すみに小さな丸みが入るくらい。ロウは見えないくらい少し）。`;
}

