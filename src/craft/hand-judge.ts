// 道具の扱いの判定（2026-11-07 作者の頼み）：道具ごとに道具を追いかけ、手本（いい例）と比べて、扱えているかを判定する。
// いまはヤスリ。ほかの道具も、手本を残せば同じしくみで比べられる（道具の線は src/craft/tool-line.ts、手の点は MediaPipe）。
//
// 3 つの項目（職人（石川）が言った所）：
//   金属の固定   … 押さえる手のふらつき
//   ヤスリの角度 … ヤスリの縁の線の角度のぶれ
//   ストローク   … ヤスリを持つ手の 1 回の往復の長さと、長さのそろい方
// 線は手本の値を 1 とした倍（GUIDES.handJudge。仮の線）。測れなかった項目は判定しない（数を作らない）。
import { GUIDES } from "../rules/guides";
import type { TakeMeasure } from "./pair-measure";

export type JudgeKey = "hold" | "angle" | "stroke";
export type JudgeMark = "○" | "△" | "×";

export interface JudgeRow {
  key: JudgeKey;
  label: string;
  /** 手本と、この動画の値の字 */
  base: string;
  you: string;
  /** 手本の何倍悪いか（1 未満は 1。判定できなければ null） */
  ratio: number | null;
  mark: JudgeMark | null;
  /** ひとこと（例：ストロークが安定していない）。判定できないときは、そのわけ */
  say: string;
}

type Th = { okRatio: number; warnRatio: number; strokeEvenSpread: number; strokeSpreadFloor: number; minStrokes: number };

export const markOf = (ratio: number, th: Th = GUIDES.handJudge): JudgeMark => (ratio <= th.okRatio ? "○" : ratio <= th.warnRatio ? "△" : "×");

const median = (xs: readonly number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** ストロークの様子：回数・真ん中の長さ・幅（最長 − 最短）÷ 真ん中 */
export function strokeStats(xs: readonly number[]) {
  if (!xs.length) return null;
  const mid = median(xs);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  return { n: xs.length, mid, min, max, spread: mid > 0 ? (max - min) / mid : Infinity };
}

const strokeText = (xs: readonly number[], th: Th) => {
  const s = strokeStats(xs);
  if (!s) return "数えられず";
  // 長さは手のひらの長さを 1 とした倍（2026-11-08：単位のない数だった）
  return `${s.n} 回・長さが${s.spread <= th.strokeEvenSpread ? "そろう" : "ばらばら"}（手のひらの ${s.min.toFixed(1)}〜${s.max.toFixed(1)} 倍）`;
};

/** 手本（base）と比べて、3 つの項目を判定する */
export function judgeTake(base: TakeMeasure, you: TakeMeasure, names: { hold: string; tool: string }, th: Th = GUIDES.handJudge): JudgeRow[] {
  const rows: JudgeRow[] = [];

  // 金属の固定：押さえる手のふらつき（手のひらの長さを 1 として。0.02 より小さい値は 0.02 として割る）
  {
    const ok = base.hold !== null && you.hold !== null;
    const ratio = ok ? Math.max(1, Math.max(you.hold!, 0.02) / Math.max(base.hold!, 0.02)) : null;
    rows.push({
      key: "hold",
      label: "金属の固定",
      // 揺れは手のひらの長さを 1 とした倍（2026-11-08：単位のない数だった）
      base: base.hold === null ? "-" : `揺れ 手のひらの ${base.hold.toFixed(2)} 倍`,
      you: you.hold === null ? "-" : `揺れ 手のひらの ${you.hold.toFixed(2)} 倍`,
      ratio,
      mark: ratio === null ? null : markOf(ratio, th),
      say:
        ratio === null
          ? `${names.hold}が映っていない所が多く、判定できません`
          : ratio <= th.okRatio
            ? `${names.hold}が止まっている`
            : `${names.hold}がふらつく（手本の ${ratio.toFixed(1)} 倍）`,
    });
  }

  // ヤスリの角度：ヤスリの縁の線の角度のぶれ（度。0.2° より小さい値は 0.2° として割る）
  {
    const ok = base.angle !== null && you.angle !== null;
    const ratio = ok ? Math.max(1, Math.max(you.angle!, 0.2) / Math.max(base.angle!, 0.2)) : null;
    rows.push({
      key: "angle",
      label: `${names.tool}の角度`,
      base: base.angle === null ? "-" : `ぶれ ${base.angle.toFixed(1)}°`,
      you: you.angle === null ? "-" : `ぶれ ${you.angle.toFixed(1)}°`,
      ratio,
      mark: ratio === null ? null : markOf(ratio, th),
      say:
        ratio === null
          ? `${names.tool}の線が見つかったこまが少なく、判定できません`
          : ratio <= th.okRatio
            ? `${names.tool}の角度が変わらない`
            : `${names.tool}の角度がぶれる（手本の ${ratio.toFixed(1)} 倍）`,
    });
  }

  // ストローク：短すぎる（手本の真ん中 ÷ この動画の真ん中）と、ばらつく（幅の比べ）の、悪い方
  {
    const b = strokeStats(base.strokes);
    const y = strokeStats(you.strokes);
    const ok = !!b && !!y && b.n >= th.minStrokes && y.n >= th.minStrokes;
    let ratio: number | null = null;
    let say = `往復を ${th.minStrokes} 回以上数えられず、判定できません`;
    if (ok) {
      const shortR = Math.max(1, b!.mid / y!.mid);
      const unevenR = Math.max(1, Math.max(y!.spread, th.strokeSpreadFloor) / Math.max(b!.spread, th.strokeSpreadFloor));
      ratio = Math.max(shortR, unevenR);
      say =
        ratio <= th.okRatio
          ? "ストロークが安定している"
          : unevenR >= shortR
            ? `ストロークが安定していない（長さがばらばら${shortR > th.okRatio ? "・短い" : ""}）`
            : "1 回の動きが短い";
    }
    rows.push({ key: "stroke", label: "ストローク", base: strokeText(base.strokes, th), you: strokeText(you.strokes, th), ratio, mark: ratio === null ? null : markOf(ratio, th), say });
  }
  return rows;
}
