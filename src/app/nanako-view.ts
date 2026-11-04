// 魚々子の入口：小さな図 → Claude の質問 → 帳面 の順に並べる。
// 図は板の上の粒の並び。帳面の決まりに合わない所は赤くなり、理由と出どころが出る。決まりがない所は確かめず「職人に聞く」へ。
import { activeRules, sourceLabel } from "../rules/ledger";
import { checkNanako, grainLayout, NANAKO_PARAMS, plateSize, type NanakoDesign, type NanakoFinding, type NanakoLedger, type NanakoRule } from "../rules/nanako";
import { nanakoGaps } from "../rules/gaps";
import { mountInterview, flash } from "./interview";
import { nanakoTarget } from "./waza";
import { esc, store, today } from "./store";
import { parseNanakoLedger } from "./store";

const DESIGN_STORE = "tsugu.nanakoDesign.v1";

/** はじめの図。試しに動かすための値で、目安ではない */
const START: NanakoDesign = { grainMm: 0.6, pitchMm: 0.8, rows: 7, cols: 14, plateMm: 0.8, offsetMm: 0.05, layout: "nanakoji" };

const SLIDERS: { key: keyof NanakoDesign; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: "grainMm", label: "粒の直径", min: 0.2, max: 2, step: 0.05, unit: "mm" },
  { key: "pitchMm", label: "粒の中心の間", min: 0.2, max: 3, step: 0.05, unit: "mm" },
  { key: "rows", label: "列の数", min: 1, max: 12, step: 1, unit: "列" },
  { key: "plateMm", label: "板の厚み", min: 0.1, max: 2, step: 0.05, unit: "mm" },
  { key: "offsetMm", label: "打つ位置のずれ", min: 0, max: 0.3, step: 0.01, unit: "mm" },
];

function loadDesign(): NanakoDesign {
  try {
    const v = JSON.parse(localStorage.getItem(DESIGN_STORE) ?? "null") as Partial<NanakoDesign> | null;
    if (v && typeof v === "object") return { ...START, ...v };
  } catch {
    // 読めなければはじめの図
  }
  return { ...START };
}
function saveDesign(d: NanakoDesign) {
  try {
    localStorage.setItem(DESIGN_STORE, JSON.stringify(d));
  } catch {
    // 残せなくても動く
  }
}

const num = (v: number) => String(Math.round(v * 100) / 100);

