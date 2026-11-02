// 教える画面：生徒の「なぜ？」に、Claude が目安帳の理由で答える。
// 目安帳に答えがない・職人でないと決められない質問は、Claude が ask_teacher で「先生に聞くこと」に回す。
// 先生に聞くことは、似た質問をまとめて、何人が聞いたかつきで見せる（先生は絞られた質問だけに答えればよい）。
// 一覧はこのブラウザに残す（localStorage）。先生が答えて目安帳に決まりを足す所は、目安帳の画面が受け持つ（onAnswer で知らせる）。
import { runClaude } from "../claude/loop";
import { teachPrompt } from "../claude/prompt";
import { TOOLS, type AskTeacherInput, type AskTeacherResult, type ToolHost } from "../claude/tools";
import type { ClaudeMessageParam } from "../claude/wire";
import type { Ledger } from "../rules/ledger";
import { plainText } from "./plain";
import {
  addQuestion,
  groupQuestions,
  markAnswered,
  parseQueue,
  queueCounts,
  type QuestionGroup,
  type TeacherQueue,
} from "../rules/teacher-queue";

export const TEACHER_QUEUE_STORE = "tsugu.teacherQueue.v1";

export interface TeachOptions {
  /** 今の目安帳（送るたびに読み直す。先生が決まりを足すと、次の答えから効く） */
  ledger: () => Ledger;
  /** 公開ページの合言葉 */
  password: () => string;
  /** 先生がまだ答えていない質問の数（似た質問はまとめて 1 つと数える）が変わったとき */
  onQueueChange?: (n: number) => void;
  /** 先生が「答えて目安帳に足す」を押したとき。目安帳の画面で決まりを足したら、markAnswered(item.ids, 決まりの id) を呼ぶ */
  onAnswer?: (item: QuestionGroup) => void;
}

export interface TeachUI {
  /** 今の「先生に聞くこと」 */
  queue(): TeacherQueue;
  /** 先生が答えて目安帳に足した決まりを、質問に結びつける（まとめの ids をそのまま渡す） */
  markAnswered(ids: string | readonly string[], ruleId: string): void;
}

export function loadTeacherQueue(): TeacherQueue {
  try {
    const raw = localStorage.getItem(TEACHER_QUEUE_STORE);
    if (raw) return parseQueue(JSON.parse(raw));
  } catch {
    // 読めなければ空から
  }
  return { items: [] };
}

function saveTeacherQueue(q: TeacherQueue) {
  try {
    localStorage.setItem(TEACHER_QUEUE_STORE, JSON.stringify(q));
  } catch {
    // 残せなくても画面は動く
  }
}

const escHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const todayStr = () => new Date().toLocaleDateString("sv-SE");

const OFFLINE_TEXT =
  "Claude につながりません。教える画面には API キーの設定が要ります。分からない質問は、下のボタンで「先生に聞くこと」に足せます。";

