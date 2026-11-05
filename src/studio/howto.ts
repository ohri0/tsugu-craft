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
import { castSteps, dropVDetails, finishStep, forgeSteps, settingStep } from "./steps";

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
  /** V 字の爪がある指輪か（記録から帳面を作るときに、V 字の爪の手順を出すか決める） */
  vProngs?: boolean;
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
  const steps = (o.ring.stones?.length ?? 1) > 1 ? multiSteps(o, method) : soloSteps(o, method);
  // V 字の爪の手順は、V 字の爪のある指輪にだけ出す（ない爪の話が「詳しく」に残っていた）
  const hasV = (o.ring.stones?.length ? o.ring.stones.map((st) => st.setting) : [o.ring.setting]).some((st) => st.prongs.some((p) => p.isV));
  return hasV ? steps.map((s) => (s.id === "prong" ? { ...s, vProngs: true } : s)) : steps.map((s) => (s.details ? { ...s, details: dropVDetails(s.details) } : s));
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

/**
 * 腕の間に挟む石座の、形から出す数字（職人 石川の言葉 2026-11-04 の作り方）。
 * 腕を切る長さ：腕の厚みの真ん中の線で測った、両端の間の弧。下の輪の板：厚み × 高さ（いちばん高い所。下は指の丸みに合わせて削る）× 長さ（板の厚みの真ん中の線の周）。
 * 上の輪の丸線：太さ × 長さ（線の中心の周）。ザグりの深さ：線の太さ × 目安の割合
 */
export function betweenMeasures(r: RingDesign) {
  const c = r.setting.collar;
  const ends = r.shank.ends;
  if (!c || !ends) return null;
  const sh = r.shank;
  const rm = sh.innerRadiusMm + sh.thicknessMm / 2;
  const y = (Math.abs(ends[0].y) + Math.abs(ends[1].y)) / 2;
  const cutArc = 2 * rm * Math.asin(Math.min(1, y / rm));
  const mid = c.outer.map((q, i) => ({ x: (q.x + c.inner[i].x) / 2, y: (q.y + c.inner[i].y) / 2 }));
  const sheetLength = perimeter(mid);
  const sheetHeight = c.topZ - c.bottomZ;
  const upper = r.setting.upperRail;
  const wire = upper ? 2 * upper.radiusMm : 0;
  const wireLength = upper ? perimeter(upper.pts.map(([x, yy]) => ({ x, y: yy }))) : 0;
  return {
    bandLength: (sh.innerDiameterMm + sh.thicknessMm) * Math.PI - cutArc,
    cutArc,
    cutChord: 2 * y,
    sheet: { thickness: c.wallMm, height: sheetHeight, length: sheetLength, lowest: c.heightMm },
    upperWire: { diameter: wire, length: wireLength },
    seatDepth: wire * GUIDES.join.between.seatDepthRatio,
  };
}

/**
 * テンション（挟む）の作り方（職人 石川の言葉 2026-11-05 ＋ 資料 docs/RESEARCH-tension.md の 5 節）。
 * 数字は形から計算した物と職人の値だけ。硬さ・詰める量・開ける量は、資料にもよい数字がないので「職人が決める」
 */
