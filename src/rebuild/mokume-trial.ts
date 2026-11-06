// 「模様の試し」で比べる、Claude の手順の記録。動画と入口のページの「11 のうち 9」の回（2026-11-04）。
// 中身は research/mokume/trial-2026-11-04.json（答え合わせの記録を、変えずに写したもの）。
import trial from "../../research/mokume/trial-2026-11-04.json";
import { recipeFrom, statusesFromTrial, TRUE_STATUSES, type Recipe, type Statuses } from "./mokume-pattern";

export interface TrialRecord {
  date: string;
  score: string;
  steps: { title: string; verdict: string; label: string; answer: string; note: string; basis: string }[];
  missed: string[];
}

export const MOKUME_TRIAL: TrialRecord = trial;

export const CLAUDE_STATUSES: Statuses = statusesFromTrial(MOKUME_TRIAL);
export const CLAUDE_RECIPE: Recipe = recipeFrom(
  CLAUDE_STATUSES,
  MOKUME_TRIAL.steps.map((s) => s.title),
);
export const TRUE_RECIPE: Recipe = recipeFrom(TRUE_STATUSES);

/** たどり着いた本当の工程の数（一致と一部） */
export function reached(st: Statuses): number {
  return Object.values(st).filter((m) => m !== "miss").length;
}
