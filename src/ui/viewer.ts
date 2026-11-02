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
  /** 描き直しが要るか（動いていない間は描かない。スマホの電池のため） */
  private dirty = true;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    // 金の色が転ばないよう、色をそのまま保つ写し方にする
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(studioScene(), 0.015).texture;
    pmrem.dispose();
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
      if (moved || this.dirty) {
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

  /** 1 mm の目盛りを出す・隠す */
  setGrid(show: boolean) {
    this.grid.visible = show;
    this.dirty = true;
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

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (this.lift > 0) this.camera.setViewOffset(w, h, 0, h * this.lift, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private clear() {
    for (const o of [...this.content.children]) {
      this.content.remove(o);
      o.traverse((m) => {
        if (m instanceof THREE.Mesh || m instanceof THREE.LineSegments) m.geometry.dispose();
      });
    }
  }

  /** 石だけ（指輪を組む前） */
  setStone(mesh: StoneMesh, look: StoneLook) {
    this.clear();
    this.addStone(mesh.positions, look, -mesh.heights.culetZ, mesh.heights.tableZ - mesh.heights.culetZ);
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
    const settingGeo = metalGeometry(ring.ringPositions.setting);
    const ranges = ring.setting.prongs
      .map((pr, i) => ({ ...pr.triangles, bad: badProngs.has(i) }))
      .filter((r) => r.bad)
      .sort((a, b) => a.start - b.start);
    const total = ring.ringPositions.setting.length / 9;
    let cursor = 0;
    for (const r of ranges) {
      if (r.start > cursor) settingGeo.addGroup(cursor * 3, (r.start - cursor) * 3, 0);
      settingGeo.addGroup(r.start * 3, r.count * 3, 1);
      cursor = r.start + r.count;
    }
    if (cursor < total) settingGeo.addGroup(cursor * 3, (total - cursor) * 3, 0);
    const setting = new THREE.Mesh(settingGeo, [metal, warn]);
    const shank = new THREE.Mesh(metalGeometry(ring.ringPositions.shank), metal);
    setting.position.z = lift;
    shank.position.z = lift;
    this.content.add(setting, shank);
    // 守られていない角の赤い印（石の座標 → 指輪の座標）
    const c = Math.cos(ring.transform.rotationZ);
    const s = Math.sin(ring.transform.rotationZ);
    for (const p of problems) {
      if (p.target.kind !== "corner") continue;
      const q = p.target.point;
      const mark = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), warn);
      mark.position.set(q.x * c - q.y * s, q.x * s + q.y * c, ring.transform.translateZ + lift + 0.2);
      this.content.add(mark);
    }
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
    this.content.add(stone, edges);
  }

  /** 置いた所の影を、今の中身から描き直す（中身が変わったときだけ。回すだけなら描き直さない） */
  private updateShadow() {
    this.content.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.content);
    if (box.isEmpty()) return;
    this.shadow.render(this.renderer, this.scene, this.content, box);
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
    const fit = this.camera.aspect < 1 ? Math.min(2.2, 1 / this.camera.aspect) : 1;
    this.camera.position.copy(sphere.center).addScaledVector(dir, sphere.radius * 3.6 * fit);
    this.controls.update();
    this.dirty = true;
  }

  /** 黒い撮影台にする（継ぐの設計の画面）。床の影は黒の上では見えないので薄く */
  setDark(on: boolean) {
    this.scene.background = on ? darkBackdropTexture() : backdropTexture();
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
function darkBackdropTexture(): THREE.Texture {
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
