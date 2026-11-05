// 継承の流れ：職人が残す → 学ぶ人が受け取る → 質問が職人へ戻る。どの技も同じ 4 つの段。
// 今どこまで進んだかを数から出す。画面に依存しない純粋な関数（画面は src/app/flow-view.ts）。
import { groupQuestions, type QuestionGroup, type TeacherQueue } from "./teacher-queue";
import type { Gap } from "./gaps";
import type { HowtoId } from "./howto-steps";
import { TECH_IDS } from "./techniques";

export type FlowStepId = "answer" | "model" | "ask" | "hands";
export type FlowWho = "master" | "learner";

export interface FlowStepInfo {
  id: FlowStepId;
  who: FlowWho;
  /** 見出しの短い言葉 */
  label: string;
  /** 次にやることとして出す文 */
  next: string;
}

/** 流れの順（ここ 1 か所） */
export const FLOW_STEPS: FlowStepInfo[] = [
  { id: "answer", who: "master", label: "答える", next: "聞かれたことに答える" },
  { id: "model", who: "master", label: "手本を残す", next: "手本を残す" },
  { id: "ask", who: "learner", label: "聞く", next: "学ぶ人が聞く" },
  { id: "hands", who: "learner", label: "手を比べる", next: "手の動きを比べる" },
];

/** その技で、今まで残ったものの数 */
export interface FlowCounts {
  /** 職人が残した決まり */
  craftsman: number;
  /** 手本 */
  models: number;
  /** 学ぶ人が聞いた回数 */
  asked: number;
  /** 手の動きを比べた回数 */
  compared: number;
  /** まだ答えていない届いた質問 */
  questions: number;
}

export interface FlowStepState extends FlowStepInfo {
  done: boolean;
  /** いまここ（まだの段のうち、いちばん前） */
  current: boolean;
}

export function flowState(c: FlowCounts): { steps: FlowStepState[]; nextId: FlowStepId | null; doneCount: number } {
  const done: Record<FlowStepId, boolean> = { answer: c.craftsman > 0, model: c.models > 0, ask: c.asked > 0, hands: c.compared > 0 };
  const nextId = FLOW_STEPS.find((s) => !done[s.id])?.id ?? null;
  return {
    steps: FLOW_STEPS.map((s) => ({ ...s, done: done[s.id], current: s.id === nextId })),
    nextId,
    doneCount: FLOW_STEPS.filter((s) => done[s.id]).length,
  };
}

/** 次の段（最後なら null） */
export function stepAfter(id: FlowStepId): FlowStepInfo | null {
  const i = FLOW_STEPS.findIndex((s) => s.id === id);
  return FLOW_STEPS[i + 1] ?? null;
}

/** 一覧に並べる順。指輪は例の一つなので後ろに置く */
export const WAZA_ORDER: HowtoId[] = ["kebori", ...TECH_IDS.filter((id) => id !== "kebori"), "ring"];

/** その技に届いた質問だけ。技の印のない前の質問は、指輪の石留めのもの */
export function queueFor(queue: TeacherQueue, id: HowtoId): TeacherQueue {
  return { items: queue.items.filter((q) => (q.technique ?? "ring") === id) };
}

/** その技の、まだ答えていない届いた質問（まとめたもの） */
export function openQuestions(queue: TeacherQueue, id: HowtoId): QuestionGroup[] {
  return groupQuestions(queueFor(queue, id));
}

const ASKED_PREFIX = "q:";

/** 届いた質問を、聞き取りの問いの形に。答えは言葉のまま決まりになる（数字を作らない） */
export function questionGap(id: HowtoId, g: QuestionGroup): Gap {
  return {
    id: `${ASKED_PREFIX}${g.id}`,
    technique: id,
    kind: "asked",
    expects: "text",
    title: g.question.replace(/[？?]$/, "").slice(0, 40),
    question: g.question,
    why: g.count > 1 ? `学ぶ人から ${g.count} 回 届いた質問です。帳面に答えがありません。` : "学ぶ人から届いた質問です。帳面に答えがありません。",
    reason: "学ぶ人から届いた質問への、職人の答え",
  };
}

/** 問いが届いた質問なら、そのまとめの id（なければ null） */
export function askedGroupId(gapId: string | undefined): string | null {
  return gapId?.startsWith(ASKED_PREFIX) ? gapId.slice(ASKED_PREFIX.length) : null;
}

/**
 * 「学ぶ」で例に出す問い。どれも、その技の帳面（資料の決まり）に答えがある問いだけ。
 * 帳面にない問いを、例として出さない（テストで確かめる）。
 */
export const LEARN_SUGGEST: Record<HowtoId, string[]> = {
  ring: ["9 mm くらいの石の爪は、何 mm にする？", "三角の石は、爪 3 本で留まる？", "エメラルドはロウ付けの前に外す？", "ロウはどの順に使う？", "10 号の内径は？"],
  kebori: ["毛彫り鏨は傾けていい？", "本番の前に筋彫りはする？", "硬い地金はどう彫る？"],
  bezel: ["覆輪はどの順に倒す？", "覆輪の壁の厚さは？"],
  milgrain: ["ミルの粒の大きさは？", "ミル鏨をすべらせないには？"],
  tsuchime: ["小さい鎚と大きい鎚のちがいは？", "硬くなったら焼きなます？"],
  nunome: ["布目象嵌の溝は浅くていい？", "打ちこみは何の槌で？"],
  mokume: ["木目金の彫りは厚さのどこまで？", "重ねる前の洗浄は大事？"],
};
