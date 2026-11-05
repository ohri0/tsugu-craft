// 合言葉：公開ページで Claude を使うための言葉。初めて Claude を使うときに一度だけ聞き、このブラウザに残す。
// 「合言葉なしで使う」を選んだら、この画面を開いている間は聞かない（Claude なしで動く所だけ使える）。
import { store } from "./store";

let skipped = false;
/** サーバーに「合言葉が違う」と言われたあと（入れ直してもらう印） */
let wrong = false;
const CHANGED = "tsugu:password";
const changed = () => window.dispatchEvent(new Event(CHANGED));

/** force：「合言葉なしで使う」を選んだあとでも、人がボタンを押して Claude を頼んだときは聞き直す */
export function askPassword(force = false): Promise<string> {
  if (skipped && !force) return Promise.resolve("");
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
      if (v) {
        store.setPassword(v);
        wrong = false;
      } else skipped = true;
      dlg.remove();
      changed();
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
  wrong = true;
  changed();
}

/** どの画面からでも合言葉を入れられるボタン。入っているか・違っていたかを字で見せる（前は入れる場所がどこにもなかった） */
export function passwordButton(): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ghost pw-state";
  const paint = () => {
    const has = !!store.password();
    b.dataset.state = wrong ? "wrong" : has ? "set" : "none";
    b.textContent = wrong ? "合言葉を入れ直す" : has ? "Claude：合言葉あり" : "合言葉を入れる";
    b.title = has ? "押すと、合言葉を入れ替えられます" : "Claude が考えて答えるには、合言葉が要ります";
  };
  b.addEventListener("click", () => void askPassword(true));
  window.addEventListener(CHANGED, paint);
  paint();
  return b;
}
