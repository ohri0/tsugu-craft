// 継ぐ：下のタブは 4 つ。設計（studio.html）・帳面・学ぶ・技。
// 画面の切り替えは URL の # で（#ledger / #learn / #waza）。「/」の後ろは画面の中の場所（#learn/hands・#waza/ring・#waza/mokume・#waza/rebuild）。
// 前の名前（#see・#ask・#keep・#rebuild・#waza/nanako）で来ても、新しい場所へ送る。スマホは下のタブ、PC は上のタブ。
import "./app.css";
import "./clear.css";
// 見本のときの残す先の切り替えは、ほかのどの部品よりも先に動く
import { flowUI, isMihon, isTour } from "./mihon";
import { mountAsk } from "./ask";
import { filming } from "./confirm";
import { mountSee } from "./see";
import { mountKeep } from "./keep";
import { mountWaza } from "./waza";
import { MIHON_BAR } from "./flow-view";
import { parseLearn, redirectHash } from "./routes";
import { isTechId } from "../rules/techniques";
import { onStoreChange, store } from "./store";
import { passwordButton } from "./password";
import { openQuestions } from "../rules/flow";
import { groupQuestions } from "../rules/teacher-queue";

const FLOW = flowUI();

type ViewId = "ledger" | "learn" | "waza";
const VIEWS: { id: ViewId; label: string; icon: string }[] = [
  { id: "ledger", label: "帳面", icon: `<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9h6M9 13h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` },
  { id: "learn", label: "学ぶ", icon: `<path d="M4 5h16v11H8l-4 4V5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>` },
  { id: "waza", label: "技", icon: `<circle cx="7" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9.5" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="14.5" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/>` },
];

// 字・押す所・色の直し（app.css の html.fit）。撮影では付けない（動画の絵を前のままにする）
document.documentElement.classList.toggle("fit", !filming() || FLOW);

const DESIGN_TAB = `<a href="studio.html" class="to-design"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="14" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 4h6l-3 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>設計<i class="to-out" aria-hidden="true"> ↗</i></span></a>`;
const viewTab = (v: (typeof VIEWS)[number]) => `<a href="#${v.id}" data-view="${v.id}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${v.icon}</svg><span>${v.label}</span><i class="badge" hidden></i></a>`;
// 流れの画面では、技を先頭に。設計（指輪の道具）は例の一つなので後ろに
const NAV = FLOW ? `${["waza", "ledger", "learn"].map((id) => viewTab(VIEWS.find((v) => v.id === id)!)).join("")}${DESIGN_TAB}` : `${DESIGN_TAB}${VIEWS.map(viewTab).join("")}`;
const INTRO = FLOW
  ? `<ol class="steps no-num">
      <li><b>職人が答える</b><span>Claude が聞きに来ます。声か字で答えると、だれの言葉か・いつかと一緒に帳面に残ります。</span></li>
      <li><b>手本を残す</b><span>作業を撮るだけ。</span></li>
      <li><b>学ぶ人が聞く</b><span>職人の言葉つきで答えが返ります。帳面にないことは、職人への質問として届きます。</span></li>
      <li><b>手を比べる</b><span>学ぶ人が自分の手を撮ると、手本とちがう瞬間が赤く出ます。</span></li>
    </ol>
    <p class="small muted">どの技も同じ流れです。指輪は、その一つの例です。</p>`
  : `<ol class="steps">
      <li><b>設計</b><span>指輪を形にして、職人の決まりで「作れるか」を確かめます。</span></li>
      <li><b>帳面</b><span>職人の決まりが並びます。まだ決まっていない所は、Claude が 1 つずつ聞きます。</span></li>
      <li><b>学ぶ</b><span>次の人が、職人の決まりに「なぜ？」と聞けます。手の動きを手本と比べることもできます。</span></li>
      <li><b>技</b><span>指輪の石留めと、覆輪留め・木目金など六つの技。どれも「作り方・職人の決まり・Claude から質問」の同じ形です。</span></li>
    </ol>`;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="app">
  ${isMihon() ? MIHON_BAR : ""}
  <header class="bar">
    <a class="brand" href="./" aria-label="継ぐ（始めの画面へ）" title="始めの画面へ"><span class="seal">継</span><span class="name">継ぐ</span></a>
    <nav class="nav" aria-label="画面">${NAV}</nav>
    <div class="bar-r">${isMihon() ? `<span class="mihon-tag">見本・作り話</span>` : ""}<button type="button" class="ghost help" aria-label="使い方">使い方</button></div>
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
    ${INTRO}
    <div class="sheet-actions">${FLOW && !isMihon() ? `<a class="ghost btnlike" href="app.html?mihon#waza/kebori">作り話の例で見る</a>` : ""}<button value="ok" class="primary">始める</button></div>
  </form>
</dialog>`;

// 合言葉を入れる場所（撮影の絵は前のまま）
if (!filming()) document.querySelector(".bar-r")?.prepend(passwordButton());

const screens = Object.fromEntries(VIEWS.map((v) => [v.id, document.getElementById(`screen-${v.id}`)!])) as Record<ViewId, HTMLElement>;
const askRoot = screens.learn.querySelector<HTMLElement>(".learn-ask")!;
const handsRoot = screens.learn.querySelector<HTMLElement>(".learn-hands")!;
let see: ReturnType<typeof mountSee> | null = null;
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
  const view: ViewId = VIEWS.some((v) => v.id === head) ? (head as ViewId) : FLOW ? "waza" : "ledger";
  for (const v of VIEWS) screens[v.id].hidden = v.id !== view;
  if (view === "learn") {
    const place = parseLearn(sub, (s) => s === "ring" || isTechId(s));
    askRoot.hidden = place.hands;
    handsRoot.hidden = !place.hands;
    if (place.hands) {
      if (!see) see = mountSee(handsRoot);
      see.route(place.tech);
    } else ask.route(place.tech);
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
  // 流れの画面では、届いた質問は技の頁で答える。帳面の印は指輪の質問、技の印はほかの技の質問
  const ringOpen = FLOW ? openQuestions(store.queue(), "ring").length : open;
  const techOpen = open - ringOpen;
  const put = (view: string, n: number) => {
    const b = document.querySelector<HTMLElement>(`.nav a[data-view="${view}"] .badge`)!;
    b.hidden = n === 0;
    b.textContent = String(n);
  };
  put("ledger", ringOpen);
  put("waza", techOpen);
}
onStoreChange(() => {
  ask.refresh();
  keep.refresh();
  waza.refresh();
  see?.flow();
  badges();
});
badges();

const intro = document.querySelector<HTMLDialogElement>(".intro")!;
intro.addEventListener("close", () => store.setIntroSeen());
document.querySelector(".help")!.addEventListener("click", () => intro.showModal());
// ほかの画面からのリンクで来たときは、説明を出さずにその場面へ
if (!store.introSeen() && !location.hash && !isMihon() && !new URLSearchParams(location.search).has("nointro")) intro.showModal();
// 撮影用の見本：決まった順に見せる
if (isTour()) void import("./tour").then((m) => m.startTour());
