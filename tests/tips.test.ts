import { describe, expect, it } from "vitest";
import { parseTips, tipsFor, tipsPrompt } from "../src/studio/tips";
import type { WorkRecord } from "../src/studio/works";

const steps = ["材料を用意する", "座を彫って、石を留める", "仕上げ"];
const work = (id: string, tips: WorkRecord["tips"]): WorkRecord => ({ id, date: "2026-11-02", title: "指輪", kind: "一粒石の指輪", methodLabel: "鍛造", image: "", specs: [], problems: [], steps: [], note: "", maker: "石川", tips });

describe("話して残す", () => {
  it("工程の一覧にある題だけを受け取る", () => {
    const p = parseTips(steps);
    const ok = p({ tips: [{ step: "座を彫って、石を留める", text: "座は浅めに", kind: "コツ" }], left_over: "" });
    expect(ok.ok && ok.value.tips[0].step).toBe("座を彫って、石を留める");
    expect(p({ tips: [{ step: "石を磨く", text: "x", kind: "コツ" }], left_over: "" }).ok).toBe(false);
  });
  it("前の記録から、同じ工程のコツを新しい順に、同じ文は 1 回だけ", () => {
    const works = [work("b", [{ step: "仕上げ", text: "爪の先を丸く", kind: "注意" }]), work("a", [{ step: "仕上げ", text: "爪の先を丸く", kind: "注意" }, { step: "仕上げ", text: "最後にルーペで見る", kind: "コツ" }])];
    const t = tipsFor(works, "仕上げ");
    expect(t.map((x) => x.text)).toEqual(["爪の先を丸く", "最後にルーペで見る"]);
    expect(tipsFor(works, "材料を用意する")).toEqual([]);
  });
  it("頼み方に工程の一覧が入り、話にないことを足さないと書く", () => {
    const s = tipsPrompt(steps);
    expect(s).toContain("「仕上げ」");
    expect(s).toContain("足しません");
  });
});
