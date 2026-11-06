// 見本の動画と手の記録を作る（public/mihon/）。元は作者（彫金の職人）が撮った、本物の手元の動画（ヤスリがけ）。
// 手本と学ぶ人は、同じ動画の別の秒を切り出す（学ぶ人の手は「見立てた例」。本物の生徒の手ではない）。
// 手の点は、アプリと同じモデルで、ブラウザの中で動画から読む（暗い手元向けの読み方は scripts/mihon-read.ts）。
// 読んだ点の時刻と位置は、見せる動画とそのまま合う。
//
// 使い方：npx tsx scripts/make-mihon.ts <file_hands.mov>
//         npx tsx scripts/make-mihon.ts --scan <file_hands.mov>   … 全体を読んで、秒ごとの手の見え方を出す（秒を選ぶため）
//         MIHON_REUSE=1 npx tsx scripts/make-mihon.ts --try <file_hands.mov>  … 前に読んだ全体を使い回し、秒の分け方をいくつか比べる
// 使うもの：ffmpeg、Playwright の Chromium、手の点のモデル（Google の配布先から読む。ネットが要る）
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createRecord } from "../src/craft/record";
import { analyzeMotion, type MotionInput } from "../src/craft/motion";
import { comparePose, poseSummary } from "../src/craft/pose";
import type { ReadOptions } from "./mihon-read";

const OUT = "public/mihon";
/** 横長のまま、軽くする */
const W = 960;
const H = 540;
const DATE = "2026-11-06";

/** 手の点の読み方 */
const READ: ReadOptions = {
  fps: 24,
  minConfidence: 0.1,
  filters: ["brightness(1.8) contrast(1.2)", "brightness(2.4) contrast(1.1)"],
  rotations: [0, 90, 180, 270],
  sameHandDist: 0.12,
};

/** 切り出す秒（元の動画の中の、始まりと長さ）。元の動画は 10.2 秒しかないので、手本と学ぶ人で分ける */
const CLIPS = [
  { name: "master", ss: Number(process.env.MIHON_MASTER_SS ?? 5), t: Number(process.env.MIHON_MASTER_T ?? 5.2), title: "手本（ヤスリがけ・職人の本物の手元）", craftsman: "見本の人" },
  { name: "learner", ss: Number(process.env.MIHON_LEARNER_SS ?? 0), t: Number(process.env.MIHON_LEARNER_T ?? 5), title: "学ぶ人の動画（見立てた例）", craftsman: "" },
];

const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-threads", "4", ...args]);

/** 見せる動画の色：暗い所を少し締める（肌より明るい所は変えない） */
const SHOW_VF = `scale=${W}:${H},curves=all='0/0 0.06/0.03 0.5/0.5 1/1',format=yuv420p`;

/** 切り出して、音を消し、960×540 の webm と mp4 にする */
function cut(src: string, ss: number, t: number, outBase: string) {
  const inp = ["-ss", String(ss), "-t", String(t), "-i", src, "-an", "-vf", SHOW_VF];
  ffmpeg([...inp, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "31", "-row-mt", "1", `${outBase}.webm`]);
  ffmpeg([...inp, "-c:v", "libx264", "-crf", "23", "-preset", "slow", "-profile:v", "main", "-movflags", "+faststart", `${outBase}.mp4`]);
}

/** 元の動画の全体を 1 回だけ読む（手本と学ぶ人は、ここから秒で切り分ける。切った動画も同じこまから作るので合う） */
async function readWhole(src: string): Promise<MotionInput> {
  const dir = mkdtempSync(join(resolve(OUT), ".read-"));
  try {
    // 読むための写し：大きさは見せる動画と同じ。色は変えない（明るくするのは読むときの canvas の中）
    ffmpeg(["-i", src, "-an", "-vf", `scale=${W}:${H},format=yuv420p`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "20", "-row-mt", "1", join(dir, "whole.webm")]);
    const server = await createServer({ root: process.cwd(), server: { port: 5199, strictPort: true }, logLevel: "error" });
    await server.listen();
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto("http://localhost:5199/mihon/", { waitUntil: "domcontentloaded" });
      const url = `/mihon/${dir.split("/").pop()}/whole.webm`;
      return (await page.evaluate(async ({ url, o }) => (await import("/scripts/mihon-read.ts")).readHands(url, o), { url, o: READ })) as MotionInput;
    } finally {
      await browser.close();
      await server.close();
    }
  } finally {
    rmSync(dir, { recursive: true });
  }
}

/** 全体の読みから、ss 秒から t 秒ぶんを切り出す（時刻は 0 から） */
function slice(all: MotionInput, ss: number, t: number): MotionInput {
  const frames = all.frames.filter((f) => f.t >= ss - 1e-6 && f.t < ss + t - 1e-6).map((f) => ({ ...f, t: Math.round((f.t - ss) * 1000) / 1000 }));
  return { aspect: all.aspect, durationS: t, frames };
}

