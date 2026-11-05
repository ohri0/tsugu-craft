// 合言葉：公開ページで Claude を使うための言葉。初めて Claude を使うときに一度だけ聞き、このブラウザに残す。
// 「合言葉なしで使う」を選んだら、この画面を開いている間は聞かない（Claude なしで動く所だけ使える）。
import { isMihon } from "./mihon";
import { store } from "./store";

let skipped = false;

/** force：「合言葉なしで使う」を選んだあとでも、人がボタンを押して Claude を頼んだときは聞き直す */
export function askPassword(force = false): Promise<string> {
  // 見本は Claude を呼ばない。合言葉を聞かない
  if (isMihon() || (skipped && !force)) return Promise.resolve("");
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "sheet";
    dlg.innerHTML = `<form method="dialog">
      <h3>合言葉を入れてください</h3>
      <p>Claude が考えて答えるには、合言葉が要ります。合言葉は、このアプリを見せてもらった人から聞いてください。</p>
      <input type="password" autocomplete="off" placeholder="合言葉" aria-label="合言葉">
      <div class="sheet-actions">
        <button type="button" class="ghost pw-skip">合言葉なしで使う</button>
        <button value="ok" class="primary">使う</button>
      </div>
    </form>`;
    document.body.appendChild(dlg);
    const input = dlg.querySelector("input")!;
    // Enter は「使う」。先頭のボタンが送信にならないよう、「なしで使う」は送信ボタンにしない（Enter で合言葉が捨てられていた）
    dlg.querySelector(".pw-skip")!.addEventListener("click", () => dlg.close("skip"));
    dlg.addEventListener("close", () => {
      const v = dlg.returnValue === "ok" ? input.value.trim() : "";
      if (v) store.setPassword(v);
      else skipped = true;
      dlg.remove();
      resolve(v);
    });
    dlg.showModal();
    input.focus();
  });
}

/** 合言葉を入れ直す（違っていたとき） */
export function resetPassword(): void {
  store.setPassword("");
  skipped = false;
}
