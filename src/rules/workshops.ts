// 工房ごとの帳面：工房によって決まり（爪の太さ・留め方など）はちがう。帳面を工房ごとに持ち、使う帳面を切り替える。
// いちばん初めの帳面（リポジトリの帳面とこのブラウザの帳面）は「main」。ほかの工房の帳面は、公開情報の目安から始める。
// 画面に依存しない。
import type { Ledger } from "./ledger.js";

export interface Workshop {
  id: string;
  name: string;
  ledger: Ledger;
}

export interface Workshops {
  /** 使っている帳面の id（"main" ＝ はじめの帳面） */
  active: string;
  list: Workshop[];
}

export const MAIN = "main";
export const emptyWorkshops = (): Workshops => ({ active: MAIN, list: [] });

/** 新しい工房の帳面を足して、それを使う帳面にする。決まりは公開情報の目安（seed）から始める */
export function addWorkshop(ws: Workshops, name: string, seed: Ledger): Workshops {
  const clean = name.trim() || "新しい工房";
  let id = `ws-${Date.now().toString(36)}`;
  while (ws.list.some((w) => w.id === id)) id += "x";
  return { active: id, list: [...ws.list, { id, name: clean, ledger: { ...structuredClone(seed), owner: clean } }] };
}

export function setActive(ws: Workshops, id: string): Workshops {
  return id === MAIN || ws.list.some((w) => w.id === id) ? { ...ws, active: id } : ws;
}

export function removeWorkshop(ws: Workshops, id: string): Workshops {
  const list = ws.list.filter((w) => w.id !== id);
  return { active: ws.active === id ? MAIN : ws.active, list };
}

/** 使っている帳面（main なら mainLedger） */
export function activeLedger(ws: Workshops, mainLedger: Ledger): Ledger {
  return ws.active === MAIN ? mainLedger : (ws.list.find((w) => w.id === ws.active)?.ledger ?? mainLedger);
}

/** 工房の帳面を書き換える（main は呼ぶ側で） */
export function putLedger(ws: Workshops, id: string, ledger: Ledger): Workshops {
  return { ...ws, list: ws.list.map((w) => (w.id === id ? { ...w, ledger } : w)) };
}

export function parseWorkshops(raw: string | null): Workshops {
  try {
    const v = raw ? (JSON.parse(raw) as Workshops) : null;
    if (v && Array.isArray(v.list) && typeof v.active === "string") return setActive({ active: MAIN, list: v.list.filter((w) => w && w.id && w.ledger && Array.isArray(w.ledger.rules)) }, v.active);
  } catch {
    // 読めなければ、はじめの帳面だけ
  }
  return emptyWorkshops();
}
