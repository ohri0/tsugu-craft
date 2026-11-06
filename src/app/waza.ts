// 技：同じしくみ（帳面に残す → まだ決まっていない所を職人に聞く → 決まりで確かめる）を、ほかの技にも。
// #waza … 技を選ぶ（指輪の石留め・六つの技・途切れた技を組み立て直す）
// #waza/ring・bezel・milgrain・tsuchime・kebori・nunome・mokume … どれも同じ形の頁（src/app/tech-view.ts）
// #waza/restore … 途切れた技を入れる（答えのない技。src/app/restore.ts）
// #waza/rebuild … 答えの分かっている技で試す（木目金で、Claude がどこまで当てられるか見る。src/app/rebuild.ts）
// #waza/rebuild/moyou … 模様の試し（本当の手順と Claude の手順で作ったら、どんな模様になるか。src/app/moyou-view.ts）
// 魚々子は 2026-11-04 に外した（作者：中身が一般的すぎる）。#waza/nanako は #waza へ送る（src/app/routes.ts）
import { TECHNIQUES } from "../rebuild/material";
import { PUBLISHED_RUNS } from "../rebuild/published";
import { filming } from "./confirm";
import { flash } from "./interview";
import { mountRebuild } from "./rebuild";
import { mountRestore } from "./restore";
import { mountMoyou } from "./moyou-view";
import { listProjects } from "./restore-store";
import { mountTech, pageCounts, pageInfo, ringTarget, techTarget } from "./tech-view";
import { WAZA_ORDER } from "../rules/flow";
import { flowCounts, flowDots } from "./flow-view";
import { flowUI, isMihon } from "./mihon";
import { TECH_IDS, isTechId } from "../rules/techniques";
import type { HowtoId } from "../rules/howto-steps";
import { esc, store } from "./store";

export { ringTarget, techTarget };

/** 技の札：残ったもの（決まり・手本・届いた質問）で育っていくのが見える */
function flowCard(id: HowtoId): string {
  const t = pageInfo(id);
  const c = flowCounts(id);
  const stat = (n: number, label: string, cls = "") => `<span class="bt-stat${n ? " has" : ""}${cls}"><b>${n}</b>${esc(label)}</span>`;
  return `<li><a class="big-tech" href="#waza/${id}">
    <span class="bt-mark" aria-hidden="true">${esc(t.mark)}</span>
    <span class="bt-body"><b>${esc(id === "ring" ? "指輪の石留め" : t.name)}</b><small>${esc(t.lead)}</small>
      <span class="bt-stats">${stat(c.craftsman, isMihon() ? "残した決まり" : "職人の決まり")}${stat(c.models, "手本")}${stat(c.questions, "届いた質問", c.questions ? " alert" : "")}${flowDots(id)}</span></span>
    <span class="bt-go" aria-hidden="true">›</span>
  </a></li>`;
}

function card(id: HowtoId): string {
  const t = pageInfo(id);
  const n = pageCounts(id);
  return `<li><a class="big-tech" href="#waza/${id}">
    <span class="bt-mark" aria-hidden="true">${esc(t.mark)}</span>
    <span class="bt-body"><b>${esc(t.name)}</b><small>${esc(t.lead)}</small><span class="bt-meta">${n.steps} 工程 ・ 決まり ${n.rules}${n.craftsman ? `（職人 ${n.craftsman}）` : ""} ・ 質問 ${n.gaps}</span></span>
    <span class="bt-go" aria-hidden="true">›</span>
  </a></li>`;
}

