// 人に見せる文を作る：作業の記録・まとめ・「まだできないこと」の札。
// 道具の入力の中身（英字の名前、輪郭の点の番号、決まりの印）を、そのまま人に見せない。画面に依存しない純粋な関数（テストで確かめる）。
// Claude への指示（prompt.ts）でも「人に見える文に書かない」と頼むが、Claude の文は思わぬ形でも届くので、ここでも直す。

/** 英字の名前 → ふつうの言葉 */
const NAMES: Record<string, string> = {
  prong: "爪留め",
  bezel: "覆輪",
  tension: "テンション",
  along: "縦向き",
  across: "横向き",
  low: "低め",
  standard: "標準",
  high: "高め",
  between: "腕の間に挟む",
  pt900: "プラチナ",
  k18yg: "18 金イエロー",
  k18wg: "18 金ホワイト",
  k18pg: "18 金ピンク",
  sv925: "シルバー",
  kouman: "甲丸",
  hirauchi: "平打ち",
  hangouman: "半甲丸",
  kaku: "角",
  maru: "丸線",
  section_curve: "断面の線",
  section: "断面",
  stations: "腕の場所ごとの形",
  at_deg: "場所の角度",
  relief: "腕の彫り",
  depth_mm: "彫りの深さ",
  sway_mm: "腕の流れ",
  width_mm: "幅",
  thickness_mm: "厚み",
  prong_mm: "爪の太さ",
  prong_count: "爪の本数",
  prong_positions: "爪の位置",
  v_corners: "角の V 字の爪",
  orientation: "向き",
  set_setting: "石座の道具",
  set_shank: "腕の道具",
  choose_stone: "石の道具",
  round: "ラウンド",
  oval: "オーバル",
  princess: "スクエア",
  emerald: "エメラルド",
  pear: "ペア",
  marquise: "マーキス",
  long_mm: "長辺",
};
const NAME_RE = new RegExp(`(?<![A-Za-z0-9_-])(${Object.keys(NAMES).join("|")})(?![A-Za-z0-9_-])`, "gi");

/** 決まりの印の形（例：v-prong-points、rule-prong-min-ishikawa、finger-gap） */
const RULE_ID = /\[([a-z0-9]+(?:-[a-z0-9]+)+)\]/gi;

/** 決まりの印 → 題 を引く所（目安帳の決まりの一覧） */
export type RuleTitles = ReadonlyMap<string, string>;

export function ruleTitles(rules: readonly { id: string; title: string }[]): RuleTitles {
  return new Map(rules.map((r) => [r.id, r.title]));
}

/**
 * 人に見せる文に直す：決まりの印は題に、英字の名前はふつうの言葉に、輪郭の点の番号は消す。
 * 「（67 番・218 番）」は丸ごと消し、文の中の番号は「決めた所」に言い換える
 */
export function plainWords(text: string, titles?: RuleTitles): string {
  let out = text.replace(/\*\*/g, "");
  // 決まりの印：題が分かれば題に。分からない印は「帳面の決まり」に
  out = out.replace(RULE_ID, (_m, id: string) => {
    const title = titles?.get(id);
    return title ? `「${title}」` : "帳面の決まり";
  });
  out = out.replace(/「帳面の決まり」/g, "帳面の決まり");
  // 輪郭の点の番号
  const NO = String.raw`\d+\s*番`;
  out = out.replace(new RegExp(String.raw`[（(]\s*(?:輪郭の点\s*)?${NO}(?:\s*[・、,と]\s*${NO})*\s*[）)]`, "g"), "");
  out = out.replace(new RegExp(String.raw`(?:輪郭の)?点\s*${NO}(?:\s*[・、,と]\s*${NO})*`, "g"), "決めた所");
  out = out.replace(new RegExp(`${NO}(?:\\s*[・、,と]\\s*${NO})*`, "g"), "決めた所");
  // 道具の名前をそのまま書いたとき
  out = out.replace(/(?<![A-Za-z0-9_-])look(?![A-Za-z0-9_-])/g, "絵").replace(/(?<![A-Za-z0-9_-])check(?![A-Za-z0-9_-])/g, "確かめ");
  out = out.replace(NAME_RE, (m) => NAMES[m.toLowerCase()] ?? m);
  // 「プラチナ（pt900）」のように添えた英字が言葉に直って、同じ言葉が並んだとき
  out = out.replace(/([^\s（）()、。・]+)[（(]\1[）)]/g, "$1");
  return out;
}

/** 日本語の字があるか（道具の合間のメモが英語だけで届いたときは、画面に出さない） */
export function hasJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

// ---- 爪の位置 ----

/** 石の輪郭の、言葉にするのに要る所（画面が持っている石から渡す） */
export interface StoneWords {
  /** 輪郭の点（mm） */
  outlineMm: readonly { x: number; y: number }[];
  /** 尖った角の点の番号 */
  corners: readonly number[];
}

/** 角に置いたとみなす、角からの点の数の割合（輪郭の点の数に対して。形を作るための決まりではなく、言葉のための目安） */
const NEAR_CORNER = 0.025;

