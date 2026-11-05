// 地金のみの指輪（甲丸・平打ち ほか）：形・作れるかの判定・作り方。画面に依存しない。
// 断面は src/cad/section.ts（見本・手で描いた線・内甲丸）、形は src/cad/solid.ts の、断面を回して作る指輪（上と下で断面を変えられる）。
import { SECTION_LABEL, SECTION_LIST, bandCurve, innerLimit, isSectionKind, matchLoops, matchPreset, sectionInfo, thinOutline, valleyOf, type PresetKind, type SectionKind, type SectionSpec } from "../cad/section";
import { bandSolid, meshVolume } from "../cad/solid";
import { GUIDES, GUIDE_NOTE, type Guides } from "../rules/guides";
import { SPIKE_TEXT, sectionSpots } from "../rules/checks";
import type { ThinSpot } from "../geometry/section-thin";
import type { SectionCurve } from "../geometry/shank";
import type { ClaudeTool } from "../claude/wire";
import type { Step } from "./howto";
import type { AlloyId } from "./process";
import { castSteps, finishStep, forgeSteps } from "./steps";

export { SECTION_LABEL, SECTION_LIST, type SectionKind };

/** 上（見える側）か、下（手のひら側）か */
export type BandEndName = "top" | "bottom";

export interface BandEnd {
  width: number;
  /** いちばん指に近い所から、いちばん高い所まで（mm） */
  thickness: number;
  /** 内甲丸の丸みの深さ（mm）。なし・0 なら内側は平ら */
  inner?: number;
}

export interface Band {
  gou: number;
  /** 上の断面（下も同じ断面なら、これだけ） */
  kind: SectionKind;
  /** 上（見える側）と下（手のひら側）の幅・厚み（mm） */
  top: BandEnd;
  bottom: BandEnd;
  /** 比重（g/cm³）と地金の名前 */
  density: number;
  metalLabel: string;
  /** 手で描いた上の断面の線（kind が free のとき） */
  curve?: SectionCurve;
  /** 上と下で断面や太さを変えるか（なければ、ひと周り同じ） */
  split?: boolean;
  /** 下の断面（split のとき。なければ上と同じ） */
  bottomKind?: SectionKind;
  bottomCurve?: SectionCurve;
  /** 幅や厚みを人が決めたか（決める前は、見本を選ぶと、その見本のはじめの寸法になる） */
  dimsSet?: boolean;
}

/** 指のまわりの分け方（形を作るための決まり） */
const AROUND = 192;
/** 上の断面が続く広さ（度。上を中心に左右合わせて。これまでの値のまま。形を作るための決まり） */
const BLEND_DEG = 140;
/** 断面を見るために切り取る所（度。切り口が斜めのカメラの方を向く所） */
const CUT = { top: { fromDeg: -48, toDeg: 26 }, bottom: { fromDeg: 146, toDeg: 220 } } as const;

/** 号から内径（指輪の画面と同じ式：13.0 ＋（号 − 1）÷ 3） */
export function bandInnerDiameter(gou: number): number {
  return GUIDES.shank.innerDiameterBaseMm + (gou - 1) / GUIDES.shank.gouPerMm;
}

/** はじめの指輪（甲丸・ひと周り同じ） */
export function defaultBand(density: number, metalLabel: string): Band {
  const s = GUIDES.band.sectionSizes.kouman;
  const end: BandEnd = { width: s.widthMm, thickness: s.thicknessMm };
  return { gou: 12, kind: "kouman", top: { ...end }, bottom: { ...end }, density, metalLabel, dimsSet: false };
}

/** 残した設計・記録・Claude の答えから来た形を、今の形に整える（前の版の記録にも、上と下で太さがちがうものがある） */
export function normalizeBand(b: Band): Band {
  const kind = isSectionKind(b.kind) ? (b.kind === "free" && !b.curve?.points.length ? "kouman" : b.kind) : "kouman";
  const differ = b.top.width !== b.bottom.width || b.top.thickness !== b.bottom.thickness || (b.top.inner ?? 0) !== (b.bottom.inner ?? 0);
  const bk = b.bottomKind && isSectionKind(b.bottomKind) ? (b.bottomKind === "free" && !b.bottomCurve?.points.length ? undefined : b.bottomKind) : undefined;
  // 前の版の記録は、見本の寸法から変えたかが分からないので、人が決めた寸法として扱う
  return { ...b, kind, bottomKind: bk, split: b.split ?? (differ || (bk !== undefined && bk !== kind)), dimsSet: b.dimsSet ?? true };
}

