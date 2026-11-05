// 石のない指輪の断面：見本・内甲丸・上と下で変える・手で描く。どれも閉じた 1 つの形で、内径は号の値のまま
import { describe, expect, it } from "vitest";
import { SECTION_LIST, bandCurve, innerArc, innerLimit, sectionLoop, thinOutline, valleyOf, type PresetKind } from "../src/cad/section";
import { earClip, meshVolume, openEdges, toStl, type LoopPt } from "../src/cad/solid";
import { GUIDES } from "../src/rules/guides";
import { sectionSpots } from "../src/rules/checks";
import { addPointAt, deletePoint, fitStroke, measure, movePoint, shapeOf, startCurve, viewFor } from "../src/studio/section-edit";
import {
  MAKE_BAND,
  applyDraft,
  bandCutMesh,
  bandHowTo,
  bandInnerDiameter,
  bandMesh,
  bandSpecRows,
  checkBand,
  curveOf,
  defaultBand,
  drawSection,
  normalizeBand,
  parseBand,
  pickSection,
  sectionWord,
  setInner,
  setSize,
  setSplit,
  specOf,
  type Band,
} from "../src/studio/band";
import { stepCard } from "../src/studio/cards";
import { topology } from "./helpers/topology";

const start = (): Band => defaultBand(15.5, "K18");
const presets = SECTION_LIST.map((s) => s.id);
const closed = { open: 0, flipped: 0, shared: 0, degenerate: 0, shells: 1 };
const dup = (b: Band) => openEdges(bandMesh(b).positions);

/** 指の軸からの距離の、いちばん小さい所と大きい所（指の軸は x、軸の高さは内径 ÷ 2 ＋ 下の厚み） */
function radii(b: Band, pos = bandMesh(b).positions) {
  const r = bandInnerDiameter(b.gou) / 2;
  const cz = r + b.bottom.thickness;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const d = Math.hypot(pos[i + 1], pos[i + 2] - cz);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return { lo, hi };
}

/** まわりの角度ごとの、いちばん指に近い所（どの角度でも指の円の上にあるか） */
function innerAround(b: Band, pos = bandMesh(b).positions) {
  const r = bandInnerDiameter(b.gou) / 2;
  const cz = r + b.bottom.thickness;
  // 指のまわりの分け方（192）ごとにまとめる
  const step = (Math.PI * 2) / 192;
  const bins = new Map<number, number>();
  for (let i = 0; i < pos.length; i += 3) {
    const a = Math.round(Math.atan2(pos[i + 1], pos[i + 2] - cz) / step);
    const d = Math.hypot(pos[i + 1], pos[i + 2] - cz);
    bins.set(a, Math.min(bins.get(a) ?? Infinity, d));
  }
  return [...bins.values()];
}

