// 継ぐ：デザインを、職人の判断で「作れる形」にする。
// 生む。  石の写真・デザインの絵・希望の言葉 → Claude が指輪を組み、作れるか確かめ、直す（作業の記録が見える）。
// 整える。作れない所が赤く光り、誰のどの決まりかと、見た目への影響つきの直し方が出る。人も同じつまみで直せる。
// 渡す。  職人への指示書・原寸の型紙・3D データ。
// 帳面   職人が声で決まりを足すと、その場で確かめが変わる。
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
import { activeRules, addRule, sourceLabel, type Rule } from "../rules/ledger";
import { askPassword, resetPassword } from "../app/password";
import { esc, store, today } from "../app/store";
import { bindVoice, canListen } from "../app/voice";
import { masterName } from "../app/master";
import { toStl } from "../cad/solid";
import { buildStone } from "../geometry/stone";
import { METAL_LABEL, RingSession, type Built } from "./session";
import { howToMake, type Method } from "./howto";
import { sheetHtml } from "./sheet";
import { drawingPage, type DrawingView } from "./drawing";
import { loadWorks, newWorkId, removeWork, saveWork, worksBookHtml } from "./works";
import { KIND_LABEL, toolById, toolsForStep } from "./toolbox";
import { NOTE, TERMS, type AlloyId } from "./process";
import type { Step } from "./howto";
import { MAKE_BAND, SECTION_LABEL, bandHowTo, bandInnerDiameter, bandMesh, bandPrompt, checkBand, parseBand, type Band, type BandDraft, type SectionKind } from "./band";
import { metalIdOf } from "./session";
import { GUIDES } from "../rules/guides";
import { callTool } from "../rebuild/run";
import { dimsSvg, gizmoSvg, type Dim } from "./dims";

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
    <div class="tb-r"><a class="btn quiet hide-sm" href="app.html#rebuild">組み立て直す</a><button type="button" class="btn act-sheet hide-sm">図面・指示書</button><button type="button" class="btn primary act-stl">STL</button><button type="button" class="book-btn">帳面<i class="book-n"></i></button></div>
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
    <div class="vp-tl"><b class="vp-view">斜め</b><div class="disp" role="group" aria-label="表示">${(["wire", "shaded", "render"] as const).map((d) => `<button type="button" data-disp="${d}" aria-pressed="${d === "render"}">${{ wire: "ワイヤー", shaded: "シェード", render: "レンダー" }[d]}</button>`).join("")}</div></div>
    <div class="verdict-chip" hidden></div>
    <div class="intro-stage" hidden><canvas class="intro-photo"></canvas><svg class="intro-line" preserveAspectRatio="none"></svg><p class="intro-cap"></p></div>
  </section>

  <aside class="insp">
    <div class="insp-head"><b class="vp-mode"></b><small class="word-sub"></small></div>
    <div class="pane make-panel">
      <section class="sec"><h4>種類</h4>
        <div class="kinds">
          <button type="button" data-kind="solitaire" aria-pressed="true">${ICON.solitaire}<span><b>一粒石の指輪</b><small>石の写真から</small></span></button>
          <button type="button" data-kind="band" aria-pressed="false">${ICON.band}<span><b>甲丸・平打ちの指輪</b><small>石なし</small></span></button>
          <button type="button" disabled>${ICON.pendant}<span><b>覆輪のペンダント</b><small>石を壁で包む</small></span><span class="soon">次</span></button>
        </div>
        <p class="hint">これから：ピアス・チェーン・パヴェ・ブローチ</p>
      </section>
      <section class="sec band-only" hidden><h4>形</h4><div class="band-ctrl"></div></section>
      <section class="sec solitaire-only"><h4>石</h4>
        <label class="asset stone-card"><canvas class="stone-thumb" width="120" height="120"></canvas><span><b>石の写真</b><small class="stone-sub">—</small></span><span class="act">変える</span><input type="file" accept="image/*" class="stone-file" hidden></label>
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
    <aside class="book-panel" hidden></aside>
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
viewer.onFrame(() => {
  $(".dims").innerHTML = showDims ? dimsSvg(dims, (x, y, z) => viewer.project(x, y, z)) : "";
  $(".gizmo").innerHTML = gizmoSvg(viewer.axes());
});
function setDims(d: Dim[]) {
  dims = d;
  $(".dims").innerHTML = showDims ? dimsSvg(dims, (x, y, z) => viewer.project(x, y, z)) : "";
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
  session = new RingSession(
    { outlineMm: measured.outlineMm, longMm: measured.longMm, widthMm: measured.widthMm, depthMm },
    () => store.ledger(),
    onBuilt,
    (view) => viewer.snapshotFrom(view).split(",")[1],
  );
  // 最初は、決まりごとから作った案（Claude なしでも形が出る）
  const plan = rulePlans(session.stone, corners)[0];
  session.state.style = plan.design.style;
  session.state.height = plan.design.height;
  reason = `${plan.name}：${plan.reason}（決まりごとから）`;
  if (opts.intro) await intro();
  session.build("最初の案");
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
  await wait(1300);
  box.hidden = true;
  box.classList.remove("draw", "out");
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
  $(".sketch-sub").textContent = "読み取ります";
});

