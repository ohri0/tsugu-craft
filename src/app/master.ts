// 職人（教える人）の名前と言葉を、目安帳から取り出す。
import { activeRules, type Ledger, type Rule } from "../rules/ledger";

/** 目安帳でいちばん多く決まりを残した職人の名前。いなければ「職人」 */
export function masterName(ledger: Ledger): string {
  const count = new Map<string, number>();
  for (const r of activeRules(ledger)) if (r.source.kind === "craftsman") count.set(r.source.name, (count.get(r.source.name) ?? 0) + 1);
  let best = "職人";
  let n = 0;
  for (const [k, v] of count) if (v > n) [best, n] = [k, v];
  return best;
}

/** 職人の言葉（あれば） */
export function ruleQuote(r: Rule): string {
  return r.quote?.trim() ?? "";
}
