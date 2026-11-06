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

/** 距離を自分で計算する形（石の面に沿う板など）。bbox の外は調べない */
export interface Field {
  dist: (x: number, y: number, z: number) => number;
  min: V3;
  max: V3;
  owner: number;
}

/** なめらかな最大（なめらかな最小の裏返し） */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export interface SolidOptions {
  /** 角の丸い箱（板など） */
  boxes?: readonly Box[];
  /** 距離を自分で計算する形 */
  fields?: readonly Field[];
  /** 格子の間隔（mm） */
  cell: number;
  /** つなぎ目の丸みの大きさ（mm） */
  blend: number;
  /** 引く形（石）：点の、その形の表面までの距離（内側は負） */
  subtract?: (x: number, y: number, z: number) => number;
  /** 引く所の縁に付ける丸み（mm。なければ角のまま）。座を彫った縁が、格子でぎざぎざに見えないように */
  subtractBlend?: number;
  /** この高さより下は作らない（腕の中に入る所を切る） */
  minZ?: number;
  /** ならす回数（既定 6） */
  smooth?: number;
  /** 頂点の向きを、距離の場の傾きで測るか（既定）、まわりの面の向きの平均で済ますか（速い。動かしている間の粗い形に） */
  normalsFrom?: "field" | "mesh";
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

/**
 * 格子の面の 4 隅が「内・外・内・外」と市松になる所（細い 2 つの部分が触れる所）をなくす。
 * そのままだと、その面をはさむ 2 つの頂点の辺を 4 枚の三角形が使い、STL が閉じた一つの形にならない。
 * 面の真ん中の値（双一次の鞍点）で、内どうしがつながるか外どうしがつながるかを決め、
 * それに合うよう、表面にいちばん近い隅の符号だけを裏返す（動くのは 1 目以内）。裏返すと隣の面が変わるので、なくなるまで繰り返す。
 * 返り値は裏返した隅の数
 */
export function resolveAmbiguousFaces(val: Float32Array, nx: number, ny: number, nz: number, cell = Infinity, maxRounds = 16): number {
  const stride = [1, nx, nx * ny];
  const size = [nx, ny, nz];
  const TINY = 1e-6;
  // 表面から 3 目より遠い隅の面は、4 隅とも同じ側（距離は動いた分しか変わらない。余裕をみて 3 目）
  const far = 3 * cell;
  // 面の向き：軸 a と軸 b で張る面（x-y・x-z・y-z）
  const AXES: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  const co = [0, 0, 0];
  const coords = (idx: number) => {
    co[0] = idx % nx;
    co[1] = Math.floor(idx / nx) % ny;
    co[2] = Math.floor(idx / (nx * ny));
  };
  /** 隅 i00 から軸 a・b へ張る面が市松なら、隅を 1 つ裏返して、その番号を返す（なければ -1） */
  const fix = (i00: number, da: number, db: number): number => {
    const v00 = val[i00];
    const v11 = val[i00 + da + db];
    const s00 = v00 < 0;
    if (s00 !== v11 < 0) return -1;
    const v10 = val[i00 + da];
    const v01 = val[i00 + db];
    if (v10 < 0 === s00 || v01 < 0 === s00) return -1;
    // 市松：鞍点の値で、どちらの対角がつながっているかを決める
    const den = v00 + v11 - v10 - v01;
    const insideJoined = (den !== 0 ? (v00 * v11 - v10 * v01) / den : 0) < 0;
    // つながる側に合わせて、つながらない側の隅のうち表面に近い方を裏返す
    let ia: number, ib: number, va: number, vb: number;
    if (s00 !== insideJoined) [ia, ib, va, vb] = [i00, i00 + da + db, v00, v11];
    else [ia, ib, va, vb] = [i00 + da, i00 + db, v10, v01];
    const [ix, vx] = Math.abs(va) <= Math.abs(vb) ? [ia, va] : [ib, vb];
    val[ix] = vx < 0 ? TINY : -TINY;
    return ix;
  };
  // 1 回目：表面の近くの隅から張る面を全部調べる
  let work: number[] = [];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const idx = (k * ny + j) * nx + i;
        const v = val[idx];
        if (v > far || v < -far) continue;
        co[0] = i;
        co[1] = j;
        co[2] = k;
        for (const [a, b] of AXES) {
          if (co[a] >= size[a] - 1 || co[b] >= size[b] - 1) continue;
          const f = fix(idx, stride[a], stride[b]);
          if (f >= 0) work.push(f);
        }
      }
  let flips = work.length;
  // 裏返した隅のまわりの 12 の面だけを、市松がなくなるまで調べ直す
  for (let round = 0; round < maxRounds && work.length; round++) {
    const next: number[] = [];
    for (const p of work) {
      coords(p);
      for (const [a, b] of AXES)
        for (let q = 0; q < 4; q++) {
          const oa = co[a] - (q & 1);
          const ob = co[b] - ((q >> 1) & 1);
          if (oa < 0 || ob < 0 || oa >= size[a] - 1 || ob >= size[b] - 1) continue;
          const f = fix(p - (q & 1) * stride[a] - ((q >> 1) & 1) * stride[b], stride[a], stride[b]);
          if (f >= 0) next.push(f);
        }
    }
    flips += next.length;
    work = next;
  }
  return flips;
}