/**
 * 1 こまだけ出て消える手は、読み違いとして捨てる：前後 STEADY_FRAMES こまのどこかに、手のひらの中心が近い手がなければ捨てる。
 * （試したとき、何もない所に 1 こまだけ手が出て、手のふらつきが大きく出た）
 */
const STEADY_FRAMES = 2;
const STEADY_DIST = 0.1;
function steady(all: MotionInput): MotionInput {
  const P = [0, 5, 9, 13, 17];
  const centers = all.frames.map((f) => f.hands.map((h) => ({ x: P.reduce((s, k) => s + h.landmarks[k].x, 0) / P.length, y: P.reduce((s, k) => s + h.landmarks[k].y, 0) / P.length })));
  const frames = all.frames.map((f, i) => ({
    ...f,
    hands: f.hands.filter((_, j) => {
      const c = centers[i][j];
      for (let k = Math.max(0, i - STEADY_FRAMES); k <= Math.min(all.frames.length - 1, i + STEADY_FRAMES); k++) {
        if (k !== i && centers[k].some((d) => Math.hypot((d.x - c.x) * all.aspect, d.y - c.y) < STEADY_DIST)) return true;
      }
      return false;
    }),
  }));
  return { ...all, frames };
}

function compareReport(records: ReturnType<typeof createRecord>[]) {
  for (const side of ["right", "left"] as const) {
    const c = comparePose(records[0].landmarksSampled, records[1].landmarksSampled, side);
    console.log(`  ${side}：見えた割合 手本 ${(c.seen.master * 100).toFixed(0)}%・学ぶ人 ${(c.seen.learner * 100).toFixed(0)}%　${poseSummary(c)}　違う所 ${c.moments.map((m) => m.t.toFixed(1)).join(", ")}`);
  }
}

function report(name: string, input: MotionInput) {
  const m = analyzeMotion(input);
  console.log(`${name}：こま ${input.frames.length}、手が見えたこま ${input.frames.filter((f) => f.hands.length).length}`);
  for (const h of m.hands) console.log(`  ${h.label}：見えた ${(h.seenRatio * 100).toFixed(0)}%`);
  const bySec = new Map<number, string>();
  for (const f of input.frames) bySec.set(Math.floor(f.t), (bySec.get(Math.floor(f.t)) ?? "") + f.hands.length);
  for (const [s, n] of bySec) console.log(`  ${s} 秒：${n}`);
}

const args = process.argv.slice(2);
const scan = args[0] === "--scan";
const trySplits = args[0] === "--try";
const src = resolve(scan || trySplits ? args[1] : args[0]);
mkdirSync(OUT, { recursive: true });
// 読むのは数分かかるので、読んだ全体を残しておき、秒を選び直すときは MIHON_REUSE=1 で使い回す
const cache = join(tmpdir(), "mihon-read-whole.json");
const raw = process.env.MIHON_REUSE ? (JSON.parse(readFileSync(cache, "utf8")) as MotionInput) : await readWhole(src);
writeFileSync(cache, JSON.stringify(raw));
const all = steady(raw);

if (scan) {
  report("全体", all);
} else if (trySplits) {
  // 秒の分け方を、いくつか比べる（手本の始まり・長さ、学ぶ人の始まり・長さ）
  const splits = [[0, 6, 6, 4.2], [4.2, 6, 0, 4.2], [0, 5.5, 5.5, 4.7], [3.5, 6.7, 0, 3.5], [2.4, 7.8, 0, 2.4], [0, 4.6, 4.6, 5.6], [5, 5.2, 0, 5]];
  for (const [ms, mt, ls, lt] of splits) {
    console.log(`手本 ${ms}〜${ms + mt} 秒・学ぶ人 ${ls}〜${ls + lt} 秒`);
    compareReport([createRecord(slice(all, ms, mt), { title: "m", craftsman: "", videoName: "" }), createRecord(slice(all, ls, lt), { title: "l", craftsman: "", videoName: "" })]);
  }
} else {
  const records = CLIPS.map((c) => {
    const input = slice(all, c.ss, c.t);
    report(`${c.name}（${c.ss}〜${c.ss + c.t} 秒）`, input);
    if (!process.env.MIHON_DRY) cut(src, c.ss, c.t, join(OUT, c.name));
    const record = createRecord(input, { id: `mihon-${c.name}`, title: c.title, craftsman: c.craftsman, videoName: `${c.name}.webm`, date: DATE });
    if (!process.env.MIHON_DRY) writeFileSync(join(OUT, `${c.name}.json`), JSON.stringify(record));
    return record;
  });
  // 画面の「手を比べる」と同じ比べ方で、結果を出して確かめる
  compareReport(records);
}
