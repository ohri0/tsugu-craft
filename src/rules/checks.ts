// 確かめるルール（docs/SPEC.md「確かめるルール」の表）。答えではなく、問題と直し方の選択肢を返す。
// 数字はすべて guides.ts から読む。選択肢の言葉と「見た目への影響」は .claude/skills/jeweler-guides/SKILL.md と同じ。
import type { Point } from "../geometry/polygon";
import type { RingDesign } from "../geometry/ring";
import { tipMeasures, type SettingResult } from "../geometry/setting";
import { GUIDE_NOTE, GUIDES, type Guides, type StonePosition } from "./guides";
import { prongMinOverride } from "./ledger";

/** 画面に必ず添える、留まりの注意 */
export const HOLD_NOTE = "「留まり」は爪を片持ちの棒と見なした目安の比較で、強度計算の代わりではない";

export { GUIDE_NOTE };

export interface FixOption {
  /** 直し方の名前（Claude と画面がどの直し方か見分けるため） */
  id: FixId;
  label: string;
  /** 見た目への影響 */
  effectOnLook: string;
}

export type FixId = keyof typeof FIXES;

/** 直し方の選択肢と、見た目への影響（SKILL.md「選択肢の出し方」と同じ言葉） */
export const FIXES = {
  raise: { label: "石座を高くする", effectOnLook: "光が入り石は大きく見えるが、引っかかりやすく爪が長くなる" },
  thicker: { label: "爪を太くする", effectOnLook: "少し重く見える" },
  moreProngs: { label: "爪の本数を増やす", effectOnLook: "細いまま支えが増える" },
  lower: { label: "石座を低くする", effectOnLook: "引っかかりも減るが輝きは控えめ" },
  bezel: { label: "覆輪にする", effectOnLook: "いちばん取れにくいが見た目が大きく変わる" },
  vAtCorner: { label: "角に V 字の爪", effectOnLook: "角の先が金属で包まれ、角の形がくっきり見える" },
  tipUp: { label: "爪の先を上げる", effectOnLook: "石をしっかり押さえるが、爪が少し目立つ" },
  tipDown: { label: "爪の先を下げる", effectOnLook: "石の上面が広く見えるが、かかりは浅くなる" },
  addProng: { label: "爪を足す", effectOnLook: "支えが増え、爪が少し目立つ" },
  thickerWall: { label: "壁を厚くする", effectOnLook: "縁の金属の線が太く見える" },
} as const satisfies Record<string, Omit<FixOption, "id">>;

function fix(...ids: FixId[]): FixOption[] {
  return ids.map((id) => ({ id, ...FIXES[id] }));
}

export type CheckId = "finger-gap" | "prong-thin" | "tip-height" | "hold" | "prong-gap" | "corner" | "bezel-wall";

/** 問題の場所（画面で赤くする所） */
export type CheckTarget =
  | { kind: "setting" }
  | { kind: "prong"; index: number }
  | { kind: "corner"; index: number; point: Point }
  | { kind: "gap"; fromT: number; toT: number };

export interface Problem {
  /** 確かめの種類と場所（例：prong-thin:2） */
  id: string;
  check: CheckId;
  /** どこ（ふつうの言葉） */
  where: string;
  /** 今の値（単位つき） */
  current: string;
  /** 必要な値（単位つき） */
  required: string;
  currentValue: number;
  requiredValue: number;
  reason: string;
  options: FixOption[];
  target: CheckTarget;
}

export interface CheckOptions {
  /** 石の場所：上（ふつうの一粒の指輪）／横（肩）／手のひら側寄り。既定は上 */
  position?: StonePosition;
  /** 確かめに使う目安（目安帳で職人が上書きした値）。なければ公開情報レベルの目安 */
  guides?: Guides;
}

const mm = (v: number) => `${v.toFixed(2)} mm`;
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const times = (v: number) => `${v.toFixed(2)}×`;

/**
 * 石の留まり（目安の比較）。標準の 4 本爪・標準の太さ・標準の高さ ＝ 1.0×。
 * 足ごとに（1 ÷ 4）×（太さ ÷ 標準の太さ）³ ×（標準の長さ ÷ 長さ）を足す。V 字の爪は足 2 本。覆輪は 2.0×。
 */
