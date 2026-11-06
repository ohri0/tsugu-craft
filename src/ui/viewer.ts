// 右の大きな 3D。ドラッグで回す。単位は mm。z が上。
// 問題のある爪は赤く、守られていない角には赤い印（SPEC「画面と操作」）。
// 見た目は、宝飾品の写真の撮影台に近づける：やわらかい光の箱の映り込み、置いた所の淡い影、
// 光を通して曲げる石、うっすらとした背景（1 mm の目盛りは setGrid(true) で出す）。
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { placePoint, type RingDesign } from "../geometry/ring";
import type { ShankResult } from "../geometry/shank";
import type { StoneMesh } from "../geometry/stone";
import type { MetalId } from "../rules/guides";
import type { Problem } from "../rules/checks";
import { CadGrid, GRID_LOOK } from "./cad-grid";
import { COLORED_IOR, COLORLESS_IOR, gemMaterial, type GemQuality, type GemShared } from "./gem";
import { Glow } from "./glow";
import type { MetalTrace } from "./metal-trace";
import { GEM_STUDIO, LOOK, METAL_COLOR, METAL_STUDIO, studioLightScene, type MetalShade } from "./studio-light";
import { guardBufferUploads } from "./gl-upload";
import { gridSpacing, labelStep, VIEW_DIR, ViewCameras, type FlatViewInfo, type ViewName } from "./view-camera";

export type DisplayMode = "render" | "shaded" | "wire";