const sameSize = (b: Band) => b.top.width === b.bottom.width && b.top.thickness === b.bottom.thickness;
export const endOf = (b: Band, e: BandEndName): BandEnd => (e === "top" ? b.top : b.bottom);
export const kindOf = (b: Band, e: BandEndName): SectionKind => (e === "bottom" && b.split ? (b.bottomKind ?? b.kind) : b.kind);

/** その側の外の線（そろえた線） */
export function curveOf(b: Band, e: BandEndName): SectionCurve {
  const k = kindOf(b, e);
  const end = endOf(b, e);
  if (k === "free") return (e === "bottom" && b.split && b.bottomKind === "free" ? b.bottomCurve : b.curve) ?? bandCurve("kouman", end.width, end.thickness);
  return bandCurve(k, end.width, end.thickness - Math.min(end.inner ?? 0, innerLimit(end.width, end.thickness)));
}

export function specOf(b: Band, e: BandEndName): SectionSpec {
  const end = endOf(b, e);
  return { curve: curveOf(b, e), widthMm: end.width, thicknessMm: end.thickness, innerMm: end.inner ?? 0 };
}

/** 上と下の断面（同じ断面なら、同じ物を 2 つ） */
export function sections(b: Band): { top: SectionSpec; bottom: SectionSpec } {
  const top = specOf(b, "top");
  const alike = sameSize(b) && (b.top.inner ?? 0) === (b.bottom.inner ?? 0) && kindOf(b, "top") === kindOf(b, "bottom") && (!b.split || b.bottomKind !== "free");
  return { top, bottom: alike ? top : specOf(b, "bottom") };
}

/** 形（三角形の並び、mm）と、重さの目安（g） */
export function bandMesh(b: Band): { positions: Float32Array; weightG: number } {
  const positions = bandSolidOf(b);
  return { positions, weightG: (Math.abs(meshVolume(positions)) / 1000) * b.density };
}

function bandSolidOf(b: Band, gap?: { fromDeg: number; toDeg: number }): Float32Array {
  const { top, bottom } = sections(b);
  const [lt, lb] = matchLoops(top, bottom);
  return bandSolid({ innerDiameter: bandInnerDiameter(b.gou), top: lt, bottom: lb, blendDeg: BLEND_DEG, around: AROUND, gap });
}

/** 断面を見るための、切った形（画面に出すだけ。STL と重さには使わない）。切り口を上か下の断面の所に作る */
export function bandCutMesh(b: Band, at: BandEndName): Float32Array {
  return bandSolidOf(b, CUT[at]);
}

// ---- 設計を変える（画面のボタンと、Claude の答えが同じ関数を使う） ----

const round2 = (v: number) => Math.round(v * 100) / 100;

/** 丸線は幅と厚みが同じで、内側が半円 */
const roundWire = (d: number): BandEnd => ({ width: d, thickness: d, inner: d / 2 });

function withEnds(b: Band, e: BandEndName, end: BandEnd): Band {
  if (!b.split) return { ...b, top: end, bottom: { ...end } };
  return e === "top" ? { ...b, top: end } : { ...b, bottom: end };
}

/** 内側の丸みを、その幅と厚みで使える深さに収める */
function fitInner(end: BandEnd): BandEnd {
  const inner = end.inner ?? 0;
  if (inner <= 0) return { width: end.width, thickness: end.thickness };
  return { ...end, inner: round2(Math.min(inner, innerLimit(end.width, end.thickness))) };
}

