// 目安帳：職人の決まりを、名前・日付・理由つきでためる所。
// 出発点は公開情報レベルの目安（guides.ts）。職人が聞き取りや手で決まりを足すと、
// 同じ値に結びついた古い決まりを置き換え、確かめ（checks.ts）はその値で動く。
// 機械で確かめられない決まり（言葉だけの決まり）も残し、Claude が読んで判断に使う。
import type { CheckId } from "./checks.js";
import { GUIDES, type Guides } from "./guides.js";
import ringPublic from "../../ledger/ring-public.json";

/** 決まりの出どころ */
export type RuleSource =
  | { kind: "craftsman"; name: string }
  | { kind: "public"; title: string; url?: string }
  | { kind: "provisional" };

/** 機械で確かめる値のうち、目安帳で上書きできるもの */
export const PARAMS = {
  "height.minFingerGapMm": { label: "石の一番下と指のすき間（最低）", unit: "mm", checks: ["finger-gap"] },
  "prong.minDiameterMm": { label: "爪の太さ（最低）", unit: "mm", checks: ["prong-thin"] },
  "prong.cornerReachMm": { label: "尖った角から爪までの距離（最大）", unit: "mm", checks: ["corner"] },
  "prong.maxGapRatio": { label: "爪と爪の間のいちばん広い所 ÷ 縁の周（最大）", unit: "", checks: ["prong-gap"] },
  "bezel.wallMinMm": { label: "覆輪の壁の厚み（最低）", unit: "mm", checks: ["bezel-wall"] },
  "hold.requiredTop": { label: "必要な留まり（石が上）", unit: "×", checks: ["hold"] },
  "hold.requiredSide": { label: "必要な留まり（石が横）", unit: "×", checks: ["hold"] },
  "hold.requiredPalm": { label: "必要な留まり（手のひら側寄り）", unit: "×", checks: ["hold"] },
  "band.minThicknessMm": { label: "腕の厚み（最低）", unit: "mm", checks: ["band-thin"] },
  "band.minWidthMm": { label: "腕の幅（最低）", unit: "mm", checks: ["band-narrow"] },
  "hold.cornerSet": { label: "角が 3 つの石を、角に 1 本ずつの爪 3 本で留めたとき 4 本と同じ留まりとみなす（1 ＝ みなす）", unit: "", checks: ["hold"] },
} as const satisfies Record<string, { label: string; unit: string; checks: readonly CheckId[] }>;

export type ParamId = keyof typeof PARAMS;

/**
 * 決まり 1 つ。P は機械で確かめる値の名前（指輪は PARAMS、ほかの技はその技の値の名前）。
 */
export interface Rule<P extends string = ParamId> {
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
  param?: P;
  value?: number;
  /**
   * 石の大きさで値を変えるとき（小さい順）。石の大きさ ＝（長辺 ＋ 幅）÷ 2（mm）。
   * upToMm 以下ならその値。最後の段を超えたら最後の値。value より先に使う。
   */
  bySize?: SizeStep[];
  /**
   * true のとき、bySize を段ではなく「点」として、点の間をまっすぐつなぐ（石の大きさに合わせて割合で変わる）。
   * 最初の点より小さい石・最後の点より大きい石は、端の 2 点の傾きのまま伸ばす。upToMm を点の石の大きさとして読む。
   */
  bySizeLine?: boolean;
  /** bySizeLine の線を伸ばしても、これより小さくしない（下限）。例：爪はメレでも 0.6 mm より細くしない */
  bySizeFloor?: number;
  /** どの確かめの根拠か */
  checks?: CheckId[];
  /** 作り方のどの工程の決まりか（機械で確かめない決まり。src/rules/making.ts の工程の id） */
  steps?: string[];
  source: RuleSource;
  /** YYYY-MM-DD */
  date: string;
  /** 置き換えた決まりの id */
  replaces?: string;
  /** 原文で確かめていない（検索結果の要約などにもとづく）とき true。画面に「未確認」と出す */
  unverified?: boolean;
  /** 聞き取りで、職人にどう聞いて得た決まりか（聞いた言葉そのまま） */
  question?: string;
  /** 聞き取りのどの「まだ決まっていない所」への答えか（src/rules/gaps.ts の id） */
  gap?: string;
}

