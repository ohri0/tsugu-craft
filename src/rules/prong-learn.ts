// 学ぶ（職人に聞く）の、爪の太さの問いに、職人の点から推し量って答える（作者の声 2026-11-07）。
// 作者：「長辺 8.8 mm くらいの三角」の答えが、職人の言葉そのままで、ただの引き写しに見える。職人が言っていない大きさ（例：長辺 9.3 mm）にも、
// 職人が言ったいくつかの点と公開の目安の線を比べて、割合で推し量った値を、理由つきで答えてほしい。
// ここでは Claude を使わずに、使った職人の点・推測の値・出し方の 1 行・職人の言葉をそろえる。数字はすべてここで出し、Claude は言い方だけを作る。
// Claude の返事の数字が、ここで出した数字と合うかも確かめる（src/claude/rule-points.ts と同じ考え）。
// 画面に依存しない純粋な関数。
import { normalizeNumbers } from "./gaps.js";
import { GUIDES, minProngMm, stoneSizeMm } from "./guides.js";
import { activeRules, type Rule } from "./ledger.js";
import { craftProngPoints, inferFloorMm, inferredValue, mmText, ratioAt, type CraftPoint } from "./prong-points.js";
import { PRESETS } from "../studio/presets.js";

/**
 * 職人が言った石と「同じ石」とみなす、石の大きさの差（mm）。
 * 長辺 8.8 mm くらいの三角（石の大きさ 約 8.1 mm）は、職人の石（約 8.2 mm）と同じ。長辺 9.3 mm（約 8.6 mm）は、もう別の大きさ。
 * 帳面の点を置き換える近さ（SAME_SIZE_MM、0.5 mm）より狭くする（0.4 mm ちがう石を「職人の言葉そのまま」と言わないように）。
 */
export const SAME_STONE_MM = 0.15;

/**
 * 長辺しか分からないときの、幅 ÷ 長辺（形の例の比）。三角は作者の石（8.88 × 7.52 mm、docs/NEXT.md 2026-11-05）、
 * ほかはよくある石の形の例（src/studio/presets.ts）。測った値ではないので、答えにもそう書く。
 */
const SHAPES: { re: RegExp; name: string; ratio: number; from: string }[] = [
  { re: /三角|トリリアント|トライアングル/, name: "三角", ratio: 7.52 / 8.88, from: "作者の三角の石（8.88 × 7.52 mm）と同じ比" },
  ...(
    [
      [/ラウンド|丸い石|丸の石|円い/, "round"],
      [/オーバル|楕円|だ円/, "oval"],
      [/スクエア|プリンセス|四角/, "princess"],
      [/エメラルド/, "emerald"],
      [/ペア|洋なし|しずく/, "pear"],
      [/マーキス|マーキーズ/, "marquise"],
    ] as const
  ).map(([re, id]) => {
    const p = PRESETS.find((x) => x.id === id)!;
    return { re, name: p.name, ratio: p.widthMm / p.longMm, from: `よくある${p.name}の形の例（${mmText(p.longMm)} × ${mmText(p.widthMm)} mm）と同じ比` };
  }),
];

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** 問いから読んだ石の大きさ */
export interface SizeRead {
  /** 石の大きさ（mm）＝（長辺 ＋ 幅）÷ 2。0.1 mm で丸める */
  stoneMm: number;
  /** どう読んだか（ふつうの言葉） */
  read: string;
  /** 答えの頭に出す、問いの石の呼び方（「長辺 9.3 mm の三角の石（石の大きさ 約 8.6 mm）」） */
  label: string;
  longMm?: number;
  shape?: string;
}

/** 爪の太さの問いか（本数・高さ・位置などの問いは別） */
export function isProngThicknessQuestion(question: string): boolean {
  const q = normalizeNumbers(question);
  return /爪/.test(q) && /太さ|太く|細さ|細く|何\s*(?:mm|ミリ)|どれ(?:くらい|ぐらい)|どのくらい|ø|径/.test(q) && !/何\s*本|本数|高さ|位置|間隔|角度/.test(q);
}

/**
 * 問いの中の石の大きさ。「長辺 9.3 mm の三角の石」「8.88 × 7.52 mm」「9 mm くらいの石」「メレ」。なければ undefined。
 * 長辺と形だけなら、幅は形の例の比から出す（測った値ではないと read に書く）
 */
