// 一粒石の指輪の「腕の形」の欄（作るの場面）：断面の見本・幅・厚み・手で描く。
// 見本の札と断面を描く画面は、地金のみの指輪と同じ部品（band-panel.ts・section-edit.ts）。腕を変えるのは人のボタンと Claude の道具と同じ setShank で、
// 石座とのつながりの確かめも今までどおり（session.ts の build）。テンションの腕は丸線の決まりのまま。
import { SECTION_LABEL, bandCurve, matchPreset, sectionInfo, type PresetKind } from "../cad/section";
import { SHANK_SECTION_LABEL } from "../geometry/shank";
import type { SetShankInput } from "../claude/tools";
import { bindSectionGrid, sectionGridHtml } from "./band-panel";
import { sectionEditorHtml } from "./section-edit";
import type { RingState } from "./session";
import { SHANK_RANGE } from "./shank-line";
import { bindSlider, sliderHtml, type SliderSpec } from "./slider";

/**
 * 見本を選ぶときの、腕の道具の入力。甲丸・丸線・角は腕の決まった断面、ほかは見本の線をそのまま腕の断面にする。
 * 石のある指輪で 11 の見本がどれも組めて、確かめに引っかからないことは tests/generation.test.ts で確かめた
 */
export function ringSectionInput(k: PresetKind, widthMm: number, thicknessMm: number): Pick<SetShankInput, "section" | "section_curve" | "thickness_mm"> {
  if (k === "kouman") return { section: "kouman" };
  // 丸線と角は、幅と厚みが同じ（見本の説明のとおり）
  if (k === "kaku" || k === "maru") return { section: k, thickness_mm: widthMm };
  const c = bandCurve(k, widthMm, thicknessMm);
  return { section_curve: { points: c.points.map((p) => ({ x: p.x, y: p.y })), knots: c.knots ? [...c.knots] : undefined } };
}

/** 今の腕の断面は、どの見本か。手で描いた線は free。腕の決まった断面のうち見本にないもの（半甲丸）は null */
export function ringSectionKind(s: Pick<RingState, "shankSection" | "sectionCurve">, widthMm: number, thicknessMm: number): PresetKind | "free" | null {
  const sec = s.shankSection ?? "kouman";
  if (sec === "free") return (s.sectionCurve && matchPreset(s.sectionCurve, widthMm, thicknessMm)) || "free";
  // 腕の「平打ち」の線は、見本の「平甲丸」と同じ線（角が丸い）
  if (sec === "hirauchi") return "hirakouman";
  if (sec === "hangouman") return null;
  return sec;
}

/** 今の腕の断面の名前（画面に出す） */
export function ringSectionWord(s: Pick<RingState, "shankSection" | "sectionCurve">, widthMm: number, thicknessMm: number): string {
  const sec = s.shankSection ?? "kouman";
  if (sec !== "free") return SHANK_SECTION_LABEL[sec];
  return SECTION_LABEL[ringSectionKind(s, widthMm, thicknessMm) ?? "free"];
}

export interface RingShapeHost {
  state(): RingState;
  /** 今の腕の幅と厚み（mm） */
  size(): { widthMm: number; thicknessMm: number };
  /** 腕を変える（離したとき・押したとき） */
  set(input: Partial<SetShankInput>): void;
  /** つまみを動かしている間（腕だけ差し替える。欄は描き直さない） */
  live(widthMm: number, thicknessMm: number): void;
  /** 断面を描く画面をつなぐ（確かめるの欄と同じ関数） */
  bindEditor(box: HTMLElement): void;
}

/** 手で描く欄を開いているか（描き直しても続く） */
let drawOpen = false;

export function renderRingShape(box: HTMLElement, host: RingShapeHost): void {
  const s = host.state();
  if (s.style === "tension") {
    box.innerHTML = `<p class="hint">テンションの腕は丸線です（石を挟む溝が、腕の形で決まります）。線の太さは「確かめる」の「手で変える」で変えられます。</p>`;
    return;
  }
  const { widthMm, thicknessMm } = host.size();
  const k = ringSectionKind(s, widthMm, thicknessMm);
  const note = k === "free" ? "手で描いた形です。" : k ? sectionInfo(k).plain : "";
  const round = s.shankSection === "maru";
  const width: SliderSpec = { cls: "rs-w", label: round ? "線の太さ" : "幅", min: SHANK_RANGE.width[0], max: SHANK_RANGE.width[1], step: SHANK_RANGE.width[2], value: widthMm, unit: "mm" };
  const thick: SliderSpec = { cls: "rs-t", label: "厚み", min: SHANK_RANGE.thickness[0], max: SHANK_RANGE.thickness[1], step: SHANK_RANGE.thickness[2], value: thicknessMm, unit: "mm" };
  box.innerHTML = `
    ${sectionGridHtml(k ?? "")}
    <p class="bs-note"><b>${k && k !== "free" ? SECTION_LABEL[k] : ringSectionWord(s, widthMm, thicknessMm)}</b>${note}<small>石座のそばの形です。寸法は目安・最後は職人が決める</small></p>
    <div class="sliders">${sliderHtml(width)}${round ? "" : sliderHtml(thick)}</div>
    <details class="ring-draw"${drawOpen ? " open" : ""}><summary>断面を手で描く</summary>${sectionEditorHtml()}</details>`;

  const draw = box.querySelector<HTMLDetailsElement>(".ring-draw")!;
  draw.addEventListener("toggle", () => (drawOpen = draw.open));
  bindSectionGrid(box, (kind) => {
    const now = host.size();
    host.set(ringSectionInput(kind, now.widthMm, now.thicknessMm));
  }, () => {
    draw.open = true;
  });
  // 丸線は幅と厚みがいっしょ
  bindSlider(box, width, (v) => host.set(round ? { width_mm: v, thickness_mm: v } : { width_mm: v }), (v) => host.live(v, round ? v : host.size().thicknessMm));
  if (!round) bindSlider(box, thick, (v) => host.set({ thickness_mm: v }), (v) => host.live(host.size().widthMm, v));
  host.bindEditor(box);
}
