// 三角形の集まり（頂点を共有しない、三角形ごとに 3 頂点 × xyz）を組むための小さな道具。
// 石座と腕で使う。どの部品も「閉じた形」にし、面の向き（外向き）をそろえる。
// 角張った見た目にならないよう、針金は丸い断面・丸い端で作る。
import { meshVolume } from "./stone";

export type V3 = [number, number, number];

/** 三角形を 1 つ足す */
export function pushTri(out: number[], a: V3, b: V3, c: V3): void {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

/**
 * 同じ点の数の閉じた輪を順につなぎ、最後の輪を最初の輪へ戻して、ドーナツ形の閉じた管にする。
 * 例：覆輪は「外の下 → 外の上 → 内の上 → 内の下」の輪を、縁に沿ってつなぐ。
 */
export function ringsToTube(rings: readonly V3[][], out: number[]): void {
  const m = rings.length;
  const n = rings[0].length;
  for (let k = 0; k < m; k++) {
    const a = rings[k];
    const b = rings[(k + 1) % m];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pushTri(out, a[i], a[j], b[j]);
      pushTri(out, a[i], b[j], b[i]);
    }
  }
}

/**
 * 閉じた輪を順につなぐが、最後の輪から最初の輪へは戻さない（上下の端が開いた筒）。
 * 最初と最後の輪を「点に縮んだ輪」や「幅 0 につぶれた輪」にすると、端が閉じた形になる。
 * V 字の爪の、角を包む壁（高さごとの輪を積む）に使う。
 */
export function stackLoops(loops: readonly V3[][], out: number[]): void {
  const n = loops[0].length;
  for (let k = 0; k + 1 < loops.length; k++) {
    const a = loops[k];
    const b = loops[k + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pushTri(out, a[i], a[j], b[j]);
      pushTri(out, a[i], b[j], b[i]);
    }
  }
}

/**
 * 点の列を、角のないなめらかな曲線でつなぎ、ほぼ step mm ごとに取り直す。
 * つなぎ方は「向心型のキャットマル・ロム曲線」（点の間の長さの平方根で間を測る）。点の間が不ぞろいでも、輪ができにくい。
 * 曲線は元の点を必ず通る。
 */
export function smoothPath(points: readonly V3[], step: number): V3[] {
  const pts: V3[] = [];
  for (const p of points) if (pts.length === 0 || len(sub(p, pts[pts.length - 1])) > 1e-6) pts.push(p);
  if (pts.length < 2) return pts.slice();
  const out: V3[] = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    // 端では、隣の点を折り返した点を仮に置く
    const p0 = i > 0 ? pts[i - 1] : sub(scale(p1, 2), p2);
    const p3 = i + 2 < pts.length ? pts[i + 2] : sub(scale(p2, 2), p1);
    const t0 = 0;
    const t1 = t0 + Math.sqrt(len(sub(p1, p0)));
    const t2 = t1 + Math.sqrt(len(sub(p2, p1)));
    const t3 = t2 + Math.sqrt(len(sub(p3, p2)));
    const m = Math.max(1, Math.ceil(len(sub(p2, p1)) / step));
    for (let q = 1; q <= m; q++) {
      const t = t1 + ((t2 - t1) * q) / m;
      const a1 = mix(p0, p1, t0, t1, t);
      const a2 = mix(p1, p2, t1, t2, t);
      const a3 = mix(p2, p3, t2, t3, t);
      const b1 = mix(a1, a2, t0, t2, t);
      const b2 = mix(a2, a3, t1, t3, t);
      out.push(q === m ? p2 : mix(b1, b2, t1, t2, t));
    }
  }
  return out;
}

/** 時刻 ta の a と時刻 tb の b の間を、時刻 t でまっすぐ結んだ点 */
function mix(a: V3, b: V3, ta: number, tb: number, t: number): V3 {
  const w = tb - ta < 1e-12 ? 0 : (t - ta) / (tb - ta);
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
}

export interface TubeOptions {
  /** 断面の円を何角形で作るか */
  sides: number;
  /**
   * 断面の半径。[1 つ目の向き, 横の向き] の 2 つ（同じなら丸、違えば楕円）。i は path の点の番号。
   * 1 つ目の向きは、横の向きと進む向きの両方に直角な向き。
   */
  radius: (i: number) => readonly [number, number];
  /** 断面の「横の向き」の手がかり（進む向きに直角になるよう直して使う） */
  side: V3;
  /** 始まりと終わりの丸いふたの長さ（その端の断面の半径の平均に対する倍率） */
  startCap: number;
  endCap: number;
  /** 丸いふたを何段の輪で作るか */
  capSteps: number;
}

