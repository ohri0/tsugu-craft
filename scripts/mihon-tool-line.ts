// 見本の動画（public/mihon/master・learner）から、ヤスリの線をこまごとに探して public/mihon/tool-lines.json に書く（2026-11-07）。
// 探し方は src/craft/tool-line.ts（ヤスリの縁を、明るさの変わり目のまっすぐな線として探す）。
//
// 使い方：npx tsx scripts/mihon-tool-line.ts                … public/mihon/master.webm と learner.webm を読む
//         npx tsx scripts/mihon-tool-line.ts --sheet <フォルダ> … 確かめ用に、線を描いたこまの一覧（jpg）も作る
// 探す所や外す角度を変えるときは、src/craft/tool-line.ts の TOOL_LINE（動画が替わったら、まず --sheet で見て確かめる）。
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findToolLine, lineAngleSpread, lineAngleWobble, TOOL_LINE, type ToolLine } from "../src/craft/tool-line";

const FPS = 10;
/** 試すとき：--opts <JSON のファイル>（例 {"minEdge":20}）で、探し方の値を一時的に変える */
const optsAt = process.argv.indexOf("--opts");
const OPTS = { ...TOOL_LINE, ...(optsAt > 0 ? JSON.parse(readFileSync(process.argv[optsAt + 1], "utf8")) : {}) };
/** 読む大きさ（長い辺） */
const LONG = 480;

const probe = (f: string) => {
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).toString().trim().split(",").map(Number);
  return w >= h ? { w: LONG, h: Math.round((LONG * h) / w / 2) * 2 } : { w: Math.round((LONG * w) / h / 2) * 2, h: LONG };
};

function read(f: string) {
  const { w, h } = probe(f);
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", f, "-vf", `fps=${FPS},scale=${w}:${h},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
  const n = Math.floor(raw.length / (w * h));
  const frames = Array.from({ length: n }, (_, i) => new Uint8Array(raw.buffer, raw.byteOffset + i * w * h, w * h));
  return { w, h, frames };
}

/** 確かめ用：線を描いたこまを並べた jpg */
function sheet(name: string, v: ReturnType<typeof read>, lines: (ToolLine | null)[], dir: string) {
  const { w, h } = v;
  const every = Math.max(1, Math.round(v.frames.length / 24));
  const pick = v.frames.map((_, i) => i).filter((i) => i % every === 0).slice(0, 24);
  const buf = Buffer.alloc(pick.length * w * h * 3);
  pick.forEach((fi, j) => {
    const g = v.frames[fi];
    const o = j * w * h * 3;
    for (let p = 0; p < w * h; p++) buf[o + 3 * p] = buf[o + 3 * p + 1] = buf[o + 3 * p + 2] = g[p];
    const l = lines[fi];
    if (!l) return;
    const steps = Math.ceil(Math.hypot((l.x1 - l.x0) * w, (l.y1 - l.y0) * h));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round((l.x0 + ((l.x1 - l.x0) * s) / steps) * w);
      const y = Math.round((l.y0 + ((l.y1 - l.y0) * s) / steps) * h);
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++) {
          const X = x + ox;
          const Y = y + oy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const q = o + 3 * (Y * w + X);
          [buf[q], buf[q + 1], buf[q + 2]] = [255, 60, 40];
        }
    }
  });
  const cols = 8;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${w}x${h}`, "-i", "-", "-vf", `scale=${Math.round(w / 2)}:-2,tile=${cols}x${Math.ceil(pick.length / cols)}`, "-frames:v", "1", join(dir, `${name}-lines.jpg`)], { input: buf });
}

const args = process.argv.slice(2);
const sheetDir = args.includes("--sheet") ? args[args.indexOf("--sheet") + 1] : null;
// 確かめるだけのとき：--files <いい例> <よくない例> で別の動画を読む（JSON は書かない）
const files = args.includes("--files") ? args.slice(args.indexOf("--files") + 1, args.indexOf("--files") + 3) : null;
if (sheetDir) mkdirSync(sheetDir, { recursive: true });
const out: Record<string, unknown> = { method: "ヤスリの縁を、明るさの変わり目のまっすぐな線として探した（src/craft/tool-line.ts）", fps: FPS, options: OPTS };
for (const name of ["master", "learner"]) {
  const v = read(files ? files[name === "master" ? 0 : 1] : `public/mihon/${name}.webm`);
  const lines = v.frames.map((g) => findToolLine(g, v.w, v.h, OPTS));
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  out[name] = lines.map((l, i) => (l ? { t: r3(i / FPS), a: Math.round(l.angle * 10) / 10, x0: r3(l.x0), y0: r3(l.y0), x1: r3(l.x1), y1: r3(l.y1), s: r3(l.support) } : { t: r3(i / FPS) }));
  const found = lines.filter(Boolean).length;
  const spread = lineAngleSpread(lines);
  const wob = (h: number) => lineAngleWobble(lines, FPS, h)?.toFixed(2) ?? "測れない";
  console.log(`${name}：${lines.length} こま中 ${found} こまで線が見つかった（${Math.round((100 * found) / lines.length)}%）。全体の角度の幅（25〜75%）${spread === null ? "測れない" : `${spread.toFixed(1)}°`}・小刻みなぶれ（前後 0.3/0.5/1 秒）${wob(0.3)}° / ${wob(0.5)}° / ${wob(1)}°`);
  console.log(`  角度：${lines.map((l) => (l ? l.angle.toFixed(0) : "-")).join(" ")}`);
  if (sheetDir) sheet(name, v, lines, sheetDir);
}
if (!files) {
  writeFileSync("public/mihon/tool-lines.json", JSON.stringify(out));
  console.log("書いた：public/mihon/tool-lines.json");
}
