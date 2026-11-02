// 形の本体：画面に依存しない純粋な関数。三角形の並び（そのまま 3D 印刷のデータにできる、すき間のない形）を作る。
//
// 板もの：
// - 輪郭は、職人が動かす「制御点」を、なめらかな曲線（Catmull-Rom）でつないだもの。
// - 形の中を細かい格子に分け、各点で「輪郭からの距離」を求める（内側が正）。
// - 表の高さ ＝ 厚み − ふちの丸め（距離で四分円）＋ 起伏（技法の粒・叩き・彫った線）。
// - 輪郭の所は、格子の辺と輪郭が交わる点を、どの三角形からも同じ計算で出す（すき間ができない）。
//   表・横の壁・裏を、同じ輪郭の点でつなぐ。
// 指輪：断面（幅 × 厚み、形は点で決める）を、指のまわりに回す。上と下で断面を変え、その間をなめらかにつなぐ。外の面に起伏をつける。

export interface Pt {
  x: number;
  y: number;
}

/** 閉じた輪郭を、制御点を通るなめらかな曲線にする（Catmull-Rom、1 区間 per 点） */
export function smoothClosed(ctrl: readonly Pt[], per = 16): Pt[] {
  const n = ctrl.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

/** 点 p から、閉じた折れ線 poly までの距離。内側なら正、外側なら負 */
export function signedDistance(poly: readonly Pt[], p: Pt): number {
  let best = Infinity;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
    if (d < best) best = d;
  }
  return inside ? best : -best;
}

/** 起伏：位置 (x, y)（mm）での、表の高さの足し引き（mm）と、ふちからの距離 d（mm） */
export type Relief = (x: number, y: number, d: number) => number;

export interface PlateSpec {
  /** 輪郭（なめらかにした後の点、mm） */
  outline: readonly Pt[];
  thickness: number;
  /** ふちの丸め（mm） */
  edgeRadius: number;
  /** 格子の細かさ（mm） */
  cell: number;
  relief?: Relief;
}

/** 三角形の並び（x, y, z を 9 つずつ）と、UV（mm）を 6 つずつ */
export interface Mesh {
  positions: Float32Array;
  uvs: Float32Array;
}

/** 板ものの形（すき間のない形） */
export function plateSolid(spec: PlateSpec): Mesh {
  const { outline, thickness: T, cell: h } = spec;
  const r = Math.max(0, Math.min(spec.edgeRadius, T * 0.49));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  // 格子の点が輪郭の上にちょうど乗らないよう、わずかにずらす
  minX -= h * 1.0137;
  minY -= h * 1.0291;
  const nx = Math.ceil((maxX + h - minX) / h) + 1;
  const ny = Math.ceil((maxY + h - minY) / h) + 1;
  // 各格子点の「輪郭からの距離」
  const sd = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) sd[j * nx + i] = signedDistance(outline, { x: minX + i * h, y: minY + j * h });

  const top = (x: number, y: number, d: number) => {
    // ふちの丸め：d < r の間は四分円で下がる
    let z = T;
    if (d < r) z = T - r + Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));
    if (spec.relief && d > r * 0.5) z += spec.relief(x, y, d);
    return Math.max(0.05, z);
  };

  const pos: number[] = [];
  const uv: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => {
    pos.push(...a, ...b, ...c);
    uv.push(a[0], a[1], b[0], b[1], c[0], c[1]);
  };
  // 格子の辺と輪郭の交わる点（どのマスから求めても同じ値になるよう、辺の向きをそろえて計算する）
  const cross = (i0: number, j0: number, i1: number, j1: number): Pt => {
    if (i1 < i0 || (i1 === i0 && j1 < j0)) [i0, j0, i1, j1] = [i1, j1, i0, j0];
    const a = sd[j0 * nx + i0];
    const b = sd[j1 * nx + i1];
    const t = a / (a - b);
    return { x: minX + (i0 + (i1 - i0) * t) * h, y: minY + (j0 + (j1 - j0) * t) * h };
  };
  const wallTop = T - r;

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      // マスの 4 隅（左下から反時計回り）
      const cs: [number, number][] = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ];
      const ins = cs.map(([a, b]) => sd[b * nx + a] > 0);
      if (!ins.some(Boolean)) continue;
      // マスの中の、形の内側の部分の多角形（隅と交わる点を順に）。輪郭の線分も集める
      const poly: { p: Pt; d: number; edge: boolean }[] = [];
      for (let k = 0; k < 4; k++) {
        const [a, b] = cs[k];
        const [c, d] = cs[(k + 1) % 4];
        if (ins[k]) poly.push({ p: { x: minX + a * h, y: minY + b * h }, d: sd[b * nx + a], edge: false });
        if (ins[k] !== ins[(k + 1) % 4]) {
          const q = cross(a, b, c, d);
          poly.push({ p: q, d: 0, edge: true });
        }
      }
      // 表（上を向く）と裏（下を向く）
      const P = poly.map((v) => [v.p.x, v.p.y, v.edge ? wallTop : top(v.p.x, v.p.y, v.d)]);
      const B = poly.map((v) => [v.p.x, v.p.y, 0]);
      for (let k = 1; k < poly.length - 1; k++) {
        tri(P[0], P[k], P[k + 1]);
        tri(B[0], B[k + 1], B[k]);
      }
      // 横の壁：内側の多角形は反時計回りなので、輪郭の点が続けて並ぶ所が輪郭の線分（内側が左）。外へ向く壁を立てる
      const L = poly.length;
      for (let k = 0; k < L; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % L];
        if (!a.edge || !b.edge) continue;
        tri([a.p.x, a.p.y, 0], [b.p.x, b.p.y, 0], [b.p.x, b.p.y, wallTop]);
        tri([a.p.x, a.p.y, 0], [b.p.x, b.p.y, wallTop], [a.p.x, a.p.y, wallTop]);
      }
    }
  }
  return { positions: new Float32Array(pos), uvs: new Float32Array(uv) };
}

