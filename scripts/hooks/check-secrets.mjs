// Claude Code のフック（Bash を使う前）。git commit / push のときだけ、
// コミットに入る差分を見て、API キーや .env が混じっていたら止める（終了コード 2）。
// 2026-11-02 の開始後に、このリポジトリで書き直したもの。
import { execFileSync } from "node:child_process";

const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{16,}/, // Anthropic の API キーの形
  /ANTHROPIC_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]{8,}/, // 値の入った代入
];

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function stop(message) {
  process.stderr.write(`コミットを止めました：${message}\n`);
  process.exit(2);
}

const raw = await readStdin();
let command = "";
try {
  command = JSON.parse(raw).tool_input?.command ?? "";
} catch {
  process.exit(0); // 読めない入力では何もしない
}
const isCommit = /\bgit\b[^;&|]*\bcommit\b/.test(command);
const isPush = /\bgit\b[^;&|]*\bpush\b/.test(command);
if (!isCommit && !isPush) process.exit(0);

// commit なら入る予定の差分（git add -A が同じコマンドにあるかもしれないので、作業中の変更も見る）。
// push なら、まだ送っていないコミットの差分。
const diffs = [];
try {
  if (isCommit) {
    diffs.push(git(["diff", "--cached", "--unified=0"]));
    if (/\bgit\s+add\b/.test(command) || /\bcommit\b[^;&|]*\s-a\b/.test(command)) diffs.push(git(["diff", "--unified=0"]));
  }
  if (isPush) {
    try {
      diffs.push(git(["diff", "--unified=0", "@{upstream}..HEAD"]));
    } catch {
      // 送り先がまだない（初めての push）。コミット時に確かめているので見送る
    }
  }
} catch {
  process.exit(0); // git のリポジトリの外など
}
const diff = diffs.join("\n");

const touched = [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
const envFile = touched.find((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example"));
if (envFile) stop(`${envFile} が入ろうとしています。.env は .gitignore で除いてください。`);

const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
for (const line of added) {
  if (KEY_PATTERNS.some((re) => re.test(line))) stop("API キーらしき文字列が入ろうとしています。キーは .env だけに置いてください。");
}
process.exit(0);
