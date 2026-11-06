// 確かめるルール（docs/SPEC.md「確かめるルール」の表）。答えではなく、問題と直し方の選択肢を返す。
// 数字はすべて guides.ts から読む。選択肢の言葉と「見た目への影響」は .claude/skills/jeweler-guides/SKILL.md と同じ。
import { resample, toCounterClockwise, type Point } from "../geometry/polygon";
import type { RingDesign } from "../geometry/ring";
import type { ShankResult } from "../geometry/shank";
import { findThinSpots, type ThinSpot } from "../geometry/section-thin";
import { stoneSpaces } from "../geometry/multi";
import { tipMeasures, type SettingResult } from "../geometry/setting";
import type { TensionEnd, TensionInfo } from "../geometry/tension";
import { checkNunome, faceSpan, nunomeOf, type NunomeCheck, type NunomeDesign, type NunomeIssue } from "../geometry/nunome";
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
  vAtCorner: { label: "角に 1 本ずつ爪を置く", effectOnLook: "尖った角が爪で守られ、角の形がそのまま見える" },
  tipUp: { label: "爪の先を上げる", effectOnLook: "石をしっかり押さえるが、爪が少し目立つ" },
  tipDown: { label: "爪の先を下げる", effectOnLook: "石の上面が広く見えるが、かかりは浅くなる" },
  addProng: { label: "爪を足す", effectOnLook: "支えが増え、爪が少し目立つ" },
  thickerWall: { label: "壁を厚くする", effectOnLook: "縁の金属の線が太く見える" },
  thickerBand: { label: "腕を厚くする", effectOnLook: "指に当たる所が少し厚く、少し重くなる" },
  widerBand: { label: "腕の幅を広げる", effectOnLook: "腕が少し太く見える" },
  bluntTip: { label: "断面を直す（赤い所へ）", effectOnLook: "とがった線が少しやわらかく見える" },
  shallowerRelief: { label: "彫りを浅くする", effectOnLook: "模様が少し控えめに見える" },
  spreadStones: { label: "石の間を広げる", effectOnLook: "石と石の間に地金が少し見え、並びが少し長くなる" },
  smallerStones: { label: "横の石を小さくする", effectOnLook: "真ん中の石が引き立ち、横の石は控えめになる" },
  thickerCollar: { label: "下の輪の板を厚くする", effectOnLook: "石座の下の輪が少し太く見える" },
  tallerCollar: { label: "下の輪を高くする", effectOnLook: "石座の下の輪が少し高くなり、腕の端がまるごと輪に当たる" },
  thinnerBand: { label: "腕を薄くする", effectOnLook: "腕が少し細く見え、少し軽くなる" },
  thickerWire: { label: "腕の線を太くする", effectOnLook: "腕が太く、少し重く見える" },
  thinnerWire: { label: "腕の線を細くする", effectOnLook: "腕が細く見え、軽くなる。ばねの力は弱くなる" },
  turnGrip: { label: "挟む向きを変える", effectOnLook: "石の向きが変わり、腕の開きも変わる" },
  prongInstead: { label: "爪留めにする", effectOnLook: "石のまわりに爪が立ち、腕の両はしは閉じて見える" },
  smallerTsuchime: { label: "槌目を小さくする", effectOnLook: "跡が浅く細かくなり、光がこまかく散る" },
  noTsuchime: { label: "槌目をやめる", effectOnLook: "腕がなめらかな鏡面にもどる" },
  noMilgrain: { label: "ミル打ちをやめる", effectOnLook: "腕の縁がすっきり見える" },
  inlayLine: { label: "象嵌の線の太さを直す", effectOnLook: "模様の線が少し太く（細く）見える" },
  inlayLarger: { label: "象嵌の模様を大きくする", effectOnLook: "模様がゆったりして、地が広く見える" },
  inlayNarrower: { label: "象嵌の帯を細くする", effectOnLook: "帯が細く、控えめになる" },
  inlayFoil: { label: "平金の厚みを直す", effectOnLook: "見た目はほとんど変わらない" },
  inlayBorder: { label: "象嵌の縁の線をつける", effectOnLook: "帯の両縁に細い線が入る" },
  noInlay: { label: "象嵌をやめる", effectOnLook: "腕が地金だけにもどる" },
} as const satisfies Record<string, Omit<FixOption, "id">>;

function fix(...ids: FixId[]): FixOption[] {
  return ids.map((id) => ({ id, ...FIXES[id] }));
}

export type CheckId =
  | "finger-gap"
  | "prong-thin"
  | "tip-height"
  | "hold"
  | "prong-gap"
  | "corner"
  | "collar-stone"
  | "bezel-wall"
  | "band-thin"
  | "band-narrow"
  | "band-spike"
  | "band-relief"
  | "band-valley"
  /** 断面の溝の幅。止めない（作れない所にならない）。帳面の決まりと黄色の注意（grooveNote）を結ぶ名前 */
  | "band-groove"
  | "stone-space"
  | "metal-space"
  | "collar-wall"
  | "band-end"
  | "tension-gap"
  | "tension-cut"
  | "tension-lip"
  | "tension-girdle"
  | "tension-pit"
  | "tension-culet"
  | "tension-sunk"
  | "tension-overhang"
  | "tsuchime-thin"
  | "milgrain-fit"
  /** 布目象嵌の模様が作れるか（線の太さ・地のすき間・小さなかけら・帯が面に収まるか・平金の厚み） */
  | NunomeCheck;

/** 問題の場所（画面で赤くする所） */
export type CheckTarget =
  | { kind: "setting" }
  /** 腕（いちばん細い・薄い所） */
  | { kind: "shank" }
  /** 腕の断面の、局所的に薄い所（断面の座標 mm：x は幅の向き、y は指の側からの高さ）。腕ぜんぶではなく、その点だけを示す */
  | { kind: "shank-spot"; x: number; y: number }
  /** 覆輪の壁 */
  | { kind: "bezel" }
  | { kind: "prong"; index: number }
  | { kind: "corner"; index: number; point: Point }
  | { kind: "gap"; fromT: number; toT: number; point?: Point }
  /** となりの石・石座の間が狭い所（point は指輪の座標 mm。stones は 2 つの石の番号） */
  | { kind: "space"; point: [number, number, number]; stones: [number, number] }
  /** 腕の間に挟む石座の、下の輪（板を丸めた輪）ぜんぶ */
  | { kind: "collar" }
  /** 腕の端が下の輪に当たる所（point は指輪の座標 mm） */
  | { kind: "band-end"; point: [number, number, number] }
  /** 布目象嵌の模様（腕は赤くせず、はめこんだ模様を赤く見せる） */
  | { kind: "inlay" };

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
  /** 布目象嵌の問題の直し方（直した模様の値。画面と Claude の直し方が使う） */
  nunomePatch?: Partial<NunomeDesign>;
  /**
   * 石を並べた指輪で、どの石の問題か（RingDesign.stones の番号。なければ 0 ＝ 真ん中の石）。
   * target の爪・角・縁の位置は、この石の座標
   */
  stone?: number;
}

export interface CheckOptions {
  /** 石の場所：上（ふつうの一粒の指輪）／横（肩）／手のひら側寄り。既定は上 */
  position?: StonePosition;
  /** 確かめに使う目安（目安帳で職人が上書きした値）。なければ公開情報レベルの目安 */
  guides?: Guides;
  /** 石を並べた指輪で、石ごとの目安（石の大きさで変わる職人の決まりのため。石の番号 → 目安）。なければ guides */
  guidesFor?: (stone: number) => Guides;
}

