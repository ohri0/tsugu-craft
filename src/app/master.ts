// 職人（教える人）の名前と言葉を、帳面から取り出す。
import { activeRules, type Ledger, type Rule } from "../rules/ledger";

/** 帳面でいちばん多く決まりを残した職人の名前。いなければ「職人」 */
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

/** 帳面の呼び名：工房の名前があればそれ（工房 A）、なければ職人の名前に「さん」 */
export function bookLabel(ledger: Ledger): string {
  return ledger.owner?.trim() || `${masterName(ledger)}さん`;
}

/** 帳面の題：「石川工房の帳面」「工房 B の帳面」（英数字で終わる名前は間をあける） */
export function bookTitle(label: string): string {
  return `${label}${/[A-Za-z0-9]$/.test(label) ? " " : ""}の帳面`;
}

/** 決まりを足すときの出どころの名前：工房の帳面なら工房の名前、はじめの帳面なら職人の名前 */
export function sourceName(ledger: Ledger, main = false): string {
  return main ? masterName(ledger) : ledger.owner?.trim() || masterName(ledger);
}