/**
 * 重い形（一体の石座・ロウの丸み）を、作った順に覚える（record）か、前に覚えた物を順に返す（replay）。
 * 設計の画面は、重い形だけを別の糸（Web Worker）で作り、その結果をこの糸で順に使って、同じ指輪を組む（つまみが指についてくるように）。
 * 同じ設計なら、重い形は同じ順・同じ入力で作られる（組む処理は、同じ入力なら同じ出力）。順がずれたら投げる（間違った形を出さない）
 */
interface Tape {
  mode: "record" | "replay";
  list: unknown[];
  /** 作った所の名前。replay で順がずれていないかを見る */
  sigs: string[];
  at: number;
  /** 覚える形の中で、さらに覚える形を作っている深さ（外側の 1 つだけ覚える） */
  depth: number;
}
let tape: Tape | null = null;

/** f の中で作った重い形を、作った順に返す（写しなので、別の糸へそのまま送れる） */
export function recordHeavy<T>(f: () => T): { result: T; list: unknown[]; sigs: string[] } {
  const prev = tape;
  const t: Tape = { mode: "record", list: [], sigs: [], at: 0, depth: 0 };
  tape = t;
  try {
    return { result: f(), list: t.list, sigs: t.sigs };
  } finally {
    tape = prev;
  }
}

/** f の中の重い形を、作らずに list から順に返す。数や順が合わなければ投げる */
export function replayHeavy<T>(list: readonly unknown[], sigs: readonly string[], f: () => T): T {
  const prev = tape;
  const t: Tape = { mode: "replay", list: [...list], sigs: [...sigs], at: 0, depth: 0 };
  tape = t;
  try {
    const out = f();
    if (t.at !== t.list.length) throw new Error(`重い形の数が合わない（覚えた ${t.list.length}・使った ${t.at}）`);
    return out;
  } finally {
    tape = prev;
  }
}

