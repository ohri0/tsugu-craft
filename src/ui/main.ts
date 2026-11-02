// 画面。左に手順、右に大きな 3D（スマホは上に 3D、下に手順）。
import "./style.css";
import { findCorners, type Corner } from "../geometry/corners";
import { measureOutline, type StoneOutline } from "../geometry/measure";
import { extent } from "../geometry/polygon";
import { nameShape } from "../geometry/shape";
import { buildStone, stoneHeights } from "../geometry/stone";
import { GUIDE_NOTE, GUIDES } from "../rules/guides";
import { extractStone, NoStoneError, type Extraction } from "../vision/extract";
import { mockPlans } from "./mock";
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
  error?: string;
  busy: boolean;
  longMm: number;
  depthMm: number;
  widthMm?: number;
  count: "single" | "batch";
}

const state: State = { busy: false, longMm: SAMPLE.longMm, depthMm: SAMPLE.depthMm, count: "single" };

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="app">
  <aside class="steps">
    <header>
      <h1>Stone Fit</h1>
      <p>その石にしかない指輪を、写真から。</p>
    </header>

    <section class="step">
      <h2><span class="n">1</span>石の数</h2>
      <div class="row">
        <button data-count="single" aria-pressed="true">1 石</button>
        <button data-count="batch" aria-pressed="false">まとめて（平たい石）<span class="badge">11/3</span></button>
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

    <section class="step mock">
      <h2><span class="n">5</span>3 案 <span class="badge">モック・11/4 に Claude が考える</span></h2>
      <div class="cards" id="plans"><p class="note">石を読むと、その石に合う 3 案がここに出ます。</p></div>
    </section>

    <section class="step mock">
      <h2><span class="n">6</span>手で微調整 <span class="badge">モック・11/3</span></h2>
      <div class="mockbody">留め方（覆輪 / 爪）、爪の本数・太さ、高さ（低め / 標準 / 高め）、向き（縦 / 横）、地金、サイズ（号）。すべて履歴に積み、戻せます。</div>
    </section>

    <section class="step mock">
      <h2><span class="n">7</span>型紙と指示書 <span class="badge">モック・11/4〜5</span></h2>
      <div class="mockbody">1 ページ目が指示書、2 ページ目が原寸（1:1）の型紙。「実際のサイズ・100%」で印刷し、10 mm と 50 mm の線を定規で確かめます。<div class="row" style="margin-top:8px"><button disabled>PDF に書き出す</button></div></div>
    </section>
  </aside>
  <main class="view" id="view">
    <div class="empty" id="empty">石の 3D がここに出ます（ドラッグで回す）</div>
    <div class="hud" id="hud" hidden></div>
  </main>
</div>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewer = new Viewer($("view"));
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
window.addEventListener("resize", () => drawPhotos());

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
  const others = e.candidates.length - 1;
  $("wholeCap").textContent = `${state.sourceLabel ?? "写真"}。${others > 0 ? `ほかに石の候補が ${others} つ（点線）。` : ""}違う所を拾ったら、石を押して選び直す`;
  drawPhotos();
  renderReading();
  renderPlans();
  const m = state.measured;
  const mesh = buildStone({ outlineMm: m.outlineMm, longMm: m.longMm, widthMm: m.widthMm, depthMm: state.depthMm });
  viewer.setStone(mesh, { color: e.color, colorless: e.colorless });
  $("empty").hidden = true;
  $("hud").hidden = false;
  $("hud").textContent = `${m.longMm.toFixed(2)} × ${m.widthMm.toFixed(2)} × ${state.depthMm.toFixed(2)} mm ・ 目盛り 1 mm ・ ドラッグで回す`;
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
  const plans = mockPlans(state.measured!.outlineMm, state.cornersMm!);
  $("plans").innerHTML = plans
    .map(
      (p) => `<div class="card">${p.svg}<div><h3>${p.name}</h3><p>${p.reason}</p><div class="checks">${p.checks
        .map((c) => `<span class="${c.ok ? "ok" : "ng"}">${c.ok ? "✓" : "！"} ${c.text}</span>`)
        .join("<br>")}</div></div></div>`,
    )
    .join("");
}

// 確かめ用（ヘッドレスのブラウザから読む）
(window as unknown as { __stoneFit: unknown }).__stoneFit = { state, viewer, load: setImage };
