// 腕の彫り：腕の外の面に、浅い模様を彫る。指の軸からの距離を、場所ごとに少し減らすだけ（高さの場）。画面に依存しない純粋な関数。
// 格子の点を動かすだけなので、閉じた形のまま。指の側（内側）と、石座のそば（腕の端とロウの丸み）は動かさない。
// 模様は「いくつの升に分けるか」で決まる：u は腕に沿って、石座の側から下へ 0〜count。v は腕の幅の向き −1〜1（外の面の線の長さの割合で）。
// 腕が細くなる所では、模様も細くなる。深さ・線の太さは形を作るための決まりで、職人の目安の数ではない（**仮**。作者が見て直す）。

export type ReliefKind = "arch" | "diamond" | "wave" | "beads" | "lines" | "leaf";

export const RELIEF_KINDS: readonly ReliefKind[] = ["arch", "diamond", "wave", "beads", "lines", "leaf"];

export const RELIEF_LABEL: Record<ReliefKind, string> = { arch: "尖ったアーチ", diamond: "菱の格子", wave: "波の線", beads: "粒", lines: "横の筋", leaf: "葉とつる" };

export interface ReliefParams {
  kind: ReliefKind;
  /** 片側の腕に並べる数（升の数） */
  count: number;
  /** 彫りの深さ（mm） */
  depthMm: number;
  /** 彫る所：いちばん上から指のまわりに測った角度（度） */
  fromDeg: number;
  toDeg: number;
  /** 幅の向きに並べる数（なければ 1） */
  columns?: number;
}

/** 彫りの形の決まり（形を作るための決まり。**仮**）。wallMm：模様の壁の傾きの幅、lineMm：線の模様の線の半分の太さ、edge：腕の端からこれだけ（v で）は彫らない */
const SHAPE = { wallMm: 0.09, lineMm: 0.11, edge: 0.88, edgeFade: 0.07, archGap: 0.07, archSpring: 0.5, archWidth: 0.76 };

/** 彫りの格子の細かさ（mm）。これより細かい線は描けない */
export const RELIEF_STEP_MM = 0.085;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * 升の中の深さの割合（0〜1）。mmU・mmV は u・v の 1 あたりの長さ（mm）
 */
export function reliefPattern(kind: ReliefKind, u: number, v: number, columns: number, mmU: number, mmV: number): number {
  const f = u - Math.floor(u);
  const cols = Math.max(1, columns);
  const vc = (((v + 1) / 2) * cols) % cols;
  const vk = Math.floor(vc);
  const vv = (vc - vk - 0.5) * 2; // 列の中で −1〜1
  const mmC = mmV / cols;
  const edge = clamp01((SHAPE.edge - Math.abs(v)) / SHAPE.edgeFade);
  if (edge <= 0) return 0;
  let d = 0;
  switch (kind) {
    case "arch": {
      // 尖った先が石座の側。足もとは平ら。先は尖り、肩から下はまっすぐ
      const m = SHAPE.archGap;
      const q = (f - m) / (1 - 2 * m);
      if (q <= 0 || q >= 1) return 0;
      const s = SHAPE.archSpring;
      const hw = SHAPE.archWidth * (q < s ? 1 - Math.pow(1 - q / s, 1.5) : 1);
      const side = (hw - Math.abs(vv)) * mmC;
      const foot = (1 - q) * (1 - 2 * m) * mmU;
      d = clamp01(Math.min(side, foot) / SHAPE.wallMm);
      break;
    }
    case "diamond": {
      // 菱の格子：斜めの線が 2 組。線の間隔は升の大きさ
      const k = cols / 2;
      const a = u + v * k;
      const b = u - v * k;
      const fa = Math.abs(a - Math.round(a));
      const fb = Math.abs(b - Math.round(b));
      const unit = 1 / Math.hypot(1 / mmU, k / mmV);
      d = 1 - clamp01((Math.min(fa, fb) * unit) / SHAPE.lineMm);
      break;
    }
    case "wave": {
      // 腕に沿う波の線。列の数だけ
      const v0 = 0.62 * Math.sin(2 * Math.PI * u);
      const slope = Math.hypot(1, (0.62 * 2 * Math.PI * mmC) / mmU);
      d = 1 - clamp01((Math.abs(vv - v0) * mmC) / slope / SHAPE.lineMm);
      break;
    }
    case "beads": {
      // 丸いくぼみの列
      const dist = Math.hypot((f - 0.5) * mmU, vv * mmC);
      const r = Math.min(mmU * 0.4, mmC * 0.62);
      d = Math.sqrt(Math.max(0, 1 - (dist / r) ** 2));
      break;
    }
    case "lines": {
      // 腕を横切る筋
      d = 1 - clamp01((Math.abs(f - 0.5) * mmU) / SHAPE.lineMm);
      break;
    }
    case "leaf": {
      // 真ん中のつると、左右交互の葉
      const stem = 0.28 * Math.sin(Math.PI * (u - 0.5));
      const slope = Math.hypot(1, (0.28 * Math.PI * mmV) / mmU);
      const dStem = 1 - clamp01((Math.abs(v - stem) * mmV) / slope / (SHAPE.lineMm * 0.8));
      const sign = Math.floor(u) % 2 === 0 ? 1 : -1;
      const du = (f - 0.5) * mmU;
      const dv = (v - sign * 0.42) * mmV;
      const c = Math.cos(0.8);
      const sn = Math.sin(0.8) * sign;
      const p = du * c + dv * sn;
      const r = -du * sn + dv * c;
      const L = Math.min(mmU * 0.42, mmV * 0.62);
      const H = 0.42 * L * Math.max(0, 1 - (p / L) ** 2);
      const dLeaf = clamp01((H - Math.abs(r)) / SHAPE.wallMm);
      d = Math.max(dStem, dLeaf);
      break;
    }
  }
  return d * edge;
}

/** 断面の行ごとの v（外の面の線の長さの割合で、右の端 1 → 左の端 −1。行の座標は mm の比に直して測る） */
export function rowsV(rows: readonly (readonly [number, number])[], w: number, t: number): number[] {
  const len = [0];
  for (let i = 1; i < rows.length; i++) len.push(len[i - 1] + Math.hypot(((rows[i][0] - rows[i - 1][0]) * w) / 2, (rows[i][1] - rows[i - 1][1]) * t));
  const total = len[len.length - 1] || 1;
  return len.map((l) => 1 - (2 * l) / total);
}

/** 線の長さが step 以下になるよう、断面の行を細かくする（行 j と j ＋ 1 の間の割合 s の所に行を足す） */
export function rowTrace(rows: readonly (readonly [number, number])[], w: number, t: number, step: number): { j: number; s: number }[] {
  const out: { j: number; s: number }[] = [];
  for (let j = 0; j + 1 < rows.length; j++) {
    out.push({ j, s: 0 });
    const n = Math.ceil(Math.hypot(((rows[j + 1][0] - rows[j][0]) * w) / 2, (rows[j + 1][1] - rows[j][1]) * t) / step);
    for (let k = 1; k < n; k++) out.push({ j, s: k / n });
  }
  out.push({ j: rows.length - 1, s: 0 });
  return out;
}
