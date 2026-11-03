// 継ぐ：デザインを、職人の判断で「作れる形」にする。
// 生む。  石の写真・デザインの絵・希望の言葉 → Claude が指輪を組み、作れるか確かめ、直す（作業の記録が見える）。
// 整える。作れない所が赤く光り、誰のどの決まりかと、見た目への影響つきの直し方が出る。人も同じつまみで直せる。
// 渡す。  職人への指示書・原寸の型紙・3D データ。
// 帳面   職人が声で決まりを足すと、その場で確かめが変わる。
import { MAIN, addWorkshop, setActive } from "../rules/workshops";
import { side, summarize, sweepDesigns, sweepOne, type SweepDesign, type SweepResult } from "./sweep";
import { SAMPLE_DESIGNS, SAMPLE_MAKER, SAMPLE_NOTE, isSample, outlineThumb, sampleState, sampleStone, tuneSample } from "./samples";
import { MAKING_STEPS, isCheckRule, makingRulesFor, stepsOfRule } from "../rules/making";
import "./pro.css";
import { findCorners } from "../geometry/corners";
import { measureOutline, type StoneOutline } from "../geometry/measure";
import { outlineIndexAtT } from "../geometry/setting";
import { nameShape } from "../geometry/shape";
import { runClaude, type LogEntry } from "../claude/loop";
import { designPrompt, keepPrompt } from "../claude/prompt";
import { TOOLS, type ProposeRuleInput, type ProposeRuleResult, type ToolHost, type Metal } from "../claude/tools";
import type { ClaudeContentBlockParam } from "../claude/wire";
import { patternSvg } from "../pattern/sheet";
import { rulePlans } from "../ui/design";
import { loadPhoto } from "../ui/photo";
import { Viewer, type DisplayMode } from "../ui/viewer";
import { extractStone, type Extraction } from "../vision/extract";
import { PARAMS, activeRules, addRule, seedLedger, valueFor, type Ledger, type ParamId, type Rule } from "../rules/ledger";
import { askPassword, resetPassword } from "../app/password";
import { esc, store, today } from "../app/store";
import { bindVoice } from "../app/voice";
import { bookLabel, masterName, sourceName } from "../app/master";
import { toStl } from "../cad/solid";
import { buildStone } from "../geometry/stone";
import { METAL_LABEL, RingSession, type Built } from "./session";
import { howToMake, type Method } from "./howto";
import { sheetHtml } from "./sheet";
import { whyHtml } from "./why";
import { SORT_TIPS, parseTips, tipsFor, tipsPrompt, type Tip } from "./tips";
import { PRESETS, presetOutline, type StonePreset } from "./presets";
import { drawingPage, type DrawingView, DRAWING_CSS } from "./drawing";
import { loadWorks, newWorkId, removeWork, saveWork, updateWork, worksBookHtml, type WorkRecord } from "./works";
import { KIND_LABEL, toolById, toolsForStep } from "./toolbox";
import { NOTE, TERMS, type AlloyId } from "./process";
import type { Step } from "./howto";
import { MAKE_BAND, SECTION_LABEL, bandHowTo, bandInnerDiameter, bandMesh, bandPrompt, checkBand, parseBand, type Band, type BandDraft, type SectionKind } from "./band";
import { metalIdOf } from "./session";
import { GUIDES, minProngMm } from "../rules/guides";
import { callTool } from "../rebuild/run";
import { dimsSvg, gizmoSvg, type Dim, type Rect } from "./dims";

type Mode = "make" | "refine" | "hand" | "works";
const MODES: { id: Mode; word: string; key: string; sub: string }[] = [
  { id: "make", word: "生む", key: "1", sub: "石・絵・言葉から形を組む" },
  { id: "refine", word: "確かめる", key: "2", sub: "作れるか" },
  { id: "hand", word: "作る", key: "3", sub: "鋳造・鍛造の手順" },
  { id: "works", word: "記録", key: "4", sub: "作った物ごとに残す" },
];
// 線だけの小さな絵（自作）
const ICON = {
  angle: `<svg viewBox="0 0 20 20"><path d="M10 2.5 17 6.5v7L10 17.5 3 13.5v-7z"/><path d="M3 6.5 10 10.5l7-4M10 10.5v7"/></svg>`,
  top: `<svg viewBox="0 0 20 20"><rect x="3.5" y="3.5" width="13" height="13" rx="1.5"/><path d="M10 7v6M7 10h6"/></svg>`,
  side: `<svg viewBox="0 0 20 20"><rect x="3.5" y="5.5" width="13" height="9" rx="1.5"/><path d="M3.5 10h13"/></svg>`,
  front: `<svg viewBox="0 0 20 20"><circle cx="10" cy="11" r="5.5"/><circle cx="10" cy="11" r="3.2"/><path d="M8 3.5h4l-1 2H9z"/></svg>`,
  grid: `<svg viewBox="0 0 20 20"><path d="M3 7h14M3 13h14M7 3v14M13 3v14"/></svg>`,
  dims: `<svg viewBox="0 0 20 20"><path d="M3 14 14 3l3 3L6 17z"/><path d="M6.5 10.5l1.5 1.5M9 8l1.5 1.5M11.5 5.5 13 7"/></svg>`,
  fit: `<svg viewBox="0 0 20 20"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/></svg>`,
  solitaire: `<svg viewBox="0 0 24 24"><circle cx="12" cy="15" r="6.5"/><path d="M9 6.5h6l-3 3.5z"/><path d="M8.5 6.5 10 4h4l1.5 2.5"/></svg>`,
  band: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="8"/><ellipse cx="12" cy="12" rx="5.6" ry="5.6"/></svg>`,
  pendant: `<svg viewBox="0 0 24 24"><path d="M5 3c2 4 4.5 6 7 6s5-2 7-6"/><circle cx="12" cy="15" r="5"/><circle cx="12" cy="15" r="3"/></svg>`,
};
const SAMPLE = { url: "stones/triangle.jpg", longMm: 8.88, depthMm: 4.24, label: "作者の石（淡い青の三角）" };

interface Stone {
  photo: ImageData;
  label: string;
  extraction: Extraction;
  measured: StoneOutline;
  longMm: number;
  depthMm: number;
  shapeName: string;
  cornerIdx: { index: number; angle: number }[];
}
let stone: Stone | null = null;
let sketch: { dataUrl: string; base64: string; media: "image/jpeg" | "image/png" } | null = null;
let session: RingSession | null = null;
let reason = "";
let undoClaude: (() => boolean) | null = null;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="pro" data-mode="make">
  <header class="tb">
    <div class="tb-l"><a class="brand" href="./"><span class="logo">継</span>継ぐ</a><span class="doc"><span class="word-name">新しい作品</span></span></div>
    <nav class="tabs" aria-label="場面">${MODES.map((m) => `<button type="button" data-mode="${m.id}" title="${m.sub}（${m.key}）">${m.word}<span class="k">${m.key}</span></button>`).join("")}</nav>
    <div class="tb-r"><nav class="places hide-sm" aria-label="ほかの場所"><a href="app.html#see" title="次の人が、手本と比べて学ぶ">学ぶ</a><a href="app.html#keep" title="職人が、決まり・手本・答えを残す">残す</a><a href="app.html#rebuild" title="途切れた技を、手がかりから">組み立て直す</a></nav><button type="button" class="btn quiet act-why">なぜ継ぐ</button><button type="button" class="btn act-sheet hide-sm">図面・指示書</button><button type="button" class="btn primary act-stl">STL</button></div>
  </header>
  <nav class="tools" aria-label="見る">
    ${(["angle", "top", "side", "front"] as const).map((v) => `<button type="button" class="tool view-btn" data-view="${v}" data-tip="${{ angle: "斜め", top: "上", side: "横", front: "正面" }[v]}" aria-label="${{ angle: "斜め", top: "上", side: "横", front: "正面" }[v]}">${ICON[v]}</button>`).join("")}
    <hr>
    <button type="button" class="tool t-grid" data-tip="1 mm の目盛り" aria-label="目盛り" aria-pressed="true">${ICON.grid}</button>
    <button type="button" class="tool t-dims" data-tip="寸法" aria-label="寸法" aria-pressed="true">${ICON.dims}</button>
    <button type="button" class="tool t-fit" data-tip="全体を見る" aria-label="全体を見る">${ICON.fit}</button>
  </nav>
  <section class="vp">
    <div class="gl"></div>
    <svg class="dims" aria-hidden="true"></svg>
    <svg class="gizmo" viewBox="0 0 60 60" aria-hidden="true"></svg>
    <div class="vp-tl"><b class="vp-view">斜め</b><div class="disp" role="group" aria-label="表示">${(["wire", "shaded", "render", "draw"] as const).map((d) => `<button type="button" data-disp="${d}" aria-pressed="${d === "render"}">${{ wire: "ワイヤー", shaded: "シェード", render: "レンダー", draw: "図面" }[d]}</button>`).join("")}</div></div>
    <div class="verdict-chip" hidden></div>
    <div class="intro-stage" hidden><div class="intro-frame"><canvas class="intro-photo"></canvas><svg class="intro-line" preserveAspectRatio="none"></svg></div><p class="intro-cap"></p></div>
  </section>

  <aside class="insp">
    <div class="insp-head"><b class="vp-mode"></b><small class="word-sub"></small></div>
    <div class="pane make-panel">
      <section class="sec"><h4>種類</h4>
        <div class="kinds">
          <button type="button" data-kind="solitaire" aria-pressed="true">${ICON.solitaire}<span><b>一粒石の指輪</b><small>石の写真から</small></span></button>
          <button type="button" data-kind="band" aria-pressed="false">${ICON.band}<span><b>甲丸・平打ちの指輪</b><small>石なし</small></span></button>
        </div>
      </section>
      <section class="sec band-only" hidden><h4>形</h4><div class="band-ctrl"></div></section>
      <section class="sec solitaire-only"><h4>石</h4>
        <label class="asset stone-card"><canvas class="stone-thumb" width="120" height="120"></canvas><span><b>石の写真</b><small class="stone-sub">—</small></span><span class="act">変える</span><input type="file" accept="image/*" class="stone-file" hidden></label>
        <div class="presets" role="group" aria-label="よくある形">${PRESETS.map((p) => `<button type="button" data-preset="${p.id}">${p.name}</button>`).join("")}</div>
        <div class="fields"><label class="field">長辺<span class="in"><input type="number" step="0.01" class="in-long" inputmode="decimal"><i>mm</i></span></label><label class="field">深さ<span class="in"><input type="number" step="0.01" class="in-depth" inputmode="decimal"><i>mm</i></span></label></div>
      </section>
      <section class="sec solitaire-only"><h4>デザインの絵<small>なくてもよい</small></h4>
        <label class="asset sketch-card"><span class="thumb sketch-thumb">—</span><span><b>デザイナーの絵</b><small class="sketch-sub">写真か画像</small></span><span class="act">選ぶ</span><input type="file" accept="image/*" class="sketch-file" hidden></label>
      </section>
      <section class="sec"><h4>Claude の作業</h4>
        <ol class="worklog"><li class="note">下の欄に希望を書いて「生む」。Claude が組み、作れるか確かめて直します。</li></ol>
      </section>
    </div>
    <div class="pane studio-refine" hidden></div>
    <div class="pane build-panel" hidden></div>
    <div class="pane works-panel" hidden></div>
  </aside>

  <div class="cmd-wrap"><form class="prompt command"><span class="cmd-label">希望</span><input type="text" class="wish" placeholder="例：華奢に。毎日つける。石を大きく見せたい" aria-label="希望"><kbd>⏎</kbd><button type="submit">生む</button></form></div>
  <footer class="sb"><p class="make-status"></p><dl class="specs"></dl></footer>
</div>`;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

// ---- 3D ----
const viewer = new Viewer($(".gl"));
viewer.setDark(true);

// ---- 寸法の線と軸の印（3D を描き直すたびに合わせる） ----
let dims: Dim[] = [];
let showDims = true;
/** 見せ場の間は寸法を出さない（最後に 1 本ずつ出す） */
let holdDims = false;
/** 石座の箱（3D、mm）。数字の札をこの上に重ねない */
let headBox: { min: [number, number, number]; max: [number, number, number] } | null = null;
/** 札を重ねない所：画面のボタンと、石座が映っている所 */
function dimsAvoid(): { avoid: Rect[]; bounds: Rect } {
  const svg = $(".dims").getBoundingClientRect();
  const avoid: Rect[] = [];
  for (const sel of [".vp-tl", ".verdict-chip", ".tools", ".gizmo"]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el || el.hidden || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.height) avoid.push({ x: r.left - svg.left, y: r.top - svg.top, w: r.width, h: r.height });
  }
  if (headBox) {
    const { min, max } = headBox;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      const p = viewer.project(x, y, z);
      if (!p) continue;
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    // 角を写した箱は実際より大きいので、少しだけ縮める
    const sx = (x1 - x0) * 0.1, sy = (y1 - y0) * 0.1;
    if (x1 > x0) avoid.push({ x: x0 + sx, y: y0 + sy, w: x1 - x0 - sx * 2, h: y1 - y0 - sy * 2 });
  }
  return { avoid, bounds: { x: 4, y: 4, w: svg.width - 8, h: svg.height - 8 } };
}
function drawDims(d: Dim[] = dims) {
  $(".dims").innerHTML = showDims && !holdDims ? dimsSvg(d, (x, y, z) => viewer.project(x, y, z), 1, dimsAvoid()) : "";
}
viewer.onFrame(() => {
  drawDims();
  $(".gizmo").innerHTML = gizmoSvg(viewer.axes());
});
function setDims(d: Dim[]) {
  dims = d;
  drawDims();
}
/** 石座の箱（画面の 3D と同じ座標） */
function headBoxOf(b: Built): typeof headBox {
  const sp = b.ring.ringPositions.setting;
  if (!sp.length) return null;
  const lift = b.ring.shank.outerRadiusMm;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < sp.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = sp[i + k] + (k === 2 ? lift : 0);
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  return { min, max };
}
/** 一粒石の指輪の寸法：内径・石の長辺・石と指のすき間・指から石座の上まで */
function ringDims(b: Built): Dim[] {
  if (!stone) return [];
  const r = b.ring;
  const lift = r.shank.outerRadiusMm;
  const ri = r.shank.innerDiameterMm / 2;
  const t = r.transform;
  const h = r.stone.heights;
  const c = Math.cos(t.rotationZ);
  const sn = Math.sin(t.rotationZ);
  const pts = stone.measured.outlineMm.map((q) => ({ x: q.x * c - q.y * sn, y: q.x * sn + q.y * c }));
  let pair: [{ x: number; y: number }, { x: number; y: number }] = [pts[0], pts[0]];
  let best = -1;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2;
      if (d > best) [best, pair] = [d, [pts[i], pts[j]]];
    }
  const tableZ = t.translateZ + h.tableZ + lift + 0.8;
  const culetZ = t.translateZ + h.culetZ + lift;
  const fingerTop = lift + ri;
  let top = 0;
  const sp = r.ringPositions.setting;
  for (let i = 2; i < sp.length; i += 3) top = Math.max(top, sp[i]);
  top += lift;
  const halfY = Math.max(...pts.map((q) => Math.abs(q.y)));
  const bad = new Set(b.problems.map((p) => p.check));
  return [
    { a: [0, -ri, lift], b: [0, ri, lift], label: `内径 ø${(ri * 2).toFixed(1)}` },
    { a: [pair[0].x, pair[0].y, tableZ], b: [pair[1].x, pair[1].y, tableZ], label: `石 ${stone.measured.longMm.toFixed(2)}` },
    { a: [0, 0, fingerTop], b: [0, 0, culetZ], label: `すき間 ${r.culetGapMm.toFixed(2)}`, bad: bad.has("finger-gap") },
    { a: [0, -halfY - 1.4, fingerTop], b: [0, -halfY - 1.4, top], label: `高さ ${(top - fingerTop).toFixed(2)}`, bad: bad.has("tip-height") },
  ];
}
/** 石のない指輪の寸法：内径・上の幅と厚み・下の厚み */
function bandDims(positions: Float32Array): Dim[] {
  let zmin = Infinity;
  for (let i = 2; i < positions.length; i += 3) zmin = Math.min(zmin, positions[i]);
  const ri = bandInnerDiameter(band.gou) / 2;
  const cz = zmin + band.bottom.thickness + ri;
  const ztop = cz + ri + band.top.thickness;
  const titles = checkBand(band).map((p) => p.title).join(" ");
  const thin = titles.includes("厚");
  const narrow = titles.includes("幅");
  return [
    { a: [0, -ri, cz], b: [0, ri, cz], label: `内径 ø${(ri * 2).toFixed(1)}` },
    { a: [-band.top.width / 2, 0, ztop], b: [band.top.width / 2, 0, ztop], label: `幅 ${band.top.width.toFixed(1)}`, bad: narrow },
    { a: [band.top.width / 2 + 0.9, 0, cz + ri], b: [band.top.width / 2 + 0.9, 0, ztop], label: `厚み ${band.top.thickness.toFixed(1)}`, bad: thin },
    { a: [band.bottom.width / 2 + 0.9, 0, zmin], b: [band.bottom.width / 2 + 0.9, 0, zmin + band.bottom.thickness], label: `下 ${band.bottom.thickness.toFixed(1)}`, bad: thin },
  ];
}