/** 途切れた技の札。答えのない技と、答えの分かっている技を分ける。撮影のときは前の 1 枚のまま */
function rebuildCards(hasRun: boolean): string {
  const trial = (title: string, lead: string, cls = "") => `<li><a class="big-tech${cls}" href="#waza/rebuild">
        <span class="bt-mark" aria-hidden="true">？</span>
        <span class="bt-body"><b>${title}</b><small>${lead}</small>${hasRun ? `<span class="bt-meta">組み立てた結果あり</span>` : ""}</span>
        <span class="bt-go" aria-hidden="true">›</span>
      </a></li>`;
  if (filming()) return `<h3 class="pub-sec-h">途切れた技</h3>
      <ul class="big-techs">${trial("組み立て直す（木目金）", "作り方の残っていない技を、残った品物の手がかりから Claude が組み立て、本当の作り方と比べる")}</ul>`;
  const mine = listProjects().length;
  return `<h3 class="pub-sec-h">途切れた技</h3>
      <ul class="big-techs"><li><a class="big-tech rs-waza-card" href="#waza/restore">
        <span class="bt-mark" aria-hidden="true">再</span>
        <span class="bt-body"><b>途切れた技を入れる</b><small>分かることを入れると、Claude が作り方の案を出します</small>${mine ? `<span class="bt-meta">入れた技 ${mine}</span>` : ""}</span>
        <span class="bt-go" aria-hidden="true">›</span>
      </a></li>
      ${trial("答えの分かっている技で試す", "木目金で、Claude がどこまで当てられるかを見ます", " rs-waza-card")}</ul>`;
}

export function mountWaza(root: HTMLElement): { refresh(): void; route(sub: string): void } {
  let sub = "";
  let page: { refresh(): void } | null = null;

  function list() {
    page = null;
    const mokume = TECHNIQUES.find((t) => t.id === "mokume");
    const hasRun = PUBLISHED_RUNS.some((r) => r.technique === "mokume");
    if (flowUI()) {
      // 職人の技を残して次の人へ渡す道具だと、最初の画面で分かるように
      root.innerHTML = `
    <section class="view waza">
      <header class="view-head waza-head">
        <h2>職人の技を、次の人へ</h2>
        <p class="lead">どの技も同じ流れです。</p>
      </header>
      <ol class="flow-line" aria-label="流れ"><li class="master">職人が答える</li><li class="master">手本を残す</li><li class="learner">学ぶ人が聞く</li><li class="learner">手を比べる</li></ol>
      ${isMihon() ? "" : `<a class="ghost btnlike mihon-link" href="app.html?mihon#waza/kebori">作り話の例で、流れを見る <span aria-hidden="true">›</span></a>`}
      <ul class="big-techs">${WAZA_ORDER.map(flowCard).join("")}</ul>
      ${mokume ? rebuildCards(hasRun) : ""}
    </section>`;
      return;
    }
    root.innerHTML = `
    <section class="view waza">
      <header class="view-head">
        <h2>技を選ぶ</h2>
        <p class="lead">どの技も同じ形です。① 作り方 → ② 職人の決まり → ③ Claude から質問。</p>
      </header>
      <ul class="big-techs">${card("ring")}</ul>
      <h3 class="pub-sec-h">彫金・金工の技</h3>
      <ul class="big-techs">${TECH_IDS.map(card).join("")}</ul>
      ${mokume ? rebuildCards(hasRun) : ""}
    </section>`;
  }

  function route(next: string) {
    sub = next;
    const [name, query] = sub.split("?");
    const params = new URLSearchParams(query ?? "");
    const gapId = params.get("gap") ?? undefined;
    if (name === "ring" || isTechId(name)) {
      // 「学ぶ」のタブを押したとき、いま見ている技のまま開く
      if (flowUI()) store.setLastTech(name);
      page = mountTech(root, name, { gapId, step: params.get("step") ?? undefined, onBack: () => (location.hash = "#waza") });
    } else if (name === "rebuild/moyou") {
      page = null;
      mountMoyou(root, { onBack: () => (location.hash = "#waza/rebuild"), auto: params.has("auto") });
    } else if (name === "rebuild") {
      page = null;
      mountRebuild(root, { onBack: () => (location.hash = "#waza") });
    } else if (name === "restore" || name.startsWith("restore/")) {
      page = null;
      mountRestore(root, name.slice("restore/".length), { onBack: () => (location.hash = "#waza") });
    } else list();
  }

  return {
    route,
    refresh() {
      const [name] = sub.split("?");
      if (name === "ring" || isTechId(name)) page?.refresh();
      else if (name === "rebuild" || name === "rebuild/moyou" || name === "restore" || name.startsWith("restore/")) return;
      else if (!root.hidden) list();
    },
  };
}

export { flash };
