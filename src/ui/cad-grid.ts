// CAD の作業画面のような方眼：大きな 1 枚の板に、線を絵の具（シェーダー）で描く。
// 1 mm の細い線と 10 mm の濃い線が、地平線まで続く。線の太さは画面の 1 px ほどにそろえ（fwidth）、
// 線が画面の上で詰まる所では、線を線の平均の濃さ（うすい面）に少しずつ置きかえる（模様＝モアレが出ない）。
// 遠い所はなめらかに背景へ消える。まん中の軸は、x 赤・y 緑・z 青。
// 平らな図（正面・横・上）では、指輪の奥に立てる図面の方眼になる。
import * as THREE from "three";

/** 線の色と濃さ（0〜1）。背景ごとに変える */
export interface GridLook {
  minor: [number, number, number, number];
  major: [number, number, number, number];
  axisAlpha: number;
}

export const GRID_LOOK = {
  /** 黒い撮影台（レンダー） */
  dark: { minor: [150, 152, 158, 0.17], major: [165, 167, 173, 0.42], axisAlpha: 0.75 },
  /** CAD の灰色（シェード・ワイヤー） */
  gray: { minor: [70, 72, 78, 0.28], major: [52, 54, 60, 0.55], axisAlpha: 0.85 },
  /** 紙のような淡い色 */
  paper: { minor: [150, 140, 124, 0.25], major: [130, 120, 104, 0.45], axisAlpha: 0.7 },
} satisfies Record<string, GridLook>;

const AXIS_COLOR = { x: [196, 58, 58], y: [58, 150, 64], z: [58, 98, 196] } as const;
type Axis = keyof typeof AXIS_COLOR;

const v3 = (c: readonly number[]) => new THREE.Vector3(c[0] / 255, c[1] / 255, c[2] / 255);

const vertexShader = `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// 色は sRGB のまま書く（色の変換の部品を入れないので、ここで決めた色がそのまま画面に出る）
const fragmentShader = `
uniform vec3 uU; uniform vec3 uV; uniform vec3 uN;
uniform float uMinor; uniform float uMajor; uniform float uPx;
uniform vec4 uMinorCol; uniform vec4 uMajorCol;
uniform vec3 uAxisU; uniform vec3 uAxisV; uniform float uAxisA;
uniform vec3 uCenter; uniform vec2 uFade;
varying vec3 vWorld;

// 線までの距離（px）から、その線の濃さ。w：線の太さ（px）。s：線の間（mm）。
// 線の間が画面の上で狭い（4 px より下）所では、線を、線の平均の濃さ（うすい面）に少しずつ置きかえる。
// 消すのではなく平均の濃さにするので、片方の向きの線だけが急に消える境目や、模様（モアレ）が出ない
float lines(vec2 c, float s, float w) {
  vec2 fw = max(fwidth(c), vec2(1e-6));
  vec2 d = abs(fract(c / s - 0.5) - 0.5) * s / fw;
  vec2 a = clamp(0.5 * w + 0.5 - d, 0.0, 1.0);
  vec2 cell = s / fw;
  vec2 avg = min(vec2(1.0), w / cell);
  vec2 lod = smoothstep(vec2(1.5 * uPx), vec2(4.0 * uPx), cell);
  vec2 l = mix(avg, a, lod);
  return max(l.x, l.y);
}

