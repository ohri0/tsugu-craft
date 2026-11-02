// 作品の記録：作った物ごとに、画像・寸法・作れるか・作り方・職人のひとことを残す。
// 一点ものは同じ物を繰り返し作って覚えられない。だから作るたびに残し、次の人がそこから始められるようにする。
// このブラウザに残し（localStorage）、印刷できる。画面に依存しない（保存の所だけ localStorage を使う）。
import type { Step } from "./howto";
import type { Tip } from "./tips";
import type { StoneParams } from "../geometry/stone";
import type { RingState } from "./session";

export interface WorkRecord {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** 何を作ったか（一粒石の指輪・甲丸の指輪 など） */
  kind: string;
  methodLabel: string;
  /** 小さな画像（data URL、JPEG） */
  image: string;
  specs: { label: string; value: string }[];
  problems: string[];
  steps: Step[];
  /** 職人のひとこと（あれば） */
  note: string;
  maker: string;
  /** 話したことを Claude が工程ごとに分けたコツ */
  tips?: Tip[];
  /** 組み直せる設計（一粒石の指輪）。新しい決まりで確かめ直すのに使う */
  design?: { stone: StoneParams; state: RingState };
  /** 新しい決まりで直した記録（いつ・誰の決まりで・何を） */
  revisions?: { date: string; by: string; rule: string; change: string }[];
}

const STORE = "tsugu.works.v1";

export function parseWorks(raw: unknown): WorkRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((w): w is WorkRecord => typeof w === "object" && w !== null && typeof (w as WorkRecord).id === "string" && Array.isArray((w as WorkRecord).steps));
}

export function loadWorks(): WorkRecord[] {
  try {
    return parseWorks(JSON.parse(localStorage.getItem(STORE) ?? "[]"));
  } catch {
    return [];
  }
}

/** 置き換える（同じ id の記録を）。入りきらないときは false */
export function updateWork(w: WorkRecord): boolean {
  const all = loadWorks().map((x) => (x.id === w.id ? w : x));
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** 足す（新しい順の先頭に）。入りきらないときは false */
export function saveWork(w: WorkRecord): boolean {
  const all = [w, ...loadWorks()];
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function removeWork(id: string): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(loadWorks().filter((w) => w.id !== id)));
  } catch {
    // 消せなくても画面は動く
  }
}

export const newWorkId = () => `work-${Date.now().toString(36)}`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 記録の帳面（印刷用）：1 作品 1 ページ */
export function worksBookHtml(works: readonly WorkRecord[], date: string): string {
  const page = (w: WorkRecord) => `<section class="page">
    <header><h2>${esc(w.title)}</h2><small>${esc(w.date)}${w.maker ? ` ・ ${esc(w.maker)}` : ""} ・ ${esc(w.methodLabel)}</small></header>
    <div class="top"><img alt="" src="${w.image}"><dl>${w.specs.map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join("")}</dl></div>
    ${w.note ? `<blockquote>「${esc(w.note)}」</blockquote>` : ""}
    ${(w.revisions ?? []).map((r) => `<p class="rev">${esc(r.date)} ${esc(r.by)}さんの決まり「${esc(r.rule)}」で直した：${esc(r.change)}</p>`).join("")}
    <p class="v ${w.problems.length ? "ng" : "ok"}">${w.problems.length ? `作れない所があった：${w.problems.map(esc).join("、")}` : "作れる形だった"}</p>
    <ol>${w.steps.map((s) => `<li><b>${esc(s.title)}</b> ${esc(s.text)}${s.specs.length ? `<br><small>${s.specs.map((x) => `${esc(x.label)} ${esc(x.value)}`).join(" ・ ")}</small>` : ""}${(w.tips ?? []).filter((t) => t.step === s.title).map((t) => `<br><em class="tip">${esc(t.kind)}：${esc(t.text)}</em>`).join("")}</li>`).join("")}</ol>
  </section>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>作品の記録</title><style>
@page { size: A4; margin: 0; } * { box-sizing: border-box; }
body { margin: 0; font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; color: #1f1c18; }
.cover, .page { width: 210mm; min-height: 297mm; padding: 16mm; page-break-after: always; }
.cover h1 { font-family: "Hiragino Mincho ProN", "Yu Mincho", serif; font-size: 28pt; font-weight: 600; margin: 60mm 0 6mm; letter-spacing: 0.1em; }
.cover p { font-size: 11pt; line-height: 1.9; color: #4a443c; max-width: 140mm; }
.rev { color: #0b5cad; font-size: 9pt; margin: 2mm 0; }
.tip { font-style: normal; color: #0b5cad; font-size: 9pt; }
header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.4mm solid #1f1c18; padding-bottom: 2mm; }
h2 { margin: 0; font-family: "Hiragino Mincho ProN", "Yu Mincho", serif; font-weight: 600; font-size: 17pt; }
header small { font-size: 8.5pt; color: #6e665b; }
.top { display: grid; grid-template-columns: 70mm 1fr; gap: 6mm; margin-top: 5mm; }
.top img { width: 70mm; height: 70mm; object-fit: cover; border-radius: 2mm; background: #111; }
dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 5mm; align-content: start; }
dt { font-size: 7.5pt; color: #6e665b; } dd { margin: 0.5mm 0 0; font-size: 10.5pt; }
blockquote { margin: 5mm 0 0; padding: 3mm 4mm; border-left: 1mm solid #8c6a33; background: #f6f0e3; font-family: "Hiragino Mincho ProN", serif; font-size: 11pt; }
.v { margin: 4mm 0 0; padding: 2mm 4mm; border-radius: 2mm; font-size: 10pt; } .ok { background: #e6f2ea; color: #1f5c39; } .ng { background: #f8e3de; color: #8a2a1c; }
ol { margin: 5mm 0 0; padding-left: 6mm; font-size: 9.5pt; line-height: 1.7; } li { margin-bottom: 2mm; } li small { color: #6e665b; }
</style></head><body>
<section class="cover"><h1>作品の記録</h1><p>作った物ごとに、形・作れるか・作り方・職人のひとことを残した帳面です。一点ものは、同じ物を繰り返し作って覚えることができません。だから作るたびに残し、次に作る人がここから始められるようにしています。</p><p>${works.length} 作品 ・ 書き出した日 ${esc(date)}</p></section>
${works.map(page).join("\n")}
</body></html>`;
}
