// 工房ごとの帳面：工房によって決まり（爪の太さ・留め方など）はちがう。帳面を工房ごとに持ち、使う帳面を切り替える。
// いちばん初めの帳面（リポジトリの帳面とこのブラウザの帳面）は「main」。ほかの工房の帳面は、公開情報の目安から始める。
// 画面に依存しない。
import { GUIDES } from "./guides.js";
import { activeRules, addRule, type Ledger, type LedgerBasics, type SizeStep } from "./ledger.js";

export interface Workshop {
  id: string;
  name: string;
  ledger: Ledger;
  /** 見本の工房か（本当の工房の値ではない、と画面に書く） */
  sample?: boolean;
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

/**
 * 工房の標準の爪の太さ（大きな石で mm）を、爪の最低の太さの決まりの点にする。
 * 標準 ＝ 最低 × standardFactor なので、最低の上限 ＝ 太さ ÷ standardFactor。小さな石は公開の資料の線の細さのまま。
 * 最後の 2 点を同じ値にして、大きな石でも太くならないようにする
 */
export function prongBasicSteps(prongMm: number): SizeStep[] {
  const cap = Math.round((prongMm / GUIDES.prong.standardFactor) * 1000) / 1000;
  const pts = GUIDES.prong.minByStoneSize.map(([s, d]) => ({ upToMm: s as number, value: Math.min(d, cap) }));
  const last = pts[pts.length - 1];
  return [...pts, { upToMm: last.upToMm + 1, value: cap }];
}

/** 工房の標準の爪の太さを、帳面の決まりにする（前の爪の太さの決まりは置き換えて、履歴に残す） */
export function setProngBasic(ledger: Ledger, prongMm: number, date: string, note = "あとで直せます"): Ledger {
  return addRule(ledger, {
    title: "爪の太さ（工房のベーシック）",
    text: `この工房の標準の爪は、大きな石で ø ${prongMm.toFixed(2)} mm くらい（${note}）。小さな石は、公開の資料の目安の細さのまま`,
    reason: "爪の太さは、工房の雰囲気を大きく決める",
    param: "prong.minDiameterMm",
    bySize: prongBasicSteps(prongMm),
    bySizeLine: true,
    source: { kind: "provisional" },
    date,
  });
}

/** 帳面の決まりから、大きな石の標準の爪の太さ（mm）。爪の太さの決まりがなければ undefined（公開の資料の線のまま） */
export function prongBasicMm(ledger: Ledger): number | undefined {
  const r = activeRules(ledger).find((x) => x.param === "prong.minDiameterMm");
  const min = r?.bySize?.length ? r.bySize[r.bySize.length - 1].value : r?.value;
  return min === undefined ? undefined : Math.round(min * GUIDES.prong.standardFactor * 100) / 100;
}

/** 工房のベーシック（爪の形など）を書き換える */
export function setBasics(ledger: Ledger, basics: LedgerBasics): Ledger {
  return { ...ledger, basics: { ...ledger.basics, ...basics } };
}

/**
 * 見本の工房（工房 B）を足して、それを使う帳面にする。爪は細め（GUIDES.prong.sampleWorkshop）で尖り爪。
 * 太さが例のとおりになるよう「角が 3 つの石は角に 3 本で留まる」も入れる（入れないと、留まりが足りず太くなる）。すでにあれば、それを使うだけ
 */
export function addSampleWorkshop(ws: Workshops, seed: Ledger, date: string): Workshops {
  const had = ws.list.find((w) => w.sample);
  if (had) return setActive(ws, had.id);
  const o = GUIDES.prong.sampleWorkshop;
  const named = addWorkshop(ws, o.name, seed);
  const id = named.active;
  const w = named.list.find((x) => x.id === id)!;
  let ledger = setBasics(w.ledger, { prongTip: o.prongTip });
  ledger = setProngBasic(ledger, o.prongMm, date, "見本の例。あとで直せます");
  ledger = addRule(ledger, {
    title: "三角の石は角に 3 本（見本の例）",
    text: "角が 3 つの石は、角に 1 本ずつの爪 3 本で留まる、とみなす（見本の工房の例）",
    reason: "尖った角に爪を立てると、3 本でも石を押さえられる、という工房の判断の例",
    param: "hold.cornerSet",
    value: 1,
    source: { kind: "provisional" },
    date,
  });
  return { ...named, list: named.list.map((x) => (x.id === id ? { ...x, ledger, sample: true } : x)) };
}

export function setActive(ws: Workshops, id: string): Workshops {
  return id === MAIN || ws.list.some((w) => w.id === id) ? { ...ws, active: id } : ws;
}

export function removeWorkshop(ws: Workshops, id: string): Workshops {
  const list = ws.list.filter((w) => w.id !== id);
  return { active: ws.active === id ? MAIN : ws.active, list };
}

/** 工房の帳面の名前を変える（帳面の呼び名 owner も同じに）。空の名前では変えない */
export function renameWorkshop(ws: Workshops, id: string, name: string): Workshops {
  const clean = name.trim();
  if (!clean) return ws;
  return { ...ws, list: ws.list.map((w) => (w.id === id ? { ...w, name: clean, ledger: { ...w.ledger, owner: clean } } : w)) };
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
