// npm run ledger:init：リポジトリの目安帳（ledger/jewelry.json）を、出発点の目安帳から作る。
// もうあるときは何もしない（職人が足した決まりを消さないため）。
import { relative } from "node:path";
import { defaultLedgerPath, initLedgerFile, REPO_ROOT } from "./ledger-file";

const path = defaultLedgerPath();
const made = initLedgerFile(path);
const shown = relative(REPO_ROOT, path) || path;
console.log(made ? `目安帳を作りました：${shown}` : `目安帳はもうあります（そのままにしました）：${shown}`);
