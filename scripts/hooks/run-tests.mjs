// Claude Code のフック（ファイルを書いた後）。形の処理（src/geometry）・確かめるルール（src/rules）・
// 写真の読み取り（src/vision）を直したら、テストを回し、落ちたら結果を Claude に返す（終了コード 2）。
// 2026-11-02 の開始後に、このリポジトリで書き直したもの。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const WATCHED = /[\\/]src[\\/](geometry|rules|vision|pattern)[\\/]/;

let raw = "";
for await (const c of process.stdin) raw += c;
let file = "";
try {
  file = JSON.parse(raw).tool_input?.file_path ?? "";
} catch {
  process.exit(0);
}
if (!WATCHED.test(file)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
if (!existsSync(join(root, "package.json"))) process.exit(0);

const r = spawnSync("npx", ["vitest", "run", "--reporter=dot"], { cwd: root, encoding: "utf8", timeout: 180_000 });
if (r.status === 0) process.exit(0);
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
process.stderr.write(`${file} を直した後のテストが通りません:\n${out.slice(-4000)}\n`);
process.exit(2);
