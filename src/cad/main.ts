// かんたん CAD（見本）：形を選び、技法を選ぶと、その技の見た目が 3D の面にほんとうの大きさで出る。
import "../app/app.css";
import "./cad.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ContactShadow, backdropTexture, studioScene } from "../ui/viewer";
import { DEFAULT_FORM, FORMS, outline, plateGeometry, ringGeometry, innerDiameter, volumeMm3, type FormId, type FormParams } from "./forms";
import { DEFAULT_PARAMS, METALS, MOKUME_PALETTES, TECHNIQUES, makeSurface, type MetalId, type Surface, type TechniqueId, type TechniqueParams } from "./techniques";

/** 比重（g/cm³）。重さの目安 */
const DENSITY: Record<MetalId, number> = { k18: 15.5, pt: 21.4, sv: 10.4, copper: 8.9, shakudo: 9.0, shibuichi: 9.3, iron: 7.9 };

interface State {
  form: FormId;
  fp: FormParams;
  tech: TechniqueId;
  metal: MetalId;
  palette: number;
  tp: TechniqueParams;
}
const state: State = { form: "ume", fp: { ...DEFAULT_FORM }, tech: "mokume", metal: "copper", palette: 0, tp: { ...DEFAULT_PARAMS } };

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="cad">
  <header class="bar">
    <a class="brand" href="./"><span class="seal">継</span><span class="name">継ぐ</span></a>
    <span class="cad-tag">かんたん CAD ・ 見本</span>
  </header>
  <div class="cad-body">
    <div class="cad-view"><div class="gl"></div>
      <div class="cad-hud"><b class="hud-name"></b><span class="hud-size"></span></div>
    </div>
    <aside class="cad-panel">
      <section><h3>形</h3><div class="forms"></div></section>
      <section><h3>技法</h3><div class="techs-grid"></div><p class="tech-what small"></p></section>
      <section class="metal-sec"><h3 class="metal-h">地金</h3><div class="metals"></div></section>
      <section><h3>大きさ</h3><div class="sliders form-sliders"></div></section>
      <section class="tech-sec"><h3>技法の細かさ</h3><div class="sliders tech-sliders"></div></section>
      <section class="facts"></section>
    </aside>
  </div>
