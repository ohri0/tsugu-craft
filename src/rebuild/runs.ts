// 組み立て直しの 1 回の試しの記録。ブラウザに残すものと、リポジトリに載せた「公開の記録」がある。
// 公開の記録は、合言葉を持たない人にも、Claude が実際に組み立てた結果を（手を加えずに）見せるためのもの。画面に依存しない。
import type { Condition } from "./material";
import type { Grade, Hypothesis } from "./tools";

export interface Run {
  technique: string;
  condition: Condition["id"];
  date: string;
  hypothesis: Hypothesis;
  grade?: Grade;
  /** リポジトリに載せた記録（このブラウザで組み立てたものではない） */
  published?: boolean;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

/** 書き出した記録として正しい形か（画面がそのまま描ける形か） */
export function validRun(x: unknown): x is Run {
  if (!isObj(x)) return false;
  if (typeof x.technique !== "string" || typeof x.condition !== "string" || typeof x.date !== "string") return false;
  const h = x.hypothesis;
  if (!isObj(h) || !Array.isArray(h.steps) || !Array.isArray(h.trials)) return false;
  for (const s of h.steps as unknown[]) {
    if (!isObj(s) || typeof s.title !== "string" || typeof s.detail !== "string" || !Array.isArray(s.clue_ids)) return false;
  }
  if (x.grade !== undefined) {
    const g = x.grade;
    if (!isObj(g) || !Array.isArray(g.steps) || !Array.isArray(g.missed)) return false;
  }
  return true;
}

/** 公開の記録（JSON の中身の並び）から、正しい形のものだけを、技と渡し方ごとに新しい 1 つ */
export function pickPublished(raw: unknown[]): Run[] {
  const out = new Map<string, Run>();
  for (const x of raw) {
    if (!validRun(x)) continue;
    const k = `${x.technique}/${x.condition}`;
    const prev = out.get(k);
    if (!prev || prev.date < x.date || (prev.date === x.date && !prev.grade && x.grade)) out.set(k, { ...x, published: true });
  }
  return [...out.values()];
}
