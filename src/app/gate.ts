// 入口の合言葉：設計・帳面・学ぶ・技を開く前に、一度だけ聞く（2026-11-05 作者が決めた）。
// 2026-11-08 作者が変えた：入れなくても使える（「合言葉なしで使う」）。合言葉が要るのは Claude が考える所だけ（そこで src/app/password.ts が聞く）。
// 見本（?mihon）は Claude を呼ばないので、入口でも聞かない。
// 画面のコードはリポジトリで公開しているので、これは鍵ではなく、公開の版の入口。本当の守りは、サーバー（api/claude.ts）の合言葉の確かめ。
// 手元で動かす人・撮影（?rec・?nointro）には出さない。?gate で手元でも試せる。
import { filming } from "./confirm";
import { isMihon } from "./mihon";
import { PASSWORD_HEADER } from "../claude/wire";

/** src/app/store.ts の PASS_STORE と同じ置き場所。Claude を呼ぶときも同じ合言葉を使う */
const STORE = "tsugu.password.v1";
/** 入口で「合言葉なしで使う」を選んだ印。次からは入口で聞かない（Claude の所では聞く） */
const SKIP_STORE = "tsugu.gate.skip.v1";
const CHECK_TIMEOUT_MS = 4000;
const REPO_URL = "https://github.com/ohri0/tsugu-craft";

export type GateAnswer = "ok" | "wrong" | "broken" | "offline";

/** 返事の番号を意味に直す。空の中身を送るので、合言葉が合っていれば「中身が違う」（400）で、Claude は呼ばれない */
export function readGateStatus(status: number): GateAnswer {
  if (status === 401) return "wrong";
  if (status >= 500) return "broken";
  return "ok";
}

async function check(word: string): Promise<GateAnswer> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CHECK_TIMEOUT_MS);
  try {
    const r = await fetch("/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json", [PASSWORD_HEADER]: encodeURIComponent(word) },
      body: "{}",
      signal: ctl.signal,
    });
    return readGateStatus(r.status);
  } catch {
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}

function read(): string {
  try {
    return localStorage.getItem(STORE) ?? "";
  } catch {
    return "";
  }
}

function skippedBefore(): boolean {
  try {
    return localStorage.getItem(SKIP_STORE) === "1";
  } catch {
    return false;
  }
}

function rememberSkip() {
  try {
    localStorage.setItem(SKIP_STORE, "1");
  } catch {
    /* 覚えられなくても、この画面は開く */
  }
}

function write(word: string) {
  try {
    if (word) localStorage.setItem(STORE, word);
    else localStorage.removeItem(STORE);
  } catch {
    /* 覚えられなくても、この画面は開く */
  }
}

const MESSAGES: Record<Exclude<GateAnswer, "ok">, string> = {
  wrong: "合言葉が違います。もう一度入れてください。",
  broken: "サーバーの準備ができていません。少しあとで、もう一度試してください。",
  offline: "つながりませんでした。通信を確かめて、もう一度試してください。",
};

function ask(first: string): Promise<void> {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.setAttribute("style", "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;background:#141416;color:#f2f2f4;font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;");
    root.innerHTML = `<form style="width:min(100%,360px);display:grid;gap:14px;">
      <h1 style="margin:0;font-size:24px;font-weight:600;letter-spacing:.04em;">継ぐ</h1>
      <p style="margin:0;font-size:15px;line-height:1.7;color:#c9c9cf;">合言葉を入れますか？ 合言葉が要るのは、Claude が考えて答える所だけです。入れなくても、設計・帳面・学ぶ・技は使えます。合言葉は、このアプリを教えてくれた人に聞いてください。</p>
      <input type="password" autocomplete="off" placeholder="合言葉" aria-label="合言葉" style="min-height:48px;padding:0 14px;font-size:16px;color:inherit;background:#1f1f22;border:1px solid #47474d;border-radius:8px;">
      <p class="gate-msg" role="alert" style="margin:0;min-height:1.6em;font-size:14px;line-height:1.6;color:#ff8a80;">${first}</p>
      <button style="min-height:48px;font-size:16px;font-weight:600;color:#fff;background:#2f6fe4;border:0;border-radius:8px;cursor:pointer;">合言葉を入れてはじめる</button>
      <button type="button" class="gate-skip" style="min-height:48px;font-size:16px;color:inherit;background:transparent;border:1px solid #47474d;border-radius:8px;cursor:pointer;">合言葉なしで使う</button>
      <p style="margin:0;font-size:13px;line-height:1.7;color:#9a9aa1;"><a href="./" style="color:inherit;">はじめの画面へ戻る</a> ・ <a href="${REPO_URL}" style="color:inherit;">自分で動かす（GitHub）</a></p>
    </form>`;
    document.body.appendChild(root);
    const form = root.querySelector("form")!;
    const input = root.querySelector("input")!;
    const msg = root.querySelector<HTMLElement>(".gate-msg")!;
    const go = root.querySelector("button")!;
    input.focus();
    root.querySelector(".gate-skip")!.addEventListener("click", () => {
      rememberSkip();
      root.remove();
      resolve();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const word = input.value.trim();
      if (!word) return;
      go.disabled = true;
      msg.textContent = "";
      void check(word).then((a) => {
        go.disabled = false;
        if (a === "ok") {
          write(word);
          root.remove();
          resolve();
        } else {
          msg.textContent = MESSAGES[a];
          input.select();
        }
      });
    });
  });
}

/** 合言葉が確かめられたら進む。残っている合言葉も確かめる（違う合言葉が残ったまま「Claude なし」になっていたため） */
export async function openGate(): Promise<void> {
  const force = new URLSearchParams(location.search).has("gate");
  if (filming() || isMihon()) return;
  if (!force && !location.hostname.endsWith(".vercel.app")) return;
  const kept = read();
  if (!kept) return skippedBefore() ? undefined : ask("");
  const a = await check(kept);
  if (a === "wrong") {
    write("");
    return skippedBefore() ? undefined : ask("");
  }
  // 通信の失敗では止めない：合っている合言葉の人を、電波の悪さで閉め出さない
}
