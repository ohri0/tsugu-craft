// 先生に聞くこと：目安帳では答えられない生徒の質問をためる所。
// 生徒が多くても、先生が答える数を減らすため、似た質問はまとめて 1 つにして見せる（何人が聞いたかを添える）。
// 先生が答えて目安帳に決まりを足したら、その決まりの id を結びつけて「答えた」にする。次からは Claude が目安帳で答えられる。
// 画面に依存しない、純粋な関数だけを置く。

export interface TeacherQuestion {
  id: string;
  /** 生徒の質問（短く） */
  question: string;
  /** なぜ目安帳では答えられないか */
  whyUnanswered: string;
  /** 先生が答えやすくなる話の流れ（あれば） */
  context?: string;
  /** 聞いた生徒の名前（あれば） */
  student?: string;
  /** YYYY-MM-DD */
  date: string;
  /** 先生が答えて目安帳に足した決まりの id */
  answeredRuleId?: string;
}

export interface TeacherQueue {
  /** 聞かれた順 */
  items: TeacherQuestion[];
}

/** 似た質問をまとめたもの（先生が見る 1 行） */
export interface QuestionGroup {
  /** まとめの名前（いちばん先に聞かれた質問の id） */
  id: string;
  /** 見せる質問（いちばん先に聞かれたもの） */
  question: string;
  whyUnanswered: string;
  context?: string;
  /** まとめた質問の id（聞かれた順） */
  ids: string[];
  items: TeacherQuestion[];
  /** 何回聞かれたか */
  count: number;
  /** 聞いた生徒（重ならないように） */
  students: string[];
  /** いちばん新しく聞かれた日 */
  lastDate: string;
  /** 答えたときの決まりの id（まとめた質問のどれかに付いていれば） */
  answeredRuleId?: string;
}

export interface QueueCounts {
  /** ためた質問の数 */
  total: number;
  /** まだ答えていない質問の数 */
  open: number;
  /** 答えた質問の数 */
  answered: number;
  /** まだ答えていない質問を、まとめた後の数（先生が答える数） */
  groups: number;
  /** まとめたことで、先生が答えずにすむ数（open − groups） */
  saved: number;
}

/** 似ているとみなす目安（0〜1）。文字の 2 つ組の重なりで比べる */
export const SIMILAR_THRESHOLD = 0.55;

export function emptyQueue(): TeacherQueue {
  return { items: [] };
}

/** 質問を足す。足した質問も返す（id は q-1, q-2, … の順） */
export function addQuestion(
  queue: TeacherQueue,
  q: Omit<TeacherQuestion, "id" | "answeredRuleId">,
): { queue: TeacherQueue; item: TeacherQuestion } {
  const item: TeacherQuestion = {
    id: nextId(queue),
    question: q.question.trim(),
    whyUnanswered: q.whyUnanswered.trim(),
    date: q.date,
    ...(q.context?.trim() ? { context: q.context.trim() } : {}),
    ...(q.student?.trim() ? { student: q.student.trim() } : {}),
  };
  return { queue: { items: [...queue.items, item] }, item };
}

/** 先生が答えた（目安帳に決まりを足した）質問に、その決まりの id を結びつける。まとめの id の並びを渡してもよい */
export function markAnswered(queue: TeacherQueue, ids: string | readonly string[], ruleId: string): TeacherQueue {
  const set = new Set(typeof ids === "string" ? [ids] : ids);
  return { items: queue.items.map((q) => (set.has(q.id) ? { ...q, answeredRuleId: ruleId } : q)) };
}

/** 質問を外す（間違えて足したとき） */
export function removeQuestions(queue: TeacherQueue, ids: string | readonly string[]): TeacherQueue {
  const set = new Set(typeof ids === "string" ? [ids] : ids);
  return { items: queue.items.filter((q) => !set.has(q.id)) };
}

/** 質問の終わりの言い回し（長いものを先に） */
const ENDINGS = /(のでしょうか|でしょうか|なのですか|のですか|なんですか|んですか|ですか|ますか|なのか|なの|のか|のは|か|の|は)$/u;

/**
 * 比べるための形にそろえる：全角と半角をそろえ、小文字にし、空白・記号を除く。
 * ほとんどの質問に付く「なぜ・どうして・なんで」と、終わりの言い回し（ですか、なの など）も除く。
 * 漢字・カタカナ・数字のすぐ後の助詞（は・を・が・に・の など）も除き、言葉の順が違っても似て見えるようにする。
 */
export function normalizeQuestion(text: string): string {
  let s = text.normalize("NFKC").toLowerCase();
  s = s.replace(/[\s\p{P}\p{S}]+/gu, "");
  s = stripEndings(s);
  s = s.replace(/(どうして|なんで|なぜ)/g, "");
  s = stripEndings(s);
  s = s.replace(/(?<=[^\p{Script=Hiragana}])[はをがにのもへとで]/gu, "");
  return s;
}

