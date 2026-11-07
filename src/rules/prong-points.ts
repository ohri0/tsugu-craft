// 爪の太さの、職人の点と推測の点（作者の頼み 2026-11-06）。
// 職人が「このサイズ（約 8 mm）の石なら、最低 0.7 ミリは欲しい」と 1 つの大きさで言ったら、その点を職人の点として残し、
// ほかの大きさ（間の大きさ・18 mm の石など）は、公開の目安の線を職人の点を通るように割合でずらして「推測」として出す。
// 職人が「18 ミリなら 1.2 は欲しい」と直したら、その点が職人の点になり、推測の線も出し直す。
// 確かめは、職人の点を先に、次に推測の点を使う（ledger.ts の valueAtPoints）。数字を作るのは割合の計算だけで、推測と書いて見せる。
// 画面に依存しない純粋な関数。
import { GUIDES, minProngMm } from "./guides.js";
import { activeRules, effectiveGuides, prongMinOverride, SAME_SIZE_MM, valueAtPoints, type Ledger, type Rule, type SizePoint } from "./ledger.js";

/** 職人が言った点 */
export interface CraftPoint {
  stoneMm: number;
  value: number;
  quote?: string;
  date?: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
/** 数を短く（0.7・1.2・8・6.4） */
export const mmText = (v: number) => String(round2(v));

/** 推測の下限：公開の目安のいちばん細い点（メレの 0.45 mm） */
export function inferFloorMm(): number {
  return GUIDES.prong.minByStoneSize[0][1];
}

/** 職人の点での倍率（職人の値 ÷ 公開の目安の値） */
function ratios(craft: readonly CraftPoint[]): { stoneMm: number; ratio: number }[] {
  return craft.map((c) => ({ stoneMm: c.stoneMm, ratio: c.value / minProngMm(c.stoneMm) })).sort((a, b) => a.stoneMm - b.stoneMm);
}

/** その大きさの倍率：職人の点の間は倍率をまっすぐつなぎ、外は端の倍率のまま */
export function ratioAt(craft: readonly CraftPoint[], stoneMm: number): number {
  const rs = ratios(craft);
  if (rs.length === 0) return 1;
  if (stoneMm <= rs[0].stoneMm) return rs[0].ratio;
  if (stoneMm >= rs[rs.length - 1].stoneMm) return rs[rs.length - 1].ratio;
  const i = rs.findIndex((_r, k) => k < rs.length - 1 && stoneMm <= rs[k + 1].stoneMm);
  const a = rs[i];
  const b = rs[i + 1];
  return a.ratio + ((b.ratio - a.ratio) * (stoneMm - a.stoneMm)) / (b.stoneMm - a.stoneMm);
}

/**
 * 推測の値（mm）：公開の目安 × その大きさの倍率。下限より細くしない。
 * 職人の点の並びを逆にしない：職人の 2 点の間なら、その 2 つの値の間に収め、いちばん大きい点より大きい石はその値より細くせず、
 * いちばん小さい点より小さい石はその値より太くしない（小さい石のほうが太い爪、にならないように）
 */
export function inferredValue(craft: readonly CraftPoint[], stoneMm: number): number {
  let v = Math.max(inferFloorMm(), minProngMm(stoneMm) * ratioAt(craft, stoneMm));
  const cs = [...craft].sort((a, b) => a.stoneMm - b.stoneMm);
  if (cs.length) {
    const first = cs[0];
    const last = cs[cs.length - 1];
    if (stoneMm < first.stoneMm) v = Math.min(v, Math.max(first.value, inferFloorMm()));
    else if (stoneMm > last.stoneMm) v = Math.max(v, last.value);
    else {
      const i = cs.findIndex((_c, k) => k < cs.length - 1 && stoneMm <= cs[k + 1].stoneMm);
      const a = cs[Math.max(0, i)];
      const b = cs[Math.max(0, i) + 1] ?? a;
      v = Math.min(Math.max(v, Math.min(a.value, b.value)), Math.max(a.value, b.value));
    }
  }
  return round2(v);
}

/** 推測の出し方の言葉 */
export function inferNoteText(craft: readonly CraftPoint[]): string {
  const cs = [...craft].sort((a, b) => a.stoneMm - b.stoneMm);
  const floor = `${mmText(inferFloorMm())} mm より細くはしない（公開の目安のいちばん細い点）`;
  if (cs.length === 1) {
    const c = cs[0];
    return `公開の目安の曲線を、職人の ${mmText(c.stoneMm)} mm・${mmText(c.value)} mm に合わせて割合でずらした（どの大きさも公開の目安の ${ratioAt(cs, c.stoneMm).toFixed(2)} 倍）。${floor}`;
  }
  return `公開の目安の曲線を、職人の ${cs.map((c) => `${mmText(c.stoneMm)} mm・${mmText(c.value)} mm`).join("、")} を通るように割合でずらした（点の間は倍率をまっすぐつなぎ、外は端の倍率のまま。職人の 2 点の間は、その 2 つの値の間に収める）。${floor}`;
}

/** 職人の点から、職人の点と推測の点をそろえる */
export function inferProngPoints(craft: readonly CraftPoint[], sizes: readonly number[] = GUIDES.prong.infer.sizesMm): { points: SizePoint[]; note: string } {
  const cs = [...craft].sort((a, b) => a.stoneMm - b.stoneMm);
  const mine: SizePoint[] = cs.map((c) => ({ stoneMm: c.stoneMm, value: c.value, by: "craftsman", ...(c.quote ? { quote: c.quote } : {}), ...(c.date ? { date: c.date } : {}) }));
  if (cs.length === 0) return { points: [], note: "" };
  const guessed: SizePoint[] = sizes.filter((s) => !cs.some((c) => Math.abs(c.stoneMm - s) < SAME_SIZE_MM)).map((s) => ({ stoneMm: s, value: inferredValue(cs, s), by: "inferred" }));
  return { points: [...mine, ...guessed].sort((a, b) => a.stoneMm - b.stoneMm), note: inferNoteText(cs) };
}

/** 帳面の今の職人の爪の決まり */
export function craftProngRule(ledger: Ledger): Rule | undefined {
  return activeRules(ledger).find((r) => r.param === "prong.minDiameterMm" && r.source.kind === "craftsman");
}

/** 帳面の今の職人の点（点のある決まりは職人の点、前の形の決まりは線の点） */
export function craftProngPoints(ledger: Ledger): CraftPoint[] {
  const r = craftProngRule(ledger);
  if (!r) return [];
  if (r.sizePoints?.length) return r.sizePoints.filter((p) => p.by === "craftsman").map((p) => ({ stoneMm: p.stoneMm, value: p.value, ...(p.quote ? { quote: p.quote } : {}), ...(p.date ? { date: p.date } : {}) }));
  if (r.bySizeLine && r.bySize?.length) {
    return r.bySize.flatMap((s) => (s.upToMm === null ? [] : [{ stoneMm: s.upToMm, value: s.value, ...(r.quote ? { quote: r.quote } : {}), date: r.date }]));
  }
  return [];
}

/** 職人の点に新しい点を足す。近い大きさ（SAME_SIZE_MM）の前の点は、新しい点が置き換える */
export function mergeCraftPoints(old: readonly CraftPoint[], added: readonly CraftPoint[]): CraftPoint[] {
  const kept = old.filter((o) => !added.some((a) => Math.abs(a.stoneMm - o.stoneMm) < SAME_SIZE_MM));
  return [...kept, ...added].sort((a, b) => a.stoneMm - b.stoneMm);
}

/** 爪の太さの決まりの中身（帳面に足す形）。primary：大きさが分からないときの値（新しく言った点の値） */
export function prongPointsRule(craft: readonly CraftPoint[], primary?: number): Pick<Rule, "param" | "value" | "bySize" | "bySizeLine" | "sizePoints" | "inferNote" | "text" | "checks"> {
  const { points, note } = inferProngPoints(craft);
  const cs = points.filter((p) => p.by === "craftsman");
  return {
    param: "prong.minDiameterMm",
    value: primary ?? cs[cs.length - 1]?.value,
    // 前の形を読む所（聞き取り・入口の図など）のために、職人の点だけを線の点としても持つ
    bySize: cs.map((p) => ({ upToMm: p.stoneMm, value: p.value })),
    bySizeLine: true,
    sizePoints: points,
    inferNote: note,
    checks: ["prong-thin"],
    text: `爪の最低の太さは石の大きさで変わる。職人の点：${cs.map((p) => `${mmText(p.stoneMm)} mm の石で ${mmText(p.value)} mm`).join("、")}。ほかの大きさは推測（${note}）。推測は職人がまだ確かめていない`,
  };
}

export interface TableRow {
  stoneMm: number;
  value: number;
  by: "craftsman" | "inferred" | "public";
}

/** 表に出す行：表の大きさに、職人の点を差しこむ（職人の点の近くの表の大きさは、職人の点に替える） */
export function prongTable(points: readonly SizePoint[], sizes: readonly number[] = GUIDES.prong.infer.tableSizesMm): TableRow[] {
  const craft = points.filter((p) => p.by === "craftsman");
  const rows: TableRow[] = craft.map((p) => ({ stoneMm: p.stoneMm, value: p.value, by: "craftsman" }));
  for (const s of sizes) {
    if (craft.some((c) => Math.abs(c.stoneMm - s) < SAME_SIZE_MM)) continue;
    rows.push({ stoneMm: s, value: round2(valueAtPoints(points, s) ?? minProngMm(s)), by: "inferred" });
  }
  return rows.sort((a, b) => a.stoneMm - b.stoneMm);
}

/** 今の帳面で、その大きさの石の爪の最低の太さと、どこから来た値か */
export function prongMinAt(ledger: Ledger, stoneMm: number): TableRow {
  const r = activeRules(ledger).find((x) => x.param === "prong.minDiameterMm");
  const v = prongMinOverride(effectiveGuides(ledger, stoneMm));
  if (v === undefined || !r) return { stoneMm, value: round2(minProngMm(stoneMm)), by: "public" };
  const craftHere = r.source.kind === "craftsman" && (r.sizePoints?.length ? r.sizePoints.some((p) => p.by === "craftsman" && Math.abs(p.stoneMm - stoneMm) < 0.05) : true);
  return { stoneMm, value: round2(v), by: r.sizePoints?.length ? (craftHere ? "craftsman" : "inferred") : r.source.kind === "craftsman" ? "craftsman" : "public" };
}
