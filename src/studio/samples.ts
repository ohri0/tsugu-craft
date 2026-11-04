// 見本の作品：記録がまだない人（はじめて開いた人・審査の人）が、「職人の一言で、これまでの作品を確かめ直す」を
// 試せるように、よくある形の石から継ぐが組んだ設計を、記録に入れる。職人の作品ではないことを、名前と言葉で必ず示す。
// 画面に依存しない。
import { PRESETS, presetOutline, type StonePreset } from "./presets";
import type { StoneParams } from "../geometry/stone";
import { DEFAULT_STATE, type RingSession, type RingState } from "./session";

export const SAMPLE_MAKER = "見本";
export const SAMPLE_NOTE = "よくある形の石から、継ぐが組んだ見本です。職人の作品ではありません。";

export interface SampleDesign {
  preset: StonePreset["id"];
  /** 見本の名前のうしろに付ける言葉 */
  label: string;
  /** 石の長い向きの大きさ（mm）。ないときは、よくある形の石の大きさのまま */
  sizeMm?: number;
  state: Partial<RingState>;
}

/** 高さ・号・爪をばらつかせる（決まりを足したとき、作れなくなる作品と作れる作品が混ざるように） */
export const SAMPLE_DESIGNS: SampleDesign[] = [
  { preset: "round", label: "ふだん使い", state: { height: "standard", gou: 11 } },
  { preset: "oval", label: "低めの石座", state: { height: "low", gou: 9 } },
  { preset: "pear", label: "低めの石座", state: { height: "low", gou: 13 } },
  { preset: "marquise", label: "細身", state: { height: "standard", gou: 10 } },
  { preset: "emerald", label: "高めの石座", state: { height: "high", gou: 12, culetGapMm: 2.8 } },
  // 小粒：公開の目安では作れるが、爪は 0.6 mm ほど。職人の「爪は最低 0.7 mm」で、細くて留まりが弱いと分かる
  { preset: "round", label: "小粒", sizeMm: 3.5, state: { height: "standard", gou: 10 } },
];

export function sampleStone(id: StonePreset["id"], sizeMm?: number): { preset: StonePreset; stone: StoneParams } {
  const preset = PRESETS.find((p) => p.id === id)!;
  const k = sizeMm ? sizeMm / preset.longMm : 1;
  return {
    preset,
    stone: { outlineMm: presetOutline(preset).map((p) => ({ x: p.x * k, y: p.y * k })), longMm: preset.longMm * k, widthMm: preset.widthMm * k, depthMm: preset.depthMm * k },
  };
}

export function sampleState(d: SampleDesign): RingState {
  return { ...structuredClone(DEFAULT_STATE), ...d.state };
}

/** 記録の小さな絵：石を上から見た輪郭（SVG の data URL） */
export function outlineThumb(stone: StoneParams, size = 96): string {
  const k = (size * 0.7) / Math.max(stone.longMm, stone.widthMm);
  const pts = stone.outlineMm.map((p) => `${(size / 2 + p.x * k).toFixed(1)},${(size / 2 - p.y * k).toFixed(1)}`).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#232326"/><polygon points="${pts}" fill="none" stroke="#c9a45c" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 留まりと爪の太さが今の目安に通るまで、爪を少しずつ太くする（見本は「今の決まりでは作れる」形から始める） */
export function tuneSample(s: RingSession): void {
  for (let i = 0; i < 6; i++) {
    const b = s.build("見本の爪の太さ");
    if (!b.problems.some((p) => p.check === "hold" || p.check === "prong-thin")) return;
    const cur = b.ring.setting.prongs[0]?.diameterMm ?? b.ring.setting.standardProngMm;
    s.state.prongMm = Math.ceil(cur * 1.08 * 100) / 100;
  }
}

/** 作った物の爪は太さが決まっている。今の太さを設計に書いておく（決まりが変わっても、記録の爪は勝手に太くならない） */
export function fixProngSize(s: RingSession): void {
  const mm = s.build("見本の爪の太さ").ring.setting.prongs[0]?.diameterMm;
  if (mm) s.state.prongMm = mm;
}

export const isSample = (w: { maker: string }) => w.maker === SAMPLE_MAKER;
