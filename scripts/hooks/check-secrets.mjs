// Before a git commit, look at what is staged and stop the commit if an API key is in it.
import { execSync } from "node:child_process";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let cmd = "";
  try { cmd = JSON.parse(input)?.tool_input?.command ?? ""; } catch { process.exit(0); }
  if (!/\bgit\s+(commit|push)\b/.test(cmd)) process.exit(0);
  let staged = "";
  try { staged = execSync("git diff --cached -U0", { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }); } catch { process.exit(0); }
  const hits = [/sk-ant-[A-Za-z0-9_-]{10,}/, /ANTHROPIC_API_KEY\s*=\s*['"]?[A-Za-z0-9]/];
  const files = (staged.match(/^\+\+\+ b\/(.+)$/gm) || []).map((l) => l.slice(6));
  if (files.some((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith(".env.example"))) {
    console.error("コミットを止めました：.env がステージされています。.gitignore を確かめてください。");
    process.exit(2);
  }
  if (hits.some((re) => re.test(staged))) {
    console.error("コミットを止めました：API キーらしき文字列がステージされています。キーは .env だけに置いてください。");
    process.exit(2);
  }
  process.exit(0);
});
