// 画面。左に手順、右に大きな 3D（スマホは上に 3D、下に手順）。
import "./style.css";
import { findCorners, type Corner } from "../geometry/corners";
import { measureOutline, type StoneOutline } from "../geometry/measure";
import { extent } from "../geometry/polygon";
import { nameShape } from "../geometry/shape";
import { stoneHeights } from "../geometry/stone";
import { GUIDE_NOTE, GUIDES } from "../rules/guides";
import { HOLD_NOTE } from "../rules/checks";
import { metalName } from "../geometry/ring";
import { extractStone, NoStoneError, type Extraction } from "../vision/extract";
import { patternSvg } from "../pattern/sheet";
import { build, DEFAULT_DESIGN, rulePlans, type Built, type Design } from "./design";
import { planThumb } from "./thumb";
import { mountLedger } from "./ledger-ui";
import { mountTeach } from "./teach-ui";
import { mountMotion } from "./motion-ui";
import { groupQuestions, type QuestionGroup } from "../rules/teacher-queue";
import { bookHtml } from "../rules/book";
import { activeRules, sourceLabel } from "../rules/ledger";
import { drawWhole, drawZoom, eventToPhoto, imageToCanvas, loadPhoto } from "./photo";
import { drawSampleStone, SAMPLE } from "./sample";
import { Viewer } from "./viewer";

interface State {
  photo?: HTMLCanvasElement;
  image?: ImageData;
  sourceLabel?: string;
  extraction?: Extraction;
  cornersPx?: Corner[];
  measured?: StoneOutline;
  cornersMm?: Corner[];
  shapeName?: string;
  error?: string;
  busy: boolean;
  longMm: number;
  depthMm: number;
  widthMm?: number;
  count: "single" | "batch";
  /** 今の設計（手順 6）と、その履歴（戻すため） */
  design: Design;
  history: Design[];
  built?: Built;
}

