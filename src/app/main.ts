// 継ぐ：3 つの画面。聞く（学ぶ人）・組み立て直す（途切れた技）・残す（職人）。
// 画面の切り替えは URL の # で（#ask / #rebuild / #keep）。スマホは下のタブ、PC は上のタブ。
import "./app.css";
import { mountAsk } from "./ask";
import { mountKeep } from "./keep";
import { mountRebuild } from "./rebuild";
import { onStoreChange, store } from "./store";
import { groupQuestions } from "../rules/teacher-queue";

type ViewId = "ask" | "rebuild" | "keep";
const VIEWS: { id: ViewId; label: string; sub: string; icon: string }[] = [
  { id: "ask", label: "聞く", sub: "学ぶ人", icon: `<path d="M4 5h16v11H8l-4 4V5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>` },
  { id: "rebuild", label: "組み立て直す", sub: "途切れた技", icon: `<path d="M4 18h16M6 14h12M8 10h8M10 6h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` },
  { id: "keep", label: "残す", sub: "職人", icon: `<path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0M12 18v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` },
];

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="app">
  <header class="bar">
    <a class="brand" href="#ask" aria-label="継ぐ"><span class="seal">継</span><span class="name">継ぐ</span></a>
    <nav class="nav" aria-label="画面">${VIEWS.map((v) => `<a href="#${v.id}" data-view="${v.id}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${v.icon}</svg><span>${v.label}</span><i class="badge" hidden></i></a>`).join("")}</nav>
    <button type="button" class="ghost help" aria-label="使い方">使い方</button>
  </header>
  <main>${VIEWS.map((v) => `<div class="screen" id="screen-${v.id}" hidden></div>`).join("")}</main>
</div>
<dialog class="sheet intro">
  <form method="dialog">
    <p class="eyebrow">継ぐ</p>
    <h3>職人の判断と手を、次の人へ。</h3>
    <ol class="steps">
      <li><b>聞く</b><span>学ぶ人が質問すると、職人が残した決まりから、理由つきで答えます。答えられないことは職人に回ります。</span></li>
      <li><b>残す</b><span>職人は、届いた質問に声で答えるだけ。答えは決まりになって、次から「聞く」で答えられます。</span></li>
      <li><b>組み立て直す</b><span>途切れた技を、残っている手がかりから組み立て直します。答えを隠して、たどり着けるかを確かめます。</span></li>
    </ol>
    <div class="sheet-actions"><button value="ok" class="primary">始める</button></div>
  </form>
</dialog>`;

const screens = Object.fromEntries(VIEWS.map((v) => [v.id, document.getElementById(`screen-${v.id}`)!])) as Record<ViewId, HTMLElement>;
const ask = mountAsk(screens.ask);
const keep = mountKeep(screens.keep);
const mounted: Partial<Record<ViewId, boolean>> = { ask: true, keep: true };

function show() {
  const id = (location.hash.slice(1) as ViewId) || "ask";
  const view = VIEWS.some((v) => v.id === id) ? id : "ask";
  if (view === "rebuild" && !mounted.rebuild) {
    mountRebuild(screens.rebuild);
    mounted.rebuild = true;
  }
  for (const v of VIEWS) screens[v.id].hidden = v.id !== view;
  document.querySelectorAll<HTMLAnchorElement>(".nav a").forEach((a) => a.setAttribute("aria-current", a.dataset.view === view ? "page" : "false"));
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
if (!store.introSeen() && !new URLSearchParams(location.search).has("nointro")) intro.showModal();