const isStone = (m: THREE.Material | THREE.Material[]) => !Array.isArray(m) && m.userData.gem === true;
const SHADED = {
  metal: new THREE.MeshStandardMaterial({ color: 0xbfc0c4, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  warn: new THREE.MeshStandardMaterial({ color: 0xe0504a, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xa9cff2, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
};
/** レンダリングの材質 → シェードの材質（地金は灰色、目安を外れた所は赤、石は淡い青） */
function shadedOf(m: THREE.Material): THREE.Material {
  if (isStone(m)) return SHADED.stone;
  if (m instanceof THREE.MeshPhysicalMaterial && m.color.getHex() === WARN) return SHADED.warn;
  return SHADED.metal;
}

/** 作れない所の赤い材質の元（映り込みは、シェードと同じ明るい環境で） */
const WARN_LOOK = new THREE.MeshPhysicalMaterial({ color: 0xe0342b, metalness: 0.35, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide });

export interface StoneLook {
  color: { r: number; g: number; b: number };
  colorless: boolean;
  /** 地金の色（K18 ホワイト・ピンクなど。なければ形の地金の色） */
  shade?: MetalShade;
}

const metalColor = (id: MetalShade) => new THREE.Color().setRGB(...METAL_COLOR[id], THREE.LinearSRGBColorSpace);
const WARN = 0xe0342b;
/** 背景のうっすらとした明るさの変化（真ん中 → 外） */
const BACKDROP = { center: "#f8f6f2", edge: "#e2ddd4" };
/** 置いた所の影：どの高さまでの部分が影を落とすか（mm）・濃さ・ぼかし（回数） */
const SHADOW = { reachMm: 7, darkness: 0.85, opacity: 0.55, blurPasses: 3, size: 256 };

/**
 * 描く力に合わせた細かさ。スマホ（指で触る端末）とソフトウェアの描画では、石の中の計算と環境の細かさを減らす
 */
function quality(gl: WebGL2RenderingContext | WebGLRenderingContext): { envSize: number; glow: boolean; gem: GemQuality } {
  const maxLod = (size: number) => Math.log2(size) - 3; // three の環境の絵の段の数
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
  if (/swiftshader|llvmpipe|software/i.test(name)) return { envSize: 256, glow: false, gem: { bounces: Math.min(2, LOOK.gemBounces), samples: 1, disperse: false, envMaxLod: maxLod(256) } };
  if (coarse) return { envSize: 512, glow: false, gem: { bounces: Math.min(3, LOOK.gemBounces), samples: 1, disperse: false, envMaxLod: maxLod(512) } };
  // CPU に付いた GPU（Intel の内蔵）は、石の中を 1 本だけ追う（4 本だと 1 こま 0.2 秒かかり、回すとかくつく）
  if (/intel|iris|uhd/i.test(name)) return { envSize: 512, glow: true, gem: { bounces: LOOK.gemBounces, samples: 1, disperse: true, envMaxLod: maxLod(512) } };
  return { envSize: 1024, glow: true, gem: { bounces: LOOK.gemBounces, samples: 4, disperse: true, envMaxLod: maxLod(512) } };
}

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  /** 斜め（パース）と、正面・横・上（正射の平らな図）のカメラ */
  private cams = new ViewCameras();
  /** 今使っているカメラ（動画を撮る道具が __viewer.camera を読む） */
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.cams.persp;
  controls: OrbitControls;
  private content = new THREE.Group();
  /** 地平線まで続く方眼（シェーダーで描く 1 枚の板） */
  private cad = new CadGrid();
  private grid: THREE.Mesh = this.cad.mesh;
  /** 平らな図の目盛りの数字（mm）。3D の上に重ねる */
  private ruler: SVGSVGElement;
  private shadow: ContactShadow;
  private framedFor = "";
  /** true の間は、形が変わってもカメラを寄せ直さない（石の大きさを変えるとき、大きさの違いが見えるように） */
  keepCamera = false;
  /** 今の指輪で、作れない所に使っている赤い材質（点滅させる。なければ null） */
  private warnMat: THREE.MeshPhysicalMaterial | null = null;
  /** 今の指輪の腕と、腕の局所的に薄い所の印（断面を動かしている間に、腕だけを差し替えるため） */
  private live: { shank: THREE.Mesh; marks: THREE.Mesh[]; lift: number; warn: THREE.MeshPhysicalMaterial } | null = null;
  /** 描き直しが要るか（動いていない間は描かない。スマホの電池のため） */
  private dirty = true;
  private quality: ReturnType<typeof quality>;
  /** 石が読む環境と、光の向き（カメラの向きに合わせて回す） */
  private gemShared: GemShared = { uEnv: { value: null }, uEnvRot: { value: new THREE.Matrix3() }, uMetal: { value: new THREE.Color(1, 1, 1) } };
  private glow = new Glow();
  private lightAz = 0;
  /** 高画質：地金が地金を映す（見せるの間、選んだときだけ。力のある GPU だけ） */
  private trace: MetalTrace | null = null;
  private highQuality = false;

  /** 形の配列が GPU へ正しく届かず、3D の絵が乱れているか（数字と STL は正しい） */
  drawFault = false;
  private faultListeners: (() => void)[] = [];
  /** 3D の絵が乱れたときに呼ぶ（壊れた絵のまま「作れます」と出さないため） */
  onDrawFault(f: () => void) {
    this.faultListeners.push(f);
  }

  constructor(private host: HTMLElement) {
    // 2 つの GPU がある端末では、強い方で描く
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.quality = quality(this.renderer.getContext());
    // Mac の Safari で 1 MiB より大きい形が崩れないよう、小さく分けて GPU へ送る（gl-upload.ts）
    guardBufferUploads(this.renderer.getContext() as WebGL2RenderingContext, () => {
      this.drawFault = true;
      for (const f of this.faultListeners) f();
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    // 金の色が転ばないよう、色をそのまま保つ写し方にする
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);
    const makeEnv = () => {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      // レンダーの環境：暗い部屋に強い光。シェードと赤い印は、前の明るい環境のまま（作業の見やすさのため）
      this.scene.environment = pmrem.fromScene(studioLightScene(METAL_STUDIO), 0, 0.1, 100, { size: this.quality.envSize }).texture;
      const work = pmrem.fromScene(studioScene(), 0.015).texture;
      // 石が読む環境（ぼかしの段がある絵。遠くの反射ほどぼかして読む）
      this.gemShared.uEnv.value = pmrem.fromScene(studioLightScene(GEM_STUDIO), 0, 0.1, 100, { size: Math.min(512, this.quality.envSize) }).texture;
      for (const m of [SHADED.metal, SHADED.warn, SHADED.stone, WARN_LOOK]) {
        m.envMap = work;
        m.needsUpdate = true;
      }
      pmrem.dispose();
    };
    makeEnv();
    // スマホなどで描く力が足りず、3D の描画がいったん消えて戻ったとき、映り込みの光を作り直す（作り直さないと金属が真っ黒になる）
    this.renderer.domElement.addEventListener("webglcontextrestored", () => makeEnv());
    this.scene.background = backdropTexture();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotateSpeed = 1.6;
    // 1 mm の目盛り（ふだんは隠す）
    this.grid.visible = false;
    this.cad.setLook(GRID_LOOK.paper);
    this.cad.setPlane("x", "y", new THREE.Vector3());
    this.ruler = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.ruler.setAttribute("class", "grid-ruler");
    this.ruler.setAttribute("aria-hidden", "true");
    this.ruler.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible";
    host.appendChild(this.ruler);
    this.shadow = new ContactShadow();
    this.scene.add(this.grid, this.shadow.plane, this.content);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.controls.addEventListener("change", () => (this.dirty = true));
    const loop = () => {
      // 回している間（慣性で動いている間・自動で回している間を含む）と、中身が変わったときだけ描く
      const moved = this.controls.update();
      // 作れない所（細すぎる爪・守られていない角）は、赤くゆっくり点滅させて目を引く
      if (this.warnMat) {
        const k = 0.5 + 0.5 * Math.sin(performance.now() / 260);
        this.warnMat.emissive.setHex(WARN);
        this.warnMat.emissiveIntensity = 0.15 + 0.55 * k;
        this.dirty = true;
      }
      if (moved || this.dirty) {
        this.updateGrid();
        this.draw();
        this.drawRuler();
        this.dirty = false;
        for (const f of this.frameListeners) f();
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

  /** 今の地金の形と材質（光線を当てる相手） */
  private traceParts: THREE.BufferGeometry[] | null = null;
  private traced: THREE.BufferGeometry[] | null = null;
  private metalMat: THREE.MeshPhysicalMaterial | null = null;
  private traceTint = new THREE.Color(1, 1, 1);
  /** 高画質を選べる端末か（力のある GPU だけ） */
  get canHighQuality(): boolean {
    return this.quality.gem.samples === 4;
  }
  get highQualityOn(): boolean {
    return this.highQuality;
  }
  /** 高画質（地金が地金を映す）を選ぶ。1 こまが 10 倍ほど重くなるので、見せるの間だけ効かせる */
  async setHighQuality(on: boolean) {
    this.highQuality = on && this.canHighQuality;
    if (this.highQuality && !this.trace) {
      const { MetalTrace } = await import("./metal-trace");
      this.trace = new MetalTrace();
    }
    this.syncTrace();
    this.dirty = true;
  }
  private syncTrace() {
    const t = this.trace;
    if (!t || !this.metalMat) return;
    const on = this.highQuality && this.presenting && this.mode === "render" && !!this.traceParts;
    if (on && this.traced !== this.traceParts) {
      t.setGeometry(this.traceParts!);
      this.traced = this.traceParts;
    }
    t.uniforms.uTint.value.copy(this.traceTint);
    t.set(this.metalMat, on);
  }

  /** 光をカメラの向きに合わせる（指輪を回すと、光は止まったまま指輪だけが回るように見える） */
  private syncLights() {
    const c = this.camera.position;
    const t = this.controls.target;
    const dx = c.x - t.x;
    const dy = c.y - t.y;
    if (dx * dx + dy * dy > 1e-6) this.lightAz = Math.atan2(dy, dx);
    this.scene.environmentRotation.set(0, 0, this.lightAz);
    const co = Math.cos(this.lightAz);
    const si = Math.sin(this.lightAz);
    // 世界の向き → 光の球の向き（−az だけ回す）
    this.gemShared.uEnvRot.value.set(co, si, 0, -si, co, 0, 0, 0, 1);
  }
  /** 今の 3D を描く（見せるの間は、光のにじみも足す） */
  private draw() {
    this.syncLights();
    this.renderer.render(this.scene, this.camera);
    if (this.quality.glow && this.presenting && this.mode === "render") this.glow.draw(this.renderer, this.scene, this.camera);
  }

  /** 画面の点（clientX・Y）から出る光線 */
  private rayAt(cx: number, cy: number): THREE.Raycaster {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    return ray;
  }
  /**
   * 画面の点の先にある指輪の面の点（指輪の座標 mm：床に置いた分を戻す）。何もなければ null。
   * stone：当たったのが石か（石を置く所を選ぶとき、石と腕を見分ける）
   */
  pickRing(cx: number, cy: number): { p: [number, number, number]; stone: boolean } | null {
    const hit = this.rayAt(cx, cy)
      .intersectObject(this.content, true)
      .find((h) => h.object instanceof THREE.Mesh && h.object.visible && !h.object.userData.marker);
    if (!hit) return null;
    const lift = this.live?.lift ?? 0;
    return { p: [hit.point.x, hit.point.y, hit.point.z - lift], stone: isStone((hit.object as THREE.Mesh).userData.render ?? (hit.object as THREE.Mesh).material) };
  }
  /** 画面の点の先の光線が、指の軸に直角な面（x ＝ x0）を通る点（指輪の座標）。石を腕に沿って動かすとき */
  pickPlaneX(cx: number, cy: number, x0 = 0): [number, number, number] | null {
    const lift = this.live?.lift ?? 0;
    const p = new THREE.Vector3();
    return this.rayAt(cx, cy).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(1, 0, 0), -x0), p) ? [p.x, p.y, p.z - lift] : null;
  }
  /** 測る点や爪を選ぶ相手（形の面だけ。赤い印や線は選ばない） */
  private pickable(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    this.content.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.marker && o.geometry.type === "BufferGeometry") out.push(o);
    });
    return out;
  }
  /** 画面の点のまわり（真ん中と、半径 rPx の 2 周）から出る光線の順に呼ぶ。f が値を返したら止める */
  private aroundRays<T>(cx: number, cy: number, rPx: number, f: (ray: THREE.Raycaster, px: number) => T | null): T | null {
    const hitAt = (x: number, y: number, px: number) => f(this.rayAt(x, y), px);
    let got = hitAt(cx, cy, 0);
    if (got !== null || rPx <= 0) return got;
    for (const [rr, n] of [[0.5, 8], [1, 12]] as const) {
      for (let i = 0; i < n; i++) {
        const th = ((i + 0.5) / n) * Math.PI * 2;
        got = hitAt(cx + Math.cos(th) * rPx * rr, cy + Math.sin(th) * rPx * rr, rPx * rr);
        if (got !== null) return got;
      }
    }
    return null;
  }
  /**
   * 測る点を探す：画面の点の先にある面の点と、その三角形の 3 つの頂点（画面の 3D と同じ座標）。
   * 真ん中に面がなければ、半径 rPx の中を探す（形のふちを押しても拾えるように）
   */
  pickSurface(cx: number, cy: number, rPx = 0): { point: [number, number, number]; tri: [[number, number, number], [number, number, number], [number, number, number]]; stone: boolean } | null {
    const meshes = this.pickable();
    return this.aroundRays(cx, cy, rPx, (ray) => {
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit?.face) return null;
      const m = hit.object as THREE.Mesh;
      const pos = m.geometry.getAttribute("position");
      const dz = m.position.z;
      const v = (i: number): [number, number, number] => [pos.getX(i) + m.position.x, pos.getY(i) + m.position.y, pos.getZ(i) + dz];
      return { point: [hit.point.x, hit.point.y, hit.point.z], tri: [v(hit.face.a), v(hit.face.b), v(hit.face.c)], stone: isStone(m.userData.render ?? m.material) };
    });
  }
  /** 形のそれぞれ（石・石座・腕）の三角形の点と、置いた高さ。形の端の点を探すのに使う */
  meshPositions(): { positions: ArrayLike<number>; lift: number }[] {
    return this.pickable().map((m) => ({ positions: m.geometry.getAttribute("position").array, lift: m.position.z }));
  }
  /**
   * 爪を探す：画面の点の先の、石座の三角形の番号の候補（近い順）。半径 rPx の中で見る。石や腕が先に当たった光線は数えない。
   * accept（石座の三角形の番号 → 値、爪でなければ null）が値を返した最初のものを返す
   */
  pickSetting<T>(cx: number, cy: number, rPx: number, accept: (face: number) => T | null): T | null {
    const meshes = this.pickable();
    const setting = this.settingMesh;
    if (!setting) return null;
    return this.aroundRays(cx, cy, rPx, (ray) => {
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit || hit.object !== setting || hit.faceIndex == null) return null;
      return accept(hit.faceIndex);
    });
  }
  /** 中身の形が変わるたびに増える番号（引いた寸法が古くなったかを見るため） */
  contentVersion = 0;
  /** 今の石座の形（爪を選ぶ相手） */
  private settingMesh: THREE.Mesh | null = null;
  /** 選んだ爪を明るく見せる形（中身の外に置く：影・図面・箱に入らない） */
  private prongMark: THREE.Mesh | null = null;
  /** 石座の三角形の範囲を、明るく見せる（爪を選んだとき）。null で消す */
  markSetting(range: { start: number; count: number } | null) {
    if (this.prongMark) {
      this.scene.remove(this.prongMark);
      this.prongMark.geometry.dispose();
      (this.prongMark.material as THREE.Material).dispose();
      this.prongMark = null;
    }
    const m = this.settingMesh;
    this.dirty = true;
    if (!range || !m || !range.count) return;
    const pos = m.geometry.getAttribute("position").array as Float32Array;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos.slice(range.start * 9, (range.start + range.count) * 9), 3));
    const nor = m.geometry.getAttribute("normal")?.array as Float32Array | undefined;
    if (nor) g.setAttribute("normal", new THREE.BufferAttribute(nor.slice(range.start * 9, (range.start + range.count) * 9), 3));
    // 地金の色の上に、うすい青を重ねる（形は見える。線は隠さない）
    this.prongMark = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x409cff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.prongMark.position.copy(m.position);
    this.scene.add(this.prongMark);
  }
  /** ドラッグで回すのを止める・戻す（石を動かしている間） */
  setOrbit(on: boolean) {
    this.controls.enabled = on;
  }
  /** 指輪を床に置いた高さ（指輪の座標 → 画面の 3D の座標：z に足す） */
  get ringLift(): number {
    return this.live?.lift ?? 0;
  }

  /** ワイヤーで腕も網目で見せるか（撮影では前の見た目のまま） */
  wireArm = true;

  /** 赤い所（作れない所）を押したときに呼ぶ */
  private warnListeners: (() => void)[] = [];
  onWarnClick(f: () => void) {
    if (this.warnListeners.length === 0) {
      // 回すためのドラッグと分けるため、押してから離すまでにほとんど動かなかったときだけ「押した」とみなす
      const el = this.renderer.domElement;
      let down: { x: number; y: number } | null = null;
      el.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
      el.addEventListener("pointerup", (e) => {
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
        down = null;
        if (this.hitsWarn(e.clientX, e.clientY)) for (const g of this.warnListeners) g();
      });
    }
    this.warnListeners.push(f);
  }
  private hitsWarn(cx: number, cy: number): boolean {
    if (!this.warnMat) return false;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const hit = ray.intersectObject(this.content, true).find((h) => h.object instanceof THREE.Mesh && h.object.visible);
    if (!hit) return false;
    const m = (hit.object as THREE.Mesh).material;
    const mat = Array.isArray(m) ? m[hit.face?.materialIndex ?? 0] : m;
    const ud = (hit.object as THREE.Mesh).userData;
    const src = Array.isArray(ud.render) ? ud.render[hit.face?.materialIndex ?? 0] : ud.render;
    return mat === this.warnMat || src === this.warnMat;
  }

  private frameListeners: (() => void)[] = [];
  /** 描き直すたびに呼ぶ（寸法の線や軸の印を 3D に合わせて動かすため） */
  onFrame(f: () => void) {
    this.frameListeners.push(f);
  }
  /** 3D の点（mm）→ 画面の点（px、左上が 0）。カメラの後ろなら null */
  project(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }
  /** カメラから見た x・y・z 軸の向き（画面の右・上、軸の印を描くため） */
  axes(): { x: [number, number]; y: [number, number]; z: [number, number] } {
    const m = this.camera.matrixWorldInverse;
    const f = (v: THREE.Vector3): [number, number] => {
      const d = v.clone().transformDirection(m);
      return [d.x, d.y];
    };
    return { x: f(new THREE.Vector3(1, 0, 0)), y: f(new THREE.Vector3(0, 1, 0)), z: f(new THREE.Vector3(0, 0, 1)) };
  }
  /** 中身に合わせてカメラを寄せ直す */
  fit() {
    this.frame(this.framedFor, this.camera.position.clone().sub(this.controls.target).normalize());
  }

  /** 表示の仕方：レンダリング（写真のよう）・シェード（灰色の面と線）・ワイヤーフレーム（線だけ） */
  private mode: DisplayMode = "render";
  get displayMode(): DisplayMode {
    return this.mode;
  }
  /** 見せる：黒い背景だけにし、床の目盛りと影を消す */
  private presenting = false;
  /** 方眼のボタンの状態（見せるの間は消すが、覚えておく） */
  private gridOn = false;
  setPresenting(on: boolean) {
    this.presenting = on;
    this.syncTrace();
    if (on) {
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 1);
      this.grid.visible = false;
      this.shadow.plane.visible = false;
    } else {
      this.applyBackdrop();
      if (!this.darkOn) this.scene.background = backdropTexture();
      // 見せるの前の方眼の状態に戻す（消したままだと、ボタンは押された見た目なのに方眼と目盛りの数字がなかった）
      this.grid.visible = this.gridOn;
      this.updateShadow();
    }
    this.rulerKey = "-";
    this.dirty = true;
  }
  setDisplayMode(m: DisplayMode) {
    this.mode = m;
    this.syncTrace();
    this.applyBackdrop();
    this.applyMode();
    this.updateShadow();
    this.dirty = true;
  }
  private applyMode() {
    const meshes: THREE.Mesh[] = [];
    this.content.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
      else if (o instanceof THREE.LineSegments && o.userData.renderOnly) o.visible = this.mode === "render";
    });
    for (const o of meshes) {
      const ud = o.userData;
      if (!ud.render) ud.render = o.material;
      if (this.mode === "render" && !ud.edges) {
        // 写真のような表示では線を使わない。折れ目の線は、シェード・ワイヤーにしたときに初めて作る（一体の石座では重い）
        o.material = ud.render;
        o.visible = true;
        continue;
      }
      const stone = isStone(ud.render);
      // 腕も網目で見せる（折れ目の線だけだと内側の 2 本の輪しか出ず、石座が浮いて見えた）
      const wireSmooth = this.mode === "wire" && (!!o.geometry.userData.smooth || (this.wireArm && !!ud.arm)) && !stone;
      // 線が見える時だけ作る（シェードの地金は線を出さないので作らない。腕を描き直すたびに作ると重い）
      const needEdges = (this.mode === "shaded" && stone) || (this.mode === "wire" && !wireSmooth);
      if (!ud.edges && needEdges) {
        // 面の折れ目の線（シェードでは濃く、ワイヤーフレームでは明るく）
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, o.geometry.userData.smooth ? 60 : 14), new THREE.LineBasicMaterial({ color: 0xd8d8dc, transparent: true, opacity: 0.9 }));
        e.position.copy(o.position);
        e.rotation.copy(o.rotation);
        e.scale.copy(o.scale);
        ud.edges = e;
        o.parent!.add(e);
      }
      const edges = ud.edges as THREE.LineSegments | undefined;
      const lm = edges?.material as THREE.LineBasicMaterial | undefined;
      if (this.mode === "render") {
        o.material = ud.render;
        o.visible = true;
        if (edges) edges.visible = false;
      } else if (this.mode === "shaded") {
        o.material = Array.isArray(ud.render) ? (ud.render as THREE.Material[]).map(shadedOf) : shadedOf(ud.render);
        o.visible = true;
        // 地金の面の折れ目の線は出さない（腕に細かい線がたくさん出て「何の線？」となるため。作者の声）。石の面の線だけ出す
        if (edges && lm) {
          edges.visible = stone;
          lm.color.setHex(0x141416);
          lm.opacity = 0.55;
        }
      } else {
        // ワイヤー：なめらかな形（一体の石座・腕）は折れ目がほとんどなく線が出ないので、網目そのものを細い線で見せる
        if (wireSmooth) {
          // 腕は三角が細かく、石座と同じ濃さだと塗りつぶしに見えるので、薄く
          if (!ud.wire) ud.wire = new THREE.MeshBasicMaterial({ color: this.darkOn ? 0x2a2b2e : 0xd8d8dc, wireframe: true, transparent: true, opacity: ud.arm ? 0.07 : 0.22 });
          o.material = ud.wire;
          o.visible = true;
          if (edges) edges.visible = false;
          continue;
        }
        o.visible = false;
        if (edges && lm) {
          edges.visible = true;
          lm.color.setHex(stone ? (this.darkOn ? 0x1d5fb0 : 0x8fc3ff) : this.darkOn ? 0x2a2b2e : 0xd8d8dc);
          lm.opacity = 0.9;
        }
      }
    }
    this.dirty = true;
  }

  /** 下から上へ、形を少しずつ見せる（組み上がっていくように）。ms ミリ秒 */
  reveal(ms: number): Promise<void> {
    this.content.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.content);
    if (box.isEmpty()) return Promise.resolve();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), box.min.z);
    this.renderer.clippingPlanes = [plane];
    const t0 = performance.now();
    return new Promise((done) => {
      const step = () => {
        const u = Math.min(1, (performance.now() - t0) / ms);
        const e = 1 - Math.pow(1 - u, 3);
        plane.constant = box.min.z + (box.max.z - box.min.z + 0.5) * e;
        this.dirty = true;
        if (u < 1) requestAnimationFrame(step);
        else {
          this.renderer.clippingPlanes = [];
          this.dirty = true;
          done();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /** 下から組み上がる途中で止めて見せる（u：0＝何もない〜1＝全部。null で切り取りをやめる）。動画を 1 こまずつ撮るため */
  setReveal(u: number | null) {
    if (u === null) {
      this.renderer.clippingPlanes = [];
      this.dirty = true;
      return;
    }
    this.content.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.content);
    if (box.isEmpty()) return;
    const plane = this.renderer.clippingPlanes[0] ?? new THREE.Plane(new THREE.Vector3(0, 0, -1), box.min.z);
    plane.constant = box.min.z + (box.max.z - box.min.z + 0.5) * Math.max(0, Math.min(1, u));
    this.renderer.clippingPlanes = [plane];
    this.dirty = true;
  }

  /** 1 mm の目盛りを出す・隠す */
  setGrid(show: boolean) {
    this.gridOn = show;
    this.grid.visible = show && !this.presenting;
    this.rulerKey = "-";
    this.dirty = true;
  }

  /** 指輪のまわりを、上の軸で rad だけ回って、すぐ描く（動画を 1 コマずつ撮るため） */
  turn(rad: number) {
    const t = this.controls.target;
    const p = this.camera.position.clone().sub(t);
    p.applyAxisAngle(new THREE.Vector3(0, 0, 1), rad);
    this.camera.position.copy(t).add(p);
    this.camera.lookAt(t);
    this.updateGrid();
    this.draw();
    for (const f of this.frameListeners) f();
  }

  /** ゆっくり自動で回す（動画や見せるとき）。人がドラッグすれば、その向きから続けて回る */
  private wantRotate = false;
  setAutoRotate(on: boolean) {
    this.wantRotate = on;
    // 平らな図（正面・横・上）は回さない。斜めに戻ったら回る
    this.controls.autoRotate = on && !this.cams.flat;
    this.dirty = true;
  }

  /** 品を画面の上のほうに寄せる割合（下に入力の板がある画面で使う。0 で真ん中） */
  private lift = 0;
  setLift(f: number) {
    this.lift = f;
    this.resize();
  }

  /** 画面の上と下で、ボタンがかぶる高さ（px）。指輪はその間に収める */
  private insets = { top: 0, bottom: 0 };
  setInsets(top: number, bottom: number) {
    if (this.insets.top === top && this.insets.bottom === bottom) return;
    this.insets = { top, bottom };
    this.resize();
    if (this.framedFor) this.fit();
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.cams.setAspect(w / h);
    // 上下のボタンの間の真ん中に、中身の真ん中が来るようにずらす
    const dy = h * this.lift + (this.insets.bottom - this.insets.top) / 2;
    for (const cam of [this.cams.persp, this.cams.ortho]) {
      if (dy !== 0) cam.setViewOffset(w, h, 0, dy, w, h);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }
    this.dirty = true;
  }

  private clear() {
    this.contentVersion++;
    this.settingMesh = null;
    this.markSetting(null);
    this.warnMat = null;
    this.live = null;
    this.traceParts = null;
    this.metalMat = null;
    for (const o of [...this.content.children]) {
      this.content.remove(o);
      o.traverse((m) => {
        if (m instanceof THREE.Mesh || m instanceof THREE.LineSegments) m.geometry.dispose();
        // 石の材質は形ごとに作る（面の平面の表を持つ）ので、一緒にすてる
        if (m instanceof THREE.Mesh && isStone(m.userData.render ?? m.material)) (m.userData.render ?? m.material).dispose();
      });
    }
  }

  /**
   * 地金だけの形（地金のみの指輪など）。三角形の並び、mm。いちばん下を床（z ＝ 0）に置く。
   * warn：形ぜんぶを赤く光らせる（作れない所があるとき）。spots：赤い線を回す所（幅の位置 x、指の軸からの距離 rho、軸の高さ z。とがった先など）
   */
  setMetalMesh(positions: Float32Array, metal: MetalId, kind = "metal", o: { warn?: boolean; spots?: { x: number; rho: number; z: number }[]; shade?: MetalShade } = {}) {
    this.clear();
    const warn = new THREE.MeshPhysicalMaterial({ color: WARN, metalness: 0.35, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide });
    const mat = o.warn ? warn : new THREE.MeshPhysicalMaterial({ color: metalColor(o.shade ?? metal), metalness: 1, roughness: LOOK.roughness, envMapIntensity: 1.0, side: THREE.DoubleSide });
    if (o.warn || o.spots?.length) this.warnMat = warn;
    const armMesh = new THREE.Mesh(metalGeometry(positions), mat);
    armMesh.userData.arm = true;
    this.content.add(armMesh);
    for (const s of o.spots ?? []) {
      const geo = new THREE.TorusGeometry(s.rho, SPOT_LINE_RADIUS_MM, 12, 180);
      geo.rotateY(Math.PI / 2);
      const mark = new THREE.Mesh(geo, warn);
      mark.position.set(s.x, 0, s.z);
      this.content.add(mark);
    }
    this.metalMat = mat;
    this.traceParts = [armMesh.geometry];
    this.traceTint.copy(mat.color);
    this.syncTrace();
    this.applyMode();
    // はじめの向き：輪の穴と、上の面の断面の形が両方見える斜め（穴をよく見せるため、指の軸の向きから見る割合を多くした）
    this.frame(kind, new THREE.Vector3(1.05, -0.9, 0.62));
    this.updateShadow();
  }

  /** 石だけ（指輪を組む前） */
  setStone(mesh: StoneMesh, look: StoneLook) {
    this.clear();
    this.addStone(mesh.positions, undefined, look, -mesh.heights.culetZ, mesh.heights.tableZ - mesh.heights.culetZ);
    this.applyMode();
    this.frame("stone", new THREE.Vector3(0.25, -0.75, 1));
    this.updateShadow();
  }

  /** 石・石座・腕のそろった指輪。指の軸は x、腕の一番下を床（z ＝ 0）に置く */
  setRing(ring: RingDesign, look: StoneLook, problems: Problem[]) {
    this.clear();
    const lift = ring.shank.outerRadiusMm;
    const h = ring.stone.heights;
    const shade = metalColor(look.shade ?? ring.metal);
    this.gemShared.uMetal.value.copy(shade);
    this.addStone(ring.ringPositions.stone, ring.stones?.length ? ring.stones.map((st) => st.ranges.stone) : undefined, look, lift, h.tableZ - h.culetZ);
    const metal = new THREE.MeshPhysicalMaterial({
      color: shade,
      metalness: 1,
      roughness: LOOK.roughness,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
    });
    const warn = WARN_LOOK.clone();
    warn.envMap = WARN_LOOK.envMap;
    // 問題のある爪の三角形だけ、赤い材質の組に分ける（石を並べた指輪では、石ごとの三角形の範囲の中で）
    const stones = ring.stones?.length ? ring.stones : [{ setting: ring.setting, transform: ring.transform, ranges: { setting: { start: 0, count: ring.ringPositions.setting.length / 9 } } }];
    const stoneOf = (p: Problem) => Math.min(stones.length - 1, p.stone ?? 0);
    const badProngs = new Set(problems.flatMap((p) => (p.target.kind === "prong" ? [`${stoneOf(p)}:${p.target.index}`] : [])));
    // 覆輪の壁が薄いときはその石座ぜんぶ、腕が細い・薄いときは腕を赤く
    const badBezel = new Set(problems.flatMap((p) => (p.target.kind === "bezel" ? [stoneOf(p)] : [])));
    const badShank = problems.some((p) => p.target.kind === "shank");
    // 腕の間に挟む石座の下の輪（板を丸めた輪）の板が薄いときは、その輪を赤く
    const badCollar = new Set(problems.flatMap((p) => (p.target.kind === "collar" ? [stoneOf(p)] : [])));
    this.warnMat =
      badProngs.size > 0 || badBezel.size > 0 || badCollar.size > 0 || badShank || problems.some((p) => p.target.kind === "corner" || p.target.kind === "gap" || p.target.kind === "shank-spot" || p.target.kind === "space" || p.target.kind === "band-end") ? warn : null;
    const settingGeo = ring.ringPositions.settingNormals ? smoothGeometry(ring.ringPositions.setting, ring.ringPositions.settingNormals) : metalGeometry(ring.ringPositions.setting);
    const total = ring.ringPositions.setting.length / 9;
    const ranges = stones
      .flatMap((st, si) =>
        badBezel.has(si)
          ? [{ ...st.ranges.setting, bad: true }]
          : [
              ...st.setting.prongs.map((pr, i) => ({ start: st.ranges.setting.start + pr.triangles.start, count: pr.triangles.count, bad: badProngs.has(`${si}:${i}`) })),
              ...(st.setting.collar ? [{ start: st.ranges.setting.start + st.setting.collar.triangles.start, count: st.setting.collar.triangles.count, bad: badCollar.has(si) }] : []),
            ].filter((r) => r.bad),
      )
      .sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const r of ranges) {
      if (r.start > cursor) settingGeo.addGroup(cursor * 3, (r.start - cursor) * 3, 0);
      settingGeo.addGroup(r.start * 3, r.count * 3, 1);
      cursor = r.start + r.count;
    }
    if (cursor < total) settingGeo.addGroup(cursor * 3, (total - cursor) * 3, 0);
    const setting = new THREE.Mesh(settingGeo, [metal, warn]);
    const shank = new THREE.Mesh(ring.shank.normals ? smoothGeometry(ring.ringPositions.shank, ring.shank.normals) : metalGeometry(ring.ringPositions.shank), badShank ? warn : metal);
    shank.userData.arm = true;
    setting.position.z = lift;
    shank.position.z = lift;
    this.content.add(setting, shank);
    this.settingMesh = setting;
    this.metalMat = metal;
    this.traceParts = [settingGeo, shank.geometry];
    this.traceTint.copy(metal.color);
    this.syncTrace();
    // 守られていない角の赤い印（石の座標 → 指輪の座標。石を並べた指輪では、その石の場所へ）
    for (const p of problems) {
      // となりの石・石座の間が狭い所（指輪の座標の点）
      if (p.target.kind === "space" || p.target.kind === "band-end") {
        const [x, y, z] = p.target.point;
        const mark = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), warn);
        mark.position.set(x, y, z + lift);
        this.content.add(mark);
        continue;
      }
      // 守られていない角と、爪の間が空きすぎの所（縁の上の真ん中）
      if (p.target.kind !== "corner" && !(p.target.kind === "gap" && p.target.point)) continue;
      const q = p.target.point!;
      const t = stones[stoneOf(p)].transform;
      const [x, y, z] = placePoint(t, q.x, q.y, 0.2);
      const mark = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), warn);
      mark.position.set(x, y, z + lift);
      this.content.add(mark);
    }
    const marks = spotMarks(ring.shank, problems, lift, warn);
    marks.forEach((m) => this.content.add(m));
    this.live = { shank, marks, lift, warn };
    this.applyMode();
    if (!this.keepCamera) this.frame("ring", new THREE.Vector3(0.9, -1.1, 0.75));
    this.alignGrid(this.gridView);
    this.updateShadow();
  }

  /**
   * 腕だけを差し替える（断面の点を動かしている間。石と石座はそのまま、影も描き直さない）。
   * 指を離したら、いつもの setRing で全部を作り直す
   */
  updateShank(shank: ShankResult, problems: Problem[]) {
    const L = this.live;
    if (!L) return;
    this.contentVersion++;
    const old = L.shank.geometry;
    L.shank.geometry = shank.normals ? smoothGeometry(shank.positions, shank.normals) : metalGeometry(shank.positions);
    old.dispose();
    const ud = L.shank.userData;
    if (ud.edges) {
      const e = ud.edges as THREE.LineSegments;
      e.parent?.remove(e);
      e.geometry.dispose();
      ud.edges = undefined;
    }
    for (const m of L.marks) {
      this.content.remove(m);
      m.geometry.dispose();
    }
    L.marks = spotMarks(shank, problems, L.lift, L.warn);
    L.marks.forEach((m) => this.content.add(m));
    this.applyMode();
  }

  private addStone(positions: Float32Array, ranges: readonly { start: number; count: number }[] | undefined, look: StoneLook, z: number, depthMm: number) {
    const geo = geometry(positions);
    // 色は「通り抜ける光が石の中で染まる」ように付ける（中を長く進むほど濃い）
    const tint = look.colorless ? new THREE.Color(1, 1, 1) : stoneColor(look.color);
    const dist = Math.max(2.5, depthMm * 2);
    const sigma = (v: number) => (look.colorless ? 0 : -Math.log(Math.max(0.02, Math.min(1, v))) / dist);
    const mat = gemMaterial(geo, positions, ranges, { ior: look.colorless ? COLORLESS_IOR : COLORED_IOR, sigma: [sigma(tint.r), sigma(tint.g), sigma(tint.b)] }, this.gemShared, this.quality.gem);
    const stone = new THREE.Mesh(geo, mat);
    stone.position.z = z;
    this.content.add(stone);
  }

  /** 置いた所の影を、今の中身から描き直す（中身が変わったときだけ。回すだけなら描き直さない） */
  private updateShadow() {
    this.content.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.content);
    if (box.isEmpty()) return;
    this.shadow.render(this.renderer, this.scene, this.content, box);
    this.shadowReady = true;
    this.showShadow();
    this.dirty = true;
  }

  /** 中身に合わせてカメラを寄せる。同じ種類の表示が続くときは、人が回した向きを保つ */
  private frame(kind: string, firstDir: THREE.Vector3) {
    const box = new THREE.Box3().setFromObject(this.content);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dir = this.framedFor === kind ? this.cams.angleDir(this.controls.target) : firstDir.clone().normalize();
    this.framedFor = kind;
    this.controls.target.copy(sphere.center);
    // 縦長の画面（スマホ）では、横幅に収まるように遠くから
    const h = this.host.clientHeight || 1;
    const aspect = (this.host.clientWidth || 1) / h;
    const free = Math.max(0.5, (h - this.insets.top - this.insets.bottom) / h);
    const fit = (aspect < 1 ? Math.min(2.2, 1 / aspect) : 1) / free;
    // 平らな図の間は、平らな図の大きさを合わせ、戻ったときの斜めの視点も寄せ直す
    this.cams.frame(sphere.center, sphere.radius, fit, dir);
    this.controls.update();
    this.dirty = true;
  }

  /** 黒い撮影台にする（継ぐの設計の画面）。床の影は黒の上では見えないので薄く */
  /** 暗い画面か（継ぐの設計の画面） */
  private darkOn = false;
  /** 暗い画面では、レンダーは黒い撮影台、シェード・ワイヤーは CAD の作業画面のような灰色（作者：調整はシェードの灰色で） */
  private applyBackdrop() {
    if (!this.darkOn || this.presenting) return;
    this.scene.background = this.mode === "render" ? darkBackdropTexture() : grayBackdropTexture();
    this.applyGridLook();
    this.dirty = true;
  }
  /** 方眼の線の色：黒い撮影台・CAD の灰色・紙の色 */
  private applyGridLook() {
    const look = !this.darkOn ? "paper" : this.mode === "render" ? "dark" : "gray";
    this.cad.setLook(GRID_LOOK[look]);
    // 寸法の線の色を背景に合わせるため（CSS が読む）
    this.host.dataset.backdrop = look;
    this.dirty = true;
  }
  setDark(on: boolean) {
    this.darkOn = on;
    this.scene.background = on ? (this.mode === "render" ? darkBackdropTexture() : grayBackdropTexture()) : backdropTexture();
    // 暗い画面の目盛りは、CAD の作業面のように（背景の色に合わせる）
    this.grid.visible = on;
    this.applyGridLook();
    (this.shadow.plane.material as THREE.MeshBasicMaterial).opacity = on ? 0.25 : SHADOW.opacity;
    this.dirty = true;
  }

  /** 平らな図（正面・横・上）か。パースのない正射カメラで、回せない（動かす・寄るだけ）。寸法を正しく読むための図 */
  get isFlat(): boolean {
    return this.cams.flat;
  }
  /** 今の向き */
  get view(): ViewName {
    return this.cams.view;
  }
  /**
   * 平らな図の向きと大きさ（寸法を図面のように引くため）。斜めでは null。
   * dir：見ている所 → カメラ、right・up：画面の右・上（世界の向き）、mmPerPx：画面の 1 px が何 mm か、box：中身の箱
   */
  get flatView(): FlatViewInfo | null {
    const ppm = this.cams.pxPerMm(this.host.clientHeight || 1);
    if (ppm === null) return null;
    const box = new THREE.Box3().setFromObject(this.content);
    if (box.isEmpty()) return null;
    const cam = this.cams.ortho;
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements;
    const t = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];
    return {
      dir: t(VIEW_DIR[this.cams.view]),
      right: [e[0], e[1], e[2]],
      up: [e[4], e[5], e[6]],
      mmPerPx: 1 / ppm,
      box: { min: t(box.min), max: t(box.max) },
    };
  }
  /** 決まった向きから見る（上・横・正面・斜め）。正面・横・上は正射の平らな図に、斜めに戻すと前の斜めの視点に */
  setView(view: ViewName) {
    this.applyView(view);
    this.alignGrid(view);
    this.dirty = true;
  }
  private applyView(view: ViewName) {
    // 回している途中の勢いは止める（平らな図が少し回ってしまわないように）
    const c = this.controls as unknown as { _sphericalDelta?: THREE.Spherical; _panOffset?: THREE.Vector3 };
    c._sphericalDelta?.set(0, 0, 0);
    c._panOffset?.set(0, 0, 0);
    this.cams.setView(view, this.controls.target);
    this.useCamera();
  }
  /** 今のカメラを、ドラッグの操作につなぐ */
  private useCamera() {
    this.camera = this.cams.active;
    this.controls.object = this.camera;
    this.controls.enableRotate = !this.cams.flat;
    // 平らな図は回せないので、左ドラッグと指 1 本は「動かす」（右ドラッグでしか動かなかった）。斜めに戻すと「回す」
    this.controls.mouseButtons.LEFT = this.cams.flat ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = this.cams.flat ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    this.controls.autoRotate = this.wantRotate && !this.cams.flat;
    this.controls.update();
    this.host.dataset.view = this.cams.view;
  }

  /**
   * 方眼を、見ている向きの後ろに立てる（CAD の作業画面のように）。
   * 斜め・上：床（指輪の下）。正面：指輪の奥に y・z の面。横：指輪の奥に x・z の面
   */
  private gridView: ViewName = "angle";
  private alignGrid(view: ViewName) {
    this.gridView = view;
    const box = new THREE.Box3().setFromObject(this.content);
    const empty = box.isEmpty();
    const c = empty ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    if (view === "front") {
      // 正面（+x、指の軸の向きから見る）：奥（-x）に、y-z の面
      this.cad.setPlane("y", "z", new THREE.Vector3(empty ? 0 : box.min.x - 2, c.y, c.z));
    } else if (view === "side") {
      // 横（-y から見る）：奥（+y）に、x-z の面
      this.cad.setPlane("x", "z", new THREE.Vector3(c.x, empty ? 0 : box.max.y + 2, c.z));
    } else {
      this.cad.setPlane("x", "y", new THREE.Vector3(c.x, c.y, empty ? 0 : box.min.z - 0.01));
    }
    this.showShadow();
    this.dirty = true;
  }
  /** 床の影：斜めのときだけ（平らな図は図面なので出さない。ワイヤー・見せるでも出さない） */
  private shadowReady = false;
  private showShadow() {
    this.shadow.plane.visible = this.shadowReady && !this.cams.flat && this.mode !== "wire" && !this.presenting;
  }

  /** 方眼の線の間と、薄くなる所を、今のカメラに合わせる（描く前に毎回。軽い） */
  private gridNow = { minor: 1, major: 10 };
  private updateGrid() {
    const pr = this.renderer.getPixelRatio();
    const t = this.controls.target;
    const ppm = this.cams.pxPerMm(this.host.clientHeight || 1);
    if (ppm !== null) {
      // 平らな図：読みやすい間（1・2・5 mm…）を、寄り具合で選ぶ。画面いっぱいに、薄くせずに
      this.gridNow = gridSpacing(ppm);
      const span = (this.host.clientWidth + this.host.clientHeight) / ppm;
      this.cad.update(this.gridNow.minor, this.gridNow.major, pr, [span * 4, span * 6], t);
    } else {
      // 斜め：1 mm と 10 mm。見ている所からの距離の 8 倍から薄くし、40 倍で消える（ほぼ地平線）
      this.gridNow = { minor: 1, major: 10 };
      const r = Math.max(10, this.camera.position.distanceTo(t));
      this.cad.update(1, 10, pr, [r * 8, r * 40], t);
    }
  }
  /** 平らな図の目盛りの数字（mm）：画面の下と左の端に。1 マスの大きさも書く */
  private rulerKey = "";
  private drawRuler() {
    const f = this.flatView;
    if (!f || !this.grid.visible || this.presenting) {
      if (this.rulerKey) this.ruler.innerHTML = "";
      this.rulerKey = "";
      return;
    }
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const ppm = 1 / f.mmPerPx;
    const { minor, major } = this.gridNow;
    const step = labelStep(major, ppm);
    const cls = !this.darkOn ? "paper" : this.mode === "render" ? "dark" : "gray";
    const parts: string[] = [];
    const fmt = (v: number) => {
      const r = Math.round(v / step) * step;
      return Math.abs(r) < 1e-9 ? "0" : Number(r.toFixed(step < 1 ? 1 : 0)).toString();
    };
    const axisOf = (v: [number, number, number]) => (Math.abs(v[0]) > 0.9 ? 0 : Math.abs(v[1]) > 0.9 ? 1 : 2);
    const sgnR = Math.sign(f.right[axisOf(f.right)]);
    const sgnU = Math.sign(f.up[axisOf(f.up)]);
    // 世界の原点が画面のどこに写るか（そこから mm を数える）
    const c = this.project(0, 0, 0);
    if (!c) return;
    const yBase = h - this.insets.bottom - 8;
    const xBase = 8;
    // 右下に、単位と 1 マスの大きさ。横の数字は、そこに重ねない
    const unit = `単位 mm・1 マス ${minor}・太い線 ${major}`;
    let unitW = 0;
    for (const ch of unit) unitW += ch.charCodeAt(0) < 0x2e80 ? 6.1 : 10;
    const xMax = w - 8 - unitW - 18;
    {
      // 横の数字（画面の下の端）
      const a = ((0 - c.x) / ppm) * sgnR;
      const b = ((w - c.x) / ppm) * sgnR;
      for (let v = Math.ceil(Math.min(a, b) / step) * step; v <= Math.max(a, b); v += step) {
        const x = c.x + v * sgnR * ppm;
        if (x < 40 || x > xMax) continue;
        parts.push(`<text x="${x.toFixed(1)}" y="${yBase.toFixed(1)}" text-anchor="middle">${fmt(v)}</text>`);
      }
    }
    {
      // 縦の数字（画面の左の端）
      const a = (c.y / ppm) * sgnU;
      const b = ((c.y - h) / ppm) * sgnU;
      for (let v = Math.ceil(Math.min(a, b) / step) * step; v <= Math.max(a, b); v += step) {
        const y = c.y - v * sgnU * ppm;
        if (y < this.insets.top + 14 || y > yBase - 16) continue;
        parts.push(`<text x="${xBase}" y="${(y + 3.5).toFixed(1)}" text-anchor="start">${fmt(v)}</text>`);
      }
    }
    parts.push(`<text x="${w - 8}" y="${yBase.toFixed(1)}" text-anchor="end">${unit}</text>`);
    const key = `${cls}|${parts.join("")}`;
    if (key === this.rulerKey) return;
    this.rulerKey = key;
    const color = { dark: "rgba(225,226,230,.66)", gray: "rgba(28,29,32,.78)", paper: "rgba(92,84,70,.8)" }[cls];
    const halo = { dark: "rgba(20,20,22,.85)", gray: "rgba(170,172,176,.9)", paper: "rgba(248,246,242,.9)" }[cls];
    this.ruler.innerHTML = `<g font-family="ui-monospace,Menlo,monospace" font-size="10" fill="${color}" stroke="${halo}" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${parts.join("")}</g>`;
  }

  /** 決まった向きから見た画像（look の道具）。今の視点は元に戻す */
  snapshotFrom(view: ViewName): string {
    const keep = this.cams.state(this.controls.target);
    const grid = this.gridView;
    this.applyView(view);
    this.alignGrid(view);
    this.updateGrid();
    this.syncLights();
    // 選んだ爪の印は、Claude に渡す画像に入れない
    if (this.prongMark) this.prongMark.visible = false;
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    if (this.prongMark) this.prongMark.visible = true;
    this.cams.restore(keep, this.controls.target);
    this.useCamera();
    this.alignGrid(grid);
    this.dirty = true;
    return url;
  }

  /**
   * 図面の 1 面：正射（遠近のない）カメラで、白い面と黒い線（輪郭と折れ目）で描いた画像。
   * pxPerMm：画像の 1 mm が何 px か。project で 3D の点（mm）を画像の点（px）に写せる。
   */
  drawing(view: "front" | "side" | "top", pxPerMm: number, marginMm = 4) {
    this.content.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.content.traverse((o) => {
      if (o instanceof THREE.Mesh) box.expandByObject(o);
    });
    // 見る向き（カメラの前・上）と、画像の右・上に来る軸
    const dir = { front: new THREE.Vector3(-1, 0, 0), side: new THREE.Vector3(0, 1, 0), top: new THREE.Vector3(0, 0, -1) }[view];
    const up = view === "top" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const corners: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const rs = corners.map((c) => c.dot(right));
    const us = corners.map((c) => c.dot(up));
    const r0 = Math.min(...rs) - marginMm;
    const r1 = Math.max(...rs) + marginMm;
    const u0 = Math.min(...us) - marginMm;
    const u1 = Math.max(...us) + marginMm;
    const wMm = r1 - r0;
    const hMm = u1 - u0;
    const W = Math.round(wMm * pxPerMm);
    const H = Math.round(hMm * pxPerMm);
    const center = box.getCenter(new THREE.Vector3());
    const cam = new THREE.OrthographicCamera(r0, r1, u1, u0, 0.1, 1000);
    // カメラの座標で r・u がそのまま左右・上下になるよう、原点を通る線の上に置く
    cam.up.copy(up);
    cam.position.copy(dir.clone().multiplyScalar(-200).add(center.clone().sub(right.clone().multiplyScalar(center.dot(right))).sub(up.clone().multiplyScalar(center.dot(up)))));
    cam.lookAt(cam.position.clone().add(dir));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    // 線画の場面：白い面（奥の線を隠す）＋ 黒い折れ目の線 ＋ 外へ少しふくらませた裏面（輪郭）
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    const ink = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
    const line = new THREE.LineBasicMaterial({ color: 0x111111 });
    const thin = new THREE.LineBasicMaterial({ color: 0x8a8a8a });
    const temp: THREE.BufferGeometry[] = [];
    this.content.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.geometry.type === "SphereGeometry") return;
      const stone = isStone(o.userData.render ?? o.material);
      const face = new THREE.Mesh(o.geometry, white);
      face.applyMatrix4(o.matrixWorld);
      const eg = new THREE.EdgesGeometry(o.geometry, stone ? 10 : 28);
      temp.push(eg);
      const edges = new THREE.LineSegments(eg, stone ? thin : line);
      edges.applyMatrix4(o.matrixWorld);
      scene.add(face, edges);
      if (!stone && o.geometry.getAttribute("normal")) {
        const g = o.geometry.clone();
        const pos = g.getAttribute("position");
        const nor = g.getAttribute("normal");
        const t = 1.3 / pxPerMm;
        for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * t, pos.getY(i) + nor.getY(i) * t, pos.getZ(i) + nor.getZ(i) * t);
        temp.push(g);
        const hull = new THREE.Mesh(g, ink);
        hull.applyMatrix4(o.matrixWorld);
        scene.add(hull);
      }
    });
    // 倍の大きさで描いて縮める。Mac の Safari は、多重サンプルの描き先からの読み出しが空になった（2026-11-05 実測）
    const SS = 2;
    const rt = new THREE.WebGLRenderTarget(W * SS, H * SS);
    const prevTone = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(scene, cam);
    const buf = new Uint8Array(W * SS * H * SS * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, W * SS, H * SS, buf);
    this.renderer.setRenderTarget(null);
    this.renderer.toneMapping = prevTone;
    rt.dispose();
    temp.forEach((g) => g.dispose());
    const big = document.createElement("canvas");
    big.width = W * SS;
    big.height = H * SS;
    const bigImg = big.getContext("2d")!.createImageData(W * SS, H * SS);
    // 読み出しは下から上なので、上下を返す
    for (let y = 0; y < H * SS; y++) bigImg.data.set(buf.subarray((H * SS - 1 - y) * W * SS * 4, (H * SS - y) * W * SS * 4), y * W * SS * 4);
    big.getContext("2d")!.putImageData(bigImg, 0, 0);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(big, 0, 0, W, H);
    this.dirty = true;
    const project = (x: number, y: number, z: number) => {
      const p = new THREE.Vector3(x, y, z);
      return { x: (p.dot(right) - r0) * pxPerMm, y: (u1 - p.dot(up)) * pxPerMm };
    };
    return { url: c.toDataURL("image/png"), widthMm: wMm, heightMm: hMm, widthPx: W, heightPx: H, project, box: { min: box.min.toArray(), max: box.max.toArray() } };
  }

  /** 今の 3D の画像（指示書や look の道具で使う） */
  snapshot(): string {
    this.updateGrid();
    this.syncLights();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
}

