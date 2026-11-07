// 手本の頼み（2026-11-07 職人（石川）の声：「この技どうですか、っていうのを。比べられるっていうか、オファーできるみたいな」）。
// 学ぶ人が聞きたい技に、まだ職人の手本がないとき、自分の手の動画をつけて「この技の手本を撮ってください」と頼む。
// 職人は、手本を撮る所で、頼まれた技の一覧を見る。動画はこのブラウザの中（src/app/video-store.ts）に置き、外には送らない。
// 画面に依存しない純粋な関数（残す・読むのは src/app/model-requests.ts）。

export interface ModelRequest {
  id: string;
  /** 一覧にある技なら、その id（なければ、学ぶ人が書いた技の名前だけ） */
  tech?: string;
  /** 技の名前（画面に出す） */
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** 学ぶ人の動画の名前（動画そのものは video-store に id で置く） */
  videoName: string;
}

export interface ModelRequests {
  items: ModelRequest[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

/** 残した文字から読む（壊れていれば空） */
export function parseModelRequests(raw: string | null): ModelRequests {
  try {
    const v = JSON.parse(raw || "{}") as unknown;
    const items = isObj(v) && Array.isArray(v.items) ? v.items : [];
    return {
      items: items.filter(
        (x): x is ModelRequest => isObj(x) && typeof x.id === "string" && typeof x.name === "string" && !!x.name.trim() && typeof x.date === "string" && typeof x.videoName === "string" && (x.tech === undefined || typeof x.tech === "string"),
      ),
    };
  } catch {
    return { items: [] };
  }
}

/** 技の名前をそろえる（前後の空白・全角の空白を取る。長すぎる名前は切る） */
export const cleanTechName = (s: string) => s.replace(/[\s　]+/g, " ").trim().slice(0, 40);

/** 頼みを足す（新しい物を上に） */
export function addModelRequest(list: ModelRequests, r: ModelRequest): ModelRequests {
  const name = cleanTechName(r.name);
  if (!name) return list;
  return { items: [{ ...r, name }, ...list.items.filter((x) => x.id !== r.id)] };
}

export function removeModelRequest(list: ModelRequests, id: string): ModelRequests {
  return { items: list.items.filter((x) => x.id !== id) };
}

/** その技の頼み（技の id がなければ、書いた名前で比べる）。何も渡さなければ全部 */
export function requestsFor(list: ModelRequests, tech?: string): ModelRequest[] {
  return tech ? list.items.filter((x) => x.tech === tech) : list.items;
}

/** 一覧にない技（学ぶ人・職人が名前を書いた技）の手本の印。手の記録の technique に入れる */
export const FREE_TECH = "free:";
export const freeTechKey = (name: string) => `${FREE_TECH}${cleanTechName(name)}`;
export const isFreeTech = (technique: string | undefined) => !!technique?.startsWith(FREE_TECH);

/** 入れた動画が何か（2026-11-07 職人（石川）の声：自分の例を添削してほしいのか、職人がいい例として入れてるのかを、簡単に選べるように） */
export type VideoRole = "check" | "model";

/**
 * 入れた動画を、どう扱うか：
 *   自分の手を見てほしい（check）… 手本があれば比べる。なければ、その動画をつけて職人に手本を頼む
 *   職人の手本（model）       … その技の手本として残す（すぐ比べられる）
 */
export function videoRoute(role: VideoRole, hasModel: boolean): "compare" | "request" | "save-model" {
  if (role === "model") return "save-model";
  return hasModel ? "compare" : "request";
}

/** 手本ができた技の頼みを外す（手本ができたら、頼みは済み） */
export function fulfilRequests(list: ModelRequests, key: { tech?: string; name?: string }): { list: ModelRequests; done: ModelRequest[] } {
  const hit = (r: ModelRequest) => (key.tech ? r.tech === key.tech : !r.tech && !!key.name && r.name === cleanTechName(key.name));
  return { list: { items: list.items.filter((r) => !hit(r)) }, done: list.items.filter(hit) };
}

/** 技ごとにまとめる（一覧に出す。多い順） */
export function groupRequests(list: ModelRequests): { key: string; name: string; tech?: string; items: ModelRequest[] }[] {
  const m = new Map<string, { key: string; name: string; tech?: string; items: ModelRequest[] }>();
  for (const r of list.items) {
    const key = r.tech ?? `name:${r.name}`;
    const g = m.get(key) ?? { key, name: r.name, ...(r.tech ? { tech: r.tech } : {}), items: [] };
    g.items.push(r);
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => b.items.length - a.items.length);
}
