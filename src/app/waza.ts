// 技：同じしくみ（帳面に残す → まだ決まっていない所を職人に聞く → 決まりで形を確かめる）を、ほかの技にも。
// #waza … 技を選ぶ（大きな札 3 つ：指輪の石留め → 設計・魚々子・途切れた技を組み立て直す）
// #waza/nanako … 魚々子：図 → Claude の質問 → 帳面
// #waza/rebuild … 途切れた技を、手がかりから組み立て直す（木目金）
// #waza/bezel・milgrain・tsuchime・kebori・nunome・mokume … ほかの技：Claude の質問 → 帳面（src/app/tech-view.ts）
// 指輪の石留めの聞き取りは「帳面」に移した（#waza/ring は帳面へ送る。src/app/routes.ts）
import { activeRules, ledgerText } from "../rules/ledger";
import { applyDraft, nanakoGaps, ringAnswerToDraft, ringGaps, answerToDraft, type RuleDraft } from "../rules/gaps";
import { type NanakoLedger, type NanakoParam } from "../rules/nanako";
import type { ParamId } from "../rules/ledger";
import { MAIN } from "../rules/workshops";
import { TECHNIQUES } from "../rebuild/material";
import { PUBLISHED_RUNS } from "../rebuild/published";
import { flash, type InterviewTarget } from "./interview";
import { masterName, sourceName } from "./master";
import { mountNanako } from "./nanako-view";
import { mountRebuild } from "./rebuild";
import { mountTech } from "./tech-view";
import { TECH_IDS, TECHS, isTechId } from "../rules/techniques";
import { techGaps } from "../rules/gaps";
import { esc } from "./store";
import { store } from "./store";

const RING = "指輪の石留め（一粒石の指輪）";
const NANAKO = "彫金・魚々子（ななこ）：先が小さな輪の鏨を金属の面に打ちこみ、小さな丸い粒を並べる";

export function ringTarget(): InterviewTarget {
  return {
    craft: RING,
    gaps: () => ringGaps(store.ledger()),
    draft: (gap, answer, ctx, chosen) => ringAnswerToDraft(store.ledger(), gap, answer, ctx, chosen),
    apply: (d) => store.setLedger(applyDraft(store.ledger(), d as RuleDraft<ParamId>)),
    ledgerText: () => ledgerText(store.ledger()),
    defaultName: () => sourceName(store.ledger(), store.workshops().active === MAIN),
  };
}

export function nanakoTarget(): InterviewTarget {
  return {
    craft: NANAKO,
    gaps: () => nanakoGaps(store.nanakoLedger()),
    draft: (gap, answer, ctx, chosen) => answerToDraft(gap, answer, ctx, chosen),
    apply: (d) => store.setNanakoLedger(applyDraft<NanakoParam>(store.nanakoLedger(), d as RuleDraft<NanakoParam>)),
    ledgerText: () => nanakoText(store.nanakoLedger()),
    defaultName: () => masterName(store.mainLedger()),
  };
}

function nanakoText(l: NanakoLedger): string {
  return l.rules
    .filter((r) => !l.rules.some((x) => x.replaces === r.id))
    .map((r) => `- [${r.id}] ${r.title}：${r.text}（理由：${r.reason}${r.quote ? `／言葉：「${r.quote}」` : ""}／出どころ：${r.source.kind === "craftsman" ? `職人：${r.source.name}` : r.source.kind === "public" ? `資料：${r.source.title}` : "仮"}${r.unverified ? "・未確認" : ""}）`)
    .join("\n");
}

export function mountWaza(root: HTMLElement): { refresh(): void; route(sub: string): void } {
  let sub = "";
  let nanako: { refresh(): void } | null = null;

  function list() {
    nanako = null;
    const ringAll = activeRules(store.ledger());
    const ringRules = ringAll.filter((r) => r.source.kind === "craftsman").length;
    const ringN = ringGaps(store.ledger()).length;
    const nl = store.nanakoLedger();
    const nanakoRules = activeRules(nl).length;
    const nanakoN = nanakoGaps(nl).length;
    const mokume = TECHNIQUES.find((t) => t.id === "mokume");
    const hasRun = PUBLISHED_RUNS.some((r) => r.technique === "mokume");
    root.innerHTML = `
    <section class="view waza">
      <header class="view-head">
        <h2>技を選ぶ</h2>
        <p class="lead">同じしくみ（帳面に残す・Claude が聞く・決まりで確かめる）を、ほかの技にも。</p>
      </header>
      <ul class="big-techs">
        <li><a class="big-tech" href="studio.html">
          <span class="bt-mark" aria-hidden="true">石</span>
          <span class="bt-body"><b>指輪の石留め</b><small>一粒石の指輪の枠を組み、職人の決まりで確かめる</small><span class="bt-meta">決まり ${ringAll.length}（職人 ${ringRules}）・ まだ決まっていない所 ${ringN}</span></span>
          <span class="bt-go" aria-hidden="true">›</span>
        </a></li>
        <li><a class="big-tech" href="#waza/nanako">
          <span class="bt-mark" aria-hidden="true">魚</span>
          <span class="bt-body"><b>魚々子（ななこ）</b><small>彫金。小さな丸い粒を、金属の面に打ちこんで並べる</small><span class="bt-meta">決まり ${nanakoRules} ・ まだ決まっていない所 ${nanakoN}</span></span>
          <span class="bt-go" aria-hidden="true">›</span>
        </a></li>
        ${
          mokume
            ? `<li><a class="big-tech" href="#waza/rebuild">
          <span class="bt-mark" aria-hidden="true">木</span>
          <span class="bt-body"><b>途切れた技を、手がかりから組み立て直す（木目金）</b><small>作り方の残っていない技を、残った品物の手がかりから Claude が組み立て、本当の作り方と比べる</small>${hasRun ? `<span class="bt-meta">組み立てた結果あり</span>` : ""}</span>
          <span class="bt-go" aria-hidden="true">›</span>
        </a></li>`
            : ""
        }
      </ul>
      <h3 class="pub-sec-h">ほかの技の帳面</h3>
      <ul class="big-techs">${TECH_IDS.map((id) => {
        const t = TECHS[id];
        const l = store.techLedger(id);
        return `<li><a class="big-tech" href="#waza/${id}">
          <span class="bt-mark" aria-hidden="true">${esc(t.mark)}</span>
          <span class="bt-body"><b>${esc(t.name)}</b><small>${esc(t.lead)}</small><span class="bt-meta">決まり ${activeRules(l).length} ・ まだ決まっていない所 ${techGaps(id, l).length}</span></span>
          <span class="bt-go" aria-hidden="true">›</span>
        </a></li>`;
      }).join("")}</ul>
    </section>`;
  }

  function route(next: string) {
    sub = next;
    const [page, query] = sub.split("?");
    const gapId = new URLSearchParams(query ?? "").get("gap") ?? undefined;
    if (page === "nanako") {
      nanako = mountNanako(root, { gapId, onBack: () => (location.hash = "#waza") });
    } else if (isTechId(page)) {
      nanako = mountTech(root, page, { gapId, onBack: () => (location.hash = "#waza") });
    } else if (page === "rebuild") {
      nanako = null;
      mountRebuild(root, { onBack: () => (location.hash = "#waza") });
    } else list();
  }

  return {
    route,
    refresh() {
      const [page] = sub.split("?");
      if (page === "nanako" || isTechId(page)) nanako?.refresh();
      else if (page === "rebuild") return;
      else if (!root.hidden) list();
    },
  };
}

export { flash };
