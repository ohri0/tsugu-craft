// 技法の起伏を、形そのものにする（高さの足し引き、mm）。色の模様だけでなく、3D 印刷のデータにも粒・くぼみ・彫った線が入る。
// 起伏の高さ・深さは、見た目のための目安（職人の決まりや出典の値ではない）。作るときの値は「作り方」の側で出典つきで示す。
import type { Pt } from "./solid";

const SQ3 = Math.sqrt(3);

/** 魚々子：六角に並んだ丸い粒。粒の頭が盛り上がり、まわりに鏨のふちの細い溝が残る */
export function nanakoRelief(dotMm: number, pitchMm: number, heightMm = dotMm * 0.12): (x: number, y: number) => number {
  const R = dotMm / 2;
  const rowH = (pitchMm * SQ3) / 2;
  return (x, y) => {
    const j0 = Math.round(y / rowH);
    let best = Infinity;
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      const off = ((j % 2) + 2) % 2 ? pitchMm / 2 : 0;
      const i = Math.round((x - off) / pitchMm);
      for (let k = i - 1; k <= i + 1; k++) {
        const d = Math.hypot(x - (k * pitchMm + off), y - j * rowH);
        if (d < best) best = d;
      }
    }
    const q = best / R;
    if (q < 1) return heightMm * Math.sqrt(1 - q * q);
    // ふちの細い溝（鏨のふちが押した跡）
    if (q < 1.18) return -heightMm * 0.35 * Math.sin(((q - 1) / 0.18) * Math.PI);
    return 0;
  };
}

/** 決まった乱数（格子の番号から） */
function hash(i: number, j: number, s: number): number {
  let h = (i * 374761393 + j * 668265263 + s * 1442695040) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 鎚目：金づちの丸いくぼみが、少しずつずれて並ぶ */
export function tsuchimeRelief(dentMm: number, depthMm = dentMm * 0.04, seed = 7): (x: number, y: number) => number {
  return (x, y) => {
    const gi = Math.floor(x / dentMm);
    const gj = Math.floor(y / dentMm);
    let d1 = Infinity;
    let d2 = Infinity;
    for (let i = gi - 1; i <= gi + 1; i++) {
      for (let j = gj - 1; j <= gj + 1; j++) {
        const cx = (i + 0.15 + 0.7 * hash(i, j, seed)) * dentMm;
        const cy = (j + 0.15 + 0.7 * hash(j, i, seed + 1)) * dentMm;
        const d = Math.hypot(x - cx, y - cy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
    }
    // くぼみの真ん中がいちばん深く、となりのくぼみとの境で 0 に戻る
    const q = Math.min(1, (2 * d1) / (d1 + d2));
    return -depthMm * (1 - q * q);
  };
}

/** 点から折れ線までの距離 */
function distToPolyline(line: readonly Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
    if (d < best) best = d;
  }
  return best;
}

/** 毛彫り：V 字の溝。幅と深さ（mm） */
export function engraveRelief(lines: readonly (readonly Pt[])[], widthMm: number, depthMm: number): (x: number, y: number) => number {
  const half = widthMm / 2;
  return (x, y) => {
    let z = 0;
    for (const l of lines) {
      const d = distToPolyline(l, x, y);
      if (d < half) z = Math.min(z, -depthMm * (1 - d / half));
    }
    return z;
  };
}

/** いくつかの起伏を足し合わせる */
export function sumRelief(...fs: (((x: number, y: number) => number) | null | undefined)[]): (x: number, y: number) => number {
  const list = fs.filter((f): f is (x: number, y: number) => number => !!f);
  return (x, y) => list.reduce((z, f) => z + f(x, y), 0);
}