describe("断面の見本", () => {
  it.each(presets)("%s：はじめの寸法で、閉じた 1 つの形。内径は号の値のまま、外は内径 ＋ 厚み", (k) => {
    const b = pickSection(start(), k);
    const pos = bandMesh(b).positions;
    expect(topology(pos), k).toEqual(closed);
    expect(meshVolume(pos)).toBeGreaterThan(0);
    const r = bandInnerDiameter(b.gou) / 2;
    const { lo, hi } = radii(b);
    expect(lo).toBeCloseTo(r, 3);
    expect(hi).toBeCloseTo(r + b.top.thickness, 3);
    expect(Math.max(...innerAround(b).map((d) => Math.abs(d - r)))).toBeLessThan(1e-3);
    // 幅
    let xMax = 0;
    for (let i = 0; i < pos.length; i += 3) xMax = Math.max(xMax, Math.abs(pos[i]));
    expect(xMax * 2).toBeCloseTo(b.top.width, 2);
  });

  it.each(presets)("%s：はじめの寸法で、作れない所はない（作者が見て直す前の仮の形）", (k) => {
    expect(checkBand(pickSection(start(), k)).map((p) => p.title)).toEqual([]);
  });

  it("平打ちと甲丸は、見て分かるほどちがう（平らな面の広さ・端の高さ・寸法）", () => {
    const shape = (k: PresetKind) => {
      const b = pickSection(start(), k);
      const loop = sectionLoop(specOf(b, "top"));
      const w = b.top.width;
      const t = b.top.thickness;
      const top = (x: number) => {
        let h = 0;
        loop.forEach((p, i) => {
          const q = loop[(i + 1) % loop.length];
          if ((p.x - x) * (q.x - x) <= 0 && p.x !== q.x) h = Math.max(h, p.h + ((q.h - p.h) * (x - p.x)) / (q.x - p.x));
        });
        return h;
      };
      const xs = Array.from({ length: 201 }, (_, i) => (-0.5 + i / 200) * w * 0.999);
      return { flat: xs.filter((x) => t - top(x) < 0.02).length / 201, edge: top(0.45 * w) / t, ratio: t / w };
    };
    const h = shape("hirauchi");
    const k = shape("kouman");
    // 平打ちは面のほとんどが平ら、甲丸は真ん中のごく一部だけ
    expect(h.flat).toBeGreaterThan(0.75);
    expect(k.flat).toBeLessThan(0.3);
    // 幅の端の近くの高さ：平打ちはほぼ厚みのまま、甲丸は半分より低い
    expect(h.edge).toBeGreaterThan(0.9);
    expect(k.edge).toBeLessThan(0.6);
    // 寸法も変える：平打ちは薄く広く、甲丸は厚く狭い
    expect(h.ratio).toBeLessThan(0.45);
    expect(k.ratio).toBeGreaterThan(0.5);
  });

  it("どの見本も、ほかの見本と形がちがう（幅と厚みをそろえて比べても）", () => {
    const profile = (k: PresetKind) => {
      const loop = sectionLoop({ curve: bandCurve(k, 4, 1.6), widthMm: 4, thicknessMm: 1.6, innerMm: 0 });
      return Array.from({ length: 41 }, (_, i) => {
        const x = -1.98 + (i / 40) * 3.96;
        let h = 0;
        loop.forEach((p, j) => {
          const q = loop[(j + 1) % loop.length];
          if ((p.x - x) * (q.x - x) <= 0 && p.x !== q.x) h = Math.max(h, p.h + ((q.h - p.h) * (x - p.x)) / (q.x - p.x));
        });
        return h;
      });
    };
    // 同じ線の丸線と甲丸、四角の決まりが同じ角と平打ちは、外の線としては同じなので除く（ちがいは内側の丸みと寸法）
    const list = presets.filter((k) => k !== "maru" && k !== "kaku");
    for (const a of list)
      for (const b of list) {
        if (a >= b) continue;
        const pa = profile(a);
        const pb = profile(b);
        const mean = pa.reduce((s, v, i) => s + Math.abs(v - pb[i]), 0) / pa.length;
        expect(mean, `${a} と ${b}`).toBeGreaterThan(0.03);
      }
  });

  it("丸線は、断面がほぼまん丸（面積 π/4 × 直径²、内径は真ん中で測る）", () => {
    const b = pickSection(start(), "maru");
    expect(b.top.width).toBe(b.top.thickness);
    const loop = sectionLoop(specOf(b, "top"));
    let area = 0;
    loop.forEach((p, i) => {
      const q = loop[(i + 1) % loop.length];
      area += p.x * q.h - q.x * p.h;
    });
    expect(area / 2).toBeCloseTo((Math.PI / 4) * b.top.width ** 2, 1);
    expect(Math.min(...loop.map((p) => p.h))).toBeCloseTo(0, 6);
  });
});

