// 継ぐの「場所」（帳面・設計・学ぶ・技・途切れた技）の並びと言葉。見た目を持たない（入口のページも読むので、CSS を読み込まない）。
// 順は入口のページの話と同じ：帳面（職人が残す）→ 設計（デザインする人）→ 学ぶ（学ぶ人）→ 技（技を残す）→ 途切れた技（手がかりから復元）。
export type PlaceId = "ledger" | "design" | "learn" | "waza" | "restore";

export interface Place {
  id: PlaceId;
  /** 名前（スマホの下の帯もこの言葉） */
  label: string;
  /** PC で名前の下に出す、だれの・何の場所か */
  sub: string;
  /** app.html の中の場所（#…）。設計は別の頁 */
  hash?: string;
  /** スマホの下の帯の印（24 × 24） */
  icon: string;
}

const S = `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;

export const PLACES: readonly Place[] = [
  { id: "ledger", label: "帳面", sub: "職人が残す", hash: "#ledger", icon: `<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" ${S}/><path d="M9 9h6M9 13h6" ${S}/>` },
  { id: "design", label: "設計", sub: "デザインする人", icon: `<circle cx="12" cy="14" r="6" ${S}/><path d="M9 4h6l-3 4Z" ${S}/>` },
  { id: "learn", label: "学ぶ", sub: "学ぶ人", hash: "#learn", icon: `<path d="M4 5h16v11H8l-4 4V5Z" ${S}/>` },
  { id: "waza", label: "技", sub: "技を残す", hash: "#waza", icon: `<circle cx="7" cy="7" r="2" ${S}/><circle cx="17" cy="7" r="2" ${S}/><circle cx="12" cy="12" r="2" ${S}/><circle cx="7" cy="17" r="2" ${S}/><circle cx="17" cy="17" r="2" ${S}/>` },
  { id: "restore", label: "途切れた技", sub: "手がかりから復元", hash: "#waza/restore", icon: `<path d="M19.5 13a7.5 7.5 0 1 1-2.2-6.3" ${S}/><path d="M18 3.5v4h-4" ${S}/><path d="M9 12.5h1.6M13.4 12.5H15" ${S}/>` },
];

/**
 * その場所へのリンク。
 * app.html の中からは「#…」だけにする（?mihon などを付けたまま、頁を読み直さずに移る）。
 * ほかの頁（設計・入口）からは「app.html#…」。
 */
export function placeHref(p: Place, from: "app" | "other"): string {
  if (!p.hash) return "studio.html";
  return from === "app" ? p.hash : `app.html${p.hash}`;
}

/** app.html の画面（view）と、その中の場所（sub）から、いまの場所。途切れた技を組み立て直す頁（restore・rebuild）は「途切れた技」 */
export function placeOf(view: string, sub: string): PlaceId {
  if (view === "learn") return "learn";
  if (view === "waza") return /^(restore|rebuild)(\/|\?|$)/.test(sub) ? "restore" : "waza";
  return "ledger";
}