</div>`;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

// ---- 3D ----
const host = $(".gl");
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.toneMapping = THREE.NeutralToneMapping;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studioScene(), 0.015).texture;
scene.background = backdropTexture();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotateSpeed = 1.2;
const content = new THREE.Group();
const shadow = new ContactShadow();
scene.add(shadow.plane, content);
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(-20, -30, 40);
scene.add(key);
let dirty = true;
controls.addEventListener("change", () => (dirty = true));
function resize() {
  const w = host.clientWidth || 1;
  const h = host.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(resize).observe(host);
(function loop() {
  if (controls.update() || dirty) {
    renderer.render(scene, camera);
    dirty = false;
  }
  requestAnimationFrame(loop);
})();

let surfaceKey = "";
let surface: Surface | null = null;
let framed = "";

function texture(c: HTMLCanvasElement, srgb: boolean, s: Surface) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / s.widthMm, 1 / s.heightMm);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function build() {
  const geo = state.form === "ring" ? ringGeometry(state.fp) : plateGeometry(state.form, state.fp);
  const pal = MOKUME_PALETTES[state.palette].colors;
  const k = JSON.stringify([state.tech, state.metal, state.palette, state.tp]);
  if (k !== surfaceKey) {
    surface = makeSurface(state.tech, state.metal, state.tp, pal);
    surfaceKey = k;
  }
  const s = surface!;
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: texture(s.color, true, s),
    bumpMap: s.bump ? texture(s.bump, false, s) : null,
    bumpScale: state.tech === "nanako" ? 3 : state.tech === "tsuchime" ? 6 : 1.2,
    metalness: s.metalness,
    roughness: s.roughness,
    clearcoat: state.tech === "plain" ? 0.4 : 0.1,
  });
  for (const o of [...content.children]) {
    content.remove(o);
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
  const mesh = new THREE.Mesh(geo, mat);
  content.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh);
  const fk = state.form;
  if (framed !== fk) {
    framed = fk;
    const size = box.getSize(new THREE.Vector3()).length();
    const c = box.getCenter(new THREE.Vector3());
    controls.target.copy(c);
    const dir = state.form === "ring" ? new THREE.Vector3(0.9, -1.1, 0.75) : new THREE.Vector3(0.15, -0.9, 1.25);
    camera.position.copy(c).add(dir.normalize().multiplyScalar(size * 1.9));
    camera.near = size / 50;
    camera.far = size * 50;
    camera.updateProjectionMatrix();
  }
  shadow.render(renderer, scene, content, box);
  dirty = true;
  // 数字
  const metalFor = state.tech === "mokume" ? "copper" : state.metal;
  const g = (volumeMm3(geo) / 1000) * DENSITY[metalFor];
  const f = FORMS.find((x) => x.id === state.form)!;
  const t = TECHNIQUES.find((x) => x.id === state.tech)!;
  $(".hud-name").textContent = `${t.name}の${f.name}`;
  $(".hud-size").textContent =
    state.form === "ring"
      ? `${state.fp.gou} 号（内径 ${innerDiameter(state.fp.gou).toFixed(1)} mm）・幅 ${state.fp.ringWidth} mm・厚み ${state.fp.ringThick} mm・約 ${g.toFixed(1)} g`
      : `${state.fp.plateSize} mm・厚み ${state.fp.plateThick} mm・約 ${g.toFixed(1)} g`;
  facts(g);
}

// ---- 操作 ----
function formIcon(id: FormId): string {
  if (id === "ring") return `<svg viewBox="-12 -12 24 24"><circle r="9" fill="none" stroke="currentColor" stroke-width="3"/></svg>`;
  const pts = outline(id, 20);
  return `<svg viewBox="-12 -12 24 24"><path d="M${pts.map((p) => `${p.x.toFixed(1)} ${(-p.y).toFixed(1)}`).join("L")}Z" fill="currentColor"/></svg>`;
}

function swatch(t: TechniqueId): string {
  const s = makeSurface(t, TECHNIQUES.find((x) => x.id === t)!.metals[0], { ...DEFAULT_PARAMS }, MOKUME_PALETTES[0].colors);
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d")!;
  // 10 mm 角ぶんを見せる
  const k = Math.min(s.color.width / s.widthMm, s.color.height / s.heightMm) * (t === "mokume" ? 16 : t === "nunome" ? 6 : t === "tsuchime" ? 10 : 6);
  g.drawImage(s.color, 0, 0, Math.min(s.color.width, k), Math.min(s.color.height, k), 0, 0, 96, 96);
  return c.toDataURL();
}

$(".forms").innerHTML = FORMS.map((f) => `<button type="button" data-f="${f.id}"><span class="ico">${formIcon(f.id)}</span><b>${f.name}</b><small>${f.use}</small></button>`).join("");
document.querySelectorAll<HTMLButtonElement>(".forms button").forEach((b) =>
  b.addEventListener("click", () => {
    state.form = b.dataset.f as FormId;
    render();
  }),
);
$(".techs-grid").innerHTML = TECHNIQUES.map((t) => `<button type="button" data-t="${t.id}"><img alt="" src="${swatch(t.id)}"><b>${t.name}</b><small>${t.reading}</small></button>`).join("");
document.querySelectorAll<HTMLButtonElement>(".techs-grid button").forEach((b) =>
  b.addEventListener("click", () => {
    state.tech = b.dataset.t as TechniqueId;
    const t = TECHNIQUES.find((x) => x.id === state.tech)!;
    if (!t.metals.includes(state.metal)) state.metal = t.metals[0];
    render();
  }),
);

interface Slider {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  get: () => number;
  set: (v: number) => void;
}
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
const fmt = (v: number, s: Slider) => (s.unit === "%" ? `${Math.round(v * 100)}%` : `${v}${s.unit}`);
let timer = 0;
function schedule() {
  clearTimeout(timer);
  timer = window.setTimeout(build, 60);
}

function render() {
  document.querySelectorAll<HTMLButtonElement>(".forms button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === state.form)));
  document.querySelectorAll<HTMLButtonElement>(".techs-grid button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === state.tech)));
  const t = TECHNIQUES.find((x) => x.id === state.tech)!;
  $(".tech-what").textContent = t.what;
  if (state.tech === "mokume") {
    $(".metal-h").textContent = "重ねる金属";
    $(".metals").innerHTML = MOKUME_PALETTES.map((p, i) => `<button type="button" data-p="${i}" aria-pressed="${i === state.palette}"><span class="dots">${p.colors.slice(0, 3).map((c) => `<i style="background:${c}"></i>`).join("")}</span>${p.name}</button>`).join("");
    document.querySelectorAll<HTMLButtonElement>(".metals button").forEach((b) => b.addEventListener("click", () => ((state.palette = Number(b.dataset.p)), render())));
  } else {
    $(".metal-h").textContent = "地金";
    $(".metals").innerHTML = t.metals
      .concat((["k18", "pt", "sv", "copper", "shakudo", "shibuichi"] as MetalId[]).filter((m) => !t.metals.includes(m)))
      .map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === state.metal}"><span class="dots"><i style="background:${METALS[m].color}"></i></span>${METALS[m].name}</button>`)
      .join("");
    document.querySelectorAll<HTMLButtonElement>(".metals button").forEach((b) => b.addEventListener("click", () => ((state.metal = b.dataset.m as MetalId), render())));
  }
  const fp = state.fp;
  sliders(
    $(".form-sliders"),
    state.form === "ring"
      ? [
          { key: "gou", label: "号", min: 5, max: 25, step: 1, unit: " 号", get: () => fp.gou, set: (v) => (fp.gou = v) },
          { key: "w", label: "幅", min: 2, max: 12, step: 0.5, unit: " mm", get: () => fp.ringWidth, set: (v) => (fp.ringWidth = v) },
          { key: "t", label: "厚み", min: 1, max: 3, step: 0.1, unit: " mm", get: () => fp.ringThick, set: (v) => (fp.ringThick = v) },
        ]
      : [
          { key: "s", label: "大きさ", min: 15, max: 60, step: 1, unit: " mm", get: () => fp.plateSize, set: (v) => (fp.plateSize = v) },
          { key: "t", label: "厚み", min: 1, max: 5, step: 0.1, unit: " mm", get: () => fp.plateThick, set: (v) => (fp.plateThick = v) },
        ],
  );
  const tp = state.tp;
  const techList: Record<TechniqueId, Slider[]> = {
    plain: [],
    mokume: [
      { key: "l", label: "層の数", min: 4, max: 40, step: 1, unit: " 層", get: () => tp.layers, set: (v) => (tp.layers = v) },
      { key: "d", label: "彫る深さ", min: 0.1, max: 0.95, step: 0.05, unit: "%", get: () => tp.depth, set: (v) => (tp.depth = v) },
      { key: "p", label: "彫る数", min: 4, max: 40, step: 1, unit: " か所", get: () => tp.pits, set: (v) => (tp.pits = v) },
    ],
    nanako: [
      { key: "dot", label: "粒の大きさ", min: 0.2, max: 1.2, step: 0.05, unit: " mm", get: () => tp.dotMm, set: (v) => ((tp.dotMm = v), (tp.pitchMm = Math.max(tp.pitchMm, v * 1.05))) },
      { key: "pitch", label: "粒の間", min: 0.25, max: 1.6, step: 0.05, unit: " mm", get: () => tp.pitchMm, set: (v) => (tp.pitchMm = Math.max(v, tp.dotMm * 1.05)) },
    ],
    nunome: [
      { key: "h", label: "刻み目の間", min: 0.1, max: 0.6, step: 0.05, unit: " mm", get: () => tp.hatchMm, set: (v) => (tp.hatchMm = v) },
      { key: "m", label: "模様の大きさ", min: 3, max: 16, step: 1, unit: " mm", get: () => tp.motifMm, set: (v) => (tp.motifMm = v) },
    ],
    tsuchime: [{ key: "dent", label: "叩きの大きさ", min: 1, max: 5, step: 0.2, unit: " mm", get: () => tp.dentMm, set: (v) => (tp.dentMm = v) }],
  };
  $(".tech-sec").hidden = techList[state.tech].length === 0;
  sliders($(".tech-sliders"), techList[state.tech]);
  if (state.tech === "mokume") {
    const reseed = document.createElement("button");
    reseed.type = "button";
    reseed.className = "ghost tiny";
    reseed.textContent = "彫る場所を変える";
    reseed.addEventListener("click", () => ((tp.seed += 1), build()));
    $(".tech-sliders").appendChild(reseed);
  }
  build();
}

function facts(g: number) {
  const t = TECHNIQUES.find((x) => x.id === state.tech)!;
  $(".facts").innerHTML = `<h3>職人の目安</h3>
    <p class="small">重さ：約 ${g.toFixed(1)} g（${state.tech === "mokume" ? "銅として" : METALS[state.metal].name}の比重から。目安）</p>
    <p class="small">${t.name}の決まりは、まだ帳面にありません。職人に聞いて「残す」から足すと、ここで確かめられるようになります。</p>`;
}

render();
resize();
