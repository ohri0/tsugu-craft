// 本物の Claude を呼ぶ試し（台本のない入力）だけを回す設定。ふつうの npm test には入らない。
// npx vitest run --config scripts/robust/vitest.config.ts  （ROBUST_OUT＝結果を置くフォルダ、ROBUST_ONLY＝番号をカンマで）
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: new URL("../..", import.meta.url).pathname,
    include: ["scripts/robust/*.robust.ts"],
    environment: "node",
    testTimeout: 400_000,
    hookTimeout: 60_000,
    maxConcurrency: 6,
  },
});
