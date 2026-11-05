// 技：同じしくみ（帳面に残す → まだ決まっていない所を職人に聞く → 決まりで確かめる）を、ほかの技にも。
// #waza … 技を選ぶ（指輪の石留め・六つの技・途切れた技を組み立て直す）
// #waza/ring・bezel・milgrain・tsuchime・kebori・nunome・mokume … どれも同じ形の頁（src/app/tech-view.ts）
// #waza/restore … 自分の技を組み立て直す（本番。答えのない技。src/app/restore.ts）
// #waza/rebuild … 力試し（答えの分かっている木目金で、Claude がどこまで届くか測る。src/app/rebuild.ts）
// 魚々子は 2026-11-04 に外した（作者：中身が一般的すぎる）。#waza/nanako は #waza へ送る（src/app/routes.ts）
import { TECHNIQUES } from "../rebuild/material";
import { PUBLISHED_RUNS } from "../rebuild/published";
import { filming } from "./confirm";
import { flash } from "./interview";
import { mountRebuild } from "./rebuild";
import { mountRestore } from "./restore";
import { listProjects } from "./restore-store";
import { mountTech, pageCounts, pageInfo, ringTarget, techTarget } from "./tech-view";
import { TECH_IDS, isTechId } from "../rules/techniques";
import type { HowtoId } from "../rules/howto-steps";
import { esc } from "./store";

export { ringTarget, techTarget };

function card(id: HowtoId): string {
  const t = pageInfo(id);
  const n = pageCounts(id);
  return `<li><a class="big-tech" href="#waza/${id}">
    <span class="bt-mark" aria-hidden="true">${esc(t.mark)}</span>
    <span class="bt-body"><b>${esc(t.name)}</b><small>${esc(t.lead)}</small><span class="bt-meta">${n.steps} 工程 ・ 決まり ${n.rules}${n.craftsman ? `（職人 ${n.craftsman}）` : ""} ・ 質問 ${n.gaps}</span></span>
    <span class="bt-go" aria-hidden="true">›</span>
  </a></li>`;
}

/** 途切れた技の札。本番（答えのない技）と力試し（答えの分かっている技）を分ける。撮影のときは前の 1 枚のまま */
function rebuildCards(hasRun: boolean): string {
  const trial = (title: string, lead: string) => `<li><a class="big-tech" href="#waza/rebuild">
        <span class="bt-mark" aria-hidden="true">？</span>
        <span class="bt-body"><b>${title}</b><small>${lead}</small>${hasRun ? `<span class="bt-meta">組み立てた結果あり</span>` : ""}</span>
        <span class="bt-go" aria-hidden="true">›</span>
      </a></li>`;
  if (filming()) return `<h3 class="pub-sec-h">途切れた技</h3>
      <ul class="big-techs">${trial("組み立て直す（木目金）", "作り方の残っていない技を、残った品物の手がかりから Claude が組み立て、本当の作り方と比べる")}</ul>`;
  const mine = listProjects().length;
  return `<h3 class="pub-sec-h">途切れた技</h3>
      <ul class="big-techs"><li><a class="big-tech" href="#waza/restore">
        <span class="bt-mark" aria-hidden="true">再</span>
        <span class="bt-body"><b>自分の技を組み立て直す（本番）</b><small>答えのない技に使う。手がかりを入れると Claude が工程の案を作り、職人が試して確かめる</small>${mine ? `<span class="bt-meta">組み立て中の技 ${mine}</span>` : ""}</span>
        <span class="bt-go" aria-hidden="true">›</span>
      </a></li>
      ${trial("力試し（木目金）", "答えの分かっている技で、Claude がどこまで届くか測る試し。手がかりだけから組み立て、本当の作り方と比べる")}</ul>`;
}

export function mountWaza(root: HTMLElement): { refresh(): void; route(sub: string): void } {
  let sub = "";
  let page: { refresh(): void } | null = null;

  function list() {
    page = null;
    const mokume = TECHNIQUES.find((t) => t.id === "mokume");
    const hasRun = PUBLISHED_RUNS.some((r) => r.technique === "mokume");
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
    const gapId = new URLSearchParams(query ?? "").get("gap") ?? undefined;
    if (name === "ring" || isTechId(name)) {
      page = mountTech(root, name, { gapId, onBack: () => (location.hash = "#waza") });
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
      else if (name === "rebuild" || name === "restore" || name.startsWith("restore/")) return;
      else if (!root.hidden) list();
    },
  };
}

export { flash };