const mm = (v: number) => `${v.toFixed(2)} mm`;
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
/** 留まりの倍。画面に「0.13×」とだけ出ると何の数か分からなかったので、ふつうの言葉で（2026-11-06） */
const times = (v: number) => `${v.toFixed(2)} 倍`;

/**
 * 石の留まり（目安の比較）。標準の 4 本爪・標準の太さ・標準の高さ ＝ 1.0×。
 * 足ごとに（1 ÷ 4）×（太さ ÷ 標準の太さ）³ ×（標準の長さ ÷ 長さ）を足す。V 字の爪は足 2 本。覆輪は 2.0×。
 */
/** 角が 3 つの石を、角に 1 本ずつの爪で留めているとき、その本数（職人の判断。guides.ts の hold.cornerSet） */
export function cornerSetCount(s: Pick<SettingResult, "prongs" | "corners">, g: Guides = GUIDES): number | undefined {
  if (!g.hold.cornerSet) return undefined;
  const cs = g.hold.cornerSetMatch;
  const sharp = s.corners.filter((c) => c.angleDeg < cs.maxCornerAngleDeg);
  // 職人に聞いたのは「丸い爪（足 1 本）を角に 1 本ずつ」。V 字の爪（足 2 本）はこれまでどおり 4 本の標準で数える
  if (sharp.length !== 3 || s.prongs.length !== sharp.length || s.prongs.some((p) => p.legs !== 1)) return undefined;
  const near = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b)) <= cs.tTolerance;
  return sharp.every((c) => s.prongs.some((p) => near(p.t, c.t))) ? sharp.length : undefined;
}

export function holdRatio(s: SettingResult, g: Guides = GUIDES): number {
  if (s.style === "bezel") return g.hold.bezel;
  // テンションは爪の比べでは測れない（ばねと地金の硬さが主役。tensionNotes が注意を出す）
  if (s.style === "tension") return 0;
  const n = cornerSetCount(s, g) ?? g.hold.standardProngCount;
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
  const out = [...checkSetting(ring.setting, ring.culetGapMm, opts), ...checkShank(ring.shank, opts), ...checkBandEnds(ring, opts), ...checkTension(ring.setting, opts.guides), ...checkFinish(ring, opts)];
  // 爪の間が空きすぎの所に、赤い印を出すための縁の点（石の座標）
  const gapPoints = (list: Problem[], outline: readonly Point[]) => {
    for (const p of list) {
      if (p.target.kind !== "gap") continue;
      const { fromT, toT } = p.target;
      const mid = (fromT + ((toT - fromT + 1) % 1) / 2) % 1;
      p.target.point = outlinePointAtT(outline, mid);
    }
  };
  gapPoints(out, ring.params.stone.outlineMm);
  const stones = ring.stones ?? [];
  if (stones.length < 2) return out;
  // 石を並べた指輪：ほかの石も、一粒と同じ確かめを石ごとに（名前に石の番号をつける）
  out.forEach((p) => {
    if (p.check.startsWith("band")) return;
    p.stone = 0;
    p.where = `石 1・${p.where}`;
  });
  stones.slice(1).forEach((st, k) => {
    const i = k + 1;
    const list = checkSetting(st.setting, st.culetGapMm, { ...opts, guides: opts.guidesFor?.(i) ?? opts.guides });
    gapPoints(list, st.params.outlineMm);
    for (const p of list) out.push({ ...p, id: `s${i}:${p.id}`, where: `石 ${i + 1}・${p.where}`, stone: i });
  });
  out.push(...checkSpacing(ring, opts));
  return out;
}

/**
 * 腕の間に挟む石座：腕の両端が、下の輪（板を丸めた輪）の横に当たっているか。腕の端の高さのうち、輪に当たる割合で比べる。
 * 数字は GUIDES.join.between（仮の目安）
 */
export function checkBandEnds(ring: Pick<RingDesign, "setting" | "transform">, opts: CheckOptions = {}): Problem[] {
  const g: Guides = opts.guides ?? GUIDES;
  const c = ring.setting.collar;
  if (!c) return [];
  const need = g.join.between.minEndContactRatio;
  const out: Problem[] = [];
  if (c.ends.length < 2) {
    out.push({
      id: "band-end:none",
      check: "band-end",
      where: "腕の両はしと石座の下の輪",
      current: "腕の端が輪に届かない",
      required: "腕の両はしが輪の横に当たる",
      currentValue: 0,
      requiredValue: need,
      reason: "腕の端が石座に当たらないと、ロウ付けできない",
      options: fix("tallerCollar"),
      target: { kind: "setting" },
    });
    return out;
  }
  c.ends.forEach((e, i) => {
    if (e.ratio >= need - 1e-9) return;
    const [x, y, z] = e.point;
    const cs = Math.cos(ring.transform.rotationZ);
    const sn = Math.sin(ring.transform.rotationZ);
    out.push({
      id: `band-end:${i}`,
      check: "band-end",
      where: `腕の${e.v > 0 ? "右" : "左"}のはしと、石座の下の輪`,
      current: e.ratio <= 0 ? "腕の端が輪に届かない" : `腕の端の高さの ${pct(e.ratio)} だけが輪に当たる`,
      required: `${pct(need)} 以上（仮の目安）`,
      currentValue: e.ratio,
      requiredValue: need,
      reason: "腕の端が輪からはみ出すと、ロウ付けの面が足りず、段も見える",
      options: fix("tallerCollar", "thinnerBand"),
      target: { kind: "band-end", point: [x * cs - y * sn, x * sn + y * cs, z + ring.transform.translateZ] },
    });
  });
  return out;
}

const endName = (e: TensionEnd) => (e.kind === "pit" ? "角のくぼみ" : "辺の溝");
const endPoint = (e: TensionEnd, z: number): [number, number, number] => [0, e.planeY, z];

/**
 * テンション（挟む）：計算で確かな物だけ「作れない」にする。地金が残らない・石の縁が溝に入らない、という形の話。
 * ばねの強さは形から分からないので合否にしない（tensionNotes が注意を出す）
 */
