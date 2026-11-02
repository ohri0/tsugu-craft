// 目安帳：職人の決まりを、名前・日付・理由つきでためる所。
// 出発点は公開情報レベルの目安（guides.ts）。職人が聞き取りや手で決まりを足すと、
// 同じ値に結びついた古い決まりを置き換え、確かめ（checks.ts）はその値で動く。
// 機械で確かめられない決まり（言葉だけの決まり）も残し、Claude が読んで判断に使う。
import type { CheckId } from "./checks";
import { GUIDES, type Guides } from "./guides";

/** 決まりの出どころ */
export type RuleSource =
  | { kind: "craftsman"; name: string }
  | { kind: "public"; title: string; url?: string }
  | { kind: "provisional" };

/** 機械で確かめる値のうち、目安帳で上書きできるもの */
export const PARAMS = {
  "height.minFingerGapMm": { label: "石の一番下と指のすき間（最低）", unit: "mm", checks: ["finger-gap"] },
  "prong.cornerReachMm": { label: "尖った角から爪までの距離（最大）", unit: "mm", checks: ["corner"] },
  "prong.maxGapRatio": { label: "爪と爪の間のいちばん広い所 ÷ 縁の周（最大）", unit: "", checks: ["prong-gap"] },
  "bezel.wallMinMm": { label: "覆輪の壁の厚み（最低）", unit: "mm", checks: ["bezel-wall"] },
  "hold.requiredTop": { label: "必要な留まり（石が上）", unit: "×", checks: ["hold"] },
  "hold.requiredSide": { label: "必要な留まり（石が横）", unit: "×", checks: ["hold"] },
  "hold.requiredPalm": { label: "必要な留まり（手のひら側寄り）", unit: "×", checks: ["hold"] },
} as const satisfies Record<string, { label: string; unit: string; checks: readonly CheckId[] }>;

export type ParamId = keyof typeof PARAMS;

export interface Rule {
  id: string;
  /** 短い名前 */
  title: string;
  /** 決まりの言葉（ふつうの日本語） */
  text: string;
  /** なぜそうするか */
  reason: string;
  /** 例（あれば） */
  example?: string;
  /** 職人の言葉そのまま（聞き取りで残したもの） */
  quote?: string;
  /** 機械で確かめる値に結びつくとき */
  param?: ParamId;
  value?: number;
  /** どの確かめの根拠か */
  checks?: CheckId[];
  source: RuleSource;
  /** YYYY-MM-DD */
  date: string;
  /** 置き換えた決まりの id */
  replaces?: string;
}

export interface Ledger {
  /** 何の工芸の目安帳か */
  craft: string;
  /** 足した順。置き換えられた決まりも履歴として残す */
  rules: Rule[];
}

const SKYJEMS = { kind: "public", title: "Prong wire（Skyjems）", url: "https://skyjems.ca/pages/encyclopedia-prong-wire" } as const;
const GIA = { kind: "public", title: "GIA ベンチティップ", url: "https://www.gia.edu/jp/bench-tip-avoid-stone-loss-with-quality-assurance-benchmarks" } as const;
const TEXTBOOK = { kind: "public", title: "教科書・公開情報レベルの目安" } as const;
const START = "2026-11-02";

