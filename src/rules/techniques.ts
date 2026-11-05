// ほかの技の帳面：覆輪留め・ミル打ち・槌目・鏨彫り（毛彫り）・布目象嵌・木目金。
// 指輪の石留めと同じしくみ（帳面に残す → まだ決まっていない所を職人に聞く）で使う。
// 決まりは公開の資料からだけ入れる（ledger/techniques.json。調べは docs/RESEARCH-rules2.md と research/process/*.md）。
// 資料に数字がない所・資料が食いちがう所は、決まりを作らず「職人に聞く問い」（open）にする。画面に依存しない。
import data from "../../ledger/techniques.json";
import type { Ledger, Rule } from "./ledger.js";

export type TechId = "bezel" | "milgrain" | "tsuchime" | "kebori" | "nunome" | "mokume";

/** 職人に言葉で聞く問い（資料にない・食いちがう所） */
export interface OpenQuestion {
  id: string;
  title: string;
  question: string;
  why: string;
  reason: string;
}

export interface TechInfo {
  id: TechId;
  /** 技の名前 */
  name: string;
  /** 札の印（漢字 1 字） */
  mark: string;
  /** 一行の説明 */
  lead: string;
  rules: Rule<string>[];
  open: OpenQuestion[];
}

/** 技を並べる順 */
export const TECH_IDS: TechId[] = ["bezel", "milgrain", "tsuchime", "kebori", "nunome", "mokume"];

export const TECHS = Object.fromEntries(
  TECH_IDS.map((id) => {
    const t = (data as Record<string, Omit<TechInfo, "id">>)[id];
    return [id, { ...t, id }];
  }),
) as Record<TechId, TechInfo>;

export function isTechId(s: string): s is TechId {
  return (TECH_IDS as string[]).includes(s);
}

/** 出発点の帳面（資料から入れた決まり） */
export function seedTechLedger(id: TechId): Ledger<string> {
  const t = TECHS[id];
  return { craft: t.name, technique: id, rules: structuredClone(t.rules) };
}

/** このブラウザに残した帳面に、まだ入っていない資料の決まりを後ろに足す（指輪の帳面と同じ考え方） */
export function parseTechLedger(id: TechId, raw: string | null): Ledger<string> {
  const seed = seedTechLedger(id);
  try {
    if (raw) {
      const l = JSON.parse(raw) as Ledger<string>;
      if (Array.isArray(l.rules)) {
        const have = new Set(l.rules.map((r) => r.id));
        // 職人が消した決まりは、読み直しても足し直さない
        const removed = new Set(l.removed ?? []);
        return { ...seed, ...l, technique: id, rules: [...l.rules, ...seed.rules.filter((r) => !have.has(r.id) && !removed.has(r.id))] };
      }
    }
  } catch {
    // 読めなければはじめの帳面から
  }
  return seed;
}

/** Claude に渡す、技の帳面の文 */
export function techLedgerText(l: Ledger<string>): string {
  const replaced = new Set(l.rules.flatMap((r) => (r.replaces ? [r.replaces] : [])));
  return l.rules
    .filter((r) => !replaced.has(r.id))
    .map((r) => `- [${r.id}] ${r.title}：${r.text}（理由：${r.reason}${r.quote ? `／言葉：「${r.quote}」` : ""}／出どころ：${r.source.kind === "craftsman" ? `職人：${r.source.name}` : r.source.kind === "public" ? `資料：${r.source.title}` : "仮"}${r.unverified ? "・未確認" : ""}）`)
    .join("\n");
}