function stripEndings(s: string): string {
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(ENDINGS, "");
  }
  return s;
}

/** 質問の中の数（4 本、0.9 mm など） */
function numbersOf(s: string): string {
  return (s.match(/\d+(?:\.\d+)?/g) ?? []).join(",");
}

/**
 * 2 つの質問がどれくらい似ているか（0〜1）。文字の 2 つ組（「爪4」「4本」…）の重なり。
 * 数が違う質問（4 本と 6 本）は、答えも違うので、似ていないとする。
 */
export function questionSimilarity(a: string, b: string): number {
  const x = normalizeQuestion(a);
  const y = normalizeQuestion(b);
  const nx = numbersOf(x);
  const ny = numbersOf(y);
  if (nx && ny && nx !== ny) return 0;
  if (x === y) return 1;
  const bx = bigrams(x);
  const by = bigrams(y);
  if (bx.size === 0 || by.size === 0) return 0;
  let both = 0;
  for (const g of bx) if (by.has(g)) both++;
  return (2 * both) / (bx.size + by.size);
}

/**
 * 似た質問をまとめる。聞かれた順に見て、すでにあるまとめのどれかの質問と似ていれば、そこに入れる。
 * 並びは、多く聞かれた順（同じなら先に聞かれた順）。既定では、まだ答えていない質問だけをまとめる。
 */
export function groupQuestions(
  queue: TeacherQueue,
  opts: { threshold?: number; includeAnswered?: boolean } = {},
): QuestionGroup[] {
  const threshold = opts.threshold ?? SIMILAR_THRESHOLD;
  const items = opts.includeAnswered ? queue.items : queue.items.filter((q) => !q.answeredRuleId);
  const buckets: TeacherQuestion[][] = [];
  for (const q of items) {
    let best: TeacherQuestion[] | undefined;
    let bestScore = threshold;
    for (const b of buckets) {
      // 答えた質問と、まだの質問は、同じまとめに入れない（答えたかどうかが混ざらないように）
      if (Boolean(b[0].answeredRuleId) !== Boolean(q.answeredRuleId)) continue;
      const score = Math.max(...b.map((m) => questionSimilarity(m.question, q.question)));
      if (score >= bestScore) {
        best = b;
        bestScore = score;
      }
    }
    if (best) best.push(q);
    else buckets.push([q]);
  }
  const order = new Map(items.map((q, i) => [q.id, i]));
  return buckets
    .map(toGroup)
    .sort((a, b) => b.count - a.count || order.get(a.id)! - order.get(b.id)!);
}

/** 数（先生が答える数がどれだけ減ったか） */
export function queueCounts(queue: TeacherQueue, threshold = SIMILAR_THRESHOLD): QueueCounts {
  const open = queue.items.filter((q) => !q.answeredRuleId).length;
  const groups = groupQuestions(queue, { threshold }).length;
  return { total: queue.items.length, open, answered: queue.items.length - open, groups, saved: open - groups };
}

/** 残しておいた中身を読む。形のおかしい質問は捨てる */
export function parseQueue(raw: unknown): TeacherQueue {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { items?: unknown }).items)) return emptyQueue();
  const items = ((raw as { items: unknown[] }).items).filter(
    (q): q is TeacherQuestion =>
      typeof q === "object" &&
      q !== null &&
      typeof (q as TeacherQuestion).id === "string" &&
      typeof (q as TeacherQuestion).question === "string" &&
      typeof (q as TeacherQuestion).whyUnanswered === "string" &&
      typeof (q as TeacherQuestion).date === "string",
  );
  return { items };
}

function toGroup(items: TeacherQuestion[]): QuestionGroup {
  const first = items[0];
  const students = [...new Set(items.flatMap((q) => (q.student ? [q.student] : [])))];
  const answered = items.find((q) => q.answeredRuleId)?.answeredRuleId;
  return {
    id: first.id,
    question: first.question,
    whyUnanswered: first.whyUnanswered,
    ...(first.context ? { context: first.context } : {}),
    ids: items.map((q) => q.id),
    items,
    count: items.length,
    students,
    lastDate: items.reduce((d, q) => (q.date > d ? q.date : d), first.date),
    ...(answered ? { answeredRuleId: answered } : {}),
  };
}

function bigrams(s: string): Set<string> {
  const chars = [...s];
  if (chars.length === 1) return new Set(chars);
  const out = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) out.add(chars[i] + chars[i + 1]);
  return out;
}

function nextId(queue: TeacherQueue): string {
  const max = queue.items.reduce((m, q) => {
    const n = /^q-(\d+)$/.exec(q.id);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `q-${max + 1}`;
}
