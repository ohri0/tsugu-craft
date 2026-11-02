// 右の大きな 3D。ドラッグで回す。単位は mm。z が上。
// 問題のある爪は赤く、守られていない角には赤い印（SPEC「画面と操作」）。
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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
const METAL_COLOR: Record<MetalId, number> = { k18y: 0xe2b867, pt900: 0xd8d8da, sv925: 0xe6e6e8 };
const WARN = 0xe0342b;

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  private controls: OrbitControls;
  private content = new THREE.Group();
  private grid: THREE.GridHelper;
  private framedFor = "";
  /** 描き直しが要るか（動いていない間は描かない。スマホの電池のため） */
  private dirty = true;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.background = new THREE.Color(0xf1eee8);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(14, -18, 14);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    // 1 mm の目盛り
    this.grid = new THREE.GridHelper(40, 40, 0xc9c1b4, 0xe0dad0);
    this.grid.rotation.x = Math.PI / 2;
    this.scene.add(this.grid, this.content);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.controls.addEventListener("change", () => (this.dirty = true));
    const loop = () => {
      // 回している間（慣性で動いている間を含む）と、中身が変わったときだけ描く
      const moved = this.controls.update();
      if (moved || this.dirty) {
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
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
    this.addStone(mesh.positions, look, -mesh.heights.culetZ);
    this.frame("stone", new THREE.Vector3(0.25, -0.75, 1));
  }

  /** 石・石座・腕のそろった指輪。指の軸は x、腕の一番下を目盛りに置く */
  setRing(ring: RingDesign, look: StoneLook, problems: Problem[]) {
    this.clear();
    const lift = ring.shank.outerRadiusMm;
    this.addStone(ring.ringPositions.stone, look, lift);
    const metal = new THREE.MeshPhysicalMaterial({
      color: METAL_COLOR[ring.metal],
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 1.3,
      side: THREE.DoubleSide,
    });
    const warn = new THREE.MeshPhysicalMaterial({ color: WARN, metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide });
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
      const mark = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), warn);
      mark.position.set(q.x * c - q.y * s, q.x * s + q.y * c, ring.transform.translateZ + lift + 0.2);
      this.content.add(mark);
    }
    this.frame("ring", new THREE.Vector3(0.9, -1.1, 0.75));
  }

  private addStone(positions: Float32Array, look: StoneLook, z: number) {
    const geo = geometry(positions);
    const color = look.colorless ? new THREE.Color(0xffffff) : stoneColor(look.color);
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0,
      roughness: 0.04,
      transmission: look.colorless ? 0.95 : 0.6,
      thickness: 2,
      ior: 1.7,
      specularIntensity: 1,
      envMapIntensity: 1.6,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const stone = new THREE.Mesh(geo, mat);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 10),
      new THREE.LineBasicMaterial({ color: look.colorless ? 0x9aa3ad : color.clone().multiplyScalar(0.6), transparent: true, opacity: 0.55 }),
    );
    stone.position.z = z;
    edges.position.z = z;
    this.content.add(stone, edges);
  }

  /** 中身に合わせてカメラを寄せる。同じ種類の表示が続くときは、人が回した向きを保つ */
  private frame(kind: string, firstDir: THREE.Vector3) {
    const box = new THREE.Box3().setFromObject(this.content);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dir =
      this.framedFor === kind ? this.camera.position.clone().sub(this.controls.target).normalize() : firstDir.clone().normalize();
    this.framedFor = kind;
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(dir, sphere.radius * 3.6);
    this.controls.update();
    this.dirty = true;
  }

  /** 今の 3D の画像（指示書や look の道具で使う） */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
}

function geometry(positions: Float32Array): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 金属はなめらかに（30° より鋭い折れ目だけ角として残す）。石は面ごとに平らなまま */
function metalGeometry(positions: Float32Array): THREE.BufferGeometry {
  return toCreasedNormals(geometry(positions), Math.PI / 6);
}

/** 写真の平均の色は、反射の白が混じって淡くなる。3D では少し濃くして本物に近づける */
function stoneColor(c: { r: number; g: number; b: number }): THREE.Color {
  const col = new THREE.Color(c.r / 255, c.g / 255, c.b / 255);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  return col.setHSL(hsl.h, Math.min(1, hsl.s * 1.6), hsl.l * 0.82);
}