/** 断面の見本を選ぶ。寸法を人が決めていなければ、その見本のはじめの寸法にする。resetSize：寸法と内側の丸みも、はじめに戻す */
export function pickSection(b: Band, kind: PresetKind, e: BandEndName = "top", o: { resetSize?: boolean } = {}): Band {
  const first = GUIDES.band.sectionSizes[kind];
  const cur = endOf(b, e);
  const wasRound = kindOf(b, e) === "maru";
  const useFirst = o.resetSize || !b.dimsSet;
  let end: BandEnd = useFirst ? { width: first.widthMm, thickness: first.thicknessMm, inner: cur.inner } : cur;
  if (kind === "maru") end = roundWire(useFirst ? first.widthMm : cur.width);
  else if (wasRound || o.resetSize) end = { width: end.width, thickness: end.thickness };
  end = fitInner(end);
  const next: Band = o.resetSize ? { ...b, dimsSet: e === "top" && !b.split ? false : b.dimsSet } : b;
  if (!b.split || e === "top") return withEnds({ ...next, kind, curve: undefined, ...(b.split ? {} : { bottomKind: undefined, bottomCurve: undefined }) }, e, end);
  return withEnds({ ...next, bottomKind: kind, bottomCurve: undefined }, e, end);
}

/** 幅・厚みを変える（丸線は幅と厚みをいっしょに） */
export function setSize(b: Band, e: BandEndName, v: { width?: number; thickness?: number }): Band {
  const cur = endOf(b, e);
  const d = v.width ?? v.thickness;
  const end = kindOf(b, e) === "maru" && d !== undefined ? roundWire(d) : fitInner({ ...cur, ...v });
  return withEnds({ ...b, dimsSet: true }, e, end);
}

/** 内甲丸の丸みの深さを変える（0 で内側は平ら） */
export function setInner(b: Band, e: BandEndName, mm: number): Band {
  return withEnds(b, e, fitInner({ ...endOf(b, e), inner: mm }));
}

/** 手で描いた断面にする（thicknessMm は外の線の高さ。内側の丸みを足した値が厚み） */
export function drawSection(b: Band, e: BandEndName, s: { curve: SectionCurve; widthMm: number; thicknessMm: number }): Band {
  const inner = endOf(b, e).inner ?? 0;
  const end = fitInner({ width: round2(s.widthMm), thickness: round2(s.thicknessMm + inner), inner });
  // 元に戻すなどで見本と同じ形になったら、見本の名前に戻す（甲丸と丸線、平打ちと角は線が同じなので、寸法で見分ける）
  const square = Math.abs(end.width - end.thickness) < 0.011;
  const same = matchPreset(s.curve, end.width, end.thickness - (end.inner ?? 0));
  const k: SectionKind = same === "kouman" && square && Math.abs((end.inner ?? 0) - end.width / 2) < 0.011 ? "maru" : same === "hirauchi" && square ? "kaku" : (same ?? "free");
  const curve = k === "free" ? s.curve : undefined;
  if (!b.split || e === "top") return withEnds({ ...b, kind: k, curve, dimsSet: true, ...(b.split ? {} : { bottomKind: undefined, bottomCurve: undefined }) }, e, end);
  return withEnds({ ...b, bottomKind: k, bottomCurve: curve, dimsSet: true }, e, end);
}

/** 上と下で変えるか。変えない方に戻すときは、下を上にそろえる */
export function setSplit(b: Band, on: boolean): Band {
  if (on === !!b.split) return b;
  if (on) return { ...b, split: true, bottom: { ...b.top }, bottomKind: b.kind, bottomCurve: b.curve };
  return { ...b, split: false, bottom: { ...b.top }, bottomKind: undefined, bottomCurve: undefined };
}

// ---- 名前と数字の行 ----

/** 断面の名前（内甲丸があれば添える）。上と下で変えていれば、両方 */
export function sectionWord(b: Band): string {
  const one = (e: BandEndName) => {
    const k = kindOf(b, e);
    return `${SECTION_LABEL[k]}${k !== "maru" && (endOf(b, e).inner ?? 0) > 0 ? "（内甲丸）" : ""}`;
  };
  const t = one("top");
  const u = one("bottom");
  return b.split && t !== u ? `上 ${t}・下 ${u}` : t;
}

