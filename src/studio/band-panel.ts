// 地金のみの指輪の「形」の欄：断面の見本（絵つき）・上と下・内甲丸・切って見る・断面を描く画面・寸法・地金。
// 断面を描く画面は、石のある指輪の腕と同じ部品（section-edit.ts）。設計を変える計算は band.ts、ここは画面だけ。
import { SECTION_LABEL, SECTION_LIST, bandCurve, innerLimit, sectionInfo, sectionLoop, sectionPath, type PresetKind } from "../cad/section";
// 断面の見本・内甲丸の言葉と、はじめの寸法の出どころは cad/section.ts と rules/guides.ts に書いた
import { GUIDES, type Guides } from "../rules/guides";
import { widthLevel } from "../rules/checks";
import type { Metal } from "../claude/tools";
import { bandWidthNote, checkBand, curveOf, drawSection, endOf, kindOf, pickSection, setInner, setSize, setSplit, type Band, type BandEndName, type BandProblem } from "./band";
import { bindSectionEditor, sectionEditorHtml, startShape, type SectionShape } from "./section-edit";
import { METAL_LABEL } from "./session";
import { bindSlider, sliderHtml, type SliderSpec } from "./slider";

/** 地金のみの指輪の号の範囲（手で変えるつまみと、生成の欄で同じ） */
export const BAND_GOU_RANGE = { min: 3, max: 30 };

export interface BandPanelHost {
  band(): Band;
  /** 設計を変える。live：指を動かしている間（欄を描き直さない。描き直すと、指で押さえている物が消える） */
  change(next: Band, live?: boolean): void;
  metal(): Metal;
  setMetal(m: Metal): void;
  /** 切って断面を見ているか */
  cut(): boolean;
  setCut(on: boolean): void;
  /** 今の帳面の目安（職人の決まりをふくむ） */
  guides(): Guides;
}

/** 断面の画面で点が動ける広さ（mm）。つまみの幅 12 mm・厚み 3.5 mm より広く（形を作るための決まり） */
const EDIT_LIMIT = { maxX: 8, maxY: 6 };

/** 上と下のどちらを直しているか（上と下で変えるときだけ） */
let target: BandEndName = "top";
export const bandTarget = (b: Band): BandEndName => (b.split ? target : "top");
/** 手で描く前の見本（リセットで戻す） */
const lastPreset: Record<BandEndName, PresetKind> = { top: "kouman", bottom: "kouman" };

/** 見本のはじめの形の、断面の絵（見本どうしの大きさがそのまま比べられるよう、同じ縮尺で） */
const thumbs = new Map<PresetKind, string>();
function thumb(k: PresetKind): string {
  let s = thumbs.get(k);
  if (!s) {
    const z = GUIDES.band.sectionSizes[k];
    const inner = k === "maru" ? z.widthMm / 2 : 0;
    const loop = sectionLoop({ curve: bandCurve(k, z.widthMm, z.thicknessMm - inner), widthMm: z.widthMm, thicknessMm: z.thicknessMm, innerMm: inner });
    s = `<svg class="bs-thumb" viewBox="-2.9 -2.75 5.8 2.95" aria-hidden="true"><path d="${sectionPath(loop)}"/></svg>`;
    thumbs.set(k, s);
  }
  return s;
}
/** 手で描くの札の絵（線だけ。自作） */
const PEN_ICON = `<svg class="bs-thumb bs-pen" viewBox="-2.9 -2.75 5.8 2.95" aria-hidden="true"><path d="M-1.7 -0.1C-1.7 -1.3 -1 -1.2 -0.5 -1.3S0.5 -2.2 1 -1.6 1.1 -0.6 1.7 -0.1"/></svg>`;
/** 手で描いた形の絵（今の形。入りきらなければ縮める） */
function freeThumb(b: Band, e: BandEndName): string {
  const end = endOf(b, e);
  const w = Math.max(5.8, end.width + 0.4);
  const h = Math.max(2.95, end.thickness + 0.2);
  const loop = sectionLoop({ curve: curveOf(b, e), widthMm: end.width, thicknessMm: end.thickness, innerMm: end.inner ?? 0 });
  return `<svg class="bs-thumb" viewBox="${-w / 2} ${0.2 - h} ${w} ${h}" aria-hidden="true"><path d="${sectionPath(loop)}"/></svg>`;
}