export interface SizeStep {
  /** この大きさ（mm）まで。最後の段は null（それより大きい石すべて） */
  upToMm: number | null;
  value: number;
}

/** 石の大きさに合う値（段がなければ value） */
export function valueFor(rule: Pick<Rule, "value" | "bySize" | "bySizeLine" | "bySizeFloor">, stoneSizeMm?: number): number | undefined {
  const steps = rule.bySize;
  if (!steps || steps.length === 0 || stoneSizeMm === undefined) return rule.value ?? steps?.[steps.length - 1]?.value;
  if (rule.bySizeLine) {
    const pts = steps.filter((s): s is { upToMm: number; value: number } => s.upToMm !== null).sort((a, b) => a.upToMm - b.upToMm);
    if (pts.length === 1) return pts[0].value;
    if (pts.length >= 2) {
      const i = stoneSizeMm <= pts[0].upToMm ? 0 : stoneSizeMm >= pts[pts.length - 1].upToMm ? pts.length - 2 : pts.findIndex((_p, k) => k < pts.length - 1 && stoneSizeMm <= pts[k + 1].upToMm);
      const a = pts[i];
      const b = pts[i + 1];
      const v = Math.max(rule.bySizeFloor ?? -Infinity, a.value + ((b.value - a.value) * (stoneSizeMm - a.upToMm)) / (b.upToMm - a.upToMm));
      return Math.round(v * 1000) / 1000;
    }
  }
  for (const s of steps) if (s.upToMm === null || stoneSizeMm <= s.upToMm + 1e-9) return s.value;
  return steps[steps.length - 1].value;
}

