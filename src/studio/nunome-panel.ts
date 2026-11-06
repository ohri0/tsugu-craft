// 「象嵌の模様」の欄（2026-11-07 作者の頼み）：布目象嵌の模様を選び、大きさ・線の太さ・帯の幅・金か銀・入れる回りを変える。
// 「模様を自分で変える」で、回す・伸ばす・ずらす・裏返す・マス目に描く。作れるかの確かめは、つまみを動かしている間も走り、
// 作れない形は赤と理由で出す（確かめは src/geometry/nunome.ts の checkNunome。値は GUIDES.inlay、目安帳で職人が変えられる）。
// 石の指輪（確かめるの「伝統の仕上げ」）と、地金のみの指輪（形の欄）で同じ部品。設計を変えるのは host。
import {
  JIYU_DEFAULT,
  JIYU_N,
  NUNOME_AROUND,
  NUNOME_FORM,
  NUNOME_LABEL,
  NUNOME_METAL_LABEL,
  NUNOME_NOTE,
  NUNOME_PATTERNS,
  NUNOME_RANGE,
  NUNOME_SCALE,
  checkNunome,
  defaultNunome,
  nunomeLayout,
  nunomeMetal,
  nunomeOf,
  nunomeSvg,
  slivers,
  type NunomeContext,
  type NunomeDesign,
  type NunomeIssue,
  type NunomePattern,
} from "../geometry/nunome";
import type { RingFinish } from "../geometry/finish";
import type { Guides } from "../rules/guides";
import { bindSlider, sliderHtml, type SliderSpec } from "./slider";

