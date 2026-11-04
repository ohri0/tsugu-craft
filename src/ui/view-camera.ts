// 3D のカメラの切り替え：斜め（パースのある 3D）と、正面・横・上（パースのない平らな図＝図面）。
// 平らな図は本当の正射カメラ（OrthographicCamera）で見る。遠くの物も近くの物も同じ大きさに写るので、
// 画面の上で長さを測れる。斜めに戻すと、前の斜めの視点に戻る。
// 画面（WebGL）に依存しないので、テストで確かめられる。単位は mm。z が上、指の軸は x。
import * as THREE from "three";

export type ViewName = "top" | "side" | "front" | "angle";

/** 見る向き（見ている所 → カメラ）。上はほんの少しだけ傾ける（真上だと、上の向きが決まらないため。傾きは 0.0001） */
export const VIEW_DIR: Record<ViewName, THREE.Vector3> = {
  top: new THREE.Vector3(0, -1e-4, 1).normalize(),
  side: new THREE.Vector3(1, 0, 0),
  front: new THREE.Vector3(0, -1, 0),
  angle: new THREE.Vector3(0.6, -0.8, 0.6).normalize(),
};

/** 斜めの画角（度） */
export const PERSP_FOV = 30;
/** 平らな図で、カメラを見ている所から離す距離（mm）。正射なので、見え方は変わらない */
const ORTHO_DIST = 400;

/**
 * 方眼の線の間（mm）：1・2・5 の並びから、細い線の間が minPx 以上になる、いちばん細かいもの。
 * 太い線は、細い線の 5 か 10 倍（1 → 10、2 → 10、5 → 50 のように、きりのよい数）。
 */
export function gridSpacing(pxPerMm: number, minPx = 9): { minor: number; major: number } {
  const steps = [1, 2, 5];
  for (let e = -2; e <= 4; e++) {
    for (const s of steps) {
      const minor = s * 10 ** e;
      if (minor * pxPerMm >= minPx) {
        const major = (s === 5 ? 50 : 10) * 10 ** e;
        return { minor: round(minor), major: round(major) };
      }
    }
  }
  return { minor: 10000, major: 100000 };
}

/** 目盛りの数字を置く間（mm）：太い線の間の 1・2・5 倍のうち、数字の間が minPx 以上になるもの */
export function labelStep(major: number, pxPerMm: number, minPx = 46): number {
  for (const k of [1, 2, 5, 10, 20, 50]) if (major * k * pxPerMm >= minPx) return round(major * k);
  return round(major * 100);
}

const round = (v: number) => Number(v.toPrecision(6));

/** 平らな図の向きと大きさ。dir：見ている所 → カメラ、right・up：画面の右・上（世界の向き）、mmPerPx：画面の 1 px が何 mm か、box：中身の箱 */
export interface FlatViewInfo {
  dir: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  mmPerPx: number;
  box: { min: [number, number, number]; max: [number, number, number] };
}

export interface CamState {
  view: ViewName;
  persp: THREE.Vector3;
  ortho: THREE.Vector3;
  zoom: number;
  halfH: number;
  saved: { pos: THREE.Vector3; target: THREE.Vector3 } | null;
  target: THREE.Vector3;
}

