// 手本の頼みを、このブラウザに残す・職人に見せる（決まりは src/rules/model-requests.ts）。
// 学ぶ人の動画は video-store（IndexedDB）に、頼みの一覧は localStorage に置く。外には送らない。
import { addModelRequest, fulfilRequests, groupRequests, parseModelRequests, removeModelRequest, requestsFor, type ModelRequest, type ModelRequests } from "../rules/model-requests";
import { esc, store, today } from "./store";
import { getVideo, putVideo, removeVideo } from "./video-store";

const KEY = "tsugu.modelRequests.v1";

export function loadRequests(): ModelRequests {
  try {
    return parseModelRequests(localStorage.getItem(KEY));
  } catch {
    return { items: [] };
  }
}
function save(l: ModelRequests) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    // 残せなくても画面は動く
  }
  store.touch();
}

/** 手本を頼む（学ぶ人の動画をつけても、つけなくてもよい） */
export async function requestModel(name: string, tech: string | undefined, video?: File): Promise<ModelRequest> {
  const r: ModelRequest = { id: `req-${Date.now().toString(36)}`, name, ...(tech ? { tech } : {}), date: today(), videoName: video ? video.name || "動画" : "" };
  if (video)
    try {
      await putVideo(r.id, video);
    } catch {
      // 動画が残せなくても、頼みは残す
    }
  save(addModelRequest(loadRequests(), r));
  return r;
}

/** 手本を残したら、その技の頼みを済みにする（済んだ数を返す） */
export function fulfilModel(key: { tech?: string; name?: string }): number {
  const { list, done } = fulfilRequests(loadRequests(), key);
  if (!done.length) return 0;
  save(list);
  done.forEach((r) => void removeVideo(r.id).catch(() => {}));
  return done.length;
}

/** 職人が「撮った・済み」にする */
export function finishRequest(id: string) {
  save(removeModelRequest(loadRequests(), id));
  void removeVideo(id).catch(() => {});
}

/**
 * 職人に見せる、頼まれた手本の一覧。tech を渡せば、その技の頼みだけ。頼みがなければ空にする。
 * 「動画を見る」で学ぶ人の動画をその場で出し、「済み」で一覧から外す。
 */
export function mountRequests(el: HTMLElement, tech?: string) {
  const all = loadRequests();
  const items = requestsFor(all, tech);
  el.hidden = !items.length;
  if (!items.length) {
    el.innerHTML = "";
    return;
  }
  const groups = tech ? [{ key: tech, name: items[0].name, items }] : groupRequests(all);
  el.innerHTML = `<div class="mreq">
    <p class="mreq-h"><b>学ぶ人から、手本を頼まれています</b><span class="mreq-n">${items.length}</span></p>
    <ul class="mreq-list">${groups
      .map(
        (g) => `<li><span class="mreq-name">${esc(g.name)}</span><small>${g.items.length} 件</small>
        <span class="mreq-acts">${g.items
          .map((r) => `<span class="mreq-one">${r.videoName ? `<button type="button" class="ghost tiny mreq-see" data-id="${esc(r.id)}">${esc(r.date.slice(5).replace("-", "/"))} の動画を見る</button>` : `<small>${esc(r.date.slice(5).replace("-", "/"))} ・ 動画なし</small>`}<button type="button" class="ghost tiny mreq-done" data-id="${esc(r.id)}">済み</button></span>`)
          .join("")}</span><div class="mreq-video" hidden></div></li>`,
      )
      .join("")}</ul>
    <p class="small muted">撮った手本は、学ぶ人がその技で比べられます。</p>
  </div>`;
  el.querySelectorAll<HTMLButtonElement>(".mreq-see").forEach((b) =>
    b.addEventListener("click", async () => {
      const box = b.closest("li")!.querySelector<HTMLElement>(".mreq-video")!;
      const blob = await getVideo(b.dataset.id!).catch(() => null);
      box.hidden = false;
      box.innerHTML = blob ? `<video controls playsinline muted src="${URL.createObjectURL(blob)}"></video>` : `<p class="small muted">動画は、このブラウザにありません。</p>`;
    }),
  );
  el.querySelectorAll<HTMLButtonElement>(".mreq-done").forEach((b) =>
    b.addEventListener("click", () => {
      finishRequest(b.dataset.id!);
      mountRequests(el, tech);
    }),
  );
}
