// 右の大きな 3D。ドラッグで回す。単位は mm。z が上。
// 問題のある爪は赤く、守られていない角には赤い印（SPEC「画面と操作」）。
// 見た目は、宝飾品の写真の撮影台に近づける：やわらかい光の箱の映り込み、置いた所の淡い影、
// 光を通して曲げる石、うっすらとした背景（1 mm の目盛りは setGrid(true) で出す）。
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RingDesign } from "../geometry/ring";
import type { StoneMesh } from "../geometry/stone";
import type { MetalId } from "../rules/guides";
import type { Problem } from "../rules/checks";

export type DisplayMode = "render" | "shaded" | "wire";

const isStone = (m: THREE.Material | THREE.Material[]) => !Array.isArray(m) && m instanceof THREE.MeshPhysicalMaterial && m.transmission > 0;
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

export interface StoneLook {
  color: { r: number; g: number; b: number };
  colorless: boolean;
}

/** 地金の見た目（鏡面の光） */
const METAL_COLOR: Record<MetalId, number> = { k18y: 0xe9c17a, pt900: 0xdcdcde, sv925: 0xe8e8ea };
const WARN = 0xe0342b;
/** 背景のうっすらとした明るさの変化（真ん中 → 外） */
const BACKDROP = { center: "#f8f6f2", edge: "#e2ddd4" };
/** 置いた所の影：どの高さまでの部分が影を落とすか（mm）・濃さ・ぼかし（回数） */
const SHADOW = { reachMm: 7, darkness: 0.85, opacity: 0.55, blurPasses: 3, size: 256 };

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
  private controls: OrbitControls;
  private content = new THREE.Group();
  private grid: THREE.GridHelper;
  private shadow: ContactShadow;
  private framedFor = "";
  /** 今の指輪で、作れない所に使っている赤い材質（点滅させる。なければ null） */
  private warnMat: THREE.MeshPhysicalMaterial | null = null;
  /** 描き直しが要るか（動いていない間は描かない。スマホの電池のため） */
  private dirty = true;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    // 金の色が転ばないよう、色をそのまま保つ写し方にする
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);
    const makeEnv = () => {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(studioScene(), 0.015).texture;
      pmrem.dispose();
    };
    makeEnv();
    // スマホなどで描く力が足りず、3D の描画がいったん消えて戻ったとき、映り込みの光を作り直す（作り直さないと金属が真っ黒になる）
    this.renderer.domElement.addEventListener("webglcontextrestored", () => makeEnv());
    this.scene.background = backdropTexture();
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(14, -18, 14);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotateSpeed = 1.6;
    // 1 mm の目盛り（ふだんは隠す）
    this.grid = new THREE.GridHelper(40, 40, 0xc9c1b4, 0xe0dad0);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.visible = false;
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
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
        for (const f of this.frameListeners) f();
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

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
  setDisplayMode(m: DisplayMode) {
    this.mode = m;
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
      if (!ud.edges) {
        // 面の折れ目の線（シェードでは濃く、ワイヤーフレームでは明るく）
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, o.geometry.userData.smooth ? 60 : 14), new THREE.LineBasicMaterial({ color: 0xd8d8dc, transparent: true, opacity: 0.9 }));
        e.position.copy(o.position);
        e.rotation.copy(o.rotation);
        e.scale.copy(o.scale);
        ud.edges = e;
        o.parent!.add(e);
      }
      const edges = ud.edges as THREE.LineSegments;
      const lm = edges.material as THREE.LineBasicMaterial;
      if (this.mode === "render") {
        o.material = ud.render;
        o.visible = true;
        edges.visible = false;
      } else if (this.mode === "shaded") {
        o.material = Array.isArray(ud.render) ? (ud.render as THREE.Material[]).map(shadedOf) : shadedOf(ud.render);
        o.visible = true;
        // 地金の面の折れ目の線は出さない（腕に細かい線がたくさん出て「何の線？」となるため。作者の声）。石の面の線だけ出す
        edges.visible = isStone(ud.render);
        lm.color.setHex(0x141416);
        lm.opacity = 0.55;
      } else {
        o.visible = false;
        edges.visible = true;
        lm.color.setHex(isStone(ud.render) ? (this.darkOn ? 0x1d5fb0 : 0x8fc3ff) : this.darkOn ? 0x2a2b2e : 0xd8d8dc);
        lm.opacity = 0.9;
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
    this.grid.visible = show;
    this.dirty = true;
  }

  /** 指輪のまわりを、上の軸で rad だけ回って、すぐ描く（動画を 1 コマずつ撮るため） */
  turn(rad: number) {
    const t = this.controls.target;
    const p = this.camera.position.clone().sub(t);
    p.applyAxisAngle(new THREE.Vector3(0, 0, 1), rad);
    this.camera.position.copy(t).add(p);
    this.camera.lookAt(t);
    this.renderer.render(this.scene, this.camera);
    for (const f of this.frameListeners) f();
  }

  /** ゆっくり自動で回す（動画や見せるとき）。人がドラッグすれば、その向きから続けて回る */
  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on;
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
    this.camera.aspect = w / h;
    // 上下のボタンの間の真ん中に、中身の真ん中が来るようにずらす
    const dy = h * this.lift + (this.insets.bottom - this.insets.top) / 2;
    if (dy !== 0) this.camera.setViewOffset(w, h, 0, dy, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private clear() {
    this.warnMat = null;
    for (const o of [...this.content.children]) {
      this.content.remove(o);
      o.traverse((m) => {
        if (m instanceof THREE.Mesh || m instanceof THREE.LineSegments) m.geometry.dispose();
      });
    }
  }

  /** 地金だけの形（石のない指輪など）。三角形の並び、mm。いちばん下を床（z ＝ 0）に置く */
  setMetalMesh(positions: Float32Array, metal: MetalId, kind = "metal") {
    this.clear();
    const mat = new THREE.MeshPhysicalMaterial({ color: METAL_COLOR[metal], metalness: 1, roughness: 0.1, envMapIntensity: 1.0, side: THREE.DoubleSide });
    this.content.add(new THREE.Mesh(metalGeometry(positions), mat));
    this.applyMode();
    this.frame(kind, new THREE.Vector3(0.95, -1.15, 0.55));
    this.updateShadow();
  }

  /** 石だけ（指輪を組む前） */
  setStone(mesh: StoneMesh, look: StoneLook) {
    this.clear();
    this.addStone(mesh.positions, look, -mesh.heights.culetZ, mesh.heights.tableZ - mesh.heights.culetZ);
    this.applyMode();
    this.frame("stone", new THREE.Vector3(0.25, -0.75, 1));
    this.updateShadow();
  }

  /** 石・石座・腕のそろった指輪。指の軸は x、腕の一番下を床（z ＝ 0）に置く */
  setRing(ring: RingDesign, look: StoneLook, problems: Problem[]) {
    this.clear();
    const lift = ring.shank.outerRadiusMm;
    const h = ring.stone.heights;
    this.addStone(ring.ringPositions.stone, look, lift, h.tableZ - h.culetZ);
    const metal = new THREE.MeshPhysicalMaterial({
      color: METAL_COLOR[ring.metal],
      metalness: 1,
      roughness: 0.1,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
    });
    const warn = new THREE.MeshPhysicalMaterial({ color: WARN, metalness: 0.35, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide });
    // 問題のある爪の三角形だけ、赤い材質の組に分ける
    const badProngs = new Set(problems.flatMap((p) => (p.target.kind === "prong" ? [p.target.index] : [])));
    // 覆輪の壁が薄いときは石座ぜんぶ、腕が細い・薄いときは腕を赤く
    const badBezel = problems.some((p) => p.target.kind === "bezel");
    const badShank = problems.some((p) => p.target.kind === "shank");
    this.warnMat = badProngs.size > 0 || badBezel || badShank || problems.some((p) => p.target.kind === "corner" || p.target.kind === "gap") ? warn : null;
    const settingGeo = ring.ringPositions.settingNormals ? smoothGeometry(ring.ringPositions.setting, ring.ringPositions.settingNormals) : metalGeometry(ring.ringPositions.setting);
    const total = ring.ringPositions.setting.length / 9;
    const ranges = badBezel
      ? [{ start: 0, count: total, bad: true }]
      : ring.setting.prongs
          .map((pr, i) => ({ ...pr.triangles, bad: badProngs.has(i) }))
          .filter((r) => r.bad)
          .sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const r of ranges) {
      if (r.start > cursor) settingGeo.addGroup(cursor * 3, (r.start - cursor) * 3, 0);
      settingGeo.addGroup(r.start * 3, r.count * 3, 1);
      cursor = r.start + r.count;
    }
    if (cursor < total) settingGeo.addGroup(cursor * 3, (total - cursor) * 3, 0);
    const setting = new THREE.Mesh(settingGeo, [metal, warn]);
    const shank = new THREE.Mesh(metalGeometry(ring.ringPositions.shank), badShank ? warn : metal);
    setting.position.z = lift;
    shank.position.z = lift;
    this.content.add(setting, shank);
    // 守られていない角の赤い印（石の座標 → 指輪の座標）
    const c = Math.cos(ring.transform.rotationZ);
    const s = Math.sin(ring.transform.rotationZ);
    for (const p of problems) {
      // 守られていない角と、爪の間が空きすぎの所（縁の上の真ん中）
      if (p.target.kind !== "corner" && !(p.target.kind === "gap" && p.target.point)) continue;
      const q = p.target.point!;
      const mark = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), warn);
      mark.position.set(q.x * c - q.y * s, q.x * s + q.y * c, ring.transform.translateZ + lift + 0.2);
      this.content.add(mark);
    }
    this.applyMode();
    this.frame("ring", new THREE.Vector3(0.9, -1.1, 0.75));
    this.updateShadow();
  }

  private addStone(positions: Float32Array, look: StoneLook, z: number, depthMm: number) {
    const geo = geometry(positions);
    const tint = look.colorless ? new THREE.Color(0xffffff) : stoneColor(look.color);
    const mat = new THREE.MeshPhysicalMaterial({
      // 色は「通り抜ける光が石の中で染まる」ように付ける（厚い所ほど濃い）
      color: look.colorless ? 0xffffff : new THREE.Color(0xffffff).lerp(tint, 0.3),
      metalness: 0,
      roughness: 0,
      transmission: 1,
      thickness: depthMm * 0.6,
      ior: look.colorless ? 2.2 : 1.76,
      dispersion: look.colorless ? 0.9 : 0.35,
      attenuationColor: tint,
      attenuationDistance: look.colorless ? Infinity : Math.max(2.5, depthMm * 2),
      specularIntensity: 1,
      envMapIntensity: 1.4,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const stone = new THREE.Mesh(geo, mat);
    // 面の境目をうっすら（形が読めるように。強すぎると図面のように見える）
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 10),
      new THREE.LineBasicMaterial({ color: look.colorless ? 0xb7bec6 : tint.clone().multiplyScalar(0.75), transparent: true, opacity: 0.22 }),
    );
    stone.position.z = z;
    edges.position.z = z;
    edges.userData.renderOnly = true;
    this.content.add(stone, edges);
  }

  /** 置いた所の影を、今の中身から描き直す（中身が変わったときだけ。回すだけなら描き直さない） */
  private updateShadow() {
    this.content.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.content);
    if (box.isEmpty()) return;
    this.shadow.render(this.renderer, this.scene, this.content, box);
    if (this.mode === "wire") this.shadow.plane.visible = false;
    this.dirty = true;
  }

  /** 中身に合わせてカメラを寄せる。同じ種類の表示が続くときは、人が回した向きを保つ */
  private frame(kind: string, firstDir: THREE.Vector3) {
    const box = new THREE.Box3().setFromObject(this.content);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dir =
      this.framedFor === kind ? this.camera.position.clone().sub(this.controls.target).normalize() : firstDir.clone().normalize();
    this.framedFor = kind;
    this.controls.target.copy(sphere.center);
    // 縦長の画面（スマホ）では、横幅に収まるように遠くから
    const h = this.host.clientHeight || 1;
    const free = Math.max(0.5, (h - this.insets.top - this.insets.bottom) / h);
    const fit = (this.camera.aspect < 1 ? Math.min(2.2, 1 / this.camera.aspect) : 1) / free;
    this.camera.position.copy(sphere.center).addScaledVector(dir, sphere.radius * 3.6 * fit);
    this.controls.update();
    this.dirty = true;
  }

  /** 黒い撮影台にする（継ぐの設計の画面）。床の影は黒の上では見えないので薄く */
  /** 暗い画面か（継ぐの設計の画面） */
  private darkOn = false;
  /** 暗い画面では、レンダーは黒い撮影台、シェード・ワイヤーは CAD の作業画面のような灰色（作者：調整はシェードの灰色で） */
  private applyBackdrop() {
    if (!this.darkOn) return;
    this.scene.background = this.mode === "render" ? darkBackdropTexture() : grayBackdropTexture();
    this.dirty = true;
  }
  setDark(on: boolean) {
    this.darkOn = on;
    this.scene.background = on ? (this.mode === "render" ? darkBackdropTexture() : grayBackdropTexture()) : backdropTexture();
    // 暗い画面の目盛りは、うすい灰色（CAD の作業面のように）
    this.scene.remove(this.grid);
    this.grid = on ? new THREE.GridHelper(60, 60, 0x4a4b50, 0x313236) : new THREE.GridHelper(40, 40, 0xc9c1b4, 0xe0dad0);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.visible = on;
    this.scene.add(this.grid);
    (this.shadow.plane.material as THREE.MeshBasicMaterial).opacity = on ? 0.25 : SHADOW.opacity;
    this.dirty = true;
  }

  /** 決まった向きから見る（上・横・正面・斜め）。今の距離のまま */
  setView(view: "top" | "side" | "front" | "angle") {
    const target = this.controls.target.clone();
    const r = this.camera.position.distanceTo(target);
    const dir = { top: new THREE.Vector3(0, -0.001, 1), side: new THREE.Vector3(1, 0, 0.05), front: new THREE.Vector3(0, -1, 0.05), angle: new THREE.Vector3(0.6, -0.8, 0.6) }[view].normalize();
    this.camera.position.copy(target).addScaledVector(dir, r);
    this.controls.update();
    this.dirty = true;
  }

  /** 決まった向きから見た画像（look の道具）。今の視点は元に戻す */
  snapshotFrom(view: "top" | "side" | "front" | "angle"): string {
    const target = this.controls.target.clone();
    const pos = this.camera.position.clone();
    const r = pos.distanceTo(target);
    const dir = { top: new THREE.Vector3(0, -0.001, 1), side: new THREE.Vector3(1, 0, 0.05), front: new THREE.Vector3(0, -1, 0.05), angle: new THREE.Vector3(0.6, -0.8, 0.6) }[view].normalize();
    this.camera.position.copy(target).addScaledVector(dir, r);
    this.camera.lookAt(target);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
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
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    const prevTone = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(scene, cam);
    const buf = new Uint8Array(W * H * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    this.renderer.setRenderTarget(null);
    this.renderer.toneMapping = prevTone;
    rt.dispose();
    temp.forEach((g) => g.dispose());
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const img = c.getContext("2d")!.createImageData(W, H);
    // 読み出しは下から上なので、上下を返す
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    c.getContext("2d")!.putImageData(img, 0, 0);
    this.dirty = true;
    const project = (x: number, y: number, z: number) => {
      const p = new THREE.Vector3(x, y, z);
      return { x: (p.dot(right) - r0) * pxPerMm, y: (u1 - p.dot(up)) * pxPerMm };
    };
    return { url: c.toDataURL("image/png"), widthMm: wMm, heightMm: hMm, widthPx: W, heightPx: H, project, box: { min: box.min.toArray(), max: box.max.toArray() } };
  }

  /** 今の 3D の画像（指示書や look の道具で使う） */
  snapshot(): string {
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

/** 黒い撮影台：真ん中がわずかに明るい、あたたかい黒 */
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
