// 教える（生徒の「なぜ？」に目安帳で答える・先生に聞くこと）のテスト。本物の Claude は呼ばない。
import { describe, expect, it } from "vitest";
import {
  addQuestion,
  emptyQueue,
  groupQuestions,
  markAnswered,
  normalizeQuestion,
  parseQueue,
  questionSimilarity,
  queueCounts,
  removeQuestions,
  type TeacherQueue,
} from "../src/rules/teacher-queue";

const DAY = "2026-11-03";

function queueOf(list: [question: string, student?: string][]): TeacherQueue {
  return list.reduce(
    (q, [question, student]) => addQuestion(q, { question, whyUnanswered: "目安帳に決まりがない", student, date: DAY }).queue,
    emptyQueue(),
  );
}

describe("先生に聞くこと（ためる・まとめる・答える）", () => {
  it("足すと q-1, q-2 … の番号が付き、前後の空白は除く", () => {
    const a = addQuestion(emptyQueue(), { question: "  オパールに爪留めしてもいい？ ", whyUnanswered: "職人の判断が要る", student: "佐藤", date: DAY });
    expect(a.item).toMatchObject({ id: "q-1", question: "オパールに爪留めしてもいい？", student: "佐藤", date: DAY });
    expect(a.item.answeredRuleId).toBeUndefined();
    const b = addQuestion(a.queue, { question: "次", whyUnanswered: "x", date: DAY });
    expect(b.item.id).toBe("q-2");
    // 外したあとも番号は重ならない
    const c = addQuestion(removeQuestions(b.queue, "q-1"), { question: "次の次", whyUnanswered: "x", date: DAY });
    expect(c.item.id).toBe("q-3");
    expect(c.queue.items.map((q) => q.id)).toEqual(["q-2", "q-3"]);
  });

  it("言い方・言葉の順・全角半角が違うだけの質問は、似ているとみなす。数が違えば別の質問", () => {
    expect(normalizeQuestion("なぜ爪は４本なんですか？")).toBe(normalizeQuestion("爪はどうして 4 本なの"));
    expect(questionSimilarity("爪はなぜ4本なの？", "爪を4本にするのはなぜ")).toBeGreaterThan(0.55);
    expect(questionSimilarity("オパールに爪留めしてもいい？", "オパールは爪留めでもいいですか")).toBeGreaterThan(0.55);
    expect(questionSimilarity("爪はなぜ4本なの？", "爪はなぜ6本なの？")).toBe(0);
    expect(questionSimilarity("爪はなぜ4本なの？", "覆輪の壁はなぜ厚くするの？")).toBeLessThan(0.55);
  });

  it("似た質問はまとめて、多く聞かれた順に並べ、先生が答える数が減る", () => {
    const q = queueOf([
      ["オパールに爪留めしてもいい？", "佐藤"],
      ["爪はなぜ4本なの？", "鈴木"],
      ["なぜ爪は４本なんですか", "高橋"],
      ["爪を4本にするのはなぜ", "鈴木"],
      ["オパールは爪留めでもいいですか", "田中"],
      ["覆輪の壁はなぜ厚くするの？"],
    ]);
    const groups = groupQuestions(q);
    expect(groups.map((g) => g.count)).toEqual([3, 2, 1]);
    expect(groups[0]).toMatchObject({ id: "q-2", question: "爪はなぜ4本なの？", ids: ["q-2", "q-3", "q-4"], students: ["鈴木", "高橋"] });
    expect(groups[1].ids).toEqual(["q-1", "q-5"]);
    expect(groups[2].students).toEqual([]);
    expect(queueCounts(q)).toEqual({ total: 6, open: 6, answered: 0, groups: 3, saved: 3 });
  });

  it("答えて目安帳に足した決まりを結びつけると、まとめた質問がそろって一覧から消える", () => {
    const q = queueOf([["爪はなぜ4本なの？"], ["なぜ爪は４本なんですか"], ["オパールに爪留めしてもいい？"]]);
    const [first] = groupQuestions(q);
    const done = markAnswered(q, first.ids, "prong-count");
    expect(done.items.filter((i) => i.answeredRuleId === "prong-count").map((i) => i.id)).toEqual(["q-1", "q-2"]);
    expect(groupQuestions(done).map((g) => g.id)).toEqual(["q-3"]);
    expect(queueCounts(done)).toEqual({ total: 3, open: 1, answered: 2, groups: 1, saved: 0 });
    // 答えたものも見たいときは、答えた・まだを混ぜずにまとめる
    const all = groupQuestions(done, { includeAnswered: true });
    expect(all.map((g) => [g.id, g.answeredRuleId])).toEqual([
      ["q-1", "prong-count"],
      ["q-3", undefined],
    ]);
    // 元の一覧は変えない
    expect(q.items.every((i) => !i.answeredRuleId)).toBe(true);
  });

  it("残しておいた中身を読むとき、形のおかしいものは捨てる", () => {
    expect(parseQueue(null)).toEqual({ items: [] });
    expect(parseQueue({ items: "x" })).toEqual({ items: [] });
    const ok = { id: "q-1", question: "爪は？", whyUnanswered: "x", date: DAY };
    expect(parseQueue({ items: [ok, { id: 2 }, null] })).toEqual({ items: [ok] });
  });
});
