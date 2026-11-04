// 技の頁の「作り方」：工程を順に、道具・失敗しやすい所・出どころつきで並べる（ledger/technique-howto.json）。
// 指輪の石留めと、六つの技（覆輪留め・ミル打ち・槌目・鏨彫り・布目象嵌・木目金）で同じ形。画面に依存しない。
// 数字は出どころのある工程にだけ書く（出どころのない数字は書かない。調べは docs/RESEARCH-rules2.md）。
import data from "../../ledger/technique-howto.json";
import type { TechId } from "./techniques.js";

export type HowtoId = "ring" | TechId;

export interface HowtoSource {
  label: string;
  /** 公開の頁。職人の言葉（craftsman）には無い */
  url?: string;
  /** この頁（言葉）が何を言っているか */
  confirms?: string;
  /** 店・ブログ・会社・掲示板など、弱い出どころ（二つ目の出どころとしてだけ使う） */
  weak?: boolean;
  /** 職人が自分の言葉で確かめたこと */
  craftsman?: boolean;
  /** 原文を開いて確かめていない */
  unverified?: boolean;
}

export interface HowtoStep {
  title: string;
  /** 何をするか（材料・数字・順） */
  text: string;
  /** 使う道具の名前 */
  tools?: string;
  /** 失敗しやすい所と、さけ方 */
  fail?: string;
  sources: HowtoSource[];
  /** この工程の中身が、原文で確かめられていない（数字が弱い出どころだけにある時も） */
  unverified?: boolean;
  /** 職人がこの工程を読んで確かめた（だれが・いつ） */
  checkedBy?: string;
}

export interface Howto {
  steps: HowtoStep[];
  /** 指輪の石留めだけ（ほかの技は ledger/techniques.json の名前と説明を使う） */
  name?: string;
  mark?: string;
  lead?: string;
}

export const HOWTO = data as Record<HowtoId, Howto>;

export function howtoFor(id: HowtoId): Howto {
  return HOWTO[id];
}

/** Claude に渡す作り方の文（学ぶ・聞き取りで、この作り方にもとづいて話すため） */
export function howtoText(id: HowtoId): string {
  return HOWTO[id].steps
    .map((s, i) => `${i + 1}. ${s.title}：${s.text}${s.fail ? `（失敗しやすい所：${s.fail}）` : ""}（出どころ：${s.sources.map((x) => x.label + (x.unverified ? "・未確認" : "")).join("／")}）${s.checkedBy ? `（${s.checkedBy} が確かめた）` : ""}`)
    .join("\n");
}