export function mountTeach(root: HTMLElement, opts: TeachOptions): TeachUI {
  let queue = loadTeacherQueue();
  let messages: ClaudeMessageParam[] = [];
  let lastQuestion = "";

  root.innerHTML = `
    <p class="note">生徒の「なぜ？」に、目安帳の理由で答えます。答えには、どの決まりか（誰の決まりか）が付きます。目安帳に答えがない質問は「先生に聞くこと」に残ります。</p>
    <div class="controls">
      <label>生徒の名前<input class="teach-name" type="text" placeholder="例：佐藤" /></label>
    </div>
    <div class="chat teach-log" aria-live="polite"></div>
    <div class="row" style="margin-top:6px">
      <textarea class="teach-input" rows="2" placeholder="例：角の爪はなぜ V 字にするの？"></textarea>
      <button class="primary teach-send">聞く</button>
    </div>
    <p class="note teach-status"></p>
    <div class="teach-fallback" hidden><button class="teach-queue-last">この質問を先生に聞くことに足す</button></div>

    <details class="sub teach-queue" open>
      <summary>先生に聞くこと <span class="badge teach-count">0</span></summary>
      <p class="note teach-summary"></p>
      <ul class="teach-list"></ul>
      <details class="teach-done-box" hidden>
        <summary class="note">答えた質問</summary>
        <ul class="teach-list teach-done"></ul>
      </details>
    </details>`;

  const q = <T extends HTMLElement>(cls: string) => root.querySelector<T>(`.${cls}`)!;

  function setQueue(next: TeacherQueue) {
    queue = next;
    saveTeacherQueue(queue);
    renderQueue();
  }

  function renderQueue() {
    const counts = queueCounts(queue);
    const open = groupQuestions(queue);
    const done = groupQuestions(queue, { includeAnswered: true }).filter((g) => g.answeredRuleId);
    q("teach-count").textContent = String(counts.groups);
    q("teach-summary").textContent =
      counts.open === 0
        ? "いまは、先生に聞くことはありません。"
        : `質問 ${counts.open} 件 → 先生が答えるのは ${counts.groups} 件${counts.saved > 0 ? `（似た質問をまとめて ${counts.saved} 件へらした）` : ""}`;
    q("teach-list").innerHTML = open.map(groupItem).join("");
    q("teach-done").innerHTML = done
      .map((g) => `<li class="teach-item answered"><b>${escHtml(g.question)}</b><span class="badge">${g.count} 回</span><span class="badge src-craftsman">目安帳：${escHtml(g.answeredRuleId!)}</span></li>`)
      .join("");
    q("teach-done-box").hidden = done.length === 0;
    root.querySelectorAll<HTMLButtonElement>(".teach-answer").forEach((b) =>
      b.addEventListener("click", () => {
        const g = open.find((x) => x.id === b.dataset.id);
        if (g) opts.onAnswer?.(g);
      }),
    );
    opts.onQueueChange?.(counts.groups);
  }

  function groupItem(g: QuestionGroup): string {
    const who = g.students.length ? `<span class="teach-who">${g.students.map(escHtml).join("・")}</span>` : "";
    const button = opts.onAnswer
      ? `<button class="teach-answer" data-id="${escHtml(g.id)}">答えて目安帳に足す</button>`
      : "";
    return `<li class="teach-item"><b>${escHtml(g.question)}</b><span class="badge teach-times">${g.count} 回</span>${who}<span class="why">${escHtml(g.whyUnanswered)}${
      g.context ? `／${escHtml(g.context)}` : ""
    }・${g.lastDate}</span>${button}</li>`;
  }

  const log = (who: "claude" | "you" | "note", t: string) => {
    const div = document.createElement("div");
    div.className = `msg ${who}`;
    div.textContent = who === "claude" ? plainText(t) : t;
    q("teach-log").appendChild(div);
    div.scrollIntoView({ block: "nearest" });
  };

  const studentName = () => q<HTMLInputElement>("teach-name").value.trim();

  function queueQuestion(input: AskTeacherInput): AskTeacherResult {
    const added = addQuestion(queue, {
      question: input.question,
      whyUnanswered: input.why_unanswered,
      context: input.context,
      student: studentName() || undefined,
      date: todayStr(),
    });
    setQueue(added.queue);
    log("note", `先生に聞くことに足した：${added.item.question}`);
    return { queued: true, id: added.item.id };
  }

  const notHere = () => Promise.reject(new Error("教える画面では使わない"));
  const host: ToolHost<null> = {
    setSetting: notHere,
    setShank: notHere,
    check: notHere,
    look: notHere,
    snapshot: () => null,
    restore: () => undefined,
    askTeacher: queueQuestion,
  };

  async function send() {
    const input = q<HTMLTextAreaElement>("teach-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    lastQuestion = text;
    q("teach-fallback").hidden = true;
    log("you", text);
    messages = [...messages, { role: "user", content: text }];
    q<HTMLButtonElement>("teach-send").disabled = true;
    q("teach-status").textContent = "Claude が目安帳を読んでいます…";
    const r = await runClaude({
      host,
      messages,
      system: teachPrompt(opts.ledger(), studentName() || undefined),
      tools: TOOLS.filter((t) => t.name === "ask_teacher"),
      password: opts.password(),
      onLog: (e) => {
        if (e.kind === "note" && e.source === "text") log("claude", e.text);
      },
    });
    // つながらない・キーがまだないときは、送れなかった質問を会話に残さない（次に送り直せるように）
    const noClaude = r.offline || r.error?.code === "server_not_configured";
    messages = noClaude ? messages.slice(0, -1) : r.messages;
    q<HTMLButtonElement>("teach-send").disabled = false;
    q("teach-fallback").hidden = !noClaude;
    q("teach-status").textContent = noClaude
      ? OFFLINE_TEXT
      : r.error
        ? r.error.message
        : r.remaining !== undefined
          ? `今日あと ${r.remaining} 回`
          : "";
  }

  q("teach-send").addEventListener("click", send);
  q<HTMLTextAreaElement>("teach-input").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      void send();
    }
  });
  q("teach-queue-last").addEventListener("click", () => {
    if (!lastQuestion) return;
    queueQuestion({ question: lastQuestion, why_unanswered: "Claude につながらず、目安帳で確かめられなかった" });
    q("teach-fallback").hidden = true;
  });

  renderQueue();
  return {
    queue: () => queue,
    markAnswered: (ids, ruleId) => setQueue(markAnswered(queue, ids, ruleId)),
  };
}
