import { describe, expect, it } from "vitest";
import { addModelRequest, freeTechKey, fulfilRequests, groupRequests, isFreeTech, parseModelRequests, removeModelRequest, requestsFor, videoRoute } from "../src/rules/model-requests";

const req = (id: string, name: string, tech?: string) => ({ id, name, date: "2026-11-07", videoName: "a.mp4", ...(tech ? { tech } : {}) });

describe("手本の頼み", () => {
  it("足す・消す・技ごとに選ぶ", () => {
    let l = parseModelRequests(null);
    l = addModelRequest(l, req("a", "毛彫り", "kebori"));
    l = addModelRequest(l, req("b", "　鏨で 線を彫る  "));
    l = addModelRequest(l, req("c", "毛彫り", "kebori"));
    expect(l.items.map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(l.items[1].name).toBe("鏨で 線を彫る");
    expect(requestsFor(l, "kebori").map((x) => x.id)).toEqual(["c", "a"]);
    expect(requestsFor(l)).toHaveLength(3);
    const g = groupRequests(l);
    expect(g[0]).toMatchObject({ name: "毛彫り", tech: "kebori" });
    expect(g[0].items).toHaveLength(2);
    expect(g[1].name).toBe("鏨で 線を彫る");
    expect(removeModelRequest(l, "c").items.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("名前が空の頼みは足さない。壊れた文字は空として読む", () => {
    expect(addModelRequest({ items: [] }, req("a", "  ")).items).toEqual([]);
    expect(parseModelRequests("{oops").items).toEqual([]);
    expect(parseModelRequests(JSON.stringify({ items: [req("a", "毛彫り"), { id: 1 }] })).items).toHaveLength(1);
  });

  it("残して読み直しても同じ（動画なしの頼みも）", () => {
    let l = addModelRequest({ items: [] }, req("a", "毛彫り", "kebori"));
    l = addModelRequest(l, { ...req("b", "鏨で線を彫る"), videoName: "" });
    expect(parseModelRequests(JSON.stringify(l))).toEqual(l);
  });
});

describe("入れた動画の扱い（添削か、職人の手本か）", () => {
  it("自分の手を見てほしい：手本があれば比べ、なければ頼む。職人の手本：残す", () => {
    expect(videoRoute("check", true)).toBe("compare");
    expect(videoRoute("check", false)).toBe("request");
    // よくない例は、手本があってもなくても、よくない例として残す
    expect(videoRoute("bad", true)).toBe("save-bad");
    expect(videoRoute("bad", false)).toBe("save-bad");
    expect(videoRoute("model", false)).toBe("save-model");
    expect(videoRoute("model", true)).toBe("save-model");
  });

  it("一覧にない技の印は、名前をそろえて作る", () => {
    expect(freeTechKey("  鏨で　線を彫る ")).toBe("free:鏨で 線を彫る");
    expect(isFreeTech("free:ヤスリがけ")).toBe(true);
    expect(isFreeTech("kebori")).toBe(false);
    expect(isFreeTech(undefined)).toBe(false);
  });

  it("手本ができたら、その技の頼みだけ外す", () => {
    let l = addModelRequest({ items: [] }, req("a", "鏨彫り・毛彫り", "kebori"));
    l = addModelRequest(l, req("b", "鏨で線を彫る"));
    l = addModelRequest(l, req("c", "鏨彫り・毛彫り", "kebori"));
    const k = fulfilRequests(l, { tech: "kebori" });
    expect(k.done.map((r) => r.id)).toEqual(["c", "a"]);
    expect(k.list.items.map((r) => r.id)).toEqual(["b"]);
    const f = fulfilRequests(l, { name: " 鏨で線を彫る" });
    expect(f.done.map((r) => r.id)).toEqual(["b"]);
    expect(fulfilRequests(l, { name: "ほかの技" }).done).toEqual([]);
  });
});