function tensionSteps(o: HowToInput, method: Method): Step[] {
  const r = o.ring;
  const sh = r.shank;
  const info = r.setting.tension!;
  const line = `${SHANK_SECTION_LABEL[sh.section]} ${sh.section === "maru" ? `ø ${mm(sh.widthMm)}` : `${mm(sh.widthMm)} × ${mm(sh.thicknessMm)}`}`;
  const head: Spec[] = [
    { label: "石", value: `${o.longMm.toFixed(2)} × ${o.widthMm.toFixed(2)} × ${o.depthMm.toFixed(2)} mm` },
    { label: "号", value: `${sh.gou} 号（内径 ${mm(sh.innerDiameterMm)}）` },
  ];
  const endSpecs: Spec[] = info.ends.map((e) =>
    e.kind === "pit"
      ? { label: "角のくぼみ", value: `石の角の先を ${mm(e.depthMm, 2)} 入れる（底まで ${mm(e.floorMm, 2)}。職人の値）` }
      : { label: "辺の溝", value: `石の辺を ${mm(e.depthMm, 2)} 入れる（底まで ${mm(e.floorMm, 2)}。${e.straight ? "腕の幅いっぱいに抜けてよい。" : "石の丸みに沿う。"}職人の値）` },
  );
  const gap: Spec = { label: "図面の開き", value: `${mm(info.gapMm, 2)}（石が入る寸法。腕の周りの向きの石の長さ ${mm(info.spanMm, 2)} − 両はしの深さ）` };
  const close: Step = {
    id: "tension_close",
    title: "開きを詰める",
    text: "地金を硬くしながら、腕の開きを詰める。どこまで詰めるか（プリロード）は図面に入れない。職人が決める。",
    specs: [gap, { label: "詰める量", value: "職人が決める（資料によい数字がない）" }],
    watch: "硬くなったあとに曲げすぎると割れやすい（資料の声）。",
  };
  const set: Step = {
    id: "tension_set",
    title: "石を入れる",
    text: "腕を開いて、石の角をくぼみへ、辺を溝へ入れ、腕を戻す。開け方（心金・くさびなど）と開ける量は職人が決める。",
    specs: [...endSpecs, { label: "石と指のすき間", value: mm(r.culetGapMm, 2) }],
    watch: "火を使わない（熱で地金がやわらかくなると、ばねが消える。資料の声）。欠けやすい石は、職人が向くかを確かめる。",
  };
  const finish = finishStep([{ label: "地金", value: `${o.metalLabel} ・ 約 ${r.metalWeightG.toFixed(1)} g` }], "ヤスリの跡を消し、全体を磨く。");
  const lift: Spec[] = info.liftMm > 0 ? [{ label: "両はしの持ち上げ", value: `指の丸みから ${mm(info.liftMm, 2)}（石の先が指に当たらないように。仮の目安）` }] : [];
  if (method === "cast") {
    return [
      ...castSteps({
        modelSpecs: [...head, { label: "腕", value: line }, gap, ...lift, ...endSpecs],
        sprueAt: "腕の下（開きの反対側）",
        metalLabel: o.metalLabel,
        weightG: r.metalWeightG,
        alloy: o.alloy ?? null,
        innerMm: sh.innerDiameterMm,
        gou: sh.gou,
      }),
      {
        id: "harden",
        title: "硬くする",
        text: "鋳造のままでは、地金が硬い状態にならない。硬い状態でないと、石が取れる（職人の言葉）。硬くする方法は職人が決める。",
        specs: [{ label: "硬さ", value: "職人が決める（形からは確かめられない）" }],
        watch: "資料には、熱で硬くする合金の例がある（特許の文）。使う地金で試してから。",
      },
      close,
      set,
      finish,
    ];
  }
  return [
    {
      id: "material",
      title: "丸線を用意する",
      text: "腕の丸線を、切り口を整える分を足して切る。腕の両はしはロウ付けしないので、継ぎ目はない。",
      specs: [...head, { label: "腕の線", value: `${line} ・ 長さ 約 ${mm(info.wireLengthMm)}（真ん中の線）` }],
    },
    {
      id: "bend",
      title: "輪に曲げる",
      text: "芯金で輪に曲げる。両はしは閉じず、石が入る開きを残す。",
      specs: [{ label: "内径", value: `${mm(sh.innerDiameterMm)}（${sh.gou} 号）` }, gap, ...lift],
    },
    {
      id: "harden",
      title: "叩いて硬くする",
      text: "叩く・打つなどで、地金を硬い状態にする（加工硬化）。硬い状態でないと、石が取れる（職人の言葉）。K18・Pt900・シルバーでもできなくはない（職人の言葉）。",
      specs: [{ label: "硬さ", value: "職人が決める（形からは確かめられない）" }],
      watch: "このあと火を入れない。焼きなましの温度まで熱すると、やわらかくなる（資料の声）。",
    },
    {
      id: "tension_cut",
      title: "溝とくぼみを切る",
      text: "片方の端に角の先が入るくぼみを、もう片方の端に辺が入る溝を切る。石を当てて確かめながら。溝の高さは、石の縁（ガードル）の厚みに合わせる。",
      specs: [...endSpecs, { label: "石とのすき間", value: `${mm(info.clearanceMm, 2)}（仮の目安）` }],
      watch: "資料には、硬くする前に溝を切る例もある。順は職人が決める。",
    },
    close,
    set,
    finish,
  ];
}

