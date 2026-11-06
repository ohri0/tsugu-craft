// テンションの地金ごとの計算（作者の頼み 2026-11-05「こんぐらいちっちゃめに作って、無理やり広げて石をセットする。そういうの計算してくれたら」）。
// 大まかな計算だけで、合否にはしない。最後は職人が決める。画面に依存しない。数字はすべて GUIDES.tension と形の測った値から。
import type { Metal } from "../claude/tools";
import type { SettingResult } from "../geometry/setting";
import type { ShankResult } from "../geometry/shank";
import { elasticOpeningMm, HARD_STATE_LABEL, longTriangle, type HardState, type SpringMetal } from "./checks";
import { GUIDE_NOTE, GUIDES, type Guides } from "./guides";

export type SpringMetalId = SpringMetal;
/** 表に並べる地金の順 */
export const SPRING_METALS: readonly SpringMetalId[] = ["k18y", "k18p", "k18w", "pt900", "sv925"];

/** 道具の地金の名前 → 計算に使う地金の値 */
export function springIdOf(m: Metal): SpringMetalId {
  if (m === "pt900") return "pt900";
  if (m === "sv925") return "sv925";
  if (m === "k18pg") return "k18p";
  if (m === "k18wg") return "k18w";
  return "k18y";
}

/**
 * 丸い線を曲げるとき、線の内側で曲げが強まる割合（ばねの手引きの式：Ki ＝（4C² − C − 1）÷（4C（C − 1））、C ＝ 輪の径 ÷ 線の太さ）。
 * 細い輪の式で出した「開ける量」を、この割合で割ると、太い輪の分を見た量になる。
 */
export function curvedWireFactor(radiusMm: number, wireMm: number): number {
  const c = (2 * radiusMm) / wireMm;
  return (4 * c * c - c - 1) / (4 * c * (c - 1));
}

/** room：余裕あり。tight：ぎりぎり（太い輪の分を見ると足りない）。short：足りない（まっすぐ開くと曲がったまま残る） */
export type SpringVerdict = "room" | "tight" | "short";

export interface SpringRow {
  metal: SpringMetalId;
  name: string;
  young: { gpa: number; provisional: boolean; basis: string };
  proof: { mpa: number; provisional: boolean; basis: string };
  /** 数字のどれかが「仮」か */
  provisional: boolean;
  /** 開ける量の限界（細い輪の式。mm） */
  limitMm: number;
  /** 太い輪の分を見た限界（mm） */
  safeMm: number;
  verdict: SpringVerdict;
  /** どれだけ小さめに作るか（mm。足りなければ null） */
  shrinkMm: number | null;
  /** 小さめに作れる上限（mm。足りなければ null） */
  shrinkMaxMm: number | null;
  /** 作る時の開き（mm） */
  makeGapMm: number | null;
  /** 広げて入れる量（作る時の開きから、石が通る所まで。mm） */
  spreadMm: number | null;
  /** 石を入れたあと、腕が戻ろうとして石を押さえる量（mm） */
  gripMm: number | null;
  /** まっすぐ開いたとき、曲がったまま残る量（mm。足りるときは 0） */
  bentMm: number;
  /** 横から滑らせて入れられる石で、小さめに作れる量（開くのは締まりの分だけ。mm。滑らせられなければ null） */
  slideShrinkMm: number | null;
}

export interface SpringTable {
  state: HardState;
  stateLabel: string;
  /** 石の長さ（腕の周りの向き。ここまで広げると石が通る。mm） */
  spanMm: number;
  /** 図面の開き（石が入った時の腕の間。mm） */
  gapMm: number;
  /** 開いて入れるのに要る量（両はしの深さの和。mm）と、その内わけ */
  needMm: number;
  needText: string;
  radiusMm: number;
  wireMm: number;
  /** 太い輪の割合 */
  factor: number;
  slides: boolean;
  rows: SpringRow[];
}

const endWord = (kind: "pit" | "groove") => (kind === "pit" ? "角のくぼみ" : "辺の溝");

/** この石・この腕の太さと輪の大きさで、地金ごとに計算する。テンションでなければ null */
export function tensionSpring(s: Pick<SettingResult, "tension">, sh: Pick<ShankResult, "innerRadiusMm" | "thicknessMm">, state: HardState = "hardened", g: Guides = GUIDES): SpringTable | null {
  const info = s.tension;
  if (!info) return null;
  const radiusMm = sh.innerRadiusMm + sh.thicknessMm / 2;
  const wireMm = sh.thicknessMm;
  const factor = curvedWireFactor(radiusMm, wireMm);
  const needMm = info.ends[0].depthMm + info.ends[1].depthMm;
  const needText = `${info.ends.map((e) => `${endWord(e.kind)} ${e.depthMm.toFixed(2)} mm`).join(" ＋ ")} ＝ ${needMm.toFixed(2)} mm`;
  const rows = SPRING_METALS.map((metal): SpringRow => {
    const m = g.tension.spring.metals[metal];
    const v = m[state];
    const limitMm = elasticOpeningMm(radiusMm, wireMm, m.young.gpa, v.proofMpa);
    const safeMm = limitMm / factor;
    const verdict: SpringVerdict = safeMm >= needMm ? "room" : limitMm >= needMm ? "tight" : "short";
    // 余裕があれば、太い輪の分を見た限界まで。ぎりぎりなら、残りの全部（それでも少ない）
    const shrinkMm = verdict === "room" ? safeMm - needMm : verdict === "tight" ? limitMm - needMm : null;
    return {
      metal,
      name: m.name,
      young: m.young,
      proof: { mpa: v.proofMpa, provisional: v.provisional, basis: v.basis },
      provisional: v.provisional || m.young.provisional,
      limitMm,
      safeMm,
      verdict,
      shrinkMm,
      shrinkMaxMm: verdict === "short" ? null : limitMm - needMm,
      makeGapMm: shrinkMm === null ? null : info.gapMm - shrinkMm,
      spreadMm: shrinkMm === null ? null : needMm + shrinkMm,
      gripMm: shrinkMm,
      bentMm: Math.max(0, needMm - limitMm),
      slideShrinkMm: info.slides ? safeMm : null,
    };
  });
  return { state, stateLabel: HARD_STATE_LABEL[state], spanMm: info.spanMm, gapMm: info.gapMm, needMm, needText, radiusMm, wireMm, factor, slides: info.slides, rows };
}