export function checkTension(s: Pick<SettingResult, "tension">, g: Guides = GUIDES): Problem[] {
  const info = s.tension;
  if (!info) return [];
  const out: Problem[] = [];
  const t = g.tension;
  // 腕の線を太くできるのは、つまみの上限まで。そこまで来たら、ほかの留め方をすすめる
  const canThicken = info.wireMm < t.wireMaxMm - 1e-9;
  const opts = canThicken ? fix("thickerWire", "prongInstead") : fix("prongInstead", "bezel");
  if (info.gapMm <= GEOMETRY_MIN_GAP_MM + 1e-9) {
    out.push({
      id: "tension-gap",
      check: "tension-gap",
      where: "腕の開き",
      current: "開きが作れない",
      required: "石の高さが、くぼみと溝の深さより大きい",
      currentValue: info.gapMm,
      requiredValue: GEOMETRY_MIN_GAP_MM,
      reason: "石が小さく、両はしの彫りの深さだけで石の高さを超える",
      options: fix("prongInstead", "bezel"),
      target: { kind: "setting" },
    });
  }
  for (const e of info.ends) {
    const name = endName(e);
    const height = e.wireTopZ - e.wireBottomZ;
    const point = endPoint(e, (e.openTopZ + e.openBottomZ) / 2);
    if (e.openingMm >= height - 1e-9) {
      out.push({
        id: `tension-cut:${e.side}`,
        check: "tension-cut",
        where: `${name}と腕の太さ`,
        current: `彫り口 ${mm(e.openingMm)}・腕の高さ ${mm(height)}`,
        required: "彫り口より腕が太い",
        currentValue: height,
        requiredValue: e.openingMm,
        reason: "腕が細く、彫ると腕の端が上下に分かれて切れる",
        options: opts,
        target: { kind: "band-end", point },
      });
      continue;
    }
    if (e.lipTopMm <= 1e-9 || e.lipBottomMm <= 1e-9) {
      const top = e.lipTopMm <= e.lipBottomMm;
      const lip = top ? e.lipTopMm : e.lipBottomMm;
      out.push({
        id: `tension-lip:${e.side}`,
        check: "tension-lip",
        where: `${name}の${top ? "上" : "下"}`,
        current: `彫り口が腕の${top ? "上" : "下"}から ${mm(Math.abs(lip))} はみ出す`,
        required: "彫り口の上と下に地金が残る",
        currentValue: lip,
        requiredValue: 0,
        reason: `${name}の高さが腕に収まらず、${top ? "石を上から押さえる" : "石を下から受ける"}地金が残らない`,
        options: opts,
        target: { kind: "band-end", point: endPoint(e, top ? e.wireTopZ : e.wireBottomZ) },
      });
    }
    if (!e.girdleInWire || e.contactWidthMm <= 1e-9) {
      out.push({
        id: `tension-girdle:${e.side}`,
        check: "tension-girdle",
        where: `石の縁と${name}`,
        current: "石の縁が腕の高さの外にある",
        required: "石の縁が腕の高さの中",
        currentValue: e.contactWidthMm,
        requiredValue: 0,
        reason: "石の縁（ガードル）が腕の端に当たらないと、挟めない",
        options: opts,
        target: { kind: "band-end", point },
      });
    }
    if (e.kind === "pit" && e.sideWallMm <= 1e-9) {
      out.push({
        id: `tension-pit:${e.side}`,
        check: "tension-pit",
        where: "角のくぼみの両わき",
        current: `くぼみの幅 ${mm(e.openWidthMm)}・腕の幅 ${mm(e.contactWidthMm)}`,
        required: "くぼみの両わきに地金が残る",
        currentValue: e.sideWallMm,
        requiredValue: 0,
        reason: "くぼみが腕の幅より広く、くぼみの両わきに地金が残らない。角が止まらず、石が横にずれる",
        options: opts,
        target: { kind: "band-end", point },
      });
    }
  }
  const armEnd = info.ends[0];
  // 石の先が、腕の内側より指の側へ出る（作者の声 2026-11-05「腕に刺さってるか、指の側に出てる」）
  if (info.culetBelowArmMm > t.maxCuletBelowArmMm + 1e-9) {
    out.push({
      id: "tension-culet",
      check: "tension-culet",
      where: "石の先と腕の内側",
      current: `石の先が腕の内側より ${mm(info.culetBelowArmMm)} 指の側へ出る`,
      required: `${mm(t.maxCuletBelowArmMm)} まで（仮の目安）`,
      currentValue: info.culetBelowArmMm,
      requiredValue: t.maxCuletBelowArmMm,
      reason: "石が深いのに腕が細く、石の先が腕より指の側へ出る。指に当たりやすい。腕の太さは、石の深さくらい要る",
      options: opts,
      target: { kind: "band-end", point: [0, 0, armEnd.wireBottomZ - info.culetBelowArmMm] },
    });
  }
  // 石が腕の中に沈む（同じ声）
  if (info.tableBelowArmMm > t.maxTableBelowArmMm + 1e-9) {
    out.push({
      id: "tension-sunk",
      check: "tension-sunk",
      where: "石の上面と腕の上",
      current: `石の上面が腕の上より ${mm(info.tableBelowArmMm)} 低い`,
      required: `${mm(t.maxTableBelowArmMm)} まで（仮の目安）`,
      currentValue: info.tableBelowArmMm,
      requiredValue: t.maxTableBelowArmMm,
      reason: "腕が太いのに石が浅く、石が腕の中に沈む。光が入りにくく、腕に刺さったように見える",
      options: info.wireMm > t.wireMinMm + 1e-9 ? fix("thinnerWire", "prongInstead") : fix("prongInstead", "bezel"),
      target: { kind: "band-end", point: [0, armEnd.planeY, armEnd.wireTopZ] },
    });
  }
  // 石が腕の幅の外へ大きくはみ出す（腕に挟まるのが、石の長さの 3 分の 1 より短い）。
  // 三角を長い辺の両はしの角で挟む形は、石のいちばん長い所を挟み、出るのは残りの角 1 つだけなので、この線で止めない。
  // 残りの角が横へ出ることは、tensionCautions で職人に確かめる（作者が実際に作った指輪はこの向きではない。2026-11-07 の聞きちがいを直した）
  if (info.overhangRatio > t.maxOverhangRatio + 1e-9 && !longTriangle(info)) {
    const turn = info.grips.length > 1 && info.grip === "short";
    const seat = armEnd.contactWidthMm > 0 ? armEnd.contactWidthMm : info.ends[1].contactWidthMm;
    out.push({
      id: "tension-overhang",
      check: "tension-overhang",
      where: "腕の幅の外へ出る石",
      current: `腕の幅 ${mm(seat)} の外へ、片側 ${mm(info.overhangMm)} 出る`,
      required: `腕の幅の ${pct(t.maxOverhangRatio)} まで（仮の目安）`,
      currentValue: info.overhangRatio,
      requiredValue: t.maxOverhangRatio,
      reason: "腕に挟まるのは石の真ん中だけで、外へ出た所をぶつけると、てこになって石が傾く。挟まる所が石の長さの 3 分の 1 より短い形は、作れるとは言わない",
      options: [...(turn ? fix("turnGrip") : []), ...opts],
      target: { kind: "setting" },
    });
  }
  return out;
}

/** 三角を、いちばん長い辺の両はしの角で挟む形か */
export function longTriangle(info: Pick<NonNullable<SettingResult["tension"]>, "mode" | "cornerCount">): boolean {
  return info.mode === "corner-corner" && info.cornerCount === 3;
}

/** 形を作るために止める開きの最低（geometry/tension.ts と同じ。これ以下は作れない） */
const GEOMETRY_MIN_GAP_MM = 0.1;

/**
 * テンションの注意（合否にしない言葉）。職人の言葉と資料のものだけ。
 * 数字はすべて GUIDES.tension。「仮」の数字には仮と書く
 */