void main() {
  vec2 c = vec2(dot(vWorld, uU), dot(vWorld, uV));
  float mi = lines(c, uMinor, 1.0 * uPx);
  float ma = lines(c, uMajor, 1.3 * uPx);
  vec2 fw = max(fwidth(c), vec2(1e-6));
  // 軸（c ＝ 0 の線）。U の向きに走る線（v ＝ 0）は U の軸の色
  vec2 ax = clamp(0.5 * 1.8 * uPx + 0.5 - abs(c) / fw, 0.0, 1.0);
  float aMinor = mi * uMinorCol.a;
  float aMajor = ma * uMajorCol.a;
  vec3 col = uMinorCol.rgb;
  float a = aMinor;
  col = mix(col, uMajorCol.rgb, aMajor / max(a + aMajor - a * aMajor, 1e-4));
  a = a + aMajor - a * aMajor;
  float aU = ax.y * uAxisA;
  float aV = ax.x * uAxisA;
  col = mix(col, uAxisU, aU / max(a + aU - a * aU, 1e-4));
  a = a + aU - a * aU;
  col = mix(col, uAxisV, aV / max(a + aV - a * aV, 1e-4));
  a = a + aV - a * aV;
  // 遠い所ほど薄く（見ている所からの距離）。地平線に近い、浅い角度で見る所も少し薄く
  float dist = length(vWorld - uCenter);
  a *= 1.0 - smoothstep(uFade.x, uFade.y, dist);
  vec3 toCam = normalize(cameraPosition - vWorld);
  a *= smoothstep(0.0, 0.12, abs(dot(toCam, uN)));
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}`;

export class CadGrid {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uU: { value: new THREE.Vector3(1, 0, 0) },
        uV: { value: new THREE.Vector3(0, 1, 0) },
        uN: { value: new THREE.Vector3(0, 0, 1) },
        uMinor: { value: 1 },
        uMajor: { value: 10 },
        uPx: { value: 1 },
        uMinorCol: { value: new THREE.Vector4() },
        uMajorCol: { value: new THREE.Vector4() },
        uAxisU: { value: v3(AXIS_COLOR.x) },
        uAxisV: { value: v3(AXIS_COLOR.y) },
        uAxisA: { value: 0.8 },
        uCenter: { value: new THREE.Vector3() },
        uFade: { value: new THREE.Vector2(400, 1600) },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = -2;
    this.mesh.frustumCulled = false;
    this.setLook(GRID_LOOK.dark);
  }

  setLook(l: GridLook) {
    const u = this.mat.uniforms;
    (u.uMinorCol.value as THREE.Vector4).set(l.minor[0] / 255, l.minor[1] / 255, l.minor[2] / 255, l.minor[3]);
    (u.uMajorCol.value as THREE.Vector4).set(l.major[0] / 255, l.major[1] / 255, l.major[2] / 255, l.major[3]);
    u.uAxisA.value = l.axisAlpha;
  }

  /**
   * 板の面：u・v の 2 本の軸（世界の軸）の張る面を、at を通るように置く。
   * 床なら x・y、正面の図（指の軸の向きから）なら y・z、横の図なら x・z
   */
  setPlane(u: Axis, v: Axis, at: THREE.Vector3) {
    const unit = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
    const U = unit[u];
    const V = unit[v];
    const N = new THREE.Vector3().crossVectors(U, V);
    const m = this.mat.uniforms;
    (m.uU.value as THREE.Vector3).copy(U);
    (m.uV.value as THREE.Vector3).copy(V);
    (m.uN.value as THREE.Vector3).copy(N);
    (m.uAxisU.value as THREE.Vector3).copy(v3(AXIS_COLOR[u]));
    (m.uAxisV.value as THREE.Vector3).copy(v3(AXIS_COLOR[v]));
    // 板（x・y の面）を、U・V・N の向きに回す
    this.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(U, V, N));
    this.mesh.position.copy(at);
  }

  /**
   * 描く前に毎回：線の間（mm）・画面の細かさ（px の倍率）・薄くし始める距離と消える距離（mm）・見ている所。
   * 板の大きさは、消える距離の外まで
   */
  update(minor: number, major: number, pixelRatio: number, fade: [number, number], center: THREE.Vector3) {
    const m = this.mat.uniforms;
    m.uMinor.value = minor;
    m.uMajor.value = major;
    m.uPx.value = pixelRatio;
    (m.uFade.value as THREE.Vector2).set(fade[0], fade[1]);
    (m.uCenter.value as THREE.Vector3).copy(center);
    const size = fade[1] * 2.2;
    this.mesh.scale.set(size, size, 1);
    // 板のまん中を、見ている所の近くへ（面の上で動かす。面からは離さない）
    const N = m.uN.value as THREE.Vector3;
    const p = this.mesh.position;
    const off = center.clone().sub(p);
    off.addScaledVector(N, -off.dot(N));
    p.add(off);
  }
}
