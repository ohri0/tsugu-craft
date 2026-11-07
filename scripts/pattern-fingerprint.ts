// 保存した見込み（docs/pattern-demo の *.predictions.json）を描いて、絵と知らせの指紋を出す（計算を直す前と後で同じ絵かを確かめるため。2026-11-08）。
// 使い方：npx tsx scripts/pattern-fingerprint.ts > 前.txt（直したあとに同じく出して diff）
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { modelOf, topImage } from "../src/rebuild/pattern-model";
import type { PatternPrediction } from "../src/rebuild/pattern-tools";

const files = execSync("find docs/pattern-demo -name '*.predictions.json'", { encoding: "utf8" }).trim().split("\n").sort();
for (const f of files) {
  const list = JSON.parse(readFileSync(f, "utf8")) as { tag?: string; prediction: PatternPrediction }[];
  for (const [k, e] of list.entries()) {
    if (!e.prediction?.applicable || !e.prediction.ops?.length) continue;
    const h = createHash("sha256");
    const m = modelOf(e.prediction, 7);
    const top = await topImage(m, 96, 1);
    h.update(top.data);
    h.update(m.section(160, 40, m.row, 1).data);
    for (let i = 0; i < e.prediction.ops.length - 1; i++) h.update((await topImage(m.stage(i), 48, 1)).data);
    h.update(m.notes.join("\n"));
    console.log(`${f}#${k} ${h.digest("hex").slice(0, 16)}`);
  }
}
