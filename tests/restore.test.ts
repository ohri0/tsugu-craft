// 「自分の技を組み立て直す」（本番）のテスト。手がかりと結果の記録、Claude の案の確かめ、前の案との違い、書き出しと読み込み、保存の失敗。
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { isAllowedToolName } from "../src/claude/tools";
import { listProjects, loadDraft, loadProject, removeProject, SAVE_FAILED, saveDraft, saveProject, type StorageLike } from "../src/app/restore-store";
import {
  addClue,
  addTechRule,
  applyPlan,
  clueRefs,
  freshSince,
  isAssertive,
  knownClueIds,
  newProject,
  parseRestoreFile,
  pastResults,
  planDiff,
  readProject,
  removeClue,
  removeTechRule,
  resultFor,
  setResult,
  sourceText,
  toFile,
  unsourcedNumbers,
  usableResults,
  type RestorationOutput,
  type RestoreProject,
} from "../src/rebuild/restore";
import { clueText, PHOTO_SEND, photosToSend, restoreContent, restorePrompt, ruleRequest, techRulePrompt } from "../src/rebuild/restore-prompt";
import { parseRestoration, PROPOSE_RESTORATION } from "../src/rebuild/restore-tools";

const DAY = "2026-11-05";

function withClues(): RestoreProject {
  let p = newProject("r1", " 試しの技 ", DAY);
  for (const [kind, title, text] of [
    ["object", "表の模様", "銀の表に白いまだらがある。"],
    ["record", "蔵の覚え書き", "灰を洗いて三度かけ、とある。"],
    ["material", "土の皿", "底に白い粉がついた皿が出た。"],
  ] as const) {
    const r = addClue(p, { kind, title, text }, DAY);
    if ("error" in r) throw new Error(r.error);
    p = r.project;
  }
  return p;
}

function step(over: Record<string, unknown> = {}) {
  return { title: "灰を洗う", detail: "灰を水で洗う。", clue_ids: ["C2"], basis: "clues", confidence: 2, uncertain: "", caution: "", prev_step: 0, change: "new", change_note: "", ...over };
}

function goodInput(over: Record<string, unknown> = {}) {
  return {
    steps: [step(), step({ title: "灰をかける", detail: "銀の表に灰をかける。", clue_ids: ["C1", "C2"] }), step({ title: "火であぶる", detail: "火であぶる。", clue_ids: [], basis: "prior", confidence: 1, uncertain: "何度かは分からない", caution: "熱い" })],
    dropped: [],
    unknowns: [{ what: "灰の種類", why: "灰で結果が変わるかもしれない", step: 1 }],
    next_checks: [{ what: "小さな切れ端で灰を試す", why: "まだらが出るかが分かる", kind: "trial", step: 2, caution: "" }],
    summary: "灰をかけてあぶる案です。",
    changes: "",
    ...over,
  };
}