export interface NunomeHost {
  finish(): RingFinish | undefined;
  ctx(): NunomeContext;
  /** 金の地金か（はめこむ地金の「自動」は純銀） */
  goldBase(): boolean;
  /** 地の色（模様の絵の地。CSS の色） */
  groundColor(): string;
  guides(): Guides;
  /** 模様を変える（決まったとき） */
  set(patch: Partial<NunomeDesign>): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const INK = { gold: "#e9b54a", silver: "#e8e6e1" } as const;
/** 「模様を自分で変える」を開いているか（描き直しても、そのまま） */
let ownOpen = false;

/** 模様を選ぶ札に出す、その模様にしたときの模様（線の太さ・帯の幅・地金・回りは今のまま、大きさはその模様の はじめの値） */
function tryPattern(cur: NunomeDesign, p: NunomePattern): NunomeDesign {
  if (p === cur.pattern) return cur;
  return { ...defaultNunome(p), lineMm: cur.lineMm, widthMm: cur.widthMm, border: cur.border, around: cur.around, ...(cur.metal ? { metal: cur.metal } : {}) };
}

const sliders = (d: NunomeDesign): SliderSpec[] => [
  { cls: "nm-scale", label: "模様の大きさ", min: NUNOME_RANGE.scaleMm[0], max: NUNOME_RANGE.scaleMm[1], step: 0.05, value: d.scaleMm, unit: "mm" },
  { cls: "nm-line", label: "線の太さ", min: NUNOME_RANGE.lineMm[0], max: NUNOME_RANGE.lineMm[1], step: 0.01, value: d.lineMm, unit: "mm" },
  { cls: "nm-width", label: "帯の幅", min: NUNOME_RANGE.widthMm[0], max: NUNOME_RANGE.widthMm[1], step: 0.05, value: d.widthMm, unit: "mm" },
  ...(NUNOME_FORM[d.pattern] === "fill" ? [{ cls: "nm-foil", label: "平金の厚み", min: NUNOME_RANGE.foilMm[0], max: NUNOME_RANGE.foilMm[1], step: 0.01, value: d.foilMm ?? 0.1, unit: "mm" }] : []),
];
const ownSliders = (d: NunomeDesign): SliderSpec[] => [
  { cls: "nm-rot", label: "回す", min: NUNOME_RANGE.rotateDeg[0], max: NUNOME_RANGE.rotateDeg[1], step: 5, value: d.rotateDeg ?? 0, unit: "°" },
  { cls: "nm-stretch", label: "伸ばす", min: NUNOME_RANGE.stretch[0], max: NUNOME_RANGE.stretch[1], step: 0.05, value: d.stretch ?? 1, unit: "倍" },
  { cls: "nm-offset", label: "ずらす", min: -2, max: 2, step: 0.05, value: Math.max(-2, Math.min(2, d.offsetMm ?? 0)), unit: "mm" },
];
const KEY_OF: Record<string, keyof NunomeDesign> = { "nm-scale": "scaleMm", "nm-line": "lineMm", "nm-width": "widthMm", "nm-foil": "foilMm", "nm-rot": "rotateDeg", "nm-stretch": "stretch", "nm-offset": "offsetMm" };

const pick = (name: string, attr: string, cur: string, list: [string, string][]) =>
  `<div class="pick nm-pick"><span>${name}</span><div>${list.map(([v, l]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === cur}">${l}</button>`).join("")}</div></div>`;

/** 帯の大きな絵（いちばん上のあたり 12 mm ほど）。離れた小さなかけらには赤い丸 */
function bigPreview(d: NunomeDesign, host: NunomeHost, issues: NunomeIssue[]): string {
  const C = host.ctx().circumferenceMm;
  const ink = INK[nunomeMetal(d, host.goldBase())];
  const w = Math.max(10, d.widthMm * 3);
  let svg = nunomeSvg(d, { circumferenceMm: C, wMm: w, ink, ground: host.groundColor(), cls: "nm-big-svg" });
  if (issues.some((x) => x.check === "nunome-piece")) {
    const lay = nunomeLayout({ ...d, around: 1 }, C);
    const marks = slivers(lay, host.guides())
      .filter((s) => Math.abs(s.at[0]) < w / 2)
      .map((s) => `<circle cx="${s.at[0].toFixed(3)}" cy="${(-s.at[1]).toFixed(3)}" r="${Math.max(0.12, d.lineMm * 1.6).toFixed(3)}" fill="none" stroke="#ff4d3d" stroke-width="0.05"/>`)
      .join("");
    svg = svg.replace("</svg>", `${marks}</svg>`);
  }
  return svg;
}

function issuesHtml(issues: NunomeIssue[]): string {
  if (!issues.length) return `<p class="nm-ok"><b>作れます</b>線の太さ・線の間・小さなかけら・帯の幅、どれも目安の内側（目安・最後は職人が決める）</p>`;
  return `<ul class="nm-bad">${issues
    .map((x, i) => `<li><div class="nm-bad-h"><b>${esc(x.title)}</b><span>${esc(x.current)} → ${esc(x.required)}</span></div><p>${esc(x.why)}</p><button type="button" class="nm-fix" data-i="${i}">${esc(x.fixLabel)}</button></li>`)
    .join("")}</ul>`;
}

export function nunomePanelHtml(host: NunomeHost): string {
  const d = nunomeOf(host.finish()) ?? defaultNunome();
  const ctx = host.ctx();
  const issues = checkNunome(d, ctx, host.guides());
  const metal = d.metal ?? "auto";
  const autoLabel = `自動（${NUNOME_METAL_LABEL[nunomeMetal({ ...d, metal: undefined }, host.goldBase())]}）`;
  const g = host.guides().inlay;
  return `<section class="nm-panel${issues.length ? " ng" : ""}" aria-label="象嵌の模様">
    <h5>象嵌の模様<small>${esc(NUNOME_LABEL[d.pattern])} ・ ${issues.length ? `作れない所 ${issues.length}` : "作れます"}</small></h5>
    <div class="nm-grid" role="group" aria-label="模様を選ぶ">${NUNOME_PATTERNS.map((p) => {
      const t = tryPattern(d, p);
      return `<button type="button" class="nm-pat" data-nm-pat="${p}" aria-pressed="${p === d.pattern}" title="${esc(NUNOME_NOTE[p])}">${nunomeSvg({ ...t, widthMm: Math.max(1.6, Math.min(t.widthMm, 3)) }, { circumferenceMm: ctx.circumferenceMm, wMm: 4, ink: INK[nunomeMetal(t, host.goldBase())], ground: host.groundColor(), cls: "nm-thumb" })}<span>${esc(NUNOME_LABEL[p])}</span><i class="nm-dot" aria-hidden="true"></i></button>`;
    }).join("")}</div>
    <p class="nm-note">${esc(NUNOME_NOTE[d.pattern])}</p>
    <div class="nm-big">${bigPreview(d, host, issues)}</div>
    <div class="nm-checks">${issuesHtml(issues)}</div>
    <div class="sliders">${sliders(d).map(sliderHtml).join("")}</div>
    ${pick("はめる地金", "nm-metal", metal, [["auto", autoLabel], ["gold", "純金"], ["silver", "純銀"]])}
    ${pick("縁の線", "nm-border", d.border === false ? "0" : "1", [["1", "あり"], ["0", "なし"]])}
    ${pick("入れる所", "nm-around", String(d.around ?? 1), NUNOME_AROUND.map((a) => [String(a.v), a.label] as [string, string]))}
    <details class="nm-own"${ownOpen ? " open" : ""}><summary>模様を自分で変える</summary>
      <p class="nm-note">選んだ模様を、回す・伸ばす・ずらす・裏返す。「自分の模様」は、下のマス目を押して形を描く（くり返して並ぶ）。作れるかは、そのつど確かめる。</p>
      <div class="sliders">${ownSliders(d).map(sliderHtml).join("")}</div>
      ${pick("裏返す", "nm-mirror", d.mirror ? "1" : "0", [["0", "そのまま"], ["1", "上下に裏返す"]])}
      <div class="nm-cells-wrap"><span>自分の模様のマス目</span><div class="nm-cells" style="--n:${JIYU_N}">${Array.from({ length: JIYU_N * JIYU_N }, (_, i) => `<button type="button" class="nm-cell" data-i="${i}" aria-pressed="${(d.pattern === "jiyu" ? d.cells ?? JIYU_DEFAULT : JIYU_DEFAULT)[i] === "1"}" aria-label="マス ${i + 1}"></button>`).join("")}</div></div>
    </details>
    <p class="trad-foot">線の太さ ${g.wireMinMm}〜${g.wireMaxMm} mm は資料（京都の象嵌の工房・政府広報の記事）。線の間 ${g.minGapMm} mm・かけら ${g.minPieceMm} mm・角からの残し ${g.edgeMarginMm} mm・平金 ${g.foilMinMm}〜${g.foilMaxMm} mm・模様の大きさの はじめの値は仮の目安。「Claude に教える」で職人が変えられる。最後は職人が決める。</p>
  </section>`;
}

/** 模様ごとの「作れるか」の印（重いので、描いたあと 1 つずつ） */
const dotCache = new Map<string, boolean>();
function fillDots(box: HTMLElement, host: NunomeHost) {
  const d = nunomeOf(host.finish()) ?? defaultNunome();
  const ctx = host.ctx();
  const btns = [...box.querySelectorAll<HTMLButtonElement>(".nm-pat")];
  let k = 0;
  const step = () => {
    const b = btns[k++];
    if (!b || !b.isConnected) return;
    const t = tryPattern(d, b.dataset.nmPat as NunomePattern);
    const key = `${JSON.stringify(t)}_${ctx.circumferenceMm.toFixed(2)}_${JSON.stringify(ctx.face)}_${JSON.stringify(host.guides().inlay)}`;
    let ok = dotCache.get(key);
    if (ok === undefined) {
      ok = checkNunome(t, ctx, host.guides()).length === 0;
      dotCache.set(key, ok);
    }
    b.classList.toggle("ok", ok);
    b.classList.toggle("ng", !ok);
    b.title = `${NUNOME_NOTE[t.pattern]}（${ok ? "今の線・帯で作れます" : "今の線・帯では作れない所があります"}）`;
    setTimeout(step, 0);
  };
  setTimeout(step, 30);
}

export function bindNunomePanel(box: HTMLElement, host: NunomeHost): void {
  const panel = box.querySelector<HTMLElement>(".nm-panel");
  if (!panel) return;
  const cur = () => nunomeOf(host.finish()) ?? defaultNunome();
  panel.querySelectorAll<HTMLButtonElement>(".nm-pat").forEach((b) => b.addEventListener("click", () => {
    const p = b.dataset.nmPat as NunomePattern;
    const c = cur();
    if (p === c.pattern) return;
    host.set({ ...tryPattern(c, p), rotateDeg: c.rotateDeg, stretch: c.stretch, mirror: c.mirror, offsetMm: c.offsetMm, ...(p === "jiyu" ? { cells: c.cells ?? JIYU_DEFAULT } : {}) });
  }));
  // つまみ：動かしている間は、欄の中の絵と確かめだけを変える（指輪は、指を離したとき）
  let liveTimer = 0;
  const live = (patch: Partial<NunomeDesign>) => {
    clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => {
      const d = { ...cur(), ...patch };
      const issues = checkNunome(d, host.ctx(), host.guides());
      const big = panel.querySelector(".nm-big");
      if (big) big.innerHTML = bigPreview(d, host, issues);
      const ch = panel.querySelector(".nm-checks");
      if (ch) ch.innerHTML = issuesHtml(issues);
      panel.classList.toggle("ng", issues.length > 0);
      const sm = panel.querySelector("h5 small");
      if (sm) sm.textContent = `${NUNOME_LABEL[d.pattern]} ・ ${issues.length ? `作れない所 ${issues.length}` : "作れます"}`;
    }, 60);
  };
  for (const sp of [...sliders(cur()), ...ownSliders(cur())]) {
    const key = KEY_OF[sp.cls];
    bindSlider(panel, sp, (v) => host.set({ [key]: v }), (v) => live({ [key]: v }));
  }
  panel.querySelectorAll<HTMLButtonElement>("[data-nm-metal]").forEach((b) => b.addEventListener("click", () => host.set({ metal: b.dataset.nmMetal === "auto" ? undefined : (b.dataset.nmMetal as "gold" | "silver") })));
  panel.querySelectorAll<HTMLButtonElement>("[data-nm-border]").forEach((b) => b.addEventListener("click", () => host.set({ border: b.dataset.nmBorder === "1" })));
  panel.querySelectorAll<HTMLButtonElement>("[data-nm-around]").forEach((b) => b.addEventListener("click", () => host.set({ around: Number(b.dataset.nmAround) })));
  panel.querySelectorAll<HTMLButtonElement>("[data-nm-mirror]").forEach((b) => b.addEventListener("click", () => host.set({ mirror: b.dataset.nmMirror === "1" })));
  panel.querySelectorAll<HTMLButtonElement>(".nm-cell").forEach((b) => b.addEventListener("click", () => {
    const c = cur();
    const cells = (c.pattern === "jiyu" ? c.cells ?? JIYU_DEFAULT : JIYU_DEFAULT).split("");
    const i = Number(b.dataset.i);
    cells[i] = cells[i] === "1" ? "0" : "1";
    if (!cells.includes("1")) return;
    host.set(c.pattern === "jiyu" ? { cells: cells.join("") } : { ...tryPattern(c, "jiyu"), scaleMm: NUNOME_SCALE.jiyu, cells: cells.join("") });
  }));
  const own = panel.querySelector<HTMLDetailsElement>(".nm-own");
  own?.addEventListener("toggle", () => (ownOpen = own.open));
  panel.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".nm-fix");
    if (!b) return;
    const issues = checkNunome(cur(), host.ctx(), host.guides());
    const is = issues[Number(b.dataset.i)];
    if (is) host.set(is.patch);
  });
  fillDots(panel, host);
}
