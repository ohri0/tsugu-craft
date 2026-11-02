// 「組み立て直す」の資料：手がかり（clues.md）と答え（answer.md）を読む所。
// 名前を隠した伝統の技について、Claude には手がかりだけを渡して作り方を組み立て直させ、
// 別の呼び出しで答えと照らし合わせる。ここは画面に依存しない、文字を読むだけの関数。
import mokumeAnswerMd from "../../research/mokume/answer.md?raw";
import mokumeCluesMd from "../../research/mokume/clues.md?raw";

/** 手がかり 1 つ（C1 など） */
export interface Clue {
  id: string;
  title: string;
  /** 本文（出典の行は除く） */
  text: string;
  /** どの見出し（## ）の下にあったか */
  section: string;
  /** 出典の行にある URL。技の名前が入っていることがあるので、仮説を立てる段には渡さない */
  sources: string[];
}

/** 答えの 1 つ。A＝伝統の工程、M＝今のやり方でちがうところ、H＝歴史 */
export interface AnswerItem {
  id: string;
  title: string;
  text: string;
  kind: "step" | "modern" | "history";
}

/** 手がかりの渡し方。observe＝品物と金属だけ、all＝すべて */
export interface Condition {
  id: "observe" | "all";
  label: string;
  note: string;
  sections: string[] | "all";
}

export interface Technique {
  id: string;
  /** 技の本当の名前（答え合わせのあとに見せる） */
  name: string;
  reading: string;
  /** 答え合わせの前に見せる呼び名 */
  hiddenName: string;
  status: "ready" | "soon";
  /** 答え合わせの前に見せてもよい、短い説明（作り方は書かない） */
  summary: string;
  clues: Clue[];
  answer: AnswerItem[];
  conditions: Condition[];
}

interface Block {
  id: string;
  title: string;
  section: string;
  lines: string[];
}

/** 「**C1 表面の模様**」や「**M1 締めつけ**：本文…」の行 */
const HEAD = /^\*\*([A-Z]\d+)\s+(.+?)\*\*\s*(?:[：:]\s*(.*))?$/;
const SOURCE_LINE = /^出典[：:]/;
const URL = /https?:\/\/[^\s）)／]+/g;

/** 見出しの行から次の見出しの行（または ## の見出し）までを 1 つのかたまりにする */
function readBlocks(md: string, prefixes: string): Block[] {
  const blocks: Block[] = [];
  let section = "";
  let current: Block | null = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^##\s/.test(line)) {
      section = line.replace(/^##\s+/, "").trim();
      current = null;
      continue;
    }
    const m = HEAD.exec(line);
    if (m && prefixes.includes(m[1][0])) {
      current = { id: m[1], title: m[2].trim(), section, lines: [] };
      if (m[3]?.trim()) current.lines.push(m[3].trim());
      blocks.push(current);
      continue;
    }
    if (current && line) current.lines.push(line);
  }
  return blocks;
}

/** 太字の印（**）を取る。中身の言葉は残す */
function plain(s: string): string {
  return s.replace(/\*\*/g, "");
}

function bodyText(lines: string[]): string {
  return plain(lines.filter((l) => !SOURCE_LINE.test(l)).join("\n")).trim();
}

/** clues.md の手がかり（C1〜）を読む */
export function parseClues(md: string): Clue[] {
  return readBlocks(md, "C").map((b) => ({
    id: b.id,
    title: plain(b.title),
    text: bodyText(b.lines),
    section: b.section,
    sources: b.lines.filter((l) => SOURCE_LINE.test(l)).flatMap((l) => l.match(URL) ?? []),
  }));
}

const KIND: Record<string, AnswerItem["kind"]> = { A: "step", M: "modern", H: "history" };

/** answer.md の答え（A＝工程、M＝今のやり方、H＝歴史）を読む */
export function parseAnswer(md: string): AnswerItem[] {
  return readBlocks(md, "AMH").map((b) => ({
    id: b.id,
    title: plain(b.title),
    text: bodyText(b.lines),
    kind: KIND[b.id[0]],
  }));
}

/** その条件で渡す手がかり */
export function cluesFor(t: Technique, c: Condition): Clue[] {
  if (c.sections === "all") return [...t.clues];
  const keep = c.sections;
  return t.clues.filter((clue) => keep.includes(clue.section));
}

/**
 * 「品物だけ」の条件で渡す見出し。残っている品物そのものと、使われている金属だけ。
 * 時代と土地・道具と作業場・物理の事実・色をつける習わしは渡さないので、モデルはもっと推し量ることになる。
 */
const OBSERVE_SECTIONS = ["品物の見た目", "使われている金属"];

function conditions(observeSections: string[]): Condition[] {
  return [
    {
      id: "observe",
      label: "品物だけから",
      note: "残っている品物の見た目と、使われている金属の手がかりだけを渡す。時代・道具・物理の手がかりは渡さないので、もっと推し量ることになる。",
      sections: observeSections,
    },
    {
      id: "all",
      label: "すべての手がかりから",
      note: "時代と土地、そのころの道具、色をつける習わし、一般の物理の事実も含めて、すべての手がかりを渡す。",
      sections: "all",
    },
  ];
}

export const TECHNIQUES: Technique[] = [
  {
    id: "mokume",
    name: "木目金",
    reading: "もくめがね",
    hiddenName: "名前を隠した技 A",
    status: "ready",
    summary: "刀の金具などに残る、木の板の目のような模様の金属の品。その作り方を、手がかりから組み立て直す。",
    clues: parseClues(mokumeCluesMd),
    answer: parseAnswer(mokumeAnswerMd),
    conditions: conditions(OBSERVE_SECTIONS),
  },
];