/** 重い形を作る所（sig：作る所の名前）。覚えている間は写しを覚え、前の物を使う間は作らずに返す。ふだんは make() そのもの */
export function heavy<T>(sig: string, make: () => T): T {
  const t = tape;
  if (!t || t.depth > 0) return make();
  if (t.mode === "replay") {
    const i = t.at++;
    if (i >= t.list.length || t.sigs[i] !== sig) throw new Error("重い形の順が合わない");
    return t.list[i] as T;
  }
  t.depth++;
  let out: T;
  try {
    out = make();
  } finally {
    t.depth--;
  }
  // 写しを覚える（あとの処理が配列を書き換えても、覚えた物は作ったときのまま）
  t.list.push(structuredClone(out));
  t.sigs.push(sig);
  return out;
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
  const fields = o.fields ?? [];
  for (const fd of fields) {
    x0 = Math.min(x0, fd.min[0]);
    y0 = Math.min(y0, fd.min[1]);
    z0 = Math.min(z0, fd.min[2]);
    x1 = Math.max(x1, fd.max[0]);
    y1 = Math.max(y1, fd.max[1]);
    z1 = Math.max(z1, fd.max[2]);
  }
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
  // 自分で計算する形も、箱のあとの番号で振り分ける
  fields.forEach((fd, fi) => {
    const ix0 = Math.max(0, Math.floor((fd.min[0] - reach - x0) / B));
    const ix1 = Math.min(bx - 1, Math.floor((fd.max[0] + reach - x0) / B));
    const iy0 = Math.max(0, Math.floor((fd.min[1] - reach - y0) / B));
    const iy1 = Math.min(by - 1, Math.floor((fd.max[1] + reach - y0) / B));
    const iz0 = Math.max(0, Math.floor((fd.min[2] - reach - z0) / B));
    const iz1 = Math.min(bz - 1, Math.floor((fd.max[2] + reach - z0) / B));
    for (let iz = iz0; iz <= iz1; iz++) for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) bins[(iz * by + iy) * bx + ix].push(-(boxes.length + fi + 1));
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
  const perTube = new Float64Array(tubes.length + boxes.length + fields.length).fill(NaN);
  const ownerOf = (g: number) => (g < tubes.length ? tubes[g].owner : g < tubes.length + boxes.length ? boxes[g - tubes.length].owner : fields[g - tubes.length - boxes.length].owner);
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
          const e = -si - 1;
          dd = e < boxes.length ? boxDist(boxes[e], x, y, z) : fields[e - boxes.length].dist(x, y, z);
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
      if (o.subtract && d < band) d = o.subtractBlend ? smax(d, -o.subtract(x, y, z), o.subtractBlend) : Math.max(d, -o.subtract(x, y, z));
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
  // 粗い箱ごとに：まわりの粗い 8 点がどれも表面から遠く、同じ側なら、その値（近い方）で足りる。そうでなければ NaN
  const ccx = cx - 1;
  const ccy = cy - 1;
  const farVal = new Float32Array(ccx * ccy * (cz - 1));
  for (let ck = 0; ck < cz - 1; ck++)
    for (let cj = 0; cj < ccy; cj++)
      for (let ci = 0; ci < ccx; ci++) {
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
        farVal[(ck * ccy + cj) * ccx + ci] = far ? sign * near : NaN;
      }
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * c;
    const ck = Math.min(cz - 2, Math.floor(k / S));
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * c;
      const row = (ck * ccy + Math.min(cy - 2, Math.floor(j / S))) * ccx;
      for (let i = 0; i < nx; i++) {
        const fv = farVal[row + Math.min(cx - 2, Math.floor(i / S))];
        const idx = (k * ny + j) * nx + i;
        if (fv === fv) {
          val[idx] = fv;
          own[idx] = -1;
          continue;
        }
        val[idx] = evalAt(x0 + i * c, y, z, 2 * c);
        own[idx] = owner;
      }
    }
  }

  resolveAmbiguousFaces(val, nx, ny, nz, c);

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

  // 頂点ごとの向き：距離の場の傾き（小さくずらした 6 点の差）。速く済ますときは、まわりの四角の向き（面積の重み）の平均
  const N = new Float64Array(P.length);
  if (o.normalsFrom === "mesh") {
    for (const l of byOwner.values())
      for (let q = 0; q < l.length; q += 4) {
        const a = l[q] * 3;
        const b = l[q + 1] * 3;
        const cc = l[q + 2] * 3;
        const d = l[q + 3] * 3;
        // 対角線どうしの外積（四角の面積の 2 倍の大きさで、外向き）
        const ux = P[cc] - P[a];
        const uy = P[cc + 1] - P[a + 1];
        const uz = P[cc + 2] - P[a + 2];
        const wx = P[d] - P[b];
        const wy = P[d + 1] - P[b + 1];
        const wz = P[d + 2] - P[b + 2];
        const nx_ = uy * wz - uz * wy;
        const ny_ = uz * wx - ux * wz;
        const nz_ = ux * wy - uy * wx;
        for (const v of [a, b, cc, d]) {
          N[v] += nx_;
          N[v + 1] += ny_;
          N[v + 2] += nz_;
        }
      }
    for (let v = 0; v < nv; v++) {
      const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
      N[v * 3] /= l;
      N[v * 3 + 1] /= l;
      N[v * 3 + 2] /= l;
    }
  } else {
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