const size = (e: BandEnd) => `${e.width} × ${e.thickness} mm`;
/** 幅 × 厚み の言葉（上と下で変えていれば両方） */
export const sizeWord = (b: Band): string => (sameSize(b) ? size(b.top) : `上 ${size(b.top)} ・ 下 ${size(b.bottom)}`);
/** ひと周り同じ丸線か（太さで言う） */
const allRound = (b: Band) => kindOf(b, "top") === "maru" && kindOf(b, "bottom") === "maru" && sameSize(b);

/** 画面・印刷・記録に出す数字の行 */
export function bandSpecRows(b: Band, weightG: number): { label: string; value: string }[] {
  return [
    { label: "断面", value: sectionWord(b) },
    { label: "号", value: `${b.gou} 号 ・ 内径 ${bandInnerDiameter(b.gou).toFixed(1)} mm` },
    ...(allRound(b) ? [{ label: "線の太さ", value: `ø ${b.top.width} mm` }] : sameSize(b) ? [{ label: "幅 × 厚み", value: size(b.top) }] : [{ label: "上（見える側）", value: size(b.top) }, { label: "下（手のひら側）", value: size(b.bottom) }]),
    ...innerRows(b),
    { label: "地金", value: `${b.metalLabel} ・ 約 ${weightG.toFixed(1)} g` },
  ];
}

/** 内側の丸みの行（丸線は断面そのものなので出さない） */
function innerRows(b: Band): { label: string; value: string }[] {
  const t = kindOf(b, "top") === "maru" ? 0 : (b.top.inner ?? 0);
  const u = kindOf(b, "bottom") === "maru" ? 0 : (b.bottom.inner ?? 0);
  if (!t && !u) return [];
  return [{ label: "内側の丸み", value: t === u ? `${t} mm` : `上 ${t} mm ・ 下 ${u} mm` }];
}

// ---- 作れるかの判定 ----

export interface BandProblem {
  /** 確かめの種類（帳面の決まりと、手で変える欄に結びつける） */
  check: "band-thin" | "band-narrow" | "band-spike" | "band-valley";
  title: string;
  current: string;
  required: string;
  why: string;
  /** editor：自動では直さず、断面を描く画面を見せる（とがりは形の好みに深くかかわる） */
  fix: { label: string; apply: (b: Band) => Band; editor?: boolean };
}

