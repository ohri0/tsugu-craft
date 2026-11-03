// 継ぐ：3 つの画面。見る（学ぶ人）・組み立て直す（途切れた技）・残す（職人）。言葉で聞く（#ask）は「見る」から開く。
// 画面の切り替えは URL の # で（#see / #ask / #rebuild / #keep）。スマホは下のタブ、PC は上のタブ。
import "./app.css";
import { mountAsk } from "./ask";
import { mountSee } from "./see";
import { mountKeep } from "./keep";
import { mountRebuild } from "./rebuild";
import { onStoreChange, store } from "./store";
import { groupQuestions } from "../rules/teacher-queue";

type ViewId = "see" | "ask" | "rebuild" | "keep";
const VIEWS: { id: ViewId; label: string; sub: string; icon: string; hidden?: boolean }[] = [
  { id: "see", label: "学ぶ", sub: "次の人", icon: `<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>` },
  { id: "ask", label: "言葉で聞く", sub: "学ぶ人", hidden: true, icon: `<path d="M4 5h16v11H8l-4 4V5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>` },
  { id: "keep", label: "残す", sub: "職人", icon: `<path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0M12 18v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` },
  { id: "rebuild", label: "組み立て直す", sub: "途切れた技", icon: `<path d="M4 18h16M6 14h12M8 10h8M10 6h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` },
];

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="app">
  <header class="bar">
    <a class="brand" href="./" aria-label="継ぐ（始めの画面へ）" title="始めの画面へ"><span class="seal">継</span><span class="name">継ぐ</span></a>
    <nav class="nav" aria-label="画面"><a href="studio.html" class="to-design"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="14" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 4h6l-3 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>設計</span></a>${VIEWS.filter((v) => !v.hidden).map((v) => `<a href="#${v.id}" data-view="${v.id}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${v.icon}</svg><span>${v.label}</span><i class="badge" hidden></i></a>`).join("")}</nav>
    <div class="bar-r"><button type="button" class="ghost help" aria-label="使い方">使い方</button></div>
  </header>
  <main>${VIEWS.map((v) => `<div class="screen" id="screen-${v.id}" hidden></div>`).join("")}</main>
</div>
<dialog class="sheet intro">
  <form method="dialog">
    <p class="eyebrow">継ぐ</p>
    <h3>職人の判断と手を、次の人へ。</h3>
    <ol class="steps">
      <li><b>見る</b><span>職人の手本の動画を見て、自分の手を撮って比べます。どの瞬間がどれだけ違うかを、手の動きで見せます。</span></li>
      <li><b>残す</b><span>職人は、作業を撮るだけ。届いた質問には、声で答えるだけ。答えは決まりになって、次の人に届きます。</span></li>
      <li><b>組み立て直す</b><span>途切れた技を、残っている手がかりから組み立て直します。答えを隠して、たどり着けるかを確かめます。</span></li>
    </ol>
    <div class="sheet-actions"><button value="ok" class="primary">始める</button></div>
  </form>
</dialog>`;

const screens = Object.fromEntries(VIEWS.map((v) => [v.id, document.getElementById(`screen-${v.id}`)!])) as Record<ViewId, HTMLElement>;
const see = mountSee(screens.see);
const ask = mountAsk(screens.ask);
const keep = mountKeep(screens.keep, { onExampleSaved: () => see.refresh() });
const mounted: Partial<Record<ViewId, boolean>> = { see: true, ask: true, keep: true };

function show() {
  const id = (location.hash.slice(1) as ViewId) || "see";
  const view = VIEWS.some((v) => v.id === id) ? id : "see";
  if (view === "rebuild" && !mounted.rebuild) {
    mountRebuild(screens.rebuild);
    mounted.rebuild = true;
  }
  for (const v of VIEWS) screens[v.id].hidden = v.id !== view;
  document.querySelectorAll<HTMLAnchorElement>(".nav a").forEach((a) => a.setAttribute("aria-current", a.dataset.view === view || (view === "ask" && a.dataset.view === "see") ? "page" : "false"));
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", show);
show();

function badges() {
  const open = groupQuestions(store.queue()).filter((g) => !g.answeredRuleId).length;
  const b = document.querySelector<HTMLElement>('.nav a[data-view="keep"] .badge')!;
  b.hidden = open === 0;
  b.textContent = String(open);
}
onStoreChange(() => {
  ask.refresh();
  keep.refresh();
  badges();
});
badges();

const intro = document.querySelector<HTMLDialogElement>(".intro")!;
intro.addEventListener("close", () => store.setIntroSeen());
document.querySelector(".help")!.addEventListener("click", () => intro.showModal());
// ほかの画面からの「組み立て直す」などのリンクで来たときは、説明を出さずにその場面へ
if (!store.introSeen() && !location.hash && !new URLSearchParams(location.search).has("nointro")) intro.showModal();
