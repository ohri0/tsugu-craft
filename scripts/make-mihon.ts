// 見本の動画と手の記録を作る（public/mihon/）。手は絵で描いた作り話で、人の手を撮ったものではない。
// 手本：鏨を当てて、ゆっくり一定に進む。学ぶ人：同じ動きに、手のふらつきを足す。
// 使い方：npx tsx scripts/make-mihon.ts（Playwright の Chromium と ffmpeg を使う）
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createRecord } from "../src/craft/record";
import type { MotionInput } from "../src/craft/motion";
import { handLandmarks, rng, type HandPose } from "../tests/helpers/hands";

const OUT = "public/mihon";
const W = 960;
const H = 540;
const ASPECT = W / H;
const FPS = 20;
const DUR = 14;

/** 手のひらの基準の動き：右へゆっくり進み、鏨を打つ小さな上下 */
function pose(t: number, shake: number, r: ReturnType<typeof rng>): HandPose {
  const beat = Math.sin(2 * Math.PI * 1.2 * t);
  // ふらつきは、ゆっくりした揺れ＋ときどき大きくぶれる所
  const swell = Math.exp(-((t - 5) ** 2) / 1.2) + Math.exp(-((t - 10.5) ** 2) / 0.8);
  const sway = shake * (0.018 * Math.sin(1.7 * t + 1) + 0.03 * swell * Math.sin(7.3 * t) + 0.004 * r.gauss());
  // 指先が板のほうを向く（鏨を上から持つ形）
  return { x: 0.62 + 0.016 * t + sway, y: 0.13 + 0.004 * beat + sway * 1.1, palm: 0.2, angle: -112 + 2 * beat + shake * 12 * swell * Math.sin(3.1 * t) };
}

function makeInput(shake: number, seed: number): MotionInput {
  const r = rng(seed);
  const frames = Array.from({ length: Math.round(DUR * FPS) }, (_, i) => {
    const t = i / FPS;
    return { t, hands: [{ landmarks: handLandmarks(pose(t, shake, r), ASPECT), score: 0.95 }] };
  });
  return { aspect: ASPECT, durationS: DUR, frames };
}

/** 1 こまを描く（ブラウザの中で動く）：地金の板、彫った線、手の絵、作り話の印 */
const DRAW = `(function (pts, t, W, H, line, label) {
  const c = window.cv || (window.cv = Object.assign(document.createElement('canvas'), { width: W, height: H }));
  const g = c.getContext('2d');
  g.fillStyle = '#26221d'; g.fillRect(0, 0, W, H);
  const metal = g.createLinearGradient(0, H * 0.45, 0, H);
  metal.addColorStop(0, '#b9b4aa'); metal.addColorStop(1, '#8c867a');
  g.fillStyle = metal; g.beginPath(); g.roundRect(W * 0.08, H * 0.58, W * 0.84, H * 0.3, 10); g.fill();
  g.strokeStyle = '#3a342b'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); line.forEach((p, i) => (i ? g.lineTo(p[0] * W, p[1] * H) : g.moveTo(p[0] * W, p[1] * H))); g.stroke();
  const P = (i) => [pts[i].x * W, pts[i].y * H];
  // 鏨（手の中から板の上の線の先まで）
  const tip = line[line.length - 1];
  g.strokeStyle = '#d7d2c8'; g.lineWidth = 9; g.beginPath(); g.moveTo(tip[0] * W, tip[1] * H); g.lineTo(...P(10)); g.stroke();
  // 手
  g.fillStyle = '#c9a98a'; g.strokeStyle = '#c9a98a';
  g.beginPath(); [0, 1, 5, 9, 13, 17].forEach((i, k) => (k ? g.lineTo(...P(i)) : g.moveTo(...P(i)))); g.closePath(); g.fill();
  g.lineWidth = 15;
  for (const f of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) { g.beginPath(); f.forEach((i, k) => (k ? g.lineTo(...P(i)) : g.moveTo(...P(i)))); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, 34);
  g.fillStyle = '#ffd60a'; g.font = '600 18px sans-serif'; g.textBaseline = 'middle';
  g.fillText(label, 14, 17);
  return c.toDataURL('image/jpeg', 0.92).split(',')[1];
})`;

async function render(name: string, input: MotionInput, label: string) {
  const dir = mkdtempSync(join(tmpdir(), "mihon-"));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const line: [number, number][] = [];
  for (let i = 0; i < input.frames.length; i++) {
    const f = input.frames[i];
    const pts = f.hands[0].landmarks;
    // 鏨の先：手の下の板の上。ふらつくと線も揺れる
    line.push([pts[10].x - 0.06, 0.72 + (pts[10].y - 0.42) * 0.35]);
    const b64 = (await page.evaluate(`${DRAW}(${JSON.stringify(pts)}, ${f.t}, ${W}, ${H}, ${JSON.stringify(line.slice(-400))}, ${JSON.stringify(label)})`)) as string;
    writeFileSync(join(dir, `${String(i).padStart(4, "0")}.jpg`), Buffer.from(b64, "base64"));
  }
  await browser.close();
  const frames = ["-framerate", String(FPS), "-i", join(dir, "%04d.jpg")];
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...frames, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-pix_fmt", "yuv420p", join(OUT, `${name}.webm`)]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...frames, "-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(OUT, `${name}.mp4`)]);
  rmSync(dir, { recursive: true });
}

mkdirSync(OUT, { recursive: true });
const items = [
  { name: "master", shake: 0.25, seed: 11, label: "見本：絵で描いた手の動き（作り話）・手本", title: "手本（作り話）", craftsman: "見本の人" },
  { name: "learner", shake: 1.4, seed: 23, label: "見本：絵で描いた手の動き（作り話）・学ぶ人", title: "学ぶ人の動画（作り話）", craftsman: "" },
];
for (const it of items) {
  const input = makeInput(it.shake, it.seed);
  const record = createRecord(input, { id: `mihon-${it.name}`, title: it.title, craftsman: it.craftsman, videoName: `${it.name}.webm`, date: "2026-11-05" });
  writeFileSync(join(OUT, `${it.name}.json`), JSON.stringify(record));
  await render(it.name, input, it.label);
  console.log(it.name, "できた");
}
