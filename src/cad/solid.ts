// 形の本体：画面に依存しない純粋な関数。三角形の並び（そのまま 3D 印刷のデータにできる、すき間のない形）を作る。
//
// 板もの：
// - 輪郭は、職人が動かす「制御点」を、なめらかな曲線（Catmull-Rom）でつないだもの。
// - 形の中を細かい格子に分け、各点で「輪郭からの距離」を求める（内側が正）。
// - 表の高さ ＝ 厚み − ふちの丸め（距離で四分円）＋ 起伏（技法の粒・叩き・彫った線）。
// - 輪郭の所は、格子の辺と輪郭が交わる点を、どの三角形からも同じ計算で出す（すき間ができない）。
//   表・横の壁・裏を、同じ輪郭の点でつなぐ。
// 指輪：閉じた断面（src/cad/section.ts。内側を丸くしてもよい）を、指のまわりに回す。上と下で断面を変え、その間をなめらかにつなぐ。

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

/** 閉じた断面の点（mm）。x は幅の向き（真ん中 0）、h は指の円からの高さ（0 以上） */
export interface LoopPt {
  x: number;
  h: number;
}

export interface BandSpec {
  innerDiameter: number;
  /** 上と下の断面（閉じた線。同じ点の数で、同じ番号の点どうしがつながる。外の線 右 → 左、内の線 左 → 右の向き） */
  top: readonly LoopPt[];
  bottom: readonly LoopPt[];
  /** 上の断面が続く広さ（度、上を中心に左右合わせて）。その外は下の断面へなめらかに変わる */
  blendDeg: number;
  /** まわりの分け方 */
  around: number;
  /**
   * 切り取る所（度。いちばん上が 0、＋ は +y の側）。断面を見るための、切った形を作る。切り口にはふたをする。
   * なければ 1 周の輪
   */
  gap?: { fromDeg: number; toDeg: number };
}

/** 点 p が三角形 a–b–c の中か、線の上にあるか（a–b–c は反時計回り） */
function inTriangle(p: LoopPt, a: LoopPt, b: LoopPt, c: LoopPt): boolean {
  const s = (u: LoopPt, v: LoopPt) => (v.x - u.x) * (p.h - u.h) - (v.h - u.h) * (p.x - u.x);
  return s(a, b) >= -1e-12 && s(b, c) >= -1e-12 && s(c, a) >= -1e-12;
}

/** 閉じた線の中を三角形に分ける（耳を切り落とす方法）。へこんだ形でもよい。返す三角形は、線が反時計回りなら反時計回り */
export function earClip(poly: readonly LoopPt[]): [number, number, number][] {
  const idx = poly.map((_, i) => i);
  let area = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    area += p.x * q.h - q.x * p.h;
  });
  if (area < 0) idx.reverse();
  const turn = (a: LoopPt, b: LoopPt, c: LoopPt) => (b.x - a.x) * (c.h - a.h) - (b.h - a.h) * (c.x - a.x);
  const out: [number, number, number][] = [];
  while (idx.length > 3) {
    const n = idx.length;
    let ear = -1;
    let fallback = 0;
    let most = -Infinity;
    for (let i = 0; i < n; i++) {
      const ia = idx[(i - 1 + n) % n];
      const ib = idx[i];
      const ic = idx[(i + 1) % n];
      const t = turn(poly[ia], poly[ib], poly[ic]);
      if (t > most) {
        most = t;
        fallback = i;
      }
      if (t <= 1e-12) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inTriangle(poly[j], poly[ia], poly[ib], poly[ic]))) continue;
      ear = i;
      break;
    }
    // 耳がない（線が自分と交わるなど）ときは、いちばん出っぱった点を落として先へ進む
    if (ear < 0) ear = fallback;
    out.push([idx[(ear - 1 + n) % n], idx[ear], idx[(ear + 1) % n]]);
    idx.splice(ear, 1);
  }
  out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/**
 * 指輪：閉じた断面を指のまわりに回して作る（すき間のない 1 つの形）。三角形の並びを返す。
 * 指の軸は x、いちばん下を z ＝ 0、上は z の大きい側。上と下で断面を変え、その間をなめらかにつなぐ。
 * どの角度でも、断面のいちばん指に近い所が指の円の上に来る（内径はどこでも同じ）
 */
export function bandSolid(spec: BandSpec): Float32Array {
  const rIn = spec.innerDiameter / 2;
  const half = (spec.blendDeg / 2) * (Math.PI / 180);
  const L = spec.top.length;
  const cz = rIn + Math.max(...spec.bottom.map((p) => p.h));
  /** その角度の断面（指にいちばん近い所を h ＝ 0 に）。上からの角度で、上の断面 → 下の断面へなめらかに変わる */
  const sectionAt = (a: number): LoopPt[] => {
    const fromTop = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    const k = fromTop <= half ? 0 : Math.min(1, (fromTop - half) / Math.max(0.3, Math.PI - half));
    const mix = k * k * (3 - 2 * k);
    const pts = spec.top.map((p, i) => ({ x: p.x + (spec.bottom[i].x - p.x) * mix, h: p.h + (spec.bottom[i].h - p.h) * mix }));
    let low = Infinity;
    for (const p of pts) if (p.h < low) low = p.h;
    return pts.map((p) => ({ x: p.x, h: p.h - low }));
  };
  const place = (sec: readonly LoopPt[], a: number): number[][] => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return sec.map((p) => [p.x, (rIn + p.h) * sa, cz + (rIn + p.h) * ca]);
  };
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const toRad = Math.PI / 180;
  const gap = spec.gap;
  const span = gap ? (360 - (gap.toDeg - gap.fromDeg)) * toRad : Math.PI * 2;
  const start = gap ? gap.toDeg * toRad : 0;
  const count = gap ? Math.max(4, Math.round((span / (Math.PI * 2)) * spec.around)) : spec.around;
  const angles = Array.from({ length: gap ? count + 1 : count }, (_, i) => start + (span * i) / count);
  const secs = angles.map(sectionAt);
  const rings = secs.map((s, i) => place(s, angles[i]));
  // 断面の線は（x, h）で反時計回り。角度が増える向きに進むので、外向きの面は次の順
  for (let i = 0; i < count; i++) {
    const a = rings[i];
    const b = rings[(i + 1) % rings.length];
    for (let k = 0; k < L; k++) {
      const m = (k + 1) % L;
      tri(a[k], b[m], a[m]);
      tri(a[k], b[k], b[m]);
    }
  }
  if (gap) {
    // 切り口のふた：始まりの切り口は断面の線の向きのまま（角度が減る向きが外）、終わりの切り口は逆向き
    for (const [a, b, c] of earClip(secs[0])) tri(rings[0][a], rings[0][b], rings[0][c]);
    const e = rings.length - 1;
    for (const [a, b, c] of earClip(secs[e])) tri(rings[e][a], rings[e][c], rings[e][b]);
  }
  return new Float32Array(pos);
}

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
