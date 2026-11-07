// 見本：合言葉も、職人の本当の言葉もなしで、流れを最後まで見られる出し方（app.html?mihon）。
// 入れる言葉は作り話の例。画面にいつも「作り話」と出す。
// 手本と学ぶ人の動画は、作者（職人）が撮り分けた本物の手元（ヤスリがけ）の「いい例」と「よくない例」（2026-11-07。scripts/make-mihon.ts --pair）。
// 見本の間は、このブラウザの帳面に触らない（残す先をメモリーに替える。閉じれば消える）。Claude は呼ばない。
//
// ?flow … 撮影（?rec）でも新しい流れの画面を出す（本当の帳面のまま）
// ?rec&mihon … 撮影用の見本。決まった順に見せる（src/app/tour.ts）
import { filming } from "./confirm";
import type { Gap } from "../rules/gaps";

const q = () => new URLSearchParams(location.search);

export function isMihon(): boolean {
  return q().has("mihon");
}

/** 流れの画面を出すか。前の動画の撮影（?rec・?nointro だけ）は、前の絵のまま */
export function flowUI(): boolean {
  return !filming() || q().has("flow") || isMihon();
}

/** 撮影用の見本か */
export function isTour(): boolean {
  return isMihon() && q().has("rec");
}

/** 見本の答える人。本当の職人の名前にしない */
export const MIHON_NAME = "見本の人";

/** 見本の答えの頭につける印（帳面のどこに出ても作り話と分かるように。言葉そのものに入れる） */
const MARK = "（作り話の例）";

const KEBORI_ANSWERS: Record<string, string> = {
  "kebori:line-depth": `${MARK}幅は図案で変える。深さは、彫ったあと裏に響かない所まで。`,
  "kebori:edge-angle": `${MARK}角度の数字より、刃先が地金に止まるかを見て研ぐ。`,
};

/** 見本の答え（数字を作らない。出典のない数字は見本でも書かない） */
export function mihonAnswer(gap: Gap): string {
  if (gap.kind === "asked") return `${MARK}浅い線なら、面ごと磨いて消してから彫り直す。`;
  return KEBORI_ANSWERS[gap.id] ?? `${MARK}ここは材料と図案を見て、そのたびに決める。`;
}

/** 見本で「帳面にない質問」の例 */
export const MIHON_UNKNOWN = "失敗した線は消せますか？";

export interface MihonClip {
  record: string;
  webm: string;
  mp4: string;
}

/** 見本の動画（職人の本物の手元・ヤスリがけ。手本＝いい例、学ぶ人＝よくない例。どちらも職人が撮った。scripts/make-mihon.ts --pair で作った） */
export const MIHON_CLIPS: { master: MihonClip; learner: MihonClip } = {
  master: { record: "mihon/master.json", webm: "mihon/master.webm", mp4: "mihon/master.mp4" },
  learner: { record: "mihon/learner.json", webm: "mihon/learner.webm", mp4: "mihon/learner.mp4" },
};

/** このブラウザで再生できる形を選ぶ */
export function clipUrl(c: MihonClip): string {
  const v = document.createElement("video");
  return v.canPlayType('video/mp4; codecs="avc1.42E01E"') ? c.mp4 : c.webm;
}

/** 見本の間だけ、残す先をメモリーに替える。ほかのどの部品よりも先に動く必要がある（main.ts の最初に読み込む） */
export function installMemoryStorage(): void {
  const data = new Map<string, string>();
  const mem: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
  Object.defineProperty(window, "localStorage", { value: mem, configurable: true });
}

if (typeof location !== "undefined" && isMihon()) installMemoryStorage();
