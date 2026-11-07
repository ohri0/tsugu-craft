// 設計の「生成」で Claude に渡す道具と、戻す・進むの覚え。画面には依存しない（テストで確かめる）。
import { TOOLS, type ChooseStoneInput, type ChooseStoneResult, type ToolHost } from "../claude/tools";
import type { ClaudeTool } from "../claude/wire";
import type { RingSession, RingState } from "./session";

/**
 * 生成で渡す道具。石を選ぶ道具は「石もおまかせ」のときだけ。
 * 号は人が欄で決めたので、腕の道具から号の項目を外す
 */
export function generationTools(stoneFree: boolean): ClaudeTool[] {
  const names = ["set_setting", "set_shank", "check", "look", ...(stoneFree ? ["choose_stone"] : [])];
  return TOOLS.filter((t) => names.includes(t.name)).map((t) => {
    if (t.name !== "set_shank") return t;
    const schema = t.input_schema as { properties: Record<string, unknown> };
    const { gou: _gou, ...properties } = schema.properties;
    return { ...t, input_schema: { ...t.input_schema, properties } } as ClaudeTool;
  });
}

/**
 * 生成の受け口。石を選び直すと設計の場（RingSession）が新しくなるので、いつも今の場へ渡す。
 * chooseStone を渡さなければ（今の石を使う）、石を変える道具はどこにもつながらない。号は決めた号から変えさせない
 */
export function makeHost(current: () => RingSession, opts: { gou: number; chooseStone?: (input: ChooseStoneInput) => Promise<ChooseStoneResult> }): ToolHost<RingState> {
  return {
    setSetting: (input) => current().setSetting(input),
    setShank: (input) => {
      if (input.gou !== undefined && input.gou !== opts.gou) throw new Error(`号は ${opts.gou} 号と決まっているので、変えられません`);
      return current().setShank(input);
    },
    check: () => current().check(),
    look: (input) => current().look(input),
    snapshot: () => current().snapshot(),
    restore: (s) => current().restore(s),
    ...(opts.chooseStone ? { chooseStone: opts.chooseStone } : {}),
  };
}

// ---- 石の選び方：今の石を使う / 石もおまかせ / 石なし（地金だけの指輪） ----

export type StonePick = "keep" | "free" | "none";

/**
 * 希望の言葉が、はっきり石のない指輪を求めているか。「石もおまかせ」でこう書かれたら、地金だけの指輪にする。
 * 迷う言い方（結婚指輪・シンプル など）は石があることもあるので、ここでは拾わない（Claude にまかせる）
 */
export function wantsNoStone(wish: string): boolean {
  const t = wish.normalize("NFKC").toLowerCase();
  if (/石\s*(?:なし|無し|ナシ)(?!\s*(?:じゃ|では|で\s*は)(?:なく|ない))/.test(t)) return true;
  if (/石(?:を|は)?\s*(?:入れ|いれ|つけ|付け|付|使わ|のせ|載せ)(?:ない|ず|なくて)/.test(t)) return true;
  if (/石(?:は|も)?\s*(?:いら|要ら)(?:ない|ず)/.test(t)) return true;
  if (/地金\s*(?:だけ|のみ)/.test(t)) return true;
  return /\b(?:no|without(?: a| any)?) (?:stones?|gems?|gemstones?)\b|\bplain band\b/.test(t);
}

/** 生成の進み先：石なしを選んだとき、または石もおまかせで石なしを頼まれたときは、地金だけの指輪へ */
export function generationRoute(pick: StonePick, wish: string): "solitaire" | "band" {
  if (pick === "none") return "band";
  if (pick === "free" && wantsNoStone(wish)) return "band";
  return "solitaire";
}

/** 地金のみの指輪の案の号を、人が欄で決めた号にする */
export function keepGou<D extends { gou: number }>(draft: D, gou: number): D {
  return { ...draft, gou };
}

// ---- 戻す・進む ----