function soloSteps(o: HowToInput, method: Method): Step[] {
  const r = o.ring;
  if (r.setting.tension) return tensionSteps(o, method);
  const bm = betweenMeasures(r);
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
          ...(bm
            ? [
                { label: "石座の座", value: `腕のいちばん上を ${mm(bm.cutChord, 2)} 切り、腕の両はしの間に下の輪をはさむ形（3D データに入っている）` },
                { label: "下の輪", value: `板を丸めた輪 ・ 厚み ${mm(bm.sheet.thickness, 2)} ・ 高さ ${mm(bm.sheet.lowest, 2)}（いちばん低い所。仮の目安）` },
              ]
            : r.solder
              ? [{ label: "石座の座", value: `腕の上に、下の輪の形の溝 深さ ${mm(r.shank.railSeatDepthMm, 2)}（3D データに入っている。ロウの丸みは原型に入れない）` }]
              : []),
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
  if (bm) return betweenHandSteps(o, bm, head, settingSpecs, seat, finish);
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


/**
 * 手作り・腕の間に挟む石座（職人 石川の言葉 2026-11-04）：石座と腕は別に作る。腕のいちばん上を切り、
 * 板を丸めた下の輪を腕の両はしの間にはさんでロウ付けする。上の輪は丸線で、石の座をリューターでザグる
 */
function betweenHandSteps(o: HowToInput, bm: NonNullable<ReturnType<typeof betweenMeasures>>, head: Spec[], settingSpecs: Spec[], seat: Step, finish: Step): Step[] {
  const r = o.ring;
  const sh = r.shank;
  const m = measures(o);
  const sheet: Spec = { label: "下の輪の板", value: `厚み ${mm(bm.sheet.thickness, 2)} × 幅 ${mm(bm.sheet.height, 2)} × 長さ 約 ${mm(bm.sheet.length)}` };
  const wire: Spec = { label: "上の輪の丸線", value: `ø ${mm(bm.upperWire.diameter, 2)} ・ 長さ 約 ${mm(bm.upperWire.length)}（線の中心の周）` };
  return [
    ...forgeSteps({
      materialText: "腕の線と、石座の材料（下の輪の板・上の輪の丸線・爪の線）を用意する。",
      materialSpecs: [...head, { label: "腕の線", value: `${SHANK_SECTION_LABEL[sh.section]} ${mm(sh.widthMm)} × ${mm(sh.thicknessMm)} ・ 長さ 約 ${mm(m.shankLength)}` }, sheet, wire, ...settingSpecs],
      alloy: o.alloy ?? null,
      innerMm: sh.innerDiameterMm,
      gou: sh.gou,
    }),
    {
      id: "cut_top",
      title: "腕の上を切る",
      text: `腕のいちばん上を、下の輪の外の幅だけ切り取る。切り口は、輪の外の丸みに合わせてヤスリで整える。`,
      specs: [
        { label: "切る幅", value: `${mm(bm.cutChord, 2)}（腕の真ん中で。腕の厚みの真ん中の線で 約 ${mm(bm.cutArc, 2)}）` },
        { label: "残る腕の長さ", value: `約 ${mm(bm.bandLength)}` },
      ],
      watch: "切りすぎると、腕の端が輪に届かない。少し長めに切って、輪を当てながら削る。",
    },
    {
      id: "collar",
      title: "下の輪を板から作る",
      text: "板を石の形に沿って丸め、継ぎ目をロウ付けして輪にする（断面が四角い短い筒）。下の面は、指の丸みに合わせてヤスリで削る。",
      specs: [sheet, { label: "高さ", value: `いちばん低い所 ${mm(bm.sheet.lowest, 2)}・いちばん高い所 ${mm(bm.sheet.height, 2)}（仮の目安）` }],
      watch: "継ぎ目は、腕の端が当たる所からずらす（ロウが 2 回流れないように）。",
    },
    {
      id: "attach",
      title: "下の輪を腕の間に挟んでロウ付けする",
      text: "腕の両はしの間に下の輪をはさみ、腕の端が輪の横にぴったり当たるようにして、両側にロウを流す。上にのせるのではなく、腕の間に入れる。",
      specs: [
        { label: "ロウ付け", value: `腕の端 ${r.solder?.contacts ?? 2} か所${r.solder ? `・すみの丸み 約 ${mm(r.solder.filletMm, 2)}（仮の目安）` : ""}` },
        { label: "指から石座の上まで", value: mm(m.heightAboveFinger, 2) },
      ],
      watch: "輪の下の面と腕の内側が、指の側でそろうように。",
    },
    {
      id: "head",
      title: "上の輪と爪をロウ付けする",
      text: "丸線を輪にして閉じ、下の輪の外に爪を立ててロウ付けし、爪の外から上の輪をロウ付けする（上の輪は石の縁の真下）。",
      specs: [wire, ...settingSpecs],
      watch: "爪は石の周りに均等に。上の輪は下の輪と平らに。",
    },
    {
      id: "bur_seat",
      title: "上の輪をリューターでザグる",
      text: "上の輪の内側の上を、リューターで石の下側の形に合わせて削り、石の縁が座る所を作る（丸線のままでは石が座らない）。",
      specs: [{ label: "ザグる深さ", value: `線の太さの約 ${Math.round(GUIDES.join.between.seatDepthRatio * 100)}%・約 ${mm(bm.seatDepth, 2)}（仮の目安）` }],
      watch: "石を当てて、縁がぐるりと同じ高さで座るか確かめる。",
    },
    seat,
    finish,
  ];
}