describe("内甲丸（内側を丸くする）", () => {
  it.each(presets.filter((k) => k !== "maru"))("%s に内甲丸を付けても、閉じた 1 つの形。内径は変わらず、地金は減る", (k) => {
    const flat = pickSection(start(), k);
    const b = setInner(flat, "top", GUIDES.band.comfortMm);
    const pos = bandMesh(b).positions;
    expect(topology(pos), k).toEqual(closed);
    const r = bandInnerDiameter(b.gou) / 2;
    // 内径はいちばん指に近い所で測る。真ん中はいつも指の円の上
    const { lo, hi } = radii(b);
    expect(lo).toBeCloseTo(r, 3);
    expect(hi).toBeCloseTo(r + b.top.thickness, 3);
    expect(Math.max(...innerAround(b).map((d) => Math.abs(d - r)))).toBeLessThan(1e-3);
    expect(bandMesh(b).weightG).toBeLessThan(bandMesh(flat).weightG);
    // 端は指から離れる
    const loop = sectionLoop(specOf(b, "top"));
    const edge = loop[0];
    expect(edge.h).toBeCloseTo(GUIDES.band.comfortMm, 6);
    expect(checkBand(b).map((p) => p.check)).toEqual([]);
  });

  it("内の線は両端を通る円の弧で、真ん中がいちばん低い", () => {
    const arc = innerArc(-2, 2, 0.4);
    expect(arc[0]).toEqual({ x: -2, y: 0 });
    expect(arc[arc.length - 1]).toEqual({ x: 2, y: 0 });
    const mid = arc[(arc.length - 1) / 2];
    expect(mid.x).toBeCloseTo(0, 9);
    expect(mid.y).toBeCloseTo(-0.4, 9);
    // 平らなら y はみな 0
    expect(innerArc(-2, 2, 0).every((p) => p.y === 0)).toBe(true);
  });

  it("丸みの深さは、半円までで、外の線がつぶれない所まで", () => {
    expect(innerLimit(4, 1.5)).toBeCloseTo(1.2, 9);
    expect(innerLimit(2, 3)).toBeCloseTo(1, 9);
    const b = setInner(pickSection(start(), "hirauchi"), "top", 5);
    expect(b.top.inner).toBeCloseTo(innerLimit(b.top.width, b.top.thickness), 9);
    expect(topology(bandMesh(b).positions)).toEqual(closed);
  });

  it("薄くすると、丸みも収まる", () => {
    const b = setSize(setInner(pickSection(start(), "hirauchi"), "top", 1.1), "top", { thickness: 1.2 });
    expect(b.top.inner).toBeLessThanOrEqual(innerLimit(b.top.width, 1.2) + 1e-9);
  });

  it("内甲丸を外すと、内側は平らに戻る", () => {
    const b = setInner(setInner(start(), "top", 0.4), "top", 0);
    expect(b.top.inner).toBeUndefined();
    expect(radii(b).lo).toBeCloseTo(bandInnerDiameter(b.gou) / 2, 3);
  });
});

describe("上と下で変える", () => {
  const two = (top: PresetKind, bottom: PresetKind) => pickSection(pickSection(setSplit(start(), true), top, "top"), bottom, "bottom");

  it.each([
    ["hirauchi", "kouman"],
    ["kouman", "hirauchi"],
    ["vmizo", "kouman"],
    ["dan", "kubomi"],
    ["mentori", "maru"],
    ["yamagata", "hirakouman"],
  ] as [PresetKind, PresetKind][])("%s → %s：閉じた 1 つの形。どの角度でも内径は同じ", (a, c) => {
    const b = two(a, c);
    const pos = bandMesh(b).positions;
    expect(topology(pos)).toEqual(closed);
    const r = bandInnerDiameter(b.gou) / 2;
    expect(Math.max(...innerAround(b).map((d) => Math.abs(d - r)))).toBeLessThan(1e-3);
    expect(radii(b).lo).toBeCloseTo(r, 3);
  });

  it("上と下で太さと断面を変えると、いちばん上といちばん下の寸法がそのとおりになる", () => {
    const b = setSize(setSize(two("hirauchi", "kouman"), "top", { width: 6, thickness: 2 }), "bottom", { width: 3, thickness: 1.4 });
    const pos = bandMesh(b).positions;
    const r = bandInnerDiameter(b.gou) / 2;
    const cz = r + b.bottom.thickness;
    let topW = 0;
    let botW = 0;
    let zMax = -Infinity;
    let zMin = Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      const y = pos[i + 1];
      const z = pos[i + 2];
      zMax = Math.max(zMax, z);
      zMin = Math.min(zMin, z);
      if (Math.abs(y) < 1e-6 && z > cz) topW = Math.max(topW, 2 * Math.abs(pos[i]));
      if (Math.abs(y) < 0.2 && z < cz) botW = Math.max(botW, 2 * Math.abs(pos[i]));
    }
    expect(topW).toBeCloseTo(6, 1);
    expect(botW).toBeCloseTo(3, 1);
    expect(zMin).toBeCloseTo(0, 3);
    expect(zMax).toBeCloseTo(cz + r + 2, 3);
    expect(sectionWord(b)).toBe("上 平打ち・下 甲丸");
  });

  it("手で描いた形と見本をつないでも、閉じた 1 つの形（内甲丸も片方だけ付けられる）", () => {
    const base = setSplit(pickSection(start(), "hirauchi"), true);
    const ec = startCurve("free", curveOf(base, "top"), undefined, 4, 1.5);
    const moved = movePoint(ec, 2, ec.pts[2].x + 0.3, ec.pts[2].y + 0.4, { sym: true, snap: false });
    const b = setInner(drawSection(base, "top", shapeOf(moved)), "bottom", 0.3);
    expect(b.kind).toBe("free");
    expect(b.bottomKind).toBe("hirauchi");
    expect(topology(bandMesh(b).positions)).toEqual(closed);
    const r = bandInnerDiameter(b.gou) / 2;
    expect(Math.max(...innerAround(b).map((d) => Math.abs(d - r)))).toBeLessThan(1e-3);
  });

  it("「ひと周り同じ」に戻すと、下は上にそろう", () => {
    const b = setSplit(setSize(two("hirauchi", "kouman"), "bottom", { width: 2 }), false);
    expect(b.bottom).toEqual(b.top);
    expect(b.bottomKind).toBeUndefined();
    expect(sectionWord(b)).toBe("平打ち");
  });
});