function parsed(input: unknown, p: RestoreProject): RestorationOutput {
  const r = parseRestoration(input, { ids: knownClueIds(p), prev: p.plans.at(-1) });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function withPlan(p: RestoreProject = withClues()): RestoreProject {
  return applyPlan(p, parsed(goodInput(), p), { date: DAY, sent: clueRefs(p), photosSent: [], sources: sourceText(p) });
}

describe("手がかり", () => {
  it("1 つずつ足すと番号がつき、消しても番号を使い回さない", () => {
    const p = withClues();
    expect(p.name).toBe("試しの技");
    expect(p.clues.map((c) => c.id)).toEqual(["C1", "C2", "C3"]);
    const gone = removeClue(p, "C2", DAY);
    expect(gone.clues.map((c) => c.id)).toEqual(["C1", "C3"]);
    const r = addClue(gone, { kind: "opinion", text: "職人はこう見る" }, DAY);
    if ("error" in r) throw new Error(r.error);
    expect(r.clue.id).toBe("C4");
  });

  it("文も写真もなければ足さない。写真だけ・見出しなしでも足せる", () => {
    const p = newProject("r", "技", DAY);
    expect(addClue(p, { kind: "object", text: "  " }, DAY)).toEqual({ error: expect.stringContaining("写真") });
    const onlyPhoto = addClue(p, { kind: "object", text: "", photo: { w: 10, h: 10, bytes: 100 } }, DAY);
    if ("error" in onlyPhoto) throw new Error(onlyPhoto.error);
    expect(onlyPhoto.clue.title).toBe("写真");
    const noTitle = addClue(p, { kind: "record", text: "とても長い文がここに書いてあるので見出しは頭の方だけになるはずです" }, DAY);
    if ("error" in noTitle) throw new Error(noTitle.error);
    expect(noTitle.clue.title.endsWith("…")).toBe(true);
  });
});

describe("Claude の案を受け取る", () => {
  it("正しい入力を受け取り、案として足す", () => {
    const p = withPlan();
    expect(p.plans).toHaveLength(1);
    const plan = p.plans[0];
    expect(plan.version).toBe(1);
    expect(plan.steps.map((s) => s.key)).toEqual(["s1", "s2", "s3"]);
    expect(plan.steps.every((s) => s.change === "new")).toBe(true);
    expect(plan.steps[2]).toMatchObject({ basis: "prior", clue_ids: [], uncertain: "何度かは分からない", caution: "熱い" });
    expect(plan.clues.map((c) => c.id)).toEqual(["C1", "C2", "C3"]);
    expect(plan.nextChecks[0].kind).toBe("trial");
    expect(planDiff(plan)).toBeNull();
  });

  it("渡していない番号は外し、番号が無くなった工程はもともとの知識からにする。prior の番号は消す", () => {
    const p = withClues();
    const input = goodInput({ steps: [step({ clue_ids: ["C2", "C99"] }), step({ clue_ids: ["T9"] }), step({ basis: "prior", clue_ids: ["C1"] })] });
    const r = parseRestoration(input, { ids: knownClueIds(p) });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.steps[0].clue_ids).toEqual(["C2"]);
    expect(r.value.steps[1]).toMatchObject({ basis: "prior", clue_ids: [] });
    expect(r.value.steps[2].clue_ids).toEqual([]);
    expect(r.warnings?.some((w) => w.includes("C99"))).toBe(true);
  });

  it("工程が無い・分かっていない所が無い・次に確かめることが無いときは断る", () => {
    const p = withClues();
    const ids = knownClueIds(p);
    expect(parseRestoration(goodInput({ steps: [] }), { ids })).toMatchObject({ ok: false, error: expect.stringContaining("工程") });
    expect(parseRestoration(goodInput({ unknowns: [] }), { ids })).toMatchObject({ ok: false, error: expect.stringContaining("分かっていない所") });
    expect(parseRestoration(goodInput({ next_checks: [] }), { ids })).toMatchObject({ ok: false, error: expect.stringContaining("次に確かめること") });
    expect(parseRestoration(goodInput({ summary: " " }), { ids }).ok).toBe(false);
    expect(parseRestoration(null, { ids }).ok).toBe(false);
  });

  it("手がかりが少ないときは、工程が 1 つでも受け取る。多すぎる所は外す", () => {
    const p = withClues();
    const many = Array.from({ length: 14 }, (_, i) => ({ what: `所 ${i}`, why: "", step: 99 }));
    const r = parseRestoration(goodInput({ steps: [step()], unknowns: many }), { ids: knownClueIds(p) });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.steps).toHaveLength(1);
    expect(r.value.unknowns).toHaveLength(10);
    expect(r.value.unknowns[0].step).toBe(0); // 無い工程の番号は、全体のこととして
    expect(r.warnings?.some((w) => w.includes("はじめの 10 個"))).toBe(true);
  });

  it("最初の案では、前の案からの続きを書いてきても新しい工程として数える", () => {
    const p = withClues();
    const out = parsed(goodInput({ steps: [step({ prev_step: 3, change: "changed" })] }), p);
    expect(out.steps[0]).toMatchObject({ prev_step: 0, change: "new" });
  });
});