/** 断面の見本の札（地金のみの指輪と、一粒石の指輪の腕で同じ部品）。cur：押してある札。freeIcon：手で描くの札の絵（なければペン） */
export function sectionGridHtml(cur: string, freeIcon: string = PEN_ICON): string {
  return `<div class="bs-grid" role="group" aria-label="断面の見本">${SECTION_LIST.map((s) => `<button type="button" data-sec="${s.id}" aria-pressed="${cur === s.id}" title="${s.plain}">${thumb(s.id)}<span>${s.label}</span></button>`).join("")}<button type="button" data-sec="free" aria-pressed="${cur === "free"}" title="断面を指やマウスでなぞって描く">${freeIcon}<span>手で描く</span></button></div>`;
}

/** 見本の札を押したとき。手で描く：断面の画面を「自由に描く」にして、そこまで動かす（線を描くまで形は変わらない） */
export function bindSectionGrid(box: HTMLElement, pick: (k: PresetKind) => void, beforeDraw?: () => void): void {
  box.querySelectorAll<HTMLButtonElement>("[data-sec]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.sec === "free") {
        beforeDraw?.();
        box.querySelector<HTMLButtonElement>('.se-mode[data-mode="draw"]')?.click();
        box.querySelector(".sec-edit")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      pick(btn.dataset.sec as PresetKind);
    }),
  );
}