/** 出発点の目安帳（値は guides.ts から読み、ここに数字を書かない） */
export function seedLedger(): Ledger {
  const g = GUIDES;
  return {
    craft: "ジュエリー（一粒石の指輪）",
    rules: [
      {
        id: "finger-gap",
        title: "石の先を指から離す",
        text: `石の一番下（キューレット）は、指から ${g.height.minFingerGapMm} mm 以上離す`,
        reason: "石の先が指に当たると痛く、石も欠けやすい",
        param: "height.minFingerGapMm",
        value: g.height.minFingerGapMm,
        checks: ["finger-gap"],
        source: TEXTBOOK,
        date: START,
      },
      {
        id: "prong-thickness",
        title: "爪の太さ",
        text: `爪の最低の太さ ＝ ${g.prong.minBase} ＋ ${g.prong.perMm} ×（石の大きさ − ${g.prong.sizeOffset}）mm。1 カラットで 1.0〜1.3 mm`,
        reason: "細い爪は曲がりやすく、石が抜ける",
        checks: ["prong-thin"],
        source: SKYJEMS,
        date: START,
      },
      {
        id: "tip-height",
        title: "爪の先の高さ",
        text: `爪の先は、石の上面までの高さの ${pct(g.prong.tipHeightRatio[0])}〜${pct(g.prong.tipHeightRatio[1])}。上側にかかる長さは ${pct(g.prong.crownOverlapRatio[0])}〜${pct(g.prong.crownOverlapRatio[1])}`,
        reason: "低いと石を押さえられず、高いと引っかかる",
        checks: ["tip-height"],
        source: GIA,
        date: START,
      },
      {
        id: "corner-reach",
        title: "尖った角を守る",
        text: `尖った角から ${g.prong.cornerReachMm} mm 以内に爪を置く（角は V 字の爪で包む）`,
        reason: "角の先は欠けやすい",
        param: "prong.cornerReachMm",
        value: g.prong.cornerReachMm,
        checks: ["corner"],
        source: TEXTBOOK,
        date: START,
      },
      {
        id: "prong-gap",
        title: "爪の間隔",
        text: `爪と爪の間のいちばん広い所は、縁の周の ${pct(g.prong.maxGapRatio)} 以下`,
        reason: "広いと石が傾いて抜けやすい",
        param: "prong.maxGapRatio",
        value: g.prong.maxGapRatio,
        checks: ["prong-gap"],
        source: TEXTBOOK,
        date: START,
      },
      {
        id: "hold-top",
        title: "石の留まり（石が上）",
        text: `標準の 4 本爪を 1.0× として、${g.hold.requiredTop}× 以上`,
        reason: "物に当たったときに石が抜けないため",
        param: "hold.requiredTop",
        value: g.hold.requiredTop,
        checks: ["hold"],
        source: { kind: "provisional" },
        date: START,
      },
      {
        id: "bezel-wall",
        title: "覆輪の壁の厚み",
        text: `覆輪の壁は ${g.bezel.wallMm} mm、${g.bezel.wallMinMm} mm 未満は薄い`,
        reason: "薄い壁は欠けたり曲がったりする",
        param: "bezel.wallMinMm",
        value: g.bezel.wallMinMm,
        checks: ["bezel-wall"],
        source: TEXTBOOK,
        date: START,
      },
    ],
  };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** 置き換えられていない決まり */
export function activeRules(ledger: Ledger): Rule[] {
  const replaced = new Set(ledger.rules.flatMap((r) => (r.replaces ? [r.replaces] : [])));
  return ledger.rules.filter((r) => !replaced.has(r.id));
}

/** 決まりを足す。同じ値に結びついた今の決まりがあれば、それを置き換える（古い決まりは履歴に残る） */
export function addRule(ledger: Ledger, rule: Omit<Rule, "id" | "replaces"> & { id?: string }): Ledger {
  const current = rule.param ? activeRules(ledger).find((r) => r.param === rule.param) : undefined;
  const id = uniqueId(ledger, rule.id ?? slug(rule.title));
  const checks = rule.checks ?? (rule.param ? [...PARAMS[rule.param].checks] : undefined);
  const added: Rule = { ...rule, id, checks, ...(current ? { replaces: current.id } : {}) };
  return { ...ledger, rules: [...ledger.rules, added] };
}

/** 決まりを外す（最後に足した決まりだけ。置き換えた決まりは元に戻る） */
export function removeLastRule(ledger: Ledger): Ledger {
  return { ...ledger, rules: ledger.rules.slice(0, -1) };
}

/** 目安帳の値を当てはめた目安（確かめに渡す） */
export function effectiveGuides(ledger: Ledger): Guides {
  const g = structuredClone(GUIDES) as unknown as Record<string, Record<string, number>>;
  for (const r of activeRules(ledger)) {
    if (!r.param || r.value === undefined || !Number.isFinite(r.value)) continue;
    const [group, key] = r.param.split(".");
    g[group][key] = r.value;
  }
  return g as unknown as Guides;
}

/** その確かめの根拠になっている決まり（職人の決まりを先に） */
export function ruleForCheck(ledger: Ledger, check: CheckId): Rule | undefined {
  const rules = activeRules(ledger).filter((r) => r.checks?.includes(check));
  return rules.find((r) => r.source.kind === "craftsman") ?? rules[rules.length - 1];
}

/** 出どころを一言で */
export function sourceLabel(s: RuleSource): string {
  if (s.kind === "craftsman") return `職人：${s.name}`;
  if (s.kind === "public") return `公開情報：${s.title}`;
  return "仮の目安";
}

/** Claude に渡す、目安帳の文章 */
export function ledgerText(ledger: Ledger): string {
  return activeRules(ledger)
    .map((r) => `- [${r.id}] ${r.title}：${r.text}（理由：${r.reason}${r.example ? `／例：${r.example}` : ""}${r.quote ? `／職人の言葉：「${r.quote}」` : ""}／出どころ：${sourceLabel(r.source)}、${r.date}）`)
    .join("\n");
}

function slug(title: string): string {
  return `rule-${[...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;
}

function uniqueId(ledger: Ledger, base: string): string {
  const ids = new Set(ledger.rules.map((r) => r.id));
  if (!ids.has(base)) return base;
  let i = 2;
  while (ids.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