/** 1 つの地金の結論を、短い文に。数字は計算の参考で、最後は職人が決める */
export function springSummary(row: SpringRow): string {
  const kari = row.provisional ? "（仮）" : "";
  if (row.verdict === "short") return `${row.name}：まっすぐ開いて入れると、約 ${row.bentMm.toFixed(2)} mm 曲がったまま残る見込み${kari}`;
  const word = row.verdict === "tight" ? "ぎりぎり。" : "";
  return `${row.name}：${word}約 ${row.shrinkMm!.toFixed(2)} mm 小さめに作り、約 ${row.spreadMm!.toFixed(2)} mm 広げて入れる${kari}`;
}

/** 足りないときの言葉（作り方にも） */
export const SPRING_SHORT_TEXT = "まっすぐ開くだけでは入らない見込み。斜めに入れる・熱で広げるなど、職人が決める";
/** 計算の一言の前提 */
export const SPRING_PREMISE = `テンションは、叩いて硬くした線（加工硬化）が前提です。その状態の大まかな計算で、値は仮です。${GUIDE_NOTE}`;
/** やわらかい状態の表に添える一言 */
export const SPRING_PREMISE_SOFT = `焼きなましたやわらかい線のときの大まかな計算です。やわらかいと、石を入れた時点で曲がります（職人の言葉：硬い状態でないと取れる）。${GUIDE_NOTE}`;

export interface TensionCaution {
  id: string;
  /** 短い名前 */
  title: string;
  /** 一言 */
  text: string;
}

/**
 * 「作れる」とだけ言わずに伝える注意（作れない所ではない。緑の札にしない）。
 * 横に止める物がない形、職人が決めた形より大きくはみ出す形、今の地金で開く量が足りない・ぎりぎりのとき
 */
export function tensionCautions(s: Pick<SettingResult, "tension">, table: SpringTable | null, metal: SpringMetalId, g: Guides = GUIDES): TensionCaution[] {
  const info = s.tension;
  if (!info || !table) return [];
  const out: TensionCaution[] = [];
  if (info.slides) out.push({ id: "no-stop", title: "横に止める物がない", text: "両はしともまっすぐな溝です。締まりの力だけで止まります。止め方は職人が決めます" });
  if (longTriangle(info) && info.overhangMm > 0)
    out.push({
      id: "long-triangle",
      title: "残りの角が横へ出る",
      text: `長い辺の両はしの角を挟むので、残りの角が腕の幅の外へ、片側 ${info.overhangMm.toFixed(2)} mm 出ます。作者の本物の指輪はこの向きです。出た角をぶつけると、2 つの角を結ぶ線のまわりに石が回ろうとします。留まるかは職人が確かめてください`,
    });
  else if (info.overhangRatio > g.tension.askOverhangRatio + 1e-9 && info.overhangRatio <= g.tension.maxOverhangRatio + 1e-9)
    out.push({
      id: "overhang",
      title: "腕の幅の外へ大きく出る",
      text: `石が腕の幅の外へ、片側 ${info.overhangMm.toFixed(2)} mm 出ます。職人が決めた三角より大きく、留まるかは確かめていません。${info.grips.length > 1 && info.grip === "short" ? "挟む向きを変えると小さくなります。" : ""}職人に確かめてください`,
    });
  const row = table.rows.find((r) => r.metal === metal);
  if (row?.verdict === "short") out.push({ id: "open-short", title: `${row.name}は開く量が足りない`, text: SPRING_SHORT_TEXT });
  if (row?.verdict === "tight") out.push({ id: "open-tight", title: `${row.name}は開く量がぎりぎり`, text: `太い輪の分を見ると足りません（細い輪の式 ${row.limitMm.toFixed(2)} mm、太い輪の分を見ると ${row.safeMm.toFixed(2)} mm。要る量 ${table.needMm.toFixed(2)} mm）` });
  return out;
}

const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

/** Claude が読む形（check の結果に入れる） */
export function springForClaude(t: SpringTable) {
  return {
    state: t.state,
    state_label: t.stateLabel,
    stone_span_mm: r2(t.spanMm),
    gap_mm: r2(t.gapMm),
    need_mm: r2(t.needMm),
    need: t.needText,
    can_slide: t.slides,
    metals: t.rows.map((r) => ({
      metal: r.name,
      provisional: r.provisional,
      limit_mm: r2(r.limitMm),
      limit_thick_ring_mm: r2(r.safeMm),
      verdict: r.verdict,
      smaller_by_mm: r2(r.shrinkMm),
      smaller_by_max_mm: r2(r.shrinkMaxMm),
      make_gap_mm: r2(r.makeGapMm),
      spread_mm: r2(r.spreadMm),
      grip_mm: r2(r.gripMm),
      stays_bent_mm: r2(r.bentMm),
      slide_smaller_by_mm: r2(r.slideShrinkMm),
    })),
    note: `小さめに作る量は、太い輪の分を見た限界から、開いて入れるのに要る量を引いたもの。ヤング率と耐力の多くは仮の値で、合否にしない。${GUIDE_NOTE}`,
  };
}