/** 三角形の並びの体積（mm³）。外を向いた面で正 */
export function meshVolume(pos: Float32Array): number {
  let v = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.subarray(i, i + 9);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

/** 開いた辺（1 つの三角形にしか使われていない辺）の数。0 なら、すき間のない形 */
export function openEdges(pos: Float32Array): number {
  const key = (i: number) => `${pos[i].toFixed(4)},${pos[i + 1].toFixed(4)},${pos[i + 2].toFixed(4)}`;
  const count = new Map<string, number>();
  for (let t = 0; t < pos.length; t += 9) {
    const v = [key(t), key(t + 3), key(t + 6)];
    for (let k = 0; k < 3; k++) {
      const a = v[k];
      const b = v[(k + 1) % 3];
      if (a === b) continue;
      const e = a < b ? `${a}|${b}` : `${b}|${a}`;
      count.set(e, (count.get(e) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const c of count.values()) if (c % 2 === 1) open++;
  return open;
}

// ---- 指輪 ----

/** 断面：幅 × 厚み と、外側の形（0〜1 の高さを、幅の左から右へ並べたもの。両端は 0 に近い） */
export interface Section {
  width: number;
  thickness: number;
  /** 外側のふくらみの形（幅を等分した点の高さ、0〜1）。内側はまっすぐ（指に当たる面） */
  crown: number[];
}

export const SECTION_PRESETS: Record<"kouman" | "hirauchi" | "kamaboko", (w: number, t: number) => Section> = {
  // 甲丸：外が丸い
  kouman: (w, t) => ({ width: w, thickness: t, crown: Array.from({ length: 9 }, (_, i) => Math.max(0.35, Math.sqrt(1 - ((i / 8) * 2 - 1) ** 2))) }),
  // 平打ち：外が平ら、角だけ少し丸める
  hirauchi: (w, t) => ({ width: w, thickness: t, crown: [0.7, 0.97, 1, 1, 1, 1, 1, 0.97, 0.7] }),
  // かまぼこ：ゆるい丸み
  kamaboko: (w, t) => ({ width: w, thickness: t, crown: Array.from({ length: 9 }, (_, i) => 0.6 + 0.4 * Math.sqrt(1 - ((i / 8) * 2 - 1) ** 2)) }),
};

/** 断面の高さを、幅の位置 s（−w/2〜w/2）で読む（点の間はなめらかに） */
export function crownAt(sec: Section, s: number): number {
  const c = sec.crown;
  const u = Math.max(0, Math.min(1, s / sec.width + 0.5)) * (c.length - 1);
  const i = Math.min(c.length - 2, Math.floor(u));
  const t = u - i;
  const p0 = c[Math.max(0, i - 1)];
  const p1 = c[i];
  const p2 = c[i + 1];
  const p3 = c[Math.min(c.length - 1, i + 2)];
  const v = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  return Math.max(0.05, Math.min(1.2, v));
}

export interface RingSpec {
  innerDiameter: number;
  /** 上（石座や飾りの側）と下（手のひらの側）の断面 */
  top: Section;
  bottom: Section;
  /** 上の断面が続く広さ（度、上を中心に左右合わせて）。その外は下の断面へなめらかに変わる */
  blendDeg: number;
  /** まわりの分け方と、断面の分け方 */
  around: number;
  across: number;
  /** 外の面の起伏（u：まわりの長さ mm、v：幅の位置 mm） */
  relief?: (u: number, v: number) => number;
}

/** 指輪：断面を回して作る（すき間のない形）。指の軸は x、いちばん下を z ＝ 0、上は z の大きい側 */
export function ringSolid(spec: RingSpec): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
  const rIn = spec.innerDiameter / 2;
  const N = spec.around;
  const M = spec.across;
  const half = (spec.blendDeg / 2) * (Math.PI / 180);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const tMax = Math.max(spec.top.thickness, spec.bottom.thickness);
  const outerLen = 2 * Math.PI * (rIn + tMax);
  // 断面のまわり（外 M+1 点 → 内 M+1 点）
  const L = 2 * (M + 1);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2; // 0 ＝ 上
    // 上からの角度で、上の断面 → 下の断面へ（なめらかに）
    const fromTop = Math.abs(((a + Math.PI) % (2 * Math.PI)) - Math.PI);
    const k = fromTop <= half ? 0 : Math.min(1, (fromTop - half) / Math.max(0.3, Math.PI - half));
    const mix = k * k * (3 - 2 * k);
    const w = spec.top.width + (spec.bottom.width - spec.top.width) * mix;
    const t = spec.top.thickness + (spec.bottom.thickness - spec.top.thickness) * mix;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let m = 0; m <= M; m++) {
      const s = -w / 2 + (w * m) / M;
      const crown = crownAt(spec.top, (s / w) * spec.top.width) * (1 - mix) + crownAt(spec.bottom, (s / w) * spec.bottom.width) * mix;
      let rr = rIn + t * crown;
      const u = (i / N) * outerLen;
      if (spec.relief && m > 0 && m < M) rr += spec.relief(u, s);
      // 上（a ＝ 0）が z の大きい側
      pos.push(s, rr * sa, rIn + tMax + rr * ca);
      uv.push(u, s + w / 2);
    }
    for (let m = M; m >= 0; m--) {
      const s = -w / 2 + (w * m) / M;
      pos.push(s, rIn * sa, rIn + tMax + rIn * ca);
      uv.push((i / N) * 2 * Math.PI * rIn, -(s + w / 2) - 1);
    }
  }
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    for (let k = 0; k < L; k++) {
      const k2 = (k + 1) % L;
      const a = i * L + k;
      const b = i2 * L + k;
      const c = i2 * L + k2;
      const d = i * L + k2;
      idx.push(a, d, b, b, d, c);
    }
  }
  return { positions: new Float32Array(pos), uvs: new Float32Array(uv), indices: new Uint32Array(idx) };
}