describe("断面を手で描く（石のある指輪の腕と同じ部品）", () => {
  const edit = (b: Band) => {
    const e = b.top;
    return startCurve("free", curveOf(b, "top"), undefined, e.width, e.thickness - (e.inner ?? 0));
  };

  it("点を動かす・足す・消す・自由に描く、どれも閉じた形のまま", () => {
    let b = pickSection(start(), "hirauchi");
    let ec = edit(b);
    ec = movePoint(ec, 3, ec.pts[3].x, ec.pts[3].y + 0.5, { sym: true, snap: false });
    b = drawSection(b, "top", shapeOf(ec));
    expect(topology(bandMesh(b).positions)).toEqual(closed);
    ec = addPointAt(ec, 0, measure(ec).thicknessMm, { sym: true, tolMm: 2 }) ?? ec;
    b = drawSection(b, "top", shapeOf(ec));
    expect(topology(bandMesh(b).positions)).toEqual(closed);
    ec = deletePoint(ec, 2, { sym: true }) ?? ec;
    b = drawSection(b, "top", shapeOf(ec));
    expect(topology(bandMesh(b).positions)).toEqual(closed);
    // 自由に描く：波の形
    const stroke = Array.from({ length: 80 }, (_, i) => {
      const x = 2 - (i / 79) * 4;
      return { x, y: 1.2 + 0.3 * Math.cos(x * 2.4) };
    });
    const drawn = fitStroke(stroke, { sym: true });
    expect(drawn).not.toBeNull();
    b = drawSection(b, "top", shapeOf(drawn!));
    expect(b.kind).toBe("free");
    const pos = bandMesh(b).positions;
    expect(topology(pos)).toEqual(closed);
    expect(radii(b, pos).lo).toBeCloseTo(bandInnerDiameter(b.gou) / 2, 3);
  });

  it("元に戻して見本と同じ形になれば、見本の名前に戻る（線が同じ見本は寸法で見分ける）", () => {
    for (const k of presets) {
      const b = pickSection(start(), k);
      const back = drawSection({ ...b, dimsSet: true }, "top", shapeOf(edit(b)));
      expect(back.kind, k).toBe(k);
      expect(back.curve).toBeUndefined();
    }
  });

  it("角のある見本（折れ目で線をつないだ）でも、点を動かせる", () => {
    for (const k of ["mentori", "yamagata", "vmizo", "dan", "kubomi"] as PresetKind[]) {
      const b = pickSection(start(), k);
      const ec = edit(b);
      const i = Math.floor(ec.pts.length / 4);
      const m = movePoint(ec, i, ec.pts[i].x, ec.pts[i].y + 0.1, { sym: true, snap: false });
      const next = drawSection(b, "top", shapeOf(m));
      expect(topology(bandMesh(next).positions), k).toEqual(closed);
    }
  });

  it("幅の広い指輪でも、断面の画面からはみ出さない（広さを渡すと、点も画面も広がる）", () => {
    const ec = startCurve("free", curveOf(pickSection(start(), "hirauchi"), "top"), undefined, 4, 1.5);
    expect(movePoint(ec, 0, 12, 0, { sym: true, snap: false }).pts[0].x).toBeCloseTo(3.6, 9);
    expect(movePoint(ec, 0, 12, 0, { sym: true, snap: false, maxX: 8 }).pts[0].x).toBeCloseTo(8, 9);
    expect(viewFor(12, 1.5).x).toBeCloseTo(3.6, 9);
    expect(viewFor(12, 1.5, 8).x).toBeCloseTo(6.9, 9);
  });

  it("手で描いた形は、幅と厚みのつまみで伸び縮みする（形はそのまま）", () => {
    let b = pickSection(start(), "hirauchi");
    const ec = edit(b);
    b = drawSection(b, "top", shapeOf(movePoint(ec, 2, ec.pts[2].x, ec.pts[2].y + 0.3, { sym: true, snap: false })));
    const wider = setSize(b, "top", { width: 7 });
    const pos = bandMesh(wider).positions;
    expect(topology(pos)).toEqual(closed);
    let xMax = 0;
    for (let i = 0; i < pos.length; i += 3) xMax = Math.max(xMax, Math.abs(pos[i]));
    expect(xMax * 2).toBeCloseTo(7, 2);
  });
});

