// 腕の場所ごとの形（ロフト）：いちばん上から下へ、いくつかの場所の断面・幅・厚みを決めると、その間をなめらかにつなぐ。
// 画面に依存しない純粋な関数。座標と記号は shank.ts と同じ（φ は指のまわりの角度。いちばん上が 0、＋ は +y の側）。
//
// - 左右は同じ形。場所は「いちばん上からの角度 a（0〜π）」で決める。
// - いちばん上のまわり（holdRad まで）は、いちばん上の形のまま。石座の下の輪・ザグり・ロウの丸みは、この中の形だけを見て作るので、そのまま使える。
// - 幅・厚み・うねりは、行き過ぎない曲線（PCHIP）でつなぐ。両はしの傾きは 0（いちばん上といちばん下で折れない）。だから、いちばん細い所は、決めた場所のどこか。
// - 断面の線は、どの場所でも同じ数の行にそろえる。行は「線の長さの割合」で対応させ、どの場所の線の点も行に入れる（角や稜線が丸まらない）。
//   行の数はどの φ でも同じなので、格子のまま閉じた形になる。
// - 内側の線（指の側）は動かさない。どの場所でも内側は半径 r の円の上（内径は変わらない）。

/** 断面の線：幅の位置 ξ（−1〜1）と高さ η（0〜1）の点の並び。右の端の内側 → 上 → 左の端の内側 */
export type SectionRows = readonly (readonly [number, number])[];

export interface LoftPlace {
  /** いちばん上からの角度（ラジアン、0〜π。π がいちばん下） */
  at: number;
  widthMm: number;
  thicknessMm: number;
  outline: SectionRows;
  /** 指の向きへ寄せる量（mm）。+y の側は +x へ、−y の側は −x へ（S の字の流れ）。いちばん上といちばん下は 0 */
  swayMm: number;
}

/** ある φ での形を決める数 */
export interface LoftFrame {
  w: number;
  t: number;
  /** 指の向きへ寄せる量（mm。この φ の側の向きをふくむ） */
  sway: number;
  /** 断面の線の区間と、その中の割合 */
  k: number;
  u: number;
}

export interface Loft {
  /** 場所ごとの断面の行（0 番がいちばん上。どの場所も同じ行数） */
  rows: [number, number][][];
  /** いちばん上の形のまま保つ角度を決める（石座の場所が分かってから呼ぶ） */
  setHold(holdRad: number): void;
  /** 断面の行を細かくする（行 j と j ＋ 1 の間の割合 s の所に行を足す。どの場所も同じように） */
  refine(trace: readonly { j: number; s: number }[]): void;
  frame(phi: number): LoftFrame;
  /** 断面の点 i（内側の平らな行 flat 本 ＋ 外側の行。外側の行は小数でもよい）の、指の向きの位置 x と、指の軸からの距離 ρ */
  point(i: number, flat: number, f: LoftFrame, innerR: number, wOverride?: number): [number, number];
  /** 外側の行 r（小数）での、面の外向きの向き（断面の面の上。x と ρ の成分。長さ 1） */
  normalAt(r: number, f: LoftFrame): [number, number];
  /** 外側の行の区間 seg（行 seg と seg ＋ 1 の間）の割合 s での、線の進む向き（x と ρ の成分。長さ 1）。折れ目（稜線）の向こうの線は見ない */
  tangentIn(seg: number, s: number, f: LoftFrame): [number, number];
  /** 行 seg と seg ＋ 1 の間の長さ（mm） */
  rowMmAt(seg: number, f: LoftFrame): number;
  /** その行が折れ目（稜線）か */
  isCrease(row: number): boolean;
  /** その場所の、外の面の線の長さの半分（mm） */
  arcHalf(f: LoftFrame): number;
  /** 腕のまわりの見本：場所ごとの幅・厚み・断面（確かめと画面に使う） */
  samples(): { atDeg: number; widthMm: number; thicknessMm: number; outlineMm: [number, number][] }[];
  /** ぐるりと見て、いちばん細い幅といちばん薄い厚み（どの場所でも、いちばん厚い所の厚み） */
  extremes(): { minWidthMm: number; minThicknessMm: number };
}