export class ViewCameras {
  readonly persp = new THREE.PerspectiveCamera(PERSP_FOV, 1, 0.1, 20000);
  readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, ORTHO_DIST * 5);
  view: ViewName = "angle";
  /** 平らな図の、縦の半分の高さ（mm、zoom ＝ 1 のとき） */
  private halfH = 10;
  private aspect = 1;
  /** 平らな図にする前の、斜めの視点（戻すため） */
  private saved: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

  constructor() {
    this.persp.up.set(0, 0, 1);
    this.ortho.up.set(0, 0, 1);
    this.persp.position.set(14, -18, 14);
  }

  get flat(): boolean {
    return this.view !== "angle";
  }
  get active(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.flat ? this.ortho : this.persp;
  }

  setAspect(aspect: number) {
    this.aspect = aspect;
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
    this.applyOrtho();
  }

  private applyOrtho() {
    const h = this.halfH;
    this.ortho.left = -h * this.aspect;
    this.ortho.right = h * this.aspect;
    this.ortho.top = h;
    this.ortho.bottom = -h;
    this.ortho.updateProjectionMatrix();
  }

  /** 斜めのカメラで、見ている所の高さの半分（mm） */
  private perspHalfAt(target: THREE.Vector3): number {
    return this.persp.position.distanceTo(target) * Math.tan((this.persp.fov * Math.PI) / 360);
  }

  /**
   * 向きを変える。target は見ている所（ドラッグで回す中心）で、斜めに戻すときは前の斜めの所に書きかえる。
   * 返すのは、これから使うカメラ
   */
  setView(view: ViewName, target: THREE.Vector3): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    const was = this.view;
    if (view === "angle") {
      if (was !== "angle" && this.saved) {
        // 平らな図から戻る：前の斜めの視点のまま
        this.persp.position.copy(this.saved.pos);
        target.copy(this.saved.target);
      } else {
        // 斜めのまま押した：決まった斜めの向きに（今の距離のまま）
        const r = this.persp.position.distanceTo(target);
        this.persp.position.copy(target).addScaledVector(VIEW_DIR.angle, r);
      }
      this.saved = null;
      this.view = "angle";
      this.persp.lookAt(target);
      this.persp.updateMatrixWorld();
      return this.persp;
    }
    if (was === "angle") {
      // 斜めから平らな図へ：見ている所の大きさを、そのまま平らな図の大きさに
      this.saved = { pos: this.persp.position.clone(), target: target.clone() };
      this.halfH = this.perspHalfAt(target);
      this.ortho.zoom = 1;
    }
    this.view = view;
    this.ortho.position.copy(target).addScaledVector(VIEW_DIR[view], ORTHO_DIST);
    this.ortho.lookAt(target);
    this.applyOrtho();
    this.ortho.updateMatrixWorld();
    return this.ortho;
  }

  /**
   * 中身（球）に合わせて寄せる。斜めでは距離、平らな図では大きさ。fit は画面の縦横による倍率。
   * dir は斜めの向き（平らな図の間は、戻ったときの斜めの視点を寄せ直す）
   */
  frame(center: THREE.Vector3, radius: number, fit: number, dir: THREE.Vector3) {
    const dist = radius * 3.6 * fit;
    const pos = center.clone().addScaledVector(dir.clone().normalize(), dist);
    if (this.flat) {
      this.saved = { pos, target: center.clone() };
      this.halfH = dist * Math.tan((PERSP_FOV * Math.PI) / 360);
      this.ortho.zoom = 1;
      this.ortho.position.copy(center).addScaledVector(VIEW_DIR[this.view], ORTHO_DIST);
      this.ortho.lookAt(center);
      this.applyOrtho();
    } else {
      this.persp.position.copy(pos);
      this.persp.lookAt(center);
    }
  }

  /** 斜めの向き（戻ったときの向き）。平らな図の間は、覚えている斜めの向き */
  angleDir(target: THREE.Vector3): THREE.Vector3 {
    const s = this.saved;
    return s ? s.pos.clone().sub(s.target).normalize() : this.persp.position.clone().sub(target).normalize();
  }

  /** 平らな図の 1 mm が、画面の何 px か（heightPx：画面の高さ px）。斜めでは null */
  pxPerMm(heightPx: number): number | null {
    if (!this.flat) return null;
    return (heightPx * this.ortho.zoom) / (this.ortho.top - this.ortho.bottom);
  }

  state(target: THREE.Vector3): CamState {
    return {
      view: this.view,
      persp: this.persp.position.clone(),
      ortho: this.ortho.position.clone(),
      zoom: this.ortho.zoom,
      halfH: this.halfH,
      saved: this.saved && { pos: this.saved.pos.clone(), target: this.saved.target.clone() },
      target: target.clone(),
    };
  }
  restore(s: CamState, target: THREE.Vector3) {
    this.view = s.view;
    this.persp.position.copy(s.persp);
    this.ortho.position.copy(s.ortho);
    this.ortho.zoom = s.zoom;
    this.halfH = s.halfH;
    this.saved = s.saved;
    target.copy(s.target);
    this.persp.lookAt(target);
    this.ortho.lookAt(target);
    this.applyOrtho();
    this.persp.updateMatrixWorld();
    this.ortho.updateMatrixWorld();
  }
}
