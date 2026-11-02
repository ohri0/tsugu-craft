// かんたん CAD：生む。（言葉から形）→ 整える。（点を動かす・断面を描く・技法・彫る）→ 渡す。（3D データ・図面・作り方）
// 黒い撮影台の真ん中に品を置き、言葉と数字は少なく、静かに。
import "../app/app.css";
import "./cad.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { studioScene } from "../ui/viewer";
import { callTool } from "../rebuild/run";
import { askPassword, resetPassword } from "../app/password";
import { esc, store } from "../app/store";
import { ledgerText } from "../rules/ledger";
import { MAKE_DESIGN, designFromTool, designPrompt } from "./design";
import { mountOutlineEditor, mountSectionEditor, type EditMode } from "./editor2d";
import { FORMS, outline, type FormId } from "./forms";
import { DENSITY, buildDesign, measureOutline, newDesign, outlineOf, type Design } from "./model";
import { SECTION_PRESETS, innerDiameterOf, meshVolume, toStl } from "./solid";
import { DEFAULT_PARAMS, METALS, MOKUME_PALETTES, TECHNIQUES, makeSurface, type MetalId, type Surface, type TechniqueId } from "./techniques";

type Mode = "make" | "refine" | "hand";
type Tab = "shape" | "tech" | "engrave";
const MODES: { id: Mode; word: string; sub: string }[] = [
  { id: "make", word: "生む。", sub: "言葉から形へ" },
  { id: "refine", word: "整える。", sub: "点を動かし、技法を選ぶ" },
  { id: "hand", word: "渡す。", sub: "3D データと図面" },
];
const EXAMPLES = ["銅と赤銅の木目金で、梅の帯留め", "赤銅に魚々子を打った、丸いペンダント", "鉄に金の布目象嵌、角丸の鍔の地板", "銀の鎚目の、幅広の平打ちの指輪"];

let d: Design = initial();
let tab: Tab = "shape";
let ringSide: "top" | "bottom" = "top";
const history: Design[] = [];

function initial(): Design {
  const x = newDesign("ume", 30, 2);
  x.name = "木目金の梅";
  return x;
}

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="cad dark">
  <div class="gl"></div>
  <header class="cad-top">
    <a class="brand" href="./"><span class="seal">継</span><span class="name">継ぐ</span></a>
    <nav class="modes">${MODES.map((m) => `<button type="button" data-mode="${m.id}">${m.word}</button>`).join("")}</nav>
  </header>
  <div class="word"><h1></h1><p class="word-sub"></p><p class="word-name"></p></div>
  <dl class="specs"></dl>
  <div class="reason" hidden></div>
  <p class="busy" hidden><span class="pulse"></span><span class="busy-t"></span></p>
  <div class="make-bar">
    <form class="prompt"><input type="text" placeholder="どんな品を作りますか" aria-label="作りたい品"><button type="submit">生む</button></form>
    <div class="ideas"></div>
    <p class="make-status"></p>
  </div>
  <aside class="refine-panel" hidden>
    <div class="tabs-cad" role="tablist">
      <button type="button" data-tab="shape">形</button><button type="button" data-tab="tech">技法</button><button type="button" data-tab="engrave">彫る</button>
    </div>
    <div class="tab-body"></div>
  </aside>
  <div class="hand-panel" hidden></div>