export function readStoneSize(question: string): SizeRead | undefined {
  const q = normalizeNumbers(question).replace(/[×xX＊*]/g, "×");
  const shape = SHAPES.find((s) => s.re.test(q));
  const pair = /(\d+(?:\.\d+)?)\s*(?:mm|ミリ)?\s*×\s*(\d+(?:\.\d+)?)\s*(?:mm|ミリ)?/.exec(q);
  if (pair) {
    const [l, w] = [Number(pair[1]), Number(pair[2])];
    const s = round1(stoneSizeMm(l, w));
    return { stoneMm: s, read: `${mmText(l)} × ${mmText(w)} mm の石は、石の大きさ（長辺と幅の平均）${mmText(s)} mm`, label: `${mmText(l)} × ${mmText(w)} mm の石（石の大きさ ${mmText(s)} mm）`, longMm: l, ...(shape ? { shape: shape.name } : {}) };
  }
  const long = /長辺\s*(?:が|は)?\s*(\d+(?:\.\d+)?)\s*(?:mm|ミリ)?/.exec(q);
  const width = /(?:幅|短辺)\s*(?:が|は)?\s*(\d+(?:\.\d+)?)\s*(?:mm|ミリ)?/.exec(q);
  if (long) {
    const l = Number(long[1]);
    if (width) {
      const w = Number(width[1]);
      const s = round1(stoneSizeMm(l, w));
      return { stoneMm: s, read: `長辺 ${mmText(l)} mm・幅 ${mmText(w)} mm の石は、石の大きさ（長辺と幅の平均）${mmText(s)} mm`, label: `長辺 ${mmText(l)} mm・幅 ${mmText(w)} mm の石（石の大きさ ${mmText(s)} mm）`, longMm: l, ...(shape ? { shape: shape.name } : {}) };
    }
    if (shape) {
      const w = l * shape.ratio;
      const s = round1(stoneSizeMm(l, w));
      return {
        stoneMm: s,
        read: `長辺 ${mmText(l)} mm の${shape.name}の石は、幅を${shape.from}で 約 ${mmText(round2(w))} mm とみて、石の大きさ（長辺と幅の平均）約 ${mmText(s)} mm（幅は測った値ではない）`,
        label: `長辺 ${mmText(l)} mm の${shape.name}の石（石の大きさ 約 ${mmText(s)} mm）`,
        longMm: l,
        shape: shape.name,
      };
    }
    return { stoneMm: round1(l), read: `幅が分からないので、長辺 ${mmText(l)} mm を石の大きさとした（幅が分かれば、長辺と幅の平均にする）`, label: `長辺 ${mmText(l)} mm の石`, longMm: l };
  }
  // 「9 mm くらいの石」「直径 6.5 ミリ」：石の大きさとして読む（爪の太さの数字を石と取り違えないように、石・直径の近くの数字だけ）
  const near = /(?:直径|大きさ|石)\s*(?:が|は)?\s*(\d+(?:\.\d+)?)\s*(?:mm|ミリ)/.exec(q) ?? /(\d+(?:\.\d+)?)\s*(?:mm|ミリ)?\s*(?:くらい|ぐらい|ほど|前後)?\s*の?\s*[^\d、。？?]{0,8}?(?:石|メレ)/.exec(q);
  if (near) {
    const s = round1(Number(near[1]));
    if (s > 0) return { stoneMm: s, read: `石の大きさ ${mmText(s)} mm`, label: `${mmText(s)} mm の石`, ...(shape ? { shape: shape.name } : {}) };
  }
  return undefined;
}

/** 職人の点（言葉と日付つき） */
export interface LearnPoint extends CraftPoint {
  /** その点を言った文（帳面の職人の言葉から、そのまま抜き出す） */
  said?: string;
}

/** 学ぶの爪の答えのもとになる事実（すべてこの関数が計算した値） */
export interface ProngLearnFacts {
  ruleId: string;
  /** 職人の名前と、言った日 */
  name: string;
  date: string;
  /** 問いに石の大きさがあったか（なければ、職人の石の場合で答え、聞き返す） */
  asked: boolean;
  size: SizeRead;
  /** 職人が言った大きさと同じか（職人の言葉そのまま） */
  exact: boolean;
  /** この大きさの、爪の最低の太さ（mm） */
  value: number;
  by: "craftsman" | "inferred";
  /** 職人が言ったすべての点（小さい順） */
  points: LearnPoint[];
  /** 割合をとった職人の点（exact なら、その点だけ） */
  from: LearnPoint[];
  /** この大きさの公開の目安（mm） */
  publicMm: number;
  /** 職人の値 ÷ 公開の目安（この大きさでの倍率） */
  ratio: number;
  /** 出し方の 1 行 */
  method: string;
  /** ふつうの太さ（職人が自分の石で言った範囲を、最低と同じ割合で動かす） */
  typical?: { from: number; to: number; by: "craftsman" | "inferred"; atMm: number; saidFrom: number; saidTo: number; said?: string };
  /** 「大きい石だったら大きい爪」のような、割合で考える理由の職人の言葉 */
  whySaid?: string;
}

