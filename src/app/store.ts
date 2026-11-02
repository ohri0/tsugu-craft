// このブラウザに残すもの：目安帳・職人への質問・合言葉・職人の名前。
// 目安帳と質問の置き場所は、前の画面（src/ui/）と同じにする（前に残したものがそのまま使える）。
import { loadLedger } from "../ui/ledger-ui";
import { loadTeacherQueue, TEACHER_QUEUE_STORE } from "../ui/teach-ui";
import type { Ledger } from "../rules/ledger";
import type { TeacherQueue } from "../rules/teacher-queue";

const LEDGER_STORE = "tsugu.ledger.v1";
const PASS_STORE = "tsugu.password.v1";
const SEEN_STORE = "tsugu.introSeen.v1";

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
let queue: TeacherQueue = loadTeacherQueue();

export const store = {
  ledger: () => ledger,
  setLedger(l: Ledger) {
    ledger = l;
    put(LEDGER_STORE, JSON.stringify(l));
    changed();
  },
  queue: () => queue,
  setQueue(q: TeacherQueue) {
    queue = q;
    put(TEACHER_QUEUE_STORE, JSON.stringify(q));
    changed();
  },
  password: () => get(PASS_STORE),
  setPassword: (p: string) => put(PASS_STORE, p),
  introSeen: () => get(SEEN_STORE) === "1",
  setIntroSeen: () => put(SEEN_STORE, "1"),
};

/** 今日の日付（YYYY-MM-DD） */
export const today = () => new Date().toLocaleDateString("sv-SE");

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