export function holdRatio(s: SettingResult): number {
  if (s.style === "bezel") return GUIDES.hold.bezel;
  const n = GUIDES.hold.standardProngCount;
  return s.prongs.reduce(
    (sum, p) => sum + (p.legs / n) * (p.diameterMm / s.standardProngMm) ** 3 * (s.standardLengthMm / p.lengthMm),
    0,
  );
}

/** 爪（足）と爪の間のいちばん広い所 ÷ 縁の周。足の位置の間で測る */
export function maxProngGap(s: SettingResult): { ratio: number; fromT: number; toT: number } {
  const ts = s.prongs.flatMap((p) => p.legTs).sort((a, b) => a - b);
  if (ts.length === 0) return { ratio: 1, fromT: 0, toT: 0 };
  let best = { ratio: -1, fromT: 0, toT: 0 };
  ts.forEach((t, j) => {
    const next = j + 1 < ts.length ? ts[j + 1] : ts[0] + 1;
    if (next - t > best.ratio) best = { ratio: next - t, fromT: t, toT: next % 1 };
  });
  return best;
}

/** 尖った角から、いちばん近い爪の縁までの距離（上から見て、mm）。覆輪なら 0 */
export function cornerDistances(s: SettingResult): number[] {
  if (s.style === "bezel") return s.corners.map(() => 0);
  return s.corners.map((c) => {
    let best = Infinity;
    for (const p of s.prongs) {
      for (const q of [p.point, ...p.legPoints]) {
        best = Math.min(best, Math.max(0, Math.hypot(q.x - c.point.x, q.y - c.point.y) - p.diameterMm / 2));
      }
    }
    return best;
  });
}

/** 指輪をまるごと確かめる。問題がなければ空の一覧 */
export function checkRing(ring: RingDesign, opts: CheckOptions = {}): Problem[] {
  return checkSetting(ring.setting, ring.culetGapMm, opts);
}

