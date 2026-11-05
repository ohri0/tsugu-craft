// 途切れた技の案に渡す、職人の帳面（作者の声 2026-11-05：手がかりだけだと Claude が全部やっているみたい。手がかりと職人の帳面を渡して、復元できるかも、という話）。
// 帳面を読むだけで、書き換えない。職人の決まりだけを、題と本文と言葉で渡す（公開の資料の決まりは渡さない）。
// 番号（B1 など）は 1 回の案の中だけの印で、画面には出さない。力試し（src/rebuild/prompt.ts）には渡さない。
import { activeRules, type Ledger } from "../rules/ledger";

export interface BookRule {
  /** B1 など。この案の中だけの番号 */
  id: string;
  /** 何についての決まりか（指輪の石留め・槌目 など） */
  craft: string;
  title: string;
  text: string;
  /** 職人の言葉そのまま */
  quote?: string;
}

/** 渡す量の上限。多いときは新しい決まりから、ここまで渡す */
export const BOOK_LIMITS = { rules: 60, chars: 12_000, title: 60, text: 400, quote: 200 } as const;

export interface BookSource {
  /** 何についての帳面か */
  craft: string;
  ledger: Pick<Ledger<string>, "rules">;
}

export interface Book {
  /** 渡す決まり */
  rules: BookRule[];
  /** 職人の決まりの数（上限で外したものも含む） */
  total: number;
}

/** 帳面から、職人の決まりだけを取り出す。上限を超えたら新しい決まりを残す。順番は帳面のまま */
export function readBook(sources: readonly BookSource[]): Book {
  const all = sources.flatMap((s) =>
    activeRules(s.ledger)
      .filter((r) => r.source.kind === "craftsman")
      .map((r) => ({ craft: s.craft, title: r.title.slice(0, BOOK_LIMITS.title), text: r.text.slice(0, BOOK_LIMITS.text), quote: r.quote?.trim().slice(0, BOOK_LIMITS.quote) || undefined, date: r.date })),
  );
  const size = (r: (typeof all)[number]) => r.craft.length + r.title.length + r.text.length + (r.quote?.length ?? 0);
  const newest = all.map((r, i) => ({ r, i })).sort((a, b) => (a.r.date === b.r.date ? a.i - b.i : a.r.date < b.r.date ? 1 : -1));
  const keep = new Set<number>();
  let chars = 0;
  for (const { r, i } of newest) {
    if (keep.size >= BOOK_LIMITS.rules || chars + size(r) > BOOK_LIMITS.chars) continue;
    keep.add(i);
    chars += size(r);
  }
  const rules = all
    .filter((_, i) => keep.has(i))
    .map((r, i) => {
      const rule: BookRule = { id: `B${i + 1}`, craft: r.craft, title: r.title, text: r.text };
      if (r.quote) rule.quote = r.quote;
      return rule;
    });
  return { rules, total: all.length };
}

/** Claude に渡す帳面の文 */
export function bookText(rules: readonly BookRule[]): string {
  return rules.map((r) => `${r.id} ［${r.craft}］${r.title}\n${r.text}${r.quote ? `\n職人の言葉：${r.quote}` : ""}`).join("\n\n");
}
