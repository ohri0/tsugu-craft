// リポジトリに残す目安帳（ledger/jewelry.json）の読み書き。
// 画面の目安帳はブラウザの中（localStorage）に残るが、MCP サーバーはこのファイルを読み書きする。
// ファイルは git で履歴が残るので、「誰がいつ何を変えたか」がコミットにも残る（SPEC「残る」）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedLedger, type Ledger } from "../src/rules/ledger";

/** リポジトリのいちばん上のフォルダ */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 目安帳のファイル。環境変数 TSUGU_LEDGER があれば、そちらを使う（試すときなど） */
export function defaultLedgerPath(): string {
  return process.env.TSUGU_LEDGER ? resolve(process.env.TSUGU_LEDGER) : resolve(REPO_ROOT, "ledger", "jewelry.json");
}

/** 目安帳を読む。ファイルがまだなければ出発点の目安帳を返す（書き込みはしない） */
export function readLedger(path: string): Ledger {
  if (!existsSync(path)) return seedLedger();
  const raw = readFileSync(path, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`目安帳のファイルが JSON として読めません：${path}`);
  }
  if (!isLedger(data)) throw new Error(`目安帳のファイルの形が違います（craft と rules が要ります）：${path}`);
  return data;
}

/** 目安帳を書く。途中で止まっても壊れないよう、別の名前に書いてから入れ替える */
export function writeLedger(path: string, ledger: Ledger): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

/** まだファイルがなければ、出発点の目安帳で作る。作ったら true */
export function initLedgerFile(path: string): boolean {
  if (existsSync(path)) {
    readLedger(path); // 形が正しいかだけ確かめる
    return false;
  }
  writeLedger(path, seedLedger());
  return true;
}

function isLedger(v: unknown): v is Ledger {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.craft === "string" && Array.isArray(o.rules) && o.rules.every((r) => typeof r === "object" && r !== null && typeof (r as Record<string, unknown>).id === "string");
}