export function tensionNotes(s: Pick<SettingResult, "tension" | "corners">, wireMm: number, g: Guides = GUIDES): string[] {
  const info = s.tension;
  if (!info) return [];
  const t = g.tension;
  const notes = [
    `地金は加工硬化した硬い状態が条件です。硬い状態でないと、石が取れます（職人の言葉）。K18・Pt900・シルバーでもできなくはありません。ばねの強さは形からは確かめられません。${GUIDE_NOTE}`,
    "欠けやすい石（職人の言葉：パライバなど）は、挟む力で欠けることがあります。できないと決まったわけではありません。職人に確かめてください",
    "あとで号を変えにくい留め方です。先に号を決めます（資料の声）",
  ];
  if ((info.mode === "corner-edge" && info.cornerCount === 1) || info.cornerCount === 2) notes.push("尖った形の石は、資料でも意見が分かれます（販売の文だけ）。挟む所は職人が決めます");
  if (info.overhangMm > 0) notes.push(`石が腕の幅の外へ、片側 ${mm(info.overhangMm)} 出ます。ぶつけやすい所です。職人が見て決めます`);
  if (info.liftMm > 0) notes.push(`石の先が指に当たらないよう、腕の両はしを指の丸みから ${mm(info.liftMm)} 持ち上げました（石の縁を腕の上寄りに置くため。仮の目安）`);
  const thin = info.ends.flatMap((e) => {
    const list: string[] = [];
    if (e.lipTopMm > 0 && e.lipTopMm < t.thinLipMm) list.push(`${endName(e)}の上 ${mm(e.lipTopMm)}`);
    if (e.lipBottomMm > 0 && e.lipBottomMm < t.thinLipMm) list.push(`${endName(e)}の下 ${mm(e.lipBottomMm)}`);
    if (e.kind === "pit" && e.sideWallMm > 0 && e.sideWallMm < t.thinLipMm) list.push(`${endName(e)}の両わき 約 ${mm(e.sideWallMm)}`);
    return list;
  });
  if (thin.length) notes.push(`彫った所に残る地金が薄い所：${thin.join("、")}（${mm(t.thinLipMm)} より薄い。仮の目安）。職人が見て決めます`);
  if (wireMm < t.minWireMm) notes.push(`腕の太さ ${mm(wireMm)}：${mm(t.minWireMm)} より細いと弱い、という職人の声が資料にあります（掲示板の 1 人の声）`);
  return notes;
}

/** 石の入れ方：形から決まる動き（どの動きで入るか）。言葉はここ 1 か所（画面・作り方・Claude の確かめが同じ言葉を読む） */
export interface TensionInsert {
  kind: "corner-first" | "corners" | "open" | "slide-or-open";
  /** どう入れるか（短い文） */
  how: string;
  /** 横のずれを、何が止めるか */
  hold: string;
  /** 横に止める物がない（まっすぐな溝だけ） */
  noStop: boolean;
}

/**
 * 形から決まる入れ方。くぼみと丸みに沿う溝は、横から入らない（行き止まり）ので、腕を開いて入れる。
 * 両はしともまっすぐな溝なら、形の上では横から滑り込む。資料の手順は、開いて入れるものだけ（docs/RESEARCH-tension.md の 13 節）。
 * 滑らせて締まりを強めにするのは作者の考えで、試していない
 */
export function tensionInsert(info: Pick<TensionInfo, "mode" | "slides">): TensionInsert {
  if (info.mode === "corner-edge")
    return { kind: "corner-first", how: "腕を開いて、角を先にくぼみへ入れ、辺を溝へ倒し込みます", hold: "角がくぼみで止まるので、横にずれません", noStop: false };
  if (info.mode === "corner-corner")
    return { kind: "corners", how: "腕を開いて、片方の角をくぼみへ入れてから、もう片方の角を入れます", hold: "角がくぼみで止まるので、横にずれません。挟む力は角の先にかかります", noStop: false };
  if (info.slides)
    return {
      kind: "slide-or-open",
      how: "腕を開いて上から入れるか、横から溝に滑らせて入れます。滑らせるなら、開くのは締まり（石を押さえる力）の分だけで済みます",
      hold: "横に止める物がないので、締まりを強めにします（作者の考え。まだ試していません）",
      noStop: true,
    };
  return { kind: "open", how: "腕を開いて、片側を溝へ入れてから、もう片側を入れます", hold: "溝が石の丸みに沿うので、腕が開かないと横へ動きません", noStop: false };
}

/**
 * 開いた輪を、まっすぐ押し開くとき、地金が戻れる範囲（耐力を超えない範囲）で開ける量（mm）。
 * 切れ目のある輪の曲げ：開く量 δ ＝ 3π F R³ ÷（E I）、いちばん大きい曲げ（開きの反対側）M ＝ 2 F R、σ ＝ M（d ÷ 2）÷ I。
 * F と I を消すと δ ≒ 3π R² σ ÷（E d）。I が消えるので、断面の形によらず、高さ d で決まる。
 * 前提：細い輪の近似（R が d より十分大きい。太い輪では内側の曲げが強くなるので、実際は少なめになりやすい）、まっすぐ押し開く（ねじらない）、端の溝は無視。
 * radiusMm：中心の半径 R。wireMm：線の高さ d。youngGpa：ヤング率 E。proofMpa：耐力 σ
 */
export function elasticOpeningMm(radiusMm: number, wireMm: number, youngGpa: number, proofMpa: number): number {
  return (3 * Math.PI * radiusMm * radiusMm * proofMpa) / (youngGpa * 1000 * wireMm);
}

export type HardState = "hardened" | "annealed";
/** テンションの計算の地金（K18 は色ごと） */
export type SpringMetal = keyof typeof GUIDES.tension.spring.metals;
export const HARD_STATE_LABEL: Record<HardState, string> = { hardened: "加工硬化", annealed: "焼きなまし" };

export interface TensionOpening {
  metal: SpringMetal;
  metalName: string;
  /** 中心の半径 R ＝ 指の半径 ＋ 太さ ÷ 2（mm）と、線の太さ d（mm） */
  radiusMm: number;
  wireMm: number;
  young: { gpa: number; provisional: boolean; basis: string };
  /** 石を入れるのに要る量（両はしの深さの和。mm）と、その内わけの言葉 */
  needMm: number;
  needText: string;
  states: { state: HardState; label: string; proofMpa: number; provisional: boolean; basis: string; openMm: number; enough: boolean }[];
  /** 硬い状態で足りるか（この留め方の条件は硬い状態） */
  enough: boolean;
}

/** 式の前提（画面の注。elasticOpeningMm のコメントと同じ） */
export const TENSION_OPENING_NOTE = "開ける量 ≒ 3π × R² × σ ÷（E × d）。細い輪の近似（太い輪では実際は少なめになりやすい）・まっすぐ押し開く・端の溝は無視、という前提の計算です";
/** 式の記号の言い換え（画面の注） */
export const TENSION_WORDS_NOTE = "R は輪の真ん中の半径、d は線の太さ、E はヤング率（地金の曲がりにくさ）、σ は耐力（これを超えると曲がったまま戻らない強さ）";
/** 足りないときの言葉 */
export const TENSION_SHORT_TEXT = "まっすぐ開くだけでは入らない見込み。斜めに入れる・熱で広げるなど、職人が決める";

/**
 * 参考の計算：地金が戻れる範囲で開ける量と、石を入れるのに要る量を並べる。合否にはしない（確かめの問題には入れない）。
 * 石にかかる力は出さない（信じられる出典がない）。テンションでなければ null
 */
