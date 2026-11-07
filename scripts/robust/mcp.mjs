// MCP サーバー（mcp/server.ts）を本物の MCP の通り道（標準入出力）で立て、変な入力で道具を呼ぶ試し。
// 目安帳は一時フォルダの写しを使う（リポジトリの ledger/jewelry.json は変えない）。
// node scripts/robust/mcp.mjs <結果を置くフォルダ>
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = process.argv[2] || "out/robust-mcp";
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "tsugu-mcp-robust-"));
const ledger = join(tmp, "jewelry.json");
copyFileSync("ledger/jewelry.json", ledger);

const transport = new StdioClientTransport({ command: "npx", args: ["tsx", "mcp/server.ts"], env: { ...process.env, TSUGU_LEDGER: ledger } });
const client = new Client({ name: "robust", version: "0.0.1" });
await client.connect(transport);

const CASES = [
  ["M01", "check_ring", { stone: { preset: "triangle", long_mm: 40, depth_mm: 30 } }, "40 mm の大きすぎる石"],
  ["M02", "check_ring", { stone: { preset: "round", long_mm: 0.3, depth_mm: 0.2 } }, "0.3 mm の小さすぎる石"],
  ["M03", "check_ring", { stone: { outline_mm: [{ x: 0, y: 0 }, { x: 1, y: 0 }], depth_mm: 3 } }, "点が 2 つだけの輪郭"],
  ["M04", "check_ring", { stone: { preset: "oval", long_mm: 8, depth_mm: 4 }, design: { prong_count: 1, gou: 30, metal: "pt900" } }, "爪 1 本・30 号"],
  ["M05", "check_ring", { stone: { preset: "oval", long_mm: 8, depth_mm: -4 } }, "深さがマイナス"],
  ["M06", "propose_rule", { craftsman: "  ", title: "x", text: "y", reason: "z" }, "職人の名前が空白だけ"],
  ["M07", "propose_rule", { craftsman: "試し", title: "爪 5 mm", text: "爪は 5 mm 以上", reason: "試し", param: "prong.minDiameterMm", value: 5 }, "ありえない値（爪 5 mm）"],
  ["M08", "propose_rule", { craftsman: "試し", title: "値だけ", text: "値だけ", reason: "試し", value: 0.8 }, "param なしで value だけ"],
  ["M09", "list_rules", { include_history: true }, "履歴つきで読む"],
  ["M10", "pattern_svg", { stone: { preset: "square", long_mm: 6, depth_mm: 3 }, save_as: "../../etc/evil.svg" }, "書き出し先に ../ を入れる"],
  ["M11", "check_ring", { stone: { preset: "oval", long_mm: 8, depth_mm: 4 }, design: { shank_section_curve: [{ x: 0, y: 0 }] } }, "断面の線が 1 点だけ"],
];

const results = [];
for (const [id, tool, args, note] of CASES) {
  const t0 = Date.now();
  let r;
  try {
    r = await client.callTool({ name: tool, arguments: args });
  } catch (e) {
    r = { thrown: String(e?.message ?? e) };
  }
  const text = (r.content ?? []).map((c) => c.text ?? "").join("\n").slice(0, 1500);
  const row = { id, tool, note, args, ms: Date.now() - t0, isError: r.isError ?? false, thrown: r.thrown, text };
  results.push(row);
  writeFileSync(join(out, `${id}.json`), JSON.stringify(row, null, 2));
  console.log(`${id} ${tool} ${note} → ${r.thrown ? "THROWN " + r.thrown.slice(0, 120) : (r.isError ? "isError " : "ok ") + text.replace(/\s+/g, " ").slice(0, 160)}`);
}
await client.close();
