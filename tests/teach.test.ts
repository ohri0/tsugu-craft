// 教える（生徒の「なぜ？」に目安帳で答える・先生に聞くこと）のテスト。本物の Claude は呼ばない。
import { describe, expect, it } from "vitest";
import { runClaude } from "../src/claude/loop";
import { teachPrompt } from "../src/claude/prompt";
import { parseToolCall, TOOLS, type AskTeacherInput, type ToolHost } from "../src/claude/tools";
import type { ClaudeMessage, ClaudeMessageParam } from "../src/claude/wire";
import { GUIDE_NOTE } from "../src/rules/guides";
import { addRule, ledgerText, seedLedger } from "../src/rules/ledger";
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

// ---- Claude との繰り返し（偽の fetch） ----

type Block = Record<string, unknown>;

function reply(stop_reason: string, content: Block[]): ClaudeMessage {
  return {
    id: "msg_teach",
    type: "message",
    role: "assistant",
    model: "test-model",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as ClaudeMessage;
}

/** 決めた順に返事を返す fetch。送られた中身を残す */
function fakeFetch(replies: ClaudeMessage[]) {
  const sent: { messages: ClaudeMessageParam[]; system?: string; tools: { name: string }[] }[] = [];
  const impl: typeof fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    const r = replies[sent.length - 1];
    if (!r) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { impl, sent };
}

/** 教える画面と同じ形の偽の道具：先生に聞くことに足すだけ */
function teachHost() {
  let queue = emptyQueue();
  const notHere = () => Promise.reject(new Error("教える画面では使わない"));
  const host: ToolHost<null> = {
    setSetting: notHere,
    setShank: notHere,
    check: notHere,
    look: notHere,
    snapshot: () => null,
    restore: () => undefined,
    askTeacher: (input: AskTeacherInput) => {
      const added = addQuestion(queue, { question: input.question, whyUnanswered: input.why_unanswered, context: input.context, student: "佐藤", date: DAY });
      queue = added.queue;
      return { queued: true, id: added.item.id };
    },
  };
  return { host, queue: () => queue };
}

const onlyAsk = TOOLS.filter((t) => t.name === "ask_teacher");

describe("教える（Claude が目安帳で答える）", () => {
  it("目安帳に答えがあれば、道具を使わず、決まりの名前と出どころを添えて答える", async () => {
    const ledger = seedLedger();
    const { host, queue } = teachHost();
    const answer = "[corner-reach] 尖った角を守る（公開情報：教科書・公開情報レベルの目安）によると、角の先は欠けやすいので、角の近くに爪を置きます。";
    const f = fakeFetch([reply("end_turn", [{ type: "text", text: answer }])]);
    const r = await runClaude({
      host,
      messages: [{ role: "user", content: "角の爪はなぜ V 字にするの？" }],
      system: teachPrompt(ledger, "佐藤"),
      tools: onlyAsk,
      fetch: f.impl,
    });
    expect(r.status).toBe("done");
    expect(r.finalText).toBe(answer);
    expect(r.log.filter((e) => e.kind === "tool")).toEqual([]);
    expect(queue().items).toEqual([]);
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0].tools.map((t) => t.name)).toEqual(["ask_teacher"]);
    expect(f.sent[0].system).toContain("[corner-reach]");
  });

  it("目安帳に答えがなければ ask_teacher を呼び、画面が先生に聞くことに足して、その番号を返す", async () => {
    const { host, queue } = teachHost();
    const ask = { question: "オパールに爪留めしてもいい？", why_unanswered: "目安帳にオパールの決まりがない", context: "やわらかい石" };
    const f = fakeFetch([
      reply("tool_use", [
        { type: "text", text: "目安帳には、オパールの決まりがありません。先生に聞きます。" },
        { type: "tool_use", id: "t1", name: "ask_teacher", input: ask },
      ]),
      reply("end_turn", [{ type: "text", text: "先生に聞くことに足しました。" }]),
    ]);
    const r = await runClaude({
      host,
      messages: [{ role: "user", content: "オパールに爪留めしてもいい？" }],
      system: teachPrompt(seedLedger()),
      tools: onlyAsk,
      fetch: f.impl,
    });
    expect(r.status).toBe("done");
    expect(queue().items).toEqual([
      { id: "q-1", question: ask.question, whyUnanswered: ask.why_unanswered, context: ask.context, student: "佐藤", date: DAY },
    ]);
    const result = (f.sent[1].messages[2].content as unknown as Block[])[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(JSON.parse(String(result.content))).toEqual({ queued: true, id: "q-1" });
    expect(r.changed).toBe(false);
  });

  it("教える画面でなければ、先生に回さずに断ったと返す", async () => {
    const { host } = teachHost();
    delete host.askTeacher;
    const f = fakeFetch([
      reply("tool_use", [{ type: "tool_use", id: "t1", name: "ask_teacher", input: { question: "q", why_unanswered: "w" } }]),
      reply("end_turn", [{ type: "text", text: "分かりません。" }]),
    ]);
    await runClaude({ host, messages: [{ role: "user", content: "q" }], fetch: f.impl });
    const result = JSON.parse(String((f.sent[1].messages[2].content as unknown as Block[])[0].content));
    expect(result.queued).toBe(false);
  });

  it("ask_teacher の入力：質問と理由は空にできない", () => {
    expect(parseToolCall("ask_teacher", { question: "爪は？", why_unanswered: "決まりがない" }).ok).toBe(true);
    expect(parseToolCall("ask_teacher", { question: " ", why_unanswered: "決まりがない" }).ok).toBe(false);
    expect(parseToolCall("ask_teacher", { question: "爪は？" }).ok).toBe(false);
    expect(parseToolCall("ask_teacher", { question: "爪は？", why_unanswered: "x", extra: 1 }).ok).toBe(false);
  });
});

describe("教える助手への指示（teachPrompt）", () => {
  it("目安帳の中身と、職人の決まりの出どころを含む", () => {
    const ledger = addRule(seedLedger(), {
      title: "鋳造の爪の根元",
      text: "鋳造の爪は根元を 1.2 mm にする",
      reason: "根元から折れやすい",
      source: { kind: "craftsman", name: "山田" },
      date: DAY,
    });
    const p = teachPrompt(ledger, "佐藤");
    expect(p).toContain(ledgerText(ledger));
    expect(p).toContain("職人：山田");
    expect(p).toContain("佐藤さん");
    expect(p).toContain("<jeweler_guides>");
  });

  it("数字や決まりを作らない・答えがなければ ask_teacher・作り方は教えない・目安の断り書き", () => {
    const p = teachPrompt(seedLedger());
    expect(p).toContain("数字や決まりを作りません");
    expect(p).toContain("ask_teacher");
    expect(p).toContain("作り方（製作工程・手の動かし方）は教えません");
    expect(p).toContain("1 つだけ聞き返して");
    expect(p).toContain(GUIDE_NOTE);
    // 名前がないときは「生徒」と呼ぶ
    expect(p).toContain("生徒の「なぜ？」");
  });
});
