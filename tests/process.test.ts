import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALLOY,
  BEZEL_DETAILS,
  CAST_DETAILS,
  FINISH_DETAILS,
  FORGE_DETAILS,
  PRONG_DETAILS,
  TERMS,
  rangeC,
  termsIn,
  type Detail,
} from "../src/studio/process";

const allDetails: Detail[] = [
  ...Object.values(CAST_DETAILS).flat(),
  ...Object.values(FORGE_DETAILS).flat(),
  ...PRONG_DETAILS,
  ...BEZEL_DETAILS,
  ...FINISH_DETAILS,
];

/** docs/RESEARCH-making.md の出典の表にある番号 */
const research = readFileSync(new URL("../docs/RESEARCH-making.md", import.meta.url), "utf8");
const knownSources = new Set([...research.matchAll(/^\| (S\d+) \|/gm)].map((m) => m[1]));

describe("作り方の詳しい手順", () => {
  it("鋳造と手作りの工程が、決めた名前でそろっている", () => {
    expect(Object.keys(CAST_DETAILS)).toEqual(["model", "sprue", "invest", "burnout", "pour", "divest", "clean", "cut_sprue"]);
    expect(Object.keys(FORGE_DETAILS)).toEqual(["material", "anneal", "roll", "cut", "bend", "solder", "true"]);
    for (const list of [...Object.values(CAST_DETAILS), ...Object.values(FORGE_DETAILS), PRONG_DETAILS, BEZEL_DETAILS, FINISH_DETAILS]) {
      expect(list.length).toBeGreaterThan(0);
    }
  });

  it("焼きなましは、石川工房の「ゆっくり冷ます」を先に書き、水で冷やすは注だけ（2026-11-04 職人の言葉）", () => {
    const a = FORGE_DETAILS.anneal.map((d) => d.text);
    const mine = a.findIndex((t) => t.startsWith("石川工房：ゆっくり冷ます"));
    expect(mine).toBeGreaterThanOrEqual(0);
    for (const [i, t] of a.entries()) if (i !== mine && /水/.test(t)) expect(t.startsWith("注：") && i > mine, t).toBe(true);
    const note = FORGE_DETAILS.anneal.find((d) => d.text.startsWith("注："))!;
    expect(note.src!.length).toBeGreaterThan(0);
  });

  it("数字の入った手順には、必ず出典が付いている", () => {
    const missing = allDetails.filter((d) => /[0-9０-９]/.test(d.text) && !(d.src && d.src.length > 0));
    expect(missing.map((d) => d.text)).toEqual([]);
  });

  it("出典の番号は、すべて調べの文書にある", () => {
    expect(knownSources.size).toBeGreaterThan(10);
    const used = new Set([...allDetails.flatMap((d) => d.src ?? []), ...Object.values(ALLOY).flatMap((a) => a.src)]);
    for (const id of used) expect(knownSources.has(id), id).toBe(true);
  });

  it("文は短い（1 行に収まる）", () => {
    for (const d of allDetails) expect(d.text.length, d.text).toBeLessThanOrEqual(60);
    for (const t of TERMS) expect(t.meaning.length, t.word).toBeLessThanOrEqual(40);
  });

  it("文に会社や商品の名前らしい英字の語が無い", () => {
    const texts = [...allDetails.map((d) => d.text), ...TERMS.map((t) => t.meaning), ...Object.values(ALLOY).map((a) => a.note)];
    for (const s of texts) expect(s, s).not.toMatch(/[A-Za-z]{4,}/);
  });
});

describe("ことばの説明", () => {
  it("同じことばが二度ない", () => {
    const words = TERMS.map((t) => t.word);
    expect(new Set(words).size).toBe(words.length);
  });

  it("文に出てくることばを、出てくる順に返す", () => {
    const found = termsIn("フラスコに湯道を付けて、焼きなましをする。").map((t) => t.word);
    expect(found).toEqual(["フラスコ", "湯道", "焼きなまし"]);
    expect(termsIn("ふつうの文。")).toEqual([]);
  });

  it("長いことばの中だけにある短いことばは返さない", () => {
    expect(termsIn("V 字の爪で角を包む。").map((t) => t.word)).toEqual(["V 字の爪"]);
    expect(termsIn("爪を倒す。V 字の爪も。").map((t) => t.word)).toEqual(["爪", "V 字の爪"]);
  });

  it("手順の中の大事なことばに、説明がある", () => {
    const words = new Set(allDetails.flatMap((d) => termsIn(d.text)).map((t) => t.word));
    for (const w of ["湯道", "フラスコ", "焼きなまし", "座", "ガードル", "埋没材", "酸洗い", "芯金"]) expect(words.has(w), w).toBe(true);
  });
});

describe("地金ごとの温度", () => {
  it("幅は小さい方から大きい方の順", () => {
    for (const [id, a] of Object.entries(ALLOY)) {
      for (const r of [a.meltC, a.castC, a.flaskC, a.annealC]) {
        if (!r) continue;
        expect(r[0], id).toBeGreaterThan(0);
        expect(r[0], id).toBeLessThanOrEqual(r[1]);
      }
    }
  });

  it("鋳込みは溶ける温度より高く、フラスコと焼きなましは溶ける温度より低い", () => {
    for (const [id, a] of Object.entries(ALLOY)) {
      if (a.meltC && a.castC) expect(a.castC[0], id).toBeGreaterThan(a.meltC[1]);
      if (a.castC && a.flaskC) expect(a.flaskC[1], id).toBeLessThan(a.castC[0]);
      if (a.castC && a.annealC) expect(a.annealC[1], id).toBeLessThan(a.castC[0]);
      if (a.meltC && a.annealC) expect(a.annealC[1], id).toBeLessThan(a.meltC[0]);
      expect(a.src.length, id).toBeGreaterThan(0);
    }
  });

  it("プラチナはリン酸塩系、金と銀は石膏系の埋没材", () => {
    expect(ALLOY.pt900.investment).toBe("phosphate");
    expect(ALLOY.k18y.investment).toBe("gypsum");
    expect(ALLOY.sv925.investment).toBe("gypsum");
  });

  it("幅を画面の言葉にする（値が無いときは鋳造所・職人の値）", () => {
    expect(rangeC([620, 677])).toBe("620〜677 ℃");
    expect(rangeC([593, 593])).toBe("約 593 ℃");
    expect(rangeC(undefined)).toBe("鋳造所・職人の値");
  });
});