export function mountNanako(root: HTMLElement, opts: { gapId?: string; onBack: () => void }): { refresh(): void } {
  let design = loadDesign();
  root.innerHTML = `
  <section class="view waza nanako">
    <button type="button" class="back">← 技を選ぶ</button>
    <header class="view-head">
      <h2>魚々子（ななこ）</h2>
      <p class="lead">鏨（たがね）の先の小さな輪で、金属の面に丸い粒を並べる彫金の技。<a class="src" href="https://shosointen-glossary.narahaku.go.jp/nanako/" target="_blank" rel="noopener">出典：正倉院展用語解説</a></p>
    </header>

    <div class="block">
      <h3>図で確かめる</h3>
      <div class="nk-preview panel">
        <div class="nk-layout" role="radiogroup" aria-label="並べ方">
          <button type="button" data-layout="nanakoji" role="radio">魚子地（重ねない）</button>
          <button type="button" data-layout="arashi" role="radio">荒らし（重ねる）</button>
        </div>
        <svg class="nk-svg" role="img" aria-label="魚々子の図"></svg>
        <p class="nk-verdict" aria-live="polite"></p>
        <div class="nk-side-wrap"><svg class="nk-side" role="img" aria-label="板の厚み（横から）"></svg><p class="small muted nk-side-cap"></p></div>
        <div class="sim-ctrl nk-ctrl">${SLIDERS.map((s) => `<label>${s.label}<input type="range" data-k="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"><output data-o="${s.key}"></output></label>`).join("")}</div>
        <p class="small muted">図の数字は、試しに動かすための値です（目安ではありません）。決まりは帳面のものだけを使い、最後は職人が決めます。</p>
      </div>
      <ul class="nk-findings"></ul>
    </div>
    <div class="block panel iv-root"></div>
    <div class="block">
      <div class="panel-head"><h3>帳面 <small class="rule-n"></small></h3>
        <div class="row"><button type="button" class="ghost export">書き出す</button><label class="ghost btnlike">読み込む<input type="file" accept="application/json" class="import" hidden></label></div>
      </div>
      <ul class="nk-rules"></ul>
      <h3 class="nk-gap-h">まだ決まっていない所 <small class="gap-n"></small></h3>
      <ul class="nk-gaps"></ul>
    </div>

  </section>`;
  const $ = <T extends HTMLElement | SVGElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  $(".back").addEventListener("click", opts.onBack);

  const interview = mountInterview($(".iv-root") as HTMLElement, nanakoTarget());
  if (opts.gapId) interview.focus(opts.gapId);

  // ---- 帳面 ----
  function ruleItem(r: NanakoRule): string {
    const kind = r.source.kind;
    const val = r.value !== undefined && r.param ? `<span class="val">${num(r.value)} ${NANAKO_PARAMS[r.param].unit}</span>` : "";
    const src = r.source.kind === "public" && r.source.url ? `<a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(sourceLabel(r.source))}</a>` : esc(sourceLabel(r.source));
    return `<li class="nk-rule ${kind}">
      <div class="nk-rule-head"><b>${esc(r.title)}</b>${val}${r.unverified ? `<span class="tag warn">未確認</span>` : ""}${kind === "craftsman" ? `<span class="tag gold">職人</span>` : ""}</div>
      <p>${esc(r.text)}</p>
      ${r.quote && kind === "craftsman" ? `<blockquote>「${esc(r.quote)}」${r.question ? `<small>聞いたこと：${esc(r.question)}</small>` : ""}</blockquote>` : ""}
      <p class="small muted">${src} ・ ${esc(r.date)}</p>
    </li>`;
  }

  function renderLedger() {
    const l = store.nanakoLedger();
    const rules = activeRules(l);
    const mine = rules.filter((r) => r.source.kind === "craftsman");
    const rest = rules.filter((r) => r.source.kind !== "craftsman");
    $(".rule-n").textContent = `${rules.length}（職人 ${mine.length}・資料 ${rest.length}）`;
    $(".nk-rules").innerHTML = [...mine, ...rest].map(ruleItem).join("");
    const gaps = nanakoGaps(l);
    $(".gap-n").textContent = String(gaps.length);
    const item = (g: (typeof gaps)[number]) => `<li><button type="button" class="gap-item" data-g="${esc(g.id)}"><b>${esc(g.title)}</b><small>${g.kind === "unverified" ? "未確認 ・ " : g.kind === "missing" ? "資料に数字がない ・ " : ""}${esc(g.why)}</small></button></li>`;
    // 数字の所と、資料にない問いを先に。資料の言葉を確かめる問いは、たたんでおく
    const main = gaps.filter((g) => g.param || g.kind === "open");
    const words = gaps.filter((g) => !(g.param || g.kind === "open"));
    $(".nk-gaps").innerHTML = gaps.length
      ? main.map(item).join("") + (words.length ? `<li><details class="free"><summary>資料の言葉を、職人に確かめる（${words.length}）</summary><ul class="nk-gaps inner">${words.map(item).join("")}</ul></details></li>` : "")
      : `<li class="small">ありません</li>`;
    root.querySelectorAll<HTMLButtonElement>(".nk-gaps [data-g]").forEach((b) => b.addEventListener("click", () => interview.focus(b.dataset.g)));
  }

  $(".export").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(store.nanakoLedger(), null, 2)], { type: "application/json" }));
    a.download = `tsugu-ledger-nanako-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $<HTMLInputElement>(".import").addEventListener("change", async (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const raw = await f.text();
      const l = JSON.parse(raw) as NanakoLedger;
      if (!Array.isArray(l.rules)) throw new Error("rules がありません");
      store.setNanakoLedger(parseNanakoLedger(raw));
      flash("魚々子の帳面を読み込みました");
    } catch (e) {
      alert(`読み込めませんでした：${String(e)}`);
    }
  });

  // ---- 図 ----
  root.querySelectorAll<HTMLInputElement>(".nk-ctrl input").forEach((inp) => {
    const k = inp.dataset.k as keyof NanakoDesign;
    inp.value = String(design[k]);
    inp.addEventListener("input", () => {
      design = { ...design, [k]: Number(inp.value) };
      saveDesign(design);
      draw();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-layout]").forEach((b) =>
    b.addEventListener("click", () => {
      design = { ...design, layout: b.dataset.layout as NanakoDesign["layout"] };
      saveDesign(design);
      draw();
    }),
  );

  function draw() {
    const l = store.nanakoLedger();
    const res = checkNanako(design, l);
    for (const s of SLIDERS) $(`[data-o="${s.key}"]`).textContent = `${num(design[s.key] as number)} ${s.unit}`;
    root.querySelectorAll<HTMLButtonElement>("[data-layout]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.layout === design.layout)));

    // 上から見た板と粒
    const { w, h } = plateSize(design);
    const svg = $<SVGSVGElement>(".nk-svg");
    svg.setAttribute("viewBox", `${-0.3} ${-0.3} ${w + 0.6} ${h + 0.6}`);
    const grains = grainLayout(design);
    const r = design.grainMm / 2;
    const sw = Math.max(0.02, design.grainMm * 0.09);
    svg.innerHTML = `
      <defs>
        <linearGradient id="nk-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b3b40"/><stop offset="1" stop-color="#2c2c30"/></linearGradient>
        <clipPath id="nk-clip"><rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.02}"/></clipPath>
      </defs>
      <rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.02}" fill="url(#nk-metal)" stroke="${res.plateBad ? "var(--ng)" : "rgba(255,255,255,0.18)"}" stroke-width="${res.plateBad ? sw * 1.6 : sw * 0.6}"/>
      <g clip-path="url(#nk-clip)">${grains
        .map((g) => {
          const bad = res.bad.has(g.i);
          return `<g class="grain${bad ? " bad" : ""}"><circle cx="${g.x.toFixed(3)}" cy="${g.y.toFixed(3)}" r="${(r - sw / 2).toFixed(3)}" fill="${bad ? "rgba(255,69,58,0.22)" : "#1f1f22"}" stroke="${bad ? "var(--ng)" : "#a9a9b0"}" stroke-width="${sw.toFixed(3)}"/><circle cx="${(g.x - r * 0.18).toFixed(3)}" cy="${(g.y - r * 0.18).toFixed(3)}" r="${(r * 0.32).toFixed(3)}" fill="${bad ? "rgba(255,138,130,0.5)" : "rgba(255,255,255,0.16)"}"/></g>`;
        })
        .join("")}</g>`;

    // 横から見た板の厚み（粒の直径との比べ）
    const side = $<SVGSVGElement>(".nk-side");
    const sx = 300;
    const scale = 40;
    const t = design.plateMm * scale;
    side.setAttribute("viewBox", `0 0 ${sx} ${Math.max(30, t + 22)}`);
    side.innerHTML = `
      <rect x="10" y="14" width="${sx - 20}" height="${t}" fill="#2f2f33" stroke="${res.plateBad ? "var(--ng)" : "rgba(255,255,255,0.2)"}" stroke-width="1"/>
      <path d="M ${sx / 2 - (design.grainMm * scale) / 2} 14 Q ${sx / 2} ${14 + Math.min(t * 0.8, (design.grainMm * scale) / 4) * 2} ${sx / 2 + (design.grainMm * scale) / 2} 14 Z" fill="#1c1c1e" stroke="${res.plateBad ? "var(--ng)" : "#a9a9b0"}" stroke-width="1"/>`;
    $(".nk-side-cap").textContent = `横から：板の厚み ${num(design.plateMm)} mm ・ 粒の直径 ${num(design.grainMm)} mm（くぼみの深さは絵だけで、数字ではありません）`;
    const ng = res.findings.filter((f) => f.status === "ng");
    const none = res.findings.filter((f) => f.status === "none").length;
    const v = $(".nk-verdict");
    v.className = `nk-verdict ${ng.length ? "ng" : "ok"}`;
    v.textContent = ng.length ? `合わない所 ${ng.length}：${ng[0].message}` : `帳面の決まりには合っています${none ? `（まだ決まりがない所 ${none} は確かめていません）` : ""}`;

    // 確かめた結果
    $(".nk-findings").innerHTML = res.findings.map(findingItem).join("");
    root.querySelectorAll<HTMLButtonElement>(".nk-findings [data-ask]").forEach((b) => b.addEventListener("click", () => interview.focus(b.dataset.ask)));
  }

  function findingItem(f: NanakoFinding): string {
    if (f.status === "none") {
      return `<li class="nk-f none"><span class="dot"></span><div><b>${esc(f.label)}</b><span class="now">${esc(f.now)}</span><p>まだ決まりがない → <button type="button" class="linklike" data-ask="${esc(f.gapId ?? "")}">職人に聞く</button></p></div></li>`;
    }
    const r = f.rule!;
    const src = r.source.kind === "public" && r.source.url ? `<a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(sourceLabel(r.source))}</a>` : esc(sourceLabel(r.source));
    return `<li class="nk-f ${f.status}"><span class="dot"></span><div><b>${esc(f.label)}</b><span class="now">${esc(f.now)}</span>
      ${f.status === "ng" ? `<p class="why">${esc(f.message)}</p>` : ""}
      <p class="small">決まり：${esc(r.text)}${r.unverified ? `<span class="tag warn">未確認</span>` : ""}</p>
      ${r.source.kind === "craftsman" && r.quote ? `<p class="small">職人の言葉：「${esc(r.quote)}」</p>` : ""}
      <p class="small muted">${src} ・ ${esc(r.date)}</p></div></li>`;
  }

  function refresh() {
    renderLedger();
    interview.refresh();
    draw();
  }
  refresh();
  return { refresh };
}
