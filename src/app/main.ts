// 継ぐ：下のタブは 4 つ。設計（studio.html）・帳面・学ぶ・技。
// 画面の切り替えは URL の # で（#ledger / #learn / #waza）。「/」の後ろは画面の中の場所（#learn/hands・#waza/nanako・#waza/rebuild）。
// 前の名前（#see・#ask・#keep・#rebuild・#waza/ring）で来ても、新しい場所へ送る。スマホは下のタブ、PC は上のタブ。
import "./app.css";
import { mountAsk } from "./ask";
import { mountSee } from "./see";
import { mountKeep } from "./keep";
import { mountWaza } from "./waza";
import { redirectHash } from "./routes";
import { onStoreChange, store } from "./store";
import { groupQuestions } from "../rules/teacher-queue";

type ViewId = "ledger" | "learn" | "waza";
const VIEWS: { id: ViewId; label: string; icon: string }[] = [
  { id: "ledger", label: "帳面", icon: `<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9h6M9 13h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` },
  { id: "learn", label: "学ぶ", icon: `<path d="M4 5h16v11H8l-4 4V5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>` },
  { id: "waza", label: "技", icon: `<circle cx="7" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9.5" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="14.5" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/>` },
];

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="app">
  <header class="bar">
    <a class="brand" href="./" aria-label="継ぐ（始めの画面へ）" title="始めの画面へ"><span class="seal">継</span><span class="name">継ぐ</span></a>
    <nav class="nav" aria-label="画面"><a href="studio.html" class="to-design"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="14" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 4h6l-3 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>設計</span></a>${VIEWS.map((v) => `<a href="#${v.id}" data-view="${v.id}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${v.icon}</svg><span>${v.label}</span><i class="badge" hidden></i></a>`).join("")}</nav>
    <div class="bar-r"><button type="button" class="ghost help" aria-label="使い方">使い方</button></div>
  </header>
  <main>
    <div class="screen" id="screen-ledger" hidden></div>
    <div class="screen" id="screen-learn" hidden><div class="learn-ask"></div><div class="learn-hands" hidden></div></div>
    <div class="screen" id="screen-waza" hidden></div>
  </main>
</div>
<dialog class="sheet intro">
  <form method="dialog">
    <p class="eyebrow">継ぐ</p>
    <h3>職人の判断と手を、次の人へ。</h3>
    <ol class="steps">
      <li><b>設計</b><span>指輪を形にして、職人の決まりで「作れるか」を確かめます。</span></li>
      <li><b>帳面</b><span>職人の決まりが並びます。まだ決まっていない所は、Claude が 1 つずつ聞きます。</span></li>
      <li><b>学ぶ</b><span>次の人が、職人の決まりに「なぜ？」と聞けます。手の動きを手本と比べることもできます。</span></li>
      <li><b>技</b><span>指輪の石留めのほかに、彫金の魚々子（ななこ）と、途切れた技を組み立て直す試み。</span></li>
    </ol>
    <div class="sheet-actions"><button value="ok" class="primary">始める</button></div>
  </form>
</dialog>`;

const screens = Object.fromEntries(VIEWS.map((v) => [v.id, document.getElementById(`screen-${v.id}`)!])) as Record<ViewId, HTMLElement>;
const askRoot = screens.learn.querySelector<HTMLElement>(".learn-ask")!;
const handsRoot = screens.learn.querySelector<HTMLElement>(".learn-hands")!;
let see: { refresh(): void } | null = null;
const ask = mountAsk(askRoot);
const keep = mountKeep(screens.ledger, { onExampleSaved: () => see?.refresh() });
const waza = mountWaza(screens.waza);

function show() {
  const to = redirectHash(location.hash);
  if (to) {
    history.replaceState(null, "", to);
  }
  const [path, query = ""] = location.hash.slice(1).split("?");
  const [head, ...rest] = path.split("/");
  const sub = rest.join("/") + (query ? `?${query}` : "");
  const view: ViewId = VIEWS.some((v) => v.id === head) ? (head as ViewId) : "ledger";
  for (const v of VIEWS) screens[v.id].hidden = v.id !== view;
  if (view === "learn") {
    const hands = sub === "hands";
    askRoot.hidden = hands;
    handsRoot.hidden = !hands;
    if (hands && !see) see = mountSee(handsRoot);
  }
  if (view === "waza") waza.route(sub);
  if (view === "ledger") keep.route(sub);
  document.querySelectorAll<HTMLAnchorElement>(".nav a").forEach((a) => a.setAttribute("aria-current", a.dataset.view === view ? "page" : "false"));
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", show);
show();

function badges() {
  const open = groupQuestions(store.queue()).filter((g) => !g.answeredRuleId).length;
  const b = document.querySelector<HTMLElement>('.nav a[data-view="ledger"] .badge')!;
  b.hidden = open === 0;
  b.textContent = String(open);
}
onStoreChange(() => {
  ask.refresh();
  keep.refresh();
  waza.refresh();
  badges();
});
badges();

const intro = document.querySelector<HTMLDialogElement>(".intro")!;
intro.addEventListener("close", () => store.setIntroSeen());
document.querySelector(".help")!.addEventListener("click", () => intro.showModal());
// ほかの画面からのリンクで来たときは、説明を出さずにその場面へ
if (!store.introSeen() && !location.hash && !new URLSearchParams(location.search).has("nointro")) intro.showModal();
