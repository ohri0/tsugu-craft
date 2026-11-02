// 見本の石の写真（コードで描いた画像）。写真がないとき・通信できないときに動きを見せるため。
// 本物の写真ではない。画面にもそう書く。

export const SAMPLE = { longMm: 8.88, depthMm: 4.35, label: "見本の石（描いた画像・三角）" };

export function drawSampleStone(width = 2000, height = 1500): ImageData {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d")!;
  // 白い紙。左上から光が当たって、右下が少し暗い
  const paper = g.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, "#fbfaf7");
  paper.addColorStop(1, "#d9d4cc");
  g.fillStyle = paper;
  g.fillRect(0, 0, width, height);
  // 左の端にケースの縁の影
  g.fillStyle = "rgba(60,50,40,0.35)";
  g.fillRect(0, 0, width * 0.05, height);

  const cx = width * 0.52;
  const cy = height * 0.53;
  const L = width * 0.36;
  const rot = -0.25;
  const raw = [
    [-L / 2, L * 0.28],
    [L / 2, L * 0.28],
    [L * 0.06, -L * 0.57],
  ].map(([x, y]) => [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  const path = new Path2D();
  const r = L * 0.03;
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(raw[2], raw[0]);
  path.moveTo(start[0], start[1]);
  for (let i = 0; i < 3; i++) {
    const p = raw[i];
    const q = raw[(i + 1) % 3];
    path.arcTo(p[0], p[1], q[0], q[1], r);
  }
  path.closePath();
  // 石の色（淡いピンク）
  const body = g.createLinearGradient(raw[0][0], raw[0][1], raw[2][0], raw[2][1]);
  body.addColorStop(0, "#e7a9bb");
  body.addColorStop(0.5, "#f3c9d4");
  body.addColorStop(1, "#d98fa6");
  g.fillStyle = body;
  g.fill(path);
  // 面（ファセット）の線と、上面の光
  g.save();
  g.clip(path);
  const ctr = [(raw[0][0] + raw[1][0] + raw[2][0]) / 3, (raw[0][1] + raw[1][1] + raw[2][1]) / 3];
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineWidth = 3;
  const table = raw.map((p) => [ctr[0] + (p[0] - ctr[0]) * 0.5, ctr[1] + (p[1] - ctr[1]) * 0.5]);
  g.beginPath();
  table.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  g.stroke();
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(raw[i][0], raw[i][1]);
    g.lineTo(table[i][0], table[i][1]);
    const m = mid(raw[i], raw[(i + 1) % 3]);
    g.moveTo(m[0], m[1]);
    const tm = mid(table[i], table[(i + 1) % 3]);
    g.lineTo(tm[0], tm[1]);
    g.stroke();
  }
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.beginPath();
  table.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.fill();
  g.restore();
  // 縁の暗い線（屈折で縁は暗く写る）
  g.strokeStyle = "rgba(150,70,95,0.8)";
  g.lineWidth = 4;
  g.stroke(path);
  // 紙の細かいざらつき
  const img = g.getImageData(0, 0, width, height);
  let s = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = ((s / 2 ** 32) * 2 - 1) * 4;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  return img;
}