describe("薄すぎる断面の確かめ", () => {
  it("溝の底が目安より薄いと知らせ、直すと消える（仮の目安）", () => {
    const b = setSize(pickSection(start(), "vmizo"), "top", { thickness: 1.3 });
    const v = valleyOf(specOf(b, "top"));
    expect(v).not.toBeNull();
    expect(v!.xMm).toBeCloseTo(0, 0);
    const p = checkBand(b).find((x) => x.check === "band-valley");
    expect(p?.required).toContain("仮");
    const fixed = p!.fix.apply(b);
    expect(checkBand(fixed).filter((x) => x.check === "band-valley")).toEqual([]);
  });

  it("端へ向かって薄くなるだけの形は、溝と数えない", () => {
    for (const k of ["kouman", "hirauchi", "hirakouman", "kamaboko", "mentori", "dan", "yamagata", "maru"] as PresetKind[]) expect(valleyOf(specOf(pickSection(start(), k), "top")), k).toBeNull();
    expect(valleyOf(specOf(setInner(pickSection(start(), "hirauchi"), "top", 0.5), "top"))).toBeNull();
  });

  it("手で描いたとがりは、その所だけ知らせ、自動では直さない（断面を描く画面へ）", () => {
    const b0 = pickSection(start(), "hirauchi");
    // 真ん中に細い針を立てる
    const needle = [
      { x: 2, y: 0.8 },
      { x: 1.5, y: 0.8 },
      { x: 0.5, y: 0.8 },
      { x: 0.08, y: 0.8 },
      { x: 0, y: 2 },
      { x: -0.08, y: 0.8 },
      { x: -0.5, y: 0.8 },
      { x: -1.5, y: 0.8 },
      { x: -2, y: 0.8 },
    ];
    const stroke: { x: number; y: number }[] = [];
    needle.forEach((p, i) => {
      if (i === 0) return;
      const a = needle[i - 1];
      for (let s = 0; s < 40; s++) stroke.push({ x: a.x + ((p.x - a.x) * s) / 40, y: a.y + ((p.y - a.y) * s) / 40 });
    });
    const drawn = fitStroke(stroke, { sym: false });
    expect(drawn).not.toBeNull();
    const b = drawSection(b0, "top", shapeOf(drawn!));
    const p = checkBand(b).find((x) => x.check === "band-spike");
    expect(p).toBeTruthy();
    expect(p!.fix.editor).toBe(true);
    expect(p!.fix.apply(b)).toBe(b);
  });

  it("内甲丸の両端の角は、ふつうの丸みならとがりと数えない。丸線も", () => {
    for (const k of presets) {
      const b = k === "maru" ? pickSection(start(), k) : setInner(pickSection(start(), k), "top", GUIDES.band.comfortMm);
      expect(sectionSpots(thinOutline(specOf(b, "top"))).map((s) => s.kind), k).toEqual([]);
    }
  });

  it("職人の決まり（帳面の目安）で、確かめが変わる", () => {
    const b = pickSection(start(), "hirauchi");
    expect(checkBand(b)).toEqual([]);
    const strict = structuredClone(GUIDES) as unknown as typeof GUIDES & { band: { minThicknessMm: number } };
    (strict.band as { minThicknessMm: number }).minThicknessMm = 1.8;
    expect(checkBand(b, strict).map((p) => p.check)).toEqual(["band-thin"]);
  });

  it("丸線の厚みの直し方は、太さごと上げる（まん丸のまま）", () => {
    const b = setSize(pickSection(start(), "maru"), "top", { width: 1 });
    const p = checkBand(b).find((x) => x.check === "band-thin")!;
    const fixed = p.fix.apply(b);
    expect(fixed.top.width).toBe(fixed.top.thickness);
    expect(fixed.top.inner).toBeCloseTo(fixed.top.width / 2, 9);
  });
});

