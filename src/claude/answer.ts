// 「聞く」の Claude の返事を、答え・なぜ・もとにした決まりに分ける。
// 返事は「答え：…」「なぜ：…」「決まり：[id] [id]」の行で書くよう頼んでいる（src/claude/prompt.ts の askPrompt）。
// 形が崩れていても、ある所だけ拾う。画面に依存しない純粋な関数。

export interface AskAnswer {
  /** 短い答え（1〜2 文） */
  short: string;
  /** なぜ（理由） */
  why: string;
  /** もとにした決まりの id（目安帳にあるものだけ） */
  ruleIds: string[];
}

export function parseAskAnswer(text: string, knownIds: readonly string[]): AskAnswer {
  const t = text.replace(/\*\*/g, "").trim();
  const grab = (label: string) => {
    const m = new RegExp(`(?:^|\\n)\\s*${label}\\s*[：:]\\s*([\\s\\S]*?)(?=\\n\\s*(?:答え|なぜ|決まり)\\s*[：:]|$)`).exec(t);
    return m ? m[1].trim() : "";
  };
  let short = grab("答え");
  const why = grab("なぜ");
  const ruleLine = grab("決まり");
  if (!short) short = t.split(/\n/)[0]?.trim() ?? "";
  const known = new Set(knownIds);
  const ids = [...(ruleLine || t).matchAll(/\[([A-Za-z0-9._-]+)\]/g)].map((m) => m[1]).filter((id) => known.has(id));
  return { short, why, ruleIds: [...new Set(ids)] };
}
