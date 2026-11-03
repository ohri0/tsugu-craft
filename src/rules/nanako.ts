// 魚々子（ななこ）の目安帳と、小さな図の確かめ。
// 魚々子は彫金の技の一つ：先が小さな輪になった鏨（たがね）を金属の面に打ちこみ、小さな丸い粒をすきまなく並べる。
// 決まりは research/process/nanako.md に書いた公開の資料からだけ入れる。原文で確かめていないので、どれも「未確認」。
// 資料に数字がない所（板の厚み・粒のすき間）は、決まりを作らない。そこは「まだ決まっていない所」として職人に聞く（gaps.ts）。
import { activeRules, type Ledger, type Rule } from "./ledger.js";

/** 魚々子で、機械で確かめる値 */
export const NANAKO_PARAMS = {
  "plate.minThicknessMm": { label: "板の厚み（最低）", unit: "mm" },
  "grain.gapMinMm": { label: "となりの粒とのすき間（最低）", unit: "mm" },
  "grain.gapMaxMm": { label: "となりの粒とのすき間（最大）", unit: "mm" },
  "strike.maxOffsetMm": { label: "打つ位置のずれ（最大）", unit: "mm" },
} as const satisfies Record<string, { label: string; unit: string }>;

export type NanakoParam = keyof typeof NANAKO_PARAMS;
export type NanakoRule = Rule<NanakoParam>;
export type NanakoLedger = Ledger<NanakoParam>;

export const NANAKO_TECHNIQUE = "nanako";

/** 粒を重ねずに並べる決まり（魚子地）。値ではなく、図の形で確かめる */
export const NO_OVERLAP_RULE = "nanako-no-overlap";

// 出どころ（research/process/nanako.md と同じ URL。会社・工房の名前は書かず、どんな資料かだけ書く）
const KAISETSU_980 = { kind: "public", title: "彫金の解説記事（番手と打ち方）", url: "https://choukinyorozu.com/imulta102-980.html" } as const;
const KAISETSU_973 = { kind: "public", title: "彫金の解説記事（振り下ろさない打ち方）", url: "https://choukinyorozu.com/imulta101-973.html" } as const;
const SHUZAI = { kind: "public", title: "職人への取材記事", url: "https://www.harima.co.jp/hq/legendary_technology/150/page3.html" } as const;
const KOBO = { kind: "public", title: "工房の解説（鏨の手入れ）", url: "https://kazari-nou.com/tecnic-tool%E3%80%80/" } as const;
const BLOG = { kind: "public", title: "職人のブログ（一次資料ではない）", url: "https://note.com/katana_case_shi/n/n13aa1a3d6963" } as const;
const TSUKURITE = { kind: "public", title: "作り手の解説", url: "https://www.niwaka.com/wabori/technique/nanakoji_01.html" } as const;
const SEARCHED = "2026-11-02";

/** 出発点の魚々子の帳面。どれも検索結果の要約にもとづくので unverified（未確認） */
export function seedNanakoLedger(): NanakoLedger {
  const r = (x: Omit<NanakoRule, "date" | "unverified">): NanakoRule => ({ ...x, date: SEARCHED, unverified: true });
  return {
    craft: "彫金・魚々子（ななこ）",
    technique: NANAKO_TECHNIQUE,
    rules: [
      r({
        id: "nanako-vertical",
        title: "鏨はまっすぐ立てて打つ",
        text: "鏨（たがね）を面に垂直に立てて、金づちで打つ",
        reason: "まっすぐ叩かないと、粒の形がそろわない",
        source: KAISETSU_980,
      }),
      r({
        id: "nanako-drop",
        title: "振り下ろさずに落とす",
        text: "金づちを鏨のお尻に置いて持ち上げ、落とすように打つ",
        reason: "位置がぶれにくく、疲れにくい",
        source: KAISETSU_973,
      }),
      r({
        id: NO_OVERLAP_RULE,
        title: "魚子地は粒を重ねない",
        text: "魚子地（ななこじ）では、となりの粒と輪が重ならないように並べる。重ねて打つのは「荒らし」という別の打ち方",
        reason: "魚子地は粒を重ねずに並べる打ち方（仏具や建物の飾りに多い）",
        source: KAISETSU_980,
      }),
      r({
        id: "nanako-spacing",
        title: "間かくが遠いと島、近いと崩れ",
        text: "粒の間かくが遠いと、打っていない「島」が残る。近すぎると粒がくずれる。何 mm からかは資料にない",
        reason: "粒を均等に並べ、打ちこんだ跡を目立たせない所に腕が出る",
        source: BLOG,
      }),
      r({
        id: "nanako-thin-plate",
        title: "うすい板に粗い鏨は穴があく",
        text: "うすい板に粗い番手の鏨で打つと、穴があく。厚みに合わせて力を加減する。何 mm からかは資料にない",
        reason: "鏨の先が板を突き抜ける",
        source: KAISETSU_980,
      }),
      r({
        id: "nanako-precision",
        title: "打つ位置のずれは 0.1 mm まで",
        text: "打つ位置は 0.1 mm 以下の精度で。少しでもずれると、そのあとの粒がすべて合わなくなる",
        reason: "粒は前の粒に合わせて並べるので、ずれが後ろへ広がる",
        quote: "0.1 ミリ以下の精度で打たなくてはならない",
        param: "strike.maxOffsetMm",
        value: 0.1,
        source: SHUZAI,
      }),
      r({
        id: "nanako-even",
        title: "粒を均等に、跡を目立たせない",
        text: "粟粒（あわつぶ）を均等に並べ、打ちこんだ跡（鏨のふち）を目立たせない",
        reason: "そこに職人の腕が出る",
        source: TSUKURITE,
      }),
      r({
        id: "nanako-sharpen",
        title: "鏨はすぐ研ぐ",
        text: "鏨の先は少し使うとすぐ傷むので、そのたびに研ぐ",
        reason: "研がないと粒の形がくずれる",
        source: KOBO,
      }),
    ],
  };
}