/** 職人の言葉を文に分ける（句点・改行で） */
function sentences(quote: string): string[] {
  return quote.split(/(?<=[。！？\n])/).map((s) => s.replace(/[。\n]$/, "").trim()).filter(Boolean);
}

/** その数字（mm）を言った文 */
function sentenceWith(quote: string | undefined, value: number): string | undefined {
  if (!quote) return undefined;
  return sentences(quote).find((s) => [...normalizeNumbers(s).matchAll(/(\d+(?:\.\d+)?)/g)].some((m) => Math.abs(Number(m[1]) - value) < 1e-9));
}

/** 職人が言った「ふつうは A から B」（帳面の言葉から） */
function typicalSaid(r: Rule): { from: number; to: number; said?: string } | undefined {
  for (const t of [r.quote, r.text]) {
    if (!t) continue;
    const s = sentences(t).find((x) => /普通|ふつう/.test(x));
    const m = s && /(?:普通|ふつう)は\s*(\d+(?:\.\d+)?)\s*(?:mm|ミリ)?\s*(?:から|〜|～|~|-)\s*(\d+(?:\.\d+)?)/.exec(normalizeNumbers(s));
    if (m) return { from: Number(m[1]), to: Number(m[2]), ...(t === r.quote ? { said: s } : {}) };
  }
  return undefined;
}

/**
 * 爪の太さの問いに、帳面の職人の点から答える事実をそろえる。爪の太さの問いでない、または職人の点がなければ null（ふつうに答える）。
 * 石の大きさがない問いは、職人の石（職人が自分の石で言った点）の場合でそろえ、asked を false にする
 */