/** 石座を確かめる（指とのすき間は、置いたあとの値を渡す） */
export function checkSetting(s: SettingResult, culetGapMm: number = s.heights.culetGapMm, opts: CheckOptions = {}): Problem[] {
  const out: Problem[] = [];
  const g: Guides = opts.guides ?? GUIDES;

  // 石の一番下と指のすき間
  if (culetGapMm < g.height.minFingerGapMm - 1e-6) {
    out.push({
      id: "finger-gap",
      check: "finger-gap",
      where: "石の一番下（キューレット）と指",
      current: mm(culetGapMm),
      required: `${mm(g.height.minFingerGapMm)} 以上`,
      currentValue: culetGapMm,
      requiredValue: g.height.minFingerGapMm,
      reason: "石の先が指に当たると痛く、石も欠けやすい",
      options: fix("raise"),
      target: { kind: "setting" },
    });
  }

  if (s.style === "prong") {
    // 爪の太さ
    // 目安帳に職人の爪の太さの決まりがあれば、それを使う（なければ式）
    const minProng = prongMinOverride(g) ?? s.minProngMm;
    s.prongs.forEach((p, i) => {
      if (p.diameterMm < minProng - 1e-9) {
        out.push({
          id: `prong-thin:${i}`,
          check: "prong-thin",
          where: prongName(i, p.isV),
          current: mm(p.diameterMm),
          required: `${mm(minProng)} 以上`,
          currentValue: p.diameterMm,
          requiredValue: minProng,
          reason: "石の大きさに対して爪が細く、曲がったり減ったりして石が外れやすい",
          options: fix("thicker"),
          target: { kind: "prong", index: i },
        });
      }
    });

    // 爪の先の高さ（全部の爪で同じ高さなので、1 つにまとめる）
    const tipZ = s.heights.tipZ;
    if (tipZ !== null) {
      const m = tipMeasures(s.heights, tipZ);
      const [r0, r1] = g.prong.tipHeightRatio;
      const [o0, o1] = g.prong.crownOverlapRatio;
      const ratioOk = m.ratio >= r0 - 1e-9 && m.ratio <= r1 + 1e-9;
      const overlapOk = m.overlap >= o0 - 1e-9 && m.overlap <= o1 + 1e-9;
      if (!ratioOk || !overlapOk) {
        const useRatio = !ratioOk;
        const v = useRatio ? m.ratio : m.overlap;
        const [lo, hi] = useRatio ? [r0, r1] : [o0, o1];
        const low = v < lo;
        out.push({
          id: "tip-height",
          check: "tip-height",
          where: "爪の先（全部の爪）",
          current: useRatio ? `上面までの高さの ${pct(v)}` : `上側にかかる長さ 上側の ${pct(v)}`,
          required: useRatio ? `上面までの高さの ${pct(lo)}〜${pct(hi)}` : `上側の ${pct(lo)}〜${pct(hi)}`,
          currentValue: v,
          requiredValue: low ? lo : hi,
          reason: low ? "爪の先が低く、石を押さえる所が浅い" : "爪の先が高く、引っかかりやすい・石の上面が隠れる",
          options: fix(low ? "tipUp" : "tipDown"),
          target: { kind: "setting" },
        });
      }
    }

    // 爪の間隔
    const gap = maxProngGap(s);
    if (gap.ratio > g.prong.maxGapRatio + 1e-9) {
      out.push({
        id: "prong-gap",
        check: "prong-gap",
        where: `縁の ${pct(gap.fromT)} 〜 ${pct(gap.toT)} の間`,
        current: `縁の周の ${pct(gap.ratio)}`,
        required: `縁の周の ${pct(g.prong.maxGapRatio)} 以下`,
        currentValue: gap.ratio,
        requiredValue: g.prong.maxGapRatio,
        reason: "爪の間が広く、石が傾いて抜けやすい",
        options: fix("addProng", "bezel"),
        target: { kind: "gap", fromT: gap.fromT, toT: gap.toT },
      });
    }

    // 尖った角
    cornerDistances(s).forEach((d, i) => {
      if (d > g.prong.cornerReachMm + 1e-9) {
        const c = s.corners[i];
        out.push({
          id: `corner:${i}`,
          check: "corner",
          where: `尖った角 ${i + 1}（内角 ${c.angleDeg.toFixed(0)}°）`,
          current: `いちばん近い爪まで ${mm(d)}`,
          required: `${mm(g.prong.cornerReachMm)} 以内に爪`,
          currentValue: d,
          requiredValue: g.prong.cornerReachMm,
          reason: "尖った角の先は欠けやすく、爪で守られていない",
          options: fix("vAtCorner", "bezel"),
          target: { kind: "corner", index: i, point: c.point },
        });
      }
    });
  }

  // 石の留まり
  const position = opts.position ?? "top";
  const need = position === "palm" ? g.hold.requiredPalm : position === "side" ? g.hold.requiredSide : g.hold.requiredTop;
  const hold = holdRatio(s);
  if (hold < need - 1e-9) {
    out.push({
      id: "hold",
      check: "hold",
      where: `石の留まり（石の場所：${positionName(position)}）`,
      current: times(hold),
      required: `${times(need)} 以上`,
      currentValue: hold,
      requiredValue: need,
      reason: `爪の太さ・本数・長さから見た留まりが足りない（${HOLD_NOTE}）`,
      options: fix("thicker", "moreProngs", "lower", "bezel"),
      target: { kind: "setting" },
    });
  }

  // 覆輪の壁
  if (s.bezel && s.bezel.wallMm < g.bezel.wallMinMm - 1e-9) {
    out.push({
      id: "bezel-wall",
      check: "bezel-wall",
      where: "覆輪の壁",
      current: mm(s.bezel.wallMm),
      required: `${mm(g.bezel.wallMinMm)} 以上`,
      currentValue: s.bezel.wallMm,
      requiredValue: g.bezel.wallMinMm,
      reason: "壁が薄く、石を押さえる力が弱い・へこみやすい",
      options: fix("thickerWall"),
      target: { kind: "setting" },
    });
  }

  return out;
}

function prongName(i: number, isV: boolean): string {
  return `${isV ? "V 字の爪" : "爪"} ${i + 1}`;
}

function positionName(p: StonePosition): string {
  return p === "palm" ? "手のひら側寄り" : p === "side" ? "横（肩）" : "上";
}