describe("見本の選び方と寸法", () => {
  it("寸法を人が決めていなければ、見本のはじめの寸法になる", () => {
    const b = pickSection(start(), "hirauchi");
    expect(b.top).toEqual({ width: 4, thickness: 1.5 });
    expect(b.bottom).toEqual({ width: 4, thickness: 1.5 });
    const c = pickSection(b, "kouman");
    expect(c.top).toEqual({ width: 3, thickness: 1.7 });
  });

  it("人が決めた寸法は、見本を変えても残る", () => {
    const b = setSize(pickSection(start(), "hirauchi"), "top", { width: 5.5 });
    expect(b.dimsSet).toBe(true);
    const c = pickSection(b, "kouman");
    expect(c.top.width).toBe(5.5);
    expect(c.top.thickness).toBe(1.5);
  });

  it("丸線を選ぶと内側が半円になり、ほかへ移ると平らに戻る", () => {
    const m = pickSection(start(), "maru");
    expect(m.top.inner).toBeCloseTo(m.top.width / 2, 9);
    expect(setSize(m, "top", { width: 3 }).top).toEqual({ width: 3, thickness: 3, inner: 1.5 });
    expect(pickSection(m, "hirauchi").top.inner).toBeUndefined();
  });

  it("リセットは、見本のはじめの寸法に戻す（内側の丸みも）", () => {
    const b = setInner(setSize(pickSection(start(), "hirauchi"), "top", { width: 7 }), "top", 0.5);
    const r = pickSection(b, "hirauchi", "top", { resetSize: true });
    expect(r.top).toEqual({ width: 4, thickness: 1.5 });
    expect(r.dimsSet).toBe(false);
  });

  it("前の版の記録も読める（かまぼこ・上と下で太さがちがう）", () => {
    const old: Band = { gou: 12, kind: "kamaboko", top: { width: 4, thickness: 1.6 }, bottom: { width: 3.2, thickness: 1.4 }, density: 15.5, metalLabel: "K18" };
    const b = normalizeBand(old);
    expect(b.split).toBe(true);
    expect(b.dimsSet).toBe(true);
    expect(topology(bandMesh(b).positions)).toEqual(closed);
    // 読めない断面の名前や、線のない「手で描いた形」は甲丸に
    expect(normalizeBand({ ...old, kind: "free" }).kind).toBe("kouman");
    expect(normalizeBand({ ...old, kind: "nanika" as never }).kind).toBe("kouman");
  });
});

describe("切って断面を見る", () => {
  it.each(presets)("%s：切った形も閉じた 1 つの形（切り口にふた）。体積は輪より小さい", (k) => {
    const b = pickSection(start(), k);
    const cut = bandCutMesh(b, "top");
    expect(topology(cut), k).toEqual(closed);
    expect(meshVolume(cut)).toBeGreaterThan(0);
    expect(meshVolume(cut)).toBeLessThan(meshVolume(bandMesh(b).positions));
  });

  it("下で切っても、内甲丸でも閉じている", () => {
    const b = setInner(pickSection(setSplit(pickSection(start(), "dan"), true), "kouman", "bottom"), "bottom", 0.3);
    expect(topology(bandCutMesh(b, "bottom"))).toEqual(closed);
  });

  it("へこんだ形の中も三角形に分ける（面積が合う）", () => {
    // V 字に切れこんだ四角
    const poly: LoopPt[] = [
      { x: 2, h: 0 },
      { x: 2, h: 2 },
      { x: 0.5, h: 2 },
      { x: 0, h: 1 },
      { x: -0.5, h: 2 },
      { x: -2, h: 2 },
      { x: -2, h: 0 },
    ];
    const tris = earClip(poly);
    expect(tris.length).toBe(poly.length - 2);
    const area = tris.reduce((s, [a, b, c]) => s + ((poly[b].x - poly[a].x) * (poly[c].h - poly[a].h) - (poly[b].h - poly[a].h) * (poly[c].x - poly[a].x)) / 2, 0);
    expect(area).toBeCloseTo(8 - 0.5, 9);
  });
});