export function tensionOpening(s: Pick<SettingResult, "tension">, sh: Pick<ShankResult, "innerRadiusMm" | "thicknessMm" | "metal">, g: Guides = GUIDES, springMetal?: SpringMetal): TensionOpening | null {
  const info = s.tension;
  if (!info) return null;
  // 色金（赤銅・四分一・銅）のばねの値は表にない。計算しない
  const id = springMetal ?? (sh.metal in g.tension.spring.metals ? (sh.metal as SpringMetal) : null);
  if (!id) return null;
  const m = g.tension.spring.metals[id];
  const radiusMm = sh.innerRadiusMm + sh.thicknessMm / 2;
  const wireMm = sh.thicknessMm;
  const needMm = info.ends[0].depthMm + info.ends[1].depthMm;
  const needText = `${info.ends.map((e) => `${endName(e)} ${e.depthMm.toFixed(2)} mm`).join(" ＋ ")} ＝ ${needMm.toFixed(2)} mm`;
  const states = (["hardened", "annealed"] as const).map((state) => {
    const v = m[state];
    const openMm = elasticOpeningMm(radiusMm, wireMm, m.young.gpa, v.proofMpa);
    return { state, label: HARD_STATE_LABEL[state], proofMpa: v.proofMpa, provisional: v.provisional, basis: v.basis, openMm, enough: openMm >= needMm };
  });
  return { metal: id, metalName: m.name, radiusMm, wireMm, young: m.young, needMm, needText, states, enough: states[0].enough };
}

/** 参考の計算を、1 つの文に（Claude の確かめの注に添える） */
export function tensionOpeningText(o: TensionOpening): string {
  const open = o.states.map((x) => `${x.label} 約 ${x.openMm.toFixed(2)} mm${x.provisional || o.young.provisional ? "（仮）" : ""}`).join("、");
  return `参考の計算（合否にしない）：${o.metalName} φ${o.wireMm.toFixed(1)} mm で、地金が戻れる範囲で開ける量は ${open}。石を入れるのに要る量は ${o.needText}。${o.enough ? "" : `${TENSION_SHORT_TEXT}。`}${TENSION_OPENING_NOTE}。${GUIDE_NOTE}`;
}

/** となりの石・石座の間（石を並べた指輪だけ）。数字は GUIDES.multi（仮の目安） */
export function checkSpacing(ring: RingDesign, opts: CheckOptions = {}): Problem[] {
  const g: Guides = opts.guides ?? GUIDES;
  const out: Problem[] = [];
  // つなぐ線で 1 つにした石座どうし（三石）は、地金の間を数えない（つながっている）
  const joined = new Set((ring.joins ?? []).map((j) => `${j.a}-${j.b}`));
  for (const sp of stoneSpaces(ring.stones)) {
    const name = `石 ${sp.a + 1} と 石 ${sp.b + 1} の間`;
    if (sp.stoneGapMm < g.multi.stoneGapMinMm - 1e-9) {
      out.push({
        id: `stone-space:${sp.a}-${sp.b}`,
        check: "stone-space",
        where: `${name}（石の縁どうし）`,
        current: sp.stoneGapMm <= 0 ? "石どうしが当たる" : mm(sp.stoneGapMm),
        required: `${mm(g.multi.stoneGapMinMm)} 以上（仮の目安）`,
        currentValue: sp.stoneGapMm,
        requiredValue: g.multi.stoneGapMinMm,
        reason: "石どうしが当たると、縁が欠けやすい",
        options: fix("spreadStones", "smallerStones"),
        target: { kind: "space", point: sp.stoneMid, stones: [sp.a, sp.b] },
      });
    } else if (!joined.has(`${sp.a}-${sp.b}`) && sp.metalGapMm > 0 && sp.metalGapMm < g.multi.metalGapMinMm - 1e-9) {
      // 石座どうしが重なる（つながる）ときは、ロウ付けで一つにするので数えない。少しだけ離れているときが困る
      out.push({
        id: `metal-space:${sp.a}-${sp.b}`,
        check: "metal-space",
        where: `${name}（石座どうし）`,
        current: mm(sp.metalGapMm),
        required: `${mm(g.multi.metalGapMinMm)} 以上、または つなげる（仮の目安）`,
        currentValue: sp.metalGapMm,
        requiredValue: g.multi.metalGapMinMm,
        reason: "石座の間のすき間が狭いと、磨きの道具が入らず汚れもたまり、鋳造では型のうすい壁が欠けやすい",
        options: fix("spreadStones", "smallerStones"),
        target: { kind: "space", point: sp.metalMid, stones: [sp.a, sp.b] },
      });
    }
  }
  return out;
}

/** 縁の上の位置 t（反時計回りにそろえた縁の、最初の点からの周の割合）の点 */
export function outlinePointAtT(outline: readonly Point[], t: number): Point {
  const N = 720;
  const pts = resample(toCounterClockwise(outline), N);
  return pts[((Math.round(t * N) % N) + N) % N];
}

/**
 * 伝統の仕上げ（槌目・ミル打ち）が、この腕に入るか。どちらも**仮**の決まり（資料に mm の決まりはない。guides.ts の finish）。
 * - 槌目：跡の深さだけ腕が薄くなる。いちばん薄い所から跡の深さを引いて、腕の厚みの目安を下回らないか（腕がもう薄いときは band-thin が知らせる）。
 * - ミル打ち：粒の大きさ × 粒いくつ分（2 列と間）の幅が、いちばん細い所にあるか。粒を 1 つも置けないときも知らせる
 */
export function checkFinish(ring: Pick<RingDesign, "shank" | "params" | "milgrain">, opts: CheckOptions = {}): Problem[] {
  const g: Guides = opts.guides ?? GUIDES;
  const f = ring.params.finish;
  if (!f) return [];
  const out: Problem[] = [];
  const sh = ring.shank;
  const t = sh.minThicknessMm ?? sh.thicknessMm;
  if (f.tsuchime && t >= g.band.minThicknessMm - 1e-9) {
    // 荒らし槌目は大きさを選ばない（細かく浅い。仮）
    const depth = (f.tsuchime.style === "arashi" ? g.finish.tsuchimeStyle.arashi : g.finish.tsuchime[f.tsuchime.size]).depthMm;
    const after = t - depth;
    if (after < g.band.minThicknessMm - 1e-9) {
      out.push({
        id: "tsuchime-thin",
        check: "tsuchime-thin",
        where: `槌目を打つ腕の厚み（${sh.along ? "いちばん薄い場所" : "いちばん厚い所"}）`,
        current: `打ったあと ${mm(after)}（跡の深さ ${mm(depth)}）`,
        required: `${mm(g.band.minThicknessMm)} 以上（仮の決まり）`,
        currentValue: after,
        requiredValue: g.band.minThicknessMm,
        reason: `槌目は叩いて跡をつけるので、跡の深さだけ腕が薄くなる。薄すぎる腕には打てない（腕の厚みの目安 ${mm(g.band.minThicknessMm)} を借りた仮の決まり。跡の深さも仮。${GUIDE_NOTE}）`,
        options: fix("smallerTsuchime", "thickerBand", "noTsuchime"),
        target: { kind: "shank" },
      });
    }
  }
  if (f.milgrain) {
    const w = sh.minWidthMm ?? sh.widthMm;
    const bead = ring.milgrain?.beadMm ?? g.finish.milgrain.beadMm;
    const need = bead * g.finish.milgrain.rowsPerBeadWidth;
    if (w < need - 1e-9 || ring.milgrain?.count === 0) {
      out.push({
        id: "milgrain-fit",
        check: "milgrain-fit",
        where: "ミル打ちの粒（腕の縁）",
        current: ring.milgrain?.count === 0 ? "粒を置ける縁がない" : `腕の幅 ${mm(w)}（粒 ø${bead.toFixed(2)} mm）`,
        required: `腕の幅 ${mm(need)} 以上（粒 2 列と、その間の地。仮の決まり）`,
        currentValue: w,
        requiredValue: need,
        reason: `ミルの粒は、縁の幅に合わせる（資料：粒の大きさは縁の幅と同じ。手打ちの鏨は ${g.finish.milgrain.toolMinMm}〜${g.finish.milgrain.toolMaxMm} mm）。細い腕の両縁に打つと、粒どうしがぶつかり、縁がえぐれる。粒 2 列と間の地を 粒 ${g.finish.milgrain.rowsPerBeadWidth} つ分とした仮の決まり（${GUIDE_NOTE}）`,
        options: fix("noMilgrain", "widerBand"),
        target: { kind: "shank" },
      });
    }
  }
  const nd = nunomeOf(f);
  if (nd) {
    const face = sh.outlineMm?.length ? faceSpan(sh.outlineMm.map(([x, y]) => ({ x, y })), false, g) : null;
    for (const is of checkNunome(nd, { circumferenceMm: 2 * Math.PI * sh.outerRadiusMm, face }, g)) out.push(nunomeProblem(is));
  }
  return out;
}

