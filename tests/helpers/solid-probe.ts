// 閉じた形（三角形の並び）の中か外かと、面までの距離を調べる道具。テストと、形を測る script（scripts/tension-measure.ts）で使う。
// 形の処理の中には入れない（測るだけ）。座標は mm。
export interface Probe {
  /** 点が形の中か（y の向きの光線が面を何回通るかで見る） */
  inside(x: number, y: number, z: number): boolean;
  /** 点から形の面までの距離（maxMm より遠ければ Infinity） */
  distance(x: number, y: number, z: number, maxMm?: number): number;
  /** (x, z) を通る y の向きの線が面に当たる y の一覧（小さい順） */
  hitsAlongY(x: number, z: number): number[];
}

const CELL_2D = 0.25;
const CELL_3D = 0.35;

type Bin = Map<number, number[]>;
const key2 = (i: number, k: number) => (i + 5000) * 10000 + (k + 5000);
const key3 = (i: number, j: number, k: number) => (i + 500) * 1_000_000 + (j + 500) * 1000 + (k + 500);

export function probe(p: Float32Array): Probe {
  const n = p.length / 9;
  const flat: Bin = new Map();
  const solid: Bin = new Map();
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const xs = [p[o], p[o + 3], p[o + 6]];
    const ys = [p[o + 1], p[o + 4], p[o + 7]];
    const zs = [p[o + 2], p[o + 5], p[o + 8]];
    const x0 = Math.floor(Math.min(...xs) / CELL_2D), x1 = Math.floor(Math.max(...xs) / CELL_2D);
    const z0 = Math.floor(Math.min(...zs) / CELL_2D), z1 = Math.floor(Math.max(...zs) / CELL_2D);
    for (let i = x0; i <= x1; i++)
      for (let k = z0; k <= z1; k++) {
        const c = key2(i, k);
        (flat.get(c) ?? flat.set(c, []).get(c)!).push(t);
      }
    const a0 = Math.floor(Math.min(...xs) / CELL_3D), a1 = Math.floor(Math.max(...xs) / CELL_3D);
    const b0 = Math.floor(Math.min(...ys) / CELL_3D), b1 = Math.floor(Math.max(...ys) / CELL_3D);
    const c0 = Math.floor(Math.min(...zs) / CELL_3D), c1 = Math.floor(Math.max(...zs) / CELL_3D);
    for (let i = a0; i <= a1; i++)
      for (let j = b0; j <= b1; j++)
        for (let k = c0; k <= c1; k++) {
          const c = key3(i, j, k);
          (solid.get(c) ?? solid.set(c, []).get(c)!).push(t);
        }
  }
  const hitsAlongY = (x0: number, z0: number): number[] => {
    // 三角形の辺や頂点にちょうど当たらないよう、ごくわずかにずらす（1 万分の 1 mm より小さい）
    const x = x0 + 1.7e-5;
    const z = z0 + 2.3e-5;
    const list = flat.get(key2(Math.floor(x / CELL_2D), Math.floor(z / CELL_2D))) ?? [];
    const out: number[] = [];
    for (const t of list) {
      const o = t * 9;
      const ax = p[o], az = p[o + 2], bx = p[o + 3], bz = p[o + 5], cx = p[o + 6], cz = p[o + 8];
      const d = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (Math.abs(d) < 1e-14) continue;
      const u = ((x - ax) * (cz - az) - (z - az) * (cx - ax)) / d;
      const v = ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      out.push(p[o + 1] + u * (p[o + 4] - p[o + 1]) + v * (p[o + 7] - p[o + 1]));
    }
    return out.sort((a, b) => a - b);
  };
  return {
    hitsAlongY,
    inside(x, y, z) {
      let c = 0;
      for (const h of hitsAlongY(x, z)) if (h > y) c++;
      return c % 2 === 1;
    },
    distance(x, y, z, maxMm = 1) {
      const r = Math.ceil(maxMm / CELL_3D);
      const i0 = Math.floor(x / CELL_3D), j0 = Math.floor(y / CELL_3D), k0 = Math.floor(z / CELL_3D);
      let best = Infinity;
      const seen = new Set<number>();
      for (let i = i0 - r; i <= i0 + r; i++)
        for (let j = j0 - r; j <= j0 + r; j++)
          for (let k = k0 - r; k <= k0 + r; k++) {
            for (const t of solid.get(key3(i, j, k)) ?? []) {
              if (seen.has(t)) continue;
              seen.add(t);
              const d = pointTriangle(p, t * 9, x, y, z);
              if (d < best) best = d;
            }
          }
      return best <= maxMm ? best : Infinity;
    },
  };
}

