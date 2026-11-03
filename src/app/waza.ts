// 技：同じしくみ（帳面に残す → まだ決まっていない所を職人に聞く → 決まりで形を確かめる）を、ほかの技にも。
// #waza … 技を選ぶ（指輪の石留め・魚々子）と、Claude からの質問 1 つ
// #waza/ring … 指輪の石留めの聞き取り（設計の帳面と同じ帳面に入る）
// #waza/nanako … 魚々子の帳面・聞き取り・小さな図
import { ledgerText } from "../rules/ledger";
import { applyDraft, gapsFor, nanakoGaps, ringAnswerToDraft, ringGaps, answerToDraft, type Gap, type RuleDraft } from "../rules/gaps";
import { type NanakoLedger, type NanakoParam } from "../rules/nanako";
import type { ParamId } from "../rules/ledger";
import { MAIN } from "../rules/workshops";
import { flash, mountInterview, type Interview, type InterviewTarget } from "./interview";
import { masterName, sourceName } from "./master";
import { mountNanako } from "./nanako-view";
import { esc, store } from "./store";

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

/** たまに 1 つだけ出す、Claude からの質問（両方の技から、順番に） */
function nextQuestion(offset: number): { gap: Gap; tech: "ring" | "nanako" } | undefined {
  const ring = gapsFor("ring", store.ledger()).map((gap) => ({ gap, tech: "ring" as const }));
  const nanako = gapsFor("nanako", store.nanakoLedger()).map((gap) => ({ gap, tech: "nanako" as const }));
  // 二つの技から交互に
  const mixed: { gap: Gap; tech: "ring" | "nanako" }[] = [];
  for (let i = 0; i < Math.max(ring.length, nanako.length); i++) {
    if (nanako[i]) mixed.push(nanako[i]);
    if (ring[i]) mixed.push(ring[i]);
  }
  return mixed.length ? mixed[offset % mixed.length] : undefined;
}

const LATER_STORE = "tsugu.wazaLater.v1";
function laterCount(): number {
  try {
    return Number(sessionStorage.getItem(LATER_STORE) ?? "0") || 0;
  } catch {
    return 0;
  }
}
function setLater(n: number) {
  try {
    sessionStorage.setItem(LATER_STORE, String(n));
  } catch {
    // 残せなくても動く
  }
}

export function mountWaza(root: HTMLElement): { refresh(): void; route(sub: string): void } {
  let sub = "";
  let interview: Interview | null = null;
  let nanako: { refresh(): void } | null = null;

  function list() {
    interview = null;
    nanako = null;
    const ringN = ringGaps(store.ledger()).length;
    const nanakoN = nanakoGaps(store.nanakoLedger()).length;
    const nanakoRules = store.nanakoLedger().rules.filter((r) => !store.nanakoLedger().rules.some((x) => x.replaces === r.id)).length;
    const q = nextQuestion(laterCount());
    root.innerHTML = `
    <section class="view waza">
      <header class="view-head">
        <p class="eyebrow">技を選ぶ</p>
        <h2>同じしくみを、ほかの技にも</h2>
        <p class="lead">決まりを帳面に残す。まだ決まっていない所は、Claude が職人に 1 つずつ聞く。決まりで形を確かめる。指輪の石留めで作ったこのしくみを、彫金の魚々子（ななこ）にも当ててみました。</p>
      </header>
      ${
        q
          ? `<div class="block ask-card">
        <p class="eyebrow">Claude から質問が 1 つあります <span class="iv-mode">${q.tech === "ring" ? "指輪の石留め" : "魚々子"}</span></p>
        <p class="iv-q">${esc(q.gap.question)}</p>
        <div class="row"><a class="primary btnlike" href="#waza/${q.tech}?gap=${encodeURIComponent(q.gap.id)}">答える</a><button type="button" class="ghost later">あとで</button></div>
      </div>`
          : ""
      }
      <ul class="techs block">
        <li><div class="tech ready">
          <a class="tech-main" href="studio.html"><span class="tech-mark" aria-hidden="true">石</span>
          <span class="tech-body"><b>指輪の石留め</b><small>一粒石の指輪。石の形から枠を組み、職人の決まりで確かめる（設計の画面へ）</small></span></a>
          <a class="ghost btnlike tech-sub" href="#waza/ring">聞き取り<span class="tech-meta">${ringN}</span></a>
        </div></li>
        <li><div class="tech ready">
          <a class="tech-main" href="#waza/nanako"><span class="tech-mark" aria-hidden="true">魚</span>
          <span class="tech-body"><b>魚々子（ななこ）<em class="entry">入口</em></b><small>彫金。鏨の先の小さな輪を打ちこみ、粒を並べる。決まり ${nanakoRules}・まだ決まっていない所 ${nanakoN}</small></span></a>
        </div></li>
      </ul>
      <p class="honest">魚々子の帳面は、公開の資料（検索結果の要約）から入れた決まりだけで始めます。原文で確かめていないので、どれも「未確認」です。資料に数字がない所は決まりを作らず、職人に聞きます。</p>
    </section>`;
    root.querySelector(".later")?.addEventListener("click", () => {
      setLater(laterCount() + 1);
      list();
    });
  }

  function ring(gapId?: string) {
    nanako = null;
    root.innerHTML = `
    <section class="view waza">
      <button type="button" class="back">← 技を選ぶ</button>
      <header class="view-head">
        <p class="eyebrow">指輪の石留め</p>
        <h2>帳面の聞き取り</h2>
        <p class="lead">設計で使う帳面の、まだ決まっていない所を聞きます。答えは同じ帳面に入り、設計の確かめにそのまま効きます。</p>
      </header>
      <div class="block panel iv-root"></div>
      <div class="block"><h3>まだ決まっていない所 <small class="gap-n"></small></h3><ul class="gap-list"></ul></div>
      <div class="block row"><a class="ghost btnlike" href="studio.html">設計で確かめる</a></div>
    </section>`;
    root.querySelector(".back")!.addEventListener("click", () => (location.hash = "#waza"));
    interview = mountInterview(root.querySelector<HTMLElement>(".iv-root")!, ringTarget(), { onApplied: () => renderGapList(ringGaps(store.ledger())) });
    if (gapId) interview.focus(gapId);
    renderGapList(ringGaps(store.ledger()));
  }

  function renderGapList(gaps: Gap[]) {
    const ul = root.querySelector<HTMLElement>(".gap-list");
    if (!ul) return;
    root.querySelector(".gap-n")!.textContent = String(gaps.length);
    ul.innerHTML = gaps.map((g) => `<li><button type="button" class="gap-item" data-g="${esc(g.id)}"><b>${esc(g.title)}${g.stoneMm !== undefined ? `：石 ${g.stoneMm} mm のとき` : ""}</b><small>${esc(g.why)}</small></button></li>`).join("");
    ul.querySelectorAll<HTMLButtonElement>("[data-g]").forEach((b) => b.addEventListener("click", () => interview?.focus(b.dataset.g)));
  }

  function route(next: string) {
    sub = next;
    const [page, query] = sub.split("?");
    const gapId = new URLSearchParams(query ?? "").get("gap") ?? undefined;
    if (page === "ring") ring(gapId);
    else if (page === "nanako") {
      interview = null;
      nanako = mountNanako(root, { gapId, onBack: () => (location.hash = "#waza") });
    } else list();
  }

  return {
    route,
    refresh() {
      const [page] = sub.split("?");
      if (page === "ring") {
        interview?.refresh();
        renderGapList(ringGaps(store.ledger()));
      } else if (page === "nanako") nanako?.refresh();
      else if (!root.hidden) list();
    },
  };
}

export { flash };
