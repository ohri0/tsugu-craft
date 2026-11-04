// 帳面を大きくしたとき（2026-11-04）：どの決まりにも出どころ（URL）があるか、仮と書いてあるか。
// 技ごとに職人に聞く所があるか。学ぶ（Claude なし）が大きくなった帳面から答えるか。
import { describe, expect, it } from "vitest";
import repo from "../ledger/jewelry.json";
import { checkShank } from "../src/rules/checks";
import { answerToDraft, applyDraft, ringGaps, techGaps } from "../src/rules/gaps";
import { activeRules, addRule, effectiveGuides, publicRingRules, seedLedger, sourceLabel, type Ledger, type Rule } from "../src/rules/ledger";
import { findRules } from "../src/rules/search";
import { seedTechLedger, TECH_IDS, TECHS } from "../src/rules/techniques";
import { bookLabel, masterName } from "../src/app/master";

const ring = repo as Ledger;

/** 出どころが確かめられる形か：資料なら URL、そうでなければ「仮」か職人 */
function sourced(r: Rule<string>): boolean {
  if (r.source.kind === "public") return typeof r.source.url === "string" && /^https:\/\//.test(r.source.url);
  return r.source.kind === "provisional" || r.source.kind === "craftsman";
}

describe("はじめから入れた決まりの出どころ", () => {
  const seeds: [string, Rule<string>[]][] = [
    ["リポジトリの帳面", ring.rules as Rule<string>[]],
    ["公開情報だけの帳面", seedLedger().rules as Rule<string>[]],
    ...TECH_IDS.map((id) => [TECHS[id].name, seedTechLedger(id).rules] as [string, Rule<string>[]]),
  ];
  for (const [name, rules] of seeds) {
    it(`${name}：どの決まりも、資料の URL があるか、仮か、職人の決まり`, () => {
      const bad = rules.filter((r) => !sourced(r)).map((r) => r.id);
      expect(bad).toEqual([]);
      for (const r of rules) {
        expect(r.title.length).toBeGreaterThan(0);
        expect(r.text.length).toBeGreaterThan(0);
        expect(r.reason.length).toBeGreaterThan(0);
        expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  }

  // 資料の決まりには、言葉（quote）を入れていない
  it("今回足した資料の決まりに、言葉（quote）を入れていない", () => {
    for (const [name, rules] of seeds) for (const r of rules) if (r.source.kind !== "craftsman") expect(r.quote, `${name} ${r.id}`).toBeUndefined();
  });

  it("指輪の帳面は、資料の決まりを 25 以上もち、リポジトリの帳面にもすべて入っている", () => {
    const pub = publicRingRules();
    expect(pub.length).toBeGreaterThanOrEqual(25);
    const ids = new Set(ring.rules.map((r) => r.id));
    for (const r of pub) expect(ids.has(r.id)).toBe(true);
    expect(new Set(pub.map((r) => r.id)).size).toBe(pub.length);
  });

  it("職人の決まりは 8 つ（爪の最低の太さ・角に 1 本ずつ・腕の間に挟む・覆輪の壁・ロウ付けのあとの冷まし方・爪は腕を避ける・爪の下は石座に沿う・小さな石は別の留め方）、名前は石川", () => {
    const mine = activeRules(ring).filter((r) => r.source.kind === "craftsman");
    expect(mine).toHaveLength(8);
    for (const r of mine) expect(sourceLabel(r.source)).toBe("職人：石川");
  });
});

describe("工房の名前", () => {
  it("はじめの帳面の呼び名は工房の名前。職人の名前はそのまま", () => {
    expect(bookLabel(ring)).toBe("石川工房");
    expect(masterName(ring)).toBe("石川");
  });
});

describe("腕の厚み・幅も帳面の値で確かめる", () => {
  it("資料の値（guides.ts と同じ）が入り、職人の値で置き換わる", () => {
    const g = effectiveGuides(ring);
    expect(g.band.minThicknessMm).toBe(1.2);
    expect(g.band.minWidthMm).toBe(1.7);
    const l = addRule(ring, { title: "腕", text: "腕は 1.5 mm 以上", reason: "r", param: "band.minThicknessMm", value: 1.5, source: { kind: "craftsman", name: "石川" }, date: "2026-11-04" });
    const g2 = effectiveGuides(l);
    expect(g2.band.minThicknessMm).toBe(1.5);
    expect(checkShank({ thicknessMm: 1.3, widthMm: 2 }, { guides: g2 }).map((p) => p.check)).toEqual(["band-thin"]);
    expect(checkShank({ thicknessMm: 1.3, widthMm: 2 }, { guides: g })).toEqual([]);
  });
  it("聞き取りは、腕の値も資料のままか聞く", () => {
    const ids = ringGaps(ring).map((x) => x.id);
    expect(ids).toContain("ring:band.minThicknessMm");
    expect(ids).toContain("ring:band.minWidthMm");
  });
  it("未確認の言葉の決まりは、職人に確かめる問いになる。「はい」でその決まりを置き換える", () => {
    const g = ringGaps(ring).find((x) => x.id === "ring:confirm:cushion-double-prong")!;
    expect(g.kind).toBe("unverified");
    const d = answerToDraft(g, "はい、そうしています", { name: "石川", date: "2026-11-04" });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const l = applyDraft(ring, d.draft as never);
    expect(ringGaps(l).some((x) => x.id === g.id)).toBe(false);
    expect(activeRules(l).some((r) => r.id === "cushion-double-prong")).toBe(false);
  });
});

describe("ほかの技の帳面", () => {
  it("技は 6 つ。どの技にも決まりと、職人に聞く所がある", () => {
    expect(TECH_IDS).toEqual(["bezel", "milgrain", "tsuchime", "kebori", "nunome", "mokume"]);
    for (const id of TECH_IDS) {
      const l = seedTechLedger(id);
      expect(l.rules.length).toBeGreaterThanOrEqual(4);
      const gaps = techGaps(id, l);
      expect(gaps.length).toBeGreaterThanOrEqual(2);
      for (const g of gaps) {
        expect(g.technique).toBe(id);
        expect(g.question).toMatch(/[？?]$/);
      }
    }
  });
  it("答えると職人の決まりになり、その問いは消える（数字は答えの言葉の中だけ）", () => {
    const l = seedTechLedger("milgrain");
    const g = techGaps("milgrain", l)[0];
    const d = answerToDraft(g, "縁の幅と同じくらいの鏨を選ぶ", { name: "石川", date: "2026-11-04" });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.draft.value).toBeUndefined();
    const next = applyDraft<string>(l, d.draft);
    expect(activeRules(next).at(-1)!.source).toEqual({ kind: "craftsman", name: "石川" });
    expect(techGaps("milgrain", next).some((x) => x.id === g.id)).toBe(false);
  });
});

describe("学ぶ（Claude なし）は、大きくなった帳面から答える", () => {
  const rules = activeRules(ring);
  const top = (q: string) => findRules(q, rules)[0]?.id;
  it.each([
    ["エメラルドはロウ付けの前に外す？", "heat-sensitive-stones"],
    ["ロウはどの順に使う？", "solder-order"],
    ["10 号の内径は？", "ring-size-go"],
    ["プラチナのサイズ直しは？", "platinum-sizing"],
  ])("%s", (q, id) => {
    expect(top(q)).toBe(id);
  });
});
