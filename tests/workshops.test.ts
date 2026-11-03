import { describe, expect, it } from "vitest";
import { activeLedger, addWorkshop, emptyWorkshops, MAIN, parseWorkshops, putLedger, removeWorkshop, setActive } from "../src/rules/workshops";
import { addRule, seedLedger } from "../src/rules/ledger";
import { masterName } from "../src/app/master";

const main = addRule(seedLedger(), { title: "爪", text: "爪", reason: "落ちる", param: "prong.minDiameterMm", value: 0.7, source: { kind: "craftsman", name: "石川" }, date: "2026-11-03" });

describe("工房ごとの帳面", () => {
  it("はじめは石川さんの帳面。工房を足すと、公開情報の目安から始まり、その帳面を使う", () => {
    let ws = emptyWorkshops();
    expect(activeLedger(ws, main)).toBe(main);
    ws = addWorkshop(ws, "工房 B", seedLedger());
    const b = activeLedger(ws, main);
    expect(b).not.toBe(main);
    expect(b.rules.filter((r) => r.source.kind === "craftsman")).toHaveLength(0);
    expect(masterName(b)).toBe("工房 B");
    expect(masterName(main)).toBe("石川");
  });
  it("工房の帳面に決まりを足しても、はじめの帳面は変わらない。切り替え・消すができる", () => {
    let ws = addWorkshop(emptyWorkshops(), "工房 B", seedLedger());
    const id = ws.active;
    const b2 = addRule(activeLedger(ws, main), { title: "爪", text: "爪", reason: "見た目", param: "prong.minDiameterMm", value: 1.0, source: { kind: "craftsman", name: "工房 B" }, date: "2026-11-03" });
    ws = putLedger(ws, id, b2);
    expect(activeLedger(ws, main).rules.at(-1)!.value).toBe(1.0);
    expect(main.rules.at(-1)!.value).toBe(0.7);
    ws = setActive(ws, MAIN);
    expect(activeLedger(ws, main)).toBe(main);
    ws = removeWorkshop(setActive(ws, id), id);
    expect(ws.active).toBe(MAIN);
    expect(ws.list).toHaveLength(0);
  });
  it("しまった形を読み直せる。読めないときは、はじめの帳面だけ", () => {
    const ws = addWorkshop(emptyWorkshops(), "工房 B", seedLedger());
    expect(parseWorkshops(JSON.stringify(ws)).list[0].name).toBe("工房 B");
    expect(parseWorkshops("{bad")).toEqual(emptyWorkshops());
    expect(parseWorkshops(null)).toEqual(emptyWorkshops());
  });
});