function pickRow(name: string, attr: string, cur: string, list: [string, string][]): string {
  return `<div class="pick"><span>${name}</span><div>${list.map(([v, l]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === cur}">${l}</button>`).join("")}</div></div>`;
}

/** 確かめの種類 → その値を手で変える欄（赤く印をつける） */
function badControls(p: BandProblem): string[] {
  if (p.check === "band-thin") return ['.slider[data-s="b-t"]', '.slider[data-s="b-tt"]', '.slider[data-s="b-bt"]'];
  if (p.check === "band-narrow") return ['.slider[data-s="b-w"]', '.slider[data-s="b-tw"]', '.slider[data-s="b-bw"]'];
  if (p.check === "band-valley") return [".sec-edit", '.slider[data-s="b-t"]', '.slider[data-s="b-tt"]', '.slider[data-s="b-bt"]'];
  return [".sec-edit"];
}

export function renderBandPanel(box: HTMLElement, host: BandPanelHost): void {
  const b = host.band();
  const e = bandTarget(b);
  const end = endOf(b, e);
  const k = kindOf(b, e);
  if (k !== "free") lastPreset[e] = k;
  const isRound = k === "maru";
  const inner = end.inner ?? 0;
  const lim = innerLimit(end.width, end.thickness);
  const note = k === "free" ? "手で描いた形です。リセットで、前の見本に戻せます。" : sectionInfo(k).plain;

  const size: SliderSpec[] = [];
  const sizeOf = (name: BandEndName, cls: string, prefix: string) => {
    const z = endOf(b, name);
    if (kindOf(b, name) === "maru") size.push({ cls: `${cls}w`, label: `${prefix}線の太さ`, min: GUIDES.band.inputMinWidthMm, max: 6, step: 0.05, value: z.width, unit: "mm" });
    else {
      size.push({ cls: `${cls}w`, label: `${prefix}幅`, min: GUIDES.band.inputMinWidthMm, max: 12, step: 0.05, value: z.width, unit: "mm" });
      size.push({ cls: `${cls}t`, label: `${prefix}厚み`, min: 0.6, max: 3.5, step: 0.05, value: z.thickness, unit: "mm" });
    }
  };
  if (b.split) {
    sizeOf("top", "b-t", "上の");
    sizeOf("bottom", "b-b", "下の");
  } else sizeOf("top", "b-", "");
  const gou: SliderSpec = { cls: "b-gou", label: "号", min: BAND_GOU_RANGE.min, max: BAND_GOU_RANGE.max, step: 1, value: b.gou, unit: "号" };
  const innerSlider: SliderSpec | null = inner > 0 && !isRound && lim >= 0.1 ? { cls: "b-in", label: "内側の丸み", min: 0.05, max: Math.floor(lim * 20) / 20, step: 0.05, value: Math.round(inner * 20) / 20, unit: "mm" } : null;

  box.innerHTML = `
    ${sectionGridHtml(k, k === "free" ? freeThumb(b, e) : undefined)}
    <p class="bs-note"><b>${SECTION_LABEL[k]}</b>${note}<small>はじめの寸法は仮の目安・最後は職人が決める</small></p>
    ${pickRow("上と下", "split", b.split ? "1" : "0", [["0", "ひと周り同じ"], ["1", "上と下で変える"]])}
    ${b.split ? pickRow("直す所", "end", e, [["top", "上（見える側）"], ["bottom", "下（手のひら側）"]]) : ""}
    ${isRound ? "" : pickRow("内側", "inner", inner > 0 ? "1" : "0", [["0", "平ら"], ["1", "内甲丸（内側も丸い）"]])}
    ${innerSlider ? `<div class="sliders">${sliderHtml(innerSlider)}</div><p class="hint">内甲丸：指に当たる内側の角を削って、丸みを付ける。外の形はどれでも選べる。内径は、いちばん指に近い所で測る。</p>` : ""}
    <button type="button" class="bs-cut" aria-pressed="${host.cut()}">${host.cut() ? "切るのをやめて、輪で見る" : "切って断面を見る"}</button>
    ${sectionEditorHtml()}
    <div class="sliders">${[gou, ...size].map(sliderHtml).join("")}</div>
    ${(() => {
      // 腕の幅の注意（黄色・オレンジ。止めない）。赤は確かめるの欄の「作れない所」に出る
      const wn = bandWidthNote(b, host.guides());
      return wn ? `<p class="w-note w-${wn.level}"><b>${wn.where} ${wn.widthMm.toFixed(2)} mm</b>${wn.text}（止めません）</p>` : "";
    })()}
    ${pickRow("地金", "metal", host.metal(), (["k18yg", "pt900", "k18wg", "k18pg", "sv925"] as Metal[]).map((m) => [m, METAL_LABEL[m]] as [string, string]))}`;

  bindSectionGrid(box, (kind) => host.change(pickSection(host.band(), kind, bandTarget(host.band()))));
  box.querySelectorAll<HTMLButtonElement>("[data-split]").forEach((btn) => btn.addEventListener("click", () => host.change(setSplit(host.band(), btn.dataset.split === "1"))));
  box.querySelectorAll<HTMLButtonElement>("[data-end]").forEach((btn) =>
    btn.addEventListener("click", () => {
      target = btn.dataset.end as BandEndName;
      // 切って見ているなら、切り口もそちらへ
      host.change(host.band());
    }),
  );
  box.querySelectorAll<HTMLButtonElement>("[data-inner]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const cur = host.band();
      host.change(setInner(cur, bandTarget(cur), btn.dataset.inner === "1" ? GUIDES.band.comfortMm : 0));
    }),
  );
  box.querySelectorAll<HTMLButtonElement>("[data-metal]").forEach((btn) => btn.addEventListener("click", () => host.setMetal(btn.dataset.metal as Metal)));
  box.querySelector(".bs-cut")!.addEventListener("click", () => host.setCut(!host.cut()));

  // 地金のみの指輪は形が軽いので、つまみを動かしている間も形を変える
  bindSlider(
    box,
    gou,
    (v) => host.change({ ...host.band(), gou: v }),
    (v) => host.change({ ...host.band(), gou: v }, true),
  );
  for (const sp of size) {
    const name: BandEndName = sp.cls.startsWith("b-b") ? "bottom" : "top";
    const key = sp.cls.endsWith("t") ? "thickness" : "width";
    bindSlider(
      box,
      sp,
      (v) => host.change(setSize(host.band(), name, { [key]: v })),
      (v) => host.change(setSize(host.band(), name, { [key]: v }), true),
    );
  }
  if (innerSlider)
    bindSlider(
      box,
      innerSlider,
      (v) => host.change(setInner(host.band(), e, v)),
      (v) => host.change(setInner(host.band(), e, v), true),
    );

  // 断面を描く画面：石のある指輪の腕と同じ部品
  const shown = Math.min(inner, lim);
  const resetShape = (): SectionShape => {
    const p = lastPreset[e];
    const z = GUIDES.band.sectionSizes[p];
    const h = z.thicknessMm - (p === "maru" ? z.widthMm / 2 : 0);
    return { section: "kouman", curve: bandCurve(p, z.widthMm, h), widthMm: z.widthMm, thicknessMm: h };
  };
  bindSectionEditor(
    box,
    startShape("free", curveOf(b, e), undefined, end.width, end.thickness - shown),
    (sec) => host.change(drawSection(host.band(), e, sec), true),
    (sec) => {
      // リセットは、手で描く前の見本に、はじめの寸法で戻す
      if (sec.section !== "free") host.change(pickSection(host.band(), lastPreset[e], e, { resetSize: true }));
      else host.change(drawSection(host.band(), e, sec));
    },
    { key: `band-${e}`, ...EDIT_LIMIT, innerMm: shown, reset: resetShape, guides: host.guides() },
  );

  for (const p of checkBand(b, host.guides())) for (const sel of badControls(p)) box.querySelectorAll(sel).forEach((el) => el.classList.add("ctl-bad"));
  // 幅のつまみに、段の色（黄色・オレンジ・赤）の印
  for (const sp of size) {
    if (!sp.cls.endsWith("w")) continue;
    const lv = widthLevel(sp.value, host.guides());
    if (lv) box.querySelector(`.slider[data-s="${sp.cls}"]`)?.classList.add(`w-${lv}`);
  }
}
