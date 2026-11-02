// 技の帳面：目安帳と、先生に聞いて答えが出たこと、手の記録を、アプリがなくても読める 1 枚の HTML にする。
// 「もしも」のとき（教える人が突然いなくなった・後継者が抜けた）に備え、印刷しても、ファイルのままでも読める形で残す。
// 画面に依存しない純粋な関数。
import { activeRules, PARAMS, sizeStepsText, sourceLabel, type Ledger, type Rule } from "./ledger";

/** 先生に聞いて答えが出たこと（教えるの画面から） */
export interface AnsweredQuestion {
  question: string;
  count: number;
  ruleId?: string;
}

/** 手の記録の要約（手の記録の画面から） */
export interface MotionSummary {
  title: string;
  craftsman: string;
  date: string;
  videoName: string;
  durationS: number;
  /** 一言で書いた動きの数字（例：1 分あたり 92 回・振れ幅…） */
  metrics: string[];
  notes: { t: number; text: string }[];
}

export interface BookInput {
  ledger: Ledger;
  answered?: AnsweredQuestion[];
  motions?: MotionSummary[];
  /** 書き出した日（YYYY-MM-DD） */
  date: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function ruleValue(r: Rule): string {
  if (!r.param) return "";
  const unit = PARAMS[r.param].unit;
  if (r.bySize?.length) return sizeStepsText(r.bySize, unit);
  return r.value !== undefined ? `${r.value}${unit}` : "";
}

function ruleBlock(r: Rule, history: Rule[]): string {
  const v = ruleValue(r);
  return `<section class="rule">
  <h3>${esc(r.title)}</h3>
  <p>${esc(r.text)}</p>
  ${v ? `<p class="v">数字：${esc(v)}${r.param ? `（${esc(PARAMS[r.param].label)}）` : ""}</p>` : ""}
  <p><b>理由</b>：${esc(r.reason)}</p>
  ${r.example ? `<p><b>例</b>：${esc(r.example)}</p>` : ""}
  ${r.quote ? `<p class="q">「${esc(r.quote)}」</p>` : ""}
  <p class="src">${esc(sourceLabel(r.source))}・${esc(r.date)}${"url" in r.source && r.source.url ? `・${esc(r.source.url)}` : ""}</p>
  ${history.length ? `<p class="hist">前の決まり：${history.map((h) => `${esc(h.title)}（${esc(ruleValue(h) || h.text)}、${esc(sourceLabel(h.source))}・${esc(h.date)}）`).join("／")}</p>` : ""}
</section>`;
}

/** 置き換えられた決まりをたどる（新しい順） */
function historyOf(ledger: Ledger, r: Rule): Rule[] {
  const out: Rule[] = [];
  let cur = r.replaces;
  while (cur) {
    const prev = ledger.rules.find((x) => x.id === cur);
    if (!prev) break;
    out.push(prev);
    cur = prev.replaces;
  }
  return out;
}

export function bookHtml({ ledger, answered = [], motions = [], date }: BookInput): string {
  const rules = activeRules(ledger);
  const craftsman = rules.filter((r) => r.source.kind === "craftsman");
  const others = rules.filter((r) => r.source.kind !== "craftsman");
  const names = [...new Set(craftsman.map((r) => (r.source.kind === "craftsman" ? r.source.name : "")))].filter(Boolean);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>技の帳面（${esc(ledger.craft)}）</title>
<style>
@page { size: A4; margin: 16mm; }
body { font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; color: #222; line-height: 1.6; max-width: 180mm; margin: 0 auto; }
h1 { font-size: 20pt; margin: 0 0 4pt; } h2 { font-size: 14pt; border-bottom: 1px solid #999; margin-top: 18pt; } h3 { font-size: 11.5pt; margin: 0 0 2pt; }
.rule { break-inside: avoid; border-left: 3px solid #8a6a3b; padding: 2pt 0 2pt 8pt; margin: 8pt 0; }
.rule p { margin: 1pt 0; font-size: 10pt; } .src, .hist { color: #666; font-size: 9pt !important; } .q { color: #6b4c1f; }
.note { font-size: 9.5pt; color: #444; } table { border-collapse: collapse; font-size: 9.5pt; } td, th { border: 1px solid #ccc; padding: 2pt 6pt; text-align: left; }
</style></head><body>
<h1>技の帳面</h1>
<p>${esc(ledger.craft)}　書き出した日：${esc(date)}${names.length ? `　決まりを残した職人：${names.map(esc).join("・")}` : ""}</p>
<p class="note">この帳面は、職人の判断とその理由、手の動きの記録を、次に学ぶ人のために残したものです。アプリがなくても読めるように書いています。数字はすべて目安で、最後は職人が決めます。作り方の手順そのものではなく、「何を見て・どこまでなら・なぜ」を残しています。</p>

<h2>職人の決まり（${craftsman.length}）</h2>
${craftsman.length ? craftsman.map((r) => ruleBlock(r, historyOf(ledger, r))).join("\n") : '<p class="note">まだありません。</p>'}

<h2>先生に聞いて分かったこと（${answered.length}）</h2>
${
  answered.length
    ? `<table><tr><th>聞かれたこと</th><th>回数</th><th>答えになった決まり</th></tr>${answered
        .map((a) => `<tr><td>${esc(a.question)}</td><td>${a.count}</td><td>${esc(rules.find((r) => r.id === a.ruleId)?.title ?? "")}</td></tr>`)
        .join("")}</table>`
    : '<p class="note">まだありません。</p>'
}

<h2>手の記録（${motions.length}）</h2>
${
  motions.length
    ? motions
        .map(
          (m) => `<section class="rule"><h3>${esc(m.title)}</h3>
  <p class="src">${esc(m.craftsman)}・${esc(m.date)}・動画 ${esc(m.videoName)}（${mmss(m.durationS)}）</p>
  ${m.metrics.map((x) => `<p>${esc(x)}</p>`).join("")}
  ${m.notes.map((n) => `<p>${mmss(n.t)}　${esc(n.text)}</p>`).join("")}
</section>`,
        )
        .join("\n")
    : '<p class="note">まだありません。</p>'
}

<h2>公開情報・教科書の目安（${others.length}）</h2>
${others.map((r) => ruleBlock(r, historyOf(ledger, r))).join("\n")}
</body></html>`;
}