describe("試した結果", () => {
  it("工程ごとに残し、手がかりの番号がつく。同じ案の同じ工程なら書き直す。「まだ」で言葉もなければ消す", () => {
    let p = withPlan();
    const plan = p.plans[0];
    p = setResult(p, plan, plan.steps[0], { outcome: "ng", note: "黒くくもった" }, DAY);
    expect(p.results[0]).toMatchObject({ id: "T1", stepKey: "s1", planVersion: 1, outcome: "ng", note: "黒くくもった", stepTitle: "灰を洗う" });
    p = setResult(p, plan, plan.steps[0], { outcome: "ok", note: "2 度目はよかった" }, DAY);
    expect(p.results).toHaveLength(1);
    expect(p.results[0]).toMatchObject({ id: "T1", outcome: "ok" });
    p = setResult(p, plan, plan.steps[1], { outcome: "pending", note: "まだ途中" }, DAY);
    expect(p.results.map((r) => r.id)).toEqual(["T1", "T2"]);
    expect(usableResults(p)).toHaveLength(2);
    expect(knownClueIds(p)).toContain("T2");
    p = setResult(p, plan, plan.steps[1], { outcome: "pending", note: " " }, DAY);
    expect(p.results.map((r) => r.id)).toEqual(["T1"]);
  });

  it("組み立て直すと結果が手がかりに加わり、Claude が引ける", () => {
    let p = withPlan();
    const plan = p.plans[0];
    p = setResult(p, plan, plan.steps[0], { outcome: "ng", note: "黒くくもった" }, DAY);
    expect(freshSince(p)).toEqual({ clues: 0, results: 1, removed: 0 });
    const text = clueText(p, new Set());
    expect(text).toContain("T1 案 1 の工程「灰を洗う」を職人が試した：いかなかった");
    expect(text).toContain("職人の言葉：黒くくもった");
    const out = parsed(goodInput({ steps: [step({ clue_ids: ["T1"], prev_step: 1, change: "changed", change_note: "T1 から変えた" }), step({ prev_step: 2, change: "same", clue_ids: ["C1"] }), step({ prev_step: 3, change: "same", clue_ids: ["C1"] })] }), p);
    expect(out.steps[0].clue_ids).toEqual(["T1"]);
  });
});

describe("前の案との違い", () => {
  function secondPlan() {
    let p = withPlan();
    const v1 = p.plans[0];
    p = setResult(p, v1, v1.steps[0], { outcome: "ng", note: "黒くくもった" }, DAY);
    p = setResult(p, v1, v1.steps[1], { outcome: "ok", note: "まだらが出た" }, DAY);
    const input = goodInput({
      steps: [
        step({ title: "灰を洗い直す", clue_ids: ["T1"], prev_step: 1, change: "changed", change_note: "T1 で黒くくもったので変えた" }),
        step({ title: "灰をかける", detail: "銀の表に灰をかける。", clue_ids: ["C1", "C2", "T2"], prev_step: 2, change: "same" }),
        step({ title: "酸で洗う", detail: "新しく足した。", clue_ids: [], basis: "prior", confidence: 1, prev_step: 0, change: "new" }),
      ],
      dropped: [{ prev_step: 3, why: "T1 から、火は別に考える" }],
      changes: "灰の洗い方を変え、火をやめた。",
    });
    p = applyPlan(p, parsed(input, p), { date: DAY, sent: clueRefs(p), photosSent: [], sources: sourceText(p) });
    return p;
  }

  it("変わった・新しい・やめた・そのままを数える", () => {
    const p = secondPlan();
    const v2 = p.plans[1];
    expect(v2.version).toBe(2);
    expect(planDiff(v2)).toEqual({ same: 1, changed: 1, added: 1, dropped: 1 });
    expect(v2.changes).toContain("火をやめた");
    expect(v2.dropped).toEqual([{ key: "s3", title: "火であぶる", why: "T1 から、火は別に考える" }]);
    // 続けた工程は前の印を引き継ぎ、新しい工程には新しい印
    expect(v2.steps.map((s) => s.key)).toEqual(["s1", "s2", "s4"]);
    expect(v2.steps[0]).toMatchObject({ prevStep: 1, changeNote: "T1 で黒くくもったので変えた" });
    // 前の案は消えない
    expect(p.plans[0].steps[2].title).toBe("火であぶる");
  });

  it("「そのまま」の工程は前の結果を引き継ぎ、「変わった」工程は引き継がない（前の結果として見せる）", () => {
    const p = secondPlan();
    const v2 = p.plans[1];
    expect(resultFor(p, v2, v2.steps[1])).toMatchObject({ carried: true, result: { outcome: "ok" } });
    expect(resultFor(p, v2, v2.steps[0])).toBeNull();
    expect(pastResults(p, v2, v2.steps[0]).map((r) => r.outcome)).toEqual(["ng"]);
    // 新しい案の工程に結果を書くと、その案の結果になる
    const next = setResult(p, v2, v2.steps[1], { outcome: "ng", note: "こんどはだめ" }, DAY);
    expect(resultFor(next, v2, v2.steps[1])).toMatchObject({ carried: false, result: { outcome: "ng", planVersion: 2 } });
    expect(resultFor(next, next.plans[0], next.plans[0].steps[1])).toMatchObject({ carried: false, result: { outcome: "ok" } });
  });

  it("どうなったか書かれなかった前の工程は、やめた工程として出す。やめたのに続けている工程は外す", () => {
    let p = withPlan();
    const input = goodInput({ steps: [step({ prev_step: 1, change: "same" })], dropped: [{ prev_step: 1, why: "矛盾" }, { prev_step: 2, why: "やめた" }, { prev_step: 9, why: "無い番号" }] });
    const r = parseRestoration(input, { ids: knownClueIds(p), prev: p.plans[0] });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.dropped).toEqual([
      { prev_step: 2, why: "やめた" },
      { prev_step: 3, why: "" },
    ]);
    expect(r.warnings?.some((w) => w.includes("工程 3"))).toBe(true);
    p = applyPlan(p, r.value, { date: DAY, sent: clueRefs(p), photosSent: [], sources: sourceText(p) });
    expect(p.plans[1].dropped.map((d) => d.key)).toEqual(["s2", "s3"]);
  });

  it("1 つの工程を 2 つに分けたら、後ろの工程には新しい印をつける", () => {
    let p = withPlan();
    const r = parseRestoration(goodInput({ steps: [step({ prev_step: 1, change: "changed" }), step({ prev_step: 1, change: "changed" }), step({ prev_step: 2, change: "same" }), step({ prev_step: 3, change: "same" })] }), { ids: knownClueIds(p), prev: p.plans[0] });
    if (!r.ok) throw new Error(r.error);
    p = applyPlan(p, r.value, { date: DAY, sent: clueRefs(p), photosSent: [], sources: sourceText(p) });
    expect(p.plans[1].steps.map((s) => s.key)).toEqual(["s1", "s4", "s2", "s3"]);
    expect(p.nextStep).toBe(5);
  });
});