/**
 * 床に落ちる淡い影。床（z ＝ 0）から真上を向いた正射のカメラで、床に近い部分ほど濃く写し、ぼかして床に貼る。
 * 光の向きによらない「置いた所が少し暗い」影なので、どの向きから見ても自然に見える。
 */
export class ContactShadow {
  readonly plane: THREE.Mesh;
  private target = new THREE.WebGLRenderTarget(SHADOW.size, SHADOW.size);
  private temp = new THREE.WebGLRenderTarget(SHADOW.size, SHADOW.size);
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, SHADOW.reachMm);
  private depth: THREE.MeshDepthMaterial;
  private blur = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, step: { value: new THREE.Vector2() } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    // 9 点のガウスぼかし（縦か横の片方ずつ）
    fragmentShader: `uniform sampler2D tex; uniform vec2 step; varying vec2 vUv;
      void main() {
        float w[5] = float[5](0.227, 0.194, 0.121, 0.054, 0.016);
        vec4 c = texture2D(tex, vUv) * w[0];
        for (int i = 1; i < 5; i++) {
          c += texture2D(tex, vUv + step * float(i)) * w[i];
          c += texture2D(tex, vUv - step * float(i)) * w[i];
        }
        gl_FragColor = c;
      }`,
  });
  private quad = new FullScreenQuad(this.blur);

  constructor() {
    this.target.texture.generateMipmaps = false;
    this.temp.texture.generateMipmaps = false;
    this.depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
    // 床に近いほど濃く、高いほど薄く
    this.depth.onBeforeCompile = (shader) => {
      shader.uniforms.darkness = { value: SHADOW.darkness };
      shader.fragmentShader = `uniform float darkness;\n${shader.fragmentShader}`.replace(
        "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
        "gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 2.0 ) * darkness );",
      );
    };
    const mat = new THREE.MeshBasicMaterial({ map: this.target.texture, transparent: true, opacity: SHADOW.opacity, depthWrite: false, side: THREE.DoubleSide });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.plane.renderOrder = -1;
    this.plane.visible = false;
    // 真上を向いたカメラの写真は左右が逆になるので、床の板も左右を返す
    this.camera.up.set(0, 1, 0);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, content: THREE.Object3D, box: THREE.Box3) {
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    const half = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) * 0.75 + 2;
    this.camera.left = -half;
    this.camera.right = half;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.position.set(cx, cy, 0);
    this.camera.lookAt(cx, cy, 1);
    this.camera.updateProjectionMatrix();
    this.plane.scale.set(-2 * half, 2 * half, 1);
    this.plane.position.set(cx, cy, 0.001);

    // 中身だけを、濃さの材質で写す
    const keep = { bg: scene.background, override: scene.overrideMaterial, target: renderer.getRenderTarget(), clear: renderer.getClearAlpha() };
    const hidden = scene.children.filter((o) => o !== content && o.visible);
    for (const o of hidden) o.visible = false;
    scene.background = null;
    scene.overrideMaterial = this.depth;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, this.camera);
    scene.overrideMaterial = keep.override;
    scene.background = keep.bg;
    for (const o of hidden) o.visible = true;

    // ぼかす（横 → 縦 を何回か）
    const px = 1 / SHADOW.size;
    for (let i = 0; i < SHADOW.blurPasses; i++) {
      const spread = 1 + i;
      this.blur.uniforms.tex.value = this.target.texture;
      this.blur.uniforms.step.value.set(px * spread, 0);
      renderer.setRenderTarget(this.temp);
      this.quad.render(renderer);
      this.blur.uniforms.tex.value = this.temp.texture;
      this.blur.uniforms.step.value.set(0, px * spread);
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
    }
    renderer.setRenderTarget(keep.target);
    renderer.setClearColor(0x000000, keep.clear);
    this.plane.visible = true;
  }
}

