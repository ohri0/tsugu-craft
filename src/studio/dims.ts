// 寸法の線：3D の 2 点の間に、CAD の図面のような線と矢印と数字を描く（SVG）。画面に依存しない。
// 点を画面に写す関数を外からもらうので、テストでは手で作った写し方で確かめられる。

export type V3 = [number, number, number];

export interface Dim {
  a: V3;
  b: V3;
  label: string;
  /** 目安から外れている（赤で出す） */
  bad?: boolean;
  /** 図面の寸法：形から離して線を引く量（mm、3D の向き）。a・b から引き出し線を出す */
  ext?: V3;
}

export type Project = (x: number, y: number, z: number) => { x: number; y: number } | null;

/** 文字の幅の見積もり（px、11px の等幅と和文） */
export function labelWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) < 0x2e80 ? 6.7 : 11;
  return Math.ceil(w + 12);
}

const f = (v: number) => v.toFixed(1);
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** 寸法を SVG の中身（<g> の並び）にする。写せない寸法は描かない */
export function dimsSvg(dims: Dim[], project: Project, k = 1): string {
  const out: string[] = [];
  for (const d of dims) {
    const e = d.ext ?? [0, 0, 0];
    const fa = project(...d.a);
    const fb = project(...d.b);
    const pa = project(d.a[0] + e[0], d.a[1] + e[1], d.a[2] + e[2]);
    const pb = project(d.b[0] + e[0], d.b[1] + e[1], d.b[2] + e[2]);
    if (!pa || !pb || !fa || !fb) continue;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy);
    const ux = len > 0.01 ? dx / len : 1;
    const uy = len > 0.01 ? dy / len : 0;
    // 線に直角で、画面の上を向く側
    let nx = -uy;
    let ny = ux;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const cls = d.bad ? "dim bad" : "dim";
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    const parts: string[] = [];
    if (d.ext) {
      // 引き出し線：形の点から、寸法の線の少し先まで
      for (const [f0, p] of [[fa, pa], [fb, pb]] as const) {
        const L = Math.hypot(p.x - f0.x, p.y - f0.y) || 1;
        const gx = (p.x - f0.x) / L;
        const gy = (p.y - f0.y) / L;
        parts.push(`<line class="dim-ext" x1="${f(f0.x + gx * 2 * k)}" y1="${f(f0.y + gy * 2 * k)}" x2="${f(p.x + gx * 3 * k)}" y2="${f(p.y + gy * 3 * k)}"/>`);
      }
      // 引き出した側に数字を置く
      const L = Math.hypot(pa.x - fa.x, pa.y - fa.y);
      if (L > 0.5) {
        nx = (pa.x - fa.x) / L;
        ny = (pa.y - fa.y) / L;
      }
    }
    const arrow = (p: { x: number; y: number }, sx: number, sy: number) =>
      `<path class="dim-arrow" d="M${f(p.x)} ${f(p.y)}L${f(p.x - sx * 7 * k + nx * 2.6 * k)} ${f(p.y - sy * 7 * k + ny * 2.6 * k)}L${f(p.x - sx * 7 * k - nx * 2.6 * k)} ${f(p.y - sy * 7 * k - ny * 2.6 * k)}Z"/>`;
    const short = len < 34 * k;
    if (short) {
      // 短い寸法：矢印は外から内へ、数字は横に出して引き出し線でつなぐ
      parts.push(`<line class="dim-line" x1="${f(pa.x - ux * 14 * k)}" y1="${f(pa.y - uy * 14 * k)}" x2="${f(pb.x + ux * 14 * k)}" y2="${f(pb.y + uy * 14 * k)}"/>`);
      parts.push(arrow(pa, ux, uy), arrow(pb, -ux, -uy));
    } else {
      parts.push(`<line class="dim-line" x1="${f(pa.x)}" y1="${f(pa.y)}" x2="${f(pb.x)}" y2="${f(pb.y)}"/>`);
      parts.push(arrow(pa, -ux, -uy), arrow(pb, ux, uy));
    }
    const w = labelWidth(d.label) * k;
    const lx = short ? mx + 46 * k : mx + nx * 13 * k;
    const ly = short ? my - 22 * k : my + ny * 13 * k;
    if (short) parts.push(`<polyline class="dim-leader" points="${f(mx)},${f(my)} ${f(lx - w / 2 - 4 * k)},${f(ly)}"/>`);
    parts.push(`<rect class="dim-tag" x="${f(lx - w / 2)}" y="${f(ly - 9 * k)}" width="${f(w)}" height="${f(18 * k)}" rx="${f(3 * k)}"/>`);
    parts.push(`<text class="dim-text" x="${f(lx)}" y="${f(ly + 4 * k)}" text-anchor="middle"${k !== 1 ? ` font-size="${f(11 * k)}"` : ""}>${escText(d.label)}</text>`);
    out.push(`<g class="${cls}">${parts.join("")}</g>`);
  }
  return out.join("");
}

/** 軸の印（左下）：x 赤・y 緑・z 青。axes はカメラから見た各軸の向き（右・上） */
export function gizmoSvg(axes: { x: [number, number]; y: [number, number]; z: [number, number] }, r = 20, c = 30): string {
  return (["x", "y", "z"] as const)
    .map((k) => {
      const [ax, ay] = axes[k];
      const x = c + ax * r;
      const y = c - ay * r;
      return `<line class="ax ax-${k}" x1="${c}" y1="${c}" x2="${f(x)}" y2="${f(y)}"/><text class="ax-t ax-${k}" x="${f(c + ax * (r + 8))}" y="${f(c - ay * (r + 8) + 3.5)}" text-anchor="middle">${k.toUpperCase()}</text>`;
    })
    .join("");
}
