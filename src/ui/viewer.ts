// 右の大きな 3D。ドラッグで回す。単位は mm。
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { StoneMesh } from "../geometry/stone";

export interface StoneLook {
  color: { r: number; g: number; b: number };
  colorless: boolean;
}

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  private controls: OrbitControls;
  private stone?: THREE.Mesh;
  private edges?: THREE.LineSegments;
  private grid: THREE.GridHelper;
  private framed = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.background = new THREE.Color(0xf1eee8);
    // z を上にする（形の処理と同じ向き）
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(14, -18, 14);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    // 1 mm の目盛り
    this.grid = new THREE.GridHelper(20, 20, 0xc9c1b4, 0xe0dad0);
    this.grid.rotation.x = Math.PI / 2;
    this.scene.add(this.grid);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
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
  }

  setStone(mesh: StoneMesh, look: StoneLook) {
    if (this.stone) {
      this.scene.remove(this.stone, this.edges!);
      this.stone.geometry.dispose();
      this.edges!.geometry.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geo.computeVertexNormals();
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
    this.stone = new THREE.Mesh(geo, mat);
    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 10),
      new THREE.LineBasicMaterial({ color: look.colorless ? 0x9aa3ad : color.clone().multiplyScalar(0.6), transparent: true, opacity: 0.55 }),
    );
    // 石の一番下を目盛りの上に
    const z = -mesh.heights.culetZ;
    this.stone.position.z = z;
    this.edges.position.z = z;
    this.scene.add(this.stone, this.edges);
    geo.computeBoundingSphere();
    const r = geo.boundingSphere!.radius;
    this.controls.target.set(0, 0, z * 0.8);
    // 最初は斜め上から（上面の形が読める向き）。2 回目からは人が回した向きを保つ
    const dir = this.framed
      ? this.camera.position.clone().sub(this.controls.target).normalize()
      : new THREE.Vector3(0.25, -0.75, 1).normalize();
    this.framed = true;
    this.camera.position.copy(this.controls.target).addScaledVector(dir, r * 5.2);
    this.controls.update();
  }

  /** 今の 3D の画像（指示書や look の道具で使う） */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
}

/** 写真の平均の色は、反射の白が混じって淡くなる。3D では少し濃くして本物に近づける */
function stoneColor(c: { r: number; g: number; b: number }): THREE.Color {
  const col = new THREE.Color(c.r / 255, c.g / 255, c.b / 255);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  return col.setHSL(hsl.h, Math.min(1, hsl.s * 1.6), hsl.l * 0.82);
}
