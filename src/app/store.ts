// このブラウザに残すもの：目安帳・職人への質問・合言葉・職人の名前。
// 目安帳と質問の置き場所は、前の画面（src/ui/）と同じにする（前に残したものがそのまま使える）。
import { loadLedger, MAIN_NAME_STORE } from "../ui/ledger-ui";
import { parseTechLedger, type TechId } from "../rules/techniques";
import { loadTeacherQueue, TEACHER_QUEUE_STORE } from "../ui/teach-ui";
import type { Ledger } from "../rules/ledger";
import { activeLedger, MAIN, parseWorkshops, putLedger, type Workshops } from "../rules/workshops";
import type { TeacherQueue } from "../rules/teacher-queue";

const LEDGER_STORE = "tsugu.ledger.v1";
const WORKSHOP_STORE = "tsugu.workshops.v1";
const PASS_STORE = "tsugu.password.v1";
const SEEN_STORE = "tsugu.introSeen.v1";
const FLOW_STORE = "tsugu.flow.v1";
const LAST_TECH_STORE = "tsugu.lastTech.v1";

function put(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 残せなくても画面は動く
  }
}
function get(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** 目安帳・質問が変わったら知らせる（ほかの画面の数字を直すため） */
export function onStoreChange(fn: Listener): void {
  listeners.add(fn);
}
const changed = () => listeners.forEach((fn) => fn());

let ledger: Ledger = loadLedger();
let workshops: Workshops = parseWorkshops(get(WORKSHOP_STORE) || null);
let queue: TeacherQueue = loadTeacherQueue();
const techKey = (id: TechId) => `tsugu.ledger.tech.${id}.v1`;
const techs = new Map<TechId, Ledger<string>>();

/** 技ごとに、学ぶ人が聞いた回数・手を比べた回数（流れの進み具合に使う） */
type FlowKind = "asked" | "compared";
function readFlow(): Partial<Record<FlowKind, Record<string, number>>> {
  try {
    const v = JSON.parse(get(FLOW_STORE) || "{}") as unknown;
    return v && typeof v === "object" ? (v as Partial<Record<FlowKind, Record<string, number>>>) : {};
  } catch {
    return {};
  }
}

/** はじめの帳面の、工房の名前の既定（リポジトリの帳面に名前がないとき） */
export const DEFAULT_WORKSHOP = "石川工房";

export const store = {
  /** 使っている帳面（工房ごとの帳面を選んでいれば、その帳面） */
  ledger: () => activeLedger(workshops, ledger),
  /** はじめの帳面（工房の帳面。名前は mainName） */
  mainLedger: () => ledger,
  /** はじめの帳面の工房の名前（帳面・学ぶ・技・スタジオのどこでも、この名前） */
  mainName: () => ledger.owner?.trim() || DEFAULT_WORKSHOP,
  /** 工房の名前を変える（ここ 1 か所。帳面の画面から） */
  setMainName(name: string) {
    const clean = name.trim();
    if (!clean) return;
    ledger = { ...ledger, owner: clean };
    put(MAIN_NAME_STORE, clean);
    put(LEDGER_STORE, JSON.stringify(ledger));
    changed();
  },
  /** ほかの技の帳面（覆輪留め・ミル打ちなど） */
  techLedger(id: TechId): Ledger<string> {
    let l = techs.get(id);
    if (!l) {
      l = parseTechLedger(id, get(techKey(id)) || null);
      techs.set(id, l);
    }
    return l;
  },
  setTechLedger(id: TechId, l: Ledger<string>) {
    techs.set(id, l);
    put(techKey(id), JSON.stringify(l));
    changed();
  },
  setLedger(l: Ledger) {
    if (workshops.active === MAIN) {
      ledger = l;
      put(LEDGER_STORE, JSON.stringify(l));
    } else {
      workshops = putLedger(workshops, workshops.active, l);
      put(WORKSHOP_STORE, JSON.stringify(workshops));
    }
    changed();
  },
  workshops: () => workshops,
  setWorkshops(w: Workshops) {
    workshops = w;
    put(WORKSHOP_STORE, JSON.stringify(w));
    changed();
  },
  queue: () => queue,
  setQueue(q: TeacherQueue) {
    queue = q;
    put(TEACHER_QUEUE_STORE, JSON.stringify(q));
    changed();
  },
  flowCount: (kind: FlowKind, id: string): number => readFlow()[kind]?.[id] ?? 0,
  flowMark(kind: FlowKind, id: string) {
    const f = readFlow();
    f[kind] = { ...f[kind], [id]: (f[kind]?.[id] ?? 0) + 1 };
    put(FLOW_STORE, JSON.stringify(f));
    changed();
  },
  /** 手本など、帳面の外のものが変わったことを、ほかの画面に知らせる */
  touch: () => changed(),
  /** 学ぶで最後に選んだ技 */
  lastTech: () => get(LAST_TECH_STORE),
  setLastTech: (id: string) => put(LAST_TECH_STORE, id),
  password: () => get(PASS_STORE),
  setPassword: (p: string) => put(PASS_STORE, p),
  introSeen: () => get(SEEN_STORE) === "1",
  setIntroSeen: () => put(SEEN_STORE, "1"),
};

/** 今日の日付（YYYY-MM-DD） */
export const today = () => new Date().toLocaleDateString("sv-SE");

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