/** 「4:0.6, 6:0.8, 1.0」→ 段（最後の「:」のない値は、それより大きい石） */
export function parseSizeSteps(text: string): SizeStep[] | undefined {
  const parts = text.split(/[,、，\s]+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  const steps: SizeStep[] = [];
  for (const p of parts) {
    const m = p.match(/^(?:(\d+(?:\.\d+)?)[:：])?(\d+(?:\.\d+)?)$/);
    if (!m) return undefined;
    steps.push({ upToMm: m[1] === undefined ? null : Number(m[1]), value: Number(m[2]) });
  }
  return steps;
}

/** 段を言葉に（例：〜4 mm は 0.6、〜6 mm は 0.8、それより大きいと 1.0） */
export function sizeStepsText(steps: SizeStep[], unit: string): string {
  return steps
    .map((s) => (s.upToMm === null ? `それより大きい石は ${s.value}${unit}` : `石の大きさ ${s.upToMm} mm まで ${s.value}${unit}`))
    .join("、");
}

export interface Ledger<P extends string = ParamId> {
  /** 何の工芸の目安帳か */
  craft: string;
  /** どの技の帳面か（なければ指輪の石留め） */
  technique?: string;
  /** 足した順。置き換えられた決まりも履歴として残す */
  rules: Rule<P>[];
  /** 誰の帳面か（工房ごとの帳面の名前。なければ、決まりをいちばん多く残した職人の名前） */
  owner?: string;
  /** 職人が消した決まりの id（リポジトリの帳面から読み直しても、足し直さない） */
  removed?: string[];
}

const SKYJEMS = { kind: "public", title: "Prong wire（Skyjems）", url: "https://skyjems.ca/pages/encyclopedia-prong-wire" } as const;
const GIA = { kind: "public", title: "GIA ベンチティップ", url: "https://www.gia.edu/jp/bench-tip-avoid-stone-loss-with-quality-assurance-benchmarks" } as const;
/** 地金の会社の CAD の生産の決まり（第三者の写し。中の文を開けて確かめられていないので、使う決まりは未確認） */
const CAD_STD = { kind: "public", title: "地金の会社の CAD の生産の決まり（第三者の写し）", url: "https://cdn.hackaday.io/files/1657037089437152/CADCAMProductionStandards.pdf" } as const;
const PROVISIONAL = { kind: "provisional" } as const;
const START = "2026-11-02";

/**
 * 公開の資料から入れた、指輪の決まり（ledger/ring-public.json。調べは docs/RESEARCH-rules2.md）。
 * 値に結びつく決まり（腕の厚み・幅）は、値を guides.ts から読む（JSON の言葉の数字と同じ値）。
 */
export function publicRingRules(): Rule[] {
  const g = GUIDES;
  return (ringPublic as Rule[]).map((r) => {
    const value = r.param === "band.minThicknessMm" ? g.band.minThicknessMm : r.param === "band.minWidthMm" ? g.band.minWidthMm : undefined;
    return structuredClone({ ...r, ...(value !== undefined ? { value, checks: [...PARAMS[r.param!].checks] } : {}) });
  });
}

/** 出発点の目安帳（値は guides.ts から読み、ここに数字を書かない） */
export function seedLedger(): Ledger {
  const g = GUIDES;
  return {
    craft: "ジュエリー（一粒石の指輪）",
    rules: [
      {
        id: "finger-gap",
        title: "石の先を指から離す",
        text: `石の一番下（キューレット）は、指から ${g.height.minFingerGapMm} mm 以上離す（仮の目安。公開の資料の値は「石の先を指から離す（資料）」を見る）`,
        reason: "石の先が指に当たると痛く、石も欠けやすい",
        param: "height.minFingerGapMm",
        value: g.height.minFingerGapMm,
        checks: ["finger-gap"],
        source: PROVISIONAL,
        date: START,
      },
      {
        id: "prong-thickness",
        title: "爪の太さ",
        text: `爪の最低の太さは石の大きさで変わる：${g.prong.minByStoneSize.map(([s, d]) => `${s} mm の石で ${d} mm`).join("、")}。点の間はまっすぐつなぐ。標準は最低 × ${g.prong.standardFactor}。点はメーカーの CAD 基準・職人のフォーラム・Skyjems から、つなぐ線は仮の目安`,
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
        source: PROVISIONAL,
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
        source: PROVISIONAL,
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
        text: `覆輪の壁は ${g.bezel.wallMm} mm、${g.bezel.wallMinMm} mm 未満は薄い（${g.bezel.wallMm} mm は仮の目安）`,
        reason: "薄い壁は欠けたり曲がったりする",
        param: "bezel.wallMinMm",
        value: g.bezel.wallMinMm,
        checks: ["bezel-wall"],
        source: CAD_STD,
        unverified: true,
        date: START,
      },
      ...publicRingRules(),
    ],
  };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** 置き換えられていない決まり */
export function activeRules<R extends { id: string; replaces?: string }>(ledger: { rules: R[] }): R[] {
  const replaced = new Set(ledger.rules.flatMap((r) => (r.replaces ? [r.replaces] : [])));
  return ledger.rules.filter((r) => !replaced.has(r.id));
}

/** 帳面の決まりの数（入口のページなど。職人の言葉から・それ以外＝資料と仮） */
export function ledgerCounts(ledger: { rules: Pick<Rule, "id" | "replaces" | "source">[] }): { total: number; craftsman: number; others: number } {
  const rules = activeRules(ledger);
  const craftsman = rules.filter((r) => r.source.kind === "craftsman").length;
  return { total: rules.length, craftsman, others: rules.length - craftsman };
}

/** 決まりを足す。同じ値に結びついた今の決まりがあれば、それを置き換える（古い決まりは履歴に残る） */
export function addRule<P extends string = ParamId>(ledger: Ledger<P>, rule: Omit<Rule<P>, "id" | "replaces"> & { id?: string; replaces?: string }): Ledger<P> {
  const current = rule.param ? activeRules(ledger).find((r) => r.param === rule.param) : undefined;
  const id = uniqueId(ledger, rule.id ?? slug(rule.title));
  const known = rule.param && rule.param in PARAMS ? [...PARAMS[rule.param as unknown as ParamId].checks] : undefined;
  const checks = rule.checks ?? known;
  // replaces を明示したとき（値に結びつかない決まりを確かめ直したとき）はそれを使う
  const replaces = rule.replaces ?? current?.id;
  const added: Rule<P> = { ...rule, id, ...(checks ? { checks } : {}), ...(replaces ? { replaces } : {}) };
  return { ...ledger, rules: [...ledger.rules, added] };
}

/**
 * 決まりを消す（まちがえて入れた決まり・いらない資料の決まり）。消した id は removed に残し、読み直しても戻らない。
 * その決まりが前の決まりを置き換えていたなら、前の決まりがまた効く（置き換える前に戻る）。
 */
export function removeRule<P extends string = ParamId>(ledger: Ledger<P>, id: string): Ledger<P> {
  if (!ledger.rules.some((r) => r.id === id)) return ledger;
  return { ...ledger, rules: ledger.rules.filter((r) => r.id !== id), removed: [...new Set([...(ledger.removed ?? []), id])] };
}

/** 決まりを直す（職人が言葉や数字を直す）。id と出どころは変えない。ない決まりなら、そのまま返す */
export function editRule<P extends string = ParamId>(ledger: Ledger<P>, id: string, patch: Partial<Pick<Rule<P>, "title" | "text" | "quote" | "value" | "bySize">>): Ledger<P> {
  if (!ledger.rules.some((r) => r.id === id)) return ledger;
  return { ...ledger, rules: ledger.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

/** 決まりを外す（最後に足した決まりだけ。置き換えた決まりは元に戻る） */
export function removeLastRule<P extends string = ParamId>(ledger: Ledger<P>): Ledger<P> {
  return { ...ledger, rules: ledger.rules.slice(0, -1) };
}

/** 目安帳の値を当てはめた目安（確かめに渡す）。石の大きさで変わる決まりは、その石の大きさの値を使う */
export function effectiveGuides(ledger: Ledger, stoneSizeMm?: number): Guides {
  const g = structuredClone(GUIDES) as unknown as Record<string, Record<string, number>>;
  for (const r of activeRules(ledger)) {
    if (!r.param) continue;
    const v = valueFor(r, stoneSizeMm);
    if (v === undefined || !Number.isFinite(v)) continue;
    const [group, key] = r.param.split(".");
    g[group][key] = v;
  }
  return g as unknown as Guides;
}

/** 爪の最低の太さを目安帳が決めているか（決めていなければ guides.ts の式） */
export function prongMinOverride(g: Guides): number | undefined {
  return (g.prong as { minDiameterMm?: number }).minDiameterMm;
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
    .map((r) => `- [${r.id}] ${r.title}：${r.text}${r.bySize && r.param ? `（石の大きさで：${r.bySizeLine ? `${r.bySize.map((s) => `${s.upToMm} mm で ${s.value} ${PARAMS[r.param!].unit}`).join("、")}。間はまっすぐつなぎ、外は同じ傾きで伸ばす${r.bySizeFloor !== undefined ? `。${r.bySizeFloor} ${PARAMS[r.param!].unit} より小さくしない` : ""}` : sizeStepsText(r.bySize, PARAMS[r.param].unit)}）` : ""}（理由：${r.reason}${r.example ? `／例：${r.example}` : ""}${r.quote ? `／職人の言葉：「${r.quote}」` : ""}／出どころ：${sourceLabel(r.source)}、${r.date}）`)
    .join("\n");
}

function slug(title: string): string {
  return `rule-${[...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;
}

function uniqueId(ledger: { rules: { id: string }[] }, base: string): string {
  const ids = new Set(ledger.rules.map((r) => r.id));
  if (!ids.has(base)) return base;
  let i = 2;
  while (ids.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