/** 帳面の上の数字を出してよいか（教えるの画面ができてから） */
let statsReady = false;
const state: State = { busy: false, longMm: SAMPLE.longMm, depthMm: SAMPLE.depthMm, count: "single", design: { ...DEFAULT_DESIGN }, history: [] };

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="shell">
  <header class="top">
    <div class="brand">
      <span class="mark" aria-hidden="true">継</span>
      <div><h1>継ぐ</h1><p>職人の判断と手を、次の人へ。</p></div>
    </div>
    <nav class="tabs" role="tablist">
      <button role="tab" data-tab="book" aria-selected="true"><span>帳面</span><small>ためる</small></button>
      <button role="tab" data-tab="keep" aria-selected="false"><span>残す</span><small>聞き取り・手の記録</small></button>
      <button role="tab" data-tab="check" aria-selected="false"><span>確かめる</span><small>設計を決まりで</small></button>
      <button role="tab" data-tab="teach" aria-selected="false"><span>教える</span><small>生徒の「なぜ？」<b class="count" id="teachCount">0</b></small></button>
    </nav>
  </header>

  <main class="pane" id="tab-book">
    <section class="hero">
      <p class="eyebrow">技の帳面</p>
      <h2>一人いなくなっても、判断の理由は残る。</h2>
      <p class="lead">職人が「何を見て・どこまでなら・なぜ」そう決めるのかを、名前と日付つきで残します。確かめも教えるのも、すべてこの帳面を読みます。アプリがなくても読める 1 枚に印刷できます。</p>
      <div class="stats" id="stats"></div>
      <div class="row">
        <button id="bookPrint" class="primary">技の帳面を印刷</button>
        <button id="bookSave">保存（HTML）</button>
      </div>
    </section>
    <section class="card">
      <div id="ledgerRoot"></div>
    </section>
  </main>

  <main class="pane" id="tab-keep" hidden>
    <section class="hero small">
      <p class="eyebrow">残す</p>
      <h2>作業のついでに、判断と手を残す。</h2>
      <p class="lead">Claude が一つずつ質問し、答えを決まりにまとめます。職人が確かめてから帳面に入ります。</p>
    </section>
    <section class="card" id="keepInterview"></section>
    <section class="card">
      <h3 class="card-title">手の記録 <span class="badge">試作中</span></h3>
      <p class="note">作業中の手を撮ると、手の骨格を追いかけて、動きのリズム・振れ幅・間を記録し、職人の一言を動画の何秒目かと一緒に残します。手本と比べて、違いを数字で見られます。</p>
      <div id="motionRoot"></div>
    </section>
    <section class="card" id="keepManual"></section>
  </main>

  <main class="pane check" id="tab-check" hidden>
    <aside class="steps">
      <section class="hero small">
        <p class="eyebrow">確かめる　題材：ジュエリー（一粒石の指輪）</p>
        <h2>設計を、職人の決まりで確かめる。</h2>
        <p class="lead">無理な所は赤く、根拠の決まりと、見た目への影響つきの直し方が出ます。</p>
      </section>
    <section class="step">
      <h2><span class="n">1</span>石の数</h2>
      <div class="row">
        <button data-count="single" aria-pressed="true">1 石</button>
        <button data-count="batch" aria-pressed="false">まとめて（平たい石）<span class="badge">これから</span></button>
      </div>
    </section>

    <section class="step">
      <h2><span class="n">2</span>写真</h2>
      <div class="row">
        <label class="btn primary" for="file">撮る・選ぶ</label>
        <input id="file" type="file" accept="image/*" capture="environment" />
        <button id="sample">見本の石で試す</button>
      </div>
      <p class="note">色のある石は白い紙、無色の石は黒い紙の上で、真上から。石が画面の 3 分の 1 くらいになるまで寄って撮ります。</p>
      <div class="photos" id="photos" hidden>
        <figure><canvas id="whole" class="pick"></canvas><figcaption id="wholeCap">全体。違う石を拾ったら、石を押して選び直す</figcaption></figure>
        <figure><canvas id="zoom"></canvas><figcaption><span class="legend"><span><i style="background:#19c24a"></i>輪郭</span><span><i style="background:#e0342b"></i>角</span></span></figcaption></figure>
      </div>
      <p class="error" id="error" hidden></p>
    </section>

    <section class="step">
      <h2><span class="n">3</span>大きさ</h2>
      <label class="field"><span>長辺（mm）<small>ノギスで、いちばん長い所</small></span><input id="long" type="number" step="0.01" min="0.5" inputmode="decimal"></label>
      <label class="field"><span>深さ（mm）<small>ノギスで、上面から一番下まで</small></span><input id="depth" type="number" step="0.01" min="0.2" inputmode="decimal"></label>
      <label class="field"><span>幅（mm）<small>空欄なら写真から出す</small></span><input id="width" type="number" step="0.01" min="0.5" inputmode="decimal" placeholder="写真から"></label>
    </section>

    <section class="step">
      <h2><span class="n">4</span>読み取り</h2>
      <div id="reading"><p class="note">写真を選ぶと、ここに形と寸法が出ます。</p></div>
    </section>

    <section class="step">
      <h2><span class="n">5</span>3 案 <span class="badge">決まりごとから</span></h2>
      <div class="cards" id="plans"><p class="note">石を読むと、その石に合う 3 案がここに出ます。押すとその案に切り替わります。</p></div>
    </section>

    <section class="step">
      <h2><span class="n">6</span>手で微調整</h2>
      <div class="controls" id="controls">
        <label>留め方<select data-k="style"><option value="prong">爪</option><option value="bezel">覆輪（ふくりん）</option></select></label>
        <label>爪の本数<select data-k="prongCount"><option value="0">自動</option>${[3, 4, 5, 6, 8].map((n) => `<option value="${n}">${n} 本</option>`).join("")}</select></label>
        <label>爪の太さ<select data-k="prongScale">${[0.8, 0.9, 1, 1.1, 1.2, 1.3].map((v) => `<option value="${v}">${v === 1 ? "標準" : `標準 × ${v}`}</option>`).join("")}</select></label>
        <label>高さ<select data-k="height"><option value="low">低め</option><option value="standard">標準（＋0.5 mm）</option><option value="high">高め（＋1.0 mm）</option></select></label>
        <label>向き<select data-k="orientation"><option value="along">縦（長辺が指に沿う）</option><option value="across">横</option></select></label>
        <label>地金<select data-k="metal">${Object.keys(GUIDES.metals).map((m) => `<option value="${m}">${metalName(m as keyof typeof GUIDES.metals)}</option>`).join("")}</select></label>
        <label>サイズ<select data-k="gou">${Array.from({ length: 30 }, (_, i) => i + 1).map((g) => `<option value="${g}">${g} 号</option>`).join("")}</select></label>
        <label>石の場所<select data-k="position"><option value="top">指の上</option><option value="side">横（肩）</option><option value="palm">手のひら側寄り</option></select></label>
      </div>
      <div class="row" style="margin-top:8px"><button id="undo" disabled>ひとつ戻す</button><span class="note" id="histNote"></span></div>
      <div id="checks"></div>
    </section>

    <section class="step">
      <h2><span class="n">7</span>型紙と指示書 </h2>
      <p class="note">原寸（1:1）の型紙：黒が石の縁、赤が覆輪の内側（点線）と外側。「実際のサイズ・100%」で印刷し、10 mm と 50 mm の線を定規で確かめます。印刷した線の上に本物の石を置くと、合っているかが分かります。</p>
      <div class="row" style="margin-top:8px">
        <button id="print" class="primary" disabled>型紙を印刷（原寸）</button>
        <button id="saveSvg" disabled>型紙を保存（SVG）</button>
        
      </div>
    </section>
    </aside>
    <div class="view" id="view">
      <div class="empty" id="empty">「見本の石で試す」か写真を選ぶと、指輪の 3D がここに出ます</div>
      <div class="hud" id="hud" hidden></div>
    </div>
  </main>

  <main class="pane" id="tab-teach" hidden>
    <section class="hero small">
      <p class="eyebrow">教える</p>
      <h2>先生が答えるのは、本当に職人にしか答えられない質問だけ。</h2>
      <p class="lead">生徒の「なぜ？」に、帳面の決まりと理由で答えます。帳面にない質問はまとめて先生へ。先生の答えは、新しい決まりとして帳面に入ります。</p>
    </section>
    <section class="card"><div id="teachRoot"></div></section>
  </main>