// ---- 組めたら：3D・数字・赤い所 ----
function onBuilt(b: Built, _why: string) {
  if (!stone || kind !== "solitaire") return;
  viewer.setRing(b.ring, { color: stone.extraction.color, colorless: stone.extraction.colorless }, b.problems);
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
  // スマホでは、下の板に隠れないよう品を上に寄せる
  viewer.setLift(0);
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
    viewer.setDisplayMode(b.dataset.disp as DisplayMode);
    document.querySelectorAll<HTMLButtonElement>(".disp button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }),
);
// 1〜4 で場面を切り替える（字を書いている間は使わない）
document.addEventListener("keydown", (e) => {
  const el = e.target as HTMLElement;
  if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea")) return;
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
  ol.appendChild(li);
  ol.scrollTop = ol.scrollHeight;
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
  const pass = store.password() || (await askPassword());
  if (!pass) {
    st.textContent = "生むには Claude が要ります。合言葉がないので、決まりごとから作った案を出しています。";
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
function renderCheck() {
  if (kind === "band") return renderBandCheck();
  if (!session?.built) return;
  const b = session.built;
  const s = session.state;
  const probs = grouped(b);
  const box = $(".studio-refine");
  const pick = <T extends string | number>(name: string, cur: T, list: [T, string][]) =>
    `<div class="pick"><span>${name}</span><div>${list.map(([v, l]) => `<button type="button" data-k="${name}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join("")}</div></div>`;
  box.innerHTML = `
    <section class="big-verdict ${probs.length ? "ng" : "ok"}"><b>${probs.length ? "このままでは作れません" : "このまま作れます"}</b><small>${probs.length ? `直す所 ${probs.length}` : `爪・留まり・すき間・角、すべて目安の内側`}</small></section>
    ${
      probs.length
        ? `<ul class="probs">${probs
            .map(
              ({ p, n }, i) => `<li><div class="p-head"><b>${esc(SHORT[p.check] ?? p.where)}</b>${n > 1 ? `<small>${n} か所</small>` : ""}</div>
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
    <button type="button" class="next-btn to-build">作り方を見る →</button>`;
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
function applyFix(id: string) {
  const s = session!.state;
  const std = session!.built!.ring.setting.standardProngMm;
  switch (id) {
    case "raise":
      session!.setSetting({ height: s.height === "low" ? "standard" : "high", reason: "直し方から" });
      break;
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
      if (!m) return `<li>${withTerms(esc(d.text), seen)}</li>`;
      const head = m[1] === last ? "" : `<li class="sub">${esc(m[1])}</li>`;
      last = m[1];
      return `${head}<li>${withTerms(esc(m[2]), seen)}</li>`;
    })
    .join("");
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
      }${tools.length ? `<div class="tools-row">${tools.map((t) => `<button type="button" class="tool-chip" data-tool="${t.id}">${esc(t.name)}</button>`).join("")}</div>` : ""}</div></li>`;
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
function howInput(b: Built) {
  return { ring: b.ring, outlineMm: stone!.measured.outlineMm, longMm: stone!.measured.longMm, widthMm: stone!.measured.widthMm, depthMm: stone!.depthMm, metalLabel: METAL_LABEL[session!.state.metal], alloy: alloyOf(session!.state.metal) };
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

// ---- 帳面：職人が声で決まりを足すと、その場で確かめが変わる ----
function bookCount() {
  const n = activeRules(store.ledger()).filter((r) => r.source.kind === "craftsman").length;
  $(".book-n").textContent = String(n);
}
$(".book-btn").addEventListener("click", () => {
  const p = $(".book-panel");
  p.hidden = !p.hidden;
  if (!p.hidden) renderBook();
});
function renderBook() {
  const rules = activeRules(store.ledger());
  const mine = rules.filter((r) => r.source.kind === "craftsman");
  const others = rules.filter((r) => r.source.kind !== "craftsman");
  const name = masterName(store.ledger());
  const item = (r: Rule) => `<li class="${r.source.kind}"><b>${esc(r.title)}</b><p>${esc(r.text)}</p>${r.quote ? `<p class="q">「${esc(r.quote)}」</p>` : ""}<small>${esc(sourceLabel(r.source))} ・ ${esc(r.date)}</small></li>`;
  $(".book-panel").innerHTML = `<div class="bp-head"><h3>帳面</h3><button type="button" class="ghost-d bp-close">閉じる</button></div>
    <div class="add-rule">
      <p class="tech-what">${esc(name)}さんが話すと、決まりになって、今の設計の確かめにすぐ効きます。</p>
      <textarea rows="2" class="ar-text" placeholder="${canListen() ? "マイクを押して話す（例：石の下と指の間は 1 mm は空ける。汗がたまるから）" : "決まりを書く"}"></textarea>
      <div class="row"><button type="button" class="ghost-d ar-mic">話す</button><button type="button" class="primary ar-go">決まりにする</button></div>
      <div class="ar-proposal"></div>
    </div>
    <h4>${esc(name)}さんの決まり（${mine.length}）</h4><ul class="rules-l">${mine.map(item).join("")}</ul>
    <h4>公開情報の目安（${others.length}）</h4><ul class="rules-l">${others.map(item).join("")}</ul>
    <h4>ほかの道具</h4><p class="tech-what"><a class="link" href="app.html#rebuild">組み立て直す（途切れた技を、手がかりから）</a><br><a class="link" href="app.html#keep">残す（職人が手本を撮る・質問に答える）</a><br><a class="link" href="cad.html">技法の面（木目金・魚々子・布目象嵌・鎚目）</a></p>`;
  $(".bp-close").addEventListener("click", () => ($(".book-panel").hidden = true));
  const field = $<HTMLTextAreaElement>(".ar-text");
  const voice = bindVoice($<HTMLButtonElement>(".ar-mic"), field);
  $(".ar-go").addEventListener("click", () => {
    voice.stop();
    void addRuleFromWords(field.value.trim());
  });
}
async function addRuleFromWords(said: string) {
  if (!said) return;
  const name = masterName(store.ledger());
  const slot = $(".ar-proposal");
  const pass = store.password() || (await askPassword());
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
    slot.innerHTML = `<div class="proposal-d"><b>${esc(p.title)}</b><p>${esc(p.text)}</p><p class="tech-what">なぜ：${esc(p.reason)}</p>${p.param ? `<p class="tech-what">値：${p.value}</p>` : ""}
      <div class="row"><button type="button" class="primary ok">これでいい</button><button type="button" class="ghost-d no">いらない</button></div></div>`;
    slot.querySelector(".no")!.addEventListener("click", () => {
      slot.innerHTML = "";
      resolve({ status: "declined", note: "職人が見送った" });
    });
    slot.querySelector(".ok")!.addEventListener("click", () => {
      const before = session?.built?.problems.length ?? 0;
      const next = addRule(store.ledger(), { title: p.title, text: p.text, reason: p.reason, example: p.example, quote: p.quote, param: p.param, value: p.value, bySize: p.by_size?.map((x) => ({ upToMm: x.up_to_mm, value: x.value })), source: { kind: "craftsman", name }, date: today() });
      store.setLedger(next);
      const id = next.rules[next.rules.length - 1].id;
      resolve({ status: "accepted", rule_id: id });
      const after = session ? session.build("帳面が変わった").problems.length : 0;
      toast(p.param ? `${name}さんの決まりで確かめ直しました：作れない所 ${before} → ${after}` : `${name}さんの決まりを帳面に足しました`);
      bookCount();
      renderBook();
    });
  });
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
  const pass = store.password() || (await askPassword());
  if (!pass) {
    st.textContent = "生むには Claude が要ります。左の数字で手で作れます。";
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
}
function solitaireData(): WorkData {
  const b = session!.built!;
  const r = b.ring;
  const st = r.setting;
  return {
    title: `${stone!.shapeName}の一粒石の指輪`,
    kind: "一粒石の指輪",
    specs: [
      { label: "石", value: `${stone!.measured.longMm.toFixed(2)} × ${stone!.measured.widthMm.toFixed(2)} × ${stone!.depthMm.toFixed(2)} mm` },
      { label: "号", value: `${session!.state.gou} 号 ・ 内径 ${r.shank.innerDiameterMm.toFixed(1)} mm` },
      { label: "留め方", value: st.style === "bezel" ? `覆輪 ・ 壁 ${st.bezel?.wallMm.toFixed(2)} mm` : `爪 ${st.prongs.length} ・ ø ${st.prongs[0]?.diameterMm.toFixed(2)} mm` },
      { label: "腕", value: `${r.shank.widthMm.toFixed(1)} × ${r.shank.thicknessMm.toFixed(1)} mm` },
      { label: "石と指のすき間", value: `${r.culetGapMm.toFixed(2)} mm` },
      { label: "地金", value: `${METAL_LABEL[session!.state.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g` },
    ],
    problems: grouped(b).map(({ p }) => `${SHORT[p.check] ?? p.where}（${p.current} → ${p.required}）`),
    steps: howToMake(howInput(b), method),
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
    <label>ひとこと（気をつけたこと・次の人へ）<textarea rows="2" class="w-note" placeholder="例：角は V 字の爪で守った。座は浅めに"></textarea></label>
    <div class="row"><button type="button" class="ghost-d w-mic">話す</button><button type="button" class="primary w-save">記録する</button></div>
  </div>`;
  const note = slot.querySelector<HTMLTextAreaElement>(".w-note")!;
  const voice = bindVoice(slot.querySelector<HTMLButtonElement>(".w-mic")!, note);
  slot.querySelector(".w-save")!.addEventListener("click", () => {
    voice.stop();
    const ok = saveWork({
      id: newWorkId(),
      date: today(),
      title: data.title,
      kind: data.kind,
      methodLabel: method === "hand" ? "鍛造" : "鋳造",
      image: thumbnail(),
      specs: data.specs,
      problems: data.problems,
      steps: data.steps,
      note: note.value.trim(),
      maker: slot.querySelector<HTMLInputElement>(".w-maker")!.value.trim(),
    });
    slot.innerHTML = ok ? `<p class="saved">記録しました（${loadWorks().length} 作品目）。<button type="button" class="link to-works">記録を見る →</button></p>` : `<p class="build-warn">このブラウザにはもう入りません。</p>`;
    slot.querySelector(".to-works")?.addEventListener("click", () => setMode("works"));
  });
}
function renderWorks() {
  const box = $(".works-panel");
  const works = loadWorks();
  box.innerHTML = `
    <section class="works-head"><b>${works.length} 作品</b><small>作るたびに、形・作れるか・作り方・ひとことが残ります。</small></section>
    ${works.length ? `<button type="button" class="primary w-print">記録の帳面を印刷</button>` : `<p class="tech-what">まだ記録がありません。「作る。」の下の「この作品の記録を残す」から残せます。</p>`}
    <ul class="works-list">${works
      .map(
        (w) => `<li><img alt="" src="${w.image}"><div><b>${esc(w.title)}</b><small>${esc(w.date)}${w.maker ? ` ・ ${esc(w.maker)}` : ""} ・ ${esc(w.methodLabel)}</small>${w.note ? `<p>「${esc(w.note)}」</p>` : ""}<span class="${w.problems.length ? "ng" : "ok"}">${w.problems.length ? "作れない所あり" : "作れる形"}</span></div><button type="button" class="w-del" data-id="${w.id}" aria-label="消す">×</button></li>`,
      )
      .join("")}</ul>`;
  box.querySelector(".w-print")?.addEventListener("click", () => openPrint(worksBookHtml(loadWorks(), today())));
  box.querySelectorAll<HTMLButtonElement>(".w-del").forEach((b) =>
    b.addEventListener("click", () => {
      removeWork(b.dataset.id!);
      renderWorks();
    }),
  );
}

setMode("make");
bookCount();
void loadSample().catch((e) => ($(".make-status").textContent = `見本の石を読めませんでした：${(e as Error).message}`));
(window as unknown as { __studio: unknown }).__studio = { get session() { return session; }, setMode };
