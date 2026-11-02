// 道具の使い方を、3D の小さな場面で動かして見せる（指で回して、好きな向きから見られる）。
// 形はすべて簡単な立体を組み合わせてこちらで作る。寸法は見た目のためのもので、道具の本当の寸法ではない。
// 今は 2 つ：ヤスリ（すり板の V 字の所に地金を当てて削る）と、爪倒し（爪の先を石の上へ寄せる）。
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { studioScene } from "../ui/viewer";

export type Tool3D = "file" | "pusher";

export function tool3dFor(name: string): Tool3D | null {
  if (/^ヤスリ/.test(name)) return "file";
  if (/爪倒し|プッシャー/.test(name)) return "pusher";
  return null;
}

const GOLD = new THREE.MeshPhysicalMaterial({ color: 0xe2b866, metalness: 1, roughness: 0.18 });
const STEEL = new THREE.MeshPhysicalMaterial({ color: 0x9a9a9e, metalness: 1, roughness: 0.35 });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x9a6b42, roughness: 0.8 });
const HANDLE = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.6 });
const STONE = new THREE.MeshPhysicalMaterial({ color: 0xcfe3f2, metalness: 0, roughness: 0.05, transmission: 0.6, thickness: 2, ior: 1.7 });

/** すり板：先が細くなり、先に V 字の切り込みがある板。y が前（手前）、z が上 */
function benchPin(): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-30, -40);
  s.lineTo(30, -40);
  s.lineTo(22, 40);
  s.lineTo(5, 40);
  s.lineTo(0, 26); // V 字の切り込み
  s.lineTo(-5, 40);
  s.lineTo(-22, 40);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 8, bevelEnabled: false });
  g.translate(0, 0, -8);
  return new THREE.Mesh(g, WOOD);
}

function fileTool(): THREE.Group {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(6, 70, 2), STEEL);
  blade.position.set(0, 0, 0);
  const tang = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 30, 16), HANDLE);
  tang.rotation.x = 0;
  tang.position.set(0, -50, 0);
  // 目（細い溝）を少し
  for (let i = 0; i < 18; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.4, 2.1), new THREE.MeshStandardMaterial({ color: 0x6d6d70 }));
    line.position.set(0, -30 + i * 3.6, 0);
    line.rotation.z = 0.5;
    g.add(line);
  }
  g.add(blade, tang);
  return g;
}

/** 場面を作って host に入れる。閉じるときに dispose を呼ぶ */
export function mountTool3D(host: HTMLElement, kind: Tool3D): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.toneMapping = THREE.NeutralToneMapping;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioScene(), 0.02).texture;
  scene.background = new THREE.Color(0x0e0c0a);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 1000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x332211, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-40, -60, 80);
  scene.add(key);

  let tick: (t: number) => void = () => undefined;

  if (kind === "file") {
    // すり板の V 字の所に、地金（平たい板）を押し付ける。削る所は、すり板の先から少し出す
    const pin = benchPin();
    const metal = new THREE.Mesh(new THREE.BoxGeometry(26, 7, 2), GOLD);
    metal.position.set(0, 38, 1);
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 16), new THREE.MeshStandardMaterial({ color: 0xe0b9a0, roughness: 0.7 }));
    thumb.scale.set(1.2, 1, 0.6);
    thumb.position.set(-7, 36, 4.2);
    const file = fileTool();
    scene.add(pin, metal, thumb, file);
    camera.position.set(60, 110, 60);
    controls.target.set(0, 34, 2);
    // ヤスリは、地金の出た端に当て、前（奥）へ押すときに削る。戻すときは浮かせる
    tick = (t) => {
      const p = (t % 1.8) / 1.8;
      const push = p < 0.55;
      const k = push ? p / 0.55 : (p - 0.55) / 0.45;
      const x = push ? 20 - 40 * k : -20 + 40 * k;
      file.rotation.set(0, 0, Math.PI / 2 + 0.15);
      file.position.set(x, 42, push ? 2.2 : 5.5);
    };
  } else {
    // 石と 4 本の爪。手前の 1 本を、爪倒しで石の上へ寄せる
    const stone = new THREE.Group();
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(5, 8, 3, 32), STONE);
    crown.rotation.x = Math.PI / 2;
    crown.position.z = 1.5;
    const pav = new THREE.Mesh(new THREE.ConeGeometry(8, 8, 32), STONE);
    pav.rotation.x = -Math.PI / 2;
    pav.position.z = -4;
    stone.add(crown, pav);
    stone.position.z = 10;
    scene.add(stone);
    const prongs: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const g = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 16, 16), GOLD);
      rod.rotation.x = Math.PI / 2;
      rod.position.z = 8;
      g.add(rod);
      g.position.set(9 * Math.cos(a), 9 * Math.sin(a), 0);
      g.rotation.z = a;
      scene.add(g);
      prongs.push(g);
    }
    const base = new THREE.Mesh(new THREE.TorusGeometry(9, 0.9, 12, 48), GOLD);
    base.position.z = 4;
    scene.add(base);
    // 爪倒し：手前の爪の先の外側に当て、石の中心へ押す。爪の子にして、爪と一緒に倒れるようにする
    // カメラから見て横を向いた爪（押す道具が石を隠さないように）
    const target = prongs[0];
    target.rotation.order = "ZYX";
    const pusher = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 24, 16), STEEL);
    shaft.position.y = 12;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(2.8, 20, 16), HANDLE);
    knob.scale.set(1, 1.8, 1);
    knob.position.y = 28;
    pusher.add(shaft, knob);
    // 爪の先（局所の z ＝ 16）の外側（＋x）から、内へ少し下向きに押す
    pusher.position.set(1, 0, 15);
    pusher.rotation.set(0, -0.35, -Math.PI / 2);
    target.add(pusher);
    camera.position.set(34, -62, 34);
    controls.target.set(4, 4, 10);
    tick = (t) => {
      const p = (t % 3) / 3;
      const k = p < 0.15 ? 0 : p < 0.6 ? (p - 0.15) / 0.45 : p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15;
      // 局所の y を軸に、先を内（－x）へ倒す
      target.rotation.y = -k * 0.32;
    };
  }

  const resize = () => {
    const w = host.clientWidth || 300;
    const h = host.clientHeight || 200;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  let raf = 0;
  const t0 = performance.now();
  const loop = () => {
    tick((performance.now() - t0) / 1000);
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  loop();
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
