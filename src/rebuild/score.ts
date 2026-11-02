// 「組み立て直す」の点数：仮説と採点から、本当の工程にいくつたどり着いたか、
// そのうち手がかりからのものと、もともとの知識からのものがいくつかを数える。
import type { AnswerItem } from "./material";
import type { Grade, Hypothesis } from "./tools";

export interface Tally {
  /** 仮説の工程の数 */
  steps: number;
  match: number;
  partial: number;
  miss: number;
  /** 本当の工程（A）の数 */
  answerSteps: number;
  /** match か partial で当たった、本当の工程（A）の数（同じ番号は 1 つと数える） */
  covered: number;
  /** covered ÷ answerSteps（0〜1） */
  coverage: number;
  /** 当たった本当の工程のうち、手がかりから（clues）の工程が 1 つでも当たったもの */
  clueBackedMatch: number;
  /** 当たった本当の工程のうち、もともとの知識から（prior）の工程だけが当たったもの */
  priorMatch: number;
  /** 仮説の工程のうち、もともとの知識から（prior）としたもの */
  priorSteps: number;
}

export function tally(h: Hypothesis, g: Grade, answer: AnswerItem[]): Tally {
  const stepIds = new Set(answer.filter((a) => a.kind === "step").map((a) => a.id));
  const count = { match: 0, partial: 0, miss: 0 };
  /** 本当の工程の番号 → 手がかりからの工程で当たったか */
  const hit = new Map<string, boolean>();
  for (const s of g.steps) {
    count[s.verdict]++;
    if (s.verdict === "miss") continue;
    const fromClues = h.steps[s.n - 1]?.basis === "clues";
    for (const id of s.answer_ids) {
      if (!stepIds.has(id)) continue;
      hit.set(id, (hit.get(id) ?? false) || fromClues);
    }
  }
  const covered = hit.size;
  const clueBackedMatch = [...hit.values()].filter(Boolean).length;
  return {
    steps: h.steps.length,
    ...count,
    answerSteps: stepIds.size,
    covered,
    coverage: stepIds.size ? covered / stepIds.size : 0,
    clueBackedMatch,
    priorMatch: covered - clueBackedMatch,
    priorSteps: h.steps.filter((s) => s.basis === "prior").length,
  };
}

/** 点数を 1 文で */
export function scoreLine(t: Tally): string {
  return `本当の工程 ${t.answerSteps} のうち ${t.covered} にたどり着いた（手がかりから ${t.clueBackedMatch}・もともとの知識から ${t.priorMatch}）`;
}