/** 覚えておく数（古い物から忘れる） */
export const HISTORY_MAX = 100;

/**
 * 設計の覚え。1 本の線の上を、戻す・進むで動く。戻した所から変えると、その先は消える。
 * 「生成の前に戻す」も同じ線の上を飛ぶだけなので、生成のあとに手で直した所も、もう一度押せば戻る
 */
export class DesignHistory<S> {
  private line: { snap: S; key: string }[] = [];
  private at = -1;
  /** before：生成の前の場所。back：「生成のあとに戻す」で帰る場所 */
  private gen: { before: number; back: number } | null = null;

  constructor(private max = HISTORY_MAX) {}

  get canUndo(): boolean {
    return this.at > 0;
  }
  get canRedo(): boolean {
    return this.at < this.line.length - 1;
  }

  /** 今の状態を覚える。前と同じなら何もしない。変わったら true */
  commit(snap: S, key: string): boolean {
    if (this.at >= 0 && this.line[this.at].key === key) return false;
    // 生成の前より前（か、ちょうど前）から変えると、生成のあとは線から消える
    if (this.gen && this.at <= this.gen.before) this.gen = null;
    this.line.length = this.at + 1;
    this.line.push({ snap, key });
    this.at++;
    if (this.gen) this.gen.back = Math.min(this.gen.back, this.at);
    if (this.line.length > this.max) {
      this.line.shift();
      this.at--;
      if (this.gen) {
        this.gen.before--;
        this.gen.back--;
        if (this.gen.before < 0) this.gen = null;
      }
    }
    return true;
  }

  /** 今の場所の覚えを書き直す（戻したあと、組み直した状態に合わせる。先の覚えは消さない） */
  replaceCurrent(snap: S, key: string): void {
    if (this.at >= 0) this.line[this.at] = { snap, key };
  }

  undo(): S | null {
    if (!this.canUndo) return null;
    return this.line[--this.at].snap;
  }

  redo(): S | null {
    if (!this.canRedo) return null;
    return this.line[++this.at].snap;
  }

  /** 生成を始める前に呼ぶ。今の場所を返す */
  mark(): number {
    return this.at;
  }

  /** 生成が終わったら呼ぶ。形が変わっていれば、生成の前と後を覚える（変わっていなければ、前の生成の覚えのまま） */
  endGeneration(mark: number): void {
    if (this.at > mark) this.gen = { before: mark, back: this.at };
  }

  /** 「生成の前に戻す」のボタンの言葉。出さないときは null */
  get generationLabel(): string | null {
    if (!this.gen) return null;
    return this.at > this.gen.before ? "生成の前に戻す" : "生成のあとに戻す";
  }

  /** 生成の前へ、または生成のあとへ飛ぶ */
  toggleGeneration(): S | null {
    if (!this.gen) return null;
    if (this.at > this.gen.before) {
      this.gen.back = this.at;
      this.at = this.gen.before;
    } else this.at = this.gen.back;
    return this.line[this.at].snap;
  }
}

// ---- キー ----

/** ⌘Z・Ctrl+Z ＝ 戻す、⇧⌘Z・Ctrl+Shift+Z・Ctrl+Y ＝ 進む。ほかは null（かなの入力でも効くように、キーの場所でも見る） */
export function undoKey(e: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; isComposing?: boolean }): "undo" | "redo" | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing) return null;
  if (e.key.toLowerCase() === "z" || e.code === "KeyZ") return e.shiftKey ? "redo" : "undo";
  if (e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase() === "y" || e.code === "KeyY")) return "redo";
  return null;
}

const NOT_TEXT = new Set(["range", "radio", "checkbox", "button", "submit", "reset", "color", "file"]);

/** 字を打つ欄か（つまみや選ぶ欄は、字の取り消しがないので、ちがう） */
export function isTextField(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && !NOT_TEXT.has((el.type ?? "text").toLowerCase());
}