/** 帳面の中の、その値の今の決まり */
export function nanakoRuleFor(ledger: NanakoLedger, param: NanakoParam): NanakoRule | undefined {
  return activeRules(ledger).find((r) => r.param === param && r.value !== undefined);
}

// ---- 小さな図 ----

/** 図の形。数字は試しに動かすための値で、目安ではない */
export interface NanakoDesign {
  /** 粒（鏨の先の丸）の直径 mm */
  grainMm: number;
  /** となりの粒の中心と中心の間 mm */
  pitchMm: number;
  /** 列の数 */
  rows: number;
  /** 1 列の粒の数 */
  cols: number;
  /** 板の厚み mm */
  plateMm: number;
  /** 打つ位置のずれ（いちばん大きいとき）mm。粒ごとに 0〜この値でずれる */
  offsetMm: number;
  /** 魚子地（重ねない）か、荒らし（重ねる） */
  layout: "nanakoji" | "arashi";
}

export interface Grain {
  i: number;
  /** 中心 mm（板の左上から） */
  x: number;
  y: number;
  /** この粒のずれ mm */
  offset: number;
}

/** 0〜1 の、毎回同じになる散らばり（粒の番号から） */
function spread(i: number, salt: number): number {
  let h = (i + 1) * 2654435761 + salt * 40503;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 粒の並び。列は半分ずつずらし（となりの粒の中心の間が、どの向きにも pitch になる並べ方） */
export function grainLayout(d: NanakoDesign): Grain[] {
  const rowStep = (d.pitchMm * Math.sqrt(3)) / 2;
  const margin = d.pitchMm;
  const grains: Grain[] = [];
  let i = 0;
  for (let r = 0; r < d.rows; r++) {
    for (let c = 0; c < d.cols; c++) {
      const offset = d.offsetMm * spread(i, 1);
      const angle = 2 * Math.PI * spread(i, 2);
      grains.push({
        i,
        x: margin + c * d.pitchMm + (r % 2 ? d.pitchMm / 2 : 0) + offset * Math.cos(angle),
        y: margin + r * rowStep + offset * Math.sin(angle),
        offset,
      });
      i++;
    }
  }
  return grains;
}

/** 板の大きさ mm */
export function plateSize(d: NanakoDesign): { w: number; h: number } {
  return { w: d.pitchMm * (d.cols + 1.5), h: d.pitchMm * 2 + ((d.rows - 1) * d.pitchMm * Math.sqrt(3)) / 2 };
}

export type FindingStatus = "ok" | "ng" | "none";

export interface NanakoFinding {
  /** 何を確かめたか */
  key: NanakoParam | typeof NO_OVERLAP_RULE;
  label: string;
  status: FindingStatus;
  /** 今の図の値（言葉） */
  now: string;
  /** 合わないときの言葉 */
  message: string;
  rule?: NanakoRule;
  /** 決まりがないとき：聞き取りのどの所か（gaps.ts の id） */
  gapId?: string;
  /** 合わない粒（全部のときは all） */
  grains?: "all" | number[];
}

export interface NanakoCheck {
  findings: NanakoFinding[];
  /** 赤くする粒の番号 */
  bad: Set<number>;
  /** 板の厚みが合わない */
  plateBad: boolean;
}

const mm = (v: number) => `${Math.round(v * 100) / 100} mm`;

export const nanakoGapId = (param: NanakoParam) => `nanako:${param}`;

/** 図を帳面の決まりで確かめる。決まりがない所は status: none（確かめない） */
export function checkNanako(d: NanakoDesign, ledger: NanakoLedger): NanakoCheck {
  const grains = grainLayout(d);
  const gap = d.pitchMm - d.grainMm;
  const findings: NanakoFinding[] = [];
  const bad = new Set<number>();
  let plateBad = false;
  const rules = activeRules(ledger);

  // 魚子地は重ねない（決まりが帳面にあるときだけ）
  const noOverlap = rules.find((r) => r.id === NO_OVERLAP_RULE || r.replaces === NO_OVERLAP_RULE);
  if (noOverlap && d.layout === "nanakoji") {
    const ng = gap < -1e-9;
    if (ng) grains.forEach((g) => bad.add(g.i));
    findings.push({
      key: NO_OVERLAP_RULE,
      label: "粒を重ねない（魚子地）",
      status: ng ? "ng" : "ok",
      now: ng ? `重なり ${mm(-gap)}` : "重なっていない",
      message: ng ? `粒の直径 ${mm(d.grainMm)} より、中心の間 ${mm(d.pitchMm)} が短く、となりの粒と輪が重なる` : "",
      rule: noOverlap,
      grains: ng ? "all" : undefined,
    });
  }

  const numeric = (param: NanakoParam, label: string, now: number, ngIf: (v: number) => boolean, msg: (v: number) => string) => {
    const rule = nanakoRuleFor(ledger, param);
    if (!rule || rule.value === undefined) {
      findings.push({ key: param, label, status: "none", now: mm(now), message: "まだ決まりがない", gapId: nanakoGapId(param) });
      return false;
    }
    const ng = ngIf(rule.value);
    findings.push({ key: param, label, status: ng ? "ng" : "ok", now: mm(now), message: ng ? msg(rule.value) : "", rule, grains: ng ? "all" : undefined });
    return ng;
  };

  if (numeric("plate.minThicknessMm", "板の厚み", d.plateMm, (v) => d.plateMm < v - 1e-9, (v) => `板が ${mm(d.plateMm)} で、決まりの ${mm(v)} より薄い。打つと穴があく`)) {
    plateBad = true;
    grains.forEach((g) => bad.add(g.i));
  }
  if (numeric("grain.gapMinMm", "粒のすき間（近すぎ）", Math.max(0, gap), (v) => gap < v - 1e-9, (v) => `すき間が ${mm(gap)} で、決まりの ${mm(v)} より近い。粒がくずれる`)) {
    grains.forEach((g) => bad.add(g.i));
  }
  if (numeric("grain.gapMaxMm", "粒のすき間（遠すぎ）", Math.max(0, gap), (v) => gap > v + 1e-9, (v) => `すき間が ${mm(gap)} で、決まりの ${mm(v)} より遠い。打っていない島が残る`)) {
    grains.forEach((g) => bad.add(g.i));
  }

  // 打つ位置のずれは、粒ごとに見る（ずれた粒だけ赤）
  const off = nanakoRuleFor(ledger, "strike.maxOffsetMm");
  if (!off || off.value === undefined) {
    findings.push({ key: "strike.maxOffsetMm", label: "打つ位置のずれ", status: "none", now: mm(d.offsetMm), message: "まだ決まりがない", gapId: nanakoGapId("strike.maxOffsetMm") });
  } else {
    const limit = off.value;
    const over = grains.filter((g) => g.offset > limit + 1e-9).map((g) => g.i);
    over.forEach((i) => bad.add(i));
    findings.push({
      key: "strike.maxOffsetMm",
      label: "打つ位置のずれ",
      status: over.length ? "ng" : "ok",
      now: `いちばん大きい ${mm(d.offsetMm)}`,
      message: over.length ? `${over.length} 粒が、決まりの ${mm(limit)} より大きくずれている` : "",
      rule: off,
      grains: over.length ? over : undefined,
    });
  }
  return { findings, bad, plateBad };
}