describe("数字と言い切りの見張り", () => {
  it("手がかりにない数字（単位つき）を見つける。漢数字・全角も読む", () => {
    const sources = "灰を洗いて三度かけ、800 ℃ とある。銅は 3〜4% 入れる。二十日おく。厚さ １ mm";
    expect(unsourcedNumbers("灰を 3 回かけ、800 ℃ であぶり、20 日おく", sources)).toEqual([]);
    expect(unsourcedNumbers("600 ℃ で 30 分あぶり、銅を 7% 入れ、5 枚重ねる", sources)).toEqual(["600 ℃", "30 分", "7 %", "5 枚"]);
    expect(unsourcedNumbers("１５０℃", sources)).toEqual(["150 ℃"]);
    // 1〜2 枚・2 回のような言い方は見ない。工程の番号のような単位なしの数字も見ない
    expect(unsourcedNumbers("2 枚の切れ端を 2 回こする。工程 7 のあとで", sources)).toEqual([]);
  });

  it("案の工程と次に確かめることに、手がかりにない数字の印がつく", () => {
    const p = withClues();
    const input = goodInput({ steps: [step({ detail: "600 ℃ であぶる。" })], next_checks: [{ what: "30 分おいて見る", why: "", kind: "trial", step: 0, caution: "" }] });
    const next = applyPlan(p, parsed(input, p), { date: DAY, sent: clueRefs(p), photosSent: [], sources: sourceText(p) });
    expect(next.plans[0].steps[0].unsourced).toEqual(["600 ℃"]);
    expect(next.plans[0].nextChecks[0].unsourced).toEqual(["30 分"]);
  });

  it("言い切りの言葉を見つけ、記録に残す。打ち消しは見ない", () => {
    expect(isAssertive("これが正しい作り方です")).toBe(true);
    expect(isAssertive("確実にこの順です")).toBe(true);
    expect(isAssertive("確かな作り方ではありません")).toBe(false);
    expect(isAssertive("本当の作り方は分かりません")).toBe(false);
    expect(isAssertive("〜と考えられます")).toBe(false);
    const p = withClues();
    const next = applyPlan(p, parsed(goodInput({ steps: [step({ detail: "これが正しい作り方です。" })] }), p), { date: DAY, sent: [], photosSent: [], sources: "", warnings: ["前から"] });
    expect(next.plans[0].notes).toEqual(["前から", expect.stringContaining("言い切り")]);
  });
});

