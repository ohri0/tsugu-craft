// 作れない所に添える、職人の言葉を選ぶ（2026-11-08 初めての人の試し）。
// ラウンドの 4 本爪で「爪が石を押さえる力が足りない」に、三角の石の 3 本爪の決まり「（…大丈夫？に）大丈夫」を添えていた。
// 決まりが今の石の形・爪の本数・条件に当てはまるときだけ添える。

import type { Rule } from "./ledger";

/** 決まりが当てはまるかを決める、今の設計のようす */
export interface RuleContext {
  /** 角が 3 つの石を、角に 1 本ずつの爪で留めているか（checks.ts の cornerSetCount が数を返すとき） */
  cornerSet: boolean;
}

/** その決まりが、今の設計に当てはまるか */
export function ruleApplies(r: Rule, ctx: RuleContext): boolean {
  // 「三角の石を 3 本爪で留めるとき」は、角に 1 本ずつ爪があるときだけの決まり
  if (r.param === "hold.cornerSet") return ctx.cornerSet;
  return true;
}

/** 石を押さえる力の比べを、ふつうの言葉で（例：標準の 4 本爪の 4 分の 1 ほど → 標準と同じ以上） */
export function holdPlain(current: number, need: number): string {
  const pct = Math.round(current * 100);
  const needWord = Math.abs(need - 1) < 1e-9 ? "標準と同じ（1.00 倍）" : `標準の ${need.toFixed(2)} 倍`;
  return `爪の太さ・本数・長さから見て、石を押さえる力が、標準の太さの 4 本爪の 約 ${pct} %（${current.toFixed(2)} 倍）しかありません。${needWord}以上にしてください。`;
}