/** 爪を置く点の番号を、ふつうの言葉に（例：両方の先と、両わきの辺 4 か所） */
export function prongPlaceWords(positions: readonly number[], stone?: StoneWords): string {
  if (!positions.length) return "自動";
  if (!stone?.outlineMm.length) return `石の縁の ${positions.length} か所`;
  const n = stone.outlineMm.length;
  const tol = Math.max(1, n * NEAR_CORNER);
  const dist = (a: number, b: number) => {
    const d = Math.abs(a - b) % n;
    return Math.min(d, n - d);
  };
  const isCorner = (p: number) => stone.corners.some((c) => dist(c, p) <= tol);
  const hit = new Set(stone.corners.filter((c) => positions.some((p) => dist(c, p) <= tol)));
  const others = positions.filter((p) => !isCorner(p));
  const C = stone.corners.length;
  const parts: string[] = [];
  if (hit.size) {
    if (C === 2 && hit.size === 2) parts.push("両方の先");
    else if (C === 1) parts.push("尖った先");
    else if (hit.size === C) parts.push(`${C} つの角すべて`);
    else parts.push(`尖った角 ${hit.size} か所`);
  }
  if (others.length) {
    if (C === 2) {
      // 2 つの先を結ぶ線の、どちら側か
      const a = stone.outlineMm[stone.corners[0] % n];
      const b = stone.outlineMm[stone.corners[1] % n];
      const sides = new Set(
        others.map((p) => {
          const q = stone.outlineMm[((p % n) + n) % n];
          return Math.sign((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x));
        }),
      );
      parts.push(`${sides.size > 1 ? "両わきの辺" : "片側の辺"} ${others.length} か所`);
    } else parts.push(C === 0 ? `縁の ${others.length} か所` : `ほかの縁 ${others.length} か所`);
  }
  return parts.join("と、");
}

// ---- 作業の記録の 1 行 ----

const STYLE: Record<string, string> = { prong: "爪留め", bezel: "覆輪", tension: "テンション" };
const HEIGHT: Record<string, string> = { low: "低め", standard: "標準", high: "高め" };
const ORIENT: Record<string, string> = { along: "縦向き", across: "横向き" };
const JOIN: Record<string, string> = { on: "腕の上にのせる", between: "腕の間に挟む" };
const METAL: Record<string, string> = { pt900: "プラチナ", k18yg: "18 金イエロー", k18wg: "18 金ホワイト", k18pg: "18 金ピンク", sv925: "シルバー" };
const SECTION: Record<string, string> = { kouman: "甲丸", hirauchi: "平打ち", hangouman: "半甲丸", kaku: "角", maru: "丸線", free: "自由な線" };
const VIEW: Record<string, string> = { top: "上から", side: "横から", front: "正面から", angle: "斜めから" };
const LAYOUT: Record<string, string> = { solo: "一粒", trio: "三石", row: "横一列" };
const RELIEF: Record<string, string> = { arch: "尖ったアーチ", diamond: "菱の格子", wave: "波の線", beads: "粒", lines: "横の筋", leaf: "葉とつる" };
const TOOL_WORD: Record<string, string> = { set_setting: "石座", set_shank: "腕", set_stones: "石の並び", choose_stone: "石", check: "確かめ", look: "見る" };

const num = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 100) / 100) : String(v));

/** 腕の場所の言葉（いちばん上からの角度で） */
function placeOf(atDeg: number): string {
  if (atDeg >= 175) return "いちばん下";
  if (atDeg >= 120) return "下の方";
  if (atDeg < 45) return "石座のそば";
  return "肩";
}

function stationWords(list: unknown): string {
  if (!Array.isArray(list)) return "";
  if (!list.length) return "どこも同じ形に戻す";
  return list
    .map((raw) => {
      const st = raw as { at_deg: number; width_mm: number; thickness_mm: number; section?: string; section_curve?: unknown; sway_mm?: number };
      const extra = [st.section_curve ? "自由な線" : st.section ? (SECTION[st.section] ?? "") : "", st.sway_mm ? `${num(Math.abs(st.sway_mm))} mm 流す` : ""].filter(Boolean);
      return `${placeOf(st.at_deg)} 幅 ${num(st.width_mm)} × 厚み ${num(st.thickness_mm)} mm${extra.length ? `（${extra.join("・")}）` : ""}`;
    })
    .join("、");
}