export function prongLearnFacts(question: string, rules: readonly Rule[]): ProngLearnFacts | null {
  if (!isProngThicknessQuestion(question)) return null;
  const rule = activeRules({ rules: [...rules] }).find((r) => r.param === "prong.minDiameterMm" && r.source.kind === "craftsman");
  if (!rule || rule.source.kind !== "craftsman") return null;
  const craft = craftProngPoints({ craft: "", rules: [rule] });
  if (craft.length === 0) return null;
  const points: LearnPoint[] = craft.map((c) => ({ ...c, said: sentenceWith(c.quote ?? rule.quote, c.value) }));
  // 職人が「この石」「今回の石」と言った点：決まりの value の点（なければ、いちばん大きい点）
  const home = points.find((p) => Math.abs(p.value - (rule.value ?? NaN)) < 1e-9) ?? points[points.length - 1];
  // 「メレの爪」のように、職人が言った石の呼び名で聞かれたら、その点
  const named = /メレ/.test(question) ? points.find((p) => p.said && /メレ/.test(p.said)) : undefined;
  const read =
    readStoneSize(question) ??
    (named ? { stoneMm: named.stoneMm, read: `メレは、職人が言った約 ${mmText(named.stoneMm)} mm の石`, label: `メレ（約 ${mmText(named.stoneMm)} mm の石）` } : undefined);
  const size: SizeRead = read ?? { stoneMm: home.stoneMm, read: `問いに石の大きさがないので、職人が言った石（石の大きさ ${mmText(home.stoneMm)} mm）の場合`, label: `職人が言った石（石の大きさ ${mmText(home.stoneMm)} mm）` };
  const s = size.stoneMm;
  const same = points.filter((p) => Math.abs(p.stoneMm - s) <= SAME_STONE_MM + 1e-9).sort((a, b) => Math.abs(a.stoneMm - s) - Math.abs(b.stoneMm - s))[0];
  const publicMm = round2(minProngMm(s));
  const name = rule.source.name;
  const date = rule.date;
  const t = typicalSaid(rule);
  const whySaid = rule.quote ? sentences(rule.quote).filter((x) => /大きい石|サイズによって|割合/.test(x)).join("。") || undefined : undefined;
  const base = { ruleId: rule.id, name, date, asked: read !== undefined, size, points, publicMm, ...(whySaid ? { whySaid } : {}) };
  if (same) {
    const typical = t && same === home ? { from: t.from, to: t.to, by: "craftsman" as const, atMm: home.stoneMm, saidFrom: t.from, saidTo: t.to, ...(t.said ? { said: t.said } : {}) } : undefined;
    return {
      ...base,
      exact: true,
      value: same.value,
      by: "craftsman",
      from: [same],
      ratio: round2(same.value / minProngMm(same.stoneMm)),
      method: `職人の言葉そのまま（${mmText(s)} mm の石は、職人が言った ${mmText(same.stoneMm)} mm の石と同じ大きさ）`,
      ...(typical ? { typical } : {}),
    };
  }
  const value = inferredValue(craft, s);
  const ratio = ratioAt(craft, s);
  const raw = round2(minProngMm(s) * ratio);
  const sorted = [...points].sort((a, b) => a.stoneMm - b.stoneMm);
  const below = s < sorted[0].stoneMm;
  const above = s > sorted[sorted.length - 1].stoneMm;
  const from = below ? [sorted[0]] : above ? [sorted[sorted.length - 1]] : (() => {
    const i = sorted.findIndex((_p, k) => k < sorted.length - 1 && s <= sorted[k + 1].stoneMm);
    return [sorted[i], sorted[i + 1]];
  })();
  const fromText = from.map((p) => `${mmText(p.stoneMm)} mm で ${mmText(p.value)} mm（公開の目安の ${(p.value / minProngMm(p.stoneMm)).toFixed(2)} 倍）`).join("と ");
  const how = from.length === 1 ? `職人の ${fromText}と同じ倍率` : `倍率を職人の ${fromText}の間でまっすぐつないで ${ratio.toFixed(2)} 倍`;
  const kept =
    value === raw
      ? ""
      : value <= inferFloorMm() + 1e-9 && raw < inferFloorMm()
        ? `。${mmText(inferFloorMm())} mm より細くはしない`
        : from.length === 2
          ? `。職人の 2 つの点の値の間に収めて ${mmText(value)} mm`
          : `。職人の点の値をこえないように ${mmText(value)} mm`;
  const method = `公開の目安の線（${mmText(s)} mm で ${mmText(publicMm)} mm）に、${how}を掛けて ${mmText(raw)} mm${kept}`;
  // ふつうの太さは、職人の石より大きい石だけ、同じ割合で動かす（小さい石のふつうは、職人が言っていない）
  const typical = t && s > home.stoneMm ? { from: round2(t.from * (value / home.value)), to: round2(t.to * (value / home.value)), by: "inferred" as const, atMm: home.stoneMm, saidFrom: t.from, saidTo: t.to, ...(t.said ? { said: t.said } : {}) } : undefined;
  return { ...base, exact: false, value, by: "inferred", from, ratio: round2(ratio), method, ...(typical ? { typical } : {}) };
}

/** 職人の点を 1 つ、言葉で（「8.2 mm の石で 0.7 mm」） */
const pointWords = (p: LearnPoint) => `石の大きさ ${mmText(p.stoneMm)} mm で最低 ${mmText(p.value)} mm`;

/** Claude なしの答え（答えの 1〜2 文と、なぜ） */
export function prongLearnAnswer(f: ProngLearnFacts): { short: string; why: string } {
  const said = f.points.map((p) => `${pointWords(p)}${p.said ? `（「${p.said}」）` : ""}`).join("、");
  const typ = f.typical ? `、ふつうは ${mmText(f.typical.from)}〜${mmText(f.typical.to)} mm くらい` : "";
  const tail = f.asked ? "" : " 何 mm の石か教えてもらえれば、その大きさで答えます。";
  const short = f.exact
    ? `${f.size.label}なら、爪の太さは最低 ${mmText(f.value)} mm${typ || " "}です（職人の言葉そのまま）。${tail}`
    : `${f.size.label}なら、爪の太さは最低 約 ${mmText(f.value)} mm${typ || " "}と推測できます（推測・職人がまだ確かめていない値）。${tail}`;
  const why = [
    `職人（${f.name}、${f.date}）が言った点：${said}。`,
    f.asked ? `${f.size.read}。` : "",
    f.exact ? "" : `出し方：${f.method}。${f.typical ? `ふつうの太さも、最低と同じ割合で動かした。` : ""}`,
    f.whySaid ? `職人は「${f.whySaid}」とも言っています。` : "",
    "目安・最後は職人が決める。",
  ].filter(Boolean).join(" ");
  return { short, why };
}

