// テンション（挟む）：職人の値（くぼみ 0.8 mm・溝 0.5 mm）どおりに腕の両はしが彫れているか。形は閉じた 1 つの形か。確かめ・道具・作り方。
import { describe, expect, it } from "vitest";
import repo from "../ledger/jewelry.json";
import { parseToolCall } from "../src/claude/tools";
import type { Point } from "../src/geometry/polygon";
import { buildRing, type RingParams } from "../src/geometry/ring";
import type { ShankSection } from "../src/geometry/shank";
import type { StoneParams } from "../src/geometry/stone";
import { TENSION_SHORT_TEXT, checkRing, elasticOpeningMm, tensionNotes, tensionOpening, tensionOpeningText } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { activeRules, seedLedger, type Ledger } from "../src/rules/ledger";
import { freshenRules } from "../src/ui/ledger-ui";
import { howToMake } from "../src/studio/howto";
import { PRESETS, presetOutline } from "../src/studio/presets";
import { DEFAULT_STATE, RingSession } from "../src/studio/session";

/** 既定の三角と同じ大きさの三角（長い辺 8.88 が x に沿い、向かいの角までの高さ 7.52） */
const TRI: Point[] = [
  { x: -4.44, y: 3 },
  { x: 0, y: -4.52 },
  { x: 4.44, y: 3 },
];
const triangle: StoneParams = { outlineMm: TRI, longMm: 8.88, widthMm: 7.52, depthMm: 4.24 };
const phi4 = { gou: 11, metal: "k18y" as const, section: "maru" as ShankSection, widthMm: 4, thicknessMm: 4 };
const ringOf = (stone: StoneParams, extra: Partial<RingParams> = {}) => buildRing({ stone, setting: { style: "tension" }, shank: phi4, ...extra });
const stones = (): [string, StoneParams][] =>
  PRESETS.map((p) => [p.name, { outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm }]);

/** 開いた辺（向きを見ない）・面の向きの合わない辺・3 枚以上が共有する辺・形の数・つぶれた三角形を数える */
function topology(p: Float32Array) {
  const ids = new Map<string, number>();
  const id = (i: number) => {
    const k = `${p[i]},${p[i + 1]},${p[i + 2]}`;
    let v = ids.get(k);
    if (v === undefined) ids.set(k, (v = ids.size));
    return v;
  };
  const edges = new Map<string, number>();
  const parent: number[] = [];
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  let degenerate = 0;
  for (let t = 0; t < p.length; t += 9) {
    const v = [id(t), id(t + 3), id(t + 6)];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) degenerate++;
    for (const a of v) if (parent[a] === undefined) parent[a] = a;
    for (let e = 0; e < 3; e++) {
      const a = v[e];
      const b = v[(e + 1) % 3];
      edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1);
      parent[find(a)] = find(b);
    }
  }
  let open = 0;
  let flipped = 0;
  let shared = 0;
  for (const [k, n] of edges) {
    const [a, b] = k.split(">");
    const back = edges.get(`${b}>${a}`) ?? 0;
    if (back !== n) flipped++;
    if ((n + back) % 2 === 1) open++;
    if (n > 1) shared++;
  }
  return { open, flipped, shared, degenerate, shells: new Set([...ids.values()].map(find)).size };
}

/** y の向きの光線：y0 から dir の向きに進んで、最初に形に当たる y（x・z は決まった所） */
function hitY(p: Float32Array, x: number, z: number, y0: number, dir: 1 | -1): number | null {
  let best: number | null = null;
  for (let t = 0; t < p.length; t += 9) {
    const ax = p[t], az = p[t + 2], bx = p[t + 3], bz = p[t + 5], cx = p[t + 6], cz = p[t + 8];
    if (Math.max(ax, bx, cx) < x || Math.min(ax, bx, cx) > x || Math.max(az, bz, cz) < z || Math.min(az, bz, cz) > z) continue;
    const d = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (Math.abs(d) < 1e-14) continue;
    const u = ((x - ax) * (cz - az) - (z - az) * (cx - ax)) / d;
    const v = ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / d;
    if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
    const y = p[t + 1] + u * (p[t + 4] - p[t + 1]) + v * (p[t + 7] - p[t + 1]);
    if ((y - y0) * dir < 0) continue;
    if (best === null || (y - y0) * dir < (best - y0) * dir) best = y;
  }
  return best;
}