</div>`;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

// ---- 3D：黒い撮影台 ----
const host = $(".gl");
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studioScene(), 0.015).texture;
scene.background = stageTexture();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 2000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotateSpeed = 0.9;
const content = new THREE.Group();
scene.add(content);
const rim = new THREE.DirectionalLight(0xfff4e0, 1.4);
rim.position.set(-30, 40, 30);
scene.add(rim);
let dirty = true;
controls.addEventListener("change", () => (dirty = true));
/** スマホで下から板が出ている間は、品を上に寄せて見せる */
let lift = 0;
let framedFor = "";
function resize() {
  const w = host.clientWidth || 1;
  const h = host.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (lift > 0) camera.setViewOffset(w, h, 0, h * lift, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(() => {
  resize();
  framedFor = "";
  frame();
}).observe(host);
(function loop() {
  if (controls.update() || dirty) {
    renderer.render(scene, camera);
    dirty = false;
  }
  requestAnimationFrame(loop);
})();

function stageTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(256, 230, 10, 256, 256, 400);
  grad.addColorStop(0, "#2a2724");
  grad.addColorStop(1, "#0b0a09");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- 形を作って置く ----
let surfaceKey = "";
let surface: Surface | null = null;
let mesh: THREE.Mesh | null = null;
let lastVolume = 0;

function texture(c: HTMLCanvasElement, srgb: boolean, s: Surface) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / s.widthMm, 1 / s.heightMm);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function build(coarse = false) {
  const b = buildDesign(d, coarse);
  let geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(b.positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(b.uvs, 2));
  if (b.indices) geo.setIndex(new THREE.BufferAttribute(b.indices, 1));
  else if (!coarse) geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  const k = JSON.stringify([d.tech, d.metal, d.palette, d.tp]);
  if (k !== surfaceKey) {
    surface = makeSurface(d.tech, d.metal, d.tp, MOKUME_PALETTES[d.palette].colors);
    surfaceKey = k;
  }
  const s = surface!;
  // 粒・叩きは形そのものに入っているので、凹凸の絵は使わない
  const realRelief = d.tech === "nanako" || d.tech === "tsuchime";
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: texture(s.color, true, s),
    bumpMap: s.bump && !realRelief ? texture(s.bump, false, s) : null,
    bumpScale: 1.2,
    metalness: s.metalness,
    roughness: realRelief ? Math.min(0.25, s.roughness) : s.roughness,
    clearcoat: d.tech === "plain" ? 0.4 : 0.1,
    side: THREE.DoubleSide,
  });
  if (mesh) {
    content.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  mesh = new THREE.Mesh(geo, mat);
  if (d.kind === "plate") mesh.rotation.x = Math.PI * 0.32;
  content.add(mesh);
  if (!coarse) {
    // 体積：番号つき（指輪）は三角形に開いて測る
    let tris = b.positions;
    if (b.indices) {
      tris = new Float32Array(b.indices.length * 3);
      b.indices.forEach((v, i) => tris.set(b.positions.subarray(v * 3, v * 3 + 3), i * 3));
    }
    lastVolume = Math.abs(meshVolume(tris));
  }
  frame();
  dirty = true;
  specs();
}

function frame() {
  if (!mesh) return;
  const fk = `${d.kind}-${d.shape}-${lift}`;
  if (framedFor === fk) return;
  framedFor = fk;
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3()).length();
  const c = box.getCenter(new THREE.Vector3());
  controls.target.copy(c);
  const dir = d.kind === "ring" ? new THREE.Vector3(0.95, -1.15, 0.55) : new THREE.Vector3(0.25, -1.3, 0.35);
  const fit = camera.aspect < 1 ? Math.min(2.2, 1 / camera.aspect) : 1;
  camera.position.copy(c).add(dir.normalize().multiplyScalar(size * 2.3 * fit));
  camera.near = size / 50;
  camera.far = size * 50;
  camera.updateProjectionMatrix();
  dirty = true;
}

// ---- 数字（少なく、単位つき） ----
function weightG() {
  const m = d.tech === "mokume" ? "copper" : d.metal;
  return (lastVolume / 1000) * DENSITY[m];
}
function specs() {
  const t = TECHNIQUES.find((x) => x.id === d.tech)!;
  const metal = d.tech === "mokume" ? MOKUME_PALETTES[d.palette].name : METALS[d.metal].name;
  const rows: [string, string][] = [
    ["技法", t.name],
    [d.tech === "mokume" ? "重ねる金属" : "地金", metal],
  ];
  if (d.kind === "ring") {
    rows.push(["号", `${d.gou} 号 ・ 内径 ${innerDiameterOf(d.gou).toFixed(1)} mm`]);
    rows.push(["断面 上 ・ 下", `${d.top.width.toFixed(1)}×${d.top.thickness.toFixed(1)} ・ ${d.bottom.width.toFixed(1)}×${d.bottom.thickness.toFixed(1)} mm`]);
  } else {
    const m = measureOutline(outlineOf(d));
    rows.push(["大きさ", `${m.width.toFixed(1)} × ${m.height.toFixed(1)} mm`]);
    rows.push(["厚み", `${d.thickness.toFixed(1)} mm${d.engraves.length ? ` ・ 毛彫り ${d.engraves.length} 本` : ""}`]);
  }
  rows.push(...techSpec());
  rows.push(["重さ", `約 ${weightG().toFixed(1)} g`]);
  $(".specs").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  $(".word-name").textContent = d.name || autoName();
}
function techSpec(): [string, string][] {
  const p = d.tp;
  switch (d.tech) {
    case "mokume":
      return [["層 ・ 彫る深さ", `${p.layers} 層 ・ ${Math.round(p.depth * 100)}%`]];
    case "nanako":
      return [["粒 ・ 間", `ø ${p.dotMm} ・ ${p.pitchMm} mm`]];
    case "nunome":
      return [["刻み ・ 模様", `${p.hatchMm} ・ ${p.motifMm} mm`]];
    case "tsuchime":
      return [["叩き", `${p.dentMm} mm`]];
    default:
      return [];
  }
}
function autoName(): string {
  const t = TECHNIQUES.find((x) => x.id === d.tech)!;
  const f = FORMS.find((x) => x.id === d.shape)!;
  return `${t.name}の${f.name}`;
}

// ---- 重い作り直しは、少し待ってから（点を動かしている間は粗い下書き） ----
let timer = 0;
function rebuild(live: boolean) {
  if (live) {
    build(true);
    return;
  }
  clearTimeout(timer);
  busy(true, "形を作っています…");
  timer = window.setTimeout(() => {
    build(false);
    busy(false);
  }, 30);
}
function busy(on: boolean, text = "") {
  $(".busy").hidden = !on;
  $(".busy-t").textContent = text;
}

// ---- 場面 ----
function setMode(m: Mode) {
  const w = MODES.find((x) => x.id === m)!;
  $(".word h1").textContent = w.word;
  $(".word-sub").textContent = w.sub;
  document.querySelectorAll<HTMLButtonElement>(".modes button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.mode === m)));
  $(".make-bar").hidden = m !== "make";
  $(".refine-panel").hidden = m !== "refine";
  $(".hand-panel").hidden = m !== "hand";
  $(".cad").setAttribute("data-mode", m);
  $(".reason").style.display = m === "make" ? "" : "none";
  controls.autoRotate = m === "make";
  lift = m === "refine" && window.innerWidth <= 760 ? 0.24 : 0;
  resize();
  framedFor = "";
  frame();
  if (m === "refine") renderTab();
  if (m === "hand") renderHand();
}
document.querySelectorAll<HTMLButtonElement>(".modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode as Mode)));

// ---- 生む。 ----
$(".ideas").innerHTML = EXAMPLES.map((e) => `<button type="button">${esc(e)}</button>`).join("");
document.querySelectorAll<HTMLButtonElement>(".ideas button").forEach((b) =>
  b.addEventListener("click", () => {
    $<HTMLInputElement>(".prompt input").value = b.textContent ?? "";
    void make();
  }),
);
$(".prompt").addEventListener("submit", (e) => {
  e.preventDefault();
  void make();
});
let making = false;
async function make() {
  const text = $<HTMLInputElement>(".prompt input").value.trim();
  if (!text || making) return;
  const st = $(".make-status");
  const pass = store.password() || (await askPassword());
  if (!pass) {
    st.textContent = "生むには Claude が要ります。合言葉を入れてください（整える。では手で作れます）。";
    return;
  }
  making = true;
  st.innerHTML = `<span class="pulse"></span> Claude が形を考えています…`;
  const r = await callTool<Design>({ system: designPrompt(ledgerText(store.ledger())), user: text, tool: MAKE_DESIGN, parse: (x) => designFromTool(x, d.tp.seed), password: pass });
  making = false;
  if (!r.ok) {
    if (r.code === "wrong_password") resetPassword();
    st.textContent = r.error;
    return;
  }
  history.push(d);
  d = r.value;
  framedFor = "";
  rebuild(false);
  st.textContent = r.remaining !== undefined ? `今日あと ${r.remaining} 回` : "";
  showReason();
}
function showReason() {
  const box = $(".reason");
  box.hidden = !d.reason;
  box.innerHTML = d.reason
    ? `<p>${esc(d.reason)}</p><button type="button" class="link to-refine">整える →</button>${history.length ? `<button type="button" class="link undo">ひとつ前に戻す</button>` : ""}`
    : "";
  box.querySelector(".to-refine")?.addEventListener("click", () => setMode("refine"));
  box.querySelector(".undo")?.addEventListener("click", () => {
    d = history.pop()!;
    framedFor = "";
    rebuild(false);
    showReason();
  });
}

// ---- 整える。 ----
document.querySelectorAll<HTMLButtonElement>(".tabs-cad button").forEach((b) =>
  b.addEventListener("click", () => {
    tab = b.dataset.tab as Tab;
    renderTab();
  }),
);

function formIcon(id: FormId): string {
  if (id === "ring") return `<svg viewBox="-12 -12 24 24"><circle r="8.5" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>`;
  const pts = outline(id, 20);
  return `<svg viewBox="-12 -12 24 24"><path d="M${pts.map((p) => `${p.x.toFixed(1)} ${(-p.y).toFixed(1)}`).join("L")}Z" fill="currentColor"/></svg>`;
}
const swatches = new Map<TechniqueId, string>();
function swatch(t: TechniqueId): string {
  if (swatches.has(t)) return swatches.get(t)!;
  const s = makeSurface(t, TECHNIQUES.find((x) => x.id === t)!.metals[0], { ...DEFAULT_PARAMS }, MOKUME_PALETTES[0].colors);
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d")!;
  const mm = t === "mokume" ? 16 : t === "nunome" ? 10 : t === "tsuchime" ? 10 : 6;
  const pxmm = s.color.width / s.widthMm;
  g.drawImage(s.color, 0, 0, Math.min(s.color.width, mm * pxmm), Math.min(s.color.height, mm * pxmm), 0, 0, 96, 96);
  const url = c.toDataURL();
  swatches.set(t, url);
  return url;
}

interface Slider {
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  get: () => number;
  set: (v: number) => void;
}
const fmt = (v: number, s: Slider) => (s.unit === "%" ? `${Math.round(v * 100)}%` : `${Number(v.toFixed(2))}${s.unit}`);
function sliders(list: Slider[]): string {
  return `<div class="sliders">${list.map((s, i) => `<label><span>${s.label}</span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.get()}" data-si="${i}"><output>${fmt(s.get(), s)}</output></label>`).join("")}</div>`;
}
function wireSliders(box: HTMLElement, list: Slider[], after?: () => void) {
  box.querySelectorAll<HTMLInputElement>("input[data-si]").forEach((inp) => {
    const s = list[Number(inp.dataset.si)];
    inp.addEventListener("input", () => {
      s.set(Number(inp.value));
      inp.nextElementSibling!.textContent = fmt(s.get(), s);
      after?.();
      rebuild(true);
    });
    inp.addEventListener("change", () => rebuild(false));
  });
}

let planEditor: ReturnType<typeof mountOutlineEditor> | null = null;

function renderTab() {
  if (tab === "engrave" && d.kind === "ring") tab = "shape";
  document.querySelectorAll<HTMLButtonElement>(".tabs-cad button").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    b.hidden = b.dataset.tab === "engrave" && d.kind === "ring";
  });
  const body = $(".tab-body");
  planEditor = null;
  if (tab === "shape") {
    body.innerHTML = `<section><h3>元の形</h3><div class="forms">${FORMS.map((f) => `<button type="button" data-f="${f.id}" aria-pressed="${f.id === d.shape}"><span class="ico">${formIcon(f.id)}</span><b>${f.name}</b></button>`).join("")}</div></section>
      <section class="editor-sec"></section><section class="size-sec"></section>`;
    body.querySelectorAll<HTMLButtonElement>(".forms button").forEach((b) =>
      b.addEventListener("click", () => {
        const f = b.dataset.f as FormId;
        const keep = { tech: d.tech, metal: d.metal, palette: d.palette, tp: d.tp };
        const size = d.kind === "plate" ? measureOutline(outlineOf(d)).long : 30;
        d = { ...newDesign(f, f === "ring" ? 30 : size, d.kind === "plate" ? d.thickness : 2), ...keep, name: "" };
        framedFor = "";
        renderTab();
        rebuild(false);
      }),
    );
    if (d.kind === "plate") shapePlate(body);
    else shapeRing(body);
  } else if (tab === "tech") {
    techTab(body);
  } else {
    engraveTab(body);
  }
}

function shapePlate(body: HTMLElement) {
  const ed = body.querySelector<HTMLElement>(".editor-sec")!;
  ed.innerHTML = `<h3>図面（上から）</h3><div class="plan-host"></div>`;
  planEditor = mountOutlineEditor(ed.querySelector(".plan-host")!, () => d, (live) => rebuild(live), (): EditMode => "shape");
  planEditor.refresh();
  let base = measureOutline(outlineOf(d)).long;
  const list: Slider[] = [
    {
      label: "大きさ",
      min: 10,
      max: 70,
      step: 0.5,
      unit: " mm",
      get: () => Math.round(measureOutline(outlineOf(d)).long * 2) / 2,
      set: (v) => {
        const k = v / base;
        d.ctrl = d.ctrl.map((p) => ({ x: p.x * k, y: p.y * k }));
        d.engraves = d.engraves.map((l) => l.map((p) => ({ x: p.x * k, y: p.y * k })));
        base = v;
      },
    },
    { label: "厚み", min: 0.8, max: 6, step: 0.1, unit: " mm", get: () => d.thickness, set: (v) => ((d.thickness = v), (d.edgeRadius = Math.min(d.edgeRadius, v * 0.45))) },
    { label: "ふちの丸め", min: 0, max: 1.5, step: 0.05, unit: " mm", get: () => d.edgeRadius, set: (v) => (d.edgeRadius = Math.min(v, d.thickness * 0.45)) },
  ];
  const sz = body.querySelector<HTMLElement>(".size-sec")!;
  sz.innerHTML = `<h3>大きさ</h3>${sliders(list)}`;
  wireSliders(sz, list, () => planEditor?.refresh());
}

function shapeRing(body: HTMLElement) {
  const ed = body.querySelector<HTMLElement>(".editor-sec")!;
  const sec = () => (ringSide === "top" ? d.top : d.bottom);
  ed.innerHTML = `<h3>断面</h3>
    <div class="seg"><button type="button" data-side="top">上（飾りの側）</button><button type="button" data-side="bottom">下（手のひらの側）</button></div>
    <div class="sec-host"></div>
    <div class="row presets">${(["kouman", "hirauchi", "kamaboko"] as const).map((k) => `<button type="button" class="chip-d" data-p="${k}">${{ kouman: "甲丸", hirauchi: "平打ち", kamaboko: "かまぼこ" }[k]}</button>`).join("")}</div>`;
  ed.querySelectorAll<HTMLButtonElement>(".seg button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.side === ringSide));
    b.addEventListener("click", () => ((ringSide = b.dataset.side as "top" | "bottom"), renderTab()));
  });
  const se = mountSectionEditor(ed.querySelector(".sec-host")!, sec, (live) => rebuild(live), () => (ringSide === "top" ? "上" : "下"));
  se.refresh();
  ed.querySelectorAll<HTMLButtonElement>(".presets button").forEach((b) =>
    b.addEventListener("click", () => {
      const s = sec();
      s.crown = SECTION_PRESETS[b.dataset.p as "kouman"](s.width, s.thickness).crown;
      se.refresh();
      rebuild(false);
    }),
  );
  const list: Slider[] = [
    { label: "号", min: 3, max: 30, step: 1, unit: " 号", get: () => d.gou, set: (v) => (d.gou = v) },
    { label: "幅", min: 1.5, max: 15, step: 0.1, unit: " mm", get: () => sec().width, set: (v) => (sec().width = v) },
    { label: "厚み", min: 0.8, max: 4, step: 0.1, unit: " mm", get: () => sec().thickness, set: (v) => (sec().thickness = v) },
    { label: "上の断面の広さ", min: 0, max: 300, step: 5, unit: "°", get: () => d.blendDeg, set: (v) => (d.blendDeg = v) },
  ];
  const sz = body.querySelector<HTMLElement>(".size-sec")!;
  sz.innerHTML = `<h3>大きさ</h3>${sliders(list)}<p class="tech-what">上と下で断面を変えると、その間はなめらかにつながります。</p>`;
  wireSliders(sz, list, () => se.refresh());
}

function techTab(body: HTMLElement) {
  const t = TECHNIQUES.find((x) => x.id === d.tech)!;
  const tp = d.tp;
  const techList: Record<TechniqueId, Slider[]> = {
    plain: [],
    mokume: [
      { label: "層の数", min: 4, max: 40, step: 1, unit: " 層", get: () => tp.layers, set: (v) => (tp.layers = v) },
      { label: "彫る深さ", min: 0.1, max: 0.95, step: 0.05, unit: "%", get: () => tp.depth, set: (v) => (tp.depth = v) },
      { label: "彫る数", min: 4, max: 40, step: 1, unit: " か所", get: () => tp.pits, set: (v) => (tp.pits = v) },
    ],
    nanako: [
      { label: "粒の大きさ", min: 0.2, max: 1.2, step: 0.05, unit: " mm", get: () => tp.dotMm, set: (v) => ((tp.dotMm = v), (tp.pitchMm = Math.max(tp.pitchMm, v * 1.05))) },
      { label: "粒の間", min: 0.25, max: 1.6, step: 0.05, unit: " mm", get: () => tp.pitchMm, set: (v) => (tp.pitchMm = Math.max(v, tp.dotMm * 1.05)) },
    ],
    nunome: [
      { label: "刻み目の間", min: 0.1, max: 0.6, step: 0.05, unit: " mm", get: () => tp.hatchMm, set: (v) => (tp.hatchMm = v) },
      { label: "模様の大きさ", min: 3, max: 16, step: 1, unit: " mm", get: () => tp.motifMm, set: (v) => (tp.motifMm = v) },
    ],
    tsuchime: [{ label: "叩きの大きさ", min: 1, max: 5, step: 0.2, unit: " mm", get: () => tp.dentMm, set: (v) => (tp.dentMm = v) }],
  };
  const metalsHtml =
    d.tech === "mokume"
      ? MOKUME_PALETTES.map((p, i) => `<button type="button" data-p="${i}" aria-pressed="${i === d.palette}"><span class="dots">${p.colors.slice(0, 3).map((c) => `<i style="background:${c}"></i>`).join("")}</span>${p.name}</button>`).join("")
      : t.metals
          .concat((["k18", "pt", "sv", "copper", "shakudo", "shibuichi", "iron"] as MetalId[]).filter((m) => !t.metals.includes(m)))
          .map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === d.metal}"><span class="dots"><i style="background:${METALS[m].color}"></i></span>${METALS[m].name}</button>`)
          .join("");
  body.innerHTML = `<section><h3>技法</h3><div class="techs-grid">${TECHNIQUES.map((x) => `<button type="button" data-t="${x.id}" aria-pressed="${x.id === d.tech}"><img alt="" src="${swatch(x.id)}"><b>${x.name}</b></button>`).join("")}</div><p class="tech-what">${esc(t.what)}</p></section>
    <section><h3>${d.tech === "mokume" ? "重ねる金属" : "地金"}</h3><div class="metals">${metalsHtml}</div></section>
    ${techList[d.tech].length ? `<section class="tsl"><h3>技法の細かさ</h3>${sliders(techList[d.tech])}${d.tech === "mokume" ? `<button type="button" class="link reseed">彫る場所を変える</button>` : ""}</section>` : ""}
    <section><h3>職人の決まり</h3><p class="tech-what">${esc(t.name)}の決まりは、まだ帳面にありません。職人に聞いて残すと、ここで確かめられます。</p></section>`;
  body.querySelectorAll<HTMLButtonElement>(".techs-grid button").forEach((b) =>
    b.addEventListener("click", () => {
      d.tech = b.dataset.t as TechniqueId;
      const tt = TECHNIQUES.find((x) => x.id === d.tech)!;
      if (!tt.metals.includes(d.metal)) d.metal = tt.metals[0];
      d.name = "";
      renderTab();
      rebuild(false);
    }),
  );
  body.querySelectorAll<HTMLButtonElement>(".metals button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.p) d.palette = Number(b.dataset.p);
      if (b.dataset.m) d.metal = b.dataset.m as MetalId;
      renderTab();
      rebuild(false);
    }),
  );
  const tsl = body.querySelector<HTMLElement>(".tsl");
  if (tsl) wireSliders(tsl, techList[d.tech]);
  body.querySelector(".reseed")?.addEventListener("click", () => ((tp.seed += 1), rebuild(false)));
}

