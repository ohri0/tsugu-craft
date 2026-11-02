// まだ作っていない手順（3 案・微調整・型紙）のモック。
// 絵は今の石の本当の輪郭から描くが、爪の位置や確かめ結果は仮。11/3〜11/4 に本物に置き換える。
import type { Corner } from "../geometry/corners";
import { centroid, type Point } from "../geometry/polygon";

export interface MockPlan {
  name: string;
  reason: string;
  svg: string;
  checks: { ok: boolean; text: string }[];
}

export function mockPlans(outlineMm: Point[], cornersMm: Corner[]): MockPlan[] {
  const n = Math.max(3, cornersMm.length || 4);
  return [
    {
      name: `角を守る V 字の爪 ${n} 本`,
      reason: "尖った角は欠けやすいので、角を V 字の爪で包む。",
      svg: planSvg(outlineMm, { corners: cornersMm, v: true }),
      checks: [
        { ok: true, text: "角から 0.9 mm 以内に爪（仮）" },
        { ok: true, text: "留まり 1.3×（仮）" },
      ],
    },
    {
      name: "覆輪（ふくりん）",
      reason: "縁をぐるりと金属の壁で包む。いちばん取れにくい。",
      svg: planSvg(outlineMm, { bezel: true }),
      checks: [
        { ok: true, text: "壁の厚み 0.5 mm（仮）" },
        { ok: true, text: "留まり 2.0×（目安）" },
      ],
    },
    {
      name: "横向き・高め",
      reason: "長辺を指に沿って横に。光が入り、石が大きく見える。",
      svg: planSvg(outlineMm, { corners: cornersMm, v: false, rotate: true }),
      checks: [
        { ok: false, text: "爪が長く、留まり 0.9×（仮）" },
        { ok: true, text: "指とのすき間 1.3 mm（仮）" },
      ],
    },
  ];
}

function planSvg(outline: Point[], o: { corners?: Corner[]; v?: boolean; bezel?: boolean; rotate?: boolean }): string {
  const pts = o.rotate ? outline.map((p) => ({ x: -p.y, y: p.x })) : outline;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const k = 44 / size;
  const c = centroid(pts);
  const tx = (p: Point) => `${(32 + (p.x - c.x) * k).toFixed(1)},${(32 - (p.y - c.y) * k).toFixed(1)}`;
  const d = pts.map(tx).join(" ");
  let extra = "";
  if (o.bezel) {
    const grow = pts.map((p) => ({ x: c.x + (p.x - c.x) * 1.16, y: c.y + (p.y - c.y) * 1.16 }));
    extra += `<polygon points="${grow.map(tx).join(" ")}" fill="#d9b25f" stroke="#a5822f" stroke-width="1"/>`;
  }
  const stone = `<polygon points="${d}" fill="#f2c7d3" stroke="#a3576f" stroke-width="1"/>`;
  let prongs = "";
  const corners = o.corners?.length ? o.corners.map((q) => q.point) : ringPoints(outline, 4);
  for (const q0 of corners) {
    const q = o.rotate ? { x: -q0.y, y: q0.x } : q0;
    const [x, y] = tx(q).split(",").map(Number);
    prongs += o.v
      ? `<path d="M${x - 4},${y} L${x},${y - 4} L${x + 4},${y} L${x},${y + 4} Z" transform="rotate(45 ${x} ${y})" fill="#d9b25f" stroke="#a5822f" stroke-width="0.8"/>`
      : `<circle cx="${x}" cy="${y}" r="3.2" fill="#d9b25f" stroke="#a5822f" stroke-width="0.8"/>`;
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${extra}${stone}${o.bezel ? "" : prongs}</svg>`;
}

function ringPoints(pts: Point[], n: number): Point[] {
  return Array.from({ length: n }, (_, i) => pts[Math.floor((i / n) * pts.length)]);
}