</div>`;

// 上の帯の高さ（確かめるのタブで、3D を画面の高さに合わせるため）
const fitTop = () => document.documentElement.style.setProperty("--top-h", `${document.querySelector<HTMLElement>(".top")!.offsetHeight}px`);
fitTop();
window.addEventListener("resize", fitTop);

// ---- タブ ----
function showTab(name: string) {
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  document.querySelectorAll<HTMLElement>(".pane").forEach((p) => (p.hidden = p.id !== `tab-${name}`));
  if (name === "check") window.dispatchEvent(new Event("resize"));
}
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab!)));

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewer = new Viewer($("view"));
let answering: QuestionGroup | null = null;
const ledgerUI = mountLedger($("ledgerRoot"), (_l, why, addedRuleId) => {
  $("histNote").textContent = `帳面：${why}`;
  renderStats();
  // 先生が「先生に聞くこと」に答えて決まりを足したら、その質問のまとまりに結びつける
  if (answering && addedRuleId) {
    teachUI.markAnswered(answering.ids, addedRuleId);
    answering = null;
  }
  if (state.measured) {
    renderPlans();
    updateRing();
  }
});
// 聞き取りと手で足すは「残す」のタブへ（帳面のタブには決まりの一覧だけ）
$("keepInterview").appendChild(document.getElementById("interview")!);
$("keepManual").appendChild(document.getElementById("manual")!.closest("details")!);
(document.getElementById("interview") as HTMLDetailsElement).open = true;

// 手の記録（試作）
mountMotion($("motionRoot"));

const teachUI = mountTeach($("teachRoot"), {
  ledger: () => ledgerUI.ledger(),
  password: () => document.querySelector<HTMLInputElement>("#ivPass")?.value ?? "",
  onQueueChange: (n) => {
    $("teachCount").textContent = String(n);
    renderStats();
  },
  onAnswer: (item) => {
    answering = item;
    showTab("keep");
    const box = document.querySelector("#manual")?.closest("details");
    if (box) box.open = true;
    const title = document.querySelector<HTMLInputElement>('#manual [data-f="title"]');
    if (title) {
      title.value = item.question;
      title.focus();
    }
  },
});
/** 帳面の上の数字（教えるの画面ができてから） */
function renderStats() {
  if (!statsReady) return;
  const rules = activeRules(ledgerUI.ledger());
  const craft = rules.filter((r) => r.source.kind === "craftsman");
  const names = new Set(craft.map((r) => (r.source.kind === "craftsman" ? r.source.name : "")));
  const open = groupQuestions(teachUI.queue()).length;
  const answered = groupQuestions(teachUI.queue(), { includeAnswered: true }).filter((g) => g.answeredRuleId).length;
  const items: [string, number, string][] = [
    ["職人の決まり", craft.length, "名前・日付・理由つき"],
    ["残した職人", names.size, "人"],
    ["公開情報の目安", rules.length - craft.length, "出典つき"],
    ["先生への質問", open, answered ? `答えて決まりにした ${answered}` : "まとめて届く"],
  ];
  $("stats").innerHTML = items.map(([k, n, sub]) => `<div class="stat"><b>${n}</b><span>${k}</span><small>${sub}</small></div>`).join("");
}
statsReady = true;
renderStats();

function book(): string {
  const answered = groupQuestions(teachUI.queue(), { includeAnswered: true })
    .filter((g) => g.answeredRuleId)
    .map((g) => ({ question: g.question, count: g.count, ruleId: g.answeredRuleId }));
  return bookHtml({ ledger: ledgerUI.ledger(), answered, date: new Date().toLocaleDateString("sv-SE") });
}
$("bookPrint").addEventListener("click", () => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(book());
  w.document.close();
  setTimeout(() => w.print(), 400);
});
$("bookSave").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([book()], { type: "text/html" }));
  a.download = `技の帳面-${new Date().toLocaleDateString("sv-SE")}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
});
const longIn = $<HTMLInputElement>("long");
const depthIn = $<HTMLInputElement>("depth");
const widthIn = $<HTMLInputElement>("width");
longIn.value = String(state.longMm);
depthIn.value = String(state.depthMm);