describe("テンションの形（職人の値）", () => {
  it("目安の値は guides の 1 か所（くぼみ 0.8 mm・溝 0.5 mm・丸線 φ4）", () => {
    expect(GUIDES.tension.cornerPitMm).toBe(0.8);
    expect(GUIDES.tension.edgeGrooveMm).toBe(0.5);
    expect(GUIDES.tension.wireMm).toBe(4);
  });

  it("三角の既定：開きは石が入る寸法（7.52 − 0.8 − 0.5 ＝ 6.22 mm）。プリロードは入れない", () => {
    const info = ringOf(triangle).setting.tension!;
    expect(info.mode).toBe("corner-edge");
    expect(info.gapMm).toBeCloseTo(6.22, 2);
    expect(info.ends[0].kind).toBe("pit");
    expect(info.ends[1].kind).toBe("groove");
    expect(info.ends[1].straight).toBe(true);
  });

  it("閉じた 1 つの形（開いた辺 0・3 枚が共有する辺 0・つぶれた三角形 0）", () => {
    const shape = topology(ringOf(triangle).ringPositions.shank);
    expect(shape).toEqual({ open: 0, flipped: 0, shared: 0, degenerate: 0, shells: 1 });
  });

  it("形から測って、くぼみは 0.8 mm、溝は 0.5 mm（底まではすき間を足した深さ）、開きは 6.22 mm", () => {
    const ring = ringOf(triangle);
    const info = ring.setting.tension!;
    const p = ring.ringPositions.shank;
    const clear = GUIDES.tension.clearanceMm;
    // 彫り口より上の、腕の真ん中の所（平らな面）と、縁の高さの所（彫りの底）
    const plain = info.ends[0].openTopZ + 0.3;
    expect(hitY(p, 0, plain, 0, 1)!).toBeCloseTo(info.gapMm / 2, 2);
    expect(hitY(p, 0, plain, 0, -1)!).toBeCloseTo(-info.gapMm / 2, 2);
    expect(hitY(p, 0, info.girdleZ, 0, 1)! - info.gapMm / 2).toBeCloseTo(GUIDES.tension.cornerPitMm + clear, 1);
    expect(-hitY(p, 0, info.girdleZ, 0, -1)! - info.gapMm / 2).toBeCloseTo(0.5 + clear, 2);
  });

  it("石の高さが変わると、開きも変わる。くぼみと溝の深さは値で変えられる", () => {
    const info = ringOf(triangle, { tension: { cornerPitMm: 0.8, edgeGrooveMm: 0.6 } }).setting.tension!;
    expect(info.gapMm).toBeCloseTo(7.52 - 0.8 - 0.6, 2);
    expect(info.ends[0].depthMm).toBe(0.8);
    expect(info.ends[1].depthMm).toBe(0.6);
  });

  it("石と腕は重ならない：石の外形のどの点も、腕の端の面より手前か、彫った所の中にある", () => {
    const ring = ringOf(triangle);
    const info = ring.setting.tension!;
    const sp = ring.ringPositions.stone;
    const p = ring.ringPositions.shank;
    // 石の頂点から ±y に光線を出す：腕の幅の中の点は、その先に当たる面が必ずある（中に入っていれば裏から当たる）。
    // 真ん中（y ＝ 0）から同じ点までの間に腕の面があれば、その点は腕の中
    let checked = 0;
    for (let i = 0; i < sp.length; i += 21) {
      const [x, y, z] = [sp[i], sp[i + 1], sp[i + 2]];
      if (Math.abs(x) >= 2) continue;
      const dir = y >= 0 ? 1 : -1;
      const hit = hitY(p, x, z, 0, dir);
      if (hit !== null) expect((hit - y) * dir).toBeGreaterThanOrEqual(-1e-3);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(info.clearanceMm).toBe(GUIDES.tension.clearanceMm);
  });

  it("石の先と指のすき間は 0.5 mm 以上（石の先が指に当たると痛い。職人 2026-11-05）。足りないときは腕の両はしを持ち上げ、縁は腕の太さの上寄り", () => {
    const ring = ringOf(triangle);
    const info = ring.setting.tension!;
    expect(ring.culetGapMm).toBeGreaterThanOrEqual(GUIDES.tension.culetGapMm - 1e-9);
    expect(info.liftMm).toBeGreaterThan(0);
    const e = info.ends[0];
    expect(e.wireBottomZ + (e.wireTopZ - e.wireBottomZ) * GUIDES.tension.girdleAtWire).toBeCloseTo(info.girdleZ, 0);
    // 指に当たる所はない：腕の内側はどこも指の円より外
    const p = ring.ringPositions.shank;
    let min = Infinity;
    for (let i = 0; i < p.length; i += 3) min = Math.min(min, Math.hypot(p[i + 1], p[i + 2]));
    expect(min).toBeGreaterThanOrEqual(ring.shank.innerRadiusMm - 0.01);
  });

  it("小さな石は腕を持ち上げなくてよい（指の丸みのまま）", () => {
    const small = stones().find(([n]) => n === "ラウンド")![1];
    const k = 3.5 / small.longMm;
    const ring = ringOf({ outlineMm: small.outlineMm.map((q) => ({ x: q.x * k, y: q.y * k })), longMm: 3.5, widthMm: 3.5, depthMm: 2.1 });
    expect(ring.setting.tension!.liftMm).toBe(0);
  });

  it("持ち上げない設定では、指の丸みのまま作れて、溝が腕に収まらないことを確かめが言う", () => {
    const ring = ringOf(triangle, { tension: { liftEnds: false } });
    expect(ring.setting.tension!.liftMm).toBe(0);
    expect(topology(ring.ringPositions.shank).open).toBe(0);
    expect(checkRing(ring).some((x) => x.check === "tension-lip")).toBe(true);
  });

  it.each(["ラウンド", "オーバル", "スクエア", "エメラルド", "ペア", "マーキス"])("%s でも閉じた 1 つの形（大きさを変えても）", (name) => {
    const st = stones().find(([n]) => n === name)![1];
    for (const k of [0.7, 1, 1.4]) {
      const sized = { outlineMm: st.outlineMm.map((q) => ({ x: q.x * k, y: q.y * k })), longMm: st.longMm * k, widthMm: st.widthMm * k, depthMm: st.depthMm * k };
      const r = ringOf(sized);
      const shape = topology(r.ringPositions.shank);
      expect(shape.open).toBe(0);
      expect(shape.flipped).toBe(0);
      expect(shape.shells).toBe(1);
      expect(shape.degenerate).toBe(0);
    }
  });

  it("角がない石は両方溝、しずく形（角 1 つ）は角をくぼみに", () => {
    const of = (name: string) => ringOf(stones().find(([n]) => n === name)![1]).setting.tension!;
    expect(of("ラウンド").mode).toBe("edge-edge");
    expect(of("ラウンド").ends.map((e) => e.kind)).toEqual(["groove", "groove"]);
    expect(of("ラウンド").gapMm).toBeCloseTo(6.5 - 1, 1);
    expect(of("スクエア").mode).toBe("edge-edge");
    expect(of("スクエア").ends[0].straight).toBe(true);
    expect(of("ペア").mode).toBe("corner-edge");
    expect(of("マーキス").mode).toBe("edge-edge");
  });

  it.each(["kouman", "hirauchi", "hangouman", "kaku"] as const)("断面 %s でも閉じた 1 つの形", (section) => {
    const r = buildRing({ stone: triangle, setting: { style: "tension" }, shank: { gou: 11, section, widthMm: 4, thicknessMm: 3.5 } });
    const shape = topology(r.ringPositions.shank);
    expect(shape.open).toBe(0);
    expect(shape.shells).toBe(1);
  });

  it("号を変えても壊れない", () => {
    for (const gou of [5, 11, 25]) {
      const shape = topology(buildRing({ stone: triangle, setting: { style: "tension" }, shank: { ...phi4, gou } }).ringPositions.shank);
      expect(shape.open).toBe(0);
      expect(shape.shells).toBe(1);
    }
  });

  it("丸線の腕は、爪留めでも閉じた形", () => {
    const round = stones().find(([n]) => n === "ラウンド")![1];
    const r = buildRing({ stone: round, setting: { style: "prong", join: "between" }, shank: { gou: 11, section: "maru", widthMm: 3, thicknessMm: 3 } });
    expect(topology(r.ringPositions.shank).open).toBe(0);
    const on = buildRing({ stone: round, setting: { style: "prong", join: "on" }, shank: { gou: 11, section: "maru", widthMm: 3, thicknessMm: 3 } });
    expect(topology(on.ringPositions.shank).open).toBe(0);
  });
});

describe("テンションの確かめ", () => {
  it("三角の既定は「作れない」がない", () => {
    expect(checkRing(ringOf(triangle))).toEqual([]);
  });

  it("腕が細いと、溝で切れる・溝の高さが収まらない", () => {
    const thin = checkRing(buildRing({ stone: triangle, setting: { style: "tension" }, shank: { ...phi4, widthMm: 1.2, thicknessMm: 1.2 } }));
    expect(thin.some((p) => p.check === "tension-cut" || p.check === "tension-lip")).toBe(true);
    for (const p of thin.filter((x) => x.check.startsWith("tension-"))) expect(p.options.map((o) => o.id)).toContain("thickerWire");
  });

  it("くぼみが腕の幅より広いと、くぼみの両わきに地金が残らない", () => {
    const narrow = checkRing(buildRing({ stone: triangle, setting: { style: "tension" }, shank: { ...phi4, section: "kaku", widthMm: 1, thicknessMm: 4 } }));
    expect(narrow.some((p) => p.check === "tension-pit")).toBe(true);
  });

  it("ばねの強さは合否にせず、注意に書く。欠けやすい石も言い切らない", () => {
    const ring = ringOf(triangle);
    const notes = tensionNotes(ring.setting, ring.shank.thicknessMm);
    expect(notes.join(" ")).toContain("加工硬化した硬い状態が条件");
    expect(notes.join(" ")).toContain("最後は職人が決める");
    expect(notes.join(" ")).toContain("パライバ");
    expect(notes.join(" ")).toContain("決まったわけではありません");
    expect(checkRing(ring).some((p) => p.check === "hold")).toBe(false);
  });

  it("爪留め・覆輪には注意を出さない", () => {
    const round = stones()[0][1];
    const r = buildRing({ stone: round, setting: { style: "prong", join: "between" }, shank: { gou: 11 } });
    expect(tensionNotes(r.setting, r.shank.thicknessMm)).toEqual([]);
    expect(r.setting.tension ?? null).toBeNull();
  });
});

describe("テンションの参考の計算（開ける量）", () => {
  it("式：開ける量 ≒ 3π R² σ ÷（E d）", () => {
    // R 10 mm・d 4 mm・E 100 GPa・σ 500 MPa：3π × 100 × 500 ÷（100000 × 4）＝ 1.178 mm
    expect(elasticOpeningMm(10, 4, 100, 500)).toBeCloseTo((3 * Math.PI * 100 * 500) / (100000 * 4), 9);
    expect(elasticOpeningMm(10, 4, 100, 500)).toBeCloseTo(1.178, 3);
    // 太いほど減る（太さに反比例）・半径の 2 乗に比例
    expect(elasticOpeningMm(10, 2, 100, 500)).toBeCloseTo(2 * elasticOpeningMm(10, 4, 100, 500), 9);
    expect(elasticOpeningMm(20, 4, 100, 500)).toBeCloseTo(4 * elasticOpeningMm(10, 4, 100, 500), 9);
  });

  it("既定（φ4・11 号・K18）：R は指の半径 ＋ 太さ ÷ 2。要る量は くぼみ 0.8 ＋ 溝 0.5 ＝ 1.3 mm", () => {
    const ring = ringOf(triangle);
    const o = tensionOpening(ring.setting, ring.shank)!;
    expect(o.radiusMm).toBeCloseTo(ring.shank.innerRadiusMm + 2, 9);
    expect(o.wireMm).toBe(4);
    expect(o.needMm).toBeCloseTo(1.3, 9);
    expect(o.needText).toContain("角のくぼみ 0.80 mm");
    expect(o.needText).toContain("辺の溝 0.50 mm");
    const m = GUIDES.tension.spring.metals.k18y;
    const hard = o.states.find((x) => x.state === "hardened")!;
    expect(hard.openMm).toBeCloseTo(elasticOpeningMm(o.radiusMm, 4, m.young.gpa, m.hardened.proofMpa), 9);
    expect(hard.openMm).toBeCloseTo(1.94, 2);
    expect(o.states.find((x) => x.state === "annealed")!.openMm).toBeCloseTo(0.47, 2);
  });

  it("K18 の耐力は出典がないので「仮」。ヤング率は表の値", () => {
    const m = GUIDES.tension.spring.metals.k18y;
    expect(m.young.provisional).toBe(false);
    expect(m.hardened.provisional).toBe(true);
    expect(m.annealed.provisional).toBe(true);
    const ring = ringOf(triangle);
    expect(tensionOpeningText(tensionOpening(ring.setting, ring.shank)!)).toContain("（仮）");
  });

  it("足りないときは、職人が決める言葉を出す。足りるときは出さない", () => {
    const ring = ringOf(triangle);
    expect(tensionOpening(ring.setting, ring.shank)!.enough).toBe(true);
    expect(tensionOpeningText(tensionOpening(ring.setting, ring.shank)!)).not.toContain(TENSION_SHORT_TEXT);
    const pt = buildRing({ stone: triangle, setting: { style: "tension" }, shank: { ...phi4, metal: "pt900" } });
    const o = tensionOpening(pt.setting, pt.shank)!;
    expect(o.enough).toBe(false);
    expect(tensionOpeningText(o)).toContain(TENSION_SHORT_TEXT);
  });

  it("合否にしない：足りなくても「作れない」は増えない。石にかかる力の数字は出さない", () => {
    const pt = buildRing({ stone: triangle, setting: { style: "tension" }, shank: { ...phi4, metal: "pt900" } });
    expect(tensionOpening(pt.setting, pt.shank)!.enough).toBe(false);
    expect(checkRing(pt)).toEqual([]);
    const text = tensionOpeningText(tensionOpening(pt.setting, pt.shank)!);
    expect(text).not.toMatch(/\d\s*N\b/);
    expect(text).toContain("目安・最後は職人が決める");
    expect(text).toContain("細い輪の近似");
    expect(text).toContain("まっすぐ押し開く");
    expect(text).toContain("端の溝は無視");
  });

  it("爪留めには出さない", () => {
    const r = buildRing({ stone: stones()[0][1], setting: { style: "prong", join: "between" }, shank: { gou: 11 } });
    expect(tensionOpening(r.setting, r.shank)).toBeNull();
  });
});

describe("設計の場と道具", () => {
  const empty = seedLedger() as Ledger;
  const session = () => {
    const s = new RingSession(triangle, () => empty, () => undefined, () => "");
    s.state = { ...DEFAULT_STATE };
    return s;
  };

  it("既定の留め方は爪のまま", () => {
    expect(DEFAULT_STATE.style).toBe("prong");
    expect(DEFAULT_STATE.shankSection).toBeUndefined();
  });

  it("set_setting で選べる。腕は φ4 の丸線に替わり、戻すと前の腕に戻る", () => {
    expect(parseToolCall("set_setting", { style: "tension", reason: "挟む" }).ok).toBe(true);
    expect(parseToolCall("set_shank", { section: "maru", reason: "丸線" }).ok).toBe(true);
    const s = session();
    s.setShank({ section: "hirauchi", width_mm: 3, thickness_mm: 1.5, reason: "前の腕" });
    const res = s.setSetting({ style: "tension", reason: "挟む" });
    expect(res.setting.style).toBe("tension");
    expect(res.setting.tension!.gap_mm).toBeCloseTo(6.22, 2);
    expect(res.setting.prong_count).toBeNull();
    expect(s.built!.ring.shank.section).toBe("maru");
    expect(s.built!.ring.shank.widthMm).toBe(4);
    s.setSetting({ style: "prong", reason: "戻す" });
    expect(s.state.shankSection).toBe("hirauchi");
    expect(s.built!.ring.shank.widthMm).toBe(3);
    expect(s.built!.ring.setting.style).toBe("prong");
  });

  it("太さと号は変えられる。確かめは通る言葉で返す", () => {
    const s = session();
    s.setSetting({ style: "tension", reason: "挟む" });
    s.setShank({ gou: 13, width_mm: 4.5, thickness_mm: 4.5, reason: "太く" });
    const b = s.built!;
    expect(b.ring.shank.gou).toBe(13);
    expect(b.ring.shank.thicknessMm).toBe(4.5);
    const c = s.check();
    expect(c.problems).toEqual([]);
    expect(c.passed).toContain("溝の高さが腕に収まるか");
    expect(c.passed).not.toContain("爪の太さ");
    expect(c.note).toContain("加工硬化");
    expect(c.note).toContain("参考の計算");
  });

  it("爪留めの確かめの一覧に、テンションの確かめは出ない", () => {
    const s = session();
    s.build("爪");
    expect(s.check().passed.join(" ")).not.toContain("溝の高さ");
  });
});

describe("帳面と作り方", () => {
  it("帳面に職人の決まりがある（出どころ 職人：石川、2026-11-05）", () => {
    const rules = activeRules(repo as unknown as Ledger);
    const depth = rules.find((r) => r.id === "rule-tension-depth-ishikawa")!;
    const hard = rules.find((r) => r.id === "rule-tension-hard-ishikawa")!;
    expect(depth.source).toEqual({ kind: "craftsman", name: "石川" });
    expect(depth.date).toBe("2026-11-05");
    expect(depth.quote).toContain("角はくぼみに 0.8 ミリとかで");
    expect(depth.quote).toContain("辺は溝に 0.5 mm");
    expect(hard.quote).toContain("硬い状態でないと取れる");
  });

  it("本文は今の値（0.8 mm）で、決め直した日が分かる。計算とつながっている。「最後は職人が決める」はそのまま", () => {
    const rules = activeRules(repo as unknown as Ledger);
    const depth = rules.find((r) => r.id === "rule-tension-depth-ishikawa")!;
    const hard = rules.find((r) => r.id === "rule-tension-hard-ishikawa")!;
    expect(depth.text).toContain("角の先を 0.8 mm くらい");
    expect(depth.text).toContain("2026-11-05 に 1 mm くらいから 0.8 mm に決め直した");
    expect(depth.text).toContain(`辺を ${GUIDES.tension.edgeGrooveMm} mm`);
    expect(GUIDES.tension.cornerPitMm).toBe(0.8);
    expect(hard.text).toContain("最後は職人が決める");
    expect(depth.calc).toBe("tension");
    expect(hard.calc).toBe("tension");
  });

  it("このブラウザに前の文のまま残った決まりは、新しい文になる。職人が書き直した文は残す", () => {
    const rules = activeRules(repo as unknown as Ledger);
    const depth = rules.find((r) => r.id === "rule-tension-depth-ishikawa")!;
    const hard = rules.find((r) => r.id === "rule-tension-hard-ishikawa")!;
    const oldText = "三角の石を腕の両はしで挟むとき、片方の端に小さなくぼみを掘って、角の先を 1 mm くらい入れる。もう片方の端には、辺に沿ったまっすぐな溝を切って、辺を 0.5 mm 差し込む。角がくぼみで止まるので、石は横にずれない";
    const old = { ...depth, text: oldText, quote: "角はくぼみに 1 mm くらい。辺は溝に 0.5 mm", calc: undefined };
    const fresh = freshenRules([old], rules)[0];
    expect(fresh.text).toBe(depth.text);
    expect(fresh.quote).toBe(depth.quote);
    const mine = { ...depth, text: "うちは 0.7 mm", calc: undefined };
    expect(freshenRules([mine], rules)[0].text).toBe("うちは 0.7 mm");
    expect(freshenRules([mine], rules)[0].calc).toBe("tension");
    const { calc: _drop, ...noCalc } = hard;
    expect(freshenRules([noCalc], rules)[0].calc).toBe("tension");
    const other = { ...hard, id: "どこにもない" };
    expect(freshenRules([other], rules)[0]).toBe(other);
  });

  const howTo = (method: "hand" | "cast") => {
    const ring = ringOf(triangle);
    return howToMake({ ring, outlineMm: triangle.outlineMm, longMm: 8.88, widthMm: 7.52, depthMm: 4.24, metalLabel: "K18", alloy: null }, method);
  };

  it("手作りの工程：丸線 → 曲げる → 硬くする → 溝とくぼみ → 詰める → 石を入れる", () => {
    const ids = howTo("hand").map((s) => s.id);
    expect(ids).toEqual(["material", "bend", "harden", "tension_cut", "tension_close", "tension_set", "finish"]);
    const cut = howTo("hand").find((s) => s.id === "tension_cut")!;
    expect(cut.specs.map((x) => x.value).join(" ")).toContain("0.80 mm");
    expect(cut.specs.map((x) => x.value).join(" ")).toContain("0.50 mm");
  });

  it("出典のない数字は書かず「職人が決める」", () => {
    const text = JSON.stringify(howTo("hand"));
    expect(text).toContain("職人が決める");
    const close = howTo("hand").find((s) => s.id === "tension_close")!;
    expect(close.specs.find((x) => x.label === "縮める量")!.value).toContain("職人が決める");
  });

  it("鋳造でも工程が出て、硬さは職人が決める", () => {
    const ids = howTo("cast").map((s) => s.id);
    expect(ids).toContain("harden");
    expect(ids).toContain("tension_set");
    expect(ids).not.toContain("prong");
  });
});