function engraveTab(body: HTMLElement) {
  body.innerHTML = `<section><h3>毛彫り（線を彫る）</h3><div class="plan-host"></div>
    <div class="row"><button type="button" class="chip-d undo-line">最後の線を消す</button><button type="button" class="chip-d clear-lines">全部消す</button></div></section>
    <section class="esl"></section>`;
  planEditor = mountOutlineEditor(body.querySelector(".plan-host")!, () => d, (live) => rebuild(live), (): EditMode => "engrave");
  planEditor.refresh();
  const list: Slider[] = [
    { label: "線の幅", min: 0.15, max: 1.2, step: 0.05, unit: " mm", get: () => d.engraveWidth, set: (v) => (d.engraveWidth = v) },
    { label: "線の深さ", min: 0.03, max: 0.5, step: 0.01, unit: " mm", get: () => d.engraveDepth, set: (v) => (d.engraveDepth = v) },
  ];
  const esl = body.querySelector<HTMLElement>(".esl")!;
  esl.innerHTML = `<h3>溝の大きさ</h3>${sliders(list)}<p class="tech-what">V 字の溝として、形そのものに彫ります（3D データにも入ります）。</p>`;
  wireSliders(esl, list);
  body.querySelector(".undo-line")!.addEventListener("click", () => (d.engraves.pop(), planEditor?.redraw(), rebuild(false)));
  body.querySelector(".clear-lines")!.addEventListener("click", () => ((d.engraves = []), planEditor?.redraw(), rebuild(false)));
}

