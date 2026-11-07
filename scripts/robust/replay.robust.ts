// 動画が覚えた本物の Claude の返事（video/work/story/_claude9/、git に入れていない）が、今の読み取りでも通るか。
// 道具の名前と入力を parseToolCall（と地金のみの指輪・コツ分けの読み取り）に通す。Claude は呼ばない。
// VIDEO_WORK=<video/work の場所> npx vitest run --config scripts/robust/vitest.config.ts replay
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseToolCall, isToolName } from "../../src/claude/tools";
import { parseBand } from "../../src/studio/band";

const WORK = process.env.VIDEO_WORK || "video/work";
const DIR = join(WORK, "story", "_claude9");

describe("動画の覚えた返事が、今の読み取りで通る", () => {
  it.skipIf(!existsSync(DIR))("_claude9 の返事の道具の呼び出しを、全部読み直す", () => {
    const bad: string[] = [];
    let n = 0;
    for (const chapter of readdirSync(DIR)) {
      const d = join(DIR, chapter);
      if (!statSync(d).isDirectory()) continue;
      for (const f of readdirSync(d).filter((x) => x.endsWith(".json"))) {
        const saved = JSON.parse(readFileSync(join(d, f), "utf8")) as { body: string };
        const msg = JSON.parse(saved.body) as { content?: { type: string; name?: string; input?: unknown }[] };
        for (const b of msg.content ?? []) {
          if (b.type !== "tool_use" || !b.name) continue;
          n++;
          const r = isToolName(b.name) ? parseToolCall(b.name, b.input) : b.name === "make_band" ? parseBand(b.input) : { ok: true as const };
          if (!r.ok) bad.push(`${chapter}/${f} ${b.name}: ${"error" in r ? r.error : ""}`);
        }
      }
    }
    console.log(`読み直した道具の呼び出し：${n}`);
    // 撮ったときにも画面が断っていた呼び出し（Claude にはその断りが返り、次の返事も覚えてある）。
    // 断り方が変わると、撮り直しの流れが変わるので、同じ物だけが断られることを見る（2026-11-07 に数えた）
    expect(bad.sort()).toEqual([
      "deco11_t16/000.json set_shank: finish という項目はありません",
      "deco11_t5/000.json set_shank: 腕の彫りの模様は none / arch / diamond / wave / beads / lines / leaf / mil / blade のどれかです（今は steps）",
      "goth12_t1/000.json set_setting: 変える項目が 1 つもありません。理由だけでは形は変わりません。変える数や形を項目に書いてください",
      "goth12_t1/000.json set_setting: 変える項目が 1 つもありません。理由だけでは形は変わりません。変える数や形を項目に書いてください",
      "teach14/000.json propose_rule: stone_mm という項目はありません",
      "teach14/002.json propose_rule: stone_mm という項目はありません",
    ]);
  });
});