/** 点と三角形の距離 */
function pointTriangle(p: Float32Array, o: number, x: number, y: number, z: number): number {
  const ax = p[o], ay = p[o + 1], az = p[o + 2];
  const abx = p[o + 3] - ax, aby = p[o + 4] - ay, abz = p[o + 5] - az;
  const acx = p[o + 6] - ax, acy = p[o + 7] - ay, acz = p[o + 8] - az;
  const apx = x - ax, apy = y - ay, apz = z - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(apx, apy, apz);
  const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bpx, bpy, bpz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(apx - v * abx, apy - v * aby, apz - v * abz);
  }
  const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cpx, cpy, cpz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(apx - w * acx, apy - w * acy, apz - w * acz);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return Math.hypot(bpx - w * (acx - abx), bpy - w * (acy - aby), bpz - w * (acz - abz));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return Math.hypot(apx - abx * v - acx * w, apy - aby * v - acy * w, apz - abz * v - acz * w);
}

/** 三角形の面の上に、だいたい stepMm ごとの点をまく（端の点もふくむ） */
export function surfaceSamples(p: Float32Array, stepMm: number, visit: (x: number, y: number, z: number) => void): number {
  let count = 0;
  for (let o = 0; o < p.length; o += 9) {
    const ab = Math.hypot(p[o + 3] - p[o], p[o + 4] - p[o + 1], p[o + 5] - p[o + 2]);
    const ac = Math.hypot(p[o + 6] - p[o], p[o + 7] - p[o + 1], p[o + 8] - p[o + 2]);
    const bc = Math.hypot(p[o + 6] - p[o + 3], p[o + 7] - p[o + 4], p[o + 8] - p[o + 5]);
    const m = Math.max(1, Math.ceil(Math.max(ab, ac, bc) / stepMm));
    for (let i = 0; i <= m; i++)
      for (let j = 0; j <= m - i; j++) {
        const u = i / m;
        const v = j / m;
        const w = 1 - u - v;
        visit(p[o] * w + p[o + 3] * u + p[o + 6] * v, p[o + 1] * w + p[o + 4] * u + p[o + 7] * v, p[o + 2] * w + p[o + 5] * u + p[o + 8] * v);
        count++;
      }
  }
  return count;
}

/** 開いた辺（向きを見ない）・面の向きの合わない辺・3 枚以上が共有する辺・形の数・つぶれた三角形を数える */
export function topology(p: Float32Array) {
  const ids = new Map<string, number>();
  const id = (i: number) => {
    const k = `${p[i]},${p[i + 1]},${p[i + 2]}`;
    let v = ids.get(k);
    if (v === undefined) ids.set(k, (v = ids.size));
    return v;
  };
  const edges = new Map<string, number>();
  const parent: number[] = [];
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  let degenerate = 0;
  for (let t = 0; t < p.length; t += 9) {
    const v = [id(t), id(t + 3), id(t + 6)];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) degenerate++;
    for (const a of v) if (parent[a] === undefined) parent[a] = a;
    for (let e = 0; e < 3; e++) {
      const a = v[e];
      const b = v[(e + 1) % 3];
      edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1);
      parent[find(a)] = find(b);
    }
  }
  let open = 0;
  let flipped = 0;
  let shared = 0;
  for (const [k, n] of edges) {
    const [a, b] = k.split(">");
    const back = edges.get(`${b}>${a}`) ?? 0;
    if (back !== n) flipped++;
    if ((n + back) % 2 === 1) open++;
    if (n > 1) shared++;
  }
  return { open, flipped, shared, degenerate, shells: new Set([...ids.values()].map(find)).size };
}