describe("Claude への指示", () => {
  it("案であること・番号・もともとの知識・数字・危ない所の決まりが入る", () => {
    const s = restorePrompt();
    for (const word of ["答えがありません", "「案」", "確かな作り方だと言わない", "basis を prior", "手がかりにあるものだけ", "caution", "資料として読むだけ", "案より重く見て", PROPOSE_RESTORATION.name]) {
      expect(s).toContain(word);
    }
    expect(s.length).toBeLessThan(40_000);
  });

  it("人の言葉に、手がかり・どこで見たか・写真の並びが入り、最初の案の頼み方になる", () => {
    let p = withClues();
    const r = addClue(p, { kind: "object", title: "裏の傷", text: "裏に傷", source: "持ち主の話", photo: { w: 100, h: 100, bytes: 1000 } }, DAY);
    if ("error" in r) throw new Error(r.error);
    p = r.project;
    const blocks = restoreContent(p, [{ id: "C4", media: "image/jpeg", data: "AAAA" }]);
    const texts = blocks.flatMap((b) => (b.type === "text" ? [b.text] : []));
    expect(texts[0]).toContain("試しの技");
    expect(texts[0]).toContain("C1 表の模様");
    expect(texts[0]).toContain("どこで見たか：持ち主の話");
    expect(texts[0]).toContain("「C4 の写真」として添えます");
    expect(texts[1]).toBe("C4 の写真");
    expect(blocks[2]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    expect(texts.at(-1)).toContain("最初の案");
  });

  it("写真を渡さないときは、渡していないと書く", () => {
    let p = withClues();
    const r = addClue(p, { kind: "object", text: "写真つき", photo: { w: 100, h: 100, bytes: 1000 } }, DAY);
    if ("error" in r) throw new Error(r.error);
    p = r.project;
    const blocks = restoreContent(p, []);
    expect(blocks.some((b) => b.type === "image")).toBe(false);
    expect(blocks[0].type === "text" && blocks[0].text).toContain("写真：あるが、今回は渡していません");
  });

  it("2 回目は前の案と結果を渡す", () => {
    let p = withPlan();
    const plan = p.plans[0];
    p = setResult(p, plan, plan.steps[0], { outcome: "ng", note: "黒くくもった" }, DAY);
    const texts = restoreContent(p, []).flatMap((b) => (b.type === "text" ? [b.text] : []));
    expect(texts[0]).toContain("T1 案 1 の工程");
    const last = texts.at(-1)!;
    expect(last).toContain("前の案（案 1）");
    expect(last).toContain("1. 灰を洗う（根拠 C2）");
    expect(last).toContain("試した結果：いかなかった（T1）");
    expect(last).toContain("3. 火であぶる（もともとの知識から）");
    expect(last).toContain("試した結果：まだ試していない");
    expect(last).toContain("案 2 を出し");
  });

  it("写真は枚数と大きさの上限まで、手がかりの順に渡す", () => {
    const clue = (id: string, bytes: number) => ({ id, kind: "object" as const, title: id, text: "", date: DAY, photo: { w: 1, h: 1, bytes } });
    const many = Array.from({ length: PHOTO_SEND.count + 2 }, (_, i) => clue(`C${i + 1}`, 1000));
    const r = photosToSend(many);
    expect(r.send).toHaveLength(PHOTO_SEND.count);
    expect(r.left).toEqual([`C${PHOTO_SEND.count + 1}`, `C${PHOTO_SEND.count + 2}`]);
    const big = photosToSend([clue("C1", 1_500_000), clue("C2", 1_500_000), clue("C3", 100)]);
    expect(big.send).toEqual(["C1", "C3"]); // 大きすぎる C2 はとばす
    expect(big.left).toEqual(["C2"]);
  });

  it("サーバーが新しい道具を通す。決まりにする頼みに、職人の言葉と、値に結びつけないことが入る", () => {
    expect(isAllowedToolName(PROPOSE_RESTORATION.name)).toBe(true);
    const q = ruleRequest("灰を洗う", "灰を水で洗う", "石川", "三度洗うと白く出た");
    expect(q).toContain("石川さんの言葉：三度洗うと白く出た");
    expect(q).toContain("param と value は付けない");
  });
});

describe("書き出しと読み込み", () => {
  const photo = { media: "image/jpeg", data: "QUJD" };

  function fullProject() {
    let p = withClues();
    const r = addClue(p, { kind: "object", text: "写真つき", photo: { w: 10, h: 10, bytes: 3 } }, DAY);
    if ("error" in r) throw new Error(r.error);
    p = withPlan(r.project);
    const plan = p.plans[0];
    return setResult(p, plan, plan.steps[0], { outcome: "ok", note: "よし" }, DAY);
  }

  it("書き出したファイルを読み込むと、同じ中身に戻る", () => {
    const p = fullProject();
    const file = JSON.parse(JSON.stringify(toFile(p, { C4: photo }, DAY)));
    const r = parseRestoreFile(file);
    if (!r.ok) throw new Error(r.error);
    expect(r.project).toEqual(p);
    expect(r.photos).toEqual({ C4: photo });
    expect(r.warnings).toEqual([]);
  });

  it("ちがう形のファイルは、理由を言って断る", () => {
    expect(parseRestoreFile({ technique: "mokume" })).toMatchObject({ ok: false, error: expect.stringContaining("ファイルではない") });
    expect(parseRestoreFile({ format: "tsugu-restore", version: 99, project: {} })).toMatchObject({ ok: false, error: expect.stringContaining("読めない形") });
    expect(parseRestoreFile({ format: "tsugu-restore", version: 1, project: { id: "../x", name: "a" } })).toMatchObject({ ok: false, error: expect.stringContaining("読めません") });
    expect(parseRestoreFile(null).ok).toBe(false);
  });

  it("おかしい写真は外して知らせ、番号がおかしい手がかりは読まない", () => {
    const p = fullProject();
    const raw = JSON.parse(JSON.stringify(toFile(p, { C4: { media: "text/html", data: "QUJD" } }, DAY)));
    raw.project.clues.push({ id: "../../x", kind: "object", text: "おかしい", date: DAY });
    const r = parseRestoreFile(raw);
    if (!r.ok) throw new Error(r.error);
    expect(r.photos).toEqual({});
    expect(r.warnings[0]).toContain("C4");
    expect(r.project.clues.some((c) => c.id.includes("/"))).toBe(false);
  });

  it("手で直した記録でも、番号の続きは中身から数え直す。案の番号が順でなければ読まない", () => {
    const p = fullProject();
    const raw = JSON.parse(JSON.stringify(p));
    raw.nextClue = 1;
    raw.nextResult = 0;
    raw.nextStep = "x";
    const back = readProject(raw)!;
    expect(back.nextClue).toBe(5);
    expect(back.nextResult).toBe(2);
    expect(back.nextStep).toBe(4);
    const bad = JSON.parse(JSON.stringify(p));
    bad.plans = [bad.plans[0], bad.plans[0]];
    expect(readProject(bad)).toBeNull();
  });

  it("画面に出す文は、そのまま持つ（描くときに esc する）", () => {
    const raw = JSON.parse(JSON.stringify(fullProject()));
    raw.name = `<img src=x onerror=alert(1)>`;
    expect(readProject(raw)!.name).toBe(raw.name);
  });

  it("見本は、架空の技だと分かる記録で、読み込める", () => {
    const raw = JSON.parse(readFileSync(new URL("../research/restore/sample.json", import.meta.url), "utf8"));
    const r = parseRestoreFile(raw);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.name).toContain("架空");
    expect(r.warnings).toEqual([]);
    for (const c of r.project.clues) expect(c.text).toContain("架空");
    for (const t of r.project.results) expect(t.note).toContain("架空");
    expect(r.project.rules).toEqual([]);
  });
});

