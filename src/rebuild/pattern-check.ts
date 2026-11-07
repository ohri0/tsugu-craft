// 模様の見込みの、言葉と絵の食いちがいを、計算で確かめる（2026-11-08）。画面に依存しない純粋な関数。
// くらべ（docs/compare/）で、継ぐの答えの文では「赤茶の地に白と赤の輪」と言うのに、選んだ操作の値では銀の地の絵になる、
// ということが何度かあった（文で 82%、絵で 60% の合い方）。そこで、Claude に値を決める前に見込みの見た目
// （地の材料と色、見える材料）を言ってもらい、計算の絵の表に見える材料とくらべる。食いちがえば 1 回だけ直してもらう。
// くらべるのは、表に出る材料と地の色の言葉だけ。形・数・手ざわりは見ない（見られない）。
import { buildSim, metalOf, surface } from "./pattern-sim";
import { buildRelief, pointAt, topMat } from "./pattern-relief";
import { toPatternOps, toReliefOps, type PatternPrediction, type PatternRecord } from "./pattern-tools";
import { colorWord, LOOK_CHECK, PATTERN_METALS, type ColorWord, type MetalId } from "./pattern-values";

export interface VisibleLook {
  /** 表に見える材料と、その割合（透かした穴はのぞく。多い順） */
  shares: { metal: MetalId; share: number }[];
  /** いちばん広く見える材料（地）と、その絵の色の言葉 */
  ground: MetalId | null;
  groundColor: ColorWord | null;
}

const name = (m: MetalId) => PATTERN_METALS[m].name.replace(/（.*）/, "");
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 計算の絵の、出来上がりの表に見える材料（上から n × n の点で数える） */
export function visibleLook(pred: PatternPrediction, seed = 7, n: number = LOOK_CHECK.grid): VisibleLook {
  const count = new Map<MetalId, number>();
  let all = 0;
  let kind: "raw" | "etch" | "patina" = "raw";
  if (pred.ops[0]?.op === "plate") {
    const r = buildRelief(toReliefOps(pred), seed);
    kind = r.color === "none" ? "raw" : r.color;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const p = pointAt(r, (i + 0.5) / n, (j + 0.5) / n);
        if (p.hole) continue;
        const m = r.materials[topMat(p, r.layers, r.edges)];
        count.set(m, (count.get(m) ?? 0) + 1);
        all++;
      }
  } else {
    const sim = buildSim(toPatternOps(pred), seed);
    kind = sim.color === "none" ? "raw" : sim.color;
    const s = surface(sim, n);
    for (const k of s.layer) {
      const m = metalOf(sim, k);
      count.set(m, (count.get(m) ?? 0) + 1);
      all++;
    }
  }
  const shares = [...count.entries()].map(([metal, c]) => ({ metal, share: all ? c / all : 0 })).sort((a, b) => b.share - a.share);
  const ground = shares[0]?.metal ?? null;
  return { shares, ground, groundColor: ground ? colorWord(PATTERN_METALS[ground][kind]) : null };
}

/**
 * 言った見込み（ground_metal・ground_color・shown_metals）と、計算の絵をくらべ、食いちがいを、やさしい日本語で返す（無ければ空）。
 * 見込みを言っていない答え（古い記録・MCP）や、描かない答えは、くらべない。
 */
export function lookIssues(pred: PatternPrediction, seed = 7): string[] {
  if (!pred.applicable || !pred.ops.length) return [];
  if (!pred.ground_metal && !pred.ground_color && !pred.shown_metals?.length) return [];
  const v = visibleLook(pred, seed);
  const share = (m: MetalId) => v.shares.find((x) => x.metal === m)?.share ?? 0;
  const seen = v.shares.filter((x) => x.share >= LOOK_CHECK.shown);
  const out: string[] = [];
  if (pred.ground_metal && v.ground && pred.ground_metal !== v.ground)
    out.push(`地（表でいちばん広く見える材料）は、見込みでは${name(pred.ground_metal)}ですが、計算の絵では${name(v.ground)}（表の ${pct(share(v.ground))}）でした。${name(pred.ground_metal)}は表の ${pct(share(pred.ground_metal))}。`);
  if (pred.ground_color && v.groundColor && pred.ground_color !== v.groundColor)
    out.push(`地の色は、見込みでは「${pred.ground_color}」ですが、計算の絵では「${v.groundColor}」でした（${v.ground ? name(v.ground) : ""}、最後の色の出し方による絵の色）。`);
  for (const m of pred.shown_metals ?? [])
    if (share(m) < LOOK_CHECK.shown) out.push(`見えるはずと言った${name(m)}が、計算の絵の表に出ませんでした（深さがその層に届かない、削りが浅い・深すぎる、重ねる順、などを見てください）。`);
  for (const x of seen)
    if (x.share >= LOOK_CHECK.extra && x.metal !== pred.ground_metal && !(pred.shown_metals ?? []).includes(x.metal))
      out.push(`見込みで言っていない${name(x.metal)}が、計算の絵の表の ${pct(x.share)} に出ました。`);
  return out;
}

/** 食いちがいを Claude に知らせ、1 回だけ直してもらう文 */
export function lookReviewText(issues: readonly string[], toolName: string): string {
  return `計算で絵を描いて、あなたの見込み（ground_metal・ground_color・shown_metals）とくらべました。食いちがう所があります：
${issues.map((t) => `- ${t}`).join("\n")}
look に書いた見込みに絵が近づくよう、ops の値（重ねる材料と順・枚数・深さ・削る深さ・色の出し方など）を直して、${toolName} をもう一度 1 回だけ呼んでください。
直すのは絵のための仮の値だけです。手がかりや案に合わない材料・工程を、色を合わせるためだけに足したり変えたりしないでください。
この計算では見込みの見た目が出せない（または見込みの方がまちがっていた）と分かったときは、値はそのままでよいので、look・ground_metal・ground_color・shown_metals を絵に合わせて直し、出せない所を cannot_show に書いてください。`;
}

/** callTool に渡す確かめ（predict_pattern の答えを計算でくらべる） */
export const reviewPattern = (toolName: string, seed = 7) => (pred: PatternPrediction): string | null => {
  const issues = lookIssues(pred, seed);
  return issues.length ? lookReviewText(issues, toolName) : null;
};

/** 受け取った答えから、案に残す記録を作る。1 回目を直してもらったなら、1 回目の答えと食いちがいも残し、直したあとも食いちがう所を notes に書く */
export function patternRecordOf(
  r: { value: PatternPrediction; warnings?: string[]; reviewed?: { first: PatternPrediction; unanswered?: true } },
  date: string,
  seed = 7,
): PatternRecord {
  const notes = [...(r.warnings ?? [])];
  let firstTry: PatternRecord["firstTry"];
  if (r.reviewed) {
    const issues = lookIssues(r.reviewed.first, seed);
    firstTry = { prediction: r.reviewed.first, issues };
    notes.push(
      r.reviewed.unanswered
        ? `1 回目の答えは、言った見込みと計算の絵が食いちがったので直してもらおうとしましたが、受け取れなかったので 1 回目の答えのままです（${issues.join(" ")}）`
        : `1 回目の答えは、言った見込みと計算の絵が食いちがったので、1 回だけ直してもらいました（1 回目：${issues.join(" ")}）`,
    );
  }
  const left = r.reviewed?.unanswered ? [] : lookIssues(r.value, seed);
  if (left.length) notes.push(`言った見込みと計算の絵が、まだ食いちがう所：${left.join(" ")}`);
  return { date, prediction: r.value, notes, ...(firstTry ? { firstTry } : {}) };
}
