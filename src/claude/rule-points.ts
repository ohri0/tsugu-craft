// Claude の決まりの案（propose_rule）から、職人の点を読む（爪の太さの、石の大きさごとの点。作者の頼み 2026-11-06）。
// 職人の点の数字は、職人の言葉の中の数字か、職人が指した今の設計の数（「この爪で十分」の今の爪の太さ、「このサイズ」の今の石の大きさ）だけ。
// それ以外の数字を職人の点にしない（数字は出典か職人の言葉から）。推測の点は、画面が同じ割合の計算で出し直す（src/rules/prong-points.ts）。
// 画面に依存しない純粋な関数。
import { readNumbers } from "../rules/gaps.js";
import { craftProngPoints, inferFloorMm, mergeCraftPoints, mmText, prongMinAt, prongPointsRule, prongTable, type CraftPoint, type TableRow } from "../rules/prong-points.js";
import { GUIDES, minProngMm } from "../rules/guides.js";
import { SAME_SIZE_MM, valueAtPoints, type Ledger, type Rule } from "../rules/ledger.js";
import type { ProposeRuleInput } from "./tools.js";

/** 職人が見ている今の設計 */
export interface DesignNow {
  /** 石の大きさ（mm） */
  stoneMm: number;
  /** 今の爪の太さ（mm） */
  prongMm?: number;
}

/** 「このサイズ」とみなす、今の石の大きさとの差（mm） */
const THIS_SIZE_MM = 0.6;

/** 爪の太さの決まりで、石の大きさの点の話か */
export function isPointProposal(p: Pick<ProposeRuleInput, "param" | "stone_mm" | "points">): boolean {
  return p.param === "prong.minDiameterMm" && (p.stone_mm !== undefined || (p.points ?? []).some((x) => x.by === "craftsman"));
}

/**
 * 案から職人の点を読む。言葉にない数字の点は外し、外した理由を返す。
 * points に職人の点がなければ、stone_mm と value を職人の点にする
 */
export function craftPointsFromProposal(p: ProposeRuleInput, said: string, now?: DesignNow, date?: string): { points: CraftPoint[]; dropped: string[] } {
  if (!isPointProposal(p)) return { points: [], dropped: [] };
  const nums = readNumbers(said).map((n) => n.value);
  const inWords = (v: number) => nums.some((n) => Math.abs(n - v) < 0.005);
  const raw = (p.points ?? []).filter((x) => x.by === "craftsman").map((x) => ({ stoneMm: x.stone_mm, value: x.value }));
  if (raw.length === 0 && p.stone_mm !== undefined && p.value !== undefined) raw.push({ stoneMm: p.stone_mm, value: p.value });
  const points: CraftPoint[] = [];
  const dropped: string[] = [];
  for (const c of raw) {
    const valueOk = inWords(c.value) || (now?.prongMm !== undefined && Math.abs(now.prongMm - c.value) < 0.01);
    const sizeOk = inWords(c.stoneMm) || (now !== undefined && Math.abs(now.stoneMm - c.stoneMm) < THIS_SIZE_MM);
    if (!valueOk) dropped.push(`${c.value} mm は職人の言葉にないので、職人の点にしませんでした`);
    else if (!sizeOk) dropped.push(`石の大きさ ${c.stoneMm} mm は職人の言葉にないので、職人の点にしませんでした`);
    else points.push({ stoneMm: c.stoneMm, value: c.value, quote: said.trim() || p.quote, ...(date ? { date } : {}) });
  }
  return { points, dropped };
}

/** 案を見せるための、前 → 後 */
export interface PointsPreview {
  /** 新しく言った職人の点 */
  added: CraftPoint[];
  /** 足したあとの、決まりの中身 */
  rule: ReturnType<typeof prongPointsRule>;
  /** 表の大きさごとの、今の値と、案の値 */
  rows: { stoneMm: number; before: TableRow; after: TableRow }[];
  /** Claude が推し量った点の考え（Claude の言葉。表の値と合う点のものだけ） */
  claudeWhy: string[];
  /** Claude の推測の値が表の値と合わず、出し直したか */
  claudeRedone: boolean;
  dropped: string[];
}

