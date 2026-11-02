// かんたん CAD：生む。（言葉から形）→ 整える。（形・技法・大きさ）→ 渡す。（職人への指示書）
// 黒い撮影台の真ん中に品を置き、言葉と数字は少なく、静かに。技法は、その技で見た目ができる仕組みから面を作る。
import "../app/app.css";
import "./cad.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { studioScene } from "../ui/viewer";
import { callTool } from "../rebuild/run";
import { askPassword, resetPassword } from "../app/password";
import { esc, store } from "../app/store";
import { ledgerText } from "../rules/ledger";
import { DEFAULT_DESIGN, MAKE_DESIGN, designFromTool, designPrompt, type Design } from "./design";
import { FORMS, innerDiameter, outline, plateGeometry, ringGeometry, volumeMm3, type FormId } from "./forms";
import { DEFAULT_PARAMS, METALS, MOKUME_PALETTES, TECHNIQUES, makeSurface, type MetalId, type Surface, type TechniqueId } from "./techniques";

/** 比重（g/cm³）。重さの目安 */
const DENSITY: Record<MetalId, number> = { k18: 15.5, pt: 21.4, sv: 10.4, copper: 8.9, shakudo: 9.0, shibuichi: 9.3, iron: 7.9 };

type Mode = "make" | "refine" | "hand";
const MODES: { id: Mode; word: string; sub: string }[] = [
  { id: "make", word: "生む。", sub: "言葉から形へ" },
  { id: "refine", word: "整える。", sub: "形と技法" },
  { id: "hand", word: "渡す。", sub: "職人への指示書" },
];
const EXAMPLES = ["銅と赤銅の木目金で、梅の帯留め", "赤銅に魚々子を打った、丸いペンダント", "鉄に金の布目象嵌、角丸の鍔の地板", "銀の鎚目の、幅広の指輪"];

let d: Design = structuredClone(DEFAULT_DESIGN);
const history: Design[] = [];

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
  <div class="make-bar">
    <form class="prompt"><input type="text" placeholder="どんな品を作りますか" aria-label="作りたい品"><button type="submit">生む</button></form>
    <div class="ideas"></div>
    <p class="make-status"></p>
  </div>
  <aside class="refine-panel" hidden>
    <section><h3>形</h3><div class="forms"></div></section>
    <section><h3>技法</h3><div class="techs-grid"></div><p class="tech-what"></p></section>
    <section><h3 class="metal-h">地金</h3><div class="metals"></div></section>
    <section><h3>大きさ</h3><div class="sliders form-sliders"></div></section>
    <section class="tech-sec"><h3>技法の細かさ</h3><div class="sliders tech-sliders"></div></section>
    <section class="rules-sec"></section>
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
/** スマホで下から板（整える。）が出ている間は、品を上に寄せて見せる */
let lift = 0;
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
  if (content.children.length) build();
}).observe(host);
(function loop() {
  if (controls.update() || dirty) {
    renderer.render(scene, camera);
    dirty = false;
  }
  requestAnimationFrame(loop);
})();

/** 背景：真ん中がわずかに明るい、あたたかい黒 */
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

let surfaceKey = "";
let surface: Surface | null = null;
let framedFor = "";

function texture(c: HTMLCanvasElement, srgb: boolean, s: Surface) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / s.widthMm, 1 / s.heightMm);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function weightG(geo: THREE.BufferGeometry) {
  const m = d.tech === "mokume" ? "copper" : d.metal;
  return (volumeMm3(geo) / 1000) * DENSITY[m];
}

function build() {
  const geo = d.form === "ring" ? ringGeometry(d.fp) : plateGeometry(d.form, d.fp);
  const k = JSON.stringify([d.tech, d.metal, d.palette, d.tp]);
  if (k !== surfaceKey) {
    surface = makeSurface(d.tech, d.metal, d.tp, MOKUME_PALETTES[d.palette].colors);
    surfaceKey = k;
  }
  const s = surface!;
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: texture(s.color, true, s),
    bumpMap: s.bump ? texture(s.bump, false, s) : null,
    bumpScale: d.tech === "nanako" ? 3 : d.tech === "tsuchime" ? 6 : 1.2,
    metalness: s.metalness,
    roughness: s.roughness,
    clearcoat: d.tech === "plain" ? 0.4 : 0.1,
  });
  for (const o of [...content.children]) {
    content.remove(o);
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
  const mesh = new THREE.Mesh(geo, mat);
  // 板ものは少し起こして、正面から見えるように（撮影台に立てかけた向き）
  if (d.form !== "ring") mesh.rotation.x = Math.PI * 0.32;
  content.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh);
  const fk = `${d.form}`;
  if (framedFor !== fk) {
    framedFor = fk;
    const size = box.getSize(new THREE.Vector3()).length();
    const c = box.getCenter(new THREE.Vector3());
    controls.target.copy(c);
    const dir = d.form === "ring" ? new THREE.Vector3(0.95, -1.15, 0.55) : new THREE.Vector3(0.25, -1.3, 0.35);
    // 縦長の画面（スマホ）では、横幅に収まるように遠くから
    const fit = camera.aspect < 1 ? 1 / camera.aspect : 1;
    camera.position.copy(c).add(dir.normalize().multiplyScalar(size * 2.3 * Math.min(2.2, fit)));
    camera.near = size / 50;
    camera.far = size * 50;
    camera.updateProjectionMatrix();
  }
  dirty = true;
  specs(geo);
}