/**
 * 映り込み用の撮影台：上が明るく下が暗い大きな球の内側に、やわらかい光の箱をいくつか置く。
 * 金属の面に、すっと伸びた明るい帯と、なめらかな濃淡が映る。
 */
export function studioScene(): THREE.Scene {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      // z が上。床の近くは暗く、上は明るい
      fragmentShader: `varying vec3 vDir;
        void main() {
          float h = vDir.z;
          vec3 low = vec3(0.05, 0.048, 0.045);
          vec3 mid = vec3(0.2, 0.195, 0.19);
          vec3 high = vec3(0.62, 0.61, 0.60);
          vec3 c = h < 0.0 ? mix(mid, low, smoothstep(0.0, 0.6, -h)) : mix(mid, high, smoothstep(0.0, 0.8, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  s.add(dome);
  const box = (w: number, h: number, intensity: number, pos: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity * 0.97), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  box(18, 26, 9.0, [-22, -14, 20]); // 左手前の上：主な光
  box(8, 30, 7.0, [26, -6, 8]); // 右：細長い帯
  box(30, 6, 5.0, [0, 26, 14]); // 奥：縁を光らせる
  box(16, 16, 6.0, [0, 0, 40]); // 真上
  box(6, 22, 3.0, [-8, 28, -4]); // 奥の低い所：下側の縁に細い光
  box(40, 40, 0.5, [0, 0, -30]); // 床の白い板：下を向いた面の暗さを少しやわらげる
  return s;
}

function grayBackdropTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  // CAD の作業画面のような、明るめの中立の灰色（上が少し明るい）
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#b4b6ba");
  grad.addColorStop(1, "#8c8e93");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function darkBackdropTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  // CAD の作業画面のような、上が少し明るい中立の灰色
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#36373b");
  grad.addColorStop(1, "#1b1c1e");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 背景：真ん中がわずかに明るい、紙のような淡い色 */
export function backdropTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(256, 210, 20, 256, 256, 380);
  grad.addColorStop(0, BACKDROP.center);
  grad.addColorStop(1, BACKDROP.edge);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function geometry(positions: Float32Array): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 金属はなめらかに（40° より鋭い折れ目だけ角として残す）。石は面ごとに平らなまま */
/** 向きが決まっている形（一体の石座）。折れ目の線は細かいでこぼこを拾わないよう、角度を大きく */
function smoothGeometry(positions: Float32Array, normals: Float32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  g.userData.smooth = true;
  return g;
}

/** 腕の薄い所を 1 周光らせる線の太さ（半径 mm。見せるための値） */
const SPOT_LINE_RADIUS_MM = 0.09;

/**
 * 腕の断面の、局所的に薄い所（とがり・ヒレ）の印：薄い所は腕を 1 周するので、その線を 1 周赤く光らせる
 * （2026-11-05 作者：1 か所の赤い玉ではおかしい）。腕の間に挟む石座では、腕の切れている所は通らない
 */
function spotMarks(sh: ShankResult, problems: Problem[], lift: number, warn: THREE.Material): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const p of problems) {
    if (p.target.kind !== "shank-spot") continue;
    const rho = sh.innerRadiusMm + p.target.y;
    const x = (p.target.x * sh.sideWidthMm) / sh.widthMm;
    const endY = Math.max(0, ...(sh.ends ?? []).map((e) => Math.abs(e.y)));
    const open = Math.asin(Math.min(1, endY / rho));
    // 輪の面は指の軸（x）に直角。切れ目がいちばん上に来るように回す
    const geo = new THREE.TorusGeometry(rho, SPOT_LINE_RADIUS_MM, 12, 180, 2 * Math.PI - 2 * open);
    geo.rotateZ(Math.PI + open);
    geo.rotateY(Math.PI / 2);
    const mark = new THREE.Mesh(geo, warn);
    mark.position.set(x, 0, lift);
    out.push(mark);
  }
  return out;
}

function metalGeometry(positions: Float32Array): THREE.BufferGeometry {
  return toCreasedNormals(geometry(positions), (40 * Math.PI) / 180);
}

/** 写真の平均の色は、反射の白が混じって淡くなる。3D では少し濃くして本物に近づける */
function stoneColor(c: { r: number; g: number; b: number }): THREE.Color {
  const col = new THREE.Color(c.r / 255, c.g / 255, c.b / 255);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  return col.setHSL(hsl.h, Math.min(1, hsl.s * 1.6), hsl.l * 0.82);
}
