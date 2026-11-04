// 聞き取り：帳面の「まだ決まっていない所」を見つけ、職人に 1 つずつ聞き、答えを決まりにする。
// 指輪の石留めの帳面にも、魚々子の帳面にも同じ形で使う。
// Claude がなくても動くように、質問は決まった文、答えは数字を読む簡単なしくみで決まりにする（Claude があれば言い直しを任せる）。
// 決まりの数字は、職人が答えた言葉の中の数字だけ。ここで数字を作らない。
import { effectiveGuides, PARAMS, activeRules, addRule, sourceLabel, type Ledger, type ParamId, type Rule, type SizeStep } from "./ledger.js";
import { TECHS, type TechId } from "./techniques.js";
import { NANAKO_PARAMS, nanakoGapId, type NanakoLedger, type NanakoParam } from "./nanako.js";

export type Technique = "ring" | "nanako" | TechId;

/**
 * missing＝値の決まりがまだない / unverified＝原文で確かめていない決まり / uncovered＝職人の点が届いていない石の大きさ /
 * provisional＝仮の目安のまま / public＝公開情報の目安のまま（職人がまだ話していない） / open＝言葉で答える問い
 */
export type GapKind = "missing" | "unverified" | "uncovered" | "provisional" | "public" | "open";

/** number＝数字で答える / confirm＝「はい」か数字（または言葉）で答える / text＝言葉で答える */
export type Expect = "number" | "confirm" | "text";

export interface Gap {
  id: string;
  technique: Technique;
  kind: GapKind;
  expects: Expect;
  /** 決まった質問（Claude なしで出す文） */
  question: string;
  /** なぜ聞くか（短く） */
  why: string;
  /** 答えから作る決まりの短い名前 */
  title: string;
  /** 答えから作る決まりの理由（職人が言わなければこれ） */
  reason: string;
  param?: string;
  unit?: string;
  /** confirm のとき、今の値 */
  current?: number;
  /** confirm のとき、確かめる決まり（答えはこれを置き換える） */
  ruleId?: string;
  /** confirm のとき、確かめる決まりの言葉 */
  ruleText?: string;
  /** 指輪の爪：どの石の大きさのことを聞くか mm */
  stoneMm?: number;
}

// ---- 数字を読む ----

const KANJI: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** 全角の数字・「コンマ」「点」・漢数字を、ふつうの数字の文字に直す */
export function normalizeNumbers(text: string): string {
  let s = text.replace(/[０-９．，％]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/(\d)\s*(?:コンマ|こんま|てん|点)\s*(\d)/g, "$1.$2");
  s = s.replace(/(?:れい|ゼロ|0)?\s*(?:コンマ|こんま)\s*(\d)/g, "0.$1");
  s = s.replace(/([〇零一二三四五六七八九十])(?:点|てん)([〇零一二三四五六七八九])/g, (_m, a: string, b: string) => `${KANJI[a]}.${KANJI[b]}`);
  s = s.replace(/([一二三四五六七八九十])(?=\s*(?:ミリ|mm|ｍｍ|倍|割|パーセント|%|センチ))/g, (_m, a: string) => String(KANJI[a]));
  return s;
}

export interface ReadNumber {
  value: number;
  /** 書かれていた単位（ミリ・ミクロン・センチ・%・割・倍） */
  unit?: string;
  /** 元の文の中の位置 */
  at: number;
}