// ---- 数字（少なく、単位つき） ----
function specs(geo: THREE.BufferGeometry) {
  const t = TECHNIQUES.find((x) => x.id === d.tech)!;
  const f = FORMS.find((x) => x.id === d.form)!;
  const metal = d.tech === "mokume" ? MOKUME_PALETTES[d.palette].name : METALS[d.metal].name;
  const rows: [string, string][] = [
    ["技法", `${t.name}`],
    [d.tech === "mokume" ? "重ねる金属" : "地金", metal],
    ...(d.form === "ring"
      ? ([
          ["号", `${d.fp.gou} 号 ・ 内径 ${innerDiameter(d.fp.gou).toFixed(1)} mm`],
          ["幅 × 厚み", `${d.fp.ringWidth} × ${d.fp.ringThick} mm`],
        ] as [string, string][])
      : ([
          ["形", f.name],
          ["大きさ × 厚み", `${d.fp.plateSize} × ${d.fp.plateThick} mm`],
        ] as [string, string][])),
    ...techSpec(),
    ["重さ", `約 ${weightG(geo).toFixed(1)} g`],
  ];
  $(".specs").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  $(".word-name").textContent = d.name;
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

// ---- 場面の切り替え ----
function setMode(m: Mode) {
  const w = MODES.find((x) => x.id === m)!;
  $(".word h1").textContent = w.word;
  $(".word-sub").textContent = w.sub;
  document.querySelectorAll<HTMLButtonElement>(".modes button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.mode === m)));
  $(".make-bar").hidden = m !== "make";
  $(".refine-panel").hidden = m !== "refine";
  $(".hand-panel").hidden = m !== "hand";
  document.querySelector(".cad")!.setAttribute("data-mode", m);
  lift = m === "refine" && window.innerWidth <= 760 ? 0.24 : 0;
  $(".reason").style.display = m === "make" ? "" : "none";
  resize();
  controls.autoRotate = m === "make";
  if (m === "refine") renderPanel();
  if (m === "hand") renderHand();
  dirty = true;
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

let busy = false;
async function make() {
  const text = $<HTMLInputElement>(".prompt input").value.trim();
  if (!text || busy) return;
  const st = $(".make-status");
  const pass = store.password() || (await askPassword());
  if (!pass) {
    st.textContent = "生むには Claude が要ります。合言葉を入れてください（整える。では手で作れます）。";
    return;
  }
  busy = true;
  st.innerHTML = `<span class="pulse"></span> Claude が形を考えています…`;
  const r = await callTool<Design>({
    system: designPrompt(ledgerText(store.ledger())),
    user: text,
    tool: MAKE_DESIGN,
    parse: (x) => designFromTool(x, d),
    password: pass,
  });
  busy = false;
  if (!r.ok) {
    if (r.code === "wrong_password") resetPassword();
    st.textContent = r.error;
    return;
  }
  history.push(d);
  d = r.value;
  framedFor = "";
  build();
  st.textContent = r.remaining !== undefined ? `今日あと ${r.remaining} 回` : "";
  showReason();
}
function showReason() {
  const box = $(".reason");
  box.hidden = !d.reason;
  box.innerHTML = d.reason ? `<p>${esc(d.reason)}</p><button type="button" class="link to-refine">整える →</button>${history.length ? `<button type="button" class="link undo">ひとつ前に戻す</button>` : ""}` : "";
  box.querySelector(".to-refine")?.addEventListener("click", () => setMode("refine"));
  box.querySelector(".undo")?.addEventListener("click", () => {
    d = history.pop()!;
    framedFor = "";
    build();
    showReason();
  });
}

// ---- 整える。 ----
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
const fmt = (v: number, s: Slider) => (s.unit === "%" ? `${Math.round(v * 100)}%` : `${v}${s.unit}`);
let timer = 0;
const schedule = () => {
  clearTimeout(timer);
  timer = window.setTimeout(build, 50);
};
function sliders(box: HTMLElement, list: Slider[]) {
  box.innerHTML = list.map((s, i) => `<label><span>${s.label}</span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.get()}" data-i="${i}"><output>${fmt(s.get(), s)}</output></label>`).join("");
  box.querySelectorAll<HTMLInputElement>("input").forEach((inp) => {
    const s = list[Number(inp.dataset.i)];
    inp.addEventListener("input", () => {
      s.set(Number(inp.value));
      inp.nextElementSibling!.textContent = fmt(s.get(), s);
      schedule();
    });
  });
}

function renderPanel() {
  $(".forms").innerHTML = FORMS.map((f) => `<button type="button" data-f="${f.id}" aria-pressed="${f.id === d.form}"><span class="ico">${formIcon(f.id)}</span><b>${f.name}</b></button>`).join("");
  document.querySelectorAll<HTMLButtonElement>(".forms button").forEach((b) => b.addEventListener("click", () => ((d.form = b.dataset.f as FormId), (d.name = autoName()), renderPanel(), build())));
  $(".techs-grid").innerHTML = TECHNIQUES.map((t) => `<button type="button" data-t="${t.id}" aria-pressed="${t.id === d.tech}"><img alt="" src="${swatch(t.id)}"><b>${t.name}</b></button>`).join("");
  document.querySelectorAll<HTMLButtonElement>(".techs-grid button").forEach((b) =>
    b.addEventListener("click", () => {
      d.tech = b.dataset.t as TechniqueId;
      const t = TECHNIQUES.find((x) => x.id === d.tech)!;
      if (!t.metals.includes(d.metal)) d.metal = t.metals[0];
      d.name = autoName();
      renderPanel();
      build();
    }),
  );
  const t = TECHNIQUES.find((x) => x.id === d.tech)!;
  $(".tech-what").textContent = t.what;
  if (d.tech === "mokume") {
    $(".metal-h").textContent = "重ねる金属";
    $(".metals").innerHTML = MOKUME_PALETTES.map((p, i) => `<button type="button" data-p="${i}" aria-pressed="${i === d.palette}"><span class="dots">${p.colors.slice(0, 3).map((c) => `<i style="background:${c}"></i>`).join("")}</span>${p.name}</button>`).join("");
    document.querySelectorAll<HTMLButtonElement>(".metals button").forEach((b) => b.addEventListener("click", () => ((d.palette = Number(b.dataset.p)), renderPanel(), build())));
  } else {
    $(".metal-h").textContent = "地金";
    const order = t.metals.concat((["k18", "pt", "sv", "copper", "shakudo", "shibuichi", "iron"] as MetalId[]).filter((m) => !t.metals.includes(m)));
    $(".metals").innerHTML = order.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === d.metal}"><span class="dots"><i style="background:${METALS[m].color}"></i></span>${METALS[m].name}</button>`).join("");
    document.querySelectorAll<HTMLButtonElement>(".metals button").forEach((b) => b.addEventListener("click", () => ((d.metal = b.dataset.m as MetalId), renderPanel(), build())));
  }
  const fp = d.fp;
  sliders(
    $(".form-sliders"),
    d.form === "ring"
      ? [
          { label: "号", min: 5, max: 25, step: 1, unit: " 号", get: () => fp.gou, set: (v) => (fp.gou = v) },
          { label: "幅", min: 2, max: 12, step: 0.5, unit: " mm", get: () => fp.ringWidth, set: (v) => (fp.ringWidth = v) },
          { label: "厚み", min: 1, max: 3, step: 0.1, unit: " mm", get: () => fp.ringThick, set: (v) => (fp.ringThick = v) },
        ]
      : [
          { label: "大きさ", min: 15, max: 60, step: 1, unit: " mm", get: () => fp.plateSize, set: (v) => (fp.plateSize = v) },
          { label: "厚み", min: 1, max: 5, step: 0.1, unit: " mm", get: () => fp.plateThick, set: (v) => (fp.plateThick = v) },
        ],
  );
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
  $(".tech-sec").hidden = techList[d.tech].length === 0;
  sliders($(".tech-sliders"), techList[d.tech]);
  if (d.tech === "mokume") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "link";
    b.textContent = "彫る場所を変える";
    b.addEventListener("click", () => ((tp.seed += 1), build()));
    $(".tech-sliders").appendChild(b);
  }
  $(".rules-sec").innerHTML = `<h3>職人の決まり</h3><p class="tech-what">${esc(t.name)}の決まりは、まだ帳面にありません。職人に聞いて残すと、ここで確かめられます。</p>`;
}
function autoName(): string {
  const t = TECHNIQUES.find((x) => x.id === d.tech)!;
  const f = FORMS.find((x) => x.id === d.form)!;
  return `${t.name}の${f.name}`;
}

// ---- 渡す。 ----
function renderHand() {
  const img = renderer.domElement.toDataURL("image/png");
  const t = TECHNIQUES.find((x) => x.id === d.tech)!;
  $(".hand-panel").innerHTML = `<div class="sheet-preview">
    <img alt="" src="${img}">
    <div><h3>${esc(d.name)}</h3><p>${esc(t.what)}</p>
    <button type="button" class="primary print">指示書を印刷する</button>
    <p class="note">原寸の図・技法の値・職人の決まりと理由を、1 枚にまとめます（作っているところ）。</p></div>
  </div>`;
}

setMode("make");
build();
resize();
