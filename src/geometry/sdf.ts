// 一体の形（鋳造の原型のように継ぎ目のない形）を作る：
// 細い管（爪・輪）を「表面までの距離」で表し、なめらかにつないで（つなぎ目に丸み）、石の形で座を彫り、
// 細かい格子の上で 0 の所を面にする（surface nets）。画面に依存しない純粋な関数。
import type { V3 } from "./mesh";

/** 中心の線と、点ごとの半径を持つ管（端は丸い） */
export interface Tube {
  pts: V3[];
  radii: number[];
  /** 持ち主の番号（爪・輪のどれか。三角形を持ち主ごとに分けるのに使う） */
  owner: number;
}

/** 角の丸い箱（向きは u・v・w の 3 本の単位ベクトル、half はそれぞれの向きの半分の大きさ） */
export interface Box {
  center: V3;
  u: V3;
  v: V3;
  w: V3;
  half: V3;
  round: number;
  owner: number;
}

export interface SolidOptions {
  /** 角の丸い箱（板など） */
  boxes?: readonly Box[];
  /** 格子の間隔（mm） */
  cell: number;
  /** つなぎ目の丸みの大きさ（mm） */
  blend: number;
  /** 引く形（石）：点の、その形の表面までの距離（内側は負） */
  subtract?: (x: number, y: number, z: number) => number;
  /** この高さより下は作らない（腕の中に入る所を切る） */
  minZ?: number;
  /** ならす回数（既定 6） */
  smooth?: number;
}

export interface SolidMesh {
  /** 三角形ごとに 3 頂点 × xyz。持ち主の順にまとめてある */
  positions: Float32Array;
  /** 持ち主ごとの三角形の範囲 */
  ranges: Map<number, { start: number; count: number }>;
  /** 頂点ごとの向き（形の距離の場の傾きから。光の映り込みがなめらかになる） */
  normals: Float32Array;
}

interface Seg {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  ra: number;
  rb: number;
  tube: number;
}

