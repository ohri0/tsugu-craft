// Claude につながらないときに、目安帳から質問に近い決まりを探す。
// 文字の 2 つ組の重なりで比べるだけの簡単な探し方。見つからなければ「職人に聞く」に回す。
// 画面に依存しない純粋な関数。
import { normalizeQuestion } from "./teacher-queue";
import type { Rule } from "./ledger";

function bigrams(s: string): Set<string> {
  const t = normalizeQuestion(s);
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** 質問の 2 つ組のうち、決まりの文に出てくる割合（0〜1） */
export function ruleScore(question: string, rule: Rule): number {
  const q = bigrams(question);
  if (q.size === 0) return 0;
  const body = bigrams([rule.title, rule.text, rule.reason, rule.example ?? "", rule.quote ?? ""].join(" "));
  let hit = 0;
  for (const g of q) if (body.has(g)) hit++;
  return hit / q.size;
}

/** 目安帳から、質問に近い決まりを近い順に（目安を超えたものだけ） */
export function findRules(question: string, rules: readonly Rule[], threshold = 0.3, limit = 2): Rule[] {
  return rules
    .map((r) => ({ r, s: ruleScore(question, r) }))
    .filter((x) => x.s >= threshold)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.r);
}