/** 案を帳面に足したら、どう変わるか（今の帳面 → 案）。職人の点がなければ null */
export function previewPoints(ledger: Ledger, p: ProposeRuleInput, said: string, now?: DesignNow, date?: string): PointsPreview | null {
  const { points: added, dropped } = craftPointsFromProposal(p, said, now, date);
  if (added.length === 0) return dropped.length ? { added, rule: prongPointsRule([]), rows: [], claudeWhy: [], claudeRedone: false, dropped } : null;
  const next = mergeCraftPoints(craftProngPoints(ledger), added);
  const rule = prongPointsRule(next, added[added.length - 1].value);
  const after = prongTable(rule.sizePoints ?? []);
  const sizes = after.map((r) => r.stoneMm);
  if (now && !sizes.some((s) => Math.abs(s - now.stoneMm) < SAME_SIZE_MM)) sizes.push(round1(now.stoneMm));
  sizes.sort((a, b) => a - b);
  const afterAt = (s: number): TableRow => after.find((r) => Math.abs(r.stoneMm - s) < 1e-9) ?? prongMinAt(ledgerWith(ledger, rule), s);
  const rows = sizes.map((s) => ({ stoneMm: s, before: prongMinAt(ledger, s), after: afterAt(s) }));
  // Claude の推測のうち、画面の計算と同じ値（0.03 mm 以内）のものだけ、その考えを添える。食い違えば、出し直したと書く
  const guesses = (p.points ?? []).filter((x) => x.by === "inferred");
  const agree = guesses.filter((x) => {
    const v = valueAtPoints(rule.sizePoints ?? [], x.stone_mm);
    return v !== undefined && Math.abs(v - x.value) <= 0.03;
  });
  // 添えるのは、いちばん大きい石の推測の考え（小さい石は下限で止まることが多く、割合の話が見えにくい）
  const biggest = [...agree].filter((x) => x.why.trim()).sort((a, b) => b.stone_mm - a.stone_mm)[0];
  const claudeWhy = agree.length === guesses.length && biggest ? [`${mmText(biggest.stone_mm)} mm：${biggest.why.trim()}`] : [];
  return { added, rule, rows, claudeWhy, claudeRedone: guesses.length > 0 && agree.length < guesses.length, dropped };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** 決まりを足した帳面（見せるためだけ。保存しない） */
function ledgerWith(ledger: Ledger, rule: ReturnType<typeof prongPointsRule>): Ledger {
  const r: Rule = { id: "__preview", title: "", reason: "", source: { kind: "craftsman", name: "" }, date: "", ...rule, text: rule.text };
  const others = ledger.rules.filter((x) => x.param !== "prong.minDiameterMm");
  return { ...ledger, rules: [...others, r] };
}

/** Claude への指示に添える、今の設計と爪の点の表 */
export function designNowText(ledger: Ledger, now: DesignNow): string {
  const here = prongMinAt(ledger, now.stoneMm);
  const word = (b: TableRow["by"]) => (b === "craftsman" ? "職人" : b === "inferred" ? "推測" : "公開の目安");
  const sizes = [...GUIDES.prong.infer.tableSizesMm];
  const pub = GUIDES.prong.minByStoneSize.map(([s, d]) => `${s} mm で ${d} mm`).join("、");
  const craft = craftProngPoints(ledger);
  return [
    `今の設計：石の大きさ ${now.stoneMm.toFixed(1)} mm${now.prongMm !== undefined ? `、爪の太さ ø ${now.prongMm.toFixed(2)} mm` : ""}、この石の爪の最低 ${here.value} mm（${word(here.by)}）。`,
    `今の帳面の爪の最低：${sizes.map((s) => { const r = prongMinAt(ledger, s); return `${s} mm で ${r.value} mm（${word(r.by)}）`; }).join("、")}。`,
    `公開の目安の点（爪の最低）：${pub}。点の間はまっすぐつなぎ、8 mm より大きい石は同じ傾きで伸ばす。`,
    `公開の目安の値：${[...new Set([...sizes, now.stoneMm])].sort((a, b) => a - b).map((s) => `${s} mm で ${round2(minProngMm(s))} mm`).join("、")}。`,
    craft.length ? `今の職人の点：${craft.map((c) => `${c.stoneMm} mm で ${c.value} mm`).join("、")}（画面が残す。新しい点は、近い大きさの点を置き換える）。` : "今の職人の点：まだない。",
    `推測の出し方（画面も同じ計算をする）：その大きさの公開の目安 × 倍率。倍率 ＝ 職人の値 ÷ その大きさの公開の目安。職人の点が 2 つ以上なら（今の点と新しい点を合わせて）、点と点の間は倍率をまっすぐつなぎ、外は端の倍率のまま。職人の 2 点の間の推測は、その 2 つの値の間に収める。推測は ${inferFloorMm()} mm より細くしない（公開の目安のいちばん細い点）。`,
  ].join("\n");
}