// ---- 渡す。 ----
function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function renderHand() {
  const img = renderer.domElement.toDataURL("image/png");
  const t = TECHNIQUES.find((x) => x.id === d.tech)!;
  $(".hand-panel").innerHTML = `<div class="sheet-preview">
    <img alt="" src="${img}">
    <div><h3>${esc(d.name || autoName())}</h3><p>${esc(t.what)}</p>
    <div class="row"><button type="button" class="primary stl">3D データ（STL）</button><button type="button" class="ghost-d plan-svg">原寸の図面（SVG）</button></div>
    <p class="note">STL は 3D プリンターや、鋳造の原型づくりにそのまま渡せる、すき間のない形です（単位 mm）。粒・叩き・彫った線も形に入っています。作り方の手順は、これから足します。</p></div>
  </div>`;
  $(".hand-panel .stl").addEventListener("click", () => {
    const b = buildDesign(d);
    download(`${d.name || autoName()}.stl`, toStl(b.positions, b.indices), "model/stl");
  });
  $(".hand-panel .plan-svg").addEventListener("click", () => download(`${d.name || autoName()}_原寸.svg`, planSvg(), "image/svg+xml"));
}

/** 原寸の図面（上から見た輪郭・彫った線・寸法）。印刷は「実際のサイズ」で */
function planSvg(): string {
  if (d.kind === "ring") {
    const id = innerDiameterOf(d.gou);
    const r1 = id / 2;
    const r2 = r1 + d.top.thickness;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${r2 * 2 + 20}mm" height="${r2 * 2 + 30}mm" viewBox="${-r2 - 10} ${-r2 - 20} ${r2 * 2 + 20} ${r2 * 2 + 30}"><circle r="${r1}" fill="none" stroke="#000" stroke-width="0.15"/><circle r="${r2}" fill="none" stroke="#000" stroke-width="0.15"/><text y="${-r2 - 8}" font-size="3" text-anchor="middle">${esc(d.name || autoName())}　${d.gou} 号・内径 ${id.toFixed(1)} mm（原寸）</text></svg>`;
  }
  const out = outlineOf(d);
  const m = measureOutline(out);
  const pad = 10;
  const minX = Math.min(...out.map((p) => p.x)) - pad;
  const maxY = Math.max(...out.map((p) => p.y)) + pad + 8;
  const W = m.width + pad * 2;
  const H = m.height + pad * 2 + 8;
  const path = `M${out.map((p) => `${p.x.toFixed(3)} ${(-p.y).toFixed(3)}`).join("L")}Z`;
  const eng = d.engraves.map((l) => `<polyline points="${l.map((p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(" ")}" fill="none" stroke="#000" stroke-width="0.1"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="${minX} ${-maxY} ${W} ${H}"><path d="${path}" fill="none" stroke="#000" stroke-width="0.15"/>${eng}<text x="${minX + 2}" y="${-maxY + 5}" font-size="3">${esc(d.name || autoName())}　${m.width.toFixed(1)} × ${m.height.toFixed(1)} mm・厚み ${d.thickness} mm（原寸）</text></svg>`;
}

setMode("make");
build();
resize();