/** Claude への指示に入れる、この問いの事実（数字はすべてここから） */
export function prongFactsText(f: ProngLearnFacts): string {
  const lines = [
    `決まり：[${f.ruleId}]（職人：${f.name}、${f.date}）`,
    `職人が言った点：${f.points.map((p) => `${pointWords(p)}${p.said ? `（職人の言葉：「${p.said}」）` : ""}`).join("、")}`,
    f.typical?.said ? `職人のふつうの太さの言葉：「${f.typical.said}」（石の大きさ ${mmText(f.typical.atMm)} mm の石）` : "",
    f.whySaid ? `割合で考える理由の職人の言葉：「${f.whySaid}」` : "",
    `公開の目安の線：${GUIDES.prong.minByStoneSize.map(([s, d]) => `${s} mm で ${d} mm`).join("、")}（点の間はまっすぐ）。この大きさでは ${mmText(f.publicMm)} mm`,
    `問いの石：${f.size.read}${f.asked ? "" : "。問いに石の大きさがないので、この場合で答え、何 mm の石かを 1 つだけ聞き返す"}`,
    f.exact
      ? `答えの値：最低 ${mmText(f.value)} mm（職人の言葉そのまま。推測ではない）`
      : `答えの値：最低 約 ${mmText(f.value)} mm（推測・職人がまだ確かめていない値）。使った職人の点：${f.from.map(pointWords).join("と")}。出し方：${f.method}`,
    f.typical ? `ふつうの太さ：${mmText(f.typical.from)}〜${mmText(f.typical.to)} mm（${f.typical.by === "craftsman" ? "職人の言葉そのまま" : "推測。職人が自分の石で言った範囲を、最低と同じ割合で動かした"}）` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** 文の中の、単位つきの数（mm・ミリ・倍。「0.8〜1 mm」の両はしも） */
export function unitNumbers(text: string): number[] {
  const s = normalizeNumbers(text).replace(/\d{4}-\d{1,2}-\d{1,2}/g, " ");
  const out: number[] = [];
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)(?:\s*(?:mm|ミリ)?\s*(?:〜|～|~|から)\s*(\d+(?:\.\d+)?))?\s*(mm|ミリ|倍)/g)) {
    out.push(Number(m[1]));
    if (m[2] !== undefined) out.push(Number(m[2]));
  }
  return out;
}

/**
 * Claude の答えの数字が、この事実（と問いの数字・もとにした決まりの数字）にあるか。
 * ないもの（Claude が自分で計算した数字など）を bad に返す。推測の値なのに「推測」と書いていなければ、それも ng
 */
export function checkProngAnswer(text: string, f: ProngLearnFacts, question: string, cited: readonly Rule[] = []): { ok: boolean; bad: number[]; noGuessWord: boolean } {
  const allowed = new Set<number>();
  const add = (t: string) => {
    for (const m of normalizeNumbers(t).matchAll(/(\d+(?:\.\d+)?)/g)) allowed.add(Number(m[1]));
  };
  add(prongFactsText(f));
  add(question);
  for (const r of cited) add([r.text, r.quote ?? "", r.example ?? ""].join(" "));
  // 割合の表し方の違い（0.57 倍 と 57%）は数えない。小数 2 けたまでで比べる
  const bad = [...new Set(unitNumbers(text))].filter((v) => ![...allowed].some((a) => Math.abs(a - v) < 0.005));
  const noGuessWord = !f.exact && !/推測/.test(text);
  return { ok: bad.length === 0 && !noGuessWord, bad, noGuessWord };
}

/** 画面の表に出す列：職人の点と、この大きさ（now）。ふつうの太さは、職人が言った石と、この大きさにだけ */
export interface LearnColumn {
  stoneMm: number;
  min: { value: number; by: "craftsman" | "inferred" };
  typical?: { from: number; to: number; by: "craftsman" | "inferred" };
  now: boolean;
}
export function prongLearnColumns(f: ProngLearnFacts): LearnColumn[] {
  const t = f.typical;
  const cols: LearnColumn[] = f.points.map((p) => ({
    stoneMm: p.stoneMm,
    min: { value: p.value, by: "craftsman" },
    ...(t && Math.abs(t.atMm - p.stoneMm) < 1e-9 ? { typical: { from: t.saidFrom, to: t.saidTo, by: "craftsman" as const } } : {}),
    now: f.exact && f.from[0] === p,
  }));
  if (!f.exact) cols.push({ stoneMm: f.size.stoneMm, min: { value: f.value, by: "inferred" }, ...(t ? { typical: { from: t.from, to: t.to, by: "inferred" as const } } : {}), now: true });
  return cols.sort((a, b) => a.stoneMm - b.stoneMm);
}