// ---- 石を読む ----
async function loadStone(img: ImageData, label: string, longMm: number, depthMm: number, opts: { intro?: boolean } = {}) {
  const extraction = extractStone(img);
  const measured = measureOutline({ outlinePx: extraction.outlinePx, longMm });
  const corners = findCorners(measured.outlineMm);
  stone = {
    photo: img,
    label,
    extraction,
    measured,
    longMm,
    depthMm,
    shapeName: nameShape(measured.outlineMm, corners).name,
    cornerIdx: corners.map((c) => ({ index: outlineIndexAtT(measured.outlineMm, c.t), angle: Math.round(c.angleDeg) })),
  };
  $<HTMLInputElement>(".in-long").value = String(longMm);
  $<HTMLInputElement>(".in-depth").value = String(depthMm);
  $(".stone-sub").textContent = `${stone.shapeName}・${measured.longMm.toFixed(2)} × ${measured.widthMm.toFixed(2)} mm`;
  drawThumb();
  compare = null;
  session = new RingSession(
    { outlineMm: measured.outlineMm, longMm: measured.longMm, widthMm: measured.widthMm, depthMm },
    ledgerNow,
    onBuilt,
    (view) => viewer.snapshotFrom(view).split(",")[1],
  );
  session.solid = !new URLSearchParams(location.search).has("tube");
  // 最初は、決まりごとから作った案（Claude なしでも形が出る）
  const plan = rulePlans(session.stone, corners)[0];
  session.state.style = plan.design.style;
  session.state.height = plan.design.height;
  reason = `${plan.name}：${plan.reason}（決まりごとから）`;
  tuneProngs();
  if (opts.intro) await intro();
  else session.build("最初の案");
}

/** 最初の見せ場：写真に輪郭が描かれ → 石が立体になり → まわりに指輪が組み上がる */
async function intro() {
  if (!stone || !session) return;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const box = $(".intro-stage");
  const cv = $<HTMLCanvasElement>(".intro-photo");
  const p = stone.photo;
  cv.width = p.width;
  cv.height = p.height;
  cv.getContext("2d")!.putImageData(p, 0, 0);
  const svg = document.querySelector<SVGSVGElement>(".intro-line")!;
  svg.setAttribute("viewBox", `0 0 ${p.width} ${p.height}`);
  const d = `M${stone.extraction.outlinePx.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join("L")}Z`;
  svg.innerHTML = `<path d="${d}" pathLength="1000"/>${findCorners(stone.extraction.outlinePx).map((c) => `<circle cx="${c.point.x}" cy="${c.point.y}" r="${p.width / 45}"/>`).join("")}`;
  $(".intro-cap").textContent = `${stone.label}　長辺 ${stone.measured.longMm.toFixed(2)} mm`;
  box.hidden = false;
  box.classList.remove("out");
  void box.offsetWidth;
  box.classList.add("draw");
  await wait(2200);
  $(".intro-cap").textContent = `${stone.shapeName}・尖った角 ${stone.cornerIdx.length} か所・幅 ${stone.measured.widthMm.toFixed(2)} mm`;
  await wait(1100);
  viewer.setStone(buildStone(session.stone), { color: stone.extraction.color, colorless: stone.extraction.colorless });
  box.classList.add("out");
  await wait(900);
  box.hidden = true;
  box.classList.remove("draw", "out");
  // 線だけで組み上がる → 灰色の面 → 金。寸法を 1 本ずつ入れ、最後に図面と作り方
  const t0 = performance.now();
  const timer = document.createElement("div");
  timer.className = "intro-timer";
  $(".vp").appendChild(timer);
  let label = "";
  const draw = () => (timer.innerHTML = `<b>${label}</b><span>${((performance.now() - t0) / 1000).toFixed(1)} 秒</span>`);
  const tick = (l: string) => {
    label = l;
    draw();
  };
  const clock = setInterval(draw, 100);
  holdDims = true;
  setDisp("wire");
  tick("組んでいます");
  session.build("最初の案");
  await viewer.reveal(1500);
  tick("確かめています");
  setDisp("shaded");
  await wait(700);
  setDisp("render");
  holdDims = false;
  const all = dims;
  for (let i = 1; i <= all.length; i++) {
    dims = all.slice(0, i);
    drawDims();
    await wait(260);
  }
  dims = all;
  // 図面と作り方ができたことを、小さな札で見せる
  const b = session.built!;
  const steps = howToMake(howInput(b), method);
  const sheetImg = viewer.drawing("front", 14);
  const card = document.createElement("div");
  card.className = "intro-sheet";
  card.innerHTML = `<img alt="" src="${sheetImg.url}"><div><b>図面と作り方</b><small>正面図ほか ・ ${steps.length} 工程 ・ ${grouped(b).length ? `直す所 ${grouped(b).length}` : "作れる形"}</small></div>`;
  $(".vp").appendChild(card);
  tick("写真 1 枚 → 図面と作り方");
  clearInterval(clock);
  timer.classList.add("done");
  await wait(3200);
  card.classList.add("out");
  timer.classList.add("out");
  await wait(700);
  card.remove();
  timer.remove();
}
/** 人が表示（ワイヤー・シェード・レンダー・図面）を選んだか */
let dispChosen = false;
/** 表示の切り替え（ボタンの見た目もそろえる） */
function setDisp(m: DisplayMode) {
  viewer.setDisplayMode(m);
  document.querySelectorAll<HTMLButtonElement>(".disp button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.disp === m)));
}

function drawThumb() {
  if (!stone) return;
  const c = $<HTMLCanvasElement>(".stone-thumb");
  const g = c.getContext("2d")!;
  const p = stone.photo;
  const pts = stone.extraction.outlinePx;
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.75;
  const tmp = document.createElement("canvas");
  tmp.width = p.width;
  tmp.height = p.height;
  tmp.getContext("2d")!.putImageData(p, 0, 0);
  g.drawImage(tmp, cx - half, cy - half, half * 2, half * 2, 0, 0, c.width, c.height);
  g.strokeStyle = "#409cff";
  g.lineWidth = 2;
  g.beginPath();
  pts.forEach((q, i) => {
    const x = ((q.x - (cx - half)) / (half * 2)) * c.width;
    const y = ((q.y - (cy - half)) / (half * 2)) * c.height;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
  g.stroke();
}

/** よくある形：白い紙の上の写真のように描いて、写真と同じ読み取りに通す */
async function loadPreset(p: StonePreset) {
  const W = 720;
  const k = 260 / p.longMm;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#f6f5f2";
  g.fillRect(0, 0, W, W);
  const pts = presetOutline(p);
  g.beginPath();
  pts.forEach((q, i) => (i ? g.lineTo(W / 2 + q.x * k, W / 2 - q.y * k) : g.moveTo(W / 2 + q.x * k, W / 2 - q.y * k)));
  g.closePath();
  const grad = g.createRadialGradient(W / 2 - 30, W / 2 - 30, 10, W / 2, W / 2, 160);
  grad.addColorStop(0, "#c9ced3");
  grad.addColorStop(1, "#8e969e");
  g.fillStyle = grad;
  g.fill();
  document.querySelectorAll<HTMLButtonElement>(".presets button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === p.id)));
  await loadStone(g.getImageData(0, 0, W, W), `${p.name}の石`, p.longMm, p.depthMm, { intro: false });
  $(".make-status").textContent = `${p.name}（${p.longMm} × ${p.widthMm} mm、深さは例）。ノギスの値があれば、長辺と深さを直してください。`;
}
document.querySelectorAll<HTMLButtonElement>(".presets button").forEach((b) => b.addEventListener("click", () => void loadPreset(PRESETS.find((p) => p.id === b.dataset.preset)!)));

async function loadSample() {
  const img = new Image();
  img.src = SAMPLE.url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  await loadStone(g.getImageData(0, 0, c.width, c.height), SAMPLE.label, SAMPLE.longMm, SAMPLE.depthMm, { intro: !new URLSearchParams(location.search).has("nointro") });
}

$<HTMLInputElement>(".stone-file").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const img = await loadPhoto(f);
    // 自分の石の写真にしたら、よくある形の選択は外す（長辺と深さは今の欄の値で読み、あとでノギスの値に直せる）
    document.querySelectorAll<HTMLButtonElement>(".presets button").forEach((b) => b.setAttribute("aria-pressed", "false"));
    $(".make-status").textContent = "石の写真を読んでいます。長辺と深さは、いま欄にある値で仮に読みます。ノギスの値に直すと、組み直します。";
    await loadStone(img, f.name, Number($<HTMLInputElement>(".in-long").value) || 8, Number($<HTMLInputElement>(".in-depth").value) || 4, { intro: true });
    $(".make-status").textContent = "石を読みました。長辺と深さをノギスの値にしてから「生む」を押してください。";
  } catch (err) {
    $(".make-status").textContent = `石が読めませんでした：${(err as Error).message}`;
  }
});
for (const sel of [".in-long", ".in-depth"]) {
  $<HTMLInputElement>(sel).addEventListener("change", () => {
    if (!stone) return;
    void loadStone(stone.photo, stone.label, Number($<HTMLInputElement>(".in-long").value) || stone.longMm, Number($<HTMLInputElement>(".in-depth").value) || stone.depthMm);
  });
}
$<HTMLInputElement>(".sketch-file").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.85);
  sketch = { dataUrl, base64: dataUrl.split(",")[1], media: "image/jpeg" };
  $(".sketch-thumb").innerHTML = `<img alt="" src="${dataUrl}">`;
  $(".sketch-sub").textContent = "「生む」で Claude が絵を読みます（合言葉が要ります）";
});

// ---- 組めたら：3D・数字・赤い所 ----
/** 最初の案の爪の太さを、留まりと太さの確かめが通るまで上げる（軽い作り方で数回だけ試す。画面には出さない） */
let tuning = false;
function tuneProngs() {
  if (!session) return;
  const solid = session.solid;
  tuning = true;
  session.solid = false;
  for (let i = 0; i < 4; i++) {
    const b = session.build("爪の太さを決める");
    if (!b.problems.some((p) => p.check === "hold" || p.check === "prong-thin")) break;
    const cur = b.ring.setting.prongs[0]?.diameterMm ?? b.ring.setting.standardProngMm;
    session.state.prongMm = Math.ceil(cur * 1.08 * 100) / 100;
  }
  session.solid = solid;
  tuning = false;
}

let sheetTimer = 0;
function onBuilt(b: Built, _why: string) {
  if (tuning || !stone || kind !== "solitaire") return;
  if (sheetOn) {
    clearTimeout(sheetTimer);
    sheetTimer = window.setTimeout(() => sheetOn && showSheet(), 400);
  }
  viewer.setRing(b.ring, { color: stone.extraction.color, colorless: stone.extraction.colorless }, b.problems);
  headBox = headBoxOf(b);
  setDims(ringDims(b));
  const r = b.ring;
  const s = session!.state;
  const st = r.setting;
  const rows: [string, string][] = [
    ["石", `${stone.shapeName} ・ ${stone.measured.longMm.toFixed(2)} × ${stone.measured.widthMm.toFixed(2)} × ${stone.depthMm.toFixed(2)} mm`],
    ["留め方", st.style === "bezel" ? `覆輪 ・ 壁 ${st.bezel?.wallMm.toFixed(2)} mm` : `爪 ${st.prongs.length}（V 字 ${st.prongs.filter((p) => p.isV).length}）・ ø ${st.prongs[0]?.diameterMm.toFixed(2)} mm`],
    ["号 ・ 腕", `${s.gou} 号 ・ ${r.shank.widthMm.toFixed(1)} × ${r.shank.thicknessMm.toFixed(1)} mm`],
    ["石と指のすき間", `${r.culetGapMm.toFixed(2)} mm`],
    ["地金", `${METAL_LABEL[s.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g`],
  ];
  $(".specs").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  const n = b.problems.length;
  const chip = $(".verdict-chip");
  chip.hidden = false;
  chip.className = `verdict-chip ${n ? "ng" : "ok"}`;
  chip.textContent = n ? `作れない所 ${grouped(b).length}` : "作れます";
  $(".word-name").textContent = `${stone.shapeName}の一粒石の指輪`;
  if (!$(".studio-refine").hidden) renderCheck();
  if (!$(".build-panel").hidden) renderBuild();
}

