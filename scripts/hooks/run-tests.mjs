// After a file under src/geometry or src/rules is edited, run the tests and report failures back to Claude.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let file = "";
  try { file = JSON.parse(input)?.tool_input?.file_path ?? ""; } catch { process.exit(0); }
  if (!/[\\/]src[\\/](geometry|rules)[\\/]/.test(file)) process.exit(0);
  if (!existsSync("package.json")) process.exit(0);
  try {
    execSync("npm test --silent", { encoding: "utf8", stdio: "pipe", timeout: 120000 });
    process.exit(0);
  } catch (e) {
    const out = String(e.stdout || "") + String(e.stderr || "");
    console.error("テストが通りませんでした（" + file + " を直した後）:\n" + out.slice(-4000));
    process.exit(2);
  }
});