function partOf(key: string, v: unknown, stone?: StoneWords): string | null {
  const s = String(v);
  switch (key) {
    case "reason":
      return null;
    case "style":
      return `留め方 ${STYLE[s] ?? s}`;
    case "prong_count":
      return v === 0 ? "爪の本数 自動" : `爪 ${s} 本`;
    case "prong_mm":
      return `爪の太さ ${num(v)} mm`;
    case "prong_positions":
      return `爪の位置 ${prongPlaceWords(v as number[], stone)}`;
    case "v_corners":
      return `角の V 字の爪 ${v ? "あり" : "なし"}`;
    case "height":
      return `高さ ${HEIGHT[s] ?? s}`;
    case "orientation":
      return `向き ${ORIENT[s] ?? s}`;
    case "join":
      return `腕への付け方 ${JOIN[s] ?? s}`;
    case "section":
      return `断面 ${SECTION[s] ?? s}`;
    case "section_curve":
    case "section_points":
      return "断面 自由な線";
    case "stations":
      return `場所ごとの形：${stationWords(v)}`;
    case "relief": {
      const r = v as { pattern: string; count?: number; depth_mm?: number; columns?: number };
      if (r.pattern === "none") return "彫り なし";
      const extra = [r.count ? `片側 ${r.count} つ` : "", r.columns && r.columns > 1 ? `${r.columns} 列` : "", r.depth_mm ? `深さ ${num(r.depth_mm)} mm` : ""].filter(Boolean);
      return `彫り ${RELIEF[r.pattern] ?? r.pattern}${extra.length ? `（${extra.join("・")}）` : ""}`;
    }
    case "width_mm":
      return `幅 ${num(v)} mm`;
    case "thickness_mm":
      return `厚み ${num(v)} mm`;
    case "gou":
      return `${s} 号`;
    case "metal":
      return `地金 ${METAL[s] ?? s}`;
    case "layout":
      return `並べ方 ${LAYOUT[s] ?? s}`;
    case "count":
      return `石 ${s} 個`;
    case "side_mm":
      return `両脇の石 ${num(v)} mm`;
    case "side_style":
      return `両脇の留め方 ${STYLE[s] ?? s}`;
    case "spread_mm":
      return `間を ${num(v)} mm 広げる`;
    case "shape":
      return NAMES[s] ?? s;
    case "long_mm":
      return `長辺 ${num(v)} mm`;
    default:
      return null;
  }
}

export interface ToolLogLine {
  text: string;
  /** 画面の印：ok＝問題なし、ng＝問題あり・やり直し */
  mark?: "ok" | "ng";
}

/** 道具の呼び出し 1 つを、作業の記録の 1 行に */
export function toolLogLine(e: { tool: string; input: unknown; result?: unknown; ok: boolean; error?: string; reason?: string }, ctx: { stone?: StoneWords; titles?: RuleTitles } = {}): ToolLogLine {
  const input = (e.input ?? {}) as Record<string, unknown>;
  const word = TOOL_WORD[e.tool] ?? "道具";
  // 道具が断った・動かなかったとき（確かめが通ったように見せない）
  if (!e.ok) return { text: `${word}：やり直します ― ${plainWords(e.error ?? "入力が受け付けられませんでした", ctx.titles)}`, mark: "ng" };
  if (e.tool === "check") {
    const probs = ((e.result as { problems?: unknown[] } | undefined)?.problems ?? []).length;
    return probs ? { text: `確かめ：作れない所 ${probs}`, mark: "ng" } : { text: "確かめ：すべて決まりの内側", mark: "ok" };
  }
  if (e.tool === "look") return { text: `見る：${VIEW[String(input.view)] ?? ""}` };
  const parts = Object.entries(input).flatMap(([k, v]) => partOf(k, v, ctx.stone) ?? []);
  const reason = typeof input.reason === "string" ? input.reason : e.reason;
  return { text: `${word}：${parts.join("、")}${reason ? ` ― ${plainWords(reason, ctx.titles)}` : ""}` };
}

// ---- 「まだできないこと」 ----

/** 「まだできないこと」の行（続きの箇条書きも）を除いた文。札に出すので、作業の記録には重ねて出さない */
export function withoutCannot(text: string): string {
  const lines = text.replace(/\*\*/g, "").split(/\r?\n/);
  const at = lines.findIndex((l) => /まだできないこと\s*[：:]/.test(l));
  if (at < 0) return text.trim();
  let end = at + 1;
  while (end < lines.length && /^\s*(?:[-・•*]|\d+[.)．])\s/.test(lines[end])) end++;
  return [...lines.slice(0, at), ...lines.slice(end)].join("\n").trim();
}

/** Claude のまとめから「まだできないこと」を取り出す。なければ空。続きの行（箇条書き）も含める */
export function cannotFrom(finalText: string, titles?: RuleTitles): string {
  const lines = finalText.replace(/\*\*/g, "").split(/\r?\n/);
  const at = lines.findIndex((l) => /まだできないこと\s*[：:]/.test(l));
  if (at < 0) return "";
  const head = lines[at].replace(/^.*?まだできないこと\s*[：:]\s*/, "").trim();
  const rest: string[] = [];
  for (const l of lines.slice(at + 1)) {
    const m = /^\s*(?:[-・•*]|\d+[.)．])\s*(.+)$/.exec(l);
    if (!m) break;
    rest.push(m[1].trim());
  }
  const text = [head, ...rest].filter(Boolean).join(" ").replace(/^[-・•]\s*/, "");
  if (!text || /^(なし|ありません|特になし|特にありません|ない)(?:[。．、（(].*)?$/.test(text)) return "";
  return plainWords(text, titles);
}