/**
 * 曲線に沿って、丸い（または楕円の）断面の針金を作る。両端は丸いふたで閉じる（平らな面を作らない）。
 * 爪・V 字の爪の足・下の軸に使う。断面の向きは side から毎回決め直すので、針金がねじれない。
 */
export function sweepTube(path: readonly V3[], o: TubeOptions, out: number[]): void {
  const n = path.length;
  const frames = path.map((_, j) => {
    const t = normalize(sub(path[Math.min(n - 1, j + 1)], path[Math.max(0, j - 1)]));
    let b = sub(o.side, scale(t, dot(o.side, t)));
    if (len(b) < 1e-6) b = cross(t, Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
    b = normalize(b);
    return { t, a: cross(b, t), b };
  });
  const ringAt = (center: V3, f: (typeof frames)[number], ra: number, rb: number): V3[] => {
    const ring: V3[] = [];
    for (let k = 0; k < o.sides; k++) {
      const th = (k / o.sides) * Math.PI * 2;
      ring.push(add(center, add(scale(f.a, ra * Math.cos(th)), scale(f.b, rb * Math.sin(th)))));
    }
    return ring;
  };
  // 端の丸いふた：端の断面を、端の向きへ伸ばしながら縮める（楕円体の半分）
  const cap = (j: number, dir: V3, factor: number): { rings: V3[][]; pole: V3 } => {
    const [ra, rb] = o.radius(j);
    const length = (factor * (ra + rb)) / 2;
    const rings: V3[][] = [];
    for (let q = 1; q < o.capSteps; q++) {
      const beta = (q / o.capSteps) * (Math.PI / 2);
      rings.push(ringAt(add(path[j], scale(dir, length * Math.sin(beta))), frames[j], ra * Math.cos(beta), rb * Math.cos(beta)));
    }
    return { rings, pole: add(path[j], scale(dir, length)) };
  };
  const body = path.map((p, j) => {
    const [ra, rb] = o.radius(j);
    return ringAt(p, frames[j], ra, rb);
  });
  const start = cap(0, scale(frames[0].t, -1), o.startCap);
  const end = cap(n - 1, frames[n - 1].t, o.endCap);
  const rings = [...start.rings.reverse(), ...body, ...end.rings];
  for (let j = 0; j + 1 < rings.length; j++) {
    const a = rings[j];
    const b = rings[j + 1];
    for (let k = 0; k < o.sides; k++) {
      const l = (k + 1) % o.sides;
      pushTri(out, a[k], a[l], b[l]);
      pushTri(out, a[k], b[l], b[k]);
    }
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  for (let k = 0; k < o.sides; k++) {
    const l = (k + 1) % o.sides;
    pushTri(out, start.pole, first[l], first[k]);
    pushTri(out, end.pole, last[k], last[l]);
  }
}

/**
 * 1 つの閉じた部品を仕上げる。体積が負なら（面が内向きなら）全部の三角形を裏返して外向きにそろえる。
 * 組み方の向きの取り違えがあっても、出す形はいつも外向きになる。
 */
export function closedPart(tris: number[]): Float32Array {
  const a = new Float32Array(tris);
  if (meshVolume(a) < 0) {
    for (let i = 0; i < a.length; i += 9) {
      for (let c = 0; c < 3; c++) {
        const t = a[i + 3 + c];
        a[i + 3 + c] = a[i + 6 + c];
        a[i + 6 + c] = t;
      }
    }
  }
  return a;
}

/** 別々に閉じた部品をいくつか、それぞれ外向きにそろえてから 1 つの配列にする（1 本の爪が、足・軸・壁からなるとき） */
export function closedParts(parts: readonly number[][]): Float32Array {
  return concat(parts.filter((p) => p.length > 0).map(closedPart));
}

/** いくつかの部品を 1 つの配列に並べる */
export function concat(parts: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: V3, k: number): V3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
export function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function len(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
export function lerp3(a: V3, b: V3, w: number): V3 {
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
}
export function normalize(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