// ---- 場面 ----
/** 3D の上と下にかぶるボタンの高さを測って、指輪をその間に収める */
function fitInsets() {
  const vp = $(".vp").getBoundingClientRect();
  if (!vp.height) return;
  let top = 0;
  let bottom = 0;
  for (const sel of [".vp-tl", ".verdict-chip", ".tools"]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el || el.hidden || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= vp.left || r.left >= vp.right || r.bottom <= vp.top || r.top >= vp.bottom) continue;
    // 横に長いもの（スマホの道具の帯）だけを数える。左の縦の帯は数えない
    if (r.height > vp.height * 0.5) continue;
    if (r.top - vp.top < vp.height / 2) top = Math.max(top, r.bottom - vp.top + 6);
    else bottom = Math.max(bottom, vp.bottom - r.top + 6);
  }
  viewer.setInsets(Math.round(top), Math.round(bottom));
}
new ResizeObserver(() => fitInsets()).observe($(".vp"));
function setMode(m: Mode) {
  const w = MODES.find((x) => x.id === m)!;
  $(".vp-mode").textContent = w.word;
  $(".word-sub").textContent = w.sub;
  document.querySelectorAll<HTMLButtonElement>(".tabs [data-mode]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.mode === m)));
  $(".make-panel").hidden = m !== "make";
  $(".studio-refine").hidden = m !== "refine";
  $(".build-panel").hidden = m !== "hand";
  $(".works-panel").hidden = m !== "works";
  if (m === "works") renderWorks();
  $(".pro").setAttribute("data-mode", m);
  viewer.setAutoRotate(m === "make");
  viewer.setLift(0);
  requestAnimationFrame(fitInsets);
  // 調整する場面は、シェードで始める（人が表示を選んだ後は、その表示のまま）
  if ((m === "refine" || m === "hand") && !dispChosen) setDisp("shaded");
  if (m === "refine") renderCheck();
  if (m === "hand") renderBuild();
}
document.querySelectorAll<HTMLButtonElement>(".tabs [data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode as Mode)));
const VIEW_NAME = { angle: "斜め", top: "上", side: "横", front: "正面" } as const;
document.querySelectorAll<HTMLButtonElement>(".view-btn").forEach((b) =>
  b.addEventListener("click", () => {
    const v = b.dataset.view as keyof typeof VIEW_NAME;
    viewer.setAutoRotate(false);
    viewer.setView(v);
    $(".vp-view").textContent = VIEW_NAME[v];
    document.querySelectorAll<HTMLButtonElement>(".view-btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }),
);
viewer.setGrid(true);
$(".t-grid").addEventListener("click", (e) => {
  const b = e.currentTarget as HTMLButtonElement;
  const on = b.getAttribute("aria-pressed") !== "true";
  b.setAttribute("aria-pressed", String(on));
  viewer.setGrid(on);
});
$(".t-dims").addEventListener("click", (e) => {
  const b = e.currentTarget as HTMLButtonElement;
  showDims = !showDims;
  b.setAttribute("aria-pressed", String(showDims));
  setDims(dims);
});
$(".t-fit").addEventListener("click", () => viewer.fit());
document.querySelectorAll<HTMLButtonElement>(".disp button").forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.disp === "draw") showSheet();
    else {
      hideSheet();
      viewer.setDisplayMode(b.dataset.disp as DisplayMode);
    }
    document.querySelectorAll<HTMLButtonElement>(".disp button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    dispChosen = true;
  }),
);
// ---- 図面：3D の所に、そのまま図面（正面・側面・上面・寸法・表題欄）を出す ----
let sheetOn = false;
function drawingSheetHtml(): string {
  if (kind === "band") return bandDrawing(checkBand(band).map((p) => p.title));
  if (!session?.built) return "";
  return solitaireDrawing(session.built, grouped(session.built).map(({ p }) => SHORT[p.check] ?? p.where));
}
function showSheet() {
  sheetOn = true;
  let el = document.querySelector<HTMLElement>(".sheet-view");
  if (!el) {
    el = document.createElement("div");
    el.className = "sheet-view";
    $(".vp").appendChild(el);
  }
  el.hidden = false;
  $(".pro").classList.add("drawing-on");
  const body = drawingSheetHtml();
  el.innerHTML = `<iframe title="図面" srcdoc="${esc(`<!doctype html><meta charset="utf-8"><style>${DRAWING_CSS}
    html,body{margin:0;height:100%;background:#1c1c1e;overflow:hidden;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
    .wrap{position:absolute;left:50%;top:50%;transform-origin:center}
    .dw{background:#fff;color:#111;box-shadow:0 20px 60px rgba(0,0,0,.5)}</style>
    <div class="wrap">${body}</div>
    <script>const w=document.querySelector('.wrap');function fit(){const r=w.firstElementChild.getBoundingClientRect();const k=Math.min(innerWidth/(r.width/(w._k||1)),innerHeight/(r.height/(w._k||1)))*0.92;w._k=k;w.style.transform='translate(-50%,-50%) scale('+k+')'}addEventListener('resize',fit);requestAnimationFrame(fit);</script>`)}"></iframe>`;
}
function hideSheet() {
  sheetOn = false;
  const el = document.querySelector<HTMLElement>(".sheet-view");
  if (el) el.hidden = true;
  $(".pro").classList.remove("drawing-on");
}
// 1〜4 で場面を切り替える（字を書いている間は使わない）
document.addEventListener("keydown", (e) => {
  const el = e.target as HTMLElement;
  if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select")) return;
  const why = document.querySelector<HTMLElement>(".why");
  if (why && !why.hidden) {
    if (e.key === "Escape") why.querySelector<HTMLButtonElement>(".why-close")?.click();
    return;
  }
  if (document.querySelector("dialog[open]")) return;
  const m = MODES.find((x) => x.key === e.key);
  if (m) setMode(m.id);
});
$(".act-sheet").addEventListener("click", () => {
  setMode("hand");
  $<HTMLButtonElement>(".p-instr").click();
});
$(".act-stl").addEventListener("click", () => {
  setMode("hand");
  $<HTMLButtonElement>(".p-stl").click();
});

// ---- 生む。：Claude が組んで、確かめて、直す ----
const TOOL_WORD: Record<string, string> = { set_setting: "石座", set_shank: "腕", check: "確かめ", look: "見る" };
function logLine(e: LogEntry) {
  const ol = $(".worklog");
  ol.hidden = false;
  const li = document.createElement("li");
  logLineTo(li, e);
  ol.appendChild(li);
  ol.scrollTop = ol.scrollHeight;
}
function logLineTo(li: HTMLLIElement, e: LogEntry) {
  if (e.kind === "note") {
    li.className = "note";
    li.textContent = e.text.replace(/\*\*/g, "").split("\n")[0].slice(0, 120);
  } else {
    const input = e.input as Record<string, unknown>;
    const res = e.result as Record<string, unknown> | undefined;
    li.className = `tool ${e.tool}`;
    let text = "";
    if (e.tool === "check") {
      const probs = (res?.problems as unknown[] | undefined)?.length ?? 0;
      text = probs ? `確かめ：作れない所 ${probs}` : "確かめ：すべて決まりの内側";
      li.classList.add(probs ? "ng" : "ok");
    } else if (e.tool === "look") text = `見る：${{ top: "上から", side: "横から", front: "正面から", angle: "斜めから" }[String(input.view)] ?? ""}`;
    else {
      const parts = Object.entries(input)
        .filter(([k]) => k !== "reason")
        .map(([k, v]) => `${{ style: "留め方", prong_count: "爪", prong_mm: "爪の太さ", height: "高さ", orientation: "向き", prong_positions: "爪の位置", width_mm: "幅", thickness_mm: "厚み", gou: "号", metal: "地金" }[k] ?? k} ${Array.isArray(v) ? v.join("・") : v}`);
      text = `${TOOL_WORD[e.tool] ?? e.tool}：${parts.join("、")}${input.reason ? ` ― ${String(input.reason)}` : ""}`;
    }
    li.textContent = text;
  }
}

function stoneText(): string {
  if (!stone) return "";
  const m = stone.measured;
  const corners = stone.cornerIdx.length ? stone.cornerIdx.map((c) => `輪郭の点 ${c.index} 番（内角 ${c.angle}°）`).join("、") : "なし";
  return `石：${stone.shapeName}。長辺 ${m.longMm.toFixed(2)} mm、幅 ${m.widthMm.toFixed(2)} mm（${m.widthFromPhoto ? "写真から" : "測った値"}）、深さ ${stone.depthMm.toFixed(2)} mm。輪郭の点は ${m.outlineMm.length} 個（0 番から反時計回り）。尖った角：${corners}。色：${stone.extraction.colorless ? "無色" : "色のある石"}。`;
}

let making = false;
$(".command").addEventListener("submit", (e) => {
  e.preventDefault();
  void make();
});
async function make() {
  if (kind === "band") return makeBand();
  if (!session || !stone || making) return;
  const wish = $<HTMLInputElement>(".wish").value.trim();
  const st = $(".make-status");
  const pass = store.password() || (await askPassword(true));
  if (!pass) {
    st.textContent = "生むには Claude が要ります。合言葉がないので、希望の言葉は使えません。形は今の案（決まりごとから作った案）のままです。「確かめる」の「手で変える」で変えられます。";
    return;
  }
  making = true;
  $(".worklog").innerHTML = "";
  st.innerHTML = `<span class="pulse"></span> Claude が組んで、作れるか確かめています…`;
  const content: ClaudeContentBlockParam[] = [{ type: "text", text: `${stoneText()}\n${wish ? `希望：${wish}` : "希望：特になし（ふつうの普段使いの一粒石の指輪）"}` }];
  if (sketch) {
    content.push({ type: "text", text: "デザイナーの絵：この雰囲気に近づけてください。絵から分かることと分からないことを分けて書いてください。" });
    content.push({ type: "image", source: { type: "base64", media_type: sketch.media, data: sketch.base64 } });
  }
  content.push({
    type: "text",
    text:
      "この石で指輪を組み、check で確かめ、作れない所があれば直してください。\n" +
      "この道具で変えられるのは、石座（留め方・爪の本数と太さと位置・高さ・向き）と腕（幅・厚み・号・地金）だけです。" +
      "希望や絵のうち、これで表せないこと（透かし・彫り・飾りの模様・ゴシック調などの装飾、石の数を増やす など）は、できたふりをせず、最後に「まだできないこと：」の行に正直に書いてください。すべて表せたときは「まだできないこと：なし」と書いてください。\n" +
      "最後に、やったこと・確かめたこと・残っていること・まだできないことを、それぞれ短く 1 行ずつ書いてください。",
  });
  const r = await runClaude({
    host: session,
    messages: [{ role: "user", content }],
    system: designPrompt(store.ledger()),
    tools: TOOLS.filter((t) => ["set_setting", "set_shank", "check", "look"].includes(t.name)),
    password: pass,
    speed: "fast",
    maxTurns: 8,
    onLog: logLine,
  });
  making = false;
  undoClaude = r.undo;
  if (r.offline || (r.error && !r.log.length)) {
    if (r.error?.code === "wrong_password") resetPassword();
    st.textContent = `Claude につながりませんでした${r.error?.message ? `（${r.error.message}）` : ""}。決まりごとから作った案を出しています。`;
    return;
  }
  reason = r.finalText.replace(/\*\*/g, "");
  // 表せなかった希望を、目立つ所に出す（できたふりをさせない）
  const cannot = /まだできないこと[：:]\s*(.+)/.exec(reason)?.[1]?.trim() ?? "";
  showCannot(cannot && !/^(なし|ありません|特になし)/.test(cannot) ? cannot : "");
  st.innerHTML = `${r.remaining !== undefined ? `今日あと ${r.remaining} 回 ・ ` : ""}<button type="button" class="link go-refine">確かめる →</button><button type="button" class="link undo-claude">元に戻す</button>`;
  st.querySelector(".go-refine")!.addEventListener("click", () => setMode("refine"));
  st.querySelector(".undo-claude")!.addEventListener("click", () => {
    undoClaude?.();
    st.textContent = "Claude の作業を戻しました。";
  });
}

function showCannot(text: string) {
  let el = document.querySelector<HTMLElement>(".cannot-chip");
  if (!el) {
    el = document.createElement("p");
    el.className = "cannot-chip";
    $(".pro").appendChild(el);
  }
  el.hidden = !text;
  el.textContent = text ? `まだできないこと：${text}` : "";
}

// ---- 確かめる。：作れるか。直す所は短く ----
const SHORT: Record<string, string> = {
  "prong-thin": "爪が細い",
  "finger-gap": "石が指に近い",
  "tip-height": "爪の先の高さ",
  hold: "石の留まりが弱い",
  "prong-gap": "爪と爪の間が広い",
  corner: "角が守られていない",
  "bezel-wall": "覆輪の壁が薄い",
};
function grouped(b: Built) {
  const groups = new Map<string, { p: (typeof b.problems)[number]; n: number }>();
  for (const p of b.problems) {
    const g = groups.get(p.check);
    if (g) g.n++;
    else groups.set(p.check, { p, n: 1 });
  }
  return [...groups.values()];
}
// ---- 職人の決まりを外して比べる：公開情報だけで組んだ形と、職人の決まりで組んだ形 ----
/** 比べている間：職人の決まりで組んだときの数字（戻すときの爪の太さも） */
let compare: { prongMm?: number; nums: CompareNums } | null = null;
interface CompareNums {
  prong: string;
  height: string;
  gap: string;
  weight: string;
  probs: number;
}
/** いま組むのに使う帳面（比べている間は、公開情報の目安だけ） */
function ledgerNow() {
  return compare ? seedLedger() : store.ledger();
}
function numsOf(b: Built): CompareNums {
  const r = b.ring;
  const mm = r.setting.prongs[0]?.diameterMm;
  return {
    prong: r.setting.style === "prong" && mm ? `${mm.toFixed(2)} mm × ${r.setting.prongs.length}` : "覆輪",
    height: `${r.setting.heights.heightAboveFingerMm.toFixed(2)} mm`,
    gap: `${r.culetGapMm.toFixed(2)} mm`,
    weight: `約 ${r.metalWeightG.toFixed(1)} g`,
    probs: grouped(b).length,
  };
}
function setCompare(on: boolean) {
  if (!session?.built || kind !== "solitaire") return;
  if (on && !compare) {
    compare = { prongMm: session.state.prongMm, nums: numsOf(session.built) };
    // 公開情報だけなら、どう組むか（爪の太さはその目安の標準から。留まりが足りなければ、これまでどおり太くする）
    session.state.prongMm = undefined;
    tuneProngs();
    session.build("職人の決まりを外した（公開情報の目安だけ）");
  } else if (!on && compare) {
    session.state.prongMm = compare.prongMm;
    compare = null;
    session.build("職人の決まりに戻した");
  }
  renderCheck();
}
// ---- 工房ごとの帳面：使う帳面を切り替える・工房を足す・同じ指輪を工房ごとに比べる ----
function workshopBarHtml(): string {
  if (kind !== "solitaire") return "";
  const ws = store.workshops();
  const mainName = bookLabel(store.mainLedger());
  const opts = [`<option value="${MAIN}"${ws.active === MAIN ? " selected" : ""}>${esc(mainName)}の帳面</option>`, ...ws.list.map((w) => `<option value="${esc(w.id)}"${ws.active === w.id ? " selected" : ""}>${esc(w.name)}の帳面</option>`)];
  return `<section class="ws-bar"><label><span>使う帳面</span><select class="ws-pick">${opts.join("")}<option value="__new">＋ 工房の帳面を作る</option></select></label>
    <div class="ws-new" hidden><input class="ws-name" type="text" placeholder="工房の名前（例：工房 B）"><button type="button" class="primary ws-make">作る</button></div>
    ${ws.list.length ? `<button type="button" class="ghost-d ws-cmp">同じ指輪を、帳面ごとに比べる</button>` : `<p class="hint">工房ごとに決まりはちがいます。工房の帳面を作ると、同じ指輪をそれぞれの決まりで確かめられます。</p>`}
    <div class="ws-table"></div></section>`;
}
function switchLedger(id: string) {
  store.setWorkshops(setActive(store.workshops(), id));
  if (!session) return;
  session.state.prongMm = undefined;
  tuneProngs();
  session.build("帳面を切り替えた");
  lastRule = null;
  pastCheck = null;
  renderCheck();
  const ws = store.workshops();
  const label = ws.active === MAIN ? `${bookLabel(store.mainLedger())}の帳面` : `${ws.list.find((w) => w.id === ws.active)?.name ?? "工房"}の帳面`;
  toast(`${label}で確かめ直しました`);
}
function workshopTable(): string {
  if (!session?.built) return "";
  const state = { ...session.snapshot(), prongMm: undefined };
  const rows: [string, Ledger][] = [["公開情報だけ", seedLedger()], [bookLabel(store.mainLedger()), store.mainLedger()], ...store.workshops().list.map((w) => [w.name, w.ledger] as [string, Ledger])];
  return `<table><thead><tr><th>帳面</th><th>爪の太さ</th><th>作れない所</th></tr></thead><tbody>${rows
    .map(([name, led]) => {
      const r = side(session!.stone, state, led, session!.solid);
      return `<tr><th>${esc(name)}</th><td>${r.prongMm.toFixed(2)} mm × ${session!.built!.ring.setting.prongs.length}</td><td>${r.problems}</td></tr>`;
    })
    .join("")}</tbody></table><p class="hint">同じ石・同じ形を、帳面だけ替えて組んだ結果です（爪はそれぞれの帳面の標準から）。</p>`;
}
function bindWorkshops(box: HTMLElement) {
  const pick = box.querySelector<HTMLSelectElement>(".ws-pick");
  if (!pick) return;
  pick.addEventListener("change", () => {
    if (pick.value === "__new") {
      box.querySelector<HTMLElement>(".ws-new")!.hidden = false;
      box.querySelector<HTMLInputElement>(".ws-name")!.focus();
      return;
    }
    switchLedger(pick.value);
  });
  box.querySelector(".ws-make")?.addEventListener("click", () => {
    const name = box.querySelector<HTMLInputElement>(".ws-name")!.value.trim() || "新しい工房";
    store.setWorkshops(addWorkshop(store.workshops(), name, seedLedger()));
    switchLedger(store.workshops().active);
  });
  box.querySelector(".ws-cmp")?.addEventListener("click", () => {
    box.querySelector(".ws-table")!.innerHTML = workshopTable();
  });
}
function compareHtml(): string {
  if (kind !== "solitaire") return "";
  const has = activeRules(store.ledger()).some((r) => r.source.kind === "craftsman" && r.param);
  if (!has) return "";
  if (!compare) return `<button type="button" class="ghost-d compare-btn">職人の決まりを外して比べる</button><button type="button" class="ghost-d sweep-btn">職人の決まりを、よくある 270 の設計に当てる</button>`;
  const pub = session?.built ? numsOf(session.built) : null;
  const c = compare.nums;
  const row = (k: string, a: string, b: string) => `<tr${a !== b ? ` class="diff"` : ""}><th>${k}</th><td>${esc(b)}</td><td>${esc(a)}</td></tr>`;
  return `<section class="compare"><p class="cmp-k">いまは、公開情報の目安だけで組んでいます（職人の決まりを外しています）</p>
    ${pub ? `<table><thead><tr><th></th><th>公開情報だけ</th><th>${esc(bookLabel(store.ledger()))}の決まり</th></tr></thead><tbody>${row("爪", c.prong, pub.prong)}${row("指から上", c.height, pub.height)}${row("石と指のすき間", c.gap, pub.gap)}${row("地金の重さ", c.weight, pub.weight)}${row("作れない所", String(c.probs), String(pub.probs))}</tbody></table>` : ""}
    <button type="button" class="primary compare-back">${esc(bookLabel(store.ledger()))}の決まりに戻す</button></section>`;
}
// ---- 一言が、どこまで効くか：よくある 270 の設計に、職人の決まりを当てる ----
const SW = { w: 720, h: 260, l: 44, r: 16, t: 14, b: 34, x0: 1.5, x1: 14, y0: 0.3, y1: 2.0 };
const swX = (mm: number) => SW.l + ((mm - SW.x0) / (SW.x1 - SW.x0)) * (SW.w - SW.l - SW.r);
const swY = (mm: number) => SW.h - SW.b - ((mm - SW.y0) / (SW.y1 - SW.y0)) * (SW.h - SW.t - SW.b);
function sweepDot(r: SweepResult): string {
  const size = (r.design.stone.longMm + r.design.stone.widthMm) / 2;
  return `<circle cx="${swX(size).toFixed(1)}" cy="${swY(r.after.prongMm).toFixed(1)}" r="2.2"/>`;
}
/** 石の大きさと爪の最低の太さ：公開情報の線と、職人の決まりの線。職人が言った点に、その言葉を添える */
function sweepChartHtml(): string {
  const rule = activeRules(store.ledger()).find((r) => r.param === "prong.minDiameterMm" && r.source.kind === "craftsman");
  const xs = Array.from({ length: 51 }, (_, i) => SW.x0 + ((SW.x1 - SW.x0) * i) / 50);
  const line = (f: (x: number) => number) => xs.map((x, i) => `${i ? "L" : "M"}${swX(x).toFixed(1)} ${swY(Math.min(SW.y1, f(x))).toFixed(1)}`).join("");
  const pub = line((x) => minProngMm(x));
  const craft = rule ? line((x) => valueFor(rule, x) ?? 0) : "";
  const pts = rule?.bySizeLine ? (rule.bySize ?? []).filter((s) => s.upToMm !== null) : [];
  const ticksX = [2, 4, 6, 8, 10, 12, 14].map((v) => `<line class="g" x1="${swX(v)}" x2="${swX(v)}" y1="${SW.t}" y2="${SW.h - SW.b}"/><text class="ax" x="${swX(v)}" y="${SW.h - SW.b + 14}" text-anchor="middle">${v}</text>`).join("");
  const ticksY = [0.5, 1.0, 1.5, 2.0].map((v) => `<line class="g" x1="${SW.l}" x2="${SW.w - SW.r}" y1="${swY(v)}" y2="${swY(v)}"/><text class="ax" x="${SW.l - 6}" y="${swY(v) + 3.5}" text-anchor="end">${v.toFixed(1)}</text>`).join("");
  const lab = (x: number, y: number, t: string, cls: string) => `<text class="${cls}" x="${swX(x).toFixed(1)}" y="${swY(y).toFixed(1)}">${esc(t)}</text>`;
  return `<figure class="sw-chart"><svg viewBox="0 0 ${SW.w} ${SW.h}" role="img" aria-label="石の大きさと爪の最低の太さ">
    ${ticksX}${ticksY}
    <text class="ax" x="${SW.w - SW.r}" y="${SW.h - 4}" text-anchor="end">石の大きさ（mm）</text><text class="ax" x="${SW.l}" y="${SW.t - 3}">爪の太さ（mm）</text>
    <path class="pub" d="${pub}"/>${lab(11.2, Math.min(SW.y1, minProngMm(11.2)) + 0.08, "公開情報の最低", "lp")}
    ${craft ? `<path class="craft" d="${craft}"/>${lab(11.2, (valueFor(rule!, 11.2) ?? 0) - 0.12, `${bookLabel(store.ledger())}の最低`, "lc")}` : ""}
    <g class="sw-dots"></g>
    ${pts.map((p) => `<circle class="said" cx="${swX(p.upToMm!)}" cy="${swY(p.value)}" r="5"/><text class="ls" x="${swX(p.upToMm!) + 8}" y="${swY(p.value) - 8}">「${p.upToMm! < 4 ? "メレだと" : "このサイズなら"} ${p.value} mm」</text>`).join("")}
  </svg><figcaption>職人が言った 2 つの点（●）から、どの大きさの石にも効く線ができます。小さな点は、270 の設計の爪（この線から組んだ太さ）。言葉が増えるほど、線は細かくなります。</figcaption></figure>`;
}
function openSweep() {
  let el = document.querySelector<HTMLElement>(".sweep");
  if (!el) {
    el = document.createElement("div");
    el.className = "sweep";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "よくある設計に当てる");
    document.body.appendChild(el);
  }
  const ds = sweepDesigns();
  const name = bookLabel(store.ledger());
  const poly = (d: SweepDesign) => {
    const k = 15 / Math.max(d.preset.longMm, d.preset.widthMm);
    return d.stone.outlineMm.map((p) => `${(20 + (p.x / d.scale) * k).toFixed(1)},${(20 - (p.y / d.scale) * k).toFixed(1)}`).join(" ");
  };
  el.innerHTML = `<div class="sw-in"><button type="button" class="sw-close" aria-label="閉じる">×</button>
    <p class="sw-k">${esc(name)}の決まりを、よくある設計に当てる</p>
    <h2>石の形 6 × 大きさ 5 × 高さ 3 × 号 3 ＝ ${ds.length} の設計</h2>
    <p class="sw-sub">それぞれを、公開情報の目安だけで組んだときと、${esc(name)}の決まりで組んだときで比べます（どちらも同じ計算。爪の太さは帳面の標準から）。</p>
    <div class="sw-stats"><div><b class="sw-n">0</b><small>確かめた設計</small></div><div><b class="sw-c">0</b><small>爪が細くなった ・ 太くなった</small></div><div><b class="sw-p">—</b><small>爪の太さの平均</small></div><div><b class="sw-w">—</b><small>地金の重さの合計</small></div></div>
    ${sweepChartHtml()}
    <div class="sw-grid">${ds.map((d, i) => `<i class="t" data-i="${i}" title="${esc(d.preset.name)} ${d.stone.longMm.toFixed(1)} mm ・ ${({ low: "低め", standard: "標準", high: "高め" } as const)[d.height]} ・ ${d.gou} 号"><svg viewBox="0 0 40 40"><polygon points="${poly(d)}"/></svg><span></span></i>`).join("")}</div>
    <p class="sw-note">数字は目安の比べ。最後は職人が決めます。</p></div>`;
  el.hidden = false;
  el.scrollTop = 0;
  let stop = false;
  const close = () => {
    stop = true;
    el!.hidden = true;
  };
  el.querySelector(".sw-close")!.addEventListener("click", close);
  const pub = seedLedger();
  const craft = store.ledger();
  const results: SweepResult[] = [];
  let i = 0;
  const step = () => {
    if (stop) return;
    const t0 = performance.now();
    while (i < ds.length && performance.now() - t0 < 40) {
      const r = sweepOne(ds[i], pub, craft);
      results.push(r);
      const t = el!.querySelector<HTMLElement>(`.t[data-i="${i}"]`)!;
      const d = r.after.prongMm - r.before.prongMm;
      t.classList.add(Math.abs(d) > 0.01 ? (d < 0 ? "thin" : "thick") : "same");
      t.querySelector("span")!.textContent = r.after.prongMm.toFixed(2);
      const dots = el!.querySelector(".sw-dots");
      if (dots) dots.insertAdjacentHTML("beforeend", sweepDot(r));
      t.title += `\n爪 ${r.before.prongMm.toFixed(2)} → ${r.after.prongMm.toFixed(2)} mm ・ ${r.before.weightG.toFixed(1)} → ${r.after.weightG.toFixed(1)} g`;
      i++;
    }
    const s = summarize(results);
    el!.querySelector(".sw-n")!.textContent = String(s.total);
    el!.querySelector(".sw-c")!.textContent = `${s.thinner} ・ ${s.thicker}`;
    el!.querySelector(".sw-p")!.textContent = `${s.prongBefore.toFixed(2)} → ${s.prongAfter.toFixed(2)} mm`;
    el!.querySelector(".sw-w")!.textContent = `${s.weightDiffG > 0 ? "+" : "−"}${Math.abs(s.weightDiffG).toFixed(1)} g`;
    if (i < ds.length) setTimeout(step, 0);
    else {
      el!.querySelector(".sw-in")!.classList.add("done");
      const thick = results.filter((r) => r.after.prongMm > r.before.prongMm + 0.01);
      if (thick.length) {
        const max = Math.max(...thick.map((r) => (r.design.stone.longMm + r.design.stone.widthMm) / 2));
        el!.querySelector(".sw-note")!.textContent = `太くなった ${thick.length} の設計は、石の大きさ ${max.toFixed(1)} mm 以下の小さめの石。決まりが「この大きさの石なら 0.7 mm」を小さめの石にも当てているため。小さめの石の太さは、職人に聞いて決まりに足します。数字は目安の比べ。最後は職人が決めます。`;
      }
    }
  };
  setTimeout(step, 400);
}
function renderCheck() {
  if (kind === "band") return renderBandCheck();
  if (!session?.built) return;
  const b = session.built;
  const s = session.state;
  const probs = grouped(b);
  const box = $(".studio-refine");
  const pick = <T extends string | number>(name: string, cur: T, list: [T, string][]) =>
    `<div class="pick"><span>${name}</span><div>${list.map(([v, l]) => `<button type="button" data-k="${name}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join("")}</div></div>`;
  const fresh = lastRule ? new Set<string>(lastRule.checks) : new Set<string>();
  box.innerHTML = `
    ${lastRule ? `<section class="rule-flash"><small>${esc(lastRule.by)}の決まりで、確かめ直しました</small><b>${lastRule.spoken ? `「${esc(lastRule.quote)}」` : esc(lastRule.quote)}</b><span>作れない所 <em>${lastRule.before}</em> → <em class="${lastRule.after ? "ng" : "ok"}">${lastRule.after}</em>${lastRule.after && probs.length < lastRule.after ? ` → 直して <em class="${probs.length ? "ng" : "ok"}">${probs.length}</em>` : ""}</span></section>` : ""}
    <section class="big-verdict ${probs.length ? "ng" : "ok"}"><b>${probs.length ? "このままでは作れません" : "このまま作れます"}</b><small>${probs.length ? `直す所 ${probs.length}` : `爪・留まり・すき間・角、すべて目安の内側`}</small></section>
    ${workshopBarHtml()}
    ${compareHtml()}
    ${
      probs.length
        ? `<ul class="probs">${probs
            .map(
              ({ p, n }, i) => `<li class="${fresh.has(p.check) ? "fresh" : ""}"><div class="p-head"><b>${esc(SHORT[p.check] ?? p.where)}</b>${n > 1 ? `<small>${n} か所</small>` : ""}${fresh.has(p.check) ? `<i class="new-tag">新しい決まり</i>` : ""}</div>
              <p class="p-num">${esc(p.current)} <span>→</span> ${esc(p.required)}</p>
              <div class="p-act"><button type="button" class="fix-go" data-p="${i}">${esc(p.options[0]?.label ?? "直す")}</button><details><summary>なぜ</summary><p>${esc(p.reason)}</p></details></div></li>`,
            )
            .join("")}</ul>`
        : ""
    }
    <details class="manual" ${probs.length ? "" : "open"}><summary>手で変える</summary>
      ${pick("留め方", s.style, [["prong", "爪"], ["bezel", "覆輪"]])}
      ${s.style === "prong" ? pick("爪", s.prongCount ?? 0, [[0, "自動"], [3, "3"], [4, "4"], [5, "5"], [6, "6"]]) : ""}
      ${pick("高さ", s.height, [["low", "低め"], ["standard", "標準"], ["high", "高め"]])}
      ${pick("向き", s.orientation, [["along", "縦"], ["across", "横"]])}
      ${pick("地金", s.metal, (["k18yg", "pt900", "k18wg", "k18pg", "sv925"] as Metal[]).map((m) => [m, METAL_LABEL[m]] as [Metal, string]))}
      <div class="sliders">
        ${s.style === "prong" ? `<label><span>爪の太さ</span><input type="range" class="r-prong" min="0.4" max="1.6" step="0.05" value="${b.ring.setting.prongs[0]?.diameterMm.toFixed(2) ?? 0.8}"><output>${b.ring.setting.prongs[0]?.diameterMm.toFixed(2)} mm</output></label>` : ""}
        <label><span>号</span><input type="range" class="r-gou" min="5" max="25" step="1" value="${s.gou}"><output>${s.gou} 号</output></label>
      </div>
    </details>
    ${pastCheckHtml()}
    ${probs.length ? `<button type="button" class="next-btn claude-fix">Claude に直してもらう</button>` : ""}
    ${fixLog.length ? `<ol class="worklog fix-log">${fixLog.map((l) => `<li class="${l.cls}">${esc(l.text)}</li>`).join("")}</ol>` : ""}
    ${rulesSectionHtml()}
    <button type="button" class="next-btn to-build">作り方を見る →</button>`;
  bindRules(box);
  bindWorkshops(box);
  box.querySelector(".compare-btn")?.addEventListener("click", () => setCompare(true));
  box.querySelector(".sweep-btn")?.addEventListener("click", () => openSweep());
  box.querySelector(".compare-back")?.addEventListener("click", () => setCompare(false));
  box.querySelector(".past-fix")?.addEventListener("click", () => fixPastWorks());
  box.querySelector(".claude-fix")?.addEventListener("click", () => void fixWithClaude());
  box.querySelectorAll<HTMLButtonElement>(".fix-go").forEach((btn) =>
    btn.addEventListener("click", () => {
      const { p } = probs[Number(btn.dataset.p)];
      if (p.options[0]) applyFix(p.options[0].id);
    }),
  );
  box.querySelectorAll<HTMLButtonElement>(".pick button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const k = btn.dataset.k!;
      const v = btn.dataset.v!;
      if (k === "留め方") session!.setSetting({ style: v as "prong" | "bezel", reason: "手で" });
      if (k === "爪") {
        if (Number(v)) session!.setSetting({ prong_count: Number(v), reason: "手で" });
        else {
          session!.state.prongCount = undefined;
          session!.build("自動");
        }
      }
      if (k === "高さ") session!.setSetting({ height: v as "low", reason: "手で" });
      if (k === "向き") session!.setSetting({ orientation: v as "along", reason: "手で" });
      if (k === "地金") session!.setShank({ metal: v as Metal, reason: "手で" });
    }),
  );
  box.querySelector<HTMLInputElement>(".r-prong")?.addEventListener("change", (e) => session!.setSetting({ prong_mm: Number((e.target as HTMLInputElement).value), reason: "手で" }));
  box.querySelector<HTMLInputElement>(".r-gou")?.addEventListener("change", (e) => session!.setShank({ gou: Number((e.target as HTMLInputElement).value), reason: "手で" }));
  box.querySelector(".to-build")!.addEventListener("click", () => setMode("hand"));
}
function applyFix(id: string, sess: RingSession = session!) {
  const session = sess;
  const s = session!.state;
  const std = session!.built!.ring.setting.standardProngMm;
  switch (id) {
    case "raise": {
      // 決まりのすき間まで上げる（高めでも足りないときは、すき間を直接その値に）
      const fg = session!.built!.problems.find((p) => p.check === "finger-gap");
      if (s.height !== "high" && !fg) session!.setSetting({ height: s.height === "low" ? "standard" : "high", reason: "直し方から" });
      else if (fg) {
        s.culetGapMm = Math.ceil((fg.requiredValue + 0.05) * 100) / 100;
        session!.build("直し方から");
      } else session!.build("直し方から");
      break;
    }
    case "lower":
      session!.setSetting({ height: s.height === "high" ? "standard" : "low", reason: "直し方から" });
      break;
    case "thicker": {
      // 必要な太さまで一度に上げる（何度も押さなくてよいように）
      const need = Math.max(...session!.built!.problems.filter((p) => p.check === "prong-thin").map((p) => p.requiredValue), std);
      session!.setSetting({ prong_mm: Math.ceil(Math.max(need, (s.prongMm ?? std) * 1.15) * 100) / 100, reason: "直し方から" });
      break;
    }
    case "moreProngs":
    case "addProng":
      session!.setSetting({ prong_count: Math.min(8, session!.built!.ring.setting.prongs.length + 1), reason: "直し方から" });
      break;
    case "bezel":
      session!.setSetting({ style: "bezel", reason: "直し方から" });
      break;
    default:
      session!.build("直し方から");
  }
}

// ---- 道具の札：何に使うか・使い方（動く絵）・気をつける所・出典 ----
function openTool(id: string) {
  const t = toolById(id);
  if (!t) return;
  let el = document.querySelector<HTMLElement>(".tool-sheet");
  if (!el) {
    el = document.createElement("div");
    el.className = "tool-sheet";
    $(".pro").appendChild(el);
    el.addEventListener("click", (e) => {
      if (e.target === el || (e.target as HTMLElement).closest(".ts-close")) el!.hidden = true;
    });
  }
  el.hidden = false;
  el.innerHTML = `<div class="ts-card" role="dialog" aria-label="${esc(t.name)}">
    <button type="button" class="ts-close" aria-label="閉じる">×</button>
    <p class="ts-kind">${esc(KIND_LABEL[t.kind])}</p>
    <h3>${esc(t.name)}<small>${esc(t.reading)}</small></h3>
    <p class="ts-what">${esc(t.what)}</p>
    <h4>使い方</h4><ol>${t.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>
    ${t.watch ? `<p class="ts-watch">${esc(t.watch)}</p>` : ""}
  </div>`;

}

// ---- 作る。：鋳造と鍛造の工程（この石・この形から計算した数字つき） ----
/** 画面の地金 → 温度の表の地金（表のない地金は null） */
function alloyOf(m: Metal): AlloyId | null {
  return m === "k18yg" ? "k18y" : m === "pt900" ? "pt900" : m === "sv925" ? "sv925" : null;
}
// 説明のある言葉（1 文字の言葉は、ほかの言葉の中に入りやすいので印を付けない）
const LINKED = TERMS.filter((t) => t.word.length > 1).sort((a, b) => b.word.length - a.word.length);
const TERM_RE = new RegExp(LINKED.map((t) => t.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
/** 文の中の言葉に印を付ける（同じ言葉は 1 回だけ）。text は esc 済み */
function withTerms(text: string, seen: Set<string>): string {
  return text.replace(TERM_RE, (w) => {
    if (seen.has(w)) return w;
    seen.add(w);
    return `<button type="button" class="term" data-term="${w}">${w}</button>`;
  });
}
/** 「詳しく」の中身。同じ見出し（「焼成：」など）が続くときは、見出しを 1 回だけ出す */
function detailsHtml(list: NonNullable<Step["details"]>, seen: Set<string>): string {
  let last = "";
  return list
    .map((d) => {
      const m = /^([^：]{1,10})：(.*)$/.exec(d.text);
      // 「詳しく」の中は、1 行ごとに言葉の印を付ける（上の文で出た言葉も、ここで押せる）
      void seen;
      if (!m) return `<li>${withTerms(esc(d.text), new Set())}</li>`;
      // 見出しは、その見出しの最初の行の頭に太字で（「湯道：いちばん厚い所に…」）。続く行は見出しなし
      const lead = m[1] === last ? "" : `<b class="lab">${withTerms(esc(m[1]), new Set())}</b>：`;
      const first = m[1] !== last;
      last = m[1];
      return `<li class="${first ? "first" : "cont"}">${lead}${withTerms(esc(m[2]), new Set())}</li>`;
    })
    .join("");
}
/** 前の記録から：この工程で、前に職人が話したコツ */
function pastTipsHtml(title: string): string {
  const past = tipsFor(loadWorks(), title);
  if (!past.length) return "";
  return `<div class="past"><small>前の記録から</small>${past.map((t) => `<p><i class="k-${t.kind}">${esc(t.kind)}</i>${esc(t.text)}<span>${esc(t.maker || "職人")} ・ ${esc(t.date)}</span></p>`).join("")}</div>`;
}
function stepsHtml(steps: Step[]): string {
  return `<ol class="steps-b">${steps
    .map((st, i) => {
      const seen = new Set<string>();
      const tools = toolsForStep(st.title);
      return `<li><span class="n">${String(i + 1).padStart(2, "0")}</span><div><b>${esc(st.title)}</b><p>${withTerms(esc(st.text), seen)}</p>${
        st.specs.length ? `<dl>${st.specs.map((x) => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join("")}</dl>` : ""
      }${st.watch ? `<p class="watch">${esc(st.watch)}</p>` : ""}${
        st.details?.length ? `<details class="more"><summary>詳しく</summary><ul>${detailsHtml(st.details, seen)}</ul></details>` : ""
      }${makingRulesHtml(st.id)}${pastTipsHtml(st.title)}${tools.length ? `<div class="tools-row">${tools.map((t) => `<button type="button" class="tool-chip" data-tool="${t.id}">${esc(t.name)}</button>`).join("")}</div>` : ""}</div></li>`;
    })
    .join("")}</ol>`;
}
/** 言葉を押すと、その文のすぐ下に意味を出す（もう一度押すと消す） */
function bindTerms(box: HTMLElement) {
  box.querySelectorAll<HTMLButtonElement>(".term").forEach((b) =>
    b.addEventListener("click", () => {
      const word = b.dataset.term!;
      const host = b.closest<HTMLElement>("p, li")!;
      const open = host.parentElement!.querySelector<HTMLElement>(`:scope > .term-def[data-term="${word}"]`);
      b.setAttribute("aria-expanded", String(!open));
      if (open) return open.remove();
      const t = TERMS.find((x) => x.word === word)!;
      const el = document.createElement("div");
      el.className = "term-def";
      el.dataset.term = word;
      el.innerHTML = `<b>${esc(t.word)}</b>${t.reading ? `<small>${esc(t.reading)}</small>` : ""}<span>${esc(t.meaning)}</span>`;
      host.after(el);
    }),
  );
}
let method: Method = "hand";
/** 作り方や記録に使う石の数字（今の石、または見本の石） */
interface StoneInfo {
  shapeName: string;
  outlineMm: readonly { x: number; y: number }[];
  longMm: number;
  widthMm: number;
  depthMm: number;
}
const currentStone = (): StoneInfo => ({ shapeName: stone!.shapeName, outlineMm: stone!.measured.outlineMm, longMm: stone!.measured.longMm, widthMm: stone!.measured.widthMm, depthMm: stone!.depthMm });
function howInput(b: Built, sess: RingSession = session!, info: StoneInfo = currentStone()) {
  return { ring: b.ring, outlineMm: info.outlineMm, longMm: info.longMm, widthMm: info.widthMm, depthMm: info.depthMm, metalLabel: METAL_LABEL[sess.state.metal], alloy: alloyOf(sess.state.metal) };
}
function sheet(): string | undefined {
  if (!stone) return;
  const m = stone.measured;
  return patternSvg({ ...m, depthMm: stone.depthMm, shapeName: stone.shapeName, label: stone.label, date: new Date().toLocaleDateString("ja-JP") });
}
function openPrint(html: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}
function renderBuild() {
  if (kind === "band") return renderBandBuild();
  if (!session?.built || !stone) return;
  const b = session.built;
  const steps = howToMake(howInput(b), method);
  const box = $(".build-panel");
  const probs = grouped(b);
  box.innerHTML = `
    <div class="seg method"><button type="button" data-m="hand" aria-pressed="${method === "hand"}">鍛造</button><button type="button" data-m="cast" aria-pressed="${method === "cast"}">鋳造</button></div>
    ${probs.length ? `<p class="build-warn">このままでは作れない所が ${probs.length} あります。<button type="button" class="link to-check">確かめる →</button></p>` : ""}
    ${stepsHtml(steps)}
    <p class="note-b">寸法は、この石とこの形から計算した目安。${NOTE}</p>
    <div class="row out"><button type="button" class="primary p-instr">図面・指示書を印刷</button><button type="button" class="ghost-d p-stl">STL を書き出す</button></div>
    <div class="save-work"><button type="button" class="next-btn p-save">この作品の記録を残す</button></div>`;
  box.querySelector(".p-save")!.addEventListener("click", () => openSaveWork(box.querySelector(".save-work")!, solitaireData()));
  box.querySelectorAll<HTMLButtonElement>(".method button").forEach((btn) =>
    btn.addEventListener("click", () => {
      method = btn.dataset.m as Method;
      renderBuild();
    }),
  );
  box.querySelector(".to-check")?.addEventListener("click", () => setMode("refine"));
  box.querySelectorAll<HTMLButtonElement>(".tool-chip").forEach((c) => c.addEventListener("click", () => openTool(c.dataset.tool!)));
  bindTerms(box);
  box.querySelector(".p-instr")!.addEventListener("click", () => askPrint(true, (pick) => {
    const svg = sheet();
    if (!svg) return;
    const r = b.ring;
    const st = r.setting;
    openPrint(
      sheetHtml({
        title: `${stone!.shapeName}の一粒石の指輪`,
        date: today(),
        imageDataUrl: viewer.snapshot(),
        specs: [
          { label: "石", value: `${stone!.measured.longMm.toFixed(2)} × ${stone!.measured.widthMm.toFixed(2)} × ${stone!.depthMm.toFixed(2)} mm` },
          { label: "号", value: `${session!.state.gou} 号 ・ 内径 ${r.shank.innerDiameterMm.toFixed(1)} mm` },
          { label: "留め方", value: st.style === "bezel" ? `覆輪 ・ 壁 ${st.bezel?.wallMm.toFixed(2)} mm` : `爪 ${st.prongs.length} ・ ø ${st.prongs[0]?.diameterMm.toFixed(2)} mm` },
          { label: "腕", value: `${r.shank.widthMm.toFixed(1)} × ${r.shank.thicknessMm.toFixed(1)} mm` },
          { label: "石と指のすき間", value: `${r.culetGapMm.toFixed(2)} mm` },
          { label: "地金", value: `${METAL_LABEL[session!.state.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g` },
        ],
        problems: probs.map(({ p }) => `${SHORT[p.check] ?? p.where}（${p.current} → ${p.required}）`),
        methodLabel: method === "hand" ? "鍛造" : "鋳造",
        steps,
        patternSvg: pick.pattern ? svg : "",
        includeSteps: pick.steps,
        includeDetails: pick.details,
        drawingHtml: pick.drawing ? solitaireDrawing(b, probs.map(({ p }) => SHORT[p.check] ?? p.where)) : "",
      }),
    );
  }));
  box.querySelector(".p-stl")!.addEventListener("click", () => {
    const r = b.ring.ringPositions;
    const all = new Float32Array(r.setting.length + r.shank.length);
    all.set(r.setting, 0);
    all.set(r.shank, r.setting.length);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toStl(all)], { type: "model/stl" }));
    a.download = `継ぐ_${stone!.shapeName}_${session!.state.gou}号.stl`;
    a.click();
  });
}