document.querySelectorAll<HTMLButtonElement>("[data-count]").forEach((b) =>
  b.addEventListener("click", () => {
    state.count = b.dataset.count as State["count"];
    document.querySelectorAll<HTMLButtonElement>("[data-count]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }),
);

$<HTMLInputElement>("file").addEventListener("change", async (ev) => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  setImage(await loadPhoto(f), f.name);
});
$("sample").addEventListener("click", () => {
  longIn.value = String(SAMPLE.longMm);
  depthIn.value = String(SAMPLE.depthMm);
  widthIn.value = "";
  readSizes();
  setImage(drawSampleStone(), SAMPLE.label);
});
$<HTMLCanvasElement>("whole").addEventListener("click", (ev) => {
  if (!state.photo || state.busy) return;
  runExtract(eventToPhoto(ev, $("whole"), state.photo));
});
for (const el of [longIn, depthIn, widthIn]) el.addEventListener("input", () => (readSizes(), update()));

/** 設計を変える。変える前の設計を履歴に積む（Claude の変更も同じ所を通す） */
function setDesign(next: Design, why: string) {
  state.history.push(state.design);
  state.design = next;
  $("histNote").textContent = `直前の変更：${why}`;
  syncControls();
  updateRing();
}
function syncControls() {
  document.querySelectorAll<HTMLSelectElement>("#controls select").forEach((el) => {
    el.value = String(state.design[el.dataset.k as keyof Design]);
  });
  $<HTMLButtonElement>("undo").disabled = state.history.length === 0;
}
document.querySelectorAll<HTMLSelectElement>("#controls select").forEach((el) =>
  el.addEventListener("change", () => {
    const k = el.dataset.k as keyof Design;
    const v = ["prongCount", "prongScale", "gou"].includes(k) ? Number(el.value) : el.value;
    setDesign({ ...state.design, [k]: v } as Design, `${el.parentElement!.firstChild!.textContent} を ${el.selectedOptions[0].textContent} に`);
  }),
);
$("undo").addEventListener("click", () => {
  const prev = state.history.pop();
  if (!prev) return;
  state.design = prev;
  $("histNote").textContent = "ひとつ戻しました";
  syncControls();
  updateRing();
});
syncControls();
window.addEventListener("resize", () => drawPhotos());

function sheet(): string | undefined {
  const m = state.measured;
  if (!m) return;
  return patternSvg({
    ...m,
    depthMm: state.depthMm,
    shapeName: state.shapeName ?? "",
    label: state.sourceLabel,
    date: new Date().toLocaleDateString("ja-JP"),
  });
}
$("print").addEventListener("click", () => {
  const svg = sheet();
  if (!svg) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>継ぐ 型紙</title>
<style>@page{size:A4;margin:0}html,body{margin:0}svg{display:block;width:210mm;height:297mm}</style></head><body>${svg}</body></html>`);
  w.document.close();
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    w.print();
  };
  w.onload = go;
  setTimeout(go, 500);
});
$("saveSvg").addEventListener("click", () => {
  const svg = sheet();
  if (!svg) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  a.download = `tsugu-pattern-${state.measured!.longMm.toFixed(2)}mm.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});

function readSizes() {
  const num = (el: HTMLInputElement) => (el.value.trim() === "" ? undefined : Number(el.value));
  state.longMm = num(longIn) ?? state.longMm;
  state.depthMm = num(depthIn) ?? state.depthMm;
  state.widthMm = num(widthIn);
}

function setImage(img: ImageData, label: string) {
  state.image = img;
  state.photo = imageToCanvas(img);
  state.sourceLabel = label;
  $("photos").hidden = false;
  runExtract();
}

function runExtract(pick?: { x: number; y: number }) {
  if (!state.image) return;
  state.busy = true;
  $("wholeCap").textContent = "読み取り中…";
  // 画面に「読み取り中」を出してから重い処理をする
  setTimeout(() => {
    try {
      const t0 = performance.now();
      state.extraction = extractStone(state.image!, { pick });
      state.error = undefined;
      console.info(`輪郭を取るのにかかった時間: ${(performance.now() - t0).toFixed(0)} ms`);
    } catch (e) {
      state.extraction = undefined;
      state.error = e instanceof NoStoneError ? e.message : `読み取りに失敗しました：${String(e)}`;
    }
    state.busy = false;
    update();
  }, 20);
}

function update() {
  const e = state.extraction;
  $("error").hidden = !state.error;
  $("error").textContent = state.error ?? "";
  if (!e) {
    drawPhotos();
    return;
  }
  state.cornersPx = findCorners(e.outlinePx);
  state.measured = measureOutline({ outlinePx: e.outlinePx, longMm: state.longMm, widthMm: state.widthMm });
  state.cornersMm = findCorners(state.measured.outlineMm);
  state.shapeName = nameShape(state.measured.outlineMm, state.cornersMm).name;
  $<HTMLButtonElement>("print").disabled = false;
  $<HTMLButtonElement>("saveSvg").disabled = false;
  const others = e.candidates.length - 1;
  $("wholeCap").textContent = `${state.sourceLabel ?? "写真"}。${others > 0 ? `ほかに石の候補が ${others} つ（点線）。` : ""}違う所を拾ったら、石を押して選び直す`;
  drawPhotos();
  renderReading();
  renderPlans();
  updateRing();
}

function stoneParams() {
  const m = state.measured!;
  return { outlineMm: m.outlineMm, longMm: m.longMm, widthMm: m.widthMm, depthMm: state.depthMm };
}

function look() {
  const e = state.extraction!;
  return { color: e.color, colorless: e.colorless };
}

/** 今の設計で指輪を組み、確かめて、3D と確かめの結果を出す */
function updateRing() {
  if (!state.measured) return;
  const b = build(stoneParams(), state.design, ledgerUI.ledger());
  state.built = b;
  viewer.setRing(b.ring, look(), b.problems);
  const m = state.measured;
  const d = state.design;
  $("empty").hidden = true;
  $("hud").hidden = false;
  $("hud").textContent = `石 ${m.longMm.toFixed(2)} × ${m.widthMm.toFixed(2)} × ${state.depthMm.toFixed(2)} mm ・ ${d.gou} 号（内径 ${b.ring.shank.innerDiameterMm.toFixed(1)} mm）・ ${metalName(d.metal)} 約 ${b.ring.metalWeightG.toFixed(1)} g ・ 目盛り 1 mm`;
  renderChecks(b);
}

function renderChecks(b: Built) {
  const s = b.ring.setting;
  const prongs = s.prongs.length;
  const vs = s.prongs.filter((p) => p.isV).length;
  const summary =
    b.design.style === "bezel"
      ? `覆輪：壁の厚み ${s.bezel?.wallMm.toFixed(2)} mm`
      : `爪 ${prongs} か所（うち V 字 ${vs}）・太さ ${s.prongs[0]?.diameterMm.toFixed(2)} mm（標準 ${s.standardProngMm.toFixed(2)} mm）`;
  const head = `<p class="note" style="margin-top:10px">${summary}・石の一番下と指のすき間 ${b.ring.culetGapMm.toFixed(2)} mm・地金 約 ${b.ring.metalWeightG.toFixed(1)} g</p>`;
  if (b.problems.length === 0) {
    $("checks").innerHTML = `${head}<p class="ok-line">✓ 確かめはすべて目安の内側です。</p><p class="note">${HOLD_NOTE}。数字は${GUIDE_NOTE}。</p>`;
    return;
  }
  $("checks").innerHTML = `${head}<ul class="problems">${b.problems
    .map(
      (p) => `<li><b>${p.where}</b>：今 ${p.current}／必要 ${p.required}<span class="why">${p.reason}</span>${
        p.rule ? `<span class="cite">根拠：${p.rule.title}（${sourceLabel(p.rule.source)}・${p.rule.date}）</span>` : ""
      }<span class="opts">${p.options
        .map((o) => `<span class="opt">${o.label}<small>（${o.effectOnLook}）</small></span>`)
        .join("")}</span></li>`,
    )
    .join("")}</ul><p class="note">赤い爪・赤い印が問題の場所。${HOLD_NOTE}。数字は${GUIDE_NOTE}。</p>`;
}

function drawPhotos() {
  if (!state.photo) return;
  const ext = state.extraction;
  const ends = ext ? extent(ext.outlinePx).ends : undefined;
  drawWhole($("whole"), state.photo, { extraction: ext, corners: state.cornersPx });
  drawZoom($("zoom"), state.photo, { extraction: ext, corners: state.cornersPx, ends });
}

function renderReading() {
  const e = state.extraction!;
  const m = state.measured!;
  const shape = nameShape(m.outlineMm, state.cornersMm!);
  const h = stoneHeights({ outlineMm: m.outlineMm, longMm: m.longMm, widthMm: m.widthMm, depthMm: state.depthMm });
  const [c, p] = GUIDES.stone.defaultCrownPavilion;
  const angles = state.cornersMm!.map((k) => `${k.angleDeg.toFixed(0)}°`).join("・");
  const rgb = `rgb(${e.color.r.toFixed(0)},${e.color.g.toFixed(0)},${e.color.b.toFixed(0)})`;
  const rows: [string, string, string?][] = [
    ["形の呼び名", shape.name, shape.reason],
    ["長辺", `${m.longMm.toFixed(2)} mm`, "ノギスで測った値"],
    ["幅", `${m.widthMm.toFixed(2)} mm`, m.widthFromPhoto ? "写真の比率から出した値（測れば上書き）" : `測った値（写真からは ${m.widthFromPhotoMm.toFixed(2)} mm）`],
    ["深さ", `${state.depthMm.toFixed(2)} mm`, "ノギスで測った値"],
    ["上側（クラウン）／下側（パビリオン）", `${h.crownMm.toFixed(2)} ／ ${h.pavilionMm.toFixed(2)} mm`, `横からの写真がないので ${c}:${p} で仮に置いた`],
    ["縁（ガードル）の厚み", `${h.girdleMm.toFixed(2)} mm`, "石の大きさの約 2%（目安）"],
    ["尖った角", `${state.cornersMm!.length} か所`, angles ? `内角 ${angles}。欠けやすいので爪で守る` : "なし"],
    ["色", `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;background:${rgb}"></span> ${e.colorless ? "無色" : "色のある石"}`, "写真の石の部分の平均"],
    ["写真の細かさ", `1 px ＝ ${(m.mmPerPx * 1000).toFixed(1)} µm`, `長辺 ${extent(e.outlinePx).long.toFixed(0)} px`],
  ];
  $("reading").innerHTML = `<table class="read">${rows
    .map(([k, v, why]) => `<tr><th>${k}</th><td>${v}${why ? `<span class="why">${why}</span>` : ""}</td></tr>`)
    .join("")}</table><p class="note">Claude の読み（欠けやすそうな所・留める向き・根拠）は 11/4 から。数字は${GUIDE_NOTE}。</p>`;
}

function renderPlans() {
  const plans = rulePlans(stoneParams(), state.cornersMm!, state.design);
  const e = state.extraction!;
  const fill = e.colorless ? "#eef2f6" : `rgb(${e.color.r.toFixed(0)},${e.color.g.toFixed(0)},${e.color.b.toFixed(0)})`;
  $("plans").innerHTML = plans
    .map((p, i) => {
      const b = build(stoneParams(), p.design, ledgerUI.ledger());
      const n = b.problems.length;
      const checks =
        n === 0
          ? `<span class="ok">✓ 確かめ OK（すき間 ${b.ring.culetGapMm.toFixed(1)} mm・約 ${b.ring.metalWeightG.toFixed(1)} g）</span>`
          : `<span class="ng">！ 気をつける所 ${n} つ：${b.problems.slice(0, 2).map((q) => q.where).join("・")}${n > 2 ? " ほか" : ""}</span>`;
      return `<button class="card" data-plan="${i}">${planThumb(b.ring, fill)}<div><h3>${p.name}</h3><p>${p.reason}</p><div class="checks">${checks}</div></div></button>`;
    })
    .join("");
  $("plans").querySelectorAll<HTMLButtonElement>("[data-plan]").forEach((el) =>
    el.addEventListener("click", () => {
      const p = plans[Number(el.dataset.plan)];
      setDesign({ ...p.design }, `案「${p.name}」に切り替え`);
    }),
  );
}

// 確かめ用（ヘッドレスのブラウザから読む）
(window as unknown as { __tsugu: unknown }).__tsugu = { state, viewer, load: setImage, sheet, setDesign };