/** 布目象嵌の確かめの直し方の名前 */
export function nunomeFixId(is: Pick<NunomeIssue, "check" | "patch">): FixId {
  if (is.check === "nunome-line") return "inlayLine";
  if (is.check === "nunome-foil") return "inlayFoil";
  if (is.check === "nunome-fit") return "inlayNarrower";
  if (is.check === "nunome-piece" && is.patch.border) return "inlayBorder";
  return "inlayLarger";
}

/** 布目象嵌の確かめ → 指輪の問題の形（腕を赤く） */
export function nunomeProblem(is: NunomeIssue): Problem {
  return {
    id: is.check,
    check: is.check,
    where: `布目象嵌：${is.title}`,
    current: is.current,
    required: is.required,
    currentValue: is.currentValue,
    requiredValue: is.requiredValue,
    reason: is.why,
    options: fix(nunomeFixId(is), "noInlay"),
    target: { kind: "inlay" },
    nunomePatch: is.patch,
  };
}

/**
 * 腕の厚みと幅（地金のみの指輪と同じ目安：guides.ts の band）。断面がどの形でも、いちばん厚い所の厚みと、いちばん細い所の幅で比べる
 */
export function checkShank(sh: Pick<ShankResult, "thicknessMm" | "widthMm"> & { minWidthMm?: number; minThicknessMm?: number; outlineMm?: [number, number][]; along?: ShankResult["along"]; relief?: ShankResult["relief"] }, opts: CheckOptions = {}): Problem[] {
  const g: Guides = opts.guides ?? GUIDES;
  const out: Problem[] = [];
  const t = sh.minThicknessMm ?? sh.thicknessMm;
  const w = sh.minWidthMm ?? sh.widthMm;
  // 腕の場所ごとの形では、いちばん薄い・細い場所で比べる
  const place = sh.along ? "いちばん薄い場所の、" : "";
  if (t < g.band.minThicknessMm - 1e-9) {
    out.push({
      id: "band-thin",
      check: "band-thin",
      where: `腕の厚み（${place}いちばん厚い所）`,
      current: mm(t),
      required: `${mm(g.band.minThicknessMm)} 以上（目安）`,
      currentValue: t,
      requiredValue: g.band.minThicknessMm,
      reason: "公開情報の目安（宝飾メーカーの CAD の手引きと、学校の教材）：仕上げの磨きで最大 0.2 mm 削れる。1 mm より薄い腕は曲がりやすく、やわらかい金ではとくに弱い。工房の決まりで変えられる",
      options: fix("thickerBand"),
      target: { kind: "shank" },
    });
  }
  if (widthLevel(w, g) === "red") {
    out.push({
      id: "band-narrow",
      check: "band-narrow",
      where: sh.along ? "腕の幅（いちばん細い場所）" : "腕の幅",
      current: mm(w),
      required: `${mm(g.band.minWidthMm)} より太く（職人の決まり）`,
      currentValue: w,
      requiredValue: g.band.minWidthMm,
      reason: WIDTH_RED_TEXT,
      options: fix("widerBand"),
      target: { kind: "shank" },
    });
  }
  if (sh.outlineMm?.length && !sh.along) {
    sectionSpots(sh.outlineMm.map(([x, y]) => ({ x, y })), g).forEach((sp, i) => out.push(spikeProblem(sp, i, g)));
  }
  // 断面の溝の底の厚み。場所ごとに見る（溝の幅は止めない。grooveNote の黄色の注意だけ）
  const valleys = sectionLines(sh).flatMap((o) => outlineValleys(o.pts).map((v) => ({ ...v, at: o.at })));
  const lowest = valleys.reduce<(typeof valleys)[number] | null>((m, v) => (!m || v.floorMm < m.floorMm ? v : m), null);
  if (lowest && lowest.floorMm < g.band.valleyMinMm - 1e-9) {
    out.push({
      id: "band-valley",
      check: "band-valley",
      where: `${lowest.at === undefined ? "" : `${placeWord(lowest.at)}の`}断面の溝の底`,
      current: mm(lowest.floorMm),
      required: `${mm(g.band.valleyMinMm)} 以上（仮の目安）`,
      currentValue: lowest.floorMm,
      requiredValue: g.band.valleyMinMm,
      reason: `溝の底が薄いと、そこで腕が折れ曲がりやすい（${GUIDE_NOTE}）`,
      options: fix("bluntTip", "thickerBand"),
      target: { kind: "shank" },
    });
  }
  // 腕の彫り：彫る場所の、いちばん厚い所から彫りの深さを引いて、どれだけ残るか
  if (sh.relief && sh.relief.peakUnderMm < g.band.relief.minUnderMm - 1e-9) {
    out.push({
      id: "band-relief",
      check: "band-relief",
      where: "腕の彫りの下の地金",
      current: `残り ${mm(sh.relief.peakUnderMm)}`,
      required: `${mm(g.band.relief.minUnderMm)} 以上（仮の目安）`,
      currentValue: sh.relief.peakUnderMm,
      requiredValue: g.band.relief.minUnderMm,
      reason: `彫った所の下が薄いと、腕が曲がりやすい（1 mm より薄い腕は持ちが悪い、という公開の目安を借りた。${GUIDE_NOTE}）`,
      options: fix("shallowerRelief", "thickerBand"),
      target: { kind: "shank" },
    });
  }
  // 腕の場所ごとの形：場所ごとに断面を見る。同じ薄い所が続くときは、最初の場所だけ知らせる
  if (sh.along) {
    let n = 0;
    const seen = new Set<string>();
    for (const st of sh.along) {
      for (const sp of sectionSpots(st.outlineMm.map(([x, y]) => ({ x, y })), g)) {
        const key = `${sp.kind}:${Math.round((sp.at.x / Math.max(st.widthMm, 0.1)) * 5)}:${Math.round((sp.at.y / Math.max(st.thicknessMm, 0.1)) * 5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(spikeProblem(sp, n++, g, placeWord(st.atDeg)));
      }
    }
  }
  return out;
}

type SectionLinesOf = { outlineMm?: [number, number][]; along?: ShankResult["along"]; relief?: unknown };

/** 確かめる断面の線（どこも同じ形の腕で、決まった見本の断面を選んだだけの形は見ない。場所ごとの形か彫りのある腕だけ） */
function sectionLines(sh: SectionLinesOf): { at?: number; pts: readonly (readonly [number, number])[] }[] {
  if (sh.along) return sh.along.map((q) => ({ at: q.atDeg, pts: q.outlineMm }));
  return sh.relief && sh.outlineMm?.length ? [{ pts: sh.outlineMm }] : [];
}

// ---- 腕の幅の 3 段（職人 石川の決まり 2026-11-06。値は guides.ts の band.widthYellowMm・widthOrangeMm・minWidthMm） ----

/** 腕の幅の段。null ＝ 何も出さない。yellow・orange は止めない注意、red は作れない所 */
export type WidthLevel = "yellow" | "orange" | "red";

/** 測った幅の小さな誤差（場所ごとの形は輪郭から測るので、0.7 mm に決めた幅が 0.6999999 mm になる）で段を変えない */
const WIDTH_EPS = 1e-6;

/** 腕の幅の段：1.0 mm 以下は黄色、0.7 mm より細いとオレンジ、0.6 mm 以下は赤（数字は帳面の値） */
export function widthLevel(widthMm: number, g: Guides = GUIDES): WidthLevel | null {
  const b = g.band;
  if (widthMm <= b.minWidthMm + WIDTH_EPS) return "red";
  if (widthMm < b.widthOrangeMm - WIDTH_EPS) return "orange";
  if (widthMm <= b.widthYellowMm + WIDTH_EPS) return "yellow";
  return null;
}

/**
 * 赤の腕を直すときの幅：職人が「許容」と言った細さ（オレンジの境目 0.7 mm。黄色の注意は残る）。
 * 工房の帳面で赤の線をそれより太くしたときは、赤の線より太い次の境目（なければ赤の線 ＋ 0.1 mm）
 */
export function widthFixMm(g: Guides = GUIDES): number {
  const b = g.band;
  return [b.widthOrangeMm, b.widthYellowMm].find((v) => v > b.minWidthMm + WIDTH_EPS) ?? Math.round((b.minWidthMm + 0.1) * 100) / 100;
}

/** 赤の理由（作れなくはないが、職人の決まりで赤） */
export const WIDTH_RED_TEXT = "作れなくはないが、職人の決まりでは赤。細い腕は曲がって丸くなくなる";

/** 黄色・オレンジの言葉（画面と Claude で同じ） */
export const WIDTH_NOTE_TEXT: Record<"yellow" | "orange", string> = {
  yellow: "細めの腕です。作れます。曲がりやすいので、職人と細さを確かめます",
  orange: "かなり細い腕です。作れますが、曲がりやすいので、職人とよく確かめます",
};

/** 腕の幅の注意（黄色・オレンジ。作れない所ではない） */
export interface WidthNote {
  level: "yellow" | "orange";
  /** どこ（例：腕の幅（いちばん細い場所）） */
  where: string;
  widthMm: number;
  text: string;
}

/** 幅 1 つの注意（赤と、注意のいらない幅は null。赤は確かめの problems に出る） */
export function widthNoteOf(widthMm: number, where: string, g: Guides = GUIDES): WidthNote | null {
  const lv = widthLevel(widthMm, g);
  if (lv !== "yellow" && lv !== "orange") return null;
  return { level: lv, where, widthMm, text: WIDTH_NOTE_TEXT[lv] };
}

/** 石の付いた指輪・テンションの腕の幅の注意（場所ごとの形では、いちばん細い場所で） */
export function shankWidthNote(sh: Pick<ShankResult, "widthMm"> & { minWidthMm?: number; along?: ShankResult["along"] }, g: Guides = GUIDES): WidthNote | null {
  return widthNoteOf(sh.minWidthMm ?? sh.widthMm, sh.along ? "腕の幅（いちばん細い場所）" : "腕の幅", g);
}

/** 細い溝の注意の言葉（画面と確かめで同じ。職人 石川の言葉から 2026-11-06） */
export const GROOVE_HAND_TEXT = "この細さは鋳造では出ません。デザインの印として残し、あとから手で彫ります";

/** 鋳造では出ない細い溝の注意（作れない所ではない。黄色。腕の薄さの話でもない） */
export interface GrooveNote {
  /** どこの溝か（例：肩の断面の溝の幅） */
  where: string;
  widthMm: number;
  text: string;
}

/** いくつかの断面の線のうち、いちばん細い溝が鋳造の下限より細ければ、その注意 */
export function narrowGroove(lines: readonly { label: string; pts: readonly (readonly [number, number])[] }[], g: Guides = GUIDES): GrooveNote | null {
  let best: { label: string; widthMm: number } | null = null;
  for (const l of lines) for (const v of outlineValleys(l.pts)) if (!best || v.widthMm < best.widthMm) best = { label: l.label, widthMm: v.widthMm };
  if (!best || best.widthMm >= g.band.grooveCastMinMm - 1e-9) return null;
  return { where: `${best.label}断面の溝の幅`, widthMm: best.widthMm, text: GROOVE_HAND_TEXT };
}

/** 腕の断面の細い溝の注意（なければ null） */
export function grooveNote(sh: SectionLinesOf, g: Guides = GUIDES): GrooveNote | null {
  return narrowGroove(sectionLines(sh).map((o) => ({ label: o.at === undefined ? "" : `${placeWord(o.at)}の`, pts: o.pts })), g);
}

/** 溝と数える深さ（mm。両側の高い所より、これだけ低い所。形を作るための決まり） */
const VALLEY_DEPTH_MM = 0.1;

/**
 * 断面の外の線の溝（両側より低い所）ごとの、底の高さ（指の側から）と、溝の深さの半分の高さでの幅（浅い溝は底から VALLEY_DEPTH_MM 上。V の字の溝を、底の細さで細いと言わないように）。
 * 線は右の端の内側 → 左の端の内側。端へ向かって下がるだけの形は溝に数えない
 */
export function outlineValleys(pts: readonly (readonly [number, number])[]): { floorMm: number; widthMm: number }[] {
  const out: { floorMm: number; widthMm: number }[] = [];
  const n = pts.length;
  let i = 1;
  while (i < n - 1) {
    // 低い所：下りから上りに変わる所（平らな底は 1 つに数える）
    let j = i;
    while (j + 1 < n - 1 && Math.abs(pts[j + 1][1] - pts[i][1]) < 1e-6) j++;
    if (pts[i - 1][1] > pts[i][1] && pts[j + 1][1] > pts[j][1]) {
      const y = pts[i][1];
      // 両側へ登りきった高さの、低い方までが溝の深さ
      let top0 = i - 1;
      while (top0 > 0 && pts[top0 - 1][1] >= pts[top0][1] - 1e-9) top0--;
      let top1 = j + 1;
      while (top1 < n - 1 && pts[top1 + 1][1] >= pts[top1][1] - 1e-9) top1++;
      const depth = Math.min(pts[top0][1], pts[top1][1]) - y;
      const level = y + Math.max(VALLEY_DEPTH_MM, depth / 2);
      // 両側へ登って、その高さを超える所を探す
      let a = i - 1;
      while (a > 0 && pts[a][1] < level) a--;
      let b = j + 1;
      while (b < n - 1 && pts[b][1] < level) b++;
      if (depth >= VALLEY_DEPTH_MM && pts[a][1] >= level && pts[b][1] >= level) {
        const cross = (p: readonly number[], q: readonly number[]) => p[0] + ((q[0] - p[0]) * (level - p[1])) / (q[1] - p[1] || 1);
        const xa = cross(pts[a], pts[a + 1]);
        const xb = cross(pts[b - 1], pts[b]);
        out.push({ floorMm: y, widthMm: Math.abs(xa - xb) });
      }
    }
    i = j + 1;
  }
  return out;
}

/** 腕の場所の、ふつうの言葉（いちばん上からの角度で） */
export function placeWord(atDeg: number): string {
  if (atDeg < 45) return "石座のそば";
  if (atDeg < 120) return "肩";
  return "腕の下の方";
}

/** 腕の断面の、局所的に薄い所（とがり・ヒレ・ナイフのような縁）。数字は guides.ts の band.spike（仮の目安） */
export function sectionSpots(outlineMm: readonly { x: number; y: number }[], g: Guides = GUIDES): ThinSpot[] {
  return findThinSpots(outlineMm, g.band.spike);
}

/** 尖りすぎの言葉（画面と確かめで同じ） */
export const SPIKE_TEXT = "尖りすぎ：この先が薄く、欠けたり曲がったりしやすい";

function spikeProblem(sp: ThinSpot, i: number, g: Guides, place?: string): Problem {
  const s = g.band.spike;
  const tip = sp.kind === "tip" || sp.angleDeg < s.minTipAngleDeg;
  return {
    id: `band-spike:${i}`,
    check: "band-spike",
    where: `${place ? `${place}の` : ""}腕の断面の${tip ? "とがった先" : "薄いヒレ"}（幅の ${sp.at.x >= 0 ? "右" : "左"} ${Math.abs(sp.at.x).toFixed(2)} mm・高さ ${sp.at.y.toFixed(2)} mm）`,
    current: tip ? `先の角度 ${sp.angleDeg.toFixed(0)}°・厚み ${mm(sp.thicknessMm)}` : `厚み ${mm(sp.thicknessMm)}`,
    required: tip ? `先の角度 ${s.minTipAngleDeg}° 以上（仮の目安）` : `${mm(s.minLocalMm)} 以上（仮の目安）`,
    currentValue: tip ? sp.angleDeg : sp.thicknessMm,
    requiredValue: tip ? s.minTipAngleDeg : s.minLocalMm,
    reason: `${SPIKE_TEXT}。腕ぜんぶではなく、この所だけが薄い（${GUIDE_NOTE}）`,
    options: fix("bluntTip"),
    target: { kind: "shank-spot", x: sp.at.x, y: sp.at.y },
  };
}

/** 石座を確かめる（指とのすき間は、置いたあとの値を渡す） */
export function checkSetting(s: SettingResult, culetGapMm: number = s.heights.culetGapMm, opts: CheckOptions = {}): Problem[] {
  const out: Problem[] = [];
  const g: Guides = opts.guides ?? GUIDES;

  // 石の一番下と指のすき間（テンションは、職人の言葉「石の先が指に当たると痛い」から決めた値も見る）
  const needGap = s.style === "tension" ? Math.max(g.height.minFingerGapMm, g.tension.culetGapMm) : g.height.minFingerGapMm;
  if (culetGapMm < needGap - 1e-6) {
    out.push({
      id: "finger-gap",
      check: "finger-gap",
      where: "石の一番下（キューレット）と指",
      current: mm(culetGapMm),
      required: `${mm(needGap)} 以上`,
      currentValue: culetGapMm,
      requiredValue: needGap,
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

    // 爪の先の高さ（ふつうは全部の爪で同じ高さなので、1 つにまとめる。1 本ずつ直した爪があれば、高さの違う爪ごとに）
    const tipZ = s.heights.tipZ;
    const tipsDiffer = tipZ !== null && s.prongs.some((p) => Math.abs(p.tipZ - tipZ) > 1e-9);
    if (tipsDiffer) {
      s.prongs.forEach((p, i) => {
        const m = tipMeasures(s.heights, p.tipZ);
        const [r0, r1] = g.prong.tipHeightRatio;
        const [o0, o1] = g.prong.crownOverlapRatio;
        const ratioOk = m.ratio >= r0 - 1e-9 && m.ratio <= r1 + 1e-9;
        const overlapOk = m.overlap >= o0 - 1e-9 && m.overlap <= o1 + 1e-9;
        if (ratioOk && overlapOk) return;
        const useRatio = !ratioOk;
        const v = useRatio ? m.ratio : m.overlap;
        const [lo, hi] = useRatio ? [r0, r1] : [o0, o1];
        const low = v < lo;
        out.push({
          id: `tip-height:${i}`,
          check: "tip-height",
          where: `${prongName(i, p.isV)}の先`,
          current: useRatio ? `上面までの高さの ${pct(v)}` : `上側にかかる長さ 上側の ${pct(v)}`,
          required: useRatio ? `上面までの高さの ${pct(lo)}〜${pct(hi)}` : `上側の ${pct(lo)}〜${pct(hi)}`,
          currentValue: v,
          requiredValue: low ? lo : hi,
          reason: low ? "爪の先が低いか、反らせて石から離れ、石を押さえる所が浅い" : "爪の先が高く、引っかかりやすい・石の上面が隠れる",
          options: fix(low ? "tipUp" : "tipDown"),
          target: { kind: "prong", index: i },
        });
      });
    } else if (tipZ !== null) {
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

  // テンションは、爪の確かめも留まりの比べもない。形の確かめは checkTension（指とのすき間は上で確かめた）
  if (s.style === "tension") return out;

  // 石の留まり
  const position = opts.position ?? "top";
  const need = position === "palm" ? g.hold.requiredPalm : position === "side" ? g.hold.requiredSide : g.hold.requiredTop;
  const hold = holdRatio(s, g);
  // 画面の数字（小数 2 桁）と同じ細かさで比べる。つまみの 0.80 mm は標準の 0.8004 mm より細く、留まりは 1.00× と見えるのに「作れない」と出ていた
  if (Math.round(hold * 100) / 100 < need - 1e-9) {
    out.push({
      id: "hold",
      check: "hold",
      where: `石の留まり（石の場所：${positionName(position)}）`,
      current: `標準の 4 本爪の ${times(hold)}`,
      required: `${times(need)}以上`,
      currentValue: hold,
      requiredValue: need,
      reason: `爪の太さ・本数・長さから見た留まりが足りない（${HOLD_NOTE}）`,
      options: fix("thicker", "moreProngs", "lower", "bezel"),
      target: { kind: "setting" },
    });
  }

  // 腕の間に挟む石座の、下の輪が石に収まらない（細い・小さい石）
  if (s.collarBlocked) {
    out.push({
      id: "collar-stone",
      check: "collar-stone",
      where: "石座の下の輪（板を丸めた輪）",
      current: "下の輪が石の下側に当たる",
      required: "石と下の輪の間にすき間",
      currentValue: 0,
      requiredValue: g.join.between.pavilionClearanceMm,
      reason: "この石は細い、または小さいので、下の輪が石の下に収まらない。腕の上にのせるか、別の留め方にする",
      options: fix("bezel"),
      target: { kind: "setting" },
    });
  }

  // 腕の間に挟む石座の、下の輪（板を丸めた輪）の板の厚み
  if (s.collar && s.collar.wallMm < g.join.between.collarWallMinMm - 1e-9) {
    out.push({
      id: "collar-wall",
      check: "collar-wall",
      where: "石座の下の輪（板を丸めた輪）",
      current: mm(s.collar.wallMm),
      required: `${mm(g.join.between.collarWallMinMm)} 以上（仮の目安）`,
      currentValue: s.collar.wallMm,
      requiredValue: g.join.between.collarWallMinMm,
      reason: "板が薄いと、丸めたときにゆがみ、腕とロウ付けするときに溶けやすい",
      options: fix("thickerCollar"),
      target: { kind: "collar" },
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
      target: { kind: "bezel" },
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