/** なめらかな最小（多項式）。k の幅でつなぎ目に丸みが付く */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/** 線分（半径が a から b へ変わる）までの距離 */
function segDist(s: Seg, x: number, y: number, z: number): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const dz = s.bz - s.az;
  const L2 = dx * dx + dy * dy + dz * dz;
  let t = L2 > 0 ? ((x - s.ax) * dx + (y - s.ay) * dy + (z - s.az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = s.ax + dx * t - x;
  const py = s.ay + dy * t - y;
  const pz = s.az + dz * t - z;
  return Math.sqrt(px * px + py * py + pz * pz) - (s.ra + (s.rb - s.ra) * t);
}

/** 管をなめらかにつないだ形を、三角形の面にする */
export function buildSolid(tubes: readonly Tube[], o: SolidOptions): SolidMesh {
  const segs: Seg[] = [];
  let x0 = Infinity,
    y0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    z1 = -Infinity;
  tubes.forEach((tb, ti) => {
    for (let i = 0; i + 1 < tb.pts.length; i++) {
      const a = tb.pts[i];
      const b = tb.pts[i + 1];
      segs.push({ ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], ra: tb.radii[i], rb: tb.radii[i + 1], tube: ti });
    }
    tb.pts.forEach((p, i) => {
      const r = tb.radii[i];
      x0 = Math.min(x0, p[0] - r);
      y0 = Math.min(y0, p[1] - r);
      z0 = Math.min(z0, p[2] - r);
      x1 = Math.max(x1, p[0] + r);
      y1 = Math.max(y1, p[1] + r);
      z1 = Math.max(z1, p[2] + r);
    });
  });
  const boxes = o.boxes ?? [];
  for (const bx of boxes) {
    const ext = [0, 1, 2].map((a) => Math.abs(bx.u[a]) * bx.half[0] + Math.abs(bx.v[a]) * bx.half[1] + Math.abs(bx.w[a]) * bx.half[2] + bx.round);
    x0 = Math.min(x0, bx.center[0] - ext[0]);
    y0 = Math.min(y0, bx.center[1] - ext[1]);
    z0 = Math.min(z0, bx.center[2] - ext[2]);
    x1 = Math.max(x1, bx.center[0] + ext[0]);
    y1 = Math.max(y1, bx.center[1] + ext[1]);
    z1 = Math.max(z1, bx.center[2] + ext[2]);
  }
  const c = o.cell;
  const pad = o.blend + 2 * c;
  x0 -= pad;
  y0 -= pad;
  z0 = Math.max(z0 - pad, o.minZ ?? -Infinity);
  x1 += pad;
  y1 += pad;
  z1 += pad;
  const nx = Math.ceil((x1 - x0) / c) + 1;
  const ny = Math.ceil((y1 - y0) / c) + 1;
  const nz = Math.ceil((z1 - z0) / c) + 1;

  // 線分を粗い箱に振り分けて、近くの線分だけを調べる
  const B = 0.4;
  const bx = Math.ceil((x1 - x0) / B) + 1;
  const by = Math.ceil((y1 - y0) / B) + 1;
  const bz = Math.ceil((z1 - z0) / B) + 1;
  const bins: number[][] = Array.from({ length: bx * by * bz }, () => []);
  const reach = o.blend + c;
  segs.forEach((s, si) => {
    const r = Math.max(s.ra, s.rb) + reach;
    const ix0 = Math.max(0, Math.floor((Math.min(s.ax, s.bx) - r - x0) / B));
    const ix1 = Math.min(bx - 1, Math.floor((Math.max(s.ax, s.bx) + r - x0) / B));
    const iy0 = Math.max(0, Math.floor((Math.min(s.ay, s.by) - r - y0) / B));
    const iy1 = Math.min(by - 1, Math.floor((Math.max(s.ay, s.by) + r - y0) / B));
    const iz0 = Math.max(0, Math.floor((Math.min(s.az, s.bz) - r - z0) / B));
    const iz1 = Math.min(bz - 1, Math.floor((Math.max(s.az, s.bz) + r - z0) / B));
    for (let iz = iz0; iz <= iz1; iz++) for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) bins[(iz * by + iy) * bx + ix].push(si);
  });

  // 箱も粗い箱の振り分けに入れる（線分の番号のあとに、-(箱の番号 + 1) で入れる）
  boxes.forEach((b, bi) => {
    const ext = [0, 1, 2].map((a) => Math.abs(b.u[a]) * b.half[0] + Math.abs(b.v[a]) * b.half[1] + Math.abs(b.w[a]) * b.half[2] + b.round + reach);
    const ix0 = Math.max(0, Math.floor((b.center[0] - ext[0] - x0) / B));
    const ix1 = Math.min(bx - 1, Math.floor((b.center[0] + ext[0] - x0) / B));
    const iy0 = Math.max(0, Math.floor((b.center[1] - ext[1] - y0) / B));
    const iy1 = Math.min(by - 1, Math.floor((b.center[1] + ext[1] - y0) / B));
    const iz0 = Math.max(0, Math.floor((b.center[2] - ext[2] - z0) / B));
    const iz1 = Math.min(bz - 1, Math.floor((b.center[2] + ext[2] - z0) / B));
    for (let iz = iz0; iz <= iz1; iz++) for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) bins[(iz * by + iy) * bx + ix].push(-(bi + 1));
  });
  const boxDist = (b: Box, x: number, y: number, z: number) => {
    const px = x - b.center[0];
    const py = y - b.center[1];
    const pz = z - b.center[2];
    const qx = Math.abs(px * b.u[0] + py * b.u[1] + pz * b.u[2]) - b.half[0];
    const qy = Math.abs(px * b.v[0] + py * b.v[1] + pz * b.v[2]) - b.half[1];
    const qz = Math.abs(px * b.w[0] + py * b.w[1] + pz * b.w[2]) - b.half[2];
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - b.round;
  };
  const FAR = 10;
  const val = new Float32Array(nx * ny * nz);
  const own = new Int16Array(nx * ny * nz);
  const perTube = new Float64Array(tubes.length + boxes.length).fill(NaN);
  const ownerOf = (g: number) => (g < tubes.length ? tubes[g].owner : boxes[g - tubes.length].owner);
  const touched: number[] = [];
  let owner = -1;
  /** 点の、形の表面までの距離（内側は負）。いちばん近い管の持ち主を owner に入れる */
  const evalAt = (x: number, y: number, z: number, band: number): number => {
    const bin = bins[(Math.min(bz - 1, Math.max(0, Math.floor((z - z0) / B))) * by + Math.min(by - 1, Math.max(0, Math.floor((y - y0) / B)))) * bx + Math.min(bx - 1, Math.max(0, Math.floor((x - x0) / B)))];
    let d = FAR;
    owner = -1;
    if (bin.length) {
      // 同じ管の中はふつうの最小、管どうしはなめらかな最小
      touched.length = 0;
      for (const si of bin) {
        let g: number;
        let dd: number;
        if (si < 0) {
          g = tubes.length - si - 1;
          dd = boxDist(boxes[-si - 1], x, y, z);
        } else {
          const sg = segs[si];
          g = sg.tube;
          dd = segDist(sg, x, y, z);
        }
        const cur = perTube[g];
        if (cur !== cur) {
          perTube[g] = dd;
          touched.push(g);
        } else if (dd < cur) perTube[g] = dd;
      }
      let best = FAR;
      for (const t of touched) {
        const dd = perTube[t];
        if (dd < best) {
          best = dd;
          owner = ownerOf(t);
        }
        d = d === FAR ? dd : smin(d, dd, o.blend);
        perTube[t] = NaN;
      }
      if (o.subtract && d < band) d = Math.max(d, -o.subtract(x, y, z));
    }
    if (o.minZ !== undefined && z < o.minZ) d = Math.max(d, o.minZ - z);
    return d;
  };

  // 粗い格子（S 目おき）で先に測り、表面から遠い所は細かく測らない（距離は動いた分しか変わらない）
  const S = 2;
  const cx = Math.ceil((nx - 1) / S) + 1;
  const cy = Math.ceil((ny - 1) / S) + 1;
  const cz = Math.ceil((nz - 1) / S) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  const band = Math.sqrt(3) * S * c * 1.1;
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) coarse[(k * cy + j) * cx + i] = evalAt(x0 + i * S * c, y0 + j * S * c, z0 + k * S * c, band + 2 * c);
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * c;
    const ck = Math.min(cz - 2, Math.floor(k / S));
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * c;
      const cj = Math.min(cy - 2, Math.floor(j / S));
      for (let i = 0; i < nx; i++) {
        const ci = Math.min(cx - 2, Math.floor(i / S));
        // まわりの粗い 8 点がどれも表面から遠く、同じ側なら、その値で足りる
        let far = true;
        let sign = 0;
        let near = Infinity;
        for (let q = 0; q < 8 && far; q++) {
          const v = coarse[((ck + ((q >> 2) & 1)) * cy + (cj + ((q >> 1) & 1))) * cx + (ci + (q & 1))];
          const sg = v < 0 ? -1 : 1;
          if (Math.abs(v) < band || (sign && sg !== sign)) far = false;
          sign = sg;
          near = Math.min(near, Math.abs(v));
        }
        const idx = (k * ny + j) * nx + i;
        if (far) {
          val[idx] = sign * near;
          own[idx] = -1;
          continue;
        }
        val[idx] = evalAt(x0 + i * c, y, z, 2 * c);
        own[idx] = owner;
      }
    }
  }

  // surface nets：0 をまたぐ格子の箱ごとに頂点を 1 つ（またぐ辺の 0 の所の平均）
  const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const vx: number[] = [];
  const at = (i: number, j: number, k: number) => val[(k * ny + j) * nx + i];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const CORNERS: [number, number, number][] = Array.from({ length: 8 }, (_, q) => [q & 1, (q >> 1) & 1, (q >> 2) & 1]);
  const corner = (q: number) => CORNERS[q];
  const cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        const base = (k * ny + j) * nx + i;
        cv[0] = val[base];
        cv[1] = val[base + 1];
        cv[2] = val[base + nx];
        cv[3] = val[base + nx + 1];
        cv[4] = val[base + nx * ny];
        cv[5] = val[base + nx * ny + 1];
        cv[6] = val[base + nx * ny + nx];
        cv[7] = val[base + nx * ny + nx + 1];
        for (let q = 0; q < 8; q++) if (cv[q] < 0) mask |= 1 << q;
        if (mask === 0 || mask === 255) continue;
        let sx = 0,
          sy = 0,
          sz = 0,
          n = 0;
        for (const [p, q] of EDGES) {
          if (cv[p] < 0 === cv[q] < 0) continue;
          const t = cv[p] / (cv[p] - cv[q]);
          const A = corner(p);
          const Bq = corner(q);
          sx += A[0] + (Bq[0] - A[0]) * t;
          sy += A[1] + (Bq[1] - A[1]) * t;
          sz += A[2] + (Bq[2] - A[2]) * t;
          n++;
        }
        vid[(k * (ny - 1) + j) * (nx - 1) + i] = vx.length / 3;
        vx.push(x0 + (i + sx / n) * c, y0 + (j + sy / n) * c, z0 + (k + sz / n) * c);
      }
  const cell = (i: number, j: number, k: number) => vid[(k * (ny - 1) + j) * (nx - 1) + i];

  // 符号の変わる格子の辺ごとに、まわりの 4 つの箱の頂点で四角を作る（外向きにそろえる）
  const byOwner = new Map<number, number[]>();
  const push = (ow: number, a: number, b: number, cc: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || cc < 0 || d < 0) return;
    let list = byOwner.get(ow);
    if (!list) byOwner.set(ow, (list = []));
    if (flip) list.push(a, d, cc, b);
    else list.push(a, b, cc, d);
  };
  const ownerAt = (i: number, j: number, k: number, i2: number, j2: number, k2: number) => {
    const a = (k * ny + j) * nx + i;
    const b = (k2 * ny + j2) * nx + i2;
    return val[a] < val[b] ? own[a] : own[b];
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = at(i, j, k);
        const in0 = v0 < 0;
        // x の辺 (i,j,k)-(i+1,j,k)：まわりの箱 (i, j-1..j, k-1..k)
        if (i < nx - 1 && in0 !== at(i + 1, j, k) < 0)
          push(ownerAt(i, j, k, i + 1, j, k), cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !in0);
        if (j < ny - 1 && in0 !== at(i, j + 1, k) < 0)
          push(ownerAt(i, j, k, i, j + 1, k), cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !in0);
        if (k < nz - 1 && in0 !== at(i, j, k + 1) < 0)
          push(ownerAt(i, j, k, i, j, k + 1), cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !in0);
      }

  // なめらかにならす（Taubin：縮みを戻しながら、となりの頂点の平均へ寄せる）。格子の段のでこぼこを消す
  const nv = vx.length / 3;
  const nbr: number[][] = Array.from({ length: nv }, () => []);
  for (const l of byOwner.values())
    for (let q = 0; q < l.length; q += 4)
      for (let e = 0; e < 4; e++) {
        const p = l[q + e];
        const r = l[q + ((e + 1) % 4)];
        if (!nbr[p].includes(r)) nbr[p].push(r);
        if (!nbr[r].includes(p)) nbr[r].push(p);
      }
  const P = Float64Array.from(vx);
  const tmp = new Float64Array(P.length);
  const step = (w: number) => {
    for (let v = 0; v < nv; v++) {
      const ns = nbr[v];
      if (!ns.length) {
        tmp[v * 3] = P[v * 3];
        tmp[v * 3 + 1] = P[v * 3 + 1];
        tmp[v * 3 + 2] = P[v * 3 + 2];
        continue;
      }
      let sx = 0,
        sy = 0,
        sz = 0;
      for (const u of ns) {
        sx += P[u * 3];
        sy += P[u * 3 + 1];
        sz += P[u * 3 + 2];
      }
      const m = ns.length;
      tmp[v * 3] = P[v * 3] + w * (sx / m - P[v * 3]);
      tmp[v * 3 + 1] = P[v * 3 + 1] + w * (sy / m - P[v * 3 + 1]);
      tmp[v * 3 + 2] = P[v * 3 + 2] + w * (sz / m - P[v * 3 + 2]);
    }
    P.set(tmp);
  };
  for (let it = 0; it < (o.smooth ?? 6); it++) {
    step(0.5);
    step(-0.53);
  }

  // 頂点ごとの向き：距離の場の傾き（小さくずらした 6 点の差）
  const N = new Float64Array(P.length);
  const e = c * 0.5;
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3];
    const y = P[v * 3 + 1];
    const z = P[v * 3 + 2];
    const gx = evalAt(x + e, y, z, 1) - evalAt(x - e, y, z, 1);
    const gy = evalAt(x, y + e, z, 1) - evalAt(x, y - e, z, 1);
    const gz = evalAt(x, y, z + e, 1) - evalAt(x, y, z - e, 1);
    const l = Math.hypot(gx, gy, gz) || 1;
    N[v * 3] = gx / l;
    N[v * 3 + 1] = gy / l;
    N[v * 3 + 2] = gz / l;
  }

  let total = 0;
  for (const l of byOwner.values()) total += (l.length / 4) * 18;
  const positions = new Float32Array(total);
  const normals = new Float32Array(total);
  const ranges = new Map<number, { start: number; count: number }>();
  let off = 0;
  const put = (v: number) => {
    normals[off] = N[v * 3];
    positions[off++] = P[v * 3];
    normals[off] = N[v * 3 + 1];
    positions[off++] = P[v * 3 + 1];
    normals[off] = N[v * 3 + 2];
    positions[off++] = P[v * 3 + 2];
  };
  for (const [ow, l] of [...byOwner.entries()].sort((a, b) => a[0] - b[0])) {
    const start = off / 9;
    for (let q = 0; q < l.length; q += 4) {
      put(l[q]);
      put(l[q + 1]);
      put(l[q + 2]);
      put(l[q]);
      put(l[q + 2]);
      put(l[q + 3]);
    }
    ranges.set(ow, { start, count: off / 9 - start });
  }
  return { positions, ranges, normals };
}