/** 号から内径（mm）。日本の号は、内まわり（mm）− 40 がおよその目安 */
export const innerDiameterOf = (gou: number) => (gou + 40) / Math.PI;

/** 三角形の並び（または番号つき）を、バイナリの STL にする（3D 印刷・鋳造の原型づくりに渡す形） */
export function toStl(positions: Float32Array, indices?: Uint32Array): ArrayBuffer {
  const triCount = indices ? indices.length / 3 : positions.length / 9;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  const title = "tsugu-craft";
  for (let i = 0; i < title.length; i++) dv.setUint8(i, title.charCodeAt(i));
  dv.setUint32(80, triCount, true);
  let o = 84;
  const v = (k: number) => (indices ? indices[k] * 3 : k * 3);
  for (let t = 0; t < triCount; t++) {
    const a = v(t * 3);
    const b = v(t * 3 + 1);
    const c = v(t * 3 + 2);
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const wx = positions[c] - positions[a];
    const wy = positions[c + 1] - positions[a + 1];
    const wz = positions[c + 2] - positions[a + 2];
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const f of [nx, ny, nz]) {
      dv.setFloat32(o, f, true);
      o += 4;
    }
    for (const k of [a, b, c]) {
      dv.setFloat32(o, positions[k], true);
      dv.setFloat32(o + 4, positions[k + 1], true);
      dv.setFloat32(o + 8, positions[k + 2], true);
      o += 12;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}
