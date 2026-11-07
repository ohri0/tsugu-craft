// 手順のめずらしい架空の技（scripts/pattern-odd.ts が本物の Claude で 1 回ずつ通した絵）を、1 枚のシートに並べる（2026-11-08）。
// 絵はそのまま使い、名前・考えた手順・Claude が選んだ操作の並びを添える。上位 3 つ（PICK）に印をつける。
// 使い方：npx tsx scripts/odd-sheet.ts
// 出すもの：docs/pattern-demo/odd/sheet.png
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { ODD_CASES } from "./pattern-odd-cases";
import { TOOL_OP_LABEL, type PatternPrediction } from "../src/rebuild/pattern-tools";

const DIR = resolve("docs/pattern-demo/odd");
/** 上位 3 つ（順に）と、選んだわけ */
const PICK: Record<string, { rank: number; why: string }> = {
  warinekase: { rank: 1, why: "上下から向かい合う炎の形。手がかりの見た目と合う" },
  imura: { rank: 2, why: "四角ごとに向きの変わる網目。説明からは思いえがきにくい" },
  kazaguruma: { rank: 3, why: "石畳の風車。案が手がかりの手順を順に追えている" },
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const cards = ODD_CASES.map((c) => {
  const saved = `${DIR}/cases/${c.id}.predictions.json`;
  const pred = existsSync(saved) ? (JSON.parse(readFileSync(saved, "utf8")) as { prediction: PatternPrediction }[])[0]?.prediction : undefined;
  const img = `${DIR}/${c.id}-top.png`;
  const ops = pred?.applicable ? pred.ops.filter((o) => o.op !== "bond" && o.op !== "color").map((o) => TOOL_OP_LABEL[o.op].replace(/（.*）/, "")).join(" → ") : "描けなかった";
  const pick = PICK[c.id];
  return `<figure class="${pick ? "pick" : ""}">
    ${pick ? `<div class="badge">上位 ${pick.rank}</div>` : ""}
    ${existsSync(img) ? `<img src="data:image/png;base64,${readFileSync(img).toString("base64")}">` : `<div class="none">絵なし</div>`}
    <h2>${esc(c.name)}</h2>
    <p class="proc">${esc(c.process)}</p>
    <p class="ops">Claude の操作：${esc(ops)}</p>
    ${pick ? `<p class="why">${esc(pick.why)}</p>` : ""}
  </figure>`;
}).join("");

const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;padding:36px 40px;width:1920px;background:#f4f1ea;color:#1d1c1a;font-family:"Hiragino Sans","Noto Sans JP",sans-serif}
h1{margin:0 0 6px;font:600 32px/1.3 "Hiragino Mincho ProN","Noto Serif JP",serif}.lead{margin:0 0 24px;color:#5d5a53;font-size:17px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:26px}
figure{position:relative;margin:0;padding:14px;background:#fff;border:2px solid #e2ddd2;border-radius:10px}
figure.pick{border-color:#b8862e;box-shadow:0 0 0 3px #e8c27a}
.badge{position:absolute;top:22px;left:22px;padding:4px 12px;border-radius:6px;background:#b8862e;color:#fff;font-size:18px;font-weight:600}
img,.none{display:block;width:100%;aspect-ratio:1;border-radius:6px}.none{background:#ddd;display:grid;place-items:center}
h2{margin:12px 0 4px;font:600 24px/1.3 "Hiragino Mincho ProN","Noto Serif JP",serif}
p{margin:4px 0;line-height:1.5}.proc{font-size:15px}.ops{font-size:13px;color:#6b675f}.why{font-size:14px;color:#8a5f14;font-weight:600}
.foot{margin-top:22px;color:#6b675f;font-size:14px;line-height:1.6}
</style><body>
<h1>手順のめずらしい、架空の技（8 つ）</h1>
<p class="lead">どれもこの世にない作り話です。手がかり（古い覚え書き・品物の見た目・年寄りの話）だけを入れ、本物の Claude で、案 → 模様の見込み → 絵 を 1 回ずつ通しました（選び直しはしていません）。</p>
<div class="grid">${cards}</div>
<p class="foot">上の行の手順は、作り話を考えたときのもの（Claude には渡していない）。「Claude の操作」は、Claude が手がかりから選んだ操作の並び（つなぐ・色を出すは省いた）。数はすべて絵のための仮の値です。2026-11-08</p>
</body>`;

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: `${DIR}/sheet.png`, fullPage: true });
await b.close();
console.log(`${DIR}/sheet.png`);