/** 線の向きがこれより急に変わる行を、折れ目（稜線）とみなす（度。形を作るための決まり） */
const CREASE_DEG = 28;

/** 場所と場所の間の、いちばん狭い角度（形を作るための決まり。急に変わって段に見えないように） */
const MIN_GAP_RAD = (6 * Math.PI) / 180;

/** 行き過ぎない曲線（PCHIP）。xs は小さい順。両はしの傾きは 0 */
export function pchip(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = new Array<number>(n).fill(0);
  for (let i = 1; i + 1 < n; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i + 2 < n && x > xs[i + 1]) i++;
    const s = (x - xs[i]) / h[i];
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h[i] * m[i + 1];
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 線の点ごとの、線の長さの割合（0〜1） */
function fractions(line: SectionRows): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const total = out[out.length - 1] || 1;
  return out.map((v) => v / total);
}

/** 線の上の、長さの割合 f の点 */
function pointAt(line: SectionRows, fr: readonly number[], f: number): [number, number] {
  let j = 0;
  while (j + 2 < line.length && f > fr[j + 1]) j++;
  const span = fr[j + 1] - fr[j];
  const s = span > 1e-12 ? Math.min(1, Math.max(0, (f - fr[j]) / span)) : 0;
  return [line[j][0] + (line[j + 1][0] - line[j][0]) * s, line[j][1] + (line[j + 1][1] - line[j][1]) * s];
}

/** どの線の点も入るよう、同じ行数にそろえる */
export function commonRows(lines: readonly SectionRows[]): [number, number][][] {
  const frs = lines.map(fractions);
  const all = frs.flat().sort((a, b) => a - b);
  const marks: number[] = [];
  for (const f of all) if (!marks.length || f - marks[marks.length - 1] > 1e-5) marks.push(f);
  marks[0] = 0;
  marks[marks.length - 1] = 1;
  return lines.map((line, k) => marks.map((f) => pointAt(line, frs[k], f)));
}

/** 場所の角度を、いちばん上の形を保つ所より先に、順に、すき間をあけて置き直す */
function spread(ats: readonly number[], hold: number): number[] {
  const out: number[] = [];
  let prev = hold;
  ats.forEach((a, i) => {
    const room = (ats.length - 1 - i) * MIN_GAP_RAD;
    const at = Math.min(Math.PI - room, Math.max(prev + MIN_GAP_RAD, a));
    out.push(at);
    prev = at;
  });
  return out;
}

/**
 * ロフトを作る。top はいちばん上の形、places はそれより下の場所（角度の小さい順）。
 * 作ったあとで setHold を呼ぶ（なければ 0）
 */