/** 作れるかの判定（目安）。guides は今の帳面の目安（職人の決まりをふくむ） */
export function checkBand(b: Band, guides: Guides = GUIDES): BandProblem[] {
  const g = guides.band;
  const out: BandProblem[] = [];
  /** 両側の幅か厚みを、目安まで上げる（丸線は幅と厚みをいっしょに） */
  const raise = (x: Band, key: "width" | "thickness", min: number): Band => {
    const up = (e: BandEndName): BandEnd => {
      const cur = endOf(x, e);
      if (cur[key] >= min) return cur;
      return kindOf(x, e) === "maru" ? roundWire(min) : fitInner({ ...cur, [key]: min });
    };
    return { ...x, dimsSet: true, top: up("top"), bottom: up("bottom") };
  };
  const thin = Math.min(b.top.thickness, b.bottom.thickness);
  if (thin < g.minThicknessMm) {
    out.push({
      check: "band-thin",
      title: "腕が薄い",
      current: `${thin.toFixed(2)} mm`,
      required: `${g.minThicknessMm} mm 以上`,
      why: "仕上げで最大 0.2 mm 削れる。薄い腕は曲がりやすく、やわらかい金ではとくに弱い。",
      fix: { label: "厚くする", apply: (x) => raise(x, "thickness", g.minThicknessMm) },
    });
  }
  const narrow = Math.min(b.top.width, b.bottom.width);
  if (narrow < g.minWidthMm) {
    out.push({
      check: "band-narrow",
      title: "幅が細い",
      current: `${narrow.toFixed(2)} mm`,
      required: `${g.minWidthMm} mm 以上`,
      why: "細い腕は曲がって丸くなくなる。",
      fix: { label: "幅を広げる", apply: (x) => raise(x, "width", g.minWidthMm) },
    });
  }
  const both = b.split || !sameSize(b);
  const ends: BandEndName[] = both ? ["top", "bottom"] : ["top"];
  const whereOf = (e: BandEndName) => (both ? (e === "top" ? "上の" : "下の") : "");
  // 溝やくぼみの底（両側より薄い所）
  for (const e of ends) {
    const v = valleyOf(specOf(b, e));
    if (!v || v.thicknessMm >= g.valleyMinMm - 1e-9) continue;
    out.push({
      check: "band-valley",
      title: `${whereOf(e)}溝やくぼみの底が薄い`,
      current: `${v.thicknessMm.toFixed(2)} mm`,
      required: `${g.valleyMinMm} mm 以上（仮の目安）`,
      why: `溝やくぼみの底は、腕のいちばん薄い所。ここから曲がりやすい。資料の「1 mm より薄いと持ちが悪い」を借りた仮の目安（${GUIDE_NOTE}）`,
      fix: {
        label: "厚くする",
        apply: (x) => {
          const cur = endOf(x, e);
          const add = g.valleyMinMm - v.thicknessMm;
          return setSize(x, e, { thickness: round2(cur.thickness + add + 0.02) });
        },
      },
    });
  }
  // とがった先や薄いヒレ（腕ぜんぶではなく、その所だけ）
  for (const e of ends) {
    const spots = sectionSpots(thinOutline(specOf(b, e)), guides);
    if (!spots.length) continue;
    const sp = spots[0];
    const tip = sp.kind === "tip" || sp.angleDeg < g.spike.minTipAngleDeg;
    out.push({
      check: "band-spike",
      title: `${whereOf(e)}断面が尖りすぎ${spots.length > 1 ? `（${spots.length} か所）` : ""}`,
      current: tip ? `先の角度 ${sp.angleDeg.toFixed(0)}° ・ 厚み ${sp.thicknessMm.toFixed(2)} mm` : `厚み ${sp.thicknessMm.toFixed(2)} mm`,
      required: tip ? `先の角度 ${g.spike.minTipAngleDeg}° 以上（仮の目安）` : `${g.spike.minLocalMm} mm 以上（仮の目安）`,
      why: `${SPIKE_TEXT}。腕ぜんぶではなく、この所だけが薄い（${GUIDE_NOTE}）`,
      fix: { label: "断面を描き直す", apply: (x) => x, editor: true },
    });
  }
  return out;
}

/** とがった先や薄いヒレの場所（ひと周り同じ断面のとき。3D に赤い線を回す。上と下で変えているときは、断面を描く画面だけで示す） */
export function thinSpotsOf(b: Band, guides: Guides = GUIDES): ThinSpot[] {
  return b.split ? [] : sectionSpots(thinOutline(specOf(b, "top")), guides);
}

const mm = (v: number, d = 1) => `${v.toFixed(d)} mm`;

/** 線のままでは出ない形を、どう作るか（手で作るとき。言葉だけで、数字は形から） */
function carveWords(b: Band): string[] {
  const words: string[] = [];
  const ends: BandEndName[] = b.split ? ["top", "bottom"] : ["top"];
  for (const e of ends) {
    const k = kindOf(b, e);
    const lead = b.split ? (e === "top" ? "上：" : "下：") : "";
    if (k === "free") words.push(`${lead}図面の断面に合わせて、ヤスリで削り出す`);
    else {
      const c = sectionInfo(k).carve;
      if (c) words.push(`${lead}${c}`);
    }
  }
  return words;
}