describe("この技の決まり", () => {
  const RULE = { title: "霜灰の洗い方", text: "灰は、ひしゃく三杯の水で洗う。", reason: "（理由はまだ聞いていない）", quote: "灰はひしゃく三杯で洗う", by: "石川" };

  function withRule() {
    let p = withPlan();
    const plan = p.plans[0];
    p = setResult(p, plan, plan.steps[0], { outcome: "ok", note: RULE.quote }, DAY);
    return addTechRule(p, plan, plan.steps[0], RULE, DAY);
  }

  it("記録の中に足し、どの工程からか残す。消しても番号を使い回さない", () => {
    const p = withRule();
    expect(p.rules).toEqual([{ id: "R1", stepKey: "s1", stepTitle: "灰を洗う", planVersion: 1, date: DAY, ...RULE }]);
    const gone = removeTechRule(p, "R1", DAY);
    expect(gone.rules).toEqual([]);
    const plan = gone.plans[0];
    expect(addTechRule(gone, plan, plan.steps[1], RULE, DAY).rules[0].id).toBe("R2");
  });

  it("書き出しと読み込みに入る。保存して読み直しても残る", () => {
    const p = withRule();
    const r = parseRestoreFile(JSON.parse(JSON.stringify(toFile(p, {}, DAY))));
    if (!r.ok) throw new Error(r.error);
    expect(r.project.rules).toEqual(p.rules);
    expect(r.project.nextRule).toBe(2);
    const s = fakeStorage();
    saveProject(p, s);
    expect(loadProject(p.id, s)?.rules).toEqual(p.rules);
  });

  it("読み込むとき、形のおかしい決まりは外す", () => {
    const raw = JSON.parse(JSON.stringify(withRule()));
    raw.rules.push({ id: "../x", stepKey: "s1", title: "おかしい番号", text: "x" }, { id: "R5", stepKey: "s1", title: "", text: "x" });
    raw.nextRule = 0;
    const back = readProject(raw)!;
    expect(back.rules.map((r) => r.id)).toEqual(["R1"]);
    expect(back.nextRule).toBe(2);
  });

  it("決まりの案の指示には、この技の決まりだけが入り、指輪の帳面は入らない", async () => {
    const { seedLedger } = await import("../src/rules/ledger");
    const prompt = techRulePrompt(withRule(), "石川");
    expect(prompt).toContain(RULE.title);
    expect(prompt).toContain("試しの技");
    expect(prompt).not.toContain("<ledger>");
    for (const r of seedLedger().rules) expect(prompt).not.toContain(r.title);
  });

  it("指輪の帳面・設計の確かめ・学ぶの答えに混ざらない（このブラウザの保存の形で通す）", async () => {
    const s = fakeStorage();
    vi.stubGlobal("localStorage", s);
    try {
      const open = async () => {
        vi.resetModules();
        const [{ store }, ledger, prompts, search] = await Promise.all([import("../src/app/store"), import("../src/rules/ledger"), import("../src/claude/prompt"), import("../src/rules/search")]);
        return { store, ledger, prompts, search };
      };
      const a = await open();
      // 職人の決まりを 1 つ足してあるブラウザ（帳面が保存された状態）から始める
      a.store.setLedger(a.ledger.addRule(a.store.ledger(), { title: "前からの決まり", text: "爪は太く", reason: "もつ", source: { kind: "craftsman", name: "石川" }, date: DAY }));
      const ledgerBefore = JSON.stringify(a.store.ledger());
      const guidesBefore = a.ledger.effectiveGuides(a.store.ledger(), 8);
      const designBefore = a.prompts.designPrompt(a.store.ledger());
      const askBefore = a.prompts.askPrompt(a.store.ledger(), "石川");
      const techBefore = JSON.stringify(a.store.techLedger("mokume"));
      const keysBefore = new Map(s.map);

      // この技の決まりを足して保存する
      const p = withRule();
      expect(saveProject(p, s)).toEqual({ ok: true });

      // 変わったのは、この記録の鍵だけ
      const changed = [...s.map.keys()].filter((k) => s.map.get(k) !== keysBefore.get(k));
      expect(changed).toEqual([`tsugu.restore.${p.id}.v1`]);

      // 読み直しても、帳面・設計の確かめの値・指示は 1 字も変わらない
      const b = await open();
      expect(JSON.stringify(b.store.ledger())).toBe(ledgerBefore);
      expect(b.ledger.effectiveGuides(b.store.ledger(), 8)).toEqual(guidesBefore);
      expect(b.prompts.designPrompt(b.store.ledger())).toBe(designBefore);
      expect(b.prompts.askPrompt(b.store.ledger(), "石川")).toBe(askBefore);
      expect(JSON.stringify(b.store.techLedger("mokume"))).toBe(techBefore);
      const asked = `${RULE.title} ${RULE.text}`;
      const rules = b.ledger.activeRules(b.store.ledger());
      expect(rules.some((r) => r.title === RULE.title)).toBe(false);
      expect(b.search.findRules(asked, rules, 0, 100).map((r) => r.title)).not.toContain(RULE.title);
      expect(b.prompts.askPrompt(b.store.ledger(), "石川")).not.toContain(RULE.title);
      expect(b.prompts.designPrompt(b.store.ledger())).not.toContain(RULE.title);

      // 見張りが効いている証し：帳面に入れたなら、指示にも検索にも出る
      const wrong = b.ledger.addRule(b.store.ledger(), { title: RULE.title, text: RULE.text, reason: RULE.reason, source: { kind: "craftsman", name: "石川" }, date: DAY });
      expect(b.prompts.askPrompt(wrong, "石川")).toContain(RULE.title);
      expect(b.prompts.designPrompt(wrong)).toContain(RULE.title);
      expect(b.search.findRules(asked, b.ledger.activeRules(wrong), 0, 100).map((r) => r.title)).toContain(RULE.title);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it("この頁のコードは、指輪の帳面を書き換えない・Claude に渡さない", () => {
    const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
    const page = read("app/restore.ts");
    for (const name of ["setLedger", "setTechLedger", "setWorkshops", "setQueue", "addRule", "applyDraft", "keepPrompt", "ledgerText", "rules/ledger"]) expect(page).not.toContain(name);
    for (const file of ["rebuild/restore.ts", "rebuild/restore-prompt.ts", "rebuild/restore-tools.ts", "app/restore-store.ts"]) expect(read(file)).not.toMatch(/from\s+"[^"]*rules\/(ledger|techniques|workshops)/);
  });
});

// ---- 保存 ----

function fakeStorage(limit = Infinity): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limit) throw new DOMException("full", "QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("このブラウザに残す", () => {
  it("技の名前をつけて複数持て、新しく直した順に出る。ほかの鍵は混ざらない", () => {
    const s = fakeStorage();
    const a = newProject("a", "技 A", "2026-11-01");
    const b = newProject("b", "技 B", "2026-11-05");
    expect(saveProject(a, s)).toEqual({ ok: true });
    expect(saveProject(b, s)).toEqual({ ok: true });
    s.setItem("tsugu.ledger.v1", "{}");
    s.setItem("tsugu.restoreDraft.a.v1", "{}");
    expect(listProjects(s).map((p) => p.name)).toEqual(["技 B", "技 A"]);
    expect(loadProject("a", s)?.name).toBe("技 A");
    removeProject("a", s);
    expect(listProjects(s).map((p) => p.id)).toEqual(["b"]);
    expect(s.map.has("tsugu.restoreDraft.a.v1")).toBe(false);
  });

  it("置き場が足りないときは、黙らず失敗を返す。前の中身は残る", () => {
    const s = fakeStorage(400);
    const p = newProject("a", "技", DAY);
    expect(saveProject(p, s)).toEqual({ ok: true });
    const big = { ...p, clues: [{ id: "C1", kind: "object" as const, title: "長い", text: "あ".repeat(500), date: DAY }], nextClue: 2 };
    expect(saveProject(big, s)).toEqual({ ok: false, error: SAVE_FAILED });
    expect(loadProject("a", s)?.clues).toEqual([]);
  });

  it("置き場が使えないブラウザでも止まらない", () => {
    expect(saveProject(newProject("a", "技", DAY), null).ok).toBe(false);
    expect(loadProject("a", null)).toBeNull();
    expect(listProjects(null)).toEqual([]);
  });

  it("読めない中身は、とばす", () => {
    const s = fakeStorage();
    s.setItem("tsugu.restore.bad.v1", "{こわれた");
    s.setItem("tsugu.restore.bad2.v1", JSON.stringify({ id: "bad2" }));
    saveProject(newProject("ok", "技", DAY), s);
    expect(listProjects(s).map((p) => p.id)).toEqual(["ok"]);
  });

  it("足す前の下書きは別に残し、空なら消す", () => {
    const s = fakeStorage();
    saveDraft("a", { kind: "record", title: "", text: "書きかけ", source: "" }, s);
    expect(loadDraft("a", s)).toEqual({ kind: "record", title: "", text: "書きかけ", source: "" });
    saveDraft("a", { kind: "record", title: "", text: "", source: "" }, s);
    expect(loadDraft("a", s)).toBeNull();
  });
});