export function makeLoft(top: { widthMm: number; thicknessMm: number; outline: SectionRows }, places: readonly LoftPlace[]): Loft {
  const rows = commonRows([top.outline, ...places.map((p) => p.outline)]);
  let xs: number[] = [];
  let wAt: (a: number) => number = () => top.widthMm;
  let tAt: (a: number) => number = () => top.thicknessMm;
  let swayAt: (a: number) => number = () => 0;
  const setHold = (hold: number) => {
    const ats = spread(places.map((p) => p.at), Math.min(hold, Math.PI * 0.75));
    xs = [Math.min(hold, Math.PI * 0.75), ...ats];
    // いちばん下まで決めていなければ、最後の場所の形のまま下まで
    const last = ats[ats.length - 1];
    const ends = last < Math.PI - 1e-6;
    const ax = ends ? [...xs, Math.PI] : xs;
    const lastPlace = places[places.length - 1];
    const ws = [top.widthMm, ...places.map((p) => p.widthMm), ...(ends ? [lastPlace.widthMm] : [])];
    const ts = [top.thicknessMm, ...places.map((p) => p.thicknessMm), ...(ends ? [lastPlace.thicknessMm] : [])];
    const ss = [0, ...places.map((p) => p.swayMm), ...(ends ? [0] : [])];
    ss[ss.length - 1] = 0;
    wAt = pchip(ax, ws);
    tAt = pchip(ax, ts);
    swayAt = pchip(ax, ss);
  };
  setHold(0);

  const frameAt = (a: number, side: number): LoftFrame => {
    let k = 0;
    while (k + 2 < xs.length && a > xs[k + 1]) k++;
    const span = xs[k + 1] - xs[k];
    const u = smooth(Math.min(1, Math.max(0, (a - xs[k]) / span)));
    return { w: wAt(a), t: tAt(a), sway: side * swayAt(a), k, u };
  };
  const rowInt = (i: number, f: LoftFrame): [number, number] => {
    const a = rows[f.k][i];
    const b = rows[f.k + 1][i];
    return [a[0] + (b[0] - a[0]) * f.u, a[1] + (b[1] - a[1]) * f.u];
  };
  const rowAt = (i: number, f: LoftFrame): [number, number] => {
    const j = Math.floor(i);
    const s = i - j;
    const a = rowInt(j, f);
    if (s === 0) return a;
    const b = rowInt(j + 1, f);
    return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
  };
  /** 行 j での線の向き（mm の比で。両どなりの行から） */
  const tangent = (j: number, f: LoftFrame): [number, number] => {
    const n = rows[0].length;
    const a = rowInt(Math.max(0, j - 1), f);
    const b = rowInt(Math.min(n - 1, j + 1), f);
    return [((b[0] - a[0]) * f.w) / 2, (b[1] - a[1]) * f.t];
  };
  /** 折れ目の行（どこかの場所で、線の向きが CREASE_DEG より急に変わる行）。行が変わるたびに作り直す */
  let crease: boolean[] | null = null;
  const creaseOf = (): boolean[] => {
    if (crease) return crease;
    const n = rows[0].length;
    const out = new Array<boolean>(n).fill(false);
    const cosMax = Math.cos((CREASE_DEG * Math.PI) / 180);
    for (const line of rows) {
      for (let j = 1; j + 1 < n; j++) {
        const ax = (line[j][0] - line[j - 1][0]) * top.widthMm;
        const ay = (line[j][1] - line[j - 1][1]) * top.thicknessMm * 2;
        const bx = (line[j + 1][0] - line[j][0]) * top.widthMm;
        const by = (line[j + 1][1] - line[j][1]) * top.thicknessMm * 2;
        const la = Math.hypot(ax, ay);
        const lb = Math.hypot(bx, by);
        if (la > 1e-9 && lb > 1e-9 && (ax * bx + ay * by) / (la * lb) < cosMax) out[j] = true;
      }
    }
    crease = out;
    return out;
  };
  const segDir = (seg: number, f: LoftFrame): [number, number] => {
    const a = rowInt(seg, f);
    const b = rowInt(seg + 1, f);
    return [((b[0] - a[0]) * f.w) / 2, (b[1] - a[1]) * f.t];
  };
  const loft: Loft = {
    rows,
    setHold,
    refine(trace) {
      crease = null;
      for (let k = 0; k < rows.length; k++) {
        const old = rows[k];
        rows[k] = trace.map(({ j, s }) => {
          const a = old[j];
          const b = old[Math.min(j + 1, old.length - 1)];
          return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s] as [number, number];
        });
      }
    },
    isCrease: (row) => creaseOf()[row] ?? false,
    rowMmAt(seg, f) {
      const d = segDir(seg, f);
      return Math.hypot(d[0], d[1]);
    },
    tangentIn(seg, sf, f) {
      const c = creaseOf();
      const here = segDir(seg, f);
      const a = c[seg] ? here : tangent(seg, f);
      const b = c[seg + 1] ? here : tangent(seg + 1, f);
      const la = Math.hypot(a[0], a[1]) || 1;
      const lb = Math.hypot(b[0], b[1]) || 1;
      const tx = (a[0] / la) * (1 - sf) + (b[0] / lb) * sf;
      const ty = (a[1] / la) * (1 - sf) + (b[1] / lb) * sf;
      const l = Math.hypot(tx, ty) || 1;
      return [tx / l, ty / l];
    },
    frame(phi) {
      const sn = Math.sin(phi);
      return frameAt(Math.abs(Math.atan2(sn, Math.cos(phi))), sn >= 0 ? 1 : -1);
    },
    point(i, flat, f, innerR, wOverride) {
      const w = wOverride ?? f.w;
      if (i < flat) {
        const xL = rowAt(rows[0].length - 1, f)[0];
        const xR = rowAt(0, f)[0];
        return [((xL + ((xR - xL) * i) / flat) * w) / 2 + f.sway, innerR];
      }
      const [xi, eta] = rowAt(i - flat, f);
      return [(xi * w) / 2 + f.sway, innerR + f.t * eta];
    },
    normalAt(r, f) {
      const j = Math.min(rows[0].length - 2, Math.floor(r));
      const s = r - j;
      const a = tangent(j, f);
      const b = tangent(j + 1, f);
      const tx = a[0] + (b[0] - a[0]) * s;
      const ty = a[1] + (b[1] - a[1]) * s;
      const l = Math.hypot(tx, ty) || 1;
      // 線は右の端から上を通って左の端へ進むので、進む向きを右へ 90° 回すと外向き
      return [ty / l, -tx / l];
    },
    arcHalf(f) {
      let len = 0;
      for (let i = 0; i + 1 < rows[0].length; i++) {
        const a = rowInt(i, f);
        const b = rowInt(i + 1, f);
        len += Math.hypot(((b[0] - a[0]) * f.w) / 2, (b[1] - a[1]) * f.t);
      }
      return len / 2;
    },
    samples() {
      const ats: number[] = [];
      for (let i = 0; i < xs.length; i++) {
        ats.push(xs[i]);
        if (i + 1 < xs.length) ats.push((xs[i] + xs[i + 1]) / 2);
      }
      return ats.map((a) => {
        const f = frameAt(a, 1);
        return {
          atDeg: (a * 180) / Math.PI,
          widthMm: f.w,
          thicknessMm: f.t,
          outlineMm: rows[0].map((_, i) => {
            const [xi, eta] = rowAt(i, f);
            return [(xi * f.w) / 2, eta * f.t] as [number, number];
          }),
        };
      });
    },
    extremes() {
      // 線を点で取った細かさのぶん、いちばん高い所がわずかに 1 より低くなる。場所ごとの線の高さと幅を 1 と数え直して、決めた数がそのまま出るように
      const peak = rows.map((r) => Math.max(...r.map((q) => q[1])));
      const span = rows.map((r) => Math.max(...r.map((q) => q[0])) - Math.min(...r.map((q) => q[0])));
      let minWidthMm = Infinity;
      let minThicknessMm = Infinity;
      for (let s = 0; s <= 48; s++) {
        const f = frameAt((s / 48) * Math.PI, 1);
        let xMin = Infinity;
        let xMax = -Infinity;
        let eta = 0;
        for (let i = 0; i < rows[0].length; i++) {
          const q = rowAt(i, f);
          xMin = Math.min(xMin, q[0]);
          xMax = Math.max(xMax, q[0]);
          eta = Math.max(eta, q[1]);
        }
        const p = peak[f.k] + (peak[f.k + 1] - peak[f.k]) * f.u;
        const sp = span[f.k] + (span[f.k + 1] - span[f.k]) * f.u;
        minWidthMm = Math.min(minWidthMm, ((xMax - xMin) / Math.max(sp, 1e-6)) * f.w);
        minThicknessMm = Math.min(minThicknessMm, (f.t * eta) / Math.max(p, 1e-6));
      }
      return { minWidthMm, minThicknessMm };
    },
  };
  return loft;
}
