// 決まりの札の「編集」の窓と、「消した決まり」の一覧。帳面（指輪・工房）と技の頁で、同じ形で使う。
// 窓は 2026-11-05 の作者の声から：押した瞬間に消えると怖い。編集の中に消すがあるほうがいい。
import type { Rule } from "../rules/ledger";
import { sourceLabel } from "../rules/ledger";
import { esc } from "./store";

export type RulePatch<P extends string> = Partial<Pick<Rule<P>, "title" | "text" | "quote" | "value" | "bySize">>;

export interface RuleEditHost<P extends string> {
  save(patch: RulePatch<P>): void;
  remove(): void;
}

export function openRuleEditor<P extends string>(r: Rule<P>, host: RuleEditHost<P>): void {
  // 資料の決まりは、資料に書いてあることなので言葉を変えない（直すなら職人の決まりとして足す）。消すことはできる
  const mine = r.source.kind === "craftsman";
  const points = mine && r.bySize?.every((s) => s.upToMm !== null) ? r.bySize : null;
  const hasValue = mine && !r.bySize && r.value !== undefined;
  const dlg = document.createElement("dialog");
  dlg.className = "sheet rule-edit";
  dlg.innerHTML = `<form method="dialog">
      <h3>${mine ? "決まりを編集" : "資料の決まり"}</h3>
      ${
        mine
          ? `<label>見出し<input class="re-title" value="${esc(r.title)}"></label>
      <label>決まり<textarea class="re-text" rows="5">${esc(r.text)}</textarea></label>
      <label>職人の言葉<textarea class="re-quote" rows="2">${esc(r.quote ?? "")}</textarea></label>
      ${hasValue ? `<label>確かめに使う数字<input class="re-value" type="number" inputmode="decimal" step="0.01" min="0" value="${r.value}"></label>` : ""}
      ${
        points
          ? `<fieldset class="re-points"><legend>確かめに使う数字（mm）</legend>${points
              .map((s, i) => `<label>石 ${s.upToMm} mm<input class="re-point" data-i="${i}" type="number" inputmode="decimal" step="0.01" min="0" value="${s.value}"></label>`)
              .join("")}</fieldset>`
          : ""
      }
      ${hasValue || points ? `<p class="small muted">数字を変えたら、上の「決まり」の文も合わせて直してください。</p>` : ""}`
          : `<p class="rc-title">${esc(r.title)}</p><p>${esc(r.text)}</p><p class="small muted">資料に書いてあることなので、言葉は変えません。ちがうと思ったら、消して、職人の決まりとして足してください。</p>`
      }
      <p class="re-err" role="alert" hidden></p>
      <div class="sheet-actions re-actions">
        <button type="button" class="ghost danger re-del">消す</button>
        <span class="re-right"><button type="button" class="ghost re-cancel">${mine ? "やめる" : "閉じる"}</button>${mine ? `<button type="submit" class="primary re-save">保存</button>` : ""}</span>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const q = <T extends HTMLElement>(s: string) => dlg.querySelector<T>(s)!;
  dlg.addEventListener("close", () => dlg.remove());
  q(".re-cancel").addEventListener("click", () => dlg.close());
  // 消す：確かめてから。前の決まりを置き換えていたら、前の決まりに戻る。あとで「消した決まり」から戻せる
  q(".re-del").addEventListener("click", () => {
    if (!confirm(`この決まりを帳面から消しますか？\n「${r.title}」\n設計の確かめと、学ぶ人への答えに使われなくなります。\n（帳面の下の「消した決まり」から戻せます）`)) return;
    host.remove();
    dlg.close();
  });
  if (mine) {
    q("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const err = q(".re-err");
      const fail = (m: string) => {
        err.textContent = m;
        err.hidden = false;
      };
      const title = q<HTMLInputElement>(".re-title").value.trim();
      const text = q<HTMLTextAreaElement>(".re-text").value.trim();
      if (!title || !text) return fail("見出しと決まりは、空にできません。");
      const patch: RulePatch<P> = { title, text, quote: q<HTMLTextAreaElement>(".re-quote").value.trim() || undefined };
      if (hasValue) {
        const v = Number(q<HTMLInputElement>(".re-value").value);
        if (!Number.isFinite(v) || v <= 0) return fail("数字は 0 より大きくしてください。");
        patch.value = v;
      }
      if (points) {
        const vs = [...dlg.querySelectorAll<HTMLInputElement>(".re-point")].map((x) => Number(x.value));
        if (vs.some((v) => !Number.isFinite(v) || v <= 0)) return fail("数字は 0 より大きくしてください。");
        patch.bySize = points.map((s, i) => ({ ...s, value: vs[i] }));
      }
      host.save(patch);
      dlg.close();
    });
  }
  dlg.showModal();
  // 開いただけでスマホのキーボードが出ないように、はじめは窓そのものに合わせる
  dlg.tabIndex = -1;
  dlg.focus();
}

/** 「消した決まり」の一覧（なければ空）。「元に戻す」は data-restore */
export function removedRulesHtml<P extends string>(rules: readonly Rule<P>[]): string {
  if (!rules.length) return "";
  return `<details class="removed-rules"><summary>消した決まり ${rules.length}</summary>
    <ul class="removed-list">${rules
      .map((r) => `<li><div><b>${esc(r.title)}</b><small>${esc(sourceLabel(r.source as Rule["source"]))} ・ ${esc(r.date)}</small></div><button type="button" class="ghost tiny" data-restore="${esc(r.id)}">元に戻す</button></li>`)
      .join("")}</ul></details>`;
}
