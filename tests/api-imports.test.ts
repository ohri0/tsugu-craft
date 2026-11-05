// 公開の環境（Vercel の Node）は、api/ の中をファイルごとに動かす。手元の開発用サーバーでは動くのに公開では落ちる読み込みを見張る
// （2026-11-05：JSON の読み込みに with { type: "json" } がなく、公開の Claude の窓口が全部止まっていた）
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/** api/claude.ts から読むファイルを順にたどり、読み込みの行を集める */
function walk(file: string, seen = new Map<string, string[]>()): Map<string, string[]> {
  if (seen.has(file)) return seen;
  const lines = readFileSync(file, "utf8").match(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"\.[^"]+"[^;\n]*/gm) ?? [];
  seen.set(file, lines);
  for (const line of lines) {
    const spec = line.match(/from\s+"([^"]+)"/)![1];
    if (!spec.endsWith(".js")) continue;
    const next = normalize(join(dirname(file), spec.replace(/\.js$/, ".ts")));
    if (existsSync(next)) walk(next, seen);
  }
  return seen;
}

describe("公開の Claude の窓口が読むファイル", () => {
  const files = walk("api/claude.ts");
  it("api/claude.ts からたどれる", () => {
    expect(files.size).toBeGreaterThan(2);
  });
  it("JSON は with { type: \"json\" } で読み、ほかのファイルは .js までつけて読む", () => {
    const bad: string[] = [];
    for (const [file, lines] of files) {
      for (const line of lines) {
        const spec = line.match(/from\s+"([^"]+)"/)![1];
        if (spec.endsWith(".json") ? !/with\s*\{\s*type:\s*"json"\s*\}/.test(line) : !spec.endsWith(".js")) bad.push(`${file}: ${line}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