/** 作り方（手作り・鋳造）。数字は形から計算した目安 */
export function bandHowTo(b: Band, method: "hand" | "cast", weightG: number, alloy?: AlloyId | null): Step[] {
  const id = bandInnerDiameter(b.gou);
  const t = Math.max(b.top.thickness, b.bottom.thickness);
  const w = Math.max(b.top.width, b.bottom.width);
  const length = (id + t) * Math.PI;
  const taper = !sameSize(b);
  const twoKinds = kindOf(b, "top") !== kindOf(b, "bottom");
  const inner = [b.top, b.bottom].some((e, i) => (e.inner ?? 0) > 0 && kindOf(b, i ? "bottom" : "top") !== "maru");
  const carve = carveWords(b);
  const finish = finishStep([{ label: "地金", value: `${b.metalLabel} ・ 約 ${weightG.toFixed(1)} g` }], "角を整え、ヤスリの跡を消して、全体を磨く。");
  const sizes = sameSize(b) ? `${b.top.width}×${b.top.thickness}` : `上 ${b.top.width}×${b.top.thickness} ・ 下 ${b.bottom.width}×${b.bottom.thickness}`;
  const shapeWords = [
    ...carve.map((c) => `${c}。`),
    ...(taper ? ["手のひら側を細く・薄く削り、上から下へなめらかにつなぐ。"] : []),
    ...(twoKinds ? ["上と下で断面を変え、その間をなめらかにつなぐ。"] : []),
    ...(inner ? ["内側の角を削って、丸みを付ける（内甲丸）。"] : []),
  ];
  const shape: Step[] = shapeWords.length
    ? [{ id: "shape", title: "形を整える", text: shapeWords.join(""), specs: [...(sameSize(b) ? [{ label: "幅 × 厚み", value: size(b.top) }] : [{ label: "上", value: size(b.top) }, { label: "下", value: size(b.bottom) }]), { label: "断面", value: sectionWord(b) }, ...innerRows(b)] }]
    : [];
  if (method === "cast") {
    return [
      ...castSteps({
        modelSpecs: [{ label: "号", value: `${b.gou} 号（内径 ${mm(id)}）` }, { label: "断面", value: `${sectionWord(b)} ・ ${sizes} mm` }, ...innerRows(b)],
        sprueAt: "腕の下（手のひら側）",
        metalLabel: b.metalLabel,
        weightG,
        alloy: alloy ?? null,
        innerMm: id,
        gou: b.gou,
      }),
      finish,
    ];
  }
  const k = kindOf(b, "top");
  const wire = k === "free" || kindOf(b, "bottom") !== k ? "平角線" : sectionInfo(k).wire;
  return [
    ...forgeSteps({
      materialText: taper || carve.length ? "いちばん太い所の寸法の線を用意する。細くする所や断面の形は、あとで削る。" : "断面の寸法の線を用意する。",
      materialSpecs: [
        { label: "号", value: `${b.gou} 号（内径 ${mm(id)}）` },
        { label: "線", value: allRound(b) ? `丸線 ø ${mm(w)}` : `${wire} ${mm(w)} × ${mm(t)}` },
        { label: "長さ", value: `約 ${mm(length)}` },
      ],
      alloy: alloy ?? null,
      innerMm: id,
      gou: b.gou,
    }),
    ...shape,
    finish,
  ];
}

// ---- Claude が言葉から地金のみの指輪を決める道具 ----

const PRESET_IDS = SECTION_LIST.map((s) => s.id);
const SECTION_WORDS = SECTION_LIST.map((s) => `${s.id}＝${s.label}（${s.plain}）`).join("、");
const METALS = ["k18yg", "pt900", "k18wg", "k18pg", "sv925"] as const;

export const MAKE_BAND: ClaudeTool = {
  name: "make_band",
  description: "言葉の希望から、地金のみの指輪の断面と大きさを決めて、画面に出す。必ず 1 回だけ呼ぶ。数は mm。",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      section: { type: "string", enum: PRESET_IDS, description: SECTION_WORDS },
      bottom_section: { type: "string", enum: PRESET_IDS, description: "下（手のひら側）の断面。ひと周り同じなら section と同じ" },
      top_width_mm: { type: "number", description: "上（見える側）の幅（mm）" },
      top_thickness_mm: { type: "number", description: "上の厚み（mm）" },
      bottom_width_mm: { type: "number", description: "下（手のひら側）の幅（mm）。同じ太さなら上と同じ" },
      bottom_thickness_mm: { type: "number", description: "下の厚み（mm）" },
      inner_mm: { type: "number", description: "内甲丸（内側の角を丸めて、着け心地をよくする）の丸みの深さ（mm）。内側が平らなら 0。丸線では使わない" },
      gou: { type: "number", description: "号（頼みの文に書いた号）" },
      metal: { type: "string", enum: [...METALS], description: "地金" },
      reason: { type: "string", description: "そう決めた理由（1〜2 文、やさしい日本語）" },
      cannot_do: { type: "string", description: "希望のうち、この道具では表せないこと（模様・彫り・石 など）。正直に短く。すべて表せたときは空の文字" },
    },
    required: ["section", "bottom_section", "top_width_mm", "top_thickness_mm", "bottom_width_mm", "bottom_thickness_mm", "inner_mm", "gou", "metal", "reason", "cannot_do"],
    additionalProperties: false,
  },
};

