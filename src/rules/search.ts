// Claude につながらないときに、目安帳から質問に近い決まりを探す。
// 文字の 2 つ組の重なりで比べるだけの簡単な探し方。見つからなければ「職人に聞く」に回す。
// 画面に依存しない純粋な関数。
import { normalizeNumbers } from "./gaps";
import { minProngMm } from "./guides";
import { sourceLabel, valueFor, type Rule } from "./ledger";
import { normalizeQuestion } from "./teacher-queue";

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

/** 問いの中の、石の大きさ（mm）。「9 mm くらいの石」「6.5 ミリの石」。なければ undefined */
export function stoneSizeInQuestion(question: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*(?:mm|ミリ)?\s*(?:くらい|ぐらい|ほど|前後)?\s*の?\s*(?:石|メレ)/.exec(normalizeNumbers(question));
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * 「9 mm くらいの石の爪は、何 mm にする？」のように、石の大きさと爪の太さの問いに、帳面の値で答える。
 * 文字の重なりだけで探すと、言葉の近い別の決まり（角の話など）を答えていた（2026-11-05 点検）。
 * 数字は帳面の決まり（なければ公開の目安の線）から計算した値だけ。当てはまらない問いは null（ふつうに探す）
 */
export function prongSizeAnswer(question: string, rules: readonly Rule[]): { short: string; why: string; rule: Rule } | null {
  if (!/爪/.test(question) || /何\s*本|本数|\d\s*本|高さ|位置|間隔|角度|座/.test(question)) return null;
  const size = stoneSizeInQuestion(question);
  if (size === undefined) return null;
  const rule = rules.find((r) => r.param === "prong.minDiameterMm") ?? rules.find((r) => r.id === "prong-thickness");
  if (!rule) return null;
  const mm = rule.param ? valueFor(rule, size) : minProngMm(size);
  if (mm === undefined) return null;
  const said = rule.bySizeLine ? (rule.bySize ?? []).flatMap((s) => (s.upToMm === null ? [] : [s])) : [];
  const inLine = said.length ? size >= Math.min(...said.map((s) => s.upToMm!)) && size <= Math.max(...said.map((s) => s.upToMm!)) : true;
  const from = rule.source.kind === "craftsman" ? "帳面の職人の決まり" : `${sourceLabel(rule.source)}の目安`;
  const atCraft = rule.sizePoints?.some((p) => p.by === "craftsman" && Math.abs(p.stoneMm - size) < 0.05);
  const how = rule.sizePoints?.length
    ? atCraft
      ? "この大きさは、職人が言った点です。"
      : `この大きさは職人の点ではなく、推測の値です（${rule.inferNote ?? "職人の点から割合で推し量った"}。職人はまだ確かめていない）。`
    : inLine
      ? "その間は、点をまっすぐつないだ値です。"
      : "この大きさは点の外なので、線を伸ばした値です。";
  const line = said.length ? `職人が言った点は ${said.map((s) => `${s.upToMm} mm の石で ${s.value} mm`).join("、")}。${how}` : "";
  return {
    short: `石の大きさ ${size} mm くらいなら、爪の太さは最低 ${mm.toFixed(2)} mm です（${from}から）。目安・最後は職人が決める。`,
    why: [line, rule.reason].filter(Boolean).join(" "),
    rule,
  };
}