describe("STL・作り方・Claude の道具", () => {
  it("STL は三角形の数ぶんの大きさ。どの見本も、書き出す形に開いた辺がない", () => {
    for (const k of presets) {
      const b = pickSection(start(), k);
      const { positions } = bandMesh(b);
      expect(dup(b), k).toBe(0);
      expect(toStl(positions).byteLength).toBe(84 + (positions.length / 9) * 50);
    }
  });

  it("線のままでは出ない形は、手で作るときに「形を整える」が入る。どの工程にも道具がある", () => {
    for (const k of presets) {
      const b = pickSection(start(), k);
      const steps = bandHowTo(b, "hand", 3, "k18y");
      expect(steps.some((s) => s.title === "形を整える"), k).toBe(!["kouman", "kamaboko", "hirauchi", "kaku", "maru"].includes(k));
      for (const st of [...steps, ...bandHowTo(b, "cast", 3, "k18y")]) expect(stepCard(st, 0).tools.length, st.title).toBeGreaterThan(0);
    }
    const inner = bandHowTo(setInner(start(), "top", 0.4), "hand", 3).find((s) => s.title === "形を整える")!;
    expect(inner.text).toContain("内甲丸");
    expect(inner.specs.find((s) => s.label === "内側の丸み")?.value).toBe("0.4 mm");
    const drawn = bandHowTo({ ...start(), kind: "free", curve: bandCurve("hirauchi", 4, 1.5) }, "hand", 3).find((s) => s.title === "形を整える")!;
    expect(drawn.text).toContain("図面の断面");
  });

  it("数字の行：同じ太さなら 1 行、ちがえば上と下、内甲丸があれば丸み", () => {
    const b = start();
    expect(bandSpecRows(b, 3).map((r) => r.label)).toEqual(["断面", "号", "幅 × 厚み", "地金"]);
    const c = setInner(setSize(setSplit(b, true), "bottom", { width: 2.4 }), "top", 0.3);
    expect(bandSpecRows(c, 3).map((r) => r.label)).toEqual(["断面", "号", "上（見える側）", "下（手のひら側）", "内側の丸み", "地金"]);
    expect(sectionWord(c)).toBe("上 甲丸（内甲丸）・下 甲丸");
  });

  it("Claude の道具：見本を選べ、内甲丸も渡せる。知らない断面は断る", () => {
    const schema = MAKE_BAND.input_schema as { properties: { section: { enum: string[] } }; required: string[] };
    expect(schema.properties.section.enum).toEqual(presets);
    expect(schema.required).toContain("inner_mm");
    const ok = parseBand({ section: "mentori", bottom_section: "kouman", top_width_mm: 5, top_thickness_mm: 1.8, bottom_width_mm: 3, bottom_thickness_mm: 1.4, inner_mm: 0.3, gou: 11, metal: "pt900", reason: "r", cannot_do: "" });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const b = applyDraft(start(), ok.value);
    expect(b.kind).toBe("mentori");
    expect(b.bottomKind).toBe("kouman");
    expect(b.split).toBe(true);
    expect(b.top.inner).toBeCloseTo(0.3, 9);
    expect(topology(bandMesh(b).positions)).toEqual(closed);
    expect(parseBand({ section: "nanika" }).ok).toBe(false);
    // 丸線は幅と厚みをそろえる
    const r = parseBand({ section: "maru", bottom_section: "maru", top_width_mm: 3, top_thickness_mm: 1.5, bottom_width_mm: 3, bottom_thickness_mm: 1.5, inner_mm: 0, gou: 12, metal: "k18yg", reason: "", cannot_do: "" });
    if (r.ok) expect(applyDraft(start(), r.value).top).toEqual({ width: 3, thickness: 3, inner: 1.5 });
  });
});