export interface BandDraft {
  kind: PresetKind;
  bottomKind: PresetKind;
  top: BandEnd;
  bottom: BandEnd;
  gou: number;
  metal: (typeof METALS)[number];
  reason: string;
  cannotDo: string;
}

const inRange = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function parseBand(input: unknown): { ok: true; value: BandDraft } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "入力の形が正しくありません" };
  const r = input as Record<string, unknown>;
  const kind = PRESET_IDS.find((k) => k === r.section);
  if (!kind) return { ok: false, error: `section は ${PRESET_IDS.join(" / ")} のどれかです` };
  const metal = METALS.find((m) => m === r.metal) ?? "k18yg";
  const tw = inRange(r.top_width_mm, 1, 15, 4);
  const tt = inRange(r.top_thickness_mm, 0.6, 4, 1.6);
  const inner = inRange(r.inner_mm, 0, 2, 0);
  const end = (width: number, thickness: number): BandEnd => (inner > 0 ? { width, thickness, inner: Math.min(inner, innerLimit(width, thickness)) } : { width, thickness });
  return {
    ok: true,
    value: {
      kind,
      bottomKind: PRESET_IDS.find((k) => k === r.bottom_section) ?? kind,
      top: end(tw, tt),
      bottom: end(inRange(r.bottom_width_mm, 1, 15, tw), inRange(r.bottom_thickness_mm, 0.6, 4, tt)),
      gou: Math.round(inRange(r.gou, 3, 30, 12)),
      metal,
      reason: typeof r.reason === "string" ? r.reason.trim() : "",
      cannotDo: typeof r.cannot_do === "string" ? r.cannot_do.trim() : "",
    },
  };
}

/** Claude の答えを、設計にする（丸線は幅と厚みをそろえる） */
export function applyDraft(b: Band, d: BandDraft): Band {
  const fix = (k: PresetKind, e: BandEnd): BandEnd => (k === "maru" ? roundWire(e.width) : e);
  const top = fix(d.kind, d.top);
  const bottom = fix(d.bottomKind, d.bottom);
  const split = d.bottomKind !== d.kind || top.width !== bottom.width || top.thickness !== bottom.thickness;
  return { ...b, kind: d.kind, curve: undefined, top, bottom, split, bottomKind: split ? d.bottomKind : undefined, bottomCurve: undefined, gou: d.gou, dimsSet: true };
}

export function bandPrompt(): string {
  return `あなたは「継ぐ」の中で、言葉の希望から、地金のみの指輪を決める係です。make_band を 1 回だけ呼びます。
- 希望に書かれたこと（太さ・形・地金・使い方）を先に守り、書かれていないことは、ふつうの値にします（幅 3〜5 mm、厚み 1.5〜1.8 mm、K18 イエロー）。
- 号は人が欄で選びます。頼みの文に書いた号を gou にそのまま書きます。希望に別の号が書かれていても変えず、cannot_do に書きます。
- 華奢・細め・存在感・太め・手のひら側を細く、のような言い方は、幅と厚み、上と下の太さの差で表します。着け心地を言われたら、内甲丸（inner_mm）を考えます。
- この道具で変えられるのは、断面の形（上と下で変えられる）と、上と下の幅・厚み、内甲丸の丸み、地金だけです。模様・彫り・石・ねじり などは表せないので、cannot_do に正直に書きます。表せなかったのに「ご希望どおり」とは書きません。
- 厚みや幅が細すぎて作りにくい値は選びません（いちばん厚い所 ${GUIDES.band.minThicknessMm} mm 以上、幅 ${GUIDES.band.minWidthMm} mm 以上が目安）。
- reason はやさしい日本語で 1〜2 文。Markdown の記号は使いません。`;
}