async function addRuleFromWords(said: string) {
  if (!said) return;
  const name = masterName(store.ledger());
  const slot = $(".ar-proposal");
  const pass = store.password() || (await askPassword(true));
  if (!pass) {
    slot.innerHTML = `<p class="tech-what">決まりの案を作るには Claude が要ります。</p>`;
    return;
  }
  slot.innerHTML = `<p class="tech-what"><span class="pulse"></span> Claude が決まりの案にしています…</p>`;
  const host: ToolHost<null> = {
    setSetting: () => Promise.reject(new Error("使わない")),
    setShank: () => Promise.reject(new Error("使わない")),
    check: () => Promise.reject(new Error("使わない")),
    look: () => Promise.reject(new Error("使わない")),
    snapshot: () => null,
    restore: () => undefined,
    proposeRule: (p) => propose(slot, p, name),
  };
  const r = await runClaude({ host, messages: [{ role: "user", content: `${name}さんが話したこと：${said}` }], system: keepPrompt(store.ledger(), name), tools: TOOLS.filter((t) => t.name === "propose_rule"), password: pass, maxTurns: 3, speed: "fast" });
  if (r.offline || (r.error && !r.log.length)) {
    if (r.error?.code === "wrong_password") resetPassword();
    slot.innerHTML = `<p class="tech-what">Claude につながりませんでした。${esc(r.error?.message ?? "")}</p>`;
  }
}
function propose(slot: HTMLElement, p: ProposeRuleInput, name: string): Promise<ProposeRuleResult> {
  return new Promise((resolve) => {
    slot.innerHTML = `<div class="proposal-d"><b>${esc(p.title)}</b><p>${esc(p.text)}</p><p class="tech-what">なぜ：${esc(p.reason)}</p>${p.param ? `<p class="tech-what">値：${p.value}</p>` : ""}${!p.param && p.steps?.length ? `<p class="tech-what">入る工程：${esc(p.steps.map((s) => MAKING_STEPS[s]).join("・"))}</p>` : ""}
      <div class="row"><button type="button" class="primary ok">これでいい</button><button type="button" class="ghost-d no">いらない</button></div></div>`;
    slot.querySelector(".no")!.addEventListener("click", () => {
      slot.innerHTML = "";
      resolve({ status: "declined", note: "職人が見送った" });
    });
    slot.querySelector(".ok")!.addEventListener("click", () => resolve({ status: "accepted", rule_id: acceptRule(p, name) }));
  });
}
/** 職人が「これでいい」と言った決まりを帳面に足し、今の設計とこれまでの作品を確かめ直す（Claude の案でも、数字で書いた決まりでも同じ） */
function acceptRule(p: ProposeRuleInput, _said: string): string {
  // 出どころは、はじめの帳面なら職人の名前、工房の帳面なら工房の名前。知らせには帳面の呼び名（工房 A など）
  const name = sourceName(store.ledger(), store.workshops().active === MAIN);
  const by = bookLabel(store.ledger());
  const before = session?.built?.problems.length ?? 0;
  const next = addRule(store.ledger(), { title: p.title, text: p.text, reason: p.reason, example: p.example, quote: p.quote, param: p.param, value: p.value, steps: p.steps, bySize: p.by_size?.map((x) => ({ upToMm: x.up_to_mm, value: x.value })), source: { kind: "craftsman", name }, date: today() });
  store.setLedger(next);
  const id = next.rules[next.rules.length - 1].id;
  lastRule = { by, quote: p.quote || p.text, spoken: Boolean(p.quote), before: session?.built ? grouped(session.built).length : before, after: 0, checks: p.param ? [...PARAMS[p.param].checks] : [] };
  fixLog = [];
  ruleDraft = "";
  const after = session ? session.build("帳面が変わった").problems.length : 0;
  lastRule.after = session?.built ? grouped(session.built).length : after;
  pastCheck = recheckWorks(lastRule);
  if (!$(".studio-refine").hidden) {
    renderCheck();
    // 決まりを足したら、上の「〇〇さんの決まりで、確かめ直しました」まで戻して見せる
    requestAnimationFrame(() => document.querySelector(".rule-flash")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  toast(p.param ? `${by}の決まりで確かめ直しました：作れない所 ${before} → ${after}` : `${by}の帳面に決まりを足しました`);
  flashVerdict();
  return id;
}
// ---- 職人の一言で、設計の決まりが変わる（確かめるの中） ----
let lastRule: { by: string; quote: string; spoken: boolean; before: number; after: number; checks: string[] } | null = null;
let fixLog: { text: string; cls: string }[] = [];
let ruleDraft = "";
function rulesSectionHtml(): string {
  const name = masterName(store.ledger());
  const all = activeRules(store.ledger()).filter((r) => r.source.kind === "craftsman");
  const mine = all.filter((r) => isCheckRule(r));
  const making = all.filter((r) => !isCheckRule(r));
  const where = (r: Rule) => stepsOfRule(r).map((s) => MAKING_STEPS[s]).join("・");
  return `<section class="sec rules-sec"><h4>職人の決まり<small>確かめに効く ${mine.length} 件</small></h4>
    <p class="hint">話すと、Claude が決まりの案にします。数字で確かめられる決まりは、「これでいい」を押すとその場で確かめ直します。手の動かし方などの決まりは、作るの工程に入ります。</p>
    <textarea rows="2" class="ar-text" placeholder="例：石の一番下と指の間は 2.5 mm は空ける。汗がたまるから">${esc(ruleDraft)}</textarea>
    <div class="row"><button type="button" class="ghost-d ar-mic">話す</button><button type="button" class="primary ar-go">決まりにする</button></div>
    <div class="ar-proposal"></div>
    <details class="more manual-rule"><summary>Claude なしで、数字で書く</summary>
      <label class="mr-row"><span>何の値か</span><select class="mr-param">${(Object.keys(PARAMS) as ParamId[])
        .map((k) => `<option value="${k}">${esc(PARAMS[k].label)}${PARAMS[k].unit ? `（${esc(PARAMS[k].unit)}）` : ""}</option>`)
        .join("")}</select></label>
      <label class="mr-row"><span>値</span><input class="mr-value" type="number" step="0.05" min="0" inputmode="decimal" placeholder="例：2.5"></label>
      <label class="mr-row"><span>職人の言葉</span><input class="mr-quote" type="text" placeholder="例：指の上は 2.5 mm 空ける。汗がたまるから"></label>
      <div class="row"><button type="button" class="primary mr-go">決まりにする</button></div>
    </details>
    ${mine.length ? `<ul class="rules-mini">${mine
      .slice()
      .reverse()
      .map((r) => `<li><b>${esc(r.title)}</b>${r.param && r.value !== undefined ? `<span class="v">${r.value} ${esc(PARAMS[r.param].unit)}</span>` : ""}${r.quote ? `<small>「${esc(r.quote)}」</small>` : ""}<small>${esc(name)} ・ ${esc(r.date)}</small></li>`)
      .join("")}</ul>` : `<p class="hint">確かめに効く職人の決まりは、まだありません（いまは公開の目安で確かめています）。</p>`}
    ${loadWorks().some((w) => w.design) ? "" : `<p class="hint no-works">記録に作品がないので、決まりを足しても「これまでの作品」は確かめ直せません。<button type="button" class="link add-samples">見本の作品を入れて試す</button></p>`}
    ${making.length ? `<details class="more making-rules"><summary>作り方の決まり ${making.length} 件（作るの工程に出ます）</summary><ul class="rules-mini">${making
      .slice()
      .reverse()
      .map((r) => `<li><b>${esc(r.title)}</b><small class="where">${where(r) ? `工程：${esc(where(r))}` : "工程なし"}</small><small>${esc(name)} ・ ${esc(r.date)}</small></li>`)
      .join("")}</ul></details>` : ""}
  </section>`;
}
/** 作るの工程の中に出す、職人の作り方の決まり */
function makingRulesHtml(stepId: string | undefined): string {
  if (!stepId) return "";
  const rules = makingRulesFor(activeRules(store.ledger()), stepId);
  if (!rules.length) return "";
  const name = masterName(store.ledger());
  return `<div class="past rule-in-step"><small>職人の決まり</small>${rules
    .map((r) => `<p class="r-text">${esc(r.text)}</p>${r.reason ? `<p class="r-why">なぜ：${esc(r.reason)}</p>` : ""}${r.quote ? `<p class="r-q">「${esc(r.quote)}」<span>${esc(name)} ・ ${esc(r.date)}</span></p>` : ""}`)
    .join("")}</div>`;
}
function bindRules(box: HTMLElement) {
  const field = box.querySelector<HTMLTextAreaElement>(".ar-text");
  if (!field) return;
  field.addEventListener("input", () => (ruleDraft = field.value));
  const voice = bindVoice(box.querySelector<HTMLButtonElement>(".ar-mic")!, field);
  box.querySelector(".ar-go")!.addEventListener("click", () => {
    voice.stop();
    ruleDraft = field.value;
    void addRuleFromWords(field.value.trim());
  });
  box.querySelector(".mr-go")?.addEventListener("click", () => {
    const param = box.querySelector<HTMLSelectElement>(".mr-param")!.value as ParamId;
    const value = Number(box.querySelector<HTMLInputElement>(".mr-value")!.value);
    const quote = box.querySelector<HTMLInputElement>(".mr-quote")!.value.trim();
    if (!Number.isFinite(value) || value <= 0) return toast("値を数字で入れてください");
    const d = PARAMS[param];
    acceptRule({ title: d.label, text: `${d.label}は ${value}${d.unit ? ` ${d.unit}` : ""}`, reason: quote || "職人が決めた", quote: quote || undefined, param, value }, masterName(store.ledger()));
  });
  box.querySelector(".add-samples")?.addEventListener("click", () => {
    const n = addSampleWorks();
    toast(`見本の作品を ${n} つ入れました`);
    if (lastRule) pastCheck = recheckWorks(lastRule);
    renderCheck();
  });
}
// ---- 新しい決まりで、これまでの作品を全部確かめ直す ----
interface PastRow {
  work: WorkRecord;
  probs: string[];
  fixed?: string;
  after?: number;
  ok?: boolean;
}
let pastCheck: { rule: string; by: string; total: number; rows: PastRow[] } | null = null;
function workSession(w: WorkRecord): RingSession | null {
  if (!w.design) return null;
  const s = new RingSession(w.design.stone, () => store.ledger(), () => undefined, () => "");
  s.state = structuredClone(w.design.state);
  s.build("記録を確かめ直す");
  return s;
}
const probLabels = (b: Built) => grouped(b).map(({ p }) => `${SHORT[p.check] ?? p.where}（${p.current} → ${p.required}）`);
function recheckWorks(rule: { by: string; quote: string }) {
  const works = loadWorks().filter((w) => w.design);
  const rows: PastRow[] = [];
  for (const w of works) {
    const s = workSession(w);
    if (!s?.built) continue;
    const labels = probLabels(s.built);
    if (labels.length) rows.push({ work: w, probs: labels });
  }
  return works.length ? { rule: rule.quote, by: rule.by, total: works.length, rows } : null;
}
function pastCheckHtml(): string {
  if (!pastCheck) return "";
  const { total, rows } = pastCheck;
  const left = rows.filter((r) => !r.ok).length;
  return `<section class="sec past-check"><h4>これまでの作品<small>${total} 作品を確かめ直しました</small></h4>
    ${rows.length ? `<p class="pc-sum"><em class="${left ? "ng" : "ok"}">${left ? `${left} 作品が、この決まりでは作れません` : "すべて、この決まりで作れる形に直しました"}</em></p>
    <ul class="pc-list">${rows
      .map(
        (r, i) => `<li class="${r.ok ? "ok" : "ng"}" style="animation-delay:${i * 0.12}s">${r.work.image ? `<img alt="" src="${r.work.image}">` : "<span></span>"}<div><b>${esc(r.work.title)}</b><small>${esc(r.work.date)}${r.work.maker ? ` ・ ${esc(r.work.maker)}` : ""}</small><p>${esc(r.fixed ?? r.probs.join("、"))}</p></div><i>${r.ok ? "直した" : r.fixed ? "職人へ" : "作れない"}</i></li>`,
      )
      .join("")}</ul>
    ${rows.some((r) => !r.fixed) ? `<button type="button" class="next-btn past-fix">今の設計も、これまでの作品も、直し方でまとめて直す</button>` : left ? `<p class="hint">直し方だけでは直らない作品は、職人が見て決めます。次に作る人の設計にも、この決まりが効きます。</p>` : `<p class="hint">次に作る人の設計にも、この決まりが効きます。</p>`}` : `<p class="pc-sum"><em class="ok">どの作品も、この決まりで作れる形でした</em></p>`}
  </section>`;
}
/** 記録の作品を、直し方のボタンと同じ直し方で直す。何を変えたかを記録に残す */
function fixPastWorks() {
  if (!pastCheck) return;
  for (const row of pastCheck.rows) {
    if (row.ok) continue;
    const s = workSession(row.work);
    if (!s?.built) continue;
    const before = structuredClone(s.state);
    const beforeMm = s.built.ring.setting.prongs[0]?.diameterMm;
    // 問題を 1 つずつ、最初の直し方で直す（形が変わらなければ次の問題へ）
    for (let i = 0; i < 8 && s.built!.problems.length; i++) {
      const key = JSON.stringify(s.state);
      const p = s.built!.problems.find((q) => q.options[0]);
      if (!p) break;
      applyFix(p.options[0].id, s);
      if (JSON.stringify(s.state) === key) break;
    }
    const st = s.state;
    const H = { low: "低め", standard: "標準", high: "高め" } as const;
    const changes: string[] = [];
    if (st.culetGapMm !== undefined && st.culetGapMm !== before.culetGapMm) changes.push(`石と指のすき間 ${s.built!.ring.culetGapMm.toFixed(2)} mm に`);
    else if (st.height !== before.height) changes.push(`高さ ${H[before.height]} → ${H[st.height]}`);
    const afterMm = s.built!.ring.setting.prongs[0]?.diameterMm;
    if (beforeMm && afterMm && Math.abs(afterMm - beforeMm) > 0.005) changes.push(`爪 ø${beforeMm.toFixed(2)} → ø${afterMm.toFixed(2)} mm`);
    if (st.prongCount !== before.prongCount) changes.push(`爪 ${s.built!.ring.setting.prongs.length} 本`);
    if (st.style !== before.style) changes.push(st.style === "bezel" ? "覆輪に" : "爪留めに");
    const change = changes.join("、") || "直し方で直した";
    const left = probLabels(s.built!);
    row.fixed = left.length ? `${change}（まだ：${left.join("、")}）` : change;
    row.ok = !left.length;
    row.after = left.length;
    updateWork({
      ...row.work,
      design: { stone: row.work.design!.stone, state: structuredClone(st) },
      problems: left,
      revisions: [...(row.work.revisions ?? []), { date: today(), by: pastCheck.by, rule: pastCheck.rule, change }],
    });
  }
  // 今の設計も、同じ直し方で直す（決まりは今の設計にも、これまでの作品にも効く）
  if (session?.built && kind === "solitaire") {
    for (let i = 0; i < 8 && session.built.problems.length; i++) {
      const key = JSON.stringify(session.state);
      const p = session.built.problems.find((q) => q.options[0]);
      if (!p) break;
      applyFix(p.options[0].id);
      session.flush();
      if (JSON.stringify(session.state) === key) break;
    }
  }
  renderCheck();
  flashVerdict();
}

function flashVerdict() {
  const c = $(".verdict-chip");
  c.classList.remove("flash");
  void c.offsetWidth;
  c.classList.add("flash");
}
/** 新しい決まりに合うように、Claude に直してもらう（作業は確かめるの中に一行ずつ） */
async function fixWithClaude() {
  if (!session || !stone || making) return;
  const pass = store.password() || (await askPassword(true));
  if (!pass) {
    fixLog = [{ text: "Claude に直してもらうには合言葉が要ります。合言葉がなくても、上の直し方のボタンか「手で変える」で直せます。", cls: "note" }];
    renderCheck();
    return;
  }
  making = true;
  fixLog = [{ text: "Claude が、帳面の決まりに合うように直しています…", cls: "note" }];
  renderCheck();
  const r = await runClaude({
    host: session,
    messages: [{ role: "user", content: `${stoneText()}\n今の形のまま、帳面の決まりに合わない所だけを直してください。まず check で確かめ、直したらもう一度 check で確かめます。見た目はなるべく変えません。最後に、何をなぜ変えたかを 1〜2 行で書いてください。` }],
    system: designPrompt(store.ledger()),
    tools: TOOLS.filter((t) => ["set_setting", "set_shank", "check"].includes(t.name)),
    password: pass,
    speed: "fast",
    maxTurns: 6,
    onLog: (e) => {
      if (e.kind === "note") fixLog.push({ text: e.text.replace(/\*\*/g, "").split("\n")[0].slice(0, 120), cls: "note" });
      else {
        const li = document.createElement("li");
        logLineTo(li, e);
        fixLog.push({ text: li.textContent ?? "", cls: li.className });
      }
      renderCheck();
    },
  });
  making = false;
  if (r.offline || (r.error && !r.log.length)) {
    if (r.error?.code === "wrong_password") resetPassword();
    fixLog.push({ text: `Claude につながりませんでした。${r.error?.message ?? ""}`, cls: "ng" });
  }
  renderCheck();
  flashVerdict();
}

function toast(t: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = t;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---- 石のない指輪（甲丸・平打ち・かまぼこ） ----
type Kind = "solitaire" | "band";
let kind: Kind = "solitaire";
let bandMetal: Metal = "k18yg";
let band: Band = { gou: 12, kind: "kouman", top: { width: 4, thickness: 1.6 }, bottom: { width: 3.2, thickness: 1.4 }, density: GUIDES.metals.k18y.densityGPerCm3, metalLabel: METAL_LABEL.k18yg };
let bandWeight = 0;
let bandPositions: Float32Array | null = null;

function setBandMetal(m: Metal) {
  bandMetal = m;
  band = { ...band, density: GUIDES.metals[metalIdOf(m)].densityGPerCm3, metalLabel: METAL_LABEL[m] };
}
function bandName() {
  return `${SECTION_LABEL[band.kind]}の指輪`;
}
function showBand() {
  const m = bandMesh(band);
  bandPositions = m.positions;
  bandWeight = m.weightG;
  viewer.setMetalMesh(m.positions, metalIdOf(bandMetal), "band");
  headBox = null;
  setDims(bandDims(m.positions));
  const probs = checkBand(band);
  const chip = $(".verdict-chip");
  chip.hidden = false;
  chip.className = `verdict-chip ${probs.length ? "ng" : "ok"}`;
  chip.textContent = probs.length ? `作れない所 ${probs.length}` : "作れます";
  $(".word-name").textContent = bandName();
  const rows: [string, string][] = [
    ["断面", SECTION_LABEL[band.kind]],
    ["号", `${band.gou} 号 ・ 内径 ${bandInnerDiameter(band.gou).toFixed(1)} mm`],
    ["上", `${band.top.width} × ${band.top.thickness} mm`],
    ["下", `${band.bottom.width} × ${band.bottom.thickness} mm`],
    ["地金", `${band.metalLabel} ・ 約 ${bandWeight.toFixed(1)} g`],
  ];
  $(".specs").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  if (!$(".studio-refine").hidden) renderBandCheck();
  if (!$(".build-panel").hidden) renderBandBuild();
}
function bandControls(box: HTMLElement) {
  const slider = (cls: string, label: string, min: number, max: number, step: number, v: number, unit: string) =>
    `<label><span>${label}</span><input type="range" class="${cls}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v}${unit}</output></label>`;
  box.innerHTML = `
    <div class="pick"><span>断面</span><div>${(Object.keys(SECTION_LABEL) as SectionKind[]).map((k) => `<button type="button" data-sec="${k}" aria-pressed="${band.kind === k}">${SECTION_LABEL[k]}</button>`).join("")}</div></div>
    <div class="sliders">
      ${slider("b-gou", "号", 3, 30, 1, band.gou, " 号")}
      ${slider("b-tw", "上の幅", 1, 12, 0.1, band.top.width, " mm")}
      ${slider("b-tt", "上の厚み", 0.6, 3.5, 0.1, band.top.thickness, " mm")}
      ${slider("b-bw", "下の幅", 1, 12, 0.1, band.bottom.width, " mm")}
      ${slider("b-bt", "下の厚み", 0.6, 3.5, 0.1, band.bottom.thickness, " mm")}
    </div>
    <div class="pick"><span>地金</span><div>${(["k18yg", "pt900", "k18wg", "k18pg", "sv925"] as Metal[]).map((m) => `<button type="button" data-metal="${m}" aria-pressed="${bandMetal === m}">${METAL_LABEL[m]}</button>`).join("")}</div></div>`;
  box.querySelectorAll<HTMLButtonElement>("[data-sec]").forEach((b) => b.addEventListener("click", () => ((band = { ...band, kind: b.dataset.sec as SectionKind }), bandControls(box), showBand())));
  box.querySelectorAll<HTMLButtonElement>("[data-metal]").forEach((b) => b.addEventListener("click", () => (setBandMetal(b.dataset.metal as Metal), bandControls(box), showBand())));
  const bind = (cls: string, set: (v: number) => void, unit: string) => {
    const inp = box.querySelector<HTMLInputElement>(`.${cls}`)!;
    inp.addEventListener("input", () => {
      set(Number(inp.value));
      inp.nextElementSibling!.textContent = `${inp.value}${unit}`;
      showBand();
    });
  };
  bind("b-gou", (v) => (band = { ...band, gou: v }), " 号");
  bind("b-tw", (v) => (band = { ...band, top: { ...band.top, width: v } }), " mm");
  bind("b-tt", (v) => (band = { ...band, top: { ...band.top, thickness: v } }), " mm");
  bind("b-bw", (v) => (band = { ...band, bottom: { ...band.bottom, width: v } }), " mm");
  bind("b-bt", (v) => (band = { ...band, bottom: { ...band.bottom, thickness: v } }), " mm");
}
function setKind(k: Kind) {
  kind = k;
  document.querySelectorAll<HTMLButtonElement>(".kinds [data-kind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === k)));
  document.querySelectorAll<HTMLElement>(".solitaire-only").forEach((e) => (e.hidden = k !== "solitaire"));
  document.querySelectorAll<HTMLElement>(".band-only").forEach((e) => (e.hidden = k !== "band"));
  showCannot("");
  $(".worklog").innerHTML = `<li class="note">${k === "band" ? "下の行に希望（例：細めで、手のひら側を薄く）を書いて「生む」。上の「形」の数字で、手でも変えられます。" : "下の行に希望を書いて「生む」を押すと、Claude が組み、作れるか確かめて直します。"}</li>`;
  if (k === "band") {
    bandControls($(".band-ctrl"));
    showBand();
  } else if (session) session.build("一粒石の指輪に戻る");
  if (!$(".studio-refine").hidden) renderCheck();
  if (!$(".build-panel").hidden) renderBuild();
}
document.querySelectorAll<HTMLButtonElement>(".kinds [data-kind]").forEach((b) => b.addEventListener("click", () => setKind(b.dataset.kind as Kind)));

function renderBandCheck() {
  const box = $(".studio-refine");
  const probs = checkBand(band);
  box.innerHTML = `
    <section class="big-verdict ${probs.length ? "ng" : "ok"}"><b>${probs.length ? "このままでは作れません" : "このまま作れます"}</b><small>${probs.length ? `直す所 ${probs.length}` : "厚み・幅、どちらも目安の内側"}</small></section>
    ${probs.length ? `<ul class="probs">${probs.map((p, i) => `<li><div class="p-head"><b>${esc(p.title)}</b></div><p class="p-num">${esc(p.current)} <span>→</span> ${esc(p.required)}</p><div class="p-act"><button type="button" class="fix-go" data-i="${i}">${esc(p.fix.label)}</button><details><summary>なぜ</summary><p>${esc(p.why)}</p></details></div></li>`).join("")}</ul>` : ""}
    <details class="manual" ${probs.length ? "" : "open"}><summary>手で変える</summary><div class="band-ctrl-2"></div></details>
    <button type="button" class="next-btn to-build">作り方を見る →</button>`;
  bandControls(box.querySelector(".band-ctrl-2")!);
  box.querySelectorAll<HTMLButtonElement>(".fix-go").forEach((b) =>
    b.addEventListener("click", () => {
      band = probs[Number(b.dataset.i)].fix.apply(band);
      bandControls($(".band-ctrl"));
      showBand();
    }),
  );
  box.querySelector(".to-build")!.addEventListener("click", () => setMode("hand"));
}

function renderBandBuild() {
  const box = $(".build-panel");
  const steps = bandHowTo(band, method, bandWeight, alloyOf(bandMetal));
  const probs = checkBand(band);
  box.innerHTML = `
    <div class="seg method"><button type="button" data-m="hand" aria-pressed="${method === "hand"}">鍛造</button><button type="button" data-m="cast" aria-pressed="${method === "cast"}">鋳造</button></div>
    ${probs.length ? `<p class="build-warn">このままでは作れない所が ${probs.length} あります。<button type="button" class="link to-check">確かめる →</button></p>` : ""}
    ${stepsHtml(steps)}
    <p class="note-b">寸法は、この形から計算した目安。${NOTE}</p>
    <div class="row out"><button type="button" class="primary p-instr">図面・指示書を印刷</button><button type="button" class="ghost-d p-stl">STL を書き出す</button></div>
    <div class="save-work"><button type="button" class="next-btn p-save">この作品の記録を残す</button></div>`;
  box.querySelector(".p-save")!.addEventListener("click", () => openSaveWork(box.querySelector(".save-work")!, bandData()));
  box.querySelectorAll<HTMLButtonElement>(".method button").forEach((b) => b.addEventListener("click", () => ((method = b.dataset.m as Method), renderBandBuild())));
  box.querySelector(".to-check")?.addEventListener("click", () => setMode("refine"));
  box.querySelectorAll<HTMLButtonElement>(".tool-chip").forEach((c) => c.addEventListener("click", () => openTool(c.dataset.tool!)));
  bindTerms(box);
  box.querySelector(".p-instr")!.addEventListener("click", () => askPrint(false, (pick) =>
    openPrint(
      sheetHtml({
        includeSteps: pick.steps,
        includeDetails: pick.details,
        drawingHtml: pick.drawing ? bandDrawing(probs.map((p) => p.title)) : "",
        title: bandName(),
        date: today(),
        imageDataUrl: viewer.snapshot(),
        specs: [
          { label: "断面", value: SECTION_LABEL[band.kind] },
          { label: "号", value: `${band.gou} 号 ・ 内径 ${bandInnerDiameter(band.gou).toFixed(1)} mm` },
          { label: "上（見える側）", value: `${band.top.width} × ${band.top.thickness} mm` },
          { label: "下（手のひら側）", value: `${band.bottom.width} × ${band.bottom.thickness} mm` },
          { label: "地金", value: `${band.metalLabel} ・ 約 ${bandWeight.toFixed(1)} g` },
        ],
        problems: probs.map((p) => `${p.title}（${p.current} → ${p.required}）`),
        methodLabel: method === "hand" ? "鍛造" : "鋳造",
        steps,
        patternSvg: "",
      }),
    ),
  ));
  box.querySelector(".p-stl")!.addEventListener("click", () => {
    if (!bandPositions) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toStl(bandPositions)], { type: "model/stl" }));
    a.download = `継ぐ_${bandName()}_${band.gou}号.stl`;
    a.click();
  });
}

async function makeBand() {
  if (making) return;
  const wish = $<HTMLInputElement>(".wish").value.trim();
  const st = $(".make-status");
  const pass = store.password() || (await askPassword(true));
  if (!pass) {
    st.textContent = "生むには Claude が要ります。合言葉がなくても、「形」の数字を変えて手で作れます。";
    return;
  }
  making = true;
  st.innerHTML = `<span class="pulse"></span> Claude が形を考えています…`;
  const r = await callTool<BandDraft>({ system: bandPrompt(), user: wish || "ふつうの普段使いの指輪", tool: MAKE_BAND, parse: parseBand, password: pass, speed: "fast" });
  making = false;
  if (!r.ok) {
    if (r.code === "wrong_password") resetPassword();
    st.textContent = r.error;
    return;
  }
  const d = r.value;
  band = { ...band, kind: d.kind, top: d.top, bottom: d.bottom, gou: d.gou };
  setBandMetal(d.metal);
  bandControls($(".band-ctrl"));
  showBand();
  $(".worklog").innerHTML = `<li class="tool set_shank">${esc(`${SECTION_LABEL[d.kind]}・上 ${d.top.width}×${d.top.thickness}・下 ${d.bottom.width}×${d.bottom.thickness} mm・${d.gou} 号・${METAL_LABEL[d.metal]}`)}</li><li class="note">${esc(d.reason)}</li>`;
  showCannot(d.cannotDo);
  st.innerHTML = `${r.remaining !== undefined ? `今日あと ${r.remaining} 回 ・ ` : ""}<button type="button" class="link go-refine">確かめる →</button>`;
  st.querySelector(".go-refine")!.addEventListener("click", () => setMode("refine"));
}

// ---- 図面：3D から正面・横・上の線画を描き、寸法を入れる ----
const DRAW_PX = 40;
type DView = "front" | "side" | "top";
function views(list: [DView, string][], dimsOf: (v: DView, box: { min: number[]; max: number[] }) => Dim[]): DrawingView[] {
  return list.map(([v, name]) => {
    const d = viewer.drawing(v, DRAW_PX);
    return { name, url: d.url, widthMm: d.widthMm, heightMm: d.heightMm, widthPx: d.widthPx, heightPx: d.heightPx, project: d.project, dims: dimsOf(v, d.box) };
  });
}
function solitaireDrawing(b: Built, problems: string[]): string {
  const r = b.ring;
  const lift = r.shank.outerRadiusMm;
  const ri = r.shank.innerDiameterMm / 2;
  const t = r.transform;
  const h = r.stone.heights;
  const c = Math.cos(t.rotationZ);
  const sn = Math.sin(t.rotationZ);
  const pts = stone!.measured.outlineMm.map((q) => ({ x: q.x * c - q.y * sn, y: q.x * sn + q.y * c }));
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const girdleZ = t.translateZ + h.culetZ + h.pavilionMm + lift;
  const fingerTop = lift + ri;
  const bad = new Set(b.problems.map((p) => p.check));
  const wide = Math.max(...xs) - Math.min(...xs);
  const deep = Math.max(...ys) - Math.min(...ys);
  const html = drawingPage({
    title: `${stone!.shapeName}の一粒石の指輪`,
    date: today(),
    pxPerMm: DRAW_PX,
    problems,
    rows: [
      { label: "号・内径", value: `${session!.state.gou} 号 ・ ø${(ri * 2).toFixed(1)}` },
      { label: "地金・重さ", value: `${METAL_LABEL[session!.state.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g` },
      { label: "石", value: `${stone!.measured.longMm.toFixed(2)} × ${stone!.measured.widthMm.toFixed(2)} × ${stone!.depthMm.toFixed(2)}` },
      { label: "留め方", value: r.setting.style === "bezel" ? `覆輪 ・ 壁 ${r.setting.bezel?.wallMm.toFixed(2)}` : `爪 ${r.setting.prongs.length} ・ ø${r.setting.prongs[0]?.diameterMm.toFixed(2)}` },
    ],
    views: views(
      [
        ["front", "正面図"],
        ["side", "側面図"],
        ["top", "上面図"],
      ],
      (v, box) => {
        const top = box.max[2];
        if (v === "front")
          return [
            { a: [0, -ri, lift], b: [0, ri, lift], label: `内径 ø${(ri * 2).toFixed(1)}` },
            { a: [0, 0, 0], b: [0, 0, top], ext: [0, box.max[1] + 3, 0], label: `全高 ${top.toFixed(1)}` },
            { a: [0, 0, fingerTop], b: [0, 0, top], ext: [0, box.min[1] - 3, 0], label: `指から ${(top - fingerTop).toFixed(1)}`, bad: bad.has("tip-height") },
            { a: [0, 0, 0], b: [0, 0, r.shank.thicknessMm], ext: [0, box.min[1] - 3, 0], label: `厚み ${r.shank.thicknessMm.toFixed(1)}` },
          ];
        if (v === "side")
          return [
            { a: [-r.shank.widthMm / 2, 0, 0], b: [r.shank.widthMm / 2, 0, 0], ext: [0, 0, -3], label: `幅 ${r.shank.widthMm.toFixed(1)}` },
            { a: [Math.min(...xs), 0, girdleZ], b: [Math.max(...xs), 0, girdleZ], ext: [0, 0, top - girdleZ + 3], label: `${wide.toFixed(2)}` },
            { a: [0, 0, fingerTop], b: [0, 0, t.translateZ + h.culetZ + lift], ext: [box.max[0] + 3, 0, 0], label: `すき間 ${r.culetGapMm.toFixed(2)}`, bad: bad.has("finger-gap") },
          ];
        return [
          { a: [Math.min(...xs), 0, top], b: [Math.max(...xs), 0, top], ext: [0, box.max[1] - 0 + 3, 0], label: `${wide.toFixed(2)}` },
          { a: [0, Math.min(...ys), top], b: [0, Math.max(...ys), top], ext: [box.max[0] + 3, 0, 0], label: `${deep.toFixed(2)}` },
        ];
      },
    ),
  });
  return html;
}
function bandDrawing(problems: string[]): string {
  const ri = bandInnerDiameter(band.gou) / 2;
  let zmin = Infinity;
  const p = bandPositions!;
  for (let i = 2; i < p.length; i += 3) zmin = Math.min(zmin, p[i]);
  const cz = zmin + band.bottom.thickness + ri;
  const ztop = cz + ri + band.top.thickness;
  const titles = problems.join(" ");
  return drawingPage({
    title: bandName(),
    date: today(),
    pxPerMm: DRAW_PX,
    problems,
    rows: [
      { label: "号・内径", value: `${band.gou} 号 ・ ø${(ri * 2).toFixed(1)}` },
      { label: "地金・重さ", value: `${band.metalLabel} ・ 約 ${bandWeight.toFixed(1)} g` },
      { label: "断面", value: SECTION_LABEL[band.kind] },
      { label: "上・下", value: `${band.top.width}×${band.top.thickness} ・ ${band.bottom.width}×${band.bottom.thickness}` },
    ],
    views: views(
      [
        ["front", "正面図"],
        ["side", "側面図"],
      ],
      (v, box) =>
        v === "front"
          ? [
              { a: [0, -ri, cz], b: [0, ri, cz], label: `内径 ø${(ri * 2).toFixed(1)}` },
              { a: [0, 0, cz + ri], b: [0, 0, ztop], ext: [0, box.max[1] + 3, 0], label: `厚み ${band.top.thickness.toFixed(1)}`, bad: titles.includes("厚") },
              { a: [0, 0, zmin], b: [0, 0, zmin + band.bottom.thickness], ext: [0, box.max[1] + 3, 0], label: `厚み ${band.bottom.thickness.toFixed(1)}`, bad: titles.includes("厚") },
              { a: [0, 0, zmin], b: [0, 0, ztop], ext: [0, box.min[1] - 3, 0], label: `外径 ø${(ztop - zmin).toFixed(1)}` },
            ]
          : [
              { a: [-band.top.width / 2, 0, ztop], b: [band.top.width / 2, 0, ztop], ext: [0, 0, 3], label: `幅 ${band.top.width.toFixed(1)}`, bad: titles.includes("幅") },
              { a: [-band.bottom.width / 2, 0, zmin], b: [band.bottom.width / 2, 0, zmin], ext: [0, 0, -3], label: `幅 ${band.bottom.width.toFixed(1)}`, bad: titles.includes("幅") },
            ],
    ),
  });
}
/** 印刷する物を選ぶ：図面・作り方・原寸の型紙 */
function askPrint(hasPattern: boolean, go: (p: { drawing: boolean; steps: boolean; pattern: boolean; details: boolean }) => void) {
  const dlg = document.createElement("dialog");
  dlg.className = "sheet print-pick";
  dlg.innerHTML = `<form method="dialog">
    <h3>印刷する物</h3>
    <label class="chk"><input type="checkbox" name="drawing" checked><span><b>図面</b><small>正面・横・上、寸法つき（A4 横）</small></span></label>
    <label class="chk"><input type="checkbox" name="steps" checked><span><b>作り方</b><small>${method === "hand" ? "鍛造" : "鋳造"}の手順と数字</small></span></label>
    <label class="chk"><input type="checkbox" name="details"><span><b>詳しい手順も</b><small>「詳しく」の中身と温度（ページが増えます）</small></span></label>
    ${hasPattern ? `<label class="chk"><input type="checkbox" name="pattern"><span><b>原寸の型紙</b><small>石を置いて確かめる</small></span></label>` : ""}
    <div class="sheet-actions"><button value="cancel" class="ghost">やめる</button><button value="ok" class="primary">印刷</button></div>
  </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => {
    const f = (n: string) => !!dlg.querySelector<HTMLInputElement>(`[name="${n}"]`)?.checked;
    const pick = { drawing: f("drawing"), steps: f("steps"), pattern: f("pattern"), details: f("details") };
    dlg.remove();
    if (dlg.returnValue === "ok" && (pick.drawing || pick.steps || pick.pattern)) go(pick);
    else if (dlg.returnValue === "ok") toast("印刷するもの（図面・作り方・型紙）を 1 つ以上選んでください");
  });
  dlg.showModal();
}

// ---- 記録。：作った物ごとに残す ----
interface WorkData {
  title: string;
  kind: string;
  specs: { label: string; value: string }[];
  problems: string[];
  steps: ReturnType<typeof howToMake>;
  design?: WorkRecord["design"];
}
function solitaireData(sess: RingSession = session!, info: StoneInfo = currentStone(), route: Method = method): WorkData {
  const b = sess.built!;
  const r = b.ring;
  const st = r.setting;
  return {
    title: `${info.shapeName}の一粒石の指輪`,
    kind: "一粒石の指輪",
    design: { stone: structuredClone(sess.stone), state: sess.snapshot() },
    specs: [
      { label: "石", value: `${info.longMm.toFixed(2)} × ${info.widthMm.toFixed(2)} × ${info.depthMm.toFixed(2)} mm` },
      { label: "号", value: `${sess.state.gou} 号 ・ 内径 ${r.shank.innerDiameterMm.toFixed(1)} mm` },
      { label: "留め方", value: st.style === "bezel" ? `覆輪 ・ 壁 ${st.bezel?.wallMm.toFixed(2)} mm` : `爪 ${st.prongs.length} ・ ø ${st.prongs[0]?.diameterMm.toFixed(2)} mm` },
      { label: "腕", value: `${r.shank.widthMm.toFixed(1)} × ${r.shank.thicknessMm.toFixed(1)} mm` },
      { label: "石と指のすき間", value: `${r.culetGapMm.toFixed(2)} mm` },
      { label: "地金", value: `${METAL_LABEL[sess.state.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g` },
    ],
    problems: grouped(b).map(({ p }) => `${SHORT[p.check] ?? p.where}（${p.current} → ${p.required}）`),
    steps: howToMake(howInput(b, sess, info), route),
  };
}
function bandData(): WorkData {
  return {
    title: bandName(),
    kind: bandName(),
    specs: [
      { label: "断面", value: SECTION_LABEL[band.kind] },
      { label: "号", value: `${band.gou} 号 ・ 内径 ${bandInnerDiameter(band.gou).toFixed(1)} mm` },
      { label: "上（見える側）", value: `${band.top.width} × ${band.top.thickness} mm` },
      { label: "下（手のひら側）", value: `${band.bottom.width} × ${band.bottom.thickness} mm` },
      { label: "地金", value: `${band.metalLabel} ・ 約 ${bandWeight.toFixed(1)} g` },
    ],
    problems: checkBand(band).map((p) => `${p.title}（${p.current} → ${p.required}）`),
    steps: bandHowTo(band, method, bandWeight, alloyOf(bandMetal)),
  };
}
function thumbnail(): string {
  viewer.snapshot(); // いまの形を描き直してから切り出す
  const c = document.createElement("canvas");
  c.width = c.height = 360;
  const g = c.getContext("2d")!;
  // 真ん中を正方形に切り出す
  const cv = $(".gl canvas") as HTMLCanvasElement;
  const s0 = Math.min(cv.width, cv.height);
  g.drawImage(cv, (cv.width - s0) / 2, (cv.height - s0) / 2, s0, s0, 0, 0, 360, 360);
  return c.toDataURL("image/jpeg", 0.8);
}
function openSaveWork(slot: HTMLElement, data: WorkData) {
  slot.innerHTML = `<div class="save-form">
    <label>作った人<input type="text" class="w-maker" value="${esc(masterName(store.ledger()) === "職人" ? "" : masterName(store.ledger()))}" placeholder="名前"></label>
    <label>話して残す（気をつけたこと・コツ・なぜそうしたか）<textarea rows="3" class="w-note" placeholder="例：座は爪の 3 分の 1 まで。V 字の爪は角に当てないよう先を逃がした。ロウは継ぎ目の反対から熱した"></textarea></label>
    <p class="hint">Claude が、話を工程ごとのコツに分けて残します。次に同じ工程を作る人の画面に「前の記録から」と出ます。</p>
    <div class="row"><button type="button" class="ghost-d w-mic">話す</button><button type="button" class="primary w-save">記録する</button></div>
  </div>`;
  const note = slot.querySelector<HTMLTextAreaElement>(".w-note")!;
  const voice = bindVoice(slot.querySelector<HTMLButtonElement>(".w-mic")!, note);
  slot.querySelector(".w-save")!.addEventListener("click", async () => {
    voice.stop();
    const said = note.value.trim();
    const maker = slot.querySelector<HTMLInputElement>(".w-maker")!.value.trim();
    const titles = data.steps.map((s) => s.title);
    let tips: Tip[] = [];
    let leftOver = "";
    let sortNote = "";
    if (said) {
      const pass = store.password() || (await askPassword(true));
      if (pass) {
        slot.innerHTML = `<p class="saved working"><span class="pulse"></span> Claude が、話を工程ごとのコツに分けています…</p>`;
        const r = await callTool({ system: tipsPrompt(titles), user: `作った物：${data.title}\n職人が話したこと：${said}`, tool: SORT_TIPS, parse: parseTips(titles), password: pass, speed: "fast" });
        if (r.ok) ({ tips, leftOver } = r.value);
        else {
          if (r.code === "wrong_password") resetPassword();
          sortNote = `工程に分けられませんでした（${r.error}）。話はそのまま残しました。`;
        }
      } else sortNote = "合言葉がないので、話はそのまま残しました（工程には分けていません）。";
    }
    const ok = saveWork({
      id: newWorkId(),
      date: today(),
      title: data.title,
      kind: data.kind,
      methodLabel: method === "hand" ? "鍛造" : "鋳造",
      image: thumbnail(),
      specs: data.specs,
      problems: data.problems,
      // 記録には「詳しく」を入れない（このブラウザの入れ物が小さいため）
      steps: data.steps.map(({ details: _d, ...rest }) => rest),
      note: said,
      maker,
      tips,
      design: data.design,
    });
    if (!ok) {
      slot.innerHTML = `<p class="build-warn">このブラウザにはもう入りません。「記録」で古い物を消してください。</p>`;
      return;
    }
    slot.innerHTML = `<div class="saved"><b>記録しました（${loadWorks().length} 作品目）</b>
      ${tips.length ? `<ul class="sorted">${tips.map((t) => `<li><i class="k-${t.kind}">${esc(t.kind)}</i><span><small>${esc(t.step)}</small>${esc(t.text)}</span></li>`).join("")}</ul>` : ""}
      ${leftOver ? `<p class="hint">工程に当てはまらなかった話：${esc(leftOver)}</p>` : ""}
      ${sortNote ? `<p class="hint">${esc(sortNote)}</p>` : ""}
      <button type="button" class="link to-works">記録を見る →</button></div>`;
    slot.querySelector(".to-works")?.addEventListener("click", () => setMode("works"));
  });
}
/** 見本の作品を記録に入れる（よくある形の石から組んだ設計。職人の作品ではないと、名前と言葉で示す） */
function addSampleWorks(): number {
  let n = 0;
  const have = new Set(loadWorks().filter(isSample).map((w) => w.title));
  for (const d of SAMPLE_DESIGNS) {
    const { preset, stone: st } = sampleStone(d.preset);
    const title = `見本：${preset.name}の一粒石の指輪（${d.label}）`;
    if (have.has(title)) continue;
    const s = new RingSession(st, () => store.ledger(), () => undefined, () => "");
    s.state = sampleState(d);
    tuneSample(s);
    if (!s.built) continue;
    const data = solitaireData(s, { shapeName: preset.name, outlineMm: st.outlineMm, longMm: st.longMm, widthMm: st.widthMm, depthMm: st.depthMm }, "hand");
    const ok = saveWork({
      id: newWorkId(),
      date: today(),
      title,
      kind: data.kind,
      methodLabel: "鍛造",
      image: outlineThumb(st),
      specs: data.specs,
      problems: data.problems,
      steps: data.steps.map(({ details: _d, ...rest }) => rest),
      note: SAMPLE_NOTE,
      maker: SAMPLE_MAKER,
      design: data.design,
    });
    if (ok) n++;
  }
  return n;
}
function renderWorks() {
  const box = $(".works-panel");
  const works = loadWorks();
  box.innerHTML = `
    <section class="works-head"><b>${works.length} 作品</b><small>作るたびに、形・作れるか・作り方・ひとことが残ります。</small></section>
    ${works.length ? `<button type="button" class="primary w-print">記録の帳面を印刷</button>` : `<p class="tech-what">まだ記録がありません。「作る」の下の「この作品の記録を残す」から残せます。</p><p class="tech-what">試すだけなら、よくある形の石から継ぐが組んだ見本の作品を入れられます（職人の作品ではありません）。</p><button type="button" class="next-btn w-samples">見本の作品を 5 つ入れる</button>`}
    ${works.some(isSample) ? `<button type="button" class="ghost-d w-unsample">見本の作品を消す</button>` : ""}
    <ul class="works-list">${works
      .map(
        (w) => `<li><img alt="" src="${w.image}"><div><b>${esc(w.title)}</b><small>${esc(w.date)}${w.maker ? ` ・ ${esc(w.maker)}` : ""} ・ ${esc(w.methodLabel)}</small>${w.note ? (isSample(w) ? `<p class="sample-note">${esc(w.note)}</p>` : `<p>「${esc(w.note)}」</p>`) : ""}${(w.revisions ?? []).map((r) => `<p class="rev">${esc(r.by)}さんの決まりで直した：${esc(r.change)}</p>`).join("")}<span class="${w.problems.length ? "ng" : "ok"}">${w.problems.length ? "作れない所あり" : "作れる形"}</span></div><button type="button" class="w-del" data-id="${w.id}" aria-label="消す">×</button></li>`,
      )
      .join("")}</ul>
    <nav class="places-sm" aria-label="ほかの場所"><small>ほかの場所</small><a href="app.html#see">学ぶ<span>次の人が、手本と比べ、なぜ？と聞く</span></a><a href="app.html#keep">残す<span>職人が、決まり・手本・答えを残す</span></a><a href="app.html#rebuild">組み立て直す<span>途切れた技を、手がかりから</span></a></nav>`;
  box.querySelector(".w-print")?.addEventListener("click", () => openPrint(worksBookHtml(loadWorks(), today())));
  box.querySelector(".w-samples")?.addEventListener("click", () => {
    addSampleWorks();
    renderWorks();
  });
  box.querySelector(".w-unsample")?.addEventListener("click", () => {
    for (const w of loadWorks()) if (isSample(w)) removeWork(w.id);
    renderWorks();
  });
  box.querySelectorAll<HTMLButtonElement>(".w-del").forEach((b) =>
    b.addEventListener("click", () => {
      removeWork(b.dataset.id!);
      renderWorks();
    }),
  );
}

// ---- なぜ継ぐ（往復の図・20 年の図・残し方） ----
function openWhy() {
  let el = document.querySelector<HTMLElement>(".why");
  if (!el) {
    el = document.createElement("div");
    el.className = "why";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "なぜ継ぐ");
    document.body.appendChild(el);
  }
  el.innerHTML = whyHtml();
  el.hidden = false;
  el.scrollTop = 0;
  const close = () => {
    el!.hidden = true;
    if (location.hash === "#why") history.replaceState(null, "", location.pathname + location.search);
  };
  el.querySelector(".why-close")!.addEventListener("click", close);
  el.querySelector(".why-go")!.addEventListener("click", close);
}
$(".act-why").addEventListener("click", () => {
  history.replaceState(null, "", "#why");
  openWhy();
});
if (location.hash === "#why") openWhy();
// 動画を 1 コマずつ撮るとき（?rec）：3D をページの外から回せるようにする
if (new URLSearchParams(location.search).has("rec")) {
  const w = window as unknown as { __viewer: Viewer; __propose: (p: ProposeRuleInput) => Promise<ProposeRuleResult> };
  w.__viewer = viewer;
  // 画面の確かめ用：Claude の決まりの案の代わりに、案を直接出す（本番の動画には使わない）
  w.__propose = (p) => propose($(".ar-proposal"), p, masterName(store.ledger()));
}

setMode("make");
void loadSample().catch((e) => ($(".make-status").textContent = `見本の石を読めませんでした：${(e as Error).message}`));
(window as unknown as { __studio: unknown }).__studio = { get session() { return session; }, setMode, dimsAvoid };