/** 文の中の数字を、単位をそろえて（mm／割合は 0〜1）読む。「1 ミリ半」は 1.5 */
export function readNumbers(text: string): ReadNumber[] {
  const s = normalizeNumbers(text);
  const out: ReadNumber[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(ミリ|mm|ミクロン|μm|um|センチ|cm|%|パーセント|割|倍)?(半)?/g;
  for (const m of s.matchAll(re)) {
    let v = Number(m[1]);
    const unit = m[2];
    if (m[3]) v += 0.5;
    if (unit === "ミクロン" || unit === "μm" || unit === "um") v /= 1000;
    else if (unit === "センチ" || unit === "cm") v *= 10;
    else if (unit === "%" || unit === "パーセント") v /= 100;
    else if (unit === "割") v /= 10;
    if (Number.isFinite(v)) out.push({ value: Math.round(v * 10000) / 10000, unit, at: m.index ?? 0 });
  }
  return out;
}

const YES = /^(?:\s*)(?:はい|ええ|うん|そう|そのとおり|その通り|合って|あって|いい(?:です|よ)?|大丈夫|OK|ok|オーケー)/;

/** 「はい」に近い答えか */
export function isYes(text: string): boolean {
  const t = text.trim();
  return YES.test(t) && !/^\s*(?:いいえ|違|ちが)/.test(t);
}

// ---- 答え → 決まり ----

export interface AnswerContext {
  /** 答えた職人の名前 */
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** 実際に聞いた言葉（Claude が言い直したときはその文） */
  asked?: string;
}

/** 帳面に足す決まりの案（id は帳面に足すときに決まる） */
export type RuleDraft<P extends string = string> = Omit<Rule<P>, "id" | "replaces"> & { replaces?: string };

export type AnswerResult<P extends string = string> =
  | { ok: true; draft: RuleDraft<P>; value?: number }
  | { ok: false; why: string; candidates?: number[] };

const fmtNum = (v: number) => String(Math.round(v * 1000) / 1000);

/** 値をその単位の言葉に（割合は %） */
export function valueText(v: number, unit = "mm"): string {
  if (unit === "") return `${Math.round(v * 1000) / 10}%`;
  if (unit === "×") return `${fmtNum(v)}×`;
  return `${fmtNum(v)} ${unit}`;
}

/**
 * 答えの中から、決まりにする数字を 1 つ選ぶ。
 * 聞いた石の大きさと同じ数字は外す。数字が 2 つ以上残れば、どれにするか職人に選んでもらう（candidates）。
 */
export function pickNumber(gap: Gap, answer: string, chosen?: number): { ok: true; value: number } | { ok: false; why: string; candidates?: number[] } {
  let nums = readNumbers(answer);
  if (gap.unit === "") nums = nums.map((n) => (!n.unit && n.value > 1 ? { ...n, value: n.value / 100 } : n));
  if (gap.stoneMm !== undefined && nums.length > 1) nums = nums.filter((n) => Math.abs(n.value - gap.stoneMm!) > 1e-9);
  const values = [...new Set(nums.map((n) => n.value))];
  if (chosen !== undefined) {
    return values.some((v) => Math.abs(v - chosen) < 1e-9) ? { ok: true, value: chosen } : { ok: false, why: "選んだ数字が、答えの中にありません。" };
  }
  if (values.length === 0) return { ok: false, why: "答えの中に数字が見つかりませんでした。数字で答えてください（例：「〇〇 ミリ」）。" };
  if (values.length > 1) return { ok: false, why: "答えに数字が 2 つ以上あります。決まりにする数字を選んでください。", candidates: values };
  return { ok: true, value: values[0] };
}

/** Claude なしで、答えを決まりの案にする */
export function answerToDraft<P extends string = string>(gap: Gap, answer: string, ctx: AnswerContext, chosen?: number): AnswerResult<P> {
  const said = answer.trim();
  if (!said) return { ok: false, why: "答えを話すか、書いてください。" };
  const base = {
    title: gap.title,
    reason: gap.reason,
    quote: said,
    question: ctx.asked ?? gap.question,
    gap: gap.id,
    source: { kind: "craftsman" as const, name: ctx.name },
    date: ctx.date,
  };

  if (gap.expects === "text") return { ok: true, draft: { ...base, text: said } as RuleDraft<P> };

  if (gap.expects === "confirm") {
    const nums = readNumbers(said);
    if (gap.param && nums.length > 0) {
      const p = pickNumber(gap, said, chosen);
      if (!p.ok) return p;
      return { ok: true, value: p.value, draft: { ...base, ...numberRule(gap, p.value), replaces: gap.ruleId } as RuleDraft<P> };
    }
    if (isYes(said)) {
      if (gap.param && gap.current !== undefined) {
        return { ok: true, value: gap.current, draft: { ...base, ...numberRule(gap, gap.current), replaces: gap.ruleId } as RuleDraft<P> };
      }
      return { ok: true, draft: { ...base, text: gap.ruleText ?? gap.title, replaces: gap.ruleId } as RuleDraft<P> };
    }
    if (gap.param) return { ok: false, why: "「はい」か、ちがう数字で答えてください。" };
    // 言葉の決まりを、職人の言葉で言い直した
    return { ok: true, draft: { ...base, text: said, replaces: gap.ruleId } as RuleDraft<P> };
  }

  const p = pickNumber(gap, said, chosen);
  if (!p.ok) return p;
  return { ok: true, value: p.value, draft: { ...base, ...numberRule(gap, p.value) } as RuleDraft<P> };
}

/** 数字の答えから、決まりの値と言葉 */
function numberRule(gap: Gap, v: number): { param?: string; value?: number; text: string } {
  const unit = gap.unit ?? "mm";
  switch (gap.param) {
    case "plate.minThicknessMm":
      return { param: gap.param, value: v, text: `板の厚みは ${valueText(v)} 以上（これより薄いと、打ったときに穴があく）` };
    case "grain.gapMinMm":
      return { param: gap.param, value: v, text: `となりの粒とのすき間（縁と縁）は ${valueText(v)} 以上（これより近いと粒がくずれる）` };
    case "grain.gapMaxMm":
      return { param: gap.param, value: v, text: `となりの粒とのすき間（縁と縁）は ${valueText(v)} まで（これより遠いと、打っていない島が残る）` };
    case "strike.maxOffsetMm":
      return { param: gap.param, value: v, text: `打つ位置のずれは ${valueText(v)} まで` };
    default:
      return { param: gap.param, value: v, text: `${gap.title}：${valueText(v, unit)}` };
  }
}

// ---- 魚々子の「まだ決まっていない所」 ----

const NANAKO_ASK: Record<NanakoParam, { question: string; why: string; reason: string } | undefined> = {
  "plate.minThicknessMm": {
    question: "板の厚みが何ミリより薄いと、打ったときに穴があきますか？",
    why: "資料には「うすい板に粗い鏨で打つと穴があく」とだけあり、何 mm からかは書いていない。",
    reason: "うすい板に打つと、鏨の先が突き抜けて穴があく",
  },
  "grain.gapMinMm": {
    question: "となりの粒とのすき間（粒の縁と縁）が何ミリより近いと、粒がくずれますか？",
    why: "資料には「近すぎると粒がくずれる」とだけあり、数字がない。",
    reason: "近すぎると、前に打った粒を次の粒がつぶす",
  },
  "grain.gapMaxMm": {
    question: "となりの粒とのすき間が何ミリより広いと、打っていない「島」が目立ちますか？",
    why: "資料には「間かくが遠いと島が残る」とだけあり、数字がない。",
    reason: "遠いと、粒の間に打っていない島が残る",
  },
  // 打つ位置のずれは資料に数字がある（未確認）。確かめる問いとして出す
  "strike.maxOffsetMm": undefined,
};

/** 魚々子の、言葉で答える問い（資料で見つからなかった・食いちがったこと） */
const NANAKO_OPEN: { id: string; title: string; question: string; why: string; reason: string }[] = [
  {
    id: "nanako:punch-number",
    title: "鏨の番号と先の丸の大きさ",
    question: "鏨の番号は、数字が小さいほど先の丸が小さいですか？大きいですか？",
    why: "資料によって言い方が逆で、決められない。",
    reason: "番号の向きを取りちがえると、うすい板に粗い鏨で打ってしまう",
  },
  {
    id: "nanako:row-guide",
    title: "列をまっすぐに保つ目印",
    question: "列をまっすぐに保つのに、何を目印にしますか？（線を引く・前の粒のふちに合わせる など）",
    why: "列をそろえるやり方は、資料に見つからなかった。",
    reason: "位置が少しずれると、後の粒がすべて合わなくなる",
  },
];

/** 魚々子の帳面の、まだ決まっていない所（聞く順） */
export function nanakoGaps(ledger: NanakoLedger): Gap[] {
  const active = activeRules(ledger);
  const answered = new Set(active.flatMap((r) => (r.gap ? [r.gap] : [])));
  const gaps: Gap[] = [];
  // 1. 値の決まりがない
  for (const [param, ask] of Object.entries(NANAKO_ASK) as [NanakoParam, (typeof NANAKO_ASK)[NanakoParam]][]) {
    if (!ask) continue;
    if (active.some((r) => r.param === param && r.value !== undefined)) continue;
    gaps.push({ id: nanakoGapId(param), technique: "nanako", kind: "missing", expects: "number", param, unit: "mm", title: NANAKO_PARAMS[param].label, ...ask });
  }
  // 2. 数字のある未確認の決まり
  const unverified = active.filter((r) => r.unverified);
  for (const r of unverified.filter((x) => x.param && x.value !== undefined)) {
    gaps.push({
      id: nanakoGapId(r.param!),
      technique: "nanako",
      kind: "unverified",
      expects: "confirm",
      param: r.param,
      unit: "mm",
      current: r.value,
      ruleId: r.id,
      ruleText: r.text,
      title: NANAKO_PARAMS[r.param!].label,
      reason: r.reason,
      question: `「${r.text}」という話が資料にあります（原文は未確認）。あなたの仕事でもそうですか？ちがえば数字で教えてください。`,
      why: `出どころ：${sourceLabel(r.source)}。検索結果の要約で、原文を確かめていない。`,
    });
  }
  // 3. 言葉で答える問い
  for (const o of NANAKO_OPEN) {
    if (answered.has(o.id)) continue;
    gaps.push({ id: o.id, technique: "nanako", kind: "open", expects: "text", title: o.title, question: o.question, why: o.why, reason: o.reason });
  }
  // 4. 言葉の未確認の決まり
  for (const r of unverified.filter((x) => !x.param)) {
    gaps.push({
      id: `nanako:confirm:${r.id}`,
      technique: "nanako",
      kind: "unverified",
      expects: "confirm",
      ruleId: r.id,
      ruleText: r.text,
      title: r.title,
      reason: r.reason,
      question: `「${r.text}」と資料にあります（原文は未確認）。あなたの仕事でもそうですか？ちがえば、あなたの言葉で教えてください。`,
      why: `出どころ：${sourceLabel(r.source)}。検索結果の要約で、原文を確かめていない。`,
    });
  }
  return gaps;
}

// ---- 指輪の石留めの「まだ決まっていない所」 ----

/** 職人の点と点の間がこれより広いと、間の大きさを聞く mm */
const MAX_POINT_SPAN_MM = 4;
/** 設計でよく扱う大きい石（docs/LOG.md：12〜14 mm の石を線を伸ばして出している）。ここまでは職人の点で届かせたい */
const LARGE_STONE_MM = 12;
/** 聞かない値（職人がもう決めている形の決まり） */
const RING_SKIP: readonly ParamId[] = ["hold.cornerSet"];

const half = (v: number) => Math.round(v * 2) / 2;

/** 爪の太さで、職人の点（石の大きさと最低の太さ） */
export function prongPoints(ledger: Ledger): { rule?: Rule; points: { stone: number; value: number }[] } {
  const rule = activeRules(ledger).find((r) => r.param === "prong.minDiameterMm" && r.source.kind === "craftsman");
  if (!rule) return { points: [] };
  const pts = (rule.bySize ?? []).filter((s): s is SizeStep & { upToMm: number } => s.upToMm !== null).map((s) => ({ stone: s.upToMm, value: s.value }));
  return { rule, points: pts.sort((a, b) => a.stone - b.stone) };
}

/** 指輪の石留めの帳面の、まだ決まっていない所（聞く順） */
export function ringGaps(ledger: Ledger): Gap[] {
  const gaps: Gap[] = [];
  const active = activeRules(ledger);
  const g = effectiveGuides(ledger) as unknown as Record<string, Record<string, number>>;

  // 1. 爪の太さ：職人の点が届いていない石の大きさ
  const { rule, points } = prongPoints(ledger);
  if (rule && points.length > 0) {
    const ptsText = points.map((p) => `${fmtNum(p.stone)} mm の石で ${fmtNum(p.value)} mm`).join("、");
    const ask = (stone: number, why: string) =>
      gaps.push({
        id: `ring:prong-size:${stone}`,
        technique: "ring",
        kind: "uncovered",
        expects: "number",
        param: "prong.minDiameterMm",
        unit: "mm",
        stoneMm: stone,
        title: "爪の太さ（最低）",
        reason: rule.reason,
        question: `石の大きさが ${fmtNum(stone)} mm くらいの石だと、爪の太さは最低何ミリにしますか？`,
        why: `${why}今の帳面の点は ${ptsText} だけ。`,
      });
    let widest = { span: 0, mid: 0 };
    for (let i = 0; i + 1 < points.length; i++) {
      const span = points[i + 1].stone - points[i].stone;
      if (span > widest.span) widest = { span, mid: half((points[i].stone + points[i + 1].stone) / 2) };
    }
    if (widest.span > MAX_POINT_SPAN_MM) ask(widest.mid, "この間は、点と点をまっすぐつないで出しているだけ。");
    const last = points[points.length - 1].stone;
    if (last < LARGE_STONE_MM - MAX_POINT_SPAN_MM / 2) ask(LARGE_STONE_MM, "大きい石は、線を伸ばして出しているだけ。");
  } else if (!rule) {
    gaps.push({
      id: "ring:prong-size:any",
      technique: "ring",
      kind: "public",
      expects: "number",
      param: "prong.minDiameterMm",
      unit: "mm",
      title: "爪の太さ（最低）",
      reason: "細い爪は曲がりやすく、石が抜ける",
      question: "いちばんよく作る大きさの石で、爪の太さは最低何ミリにしますか？石の大きさも一緒に教えてください。",
      why: "爪の太さは、まだ公開情報の目安だけ。",
    });
  }

  // 2. 仮の目安・公開情報のままの値
  const byParam = new Map<ParamId, Rule>();
  for (const r of active) if (r.param) byParam.set(r.param, r);
  const order = (r: Rule) => (r.source.kind === "provisional" ? 0 : 1);
  const unspoken = [...byParam.values()].filter((r) => r.source.kind !== "craftsman" && !RING_SKIP.includes(r.param!)).sort((a, b) => order(a) - order(b));
  for (const r of unspoken) {
    const p = PARAMS[r.param!];
    const v = r.value!;
    gaps.push({
      id: `ring:${r.param}`,
      technique: "ring",
      kind: r.source.kind === "provisional" ? "provisional" : "public",
      expects: "confirm",
      param: r.param,
      unit: p.unit,
      current: v,
      ruleId: r.id,
      ruleText: r.text,
      title: p.label,
      reason: r.reason,
      question:
        r.source.kind === "provisional"
          ? `「${p.label}」は、今は仮の目安で ${valueText(v, p.unit)} です。あなたなら、いくつにしますか？このままでよければ「はい」と答えてください。`
          : `「${p.label}」は、公開情報の ${valueText(v, p.unit)} のままです。あなたの仕事でも、この数字でいいですか？ちがえば数字で教えてください。`,
      why: `今の出どころ：${sourceLabel(r.source)}。職人はまだ話していない。`,
    });
  }

  // 3. 帳面にまだ一度も出ていない値
  for (const id of Object.keys(PARAMS) as ParamId[]) {
    if (RING_SKIP.includes(id) || id === "prong.minDiameterMm" || active.some((r) => r.param === id)) continue;
    const p = PARAMS[id];
    const [group, key] = id.split(".");
    const v = g[group]?.[key];
    gaps.push({
      id: `ring:${id}`,
      technique: "ring",
      kind: "missing",
      expects: "confirm",
      param: id,
      unit: p.unit,
      ...(v !== undefined ? { current: v } : {}),
      title: p.label,
      reason: "職人の判断で決める",
      question:
        v !== undefined
          ? `「${p.label}」は、帳面にまだ決まりがなく、目安の ${valueText(v, p.unit)} で確かめています。あなたなら、いくつにしますか？このままでよければ「はい」。`
          : `「${p.label}」は、帳面にまだ決まりがありません。いくつにしますか？`,
      why: "帳面に決まりがなく、職人の言葉もない。",
    });
  }

  // 4. 資料から入れた、言葉の決まりで、原文を確かめていないもの（職人に確かめる）
  for (const r of active.filter((x) => x.unverified && !x.param && x.source.kind !== "craftsman")) {
    gaps.push(confirmWordsGap("ring", r));
  }
  return gaps;
}

/** 言葉の決まり（未確認）を、職人に確かめる問い。答えはその決まりを置き換える */
function confirmWordsGap(technique: Technique, r: Rule<string>): Gap {
  return {
    id: `${technique}:confirm:${r.id}`,
    technique,
    kind: "unverified",
    expects: "confirm",
    ruleId: r.id,
    ruleText: r.text,
    title: r.title,
    reason: r.reason,
    question: `「${r.text}」と資料にあります（原文は未確認）。あなたの仕事でもそうですか？ちがえば、あなたの言葉で教えてください。`,
    why: `出どころ：${sourceLabel(r.source)}。原文を確かめていない。`,
  };
}

/**
 * 指輪の帳面に、爪の太さの答え（ある石の大きさで最低何 mm）を足す案。
 * 職人の今の点に、新しい点を足して、点の間をまっすぐつなぐ決まりにする（前の決まりを置き換える。前の言葉は履歴に残る）。
 */
export function prongPointDraft(ledger: Ledger, gap: Gap, value: number, said: string, ctx: AnswerContext): RuleDraft<ParamId> {
  const { rule, points } = prongPoints(ledger);
  const stone = gap.stoneMm;
  const next = stone === undefined ? points : [...points.filter((p) => Math.abs(p.stone - stone) > 1e-9), { stone, value }].sort((a, b) => a.stone - b.stone);
  const bySize = next.map((p) => ({ upToMm: p.stone, value: p.value }));
  return {
    title: "爪の太さ（最低）",
    text: `爪の最低の太さ：${next.map((p) => `石の大きさ ${fmtNum(p.stone)} mm で ${fmtNum(p.value)} mm`).join("、")}。点の間はまっすぐつなぎ、外は同じ傾きで伸ばす`,
    reason: rule?.reason ?? gap.reason,
    ...(rule?.example ? { example: rule.example } : {}),
    quote: said.trim(),
    question: ctx.asked ?? gap.question,
    gap: gap.id,
    param: "prong.minDiameterMm",
    value: next[next.length - 1]?.value ?? value,
    bySize,
    bySizeLine: true,
    source: { kind: "craftsman", name: ctx.name },
    date: ctx.date,
  };
}

/** 指輪の答えを決まりの案に（爪の点は点を足す形、それ以外は answerToDraft） */
export function ringAnswerToDraft(ledger: Ledger, gap: Gap, answer: string, ctx: AnswerContext, chosen?: number): AnswerResult<ParamId> {
  if (gap.param === "prong.minDiameterMm" && gap.stoneMm !== undefined) {
    if (!answer.trim()) return { ok: false, why: "答えを話すか、書いてください。" };
    const p = pickNumber(gap, answer, chosen);
    if (!p.ok) return p;
    return { ok: true, value: p.value, draft: prongPointDraft(ledger, gap, p.value, answer, ctx) };
  }
  return answerToDraft<ParamId>(gap, answer, ctx, chosen);
}

/** 案を帳面に足す（replaces があればその決まりを置き換える） */
export function applyDraft<P extends string>(ledger: Ledger<P>, draft: RuleDraft<P>): Ledger<P> {
  return addRule<P>(ledger, draft);
}

// ---- ほかの技（覆輪留め・ミル打ち・槌目・毛彫り・布目象嵌・木目金）の「まだ決まっていない所」 ----

/**
 * 技の帳面の、まだ決まっていない所（聞く順）：資料にない・食いちがう所を言葉で聞く → 未確認の決まりを確かめる。
 * 数字は職人の答えの言葉の中だけ（ここで数字を作らない）。
 */
export function techGaps(id: TechId, ledger: Ledger<string>): Gap[] {
  const tech = TECHS[id];
  const active = activeRules(ledger);
  const answered = new Set(active.flatMap((r) => (r.gap ? [r.gap] : [])));
  const gaps: Gap[] = [];
  for (const o of tech.open) {
    if (answered.has(o.id)) continue;
    gaps.push({ id: o.id, technique: id, kind: "open", expects: "text", title: o.title, question: o.question, why: o.why, reason: o.reason });
  }
  for (const r of active.filter((x) => x.unverified && x.source.kind !== "craftsman")) gaps.push(confirmWordsGap(id, r));
  return gaps;
}

/** その技の帳面の、まだ決まっていない所 */
export function gapsFor(technique: Technique, ledger: Ledger | NanakoLedger | Ledger<string>): Gap[] {
  if (technique === "ring") return ringGaps(ledger as Ledger);
  if (technique === "nanako") return nanakoGaps(ledger as NanakoLedger);
  return techGaps(technique, ledger as Ledger<string>);
}
