// 継ぐの「場所」の切り替え（2026-11-08 作者：画面の間の動線が少し分かりにくい）。
// 帳面・学ぶ・技（app.html）と設計（studio.html）で、同じ部品・同じ順・同じ言葉・同じ見た目にする。
// 並びと言葉は src/ui/places.ts（入口のページ src/lp/main.ts のメニューも同じ物を使う）。
// 撮影（?rec・?nointro）では使わない（動画の絵を前のままにする。src/app/confirm.ts の filming()）。
import "./main-nav.css";

import { PLACES, placeHref, type PlaceId } from "./places";

export { PLACES, placeHref, placeOf, type Place, type PlaceId } from "./places";

/** 場所の切り替え（nav）。current の場所に aria-current="page" */
export function mainNavHtml(current: PlaceId | null, from: "app" | "other"): string {
  return `<nav class="gnav" aria-label="継ぐの場所">${PLACES.map(
    (p) =>
      `<a href="${placeHref(p, from)}" data-place="${p.id}"${p.id === current ? ` aria-current="page"` : ""}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${p.icon}</svg><span class="gn-l">${p.label}</span>${p.id === "design" && from === "app" ? `<span class="gn-ext" aria-label="（別の頁）" title="別の頁へ移ります">↗</span>` : ""}<i class="badge" hidden></i></a>`,
  ).join("")}</nav>`;
}

/** いまの場所の印を付け直す（app.html は # が変わるたびに） */
export function markPlace(root: ParentNode, current: PlaceId | null): void {
  root.querySelectorAll<HTMLAnchorElement>(".gnav a[data-place]").forEach((a) => {
    if (a.dataset.place === current) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}
