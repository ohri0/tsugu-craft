// 継ぐ：デザインを、職人の判断で「作れる形」にする。
// 作る。 石の写真・希望の言葉 →（デザインの絵から組むのは、まだ絵のとおりの形にならないので画面から外した。2026-11-03） Claude が指輪を組み、作れるか確かめ、直す（作業の記録が見える）。
// 整える。作れない所が赤く光り、誰のどの決まりかと、見た目への影響つきの直し方が出る。人も同じつまみで直せる。
// 渡す。  職人への指示書・原寸の型紙・3D データ。
// 帳面   職人が声で決まりを足すと、その場で確かめが変わる。
import { MAIN, addSampleWorkshop, addWorkshop, prongBasicMm, setActive, setBasics, setProngBasic } from "../rules/workshops";
import { printHtml } from "../ui/print";
import { summarize, sweepDesigns, sweepOne, type SweepDesign, type SweepResult } from "./sweep";
import { SAMPLE_DESIGNS, SAMPLE_MAKER, SAMPLE_NOTE, isSample, outlineThumb, sampleState, sampleStone, tuneSample, fixProngSize } from "./samples";
import { ringGaps } from "../rules/gaps";
import { MAKING_STEPS, isCheckRule, makingRulesFor, stepsOfRule } from "../rules/making";
import "./pro.css";
import { findCorners } from "../geometry/corners";
import { measureOutline, type StoneOutline } from "../geometry/measure";
import { outlineIndexAtT, type JoinStyle, type ProngTip, type SettingResult } from "../geometry/setting";
import { nameShape } from "../geometry/shape";
import { runClaude, type LogEntry } from "../claude/loop";
import { cannotFrom, hasJapanese, offlineWhy, plainWords, ruleTitles, toolLogLine, withoutCannot, type RuleTitles, type StoneWords } from "../claude/words";
import { STONE_FREE_NOTE, STONE_KEEP_NOTE, correctPrompt, designPrompt, gouNote } from "../claude/prompt";
import { craftPointsFromProposal, designNowText, isPointProposal, previewPoints, type DesignNow, type PointsPreview } from "../claude/rule-points";
import { craftProngPoints, craftProngRule, mergeCraftPoints, mmText, prongMinAt, prongPointsRule, prongTable } from "../rules/prong-points";
import { TOOLS, isIrogane, type ChooseStoneInput, type ChooseStoneResult, type FinishInput, type ProposeRuleInput, type ProposeRuleResult, type ToolHost, type Metal } from "../claude/tools";
import { MILGRAIN_OFFERED, TSUCHIME_AREA_LABEL, TSUCHIME_LABEL, TSUCHIME_STYLE_LABEL, TSUCHIME_STYLE_NOTE, finishWords, tsuchimeSpec, tsuchimeStyleOf, type TsuchimeStyle } from "../geometry/finish";
import type { ClaudeContentBlockParam } from "../claude/wire";
import { patternSvg } from "../pattern/sheet";
import { rulePlans } from "../ui/design";
import { loadPhoto } from "../ui/photo";
import { Viewer, type DisplayMode } from "../ui/viewer";
import { extractStone, type Extraction } from "../vision/extract";
import { PARAMS, activeRules, addRule, seedLedger, sourceLabel, valueFor, type Ledger, type ParamId, type Rule } from "../rules/ledger";
import { askConfirm, filming } from "../app/confirm";
import { askPassword, resetPassword } from "../app/password";
import { esc, store, today } from "../app/store";
import { bindVoice } from "../app/voice";
import { bookLabel, bookTitle, masterName, sourceName } from "../app/master";
import { toStl } from "../cad/solid";
import { buildStone } from "../geometry/stone";
import { LAYOUT_LABEL, METAL_LABEL, RingSession, type RingState, SLOT_SHAPE_LABEL, STONE_LONG_RANGE, bandFixInput, carryDesign, smallerTsuchime, fitStoneDepth, fitStoneLong, reliefFixInput, stationFrom, tuneProngMm, underLedger, type Built, type SlotShape } from "./session";
import { bindShankLine, sectionBinding, shankLineHtml } from "./shank-line";
import bandShowcase from "../lp/band-showcase.json" with { type: "json" };
import { renderRingShape, ringSectionInput, ringSectionKind, ringSectionWord, type RingShapeHost } from "./ring-shape";
import { shapeOffload } from "./shape-offload";
import { howToMake, placeText, type Method } from "./howto";
import { sheetHtml } from "./sheet";
import { bindFlowMotion, whyHtml } from "./why";
import { SORT_TIPS, parseTips, tipsFor, tipsPrompt, type Tip } from "./tips";
import { PRESETS, presetOutline, sizedPreset, type StonePreset } from "./presets";
import { DesignHistory, generationTools, isTextField, keepGou, makeHost, undoKey } from "./make-run";
import { drawingPage, type DrawingView, DRAWING_CSS } from "./drawing";
import { loadWorks, newWorkId, removeSampleWorks, removeWork, saveWork, updateWork, worksBookHtml, type WorkRecord } from "./works";
import { cardFlow, glossOf, markTerms, stepCard } from "./cards";
import { NOTE, type AlloyId } from "./process";
import type { Step } from "./howto";
import { MAKE_BAND, SECTION_LABEL, bandGrooveNote, bandWidthNote, SECTION_LIST, applyDraft, bandCutMesh, bandHowTo, bandInnerDiameter, bandMesh, bandPrompt, bandSpecRows, checkBand, defaultBand, normalizeBand, parseBand, pickSection, sectionWord, sizeWord, specOf, thinSpotsOf, type Band, type BandDraft, type BandProblem } from "./band";
import { BAND_GOU_RANGE, bandTarget, renderBandPanel, type BandPanelHost } from "./band-panel";
import { sectionLoop, sectionPath, type PresetKind, type SectionSpec } from "../cad/section";
import { effectiveGuides } from "../rules/ledger";
import { BAND_THIN_STEP_MM, COLLAR_STEP_MM, WIRE_STEP_MM, metalIdOf, nextGrip } from "./session";
import { GUIDES, GUIDE_NOTE, minProngMm, stoneSizeMm } from "../rules/guides";
import { callTool } from "../rebuild/run";
import { dimsSvg, flatDims, gizmoSvg, type Dim, type Rect, type V3 } from "./dims";
import { bindSlider, sliderHtml, type SliderSpec } from "./slider";
import { measureDim, measureLabel, ringFeatures } from "./measure";
import { setupMeasure, type MeasureUi } from "./measure-ui";
import { setupProngEdit, type ProngEditUi } from "./prong-edit";
import { bindSectionEditor, sectionEditorHtml, startShape } from "./section-edit";
import { SHANK_SECTIONS, SHANK_SECTION_LABEL, shankSizeWords, type ShankSection } from "../geometry/shank";
import { placePoint, rebuildShank } from "../geometry/ring";
import { TENSION_OPENING_NOTE, TENSION_WORDS_NOTE, checkShank, grooveNote, shankWidthNote, tensionInsert, tensionNotes, type GrooveNote, type Problem, type WidthNote } from "../rules/checks";
import { SPRING_PREMISE, springIdOf, springSummary, tensionCautions, tensionSpring, type SpringRow, type SpringTable, type TensionCaution } from "../rules/tension-calc";
import { HOLD_PREMISE, HOLD_VERDICT_LABEL, tensionHoldSet } from "../rules/tension-hold";
import type { TensionGrip } from "../geometry/tension";
import { presentHtml, STONE_SIZES, type PresentGroup } from "./present";
import { MAX_SECONDS, playVoice, putVoice, startRecording, voiceIds } from "./voice-notes";
import { clearDesign, introSeen, loadDesign, loadImportedPhotoUrl, loadPhotoUrl, markIntroSeen, saveDesign, saveImportedPhoto, savePhoto, tabBox, type KeptStone } from "./keep-design";

type Mode = "make" | "refine" | "hand" | "works";
const MODES: { id: Mode; word: string; key: string; sub: string }[] = [
  { id: "make", word: "作る", key: "1", sub: "石と言葉から形を組む" },
  { id: "refine", word: "確かめる", key: "2", sub: "作れるか" },
  { id: "hand", word: "手順", key: "3", sub: "鋳造・鍛造の手順" },
  { id: "works", word: "記録", key: "4", sub: "作った物ごとに残す" },
];
// 線だけの小さな絵（自作）
const ICON = {
  angle: `<svg viewBox="0 0 20 20"><path d="M10 2.5 17 6.5v7L10 17.5 3 13.5v-7z"/><path d="M3 6.5 10 10.5l7-4M10 10.5v7"/></svg>`,
  top: `<svg viewBox="0 0 20 20"><rect x="3.5" y="3.5" width="13" height="13" rx="1.5"/><path d="M10 7v6M7 10h6"/></svg>`,
  side: `<svg viewBox="0 0 20 20"><rect x="3.5" y="5.5" width="13" height="9" rx="1.5"/><path d="M3.5 10h13"/></svg>`,
  front: `<svg viewBox="0 0 20 20"><circle cx="10" cy="11" r="5.5"/><circle cx="10" cy="11" r="3.2"/><path d="M8 3.5h4l-1 2H9z"/></svg>`,
  grid: `<svg viewBox="0 0 20 20"><path d="M3 7h14M3 13h14M7 3v14M13 3v14"/></svg>`,
  dims: `<svg viewBox="0 0 20 20"><path d="M3 14 14 3l3 3L6 17z"/><path d="M6.5 10.5l1.5 1.5M9 8l1.5 1.5M11.5 5.5 13 7"/></svg>`,
  fit: `<svg viewBox="0 0 20 20"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/></svg>`,
  measure: `<svg viewBox="0 0 20 20"><path d="M4 16 16 4"/><path d="M2.5 13.5l4 4M13.5 2.5l4 4"/><circle cx="10" cy="10" r="0.6"/></svg>`,
  undo: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4 3.5 8l4 4"/><path d="M3.5 8H12a4.5 4.5 0 0 1 0 9H9"/></svg>`,
  redo: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4l4 4-4 4"/><path d="M16.5 8H8a4.5 4.5 0 0 0 0 9h3"/></svg>`,
  solitaire: `<svg viewBox="0 0 24 24"><circle cx="12" cy="15" r="6.5"/><path d="M9 6.5h6l-3 3.5z"/><path d="M8.5 6.5 10 4h4l1.5 2.5"/></svg>`,
  band: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="8"/><ellipse cx="12" cy="12" rx="5.6" ry="5.6"/></svg>`,
  pendant: `<svg viewBox="0 0 24 24"><path d="M5 3c2 4 4.5 6 7 6s5-2 7-6"/><circle cx="12" cy="15" r="5"/><circle cx="12" cy="15" r="3"/></svg>`,
};
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const UNDO_KEYS = isMac ? { undo: "⌘Z", redo: "⇧⌘Z" } : { undo: "Ctrl+Z", redo: "Ctrl+Shift+Z" };
const SAMPLE = { url: "stones/triangle.jpg", longMm: 8.88, depthMm: 4.24, label: "作者の石（淡い青の三角）" };

interface Stone {
  photo: ImageData;
  label: string;
  extraction: Extraction;
  measured: StoneOutline;
  longMm: number;
  depthMm: number;
  shapeName: string;
  cornerIdx: { index: number; angle: number }[];
}
let stone: Stone | null = null;
/** いま使っている石の札（よくある形の id・"imported"＝取り込んだ石・"first"＝はじめの石。どれでもなければ null） */
let stoneKey: string | null = null;
/** 取り込んだ石（写真から読んだ石）。よくある形を押しても残り、いつでも戻れる（作者の声 2026-11-05） */
let imported: Stone | null = null;
/**
 * 石の形の札の中身（作ると確かめるの、同じ部品）。よくある形のあとに、取り込んだ石。
 * 自分の写真を入れたら、はじめの石にも戻れる。撮影の絵は前のまま（取り込んだ石の札を出さない）
 */
function stoneButtonsHtml(): string {
  const on = (k: string) => `aria-pressed="${stoneKey === k}"`;
  const kept = filming()
    ? ""
    : `${imported ? `<button type="button" data-kept="imported" title="${esc(imported.label)}" ${on("imported")}>取り込んだ石</button>` : ""}${imported && imported.label !== SAMPLE.label ? `<button type="button" data-kept="first" title="${esc(SAMPLE.label)}" ${on("first")}>はじめの石</button>` : ""}`;
  return `${PRESETS.map((p) => `<button type="button" data-preset="${p.id}" ${on(p.id)}>${p.name}</button>`).join("")}${kept}`;
}
/** 石の形の札を、画面のどこにあっても描き直す */
function renderStoneButtons() {
  document.querySelectorAll<HTMLElement>(".presets").forEach((el) => (el.innerHTML = stoneButtonsHtml()));
}
/** 一粒石の指輪の号の範囲（手で変えるつまみと、生成の欄で同じ） */
const RING_GOU_RANGE = { min: 5, max: 25 };
let sketch: { dataUrl: string; base64: string; media: "image/jpeg" | "image/png" } | null = null;
let session: RingSession | null = null;

// 字・押す所・色の直し（pro.css の html.fit）。撮影では付けない（動画の絵を前のままにする）
document.documentElement.classList.toggle("fit", !filming());

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="pro" data-mode="make">
  <header class="tb">
    <div class="tb-l"><a class="brand" href="./"><span class="logo">継</span>継ぐ</a><span class="doc"><span class="word-name">新しい作品</span></span>${filming() ? "" : `<div class="undo-redo" role="group" aria-label="戻す・進む"><button type="button" class="btn quiet act-undo" disabled aria-label="戻す" title="戻す（${UNDO_KEYS.undo}）">${ICON.undo}<span class="ur-word">戻す</span></button><button type="button" class="btn quiet act-redo" disabled aria-label="進む" title="進む（${UNDO_KEYS.redo}）">${ICON.redo}<span class="ur-word">進む</span></button></div>`}</div>
    <nav class="tabs" aria-label="場面">${MODES.map((m) => `<button type="button" data-mode="${m.id}" title="${m.sub}（${m.key}）">${m.word}<span class="k">${m.key}</span></button>`).join("")}</nav>
    <div class="tb-r"><nav class="places hide-sm" aria-label="ほかの場所"><a href="app.html#ledger" title="職人の決まりと、Claude からの質問">帳面</a><a href="app.html#learn" title="次の人が、職人の決まりに聞いて学ぶ">学ぶ</a><a href="app.html#waza" title="彫金・金工の技と、途切れた技を組み立て直す">技</a></nav><button type="button" class="btn quiet act-present">見せる</button><button type="button" class="btn quiet act-why">なぜ継ぐ</button><button type="button" class="btn act-sheet hide-sm">図面・指示書</button><button type="button" class="btn primary act-stl">STL</button>${filming() ? "" : `<button type="button" class="btn quiet act-more" aria-label="ほかの場所" aria-expanded="false">≡</button><nav class="more-menu" hidden aria-label="ほかの場所"><a href="app.html#ledger">帳面</a><a href="app.html#learn">学ぶ</a><a href="app.html#waza">技</a><button type="button" class="more-sheet">図面・指示書を印刷</button></nav>`}</div>
  </header>
  <nav class="tools" aria-label="見る">
    ${(["angle", "top", "side", "front"] as const).map((v) => `<button type="button" class="tool view-btn" data-view="${v}" data-tip="${{ angle: "斜め", top: "上", side: "横", front: "正面" }[v]}" aria-label="${{ angle: "斜め", top: "上", side: "横", front: "正面" }[v]}">${ICON[v]}</button>`).join("")}
    <hr>
    <button type="button" class="tool t-grid" data-tip="1 mm の目盛り" aria-label="目盛り" aria-pressed="true">${ICON.grid}</button>
    <button type="button" class="tool t-dims" data-tip="寸法" aria-label="寸法" aria-pressed="true">${ICON.dims}</button>
    ${filming() ? "" : `<button type="button" class="tool t-measure" data-tip="寸法を引く（2 点を押す）" aria-label="寸法を引く" aria-pressed="false">${ICON.measure}</button>`}
    <button type="button" class="tool t-fit" data-tip="全体を見る" aria-label="全体を見る">${ICON.fit}</button>
  </nav>
  <section class="vp">
    <div class="gl"></div>
    <div class="present" hidden><button type="button" class="pr-close" aria-label="見せるを閉じる">×</button><div class="pr-panel"></div></div>
    <svg class="dims" aria-hidden="true"></svg>
    <div class="stone-tags" aria-hidden="true"></div>
    <svg class="gizmo" viewBox="0 0 60 60" aria-hidden="true"></svg>
    <div class="vp-tl"><b class="vp-view">斜め</b><div class="disp" role="group" aria-label="表示">${(["wire", "shaded", "render", "draw"] as const).map((d) => `<button type="button" data-disp="${d}" aria-pressed="${d === "render"}">${{ wire: "ワイヤー", shaded: "シェード", render: "レンダー", draw: "図面" }[d]}</button>`).join("")}</div></div>
    <button type="button" class="verdict-chip" hidden></button>
    <button type="button" class="gen-swap" hidden></button>
    <div class="fix-pop" hidden></div>
    <div class="intro-stage" hidden><div class="intro-frame"><canvas class="intro-photo"></canvas><svg class="intro-line" preserveAspectRatio="none"></svg></div><p class="intro-cap"></p></div>
  </section>

  <aside class="insp">
    <div class="insp-head"><b class="vp-mode"></b><small class="word-sub"></small></div>
    <div class="pane make-panel">
      <section class="sec"><h4>種類</h4>
        <div class="kinds">
          <button type="button" data-kind="solitaire" aria-pressed="true">${ICON.solitaire}<span><b>一粒石の指輪</b><small>石の写真から</small></span></button>
          <button type="button" data-kind="band" aria-pressed="false">${ICON.band}<span><b>地金のみの指輪</b><small>断面の形から</small></span></button>
        </div>
      </section>
      <section class="sec band-only" hidden><h4>形</h4><div class="band-ctrl"></div></section>
      <section class="sec solitaire-only"><h4>石<button type="button" class="shoot-help-btn" aria-label="石の写真の撮り方">?</button></h4>
        <div class="shoot-help" hidden>
          <b>石の写真の撮り方</b>
          <ol>
            <li><b>白い紙の上に置く。</b>模様や影のない、まっさらな所。</li>
            <li><b>真上から撮る。</b>斜めから撮ると形がくずれます。石の長い辺が、そのままの長さで写るように。</li>
            <li><b>石を画面のまん中に、大きめに。</b>ピントを石に合わせ、影ができにくい明るい所で。</li>
            <li><b>長辺と深さだけ、測って入れる。</b>形は写真から読みます。</li>
          </ol>
          <small>色の薄い石は、黒い紙の上でも読めます。</small>
        </div>
        <label class="asset stone-card"><canvas class="stone-thumb" width="120" height="120"></canvas><span><b>石の写真</b><small class="stone-sub">—</small></span><span class="act">変える</span><input type="file" accept="image/*" class="stone-file" hidden></label>
        <div class="presets" role="group" aria-label="石の形">${stoneButtonsHtml()}</div>
        <div class="fields"><label class="field">長辺<span class="in"><input type="number" step="0.01" min="${STONE_LONG_RANGE.min}" max="${STONE_LONG_RANGE.max}" class="in-long" inputmode="decimal"><i>mm</i></span></label><label class="field">深さ<span class="in"><input type="number" step="0.01" class="in-depth" inputmode="decimal"><i>mm</i></span></label></div>
      </section>
      ${filming() ? "" : `<section class="sec solitaire-only"><h4>腕の形</h4><div class="ring-shape"></div></section>`}
      <section class="sec"><h4>Claude の作業</h4>
        <div class="wish-slot"></div>
        <p class="make-note" hidden></p>
        <ol class="worklog"><li class="note">下の「希望」に書いて「生成」。Claude が組んで、作れるか確かめます。</li></ol>
        <div class="cannot-note" hidden><p></p><button type="button" class="cn-close" aria-label="まだできないことの札を閉じる">×</button></div>
        ${filming() ? "" : `<button type="button" class="next-btn make-next">作れるか確かめる・手で変える →</button>`}
        <button type="button" class="link reset-design">はじめの設計に戻す</button>
      </section>
    </div>
    <div class="pane studio-refine" hidden></div>
    <div class="pane build-panel" hidden></div>
    <div class="pane works-panel" hidden></div>
  </aside>

  <div class="cmd-wrap">${filming() ? "" : `<div class="make-opts">
      <div class="gen-stone solitaire-only" role="radiogroup" aria-label="石"><span class="sp-label">石</span>
        <label><input type="radio" name="stone-pick" value="keep" checked><span><b>今の石を使う</b><small class="sp-now">—</small></span></label>
        <label><input type="radio" name="stone-pick" value="free"><span><b>石もおまかせ</b><small>形も大きさも Claude が選ぶ</small></span></label>
      </div>
      <label class="gou-pick"><span>号</span><select class="gen-gou" aria-label="指輪の号"></select></label>
    </div>`}<form class="prompt command"><span class="cmd-label">希望</span><input type="text" class="wish" placeholder="例：華奢に。毎日つける。石を大きく見せたい" aria-label="希望"><kbd>⏎</kbd><button type="submit">生成</button></form></div>
  <footer class="sb"><p class="make-status"></p><dl class="specs"></dl></footer>
</div>`;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

// ---- 3D ----
const viewer = new Viewer($(".gl"));
viewer.setDark(true);
// 撮影（?rec）では、見せるの映り込みを「細かく」にしておく（アプリの中で選べるのと同じ描き方）
if (new URLSearchParams(location.search).has("rec")) void viewer.setHighQuality(true);
viewer.wireArm = !filming();
/** 形の配列が GPU へ届かず 3D の絵が乱れているときは、壊れた絵のまま「作れます」と出さない（組み直すたびに札を書き直すので、そのあとでも呼ぶ） */
function markDrawFault() {
  if (!viewer.drawFault) return;
  const chip = $(".verdict-chip");
  chip.className = "verdict-chip ng";
  chip.textContent = "3D の絵が乱れています";
}
viewer.onDrawFault(() => {
  markDrawFault();
  setStatus("3D の絵が乱れています。このブラウザが形のデータを正しく受け取れませんでした。形の数字と STL は正しいです。ブラウザを新しくするか、別のブラウザで開いてみてください。");
});

// ---- 寸法の線と軸の印（3D を描き直すたびに合わせる） ----
let dims: Dim[] = [];
let showDims = true;
/** 寸法のうち、隠しているもの（寸法のボタンを長く押す・右の小さな ▾ で選ぶ） */
// スマホは画面が小さく、札が指輪にかぶる。人がまだ選んでいなければ、内径と石の札を隠して始める（▾ で出せる）
const hiddenDims = new Set<string>(JSON.parse(localStorage.getItem("tsugu.hiddenDims") ?? (!filming() && matchMedia("(max-width: 760px)").matches ? `["inner","stone"]` : "[]")));
const DIM_NAMES: [string, string][] = [["inner", "内径"], ["stone", "石の大きさ"], ["culet", "石の先〜指（石のいちばん下から指まで）"], ["height", "指から上（指から石座のいちばん上まで）"], ["gap", "腕の開き（テンション）"]];
/** 地金のみの指輪の寸法の名前 */
const BAND_DIM_NAMES: [string, string][] = [["inner", "内径"], ["b-width", "幅"], ["b-thick", "厚み"], ["b-under", "手のひら側の幅と厚み"]];
/** 見せ場の間は寸法を出さない（最後に 1 本ずつ出す） */
let holdDims = false;
/** 石座の箱（3D、mm）。数字の札をこの上に重ねない */
let headBox: { min: [number, number, number]; max: [number, number, number] } | null = null;
/** 札を重ねない所：画面のボタンと、石座が映っている所 */
/**
 * 寸法の線の絵。「寸法を引く」の絵も class に dims を持ち、3D の後ろ（この絵より前）に置かれるので、
 * $(".dims") ではそちらを取って寸法が出なかった（2026-11-06 通しの確かめ）。最初の 1 つをここで覚えておく
 */
const dimsSvgEl = document.querySelector<SVGSVGElement>(".vp > svg.dims:not(.measures)")!;
function dimsAvoid(): { avoid: Rect[]; bounds: Rect } {
  const svg = dimsSvgEl.getBoundingClientRect();
  const avoid: Rect[] = [];
  for (const sel of [".vp-tl", ".verdict-chip", ".gen-swap", ".tools", ".gizmo", ".ms-panel", ".prong-pop"]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el || el.hidden || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.height) avoid.push({ x: r.left - svg.left, y: r.top - svg.top, w: r.width, h: r.height });
  }
  if (headBox) {
    const { min, max } = headBox;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      const p = viewer.project(x, y, z);
      if (!p) continue;
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    // 角を写した箱は実際より大きいので、少しだけ縮める
    const sx = (x1 - x0) * 0.1, sy = (y1 - y0) * 0.1;
    if (x1 > x0) avoid.push({ x: x0 + sx, y: y0 + sy, w: x1 - x0 - sx * 2, h: y1 - y0 - sy * 2 });
  }
  return { avoid, bounds: { x: 4, y: 4, w: svg.width - 8, h: svg.height - 8 } };
}
/** 寸法の札の置いた所（自分で引く寸法の札が、重ならないように） */
let dimsPlaced: Rect[] = [];
function drawDims(d: Dim[] = dims) {
  // 平らな図（正面・横・上）では、図面の寸法（形の外へ引き出し線・本当の長さ）に
  const flat = viewer.flatView;
  if (flat) d = flatDims(d, flat);
  dimsPlaced = [];
  dimsSvgEl.innerHTML = showDims && !holdDims ? dimsSvg(d, (x, y, z) => viewer.project(x, y, z), 1, { ...dimsAvoid(), placed: dimsPlaced }) : "";
}
/** 自分で引く寸法（撮影では作らない） */
let measure: MeasureUi | null = null;
/** 爪を押して直す欄（撮影では作らない） */
let prongEdit: ProngEditUi | null = null;
viewer.onFrame(() => {
  drawDims();
  measure?.frame(dimsPlaced);
  $(".gizmo").innerHTML = gizmoSvg(viewer.axes());
});
function setDims(d: Dim[]) {
  dims = d;
  drawDims();
}
/** 石座の箱（画面の 3D と同じ座標） */
function headBoxOf(b: Built): typeof headBox {
  const sp = b.ring.ringPositions.setting;
  if (!sp.length) return null;
  const lift = b.ring.shank.outerRadiusMm;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < sp.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = sp[i + k] + (k === 2 ? lift : 0);
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  return { min, max };
}
/** 一粒石の指輪の寸法：内径・石の長辺・石と指のすき間・指から石座の上まで */
function ringDims(b: Built): Dim[] {
  if (!stone) return [];
  const r = b.ring;
  const lift = r.shank.outerRadiusMm;
  const ri = r.shank.innerDiameterMm / 2;
  const t = r.transform;
  const h = r.stone.heights;
  const c = Math.cos(t.rotationZ);
  const sn = Math.sin(t.rotationZ);
  const pts = stone.measured.outlineMm.map((q) => ({ x: q.x * c - q.y * sn + (t.translateX ?? 0), y: q.x * sn + q.y * c + (t.translateY ?? 0) }));
  let pair: [{ x: number; y: number }, { x: number; y: number }] = [pts[0], pts[0]];
  let best = -1;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2;
      if (d > best) [best, pair] = [d, [pts[i], pts[j]]];
    }
  const tableZ = t.translateZ + h.tableZ + lift + 0.8;
  const culetZ = t.translateZ + h.culetZ + lift;
  const fingerTop = lift + ri;
  let top = 0;
  const sp = r.ringPositions.setting;
  for (let i = 2; i < sp.length; i += 3) top = Math.max(top, sp[i]);
  // テンションに石座の形はない：指から上は、腕の端と石の上のうち高い方まで
  if (r.setting.tension) top = Math.max(t.translateZ + h.tableZ, r.setting.tension.ends[0].wireTopZ);
  top += lift;
  const halfY = Math.max(...pts.map((q) => Math.abs(q.y)));
  const bad = new Set(b.problems.map((p) => p.check));
  const tn = r.setting.tension;
  return [
    ...(tn ? [{ a: [0, -tn.gapMm / 2, lift + tn.girdleZ] as V3, b: [0, tn.gapMm / 2, lift + tn.girdleZ] as V3, ext: [-(r.shank.widthMm / 2 + 2), 0, 0] as V3, label: `開き ${tn.gapMm.toFixed(2)}`, key: "gap" }] : []),
    { a: [0, -ri, lift], b: [0, ri, lift], label: `内径 ø${(ri * 2).toFixed(1)}`, key: "inner" },
    { a: [pair[0].x, pair[0].y, tableZ], b: [pair[1].x, pair[1].y, tableZ], label: `石 ${stone.measured.longMm.toFixed(2)}`, key: "stone" },
    { a: [0, 0, fingerTop], b: [0, 0, culetZ], label: `石の先〜指 ${r.culetGapMm.toFixed(2)}`, bad: bad.has("finger-gap"), key: "culet" },
    { a: [0, -halfY - 1.4, fingerTop], b: [0, -halfY - 1.4, top], label: `指から上 ${(top - fingerTop).toFixed(2)}`, bad: bad.has("tip-height"), key: "height" },
  ].filter((d) => !hiddenDims.has(d.key)) as Dim[];
}
/** 手で描いた形の寸法は 0.01 mm まで、ほかは 0.1 mm まで */
const dimNum = (v: number) => (Math.abs(v * 10 - Math.round(v * 10)) < 1e-6 ? v.toFixed(1) : v.toFixed(2));
/** 地金のみの指輪の寸法：内径・上の幅と厚み。上と下で太さを変えていれば下も */
function bandDims(positions: Float32Array, probs: BandProblem[]): Dim[] {
  let zmin = Infinity;
  for (let i = 2; i < positions.length; i += 3) zmin = Math.min(zmin, positions[i]);
  const ri = bandInnerDiameter(band.gou) / 2;
  const cz = zmin + band.bottom.thickness + ri;
  const ztop = cz + ri + band.top.thickness;
  const thin = probs.some((p) => p.check === "band-thin");
  const narrow = probs.some((p) => p.check === "band-narrow");
  const under = band.top.width !== band.bottom.width || band.top.thickness !== band.bottom.thickness;
  const list: Dim[] = [
    { a: [0, -ri, cz], b: [0, ri, cz], label: `内径 ø${(ri * 2).toFixed(1)}`, key: "inner" },
    { a: [-band.top.width / 2, 0, ztop], b: [band.top.width / 2, 0, ztop], label: `幅 ${dimNum(band.top.width)}`, bad: narrow, key: "b-width" },
    { a: [band.top.width / 2 + 0.9, 0, cz + ri], b: [band.top.width / 2 + 0.9, 0, ztop], label: `厚み ${dimNum(band.top.thickness)}`, bad: thin, key: "b-thick" },
    ...(under ? [{ a: [band.bottom.width / 2 + 0.9, 0, zmin] as V3, b: [band.bottom.width / 2 + 0.9, 0, zmin + band.bottom.thickness] as V3, label: `下 ${dimNum(band.bottom.width)} × ${dimNum(band.bottom.thickness)}`, bad: thin || narrow, key: "b-under" }] : []),
  ];
  return list.filter((d) => !hiddenDims.has(d.key!));
}

// ---- 知らせ ----
/**
 * 知らせを、下の帯と「Claude の作業」の欄の先頭の両方に出す。
 * スマホには下の帯がなく、PC の帯は長い文が切れる（2026-11-05 点検）。押すボタン（確かめる → など）も両方に出す
 */
function setStatus(text: string, opts: { busy?: boolean; links?: { label: string; run: () => void }[] } = {}) {
  const note = $(".make-note");
  const bar = $(".make-status");
  for (const el of [bar, note]) {
    el.textContent = "";
    if (opts.busy) {
      const dot = document.createElement("span");
      dot.className = "pulse";
      el.appendChild(dot);
    }
    if (text) {
      const t = document.createElement("span");
      t.className = "st-text";
      t.textContent = text;
      el.appendChild(t);
    }
    for (const l of opts.links ?? []) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "link";
      b.textContent = l.label;
      b.addEventListener("click", l.run);
      el.appendChild(b);
    }
  }
  bar.title = text;
  note.hidden = !text && !opts.links?.length;
  if (!note.hidden && note.offsetParent) note.scrollIntoView({ block: "nearest" });
}

// ---- 石を読む ----
document.querySelector(".shoot-help-btn")?.addEventListener("click", (e) => {
  e.preventDefault();
  const h = $(".shoot-help");
  h.hidden = !h.hidden;
});
/**
 * same：今の石と同じ形か・同じ大きさか（長辺や深さの数字を直しただけのとき。引き継ぐ物が増える）。
 * shapeName：押した石の名前（「エメラルド」を押したのに、形から読んで「四角」と出ていた）
 */
async function loadStone(img: ImageData, label: string, longMm: number, depthMm: number, opts: { intro?: boolean; same?: { shape?: boolean; size?: boolean }; shapeName?: string; key?: string | null; extraction?: Extraction } = {}) {
  stopIntro();
  // 数字を直しただけなら、前の名前のまま
  const keepName = opts.same && stone ? stone.shapeName : undefined;
  // 長辺や深さを直しただけなら、写真を読み直さない（輪郭の点がそろったままで、爪の位置がずれない）。取り込んだ石へ戻るときも、読んだ輪郭のまま
  const extraction = opts.extraction ?? (opts.same && stone ? stone.extraction : extractStone(img));
  const measured = measureOutline({ outlinePx: extraction.outlinePx, longMm });
  const corners = findCorners(measured.outlineMm);
  stone = {
    photo: img,
    label,
    extraction,
    measured,
    longMm,
    depthMm,
    shapeName: opts.shapeName ?? keepName ?? nameShape(measured.outlineMm, corners).name,
    cornerIdx: corners.map((c) => ({ index: outlineIndexAtT(measured.outlineMm, c.t), angle: Math.round(c.angleDeg) })),
  };
  if (opts.key !== undefined) stoneKey = opts.key;
  // 新しい写真のときだけ、残す写真を入れ替える。大きさを直した取り込んだ石は、直した値のまま残す
  if (stoneKey === "imported") {
    if (opts.key === "imported" && !opts.extraction) keptImportedPhoto = null;
    imported = stone;
  }
  renderStoneButtons();
  $<HTMLInputElement>(".in-long").value = String(longMm);
  $<HTMLInputElement>(".in-depth").value = String(depthMm);
  $(".stone-sub").textContent = `${stone.shapeName}・${measured.longMm.toFixed(2)} × ${measured.widthMm.toFixed(2)} mm`;
  drawThumb();
  // 手で決めた設計は、新しい石へ引き継ぐ（前は毎回 はじめの設計に戻っていた。2026-11-05 点検）
  const prev = session?.snapshot();
  if (prev && compare) prev.prongMm = compare.prongMm;
  compare = null;
  session = newSession(measured, depthMm);
  // 最初は、決まりごとから作った案（Claude なしでも形が出る）
  const plan = rulePlans(session.stone, corners)[0];
  session.state.style = plan.design.style;
  session.state.height = plan.design.height;
  if (prev) session.state = carryDesign(prev, session.state, opts.same);
  // 深さだけを直したときは、手で決めた爪の太さをそのままにする（足りなければ確かめが知らせる）
  if (!(opts.same?.shape && opts.same.size)) tuneProngs();
  if (!opts.same) keptPhoto = null;
  keepDesignSoon();
  if (opts.intro) await intro();
  else session.build("最初の案");
}
/** 一体の石座の重い所を作る別の糸（つまみを動かしても画面が止まらないように。?nooffload で前と同じく画面の糸で作る） */
const offload = new URLSearchParams(location.search).has("nooffload") ? null : shapeOffload();
function newSession(m: StoneOutline, depthMm: number): RingSession {
  // 前の設計の場の作り直し（別の糸に頼んだ形も）は、新しい設計の画面に出さない
  session?.retire();
  const s = new RingSession({ outlineMm: m.outlineMm, longMm: m.longMm, widthMm: m.widthMm, depthMm }, ledgerNow, onBuilt, (view) => viewer.snapshotFrom(view).split(",")[1]);
  s.solid = !new URLSearchParams(location.search).has("tube");
  s.offload = offload;
  return s;
}

// ---- 今の設計を、このタブの間だけ残す（読み直しても、帳面へ行って戻っても消えないように） ----
const tab = tabBox();
/** ?nointro・?rec は、いつも決まった最初の形から（写真や動画を撮るため）。残さず、戻さない */
const keepOff = ["nointro", "rec"].some((k) => new URLSearchParams(location.search).has(k));
let keepTimer = 0;
let keepPaused = false;
/** 残した写真の大きさ（null ＝ 今の写真をまだ残していない） */
let keptPhoto: { k: number; width: number; height: number } | null = null;
/** 取り込んだ石の、残した写真の大きさ（null ＝ まだ残していない） */
let keptImportedPhoto: { k: number; width: number; height: number } | null = null;
/** 写真を残す。入らなければ小さくして、それでもだめなら写真なしで */
function keepPhoto(img: ImageData, save: (box: typeof tab, url: string) => boolean = savePhoto): { k: number; width: number; height: number } {
  const c = document.createElement("canvas");
  const from = document.createElement("canvas");
  from.width = img.width;
  from.height = img.height;
  from.getContext("2d")!.putImageData(img, 0, 0);
  for (const [side, q] of [[1024, 0.9], [640, 0.75]] as const) {
    const k = Math.min(1, side / Math.max(img.width, img.height));
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(from, 0, 0, c.width, c.height);
    if (save(tab, c.toDataURL("image/jpeg", q))) return { k, width: c.width, height: c.height };
  }
  return { k: 1, width: img.width, height: img.height };
}
/** 石を、残す形に（写真の上の座標は、残した写真の大きさに合わせる） */
function keptOf(s: Stone, photo: { k: number; width: number; height: number }): KeptStone {
  const { k, width, height } = photo;
  return {
    label: s.label,
    depthMm: s.depthMm,
    shapeName: s.shapeName,
    cornerIdx: s.cornerIdx,
    measured: s.measured,
    outlinePx: s.extraction.outlinePx.map((q) => ({ x: q.x * k, y: q.y * k })),
    color: s.extraction.color,
    colorless: s.extraction.colorless,
    photoWidth: width,
    photoHeight: height,
  };
}
/** 残した石を、画面で使う形に戻す（写真がなければ、白い写真のまま） */
async function stoneFromKept(k: KeptStone, url: string): Promise<Stone> {
  const c = document.createElement("canvas");
  c.width = k.photoWidth;
  c.height = k.photoHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  if (url) {
    const im = new Image();
    im.src = url;
    await im.decode();
    g.drawImage(im, 0, 0, c.width, c.height);
  }
  return {
    photo: g.getImageData(0, 0, c.width, c.height),
    label: k.label,
    // 輪郭と色だけあれば足りる（読み取りの途中の結果は残さない）
    extraction: { outlinePx: k.outlinePx, color: k.color, colorless: k.colorless } as Extraction,
    measured: k.measured,
    longMm: k.measured.longMm,
    depthMm: k.depthMm,
    shapeName: k.shapeName,
    cornerIdx: k.cornerIdx,
  };
}
function keepDesignNow() {
  clearTimeout(keepTimer);
  keepTimer = 0;
  if (keepOff || keepPaused || !stone || !session) return;
  keptPhoto ??= keepPhoto(stone.photo);
  const kept = keptOf(stone, keptPhoto);
  if (imported) keptImportedPhoto ??= keepPhoto(imported.photo, saveImportedPhoto);
  const state = session.snapshot();
  // 比べている間の爪の太さではなく、職人の決まりで組んだときの太さを残す
  if (compare) state.prongMm = compare.prongMm;
  saveDesign(tab, {
    kind,
    mode: document.querySelector(".pro")?.getAttribute("data-mode") ?? "make",
    presetId: PRESETS.some((p) => p.id === stoneKey) ? (stoneKey as string) : undefined,
    stoneKey,
    imported: imported && keptImportedPhoto ? keptOf(imported, keptImportedPhoto) : undefined,
    stone: kept,
    state,
    band,
    bandMetal,
  });
}
function keepDesignSoon() {
  if (keepOff || keepPaused || keepTimer) return;
  keepTimer = window.setTimeout(keepDesignNow, 300);
}
addEventListener("pagehide", () => keepTimer && keepDesignNow());
/** 残した設計から始める。なければ false */
async function restoreDesign(): Promise<boolean> {
  if (keepOff) return false;
  const d = loadDesign(tab);
  if (!d) return false;
  const k = d.stone;
  const url = loadPhotoUrl(tab);
  stone = await stoneFromKept(k, url);
  keptPhoto = url ? { k: 1, width: k.photoWidth, height: k.photoHeight } : null;
  // 取り込んだ石も戻す。前に残した設計（札の記録がない）は、よくある形でなければ、今の石が取り込んだ石
  stoneKey = d.stoneKey !== undefined ? d.stoneKey : (d.presetId ?? "imported");
  if (stoneKey === "imported") {
    imported = stone;
    keptImportedPhoto = null;
  } else if (d.imported) {
    const importedUrl = loadImportedPhotoUrl(tab);
    imported = await stoneFromKept(d.imported, importedUrl);
    keptImportedPhoto = importedUrl ? { k: 1, width: d.imported.photoWidth, height: d.imported.photoHeight } : null;
  } else imported = null;
  $<HTMLInputElement>(".in-long").value = String(Number(k.measured.longMm.toFixed(2)));
  $<HTMLInputElement>(".in-depth").value = String(Number(k.depthMm.toFixed(2)));
  $(".stone-sub").textContent = `${k.shapeName}・${k.measured.longMm.toFixed(2)} × ${k.measured.widthMm.toFixed(2)} mm`;
  drawThumb();
  renderStoneButtons();
  session = newSession(k.measured, k.depthMm);
  session.state = d.state;
  band = normalizeBand(d.band);
  bandMetal = d.bandMetal;
  if (d.kind === "band") setKind("band");
  else session.build("前の設計に戻した");
  if (MODES.some((m) => m.id === d.mode)) setMode(d.mode as Mode);
  return true;
}
$(".reset-design").addEventListener("click", () => {
  if (!askConfirm("はじめの設計に戻しますか？\n今の設計は消えます（記録に残した作品は消えません）。")) return;
  keepPaused = true;
  clearTimeout(keepTimer);
  clearDesign(tab);
  location.reload();
});

/** 最初の見せ場：写真に輪郭が描かれ → 石が立体になり → まわりに指輪が組み上がる */
let introRun = 0;
let introCleanup: (() => void) | null = null;
/** 見せ場を途中でやめる（種類や石を変えたとき。やめないと、後から石だけを置いて甲丸の指輪を消していた） */
function stopIntro() {
  introRun++;
  introCleanup?.();
  introCleanup = null;
}
async function intro() {
  if (!stone || !session) return;
  const run = ++introRun;
  const alive = () => run === introRun;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const parts: (HTMLElement | null)[] = [];
  let clock = 0;
  introCleanup = () => {
    clearInterval(clock);
    parts.forEach((e) => e?.remove());
    $(".intro-stage").hidden = true;
    $(".intro-stage").classList.remove("draw", "out");
    holdDims = false;
    viewer.setReveal(null);
    if (!dispChosen) setDisp(["refine", "hand"].includes($(".pro").dataset.mode ?? "") ? "shaded" : "render");
  };
  const box = $(".intro-stage");
  const cv = $<HTMLCanvasElement>(".intro-photo");
  const p = stone.photo;
  cv.width = p.width;
  cv.height = p.height;
  cv.getContext("2d")!.putImageData(p, 0, 0);
  const svg = document.querySelector<SVGSVGElement>(".intro-line")!;
  svg.setAttribute("viewBox", `0 0 ${p.width} ${p.height}`);
  const d = `M${stone.extraction.outlinePx.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join("L")}Z`;
  svg.innerHTML = `<path d="${d}" pathLength="1000"/>${findCorners(stone.extraction.outlinePx).map((c) => `<circle cx="${c.point.x}" cy="${c.point.y}" r="${p.width / 45}"/>`).join("")}`;
  $(".intro-cap").textContent = `${stone.label}　長辺 ${stone.measured.longMm.toFixed(2)} mm`;
  box.hidden = false;
  box.classList.remove("out");
  void box.offsetWidth;
  box.classList.add("draw");
  await wait(2200);
  if (!alive()) return;
  $(".intro-cap").textContent = `${stone.shapeName}・尖った角 ${stone.cornerIdx.length} か所・幅 ${stone.measured.widthMm.toFixed(2)} mm`;
  await wait(1100);
  if (!alive()) return;
  viewer.setStone(buildStone(session.stone), { color: stone.extraction.color, colorless: stone.extraction.colorless });
  box.classList.add("out");
  await wait(900);
  if (!alive()) return;
  box.hidden = true;
  box.classList.remove("draw", "out");
  // 線だけで組み上がる → 灰色の面 → 金。寸法を 1 本ずつ入れ、最後に図面と作り方
  const t0 = performance.now();
  const timer = document.createElement("div");
  timer.className = "intro-timer";
  parts.push(timer);
  $(".vp").appendChild(timer);
  let label = "";
  const draw = () => (timer.innerHTML = `<b>${label}</b><span>${((performance.now() - t0) / 1000).toFixed(1)} 秒</span>`);
  const tick = (l: string) => {
    label = l;
    draw();
  };
  clock = window.setInterval(draw, 100);
  holdDims = true;
  setDisp("wire");
  tick("組んでいます");
  session.build("最初の案");
  await viewer.reveal(1500);
  if (!alive()) return;
  tick("確かめています");
  setDisp("shaded");
  await wait(700);
  if (!alive()) return;
  setDisp("render");
  holdDims = false;
  const all = dims;
  for (let i = 1; i <= all.length; i++) {
    dims = all.slice(0, i);
    drawDims();
    await wait(260);
    if (!alive()) return;
  }
  dims = all;
  // 図面と作り方ができたことを、小さな札で見せる
  const b = session.built!;
  const steps = howToMake(howInput(b), method);
  const sheetImg = viewer.drawing("front", 14);
  const card = document.createElement("div");
  card.className = "intro-sheet";
  parts.push(card);
  card.innerHTML = `<img alt="" src="${sheetImg.url}"><div><b>図面と作り方</b><small>正面図ほか ・ ${steps.length} 工程 ・ ${grouped(b).length ? `直す所 ${grouped(b).length}` : "作れる形"}</small></div>`;
  $(".vp").appendChild(card);
  tick("写真 1 枚 → 図面と作り方");
  clearInterval(clock);
  timer.classList.add("done");
  await wait(3200);
  if (!alive()) return;
  card.classList.add("out");
  timer.classList.add("out");
  await wait(700);
  if (!alive()) return;
  card.remove();
  timer.remove();
  introCleanup = null;
}
// ---- 見せる：全画面で、黒の上の指輪と本物の数字。押して切り替えられる ----
let presentOn = false;
let presentGroup = "stone";
let presentPrevDisp: DisplayMode = "render";
/** 図面を開いたまま見せるを押したか（閉じたら図面に戻す） */
let presentPrevSheet = false;
function presentGroups(): PresentGroup[] {
  if (kind === "band")
    return [
      { key: "section", label: "腕の断面", options: [...SECTION_LIST.map((x) => ({ v: x.id as string, label: x.label })), ...(band.kind === "free" ? [{ v: "free", label: SECTION_LABEL.free }] : [])], on: band.kind },
      { key: "metal", label: "地金", options: (["pt900", "k18yg", "k18pg", "k18wg", "sv925"] as Metal[]).map((m) => ({ v: m, label: METAL_LABEL[m] })), on: bandMetal },
    ];
  if (!session?.built) return [];
  const s = session.state;
  const st = session.built.ring.setting;
  const near = STONE_SIZES.reduce((a, c) => (Math.abs(c.mm - session!.stone.longMm) < Math.abs(a.mm - session!.stone.longMm) ? c : a));
  return [
    { key: "stone", label: "石の大きさ", options: stoneSizeOptions(near), on: Math.abs(near.mm - session.stone.longMm) < 0.05 ? String(near.mm) : filming() ? "" : session.stone.longMm.toFixed(2) },
    presentSectionGroup(),
    { key: "setting", label: "留め方", options: (filming() ? PATTERNS.filter(([v]) => v !== "v" && v !== "3") : patternsFor(session.built)).map(([v, label]) => ({ v, label })), on: st.style === "prong" ? String(st.prongs.length) : st.style },
    { key: "metal", label: "地金", options: (["pt900", "k18yg", "k18pg", "k18wg"] as Metal[]).map((m) => ({ v: m, label: METAL_LABEL[m] })), on: s.metal },
    ...(MULTI_STONE_UI ? [{
      key: "layout",
      label: "石の並び",
      options: [
        { v: "solo", label: "一粒" },
        { v: "trio", label: "三石" },
        // 横一列は並び方がまだ不自然なので、設計の欄と同じく出さない（2026-11-05 作者：見せるから選ぶと形がくずれた）
        ...(ROW_AND_FREE_UI ? [{ v: "row", label: `横一列 ${GUIDES.multi.rowCount[1]}` }] : []),
      ],
      on: s.layout === "trio" || s.layout === "row" ? s.layout : s.stones?.length ? "" : "solo",
    }] : []),
  ];
}
/**
 * 見せるの石の大きさの札。今の石がどの札とも合わなければ（例：8.88 mm）、今の大きさの札を 1 つ足して、選ばれて見えるように。
 * 撮影の絵は前のまま
 */
function stoneSizeOptions(near: { mm: number }): { v: string; label: string }[] {
  const list = STONE_SIZES.map((x) => ({ v: String(x.mm), label: x.label, mm: x.mm }));
  const now = session!.stone.longMm;
  if (!filming() && Math.abs(near.mm - now) >= 0.05) list.push({ v: now.toFixed(2), label: `${now.toFixed(2)} mm（今の石）`, mm: now });
  return list.sort((a, b) => a.mm - b.mm).map(({ v, label }) => ({ v, label }));
}
/** 見せるの腕の断面の札：ふだんは作ると同じ 12 の見本。テンションと撮影では、前の腕の断面の札 */
function presentSectionGroup(): PresentGroup {
  const s = session!.state;
  const sh = session!.built!.ring.shank;
  if (!filming() && s.style !== "tension") {
    const k = ringSectionKind(s, sh.widthMm, sh.thicknessMm);
    return { key: "section", label: "腕の断面", options: [...SECTION_LIST.map((x) => ({ v: x.id as string, label: x.label })), ...(k === "free" ? [{ v: "free", label: "手で描いた形" }] : [])], on: k };
  }
  const names = filming() ? FILM_SECTION_LABEL : SHANK_SECTION_LABEL;
  return { key: "section", label: "腕の断面", options: [...(s.style === "tension" ? (["maru"] as ShankSection[]) : []), ...SHANK_SECTIONS.filter((x) => filming() || x !== "hangouman")].map((x) => ({ v: x, label: names[x] })), on: sh.section };
}
/** 見せるの欄を描いて、押せるようにする */
function showPresentPanel(html: string) {
  const panel = $(".pr-panel");
  panel.innerHTML = html;
  panel.querySelectorAll<HTMLButtonElement>(".pr-tabs button").forEach((x) =>
    x.addEventListener("click", () => {
      presentGroup = x.dataset.g!;
      renderPresent();
    }),
  );
  panel.querySelectorAll<HTMLButtonElement>(".pr-opt button").forEach((x) => x.addEventListener("click", () => presentPick(x.dataset.g!, x.dataset.v!)));
}
function renderPresent() {
  if (!presentOn) return;
  if (kind === "band") {
    const n = bandProblems().length;
    return showPresentPanel(
      presentHtml(
        {
          title: filming() ? undefined : `${sectionWord(band)}の指輪`,
          shank: `${sectionWord(band)} ${sizeWord(band)}`,
          metal: `${band.metalLabel} ・ 約 ${bandWeight.toFixed(1)} g`,
          gou: `${band.gou} 号（内径 ${bandInnerDiameter(band.gou).toFixed(1)} mm）`,
          verdict: { ok: n === 0, text: n === 0 ? "作れます" : `作れない所 ${n}` },
        },
        presentGroups(),
        presentGroup,
      ),
    );
  }
  if (!session?.built || !stone) return;
  const b = session.built;
  const r = b.ring;
  const st = r.setting;
  const n = grouped(b).length;
  const rule = st.tension ? activeRules(store.ledger()).find((x) => x.id === TENSION_RULE_ID) : craftRuleFor("prong-thin");
  const html = presentHtml(
    {
      title: filming() ? undefined : `${stone.shapeName}の${st.style === "bezel" ? "覆輪の" : st.tension ? "テンションの" : ""}指輪`,
      stone: `${stone.shapeName} ${session.stone.longMm.toFixed(2)} × ${session.stone.widthMm.toFixed(2)} mm${r.stones.length > 1 ? ` ほか ${r.stones.length - 1} 石` : ""}`,
      prongLabel: st.tension ? "留め方" : undefined,
      prong: st.tension ? tensionWord(st) : st.style === "bezel" ? `覆輪 ・ 壁 ${st.bezel?.wallMm.toFixed(2)} mm` : `ø ${st.prongs[0]?.diameterMm.toFixed(2)} mm × ${st.prongs.length}`,
      shank: `${filming() ? FILM_SECTION_LABEL[r.shank.section] : ringSectionWord(session.state, r.shank.widthMm, r.shank.thicknessMm)} ${shankSizeWords(r.shank)}`,
      metal: `${METAL_LABEL[session.state.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g`,
      gou: `${session.state.gou} 号（内径 ${(r.shank.innerRadiusMm * 2).toFixed(1)} mm）`,
      verdict: { ok: n === 0, text: n === 0 ? (tensionCautionsOf(b).length ? `職人に聞く ${tensionCautionsOf(b).length}` : "作れます") : `作れない所 ${n}` },
      // 職人の言葉は、撮影のときだけ（お客さまに見せる画面に、帳面の話は要らない。2026-11-05 作者）
      quote: filming() && rule?.quote ? { text: rule.quote, by: `${masterName(store.ledger())} ・ ${bookTitle(bookLabel(store.ledger()))}` } : undefined,
    },
    presentGroups(),
    presentGroup,
  );
  showPresentPanel(html);
}
function presentPick(g: string, v: string) {
  presentGroup = g;
  if (kind === "band") {
    if (g === "section" && v !== "free") band = pickSection(band, v as PresetKind);
    if (g === "metal") setBandMetal(v as Metal);
    showBand();
    return;
  }
  if (!session) return;
  if (g === "stone") resizeStone(Number(v), true);
  else if (g === "section") {
    if (filming() || session.state.style === "tension") session.setShank({ section: v as ShankSection, reason: "見せる" });
    else if (v !== "free") {
      const sh = session.built!.ring.shank;
      session.setShank({ ...ringSectionInput(v as PresetKind, sh.widthMm, sh.thicknessMm), reason: "見せる" });
    }
  }
  else if (g === "setting") session.setSetting(v === "bezel" || v === "tension" ? { style: v, reason: "見せる" } : { style: "prong", prong_count: Number(v), reason: "見せる" });
  else if (g === "metal") session.setShank({ metal: v as Metal, reason: "見せる" });
  else if (g === "layout") session.setStones({ layout: v as "solo", count: v === "row" ? GUIDES.multi.rowCount[1] : undefined, reason: "見せる" });
  renderPresent();
}
function setPresent(on: boolean) {
  if (kind !== "band" && !session?.built) return;
  presentOn = on;
  $(".pro").classList.toggle("presenting", on);
  $(".present").hidden = !on;
  if (on) {
    presentPrevDisp = viewer.displayMode;
    // 図面は 3D の上にかぶるので、見せるの間は隠す
    presentPrevSheet = sheetOn;
    hideSheet();
    viewer.setDisplayMode("render");
    viewer.setPresenting(true);
    viewer.setAutoRotate(true);
    renderPresent();
  } else {
    viewer.setPresenting(false);
    viewer.setAutoRotate(false);
    setDisp(presentPrevDisp);
    if (presentPrevSheet) {
      showSheet();
      document.querySelectorAll<HTMLButtonElement>(".disp button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.disp === "draw")));
    }
  }
  // 指輪を置く所の大きさが変わるので、少し待ってから寄せ直す
  setTimeout(() => viewer.fit(), 120);
}
$(".act-present").addEventListener("click", () => {
  measure?.stop();
  prongEdit?.close();
  setPresent(!presentOn);
});
$(".pr-close").addEventListener("click", () => setPresent(false));
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && presentOn) setPresent(false);
});

/** 人が表示（ワイヤー・シェード・レンダー・図面）を選んだか */
let dispChosen = false;
/** 表示の切り替え（ボタンの見た目もそろえる） */
function setDisp(m: DisplayMode) {
  viewer.setDisplayMode(m);
  document.querySelectorAll<HTMLButtonElement>(".disp button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.disp === m)));
}

function drawThumb() {
  if (!stone) return;
  const c = $<HTMLCanvasElement>(".stone-thumb");
  const g = c.getContext("2d")!;
  const p = stone.photo;
  const pts = stone.extraction.outlinePx;
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.75;
  const tmp = document.createElement("canvas");
  tmp.width = p.width;
  tmp.height = p.height;
  tmp.getContext("2d")!.putImageData(p, 0, 0);
  g.drawImage(tmp, cx - half, cy - half, half * 2, half * 2, 0, 0, c.width, c.height);
  g.strokeStyle = "#409cff";
  g.lineWidth = 2;
  g.beginPath();
  pts.forEach((q, i) => {
    const x = ((q.x - (cx - half)) / (half * 2)) * c.width;
    const y = ((q.y - (cy - half)) / (half * 2)) * c.height;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
  g.stroke();
}

/** よくある形を選ぶ（人が札を押したとき） */
async function loadPreset(p: StonePreset) {
  await placePreset(p);
  setStatus(`${p.name}（${p.longMm} × ${p.widthMm} mm、深さは例）。ノギスの値があれば、長辺と深さを直してください。`);
}
/** よくある形：白い紙の上の写真のように描いて、写真と同じ読み取りに通す（人の札と、Claude の choose_stone が同じ関数を使う） */
async function placePreset(p: StonePreset) {
  const W = 720;
  const k = 260 / p.longMm;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#f6f5f2";
  g.fillRect(0, 0, W, W);
  const pts = presetOutline(p);
  g.beginPath();
  pts.forEach((q, i) => (i ? g.lineTo(W / 2 + q.x * k, W / 2 - q.y * k) : g.moveTo(W / 2 + q.x * k, W / 2 - q.y * k)));
  g.closePath();
  const grad = g.createRadialGradient(W / 2 - 30, W / 2 - 30, 10, W / 2, W / 2, 160);
  grad.addColorStop(0, "#c9ced3");
  grad.addColorStop(1, "#8e969e");
  g.fillStyle = grad;
  g.fill();
  // 撮影は前の名前のまま（台本の絵がそろうように）
  await loadStone(g.getImageData(0, 0, W, W), `${p.name}の石`, p.longMm, p.depthMm, { intro: false, shapeName: filming() ? undefined : p.name, key: p.id });
}
/** 取り込んだ石へ戻す（読んだ輪郭と、直した長辺・深さのまま） */
async function useImported() {
  if (!imported) return;
  const s = imported;
  await loadStone(s.photo, s.label, s.longMm, s.depthMm, { intro: false, shapeName: s.shapeName, key: "imported", extraction: s.extraction });
  setStatus(`取り込んだ石に戻しました（${s.shapeName}・${s.measured.longMm.toFixed(2)} × ${s.measured.widthMm.toFixed(2)} mm）。`);
}
// 石の形の札は、作ると確かめるの同じ部品。描き直しても効くように、ここ 1 か所で受ける
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement | null)?.closest?.<HTMLButtonElement>(".presets button");
  if (!b) return;
  if (b.dataset.preset) void loadPreset(PRESETS.find((p) => p.id === b.dataset.preset)!);
  else if (b.dataset.kept === "imported") void useImported();
  else if (b.dataset.kept === "first") void loadSample(false);
});

async function loadSample(startup = true) {
  const img = new Image();
  img.src = SAMPLE.url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  // 最初の見せ場は、この画面を開いて最初の 1 回だけ（読み直し・ほかの場所から戻ったときは、待たせない）
  const play = startup && !new URLSearchParams(location.search).has("nointro") && !introSeen(tab);
  if (play) markIntroSeen(tab);
  await loadStone(g.getImageData(0, 0, c.width, c.height), SAMPLE.label, SAMPLE.longMm, SAMPLE.depthMm, { intro: play, key: startup ? "imported" : "first" });
}

/** 石の写真を入れ替える（ファイルを選ぶ・3D の所や石の欄へ落とす、のどちらからも） */
async function useStonePhoto(f: File) {
  if (/heic|heif/i.test(f.type) || /\.hei[cf]$/i.test(f.name)) {
    setStatus("この写真の形式（HEIC）は、このブラウザで読めません。iPhone の写真は「互換性優先」で撮るか、JPEG に書き出してから選んでください。");
    return;
  }
  setStatus(`「${f.name}」を読んでいます…`);
  $(".stone-card").classList.add("busy");
  try {
    const img = await loadPhoto(f);
    // 自分の石の写真は「取り込んだ石」の札になる（長辺と深さは今の欄の値で読み、あとでノギスの値に直せる）
    await loadStone(img, f.name, Number($<HTMLInputElement>(".in-long").value) || 8, Number($<HTMLInputElement>(".in-depth").value) || 4, { key: "imported" });
    setStatus("石を入れ替えました。長辺と深さをノギスの値にすると、組み直します。");
  } catch (err) {
    setStatus(`石が読めませんでした。白い紙の上で真上から撮った写真か、確かめてください（${(err as Error).message}）`);
  } finally {
    $(".stone-card").classList.remove("busy");
  }
}
$<HTMLInputElement>(".stone-file").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  // 同じファイルをもう一度選んでも読めるように、選んだ後は空にする
  input.value = "";
  if (f) await useStonePhoto(f);
});
for (const el of [$(".vp"), $(".stone-card")]) {
  el.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    el.classList.add("drop");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop"));
  el.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    el.classList.remove("drop");
    if (!f || !f.type.startsWith("image/")) return;
    e.preventDefault();
    void useStonePhoto(f);
  });
}
/** 長辺・深さの欄の注意を出しているか */
let fitNoted = false;
for (const sel of [".in-long", ".in-depth"]) {
  $<HTMLInputElement>(sel).addEventListener("change", () => {
    if (!stone) return;
    // 長辺はつまみと同じ範囲に収める（−5 mm で「作れます」、100 mm で 1 分近く止まっていた）
    const long = fitStoneLong(Number($<HTMLInputElement>(".in-long").value), stone.longMm);
    const depth = fitStoneDepth(Number($<HTMLInputElement>(".in-depth").value), stone.depthMm);
    void loadStone(stone.photo, stone.label, long.mm, depth.mm, { same: { shape: true, size: Math.abs(long.mm - stone.longMm) < 1e-6 } });
    const note = long.fixed ? `長辺は ${STONE_LONG_RANGE.min}〜${STONE_LONG_RANGE.max} mm で入れてください。${long.mm} mm にしました。` : depth.fixed ? `深さは 0 より大きく、${STONE_LONG_RANGE.max} mm までで入れてください。${depth.mm} mm にしました。` : "";
    // 正しい数に直したら、前の注意は消す（ほかの知らせは残す）
    if (note || fitNoted) setStatus(note);
    fitNoted = !!note;
  });
}
document.querySelector<HTMLInputElement>(".sketch-file")?.addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.85);
  sketch = { dataUrl, base64: dataUrl.split(",")[1], media: "image/jpeg" };
  $(".sketch-thumb").innerHTML = `<img alt="" src="${dataUrl}">`;
  $(".sketch-sub").textContent = "「生成」で Claude が絵を読みます（合言葉が要ります）";
});

// ---- 組めたら：3D・数字・赤い所 ----
/** 最初の案の爪の太さを、留まりと太さの確かめが通るまで上げる（軽い作り方で数回だけ試す。画面には出さない） */
let tuning = false;
function tuneProngs() {
  if (!session) return;
  tuning = true;
  tuneProngMm(session);
  tuning = false;
}

let sheetTimer = 0;
/** 確かめるの欄に出る、形の結果（同じなら、欄を描き直さなくてよい） */
let panelKey = "";
function panelKeyOf(b: Built): string {
  const r = b.ring;
  return JSON.stringify([b.problems.map((p) => [p.check, p.current, p.required, p.options.map((o) => o.id)]), r.setting.join, r.setting.prongTip, r.setting.style, r.setting.prongs.length, r.setting.prongs[0]?.diameterMm, r.notchDepthMm, r.culetGapMm, r.shank.widthMm, r.shank.thicknessMm]);
}
/**
 * 画面に出している一体の石座の作り（石・留め方・付け方・爪の数と太さ・向き・高さ・下の輪）。一体でない形を出しているときは空。
 * 同じなら、すぐの形では腕だけ替える（石座は前の一体の形のまま）。ちがえば、すぐの形（管を重ねた形）をそのまま出す（石座が浮いたり、腕に穴が見えたりしないように）
 */
let shownHead = "";
function headKeyOf(b: Built): string {
  const r = b.ring;
  const st = r.params.stone;
  const mm = (x: number | undefined) => (x === undefined ? null : Math.round(x * 1000));
  const c = r.setting.collar;
  return JSON.stringify([
    r.setting.style,
    r.setting.join,
    r.setting.prongTip,
    r.setting.prongs.map((p) => [mm(p.t), mm(p.diameterMm), mm(p.tipZ)]),
    r.stones.length,
    r.orientation,
    [st.longMm, st.widthMm, st.depthMm, st.outlineMm.length, st.outlineMm[0]?.x, st.outlineMm[0]?.y],
    mm(r.shank.outerRadiusMm),
    mm(r.culetGapMm),
    c ? [mm(c.topZ), mm(c.bottomZ), mm(c.heightMm), mm(c.wallMm)] : null,
  ]);
}
function onBuilt(b: Built, _why: string, refined = false) {
  if (tuning || !stone || kind !== "solitaire") return;
  keepDesignSoon();
  historySoon();
  renderMakeOpts();
  // 細かい形への作り直しは、確かめの結果が同じなら欄を描き直さない。
  // 押して離すまでの間に欄が作り直されると、ボタンが消えて押した事にならなかった（続けて押すと効かない。2026-11-05 点検）。
  // 比べている間は地金の重さを欄に出すので、描き直す
  const key = panelKeyOf(b);
  const sameKey = refined && key === panelKey && !compare;
  panelKey = key;
  if (sheetOn) {
    clearTimeout(sheetTimer);
    // すぐの形（一体の形が別の糸から届く前）では描かない。届いたときに、もう一度ここへ来る
    sheetTimer = window.setTimeout(() => sheetOn && !session?.quick && showSheet(), 400);
  }
  // すぐの形（一体にしない管の形。一体の形は別の糸で作っていて、すぐ届く）：石・石座が前と同じ作りなら、石座は前の一体の形のまま腕だけ替える
  // （つまみを動かしている間と同じ見せ方。管の形と一体の形が入れ替わって、ちらつかないように）
  const keep = session!.quick && shownHead !== "" && shownHead === headKeyOf(b);
  if (keep) viewer.updateShank(b.ring.shank, b.problems);
  else {
    viewer.setRing(b.ring, { color: stone.extraction.color, colorless: stone.extraction.colorless, shade: session!.state.metal }, b.problems, narrowArmOf(b)?.level);
    shownHead = b.ring.ringPositions.settingNormals ? headKeyOf(b) : "";
  }
  headBox = headBoxOf(b);
  setDims(ringDims(b));
  // 爪の欄の赤い印は、見せている石座の三角形の番号で付ける（前の一体の形のままのときは、一体の形が届いてから）
  if (!keep) prongEdit?.sync(b);
  if (session?.takeEditsDropped()) toast("爪の本数が変わったので、1 本ずつの直しを消しました");
  const r = b.ring;
  const s = session!.state;
  const st = r.setting;
  const rows: [string, string][] = [
    ["石", `${stone.shapeName} ・ ${stone.measured.longMm.toFixed(2)} × ${stone.measured.widthMm.toFixed(2)} × ${stone.depthMm.toFixed(2)} mm`],
    ...(r.stones.length > 1 ? ([["石の並び", `${layoutName()} ・ ${r.stones.length} 石（${r.stones.map((x) => x.params.longMm.toFixed(1)).join(" ・ ")} mm）`]] as [string, string][]) : []),
    ["留め方", st.tension ? tensionWord(st) : st.style === "bezel" ? `覆輪 ・ 壁 ${st.bezel?.wallMm.toFixed(2)} mm` : `爪 ${st.prongs.length}${st.prongs.some((p) => p.isV) ? `（V 字 ${st.prongs.filter((p) => p.isV).length}）` : ""} ・ ${prongDiaWord(st)}${st.prongTip === "oni" ? ` ・ ${PRONG_TIP_LABEL.oni}` : ""}`],
    ["号 ・ 腕", `${s.gou} 号 ・ ${ringSectionWord(s, r.shank.widthMm, r.shank.thicknessMm)} ${shankSizeWords(r.shank)}`],
    ["石と指のすき間", `${r.culetGapMm.toFixed(2)} mm`],
    ["地金", `${METAL_LABEL[s.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g`],
  ];
  $(".specs").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  const n = b.problems.length;
  const chip = $(".verdict-chip");
  chip.hidden = false;
  const cautions = tensionCautionsOf(b);
  const handGroove = handGrooveOf(b);
  const arm = narrowArmOf(b);
  chip.className = `verdict-chip ${n ? "ng" : cautions.length || handGroove || arm ? (arm?.level === "orange" ? "warn2" : "warn") : "ok"}`;
  chip.textContent = n ? `作れない所 ${grouped(b).length}` : cautions.length ? `職人に聞く ${cautions.length}` : arm ? `作れます（注意 ${[arm, handGroove].filter(Boolean).length}）` : handGroove ? "手で彫る溝あり" : "作れます";
  markDrawFault();
  $(".word-name").textContent = r.stones.length > 1 ? `${stone.shapeName}の${layoutName()}の指輪` : `${stone.shapeName}の一粒石の指輪`;
  drawStoneTags();
  if (presentOn) renderPresent();
  if (!sameKey) renderFixPop();
  if (holdPanel) return;
  if (!sameKey && !$(".make-panel").hidden) renderRingShapeNow();
  if (!sameKey && !$(".studio-refine").hidden) renderCheck();
  if (!$(".build-panel").hidden) renderBuild();
  if (!sameKey) markBadControls();
}

// ---- 場面 ----
/** 3D の上と下にかぶるボタンの高さを測って、指輪をその間に収める */
function fitInsets() {
  const vp = $(".vp").getBoundingClientRect();
  if (!vp.height) return;
  let top = 0;
  let bottom = 0;
  for (const sel of [".vp-tl", ".verdict-chip", ".tools"]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el || el.hidden || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= vp.left || r.left >= vp.right || r.bottom <= vp.top || r.top >= vp.bottom) continue;
    // 横に長いもの（スマホの道具の帯）だけを数える。左の縦の帯は数えない
    if (r.height > vp.height * 0.5) continue;
    if (r.top - vp.top < vp.height / 2) top = Math.max(top, r.bottom - vp.top + 6);
    else bottom = Math.max(bottom, vp.bottom - r.top + 6);
  }
  viewer.setInsets(Math.round(top), Math.round(bottom));
}
new ResizeObserver(() => fitInsets()).observe($(".vp"));
function setMode(m: Mode) {
  if (m !== "refine") prongEdit?.close();
  if (m !== "refine") ruleVoice?.stop();
  const w = MODES.find((x) => x.id === m)!;
  $(".vp-mode").textContent = w.word;
  // 記録の説明は、欄の中の 1 行だけにする
  $(".word-sub").textContent = m === "make" && kind === "band" ? "断面と言葉から形を組む" : m === "works" ? "" : w.sub;
  document.querySelectorAll<HTMLButtonElement>(".tabs [data-mode]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.mode === m)));
  $(".make-panel").hidden = m !== "make";
  $(".studio-refine").hidden = m !== "refine";
  $(".build-panel").hidden = m !== "hand";
  $(".works-panel").hidden = m !== "works";
  if (m === "works") renderWorks();
  $(".pro").setAttribute("data-mode", m);
  keepDesignSoon();
  // 作るの画面でも、自動では回さない（2026-11-05 作者：勝手に回るのはいや。回すのは人がドラッグしたときだけ）
  viewer.setAutoRotate(false);
  viewer.setLift(0);
  requestAnimationFrame(fitInsets);
  // 調整する場面は、シェードで始める（人が表示を選んだ後は、その表示のまま）
  if ((m === "refine" || m === "hand") && !dispChosen) setDisp("shaded");
  if (m === "refine") renderCheck();
  if (m === "hand") renderBuild();
  if (m === "make" && kind === "band") renderBandPanel($(".band-ctrl"), bandHost);
  if (m === "make" && kind === "solitaire") renderRingShapeNow();
}
document.querySelectorAll<HTMLButtonElement>(".tabs [data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode as Mode)));
const VIEW_NAME = { angle: "斜め", top: "上", side: "横", front: "正面" } as const;
document.querySelectorAll<HTMLButtonElement>(".view-btn").forEach((b) =>
  b.addEventListener("click", () => {
    const v = b.dataset.view as keyof typeof VIEW_NAME;
    viewer.setAutoRotate(false);
    viewer.setView(v);
    $(".vp-view").textContent = VIEW_NAME[v];
    document.querySelectorAll<HTMLButtonElement>(".view-btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }),
);
viewer.setGrid(true);
$(".t-grid").addEventListener("click", (e) => {
  const b = e.currentTarget as HTMLButtonElement;
  const on = b.getAttribute("aria-pressed") !== "true";
  b.setAttribute("aria-pressed", String(on));
  viewer.setGrid(on);
});
// 寸法を 1 つずつ出す・隠す
{
  const menu = document.createElement("div");
  menu.className = "dims-menu";
  menu.hidden = true;
  const render = () =>
    (menu.innerHTML = `<b>寸法</b>${(kind === "band" ? BAND_DIM_NAMES : DIM_NAMES).map(([k, l]) => `<label><input type="checkbox" data-k="${k}" ${hiddenDims.has(k) ? "" : "checked"}>${esc(l)}</label>`).join("")}`);
  menu.addEventListener("change", (e) => {
    const k = (e.target as HTMLInputElement).dataset.k!;
    if ((e.target as HTMLInputElement).checked) hiddenDims.delete(k);
    else hiddenDims.add(k);
    try {
      localStorage.setItem("tsugu.hiddenDims", JSON.stringify([...hiddenDims]));
    } catch {}
    if (kind === "band") showBand(true);
    else if (session?.built) setDims(ringDims(session.built));
  });
  $(".vp").appendChild(menu);
  const more = document.createElement("button");
  more.type = "button";
  more.className = "tool t-dims-more";
  more.setAttribute("aria-label", "寸法を選ぶ");
  more.dataset.tip = "寸法を選ぶ";
  more.textContent = "▾";
  $(".t-dims").after(more);
  more.setAttribute("aria-expanded", "false");
  const shut = () => {
    menu.hidden = true;
    more.setAttribute("aria-expanded", "false");
  };
  more.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    more.setAttribute("aria-expanded", String(!menu.hidden));
    render();
  });
  // 寸法を選ぶ窓は、外を押すか Esc で閉じる（前は開いたままで、指輪の上に残っていた。2026-11-06 通しの確かめ）
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && !more.contains(e.target as Node)) shut();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) shut();
  });
}
$(".t-dims").addEventListener("click", (e) => {
  const b = e.currentTarget as HTMLButtonElement;
  showDims = !showDims;
  b.setAttribute("aria-pressed", String(showDims));
  setDims(dims);
});
$(".t-fit").addEventListener("click", () => viewer.fit());
document.querySelectorAll<HTMLButtonElement>(".disp button").forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.disp === "draw") showSheet();
    else {
      hideSheet();
      viewer.setDisplayMode(b.dataset.disp as DisplayMode);
    }
    document.querySelectorAll<HTMLButtonElement>(".disp button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    dispChosen = true;
  }),
);
// ---- 図面：3D の所に、そのまま図面（正面・側面・上面・寸法・表題欄）を出す ----
let sheetOn = false;
function drawingSheetHtml(): string {
  if (kind === "band") return bandDrawing(bandProblems().map((p) => p.title));
  if (!session?.built) return "";
  return solitaireDrawing(session.built, grouped(session.built).map(({ p }) => SHORT[p.check] ?? p.where));
}
function showSheet() {
  sheetOn = true;
  let el = document.querySelector<HTMLElement>(".sheet-view");
  if (!el) {
    el = document.createElement("div");
    el.className = "sheet-view";
    $(".vp").appendChild(el);
  }
  el.hidden = false;
  $(".pro").classList.add("drawing-on");
  const body = drawingSheetHtml();
  el.innerHTML = `${filming() ? "" : `<button type="button" class="sheet-big">大きく見る</button>`}<iframe title="図面" srcdoc="${esc(`<!doctype html><meta charset="utf-8"><style>${DRAWING_CSS}
    html,body{margin:0;height:100%;background:#1c1c1e;overflow:hidden;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
    .wrap{position:absolute;left:50%;top:50%;transform-origin:center}
    .dw{background:#fff;color:#111;box-shadow:0 20px 60px rgba(0,0,0,.5)}</style>
    <div class="wrap">${body}</div>
    <script>const w=document.querySelector('.wrap');function fit(){const r=w.firstElementChild.getBoundingClientRect();const k=Math.min(innerWidth/(r.width/(w._k||1)),innerHeight/(r.height/(w._k||1)))*0.92;w._k=k;w.style.transform='translate(-50%,-50%) scale('+k+')'}addEventListener('resize',fit);requestAnimationFrame(fit);</script>`)}"></iframe>`;
  el.querySelector(".sheet-big")?.addEventListener("click", openSheetFull);
}
/** 図面を全画面で。＋ − で大きくして、指やマウスで動かして読む（スマホでは小さくて読めず、拡大もできなかった） */
function openSheetFull() {
  const body = drawingSheetHtml();
  if (!body) return;
  const el = document.createElement("div");
  el.className = "sheet-full";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "図面を大きく見る");
  el.innerHTML = `<div class="sf-bar"><button type="button" class="sf-out" aria-label="小さくする">−</button><span class="sf-pct"></span><button type="button" class="sf-in" aria-label="大きくする">＋</button><button type="button" class="sf-close">閉じる</button></div>
    <div class="sf-scroll"><div class="sf-size"><iframe title="図面" tabindex="-1" srcdoc="${esc(`<!doctype html><meta charset="utf-8"><style>${DRAWING_CSS}html,body{margin:0;background:#fff;color:#111;width:max-content;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}</style>${body}`)}"></iframe></div></div>`;
  document.body.appendChild(el);
  const scroller = el.querySelector<HTMLElement>(".sf-scroll")!;
  const size = el.querySelector<HTMLElement>(".sf-size")!;
  const frame = el.querySelector("iframe")!;
  let nat = { w: 1, h: 1 };
  let fit = 1;
  let zoom = 1;
  const apply = () => {
    const k = fit * zoom;
    size.style.width = `${nat.w * k}px`;
    size.style.height = `${nat.h * k}px`;
    frame.style.width = `${nat.w}px`;
    frame.style.height = `${nat.h}px`;
    frame.style.transform = `scale(${k})`;
    el.querySelector(".sf-pct")!.textContent = `${Math.round(zoom * 100)}%`;
  };
  frame.addEventListener("load", () => {
    const page = frame.contentDocument?.body.firstElementChild?.getBoundingClientRect();
    if (page?.width) nat = { w: page.width, h: page.height };
    fit = scroller.clientWidth / nat.w;
    apply();
  });
  const zoomBy = (m: number) => {
    const cx = (scroller.scrollLeft + scroller.clientWidth / 2) / (nat.w * fit * zoom);
    const cy = (scroller.scrollTop + scroller.clientHeight / 2) / (nat.h * fit * zoom);
    zoom = Math.min(5, Math.max(1, zoom * m));
    apply();
    scroller.scrollLeft = cx * nat.w * fit * zoom - scroller.clientWidth / 2;
    scroller.scrollTop = cy * nat.h * fit * zoom - scroller.clientHeight / 2;
  };
  el.querySelector(".sf-in")!.addEventListener("click", () => zoomBy(1.5));
  el.querySelector(".sf-out")!.addEventListener("click", () => zoomBy(1 / 1.5));
  el.querySelector(".sf-close")!.addEventListener("click", () => el.remove());
}
function hideSheet() {
  sheetOn = false;
  const el = document.querySelector<HTMLElement>(".sheet-view");
  if (el) el.hidden = true;
  $(".pro").classList.remove("drawing-on");
}
// 1〜4 で場面を切り替える（字を書いている間は使わない）
document.addEventListener("keydown", (e) => {
  const el = e.target as HTMLElement;
  if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select")) return;
  const why = document.querySelector<HTMLElement>(".why");
  if (why && !why.hidden) {
    if (e.key === "Escape") why.querySelector<HTMLButtonElement>(".why-close")?.click();
    return;
  }
  if (document.querySelector("dialog[open]")) return;
  const m = MODES.find((x) => x.key === e.key);
  if (m) setMode(m.id);
});
// 上のボタンは、場面を変えずに書き出す（押すと「手順」へ移っていた）
$(".act-sheet").addEventListener("click", () => printSheet());
$(".act-stl").addEventListener("click", () => exportStl());
// スマホの上の帯のメニュー（帳面・学ぶ・技へ。図面・指示書も）
{
  const more = document.querySelector<HTMLButtonElement>(".act-more");
  const menu = document.querySelector<HTMLElement>(".more-menu");
  if (more && menu) {
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      more.setAttribute("aria-expanded", String(!menu.hidden));
    });
    menu.querySelector(".more-sheet")!.addEventListener("click", () => printSheet());
    addEventListener("click", () => {
      menu.hidden = true;
      more.setAttribute("aria-expanded", "false");
    });
  }
}

// ---- 生成。：Claude が組んで、確かめて、直す ----
function logLine(e: LogEntry) {
  // 道具の合間のメモが英語だけで届いたときは、出さない
  if (e.kind === "note" && !hasJapanese(e.text)) return;
  const ol = $(".worklog");
  ol.hidden = false;
  const li = document.createElement("li");
  logLineTo(li, e);
  ol.appendChild(li);
  ol.scrollTop = ol.scrollHeight;
}
/** 帳面の決まりの題（決まりの印を、人に読める名前にする） */
function titlesNow(): RuleTitles {
  return ruleTitles(store.ledger().rules);
}
/** 今の石の、爪の位置を言葉にするのに要る所 */
function stoneWords(): StoneWords | undefined {
  return stone ? { outlineMm: stone.measured.outlineMm, corners: stone.cornerIdx.map((c) => c.index) } : undefined;
}
function logLineTo(li: HTMLLIElement, e: LogEntry) {
  const titles = titlesNow();
  if (e.kind === "note") {
    li.className = "note";
    // 最後のまとめは何行かある。全部読めるように（「まだできないこと」は札に出すので、ここには出さない）
    li.textContent = plainWords(withoutCannot(e.text), titles);
  } else {
    const line = toolLogLine(e, { stone: stoneWords(), titles });
    li.className = `wl-tool ${e.tool}`;
    if (line.mark) li.classList.add(line.mark);
    li.textContent = line.text;
  }
}

function stoneText(): string {
  if (!stone) return "";
  const m = stone.measured;
  const corners = stone.cornerIdx.length ? stone.cornerIdx.map((c) => `輪郭の点 ${c.index} 番（内角 ${c.angle}°）`).join("、") : "なし";
  return `石：${stone.shapeName}。長辺 ${m.longMm.toFixed(2)} mm、幅 ${m.widthMm.toFixed(2)} mm（${m.widthFromPhoto ? "写真から" : "測った値"}）、深さ ${stone.depthMm.toFixed(2)} mm。輪郭の点は ${m.outlineMm.length} 個（0 番から反時計回り）。尖った角：${corners}。色：${stone.extraction.colorless ? "無色" : "色のある石"}。`;
}

let making = false;
$(".command").addEventListener("submit", (e) => {
  e.preventDefault();
  void make();
});
/** Claude につながらなかったときの一言（同じ言葉を 2 回出さない） */
function offlineWords(message: string | undefined, next: string): string {
  return `Claude につながりませんでした${offlineWhy(message)}。${next}`;
}
async function make() {
  if (kind === "band") return makeBand();
  if (!session || !stone || making) return;
  const wish = $<HTMLInputElement>(".wish").value.trim();
  const pass = store.password() || (await askPassword(true));
  if (!pass) {
    setStatus("生成には Claude が要ります。合言葉がないので、希望の言葉は使えません。形は今の案（決まりごとから作った案）のままです。", { links: [{ label: "手で変える →", run: toManual }] });
    return;
  }
  making = true;
  const mark = historyBegin();
  const free = stoneIsFree();
  const gou = session.state.gou;
  let chosen = false;
  $(".worklog").innerHTML = "";
  showCannot("");
  setStatus("Claude が組んで、作れるか確かめています…", { busy: true });
  const content: ClaudeContentBlockParam[] = [{ type: "text", text: `${stoneText()}\n${wish ? `希望：${wish}` : "希望：特になし（ふつうの普段使いの一粒石の指輪）"}\n${free ? STONE_FREE_NOTE : STONE_KEEP_NOTE}\n${gouNote(gou)}` }];
  if (sketch) {
    content.push({ type: "text", text: "デザイナーの絵：この雰囲気に近づけてください。絵から分かることと分からないことを分けて書いてください。" });
    content.push({ type: "image", source: { type: "base64", media_type: sketch.media, data: sketch.base64 } });
  }
  content.push({
    type: "text",
    text:
      "この石で指輪を組み、check で確かめ、作れない所があれば直してください。\n" +
      `この道具で変えられるのは、${free ? "石（よくある形と大きさ）と、" : ""}石座（留め方・爪の本数と太さと形と位置・高さ・向き・腕への付け方）と腕（断面の線・場所ごとの幅と厚みと断面・腕の流れ・面に彫る模様・地金）です。` + "雰囲気の言葉は、腕の断面と線にも訳してください。\n" +
      "希望や絵のうち、これで表せないこと（穴を開ける透かし、決まった 8 つのほかの模様、立体の飾り、石の数を増やす など）は、できたふりをせず、「まだできないこと：」の行に正直に短く書いてください。この行には、希望や絵で求められたのに形にできなかったことだけを書きます（帳面の決まりで気づいたことは「残っていること」へ）。すべて表せたときは「まだできないこと：なし」と書いてください。\n" +
      "最後の返事は、次の 4 行だけにしてください。前置き・見出し・箇条書きは書きません。1 行は 100 字ほどまで。\n" +
      "やったこと：…\n確かめたこと：…\n残っていること：…\nまだできないこと：…",
  });
  const r = await runClaude({
    host: makeHost(() => session!, {
      gou,
      chooseStone: free
        ? (input) => {
            chosen = true;
            return chooseStoneTool(input);
          }
        : undefined,
    }),
    messages: [{ role: "user", content }],
    system: designPrompt(store.ledger()),
    tools: generationTools(free),
    password: pass,
    speed: "fast",
    maxTurns: 8,
    onLog: logLine,
  });
  making = false;
  historyEnd(mark, true);
  if (r.offline || (r.error && !r.log.length)) {
    if (r.error?.code === "wrong_password") resetPassword();
    setStatus(offlineWords(r.error?.message, "決まりごとから作った案を出しています。"));
    return;
  }
  // 表せなかった希望を、目立つ所に出す（できたふりをさせない）
  showCannot(cannotFrom(r.finalText, titlesNow()));
  const chosenWords = chosen && stone ? `石は Claude が選びました（${stone.shapeName} ${stone.measured.longMm.toFixed(2)} × ${stone.measured.widthMm.toFixed(2)} mm、深さは例）。${imported ? "取り込んだ石は「取り込んだ石」のボタンで戻せます。" : ""}` : "";
  setStatus(`${chosenWords}${r.remaining !== undefined ? `今日あと ${r.remaining} 回` : ""}`, { links: [{ label: "確かめる →", run: () => setMode("refine") }] });
}
/** 石もおまかせ：Claude が選んだよくある形を、人が札を押したときと同じ関数で入れる。腕・地金・号は引き継ぐ */
async function chooseStoneTool(input: ChooseStoneInput): Promise<ChooseStoneResult> {
  const p = sizedPreset(input.shape, input.long_mm);
  await placePreset(p);
  const m = stone!.measured;
  return {
    shape_name: p.name,
    long_mm: Number(m.longMm.toFixed(2)),
    width_mm: Number(m.widthMm.toFixed(2)),
    depth_mm: p.depthMm,
    stone: stoneText(),
    note: "幅と深さは形の例の比から出した値で、測った値ではありません。爪の本数と位置と太さは新しい石で決め直しました。",
  };
}
/** 一粒石の指輪の腕の形の欄（地金のみの指輪と同じ部品。撮影では欄がない） */
let shankLive = 0;
const ringShapeHost: RingShapeHost = {
  state: () => session!.state,
  size: () => {
    const sh = session!.built!.ring.shank;
    return { widthMm: sh.widthMm, thicknessMm: sh.thicknessMm };
  },
  set: (input) => {
    cancelAnimationFrame(shankLive);
    holdPanel = false;
    session!.setShank({ ...input, reason: "手で" });
  },
  live: (widthMm, thicknessMm) => {
    holdPanel = true;
    // 1 こまに 1 回まで（指の動きの知らせは、1 こまに何度も来ることがある）
    cancelAnimationFrame(shankLive);
    shankLive = requestAnimationFrame(() => {
      const cur = session!.built!;
      viewer.updateShank(rebuildShank(cur.ring, { ...cur.ring.params.shank, widthMm, thicknessMm }), cur.problems);
    });
  },
  bindEditor: bindRingSectionEditor,
};
function renderRingShapeNow() {
  const box = document.querySelector<HTMLElement>(".ring-shape");
  if (box && session?.built && kind === "solitaire") renderRingShape(box, ringShapeHost);
}
/** 石の選択の欄が「石もおまかせ」か（撮影では欄がないので、今の石のまま） */
function stoneIsFree(): boolean {
  return document.querySelector<HTMLInputElement>('.gen-stone input[value="free"]')?.checked === true;
}
/** 号の欄で選べる範囲（手で変えるつまみと同じ） */
const gouRange = () => (kind === "band" ? BAND_GOU_RANGE : RING_GOU_RANGE);
/** 石と号の欄を、今の設計に合わせる */
function renderMakeOpts() {
  const now = document.querySelector<HTMLElement>(".sp-now");
  if (now && stone) now.textContent = `${stone.shapeName} ${stone.measured.longMm.toFixed(2)} × ${stone.measured.widthMm.toFixed(2)} mm`;
  const sel = document.querySelector<HTMLSelectElement>(".gen-gou");
  if (!sel || (kind === "solitaire" && !session)) return;
  const cur = kind === "band" ? band.gou : session!.state.gou;
  const { min, max } = gouRange();
  // 開いた記録の号が、選べる範囲の外のこともある
  const lo = Math.min(min, cur);
  const hi = Math.max(max, cur);
  const key = `${lo}-${hi}`;
  if (sel.dataset.range !== key) {
    sel.dataset.range = key;
    sel.innerHTML = Array.from({ length: hi - lo + 1 }, (_, i) => `<option value="${lo + i}">${lo + i} 号</option>`).join("");
  }
  sel.value = String(cur);
}
document.querySelector<HTMLSelectElement>(".gen-gou")?.addEventListener("change", (e) => {
  const v = Number((e.target as HTMLSelectElement).value);
  if (kind === "band") bandHost.change({ ...band, gou: v });
  else session?.setShank({ gou: v, reason: "手で" });
});

// ---- 戻す・進む（生成の前に戻す も同じ線の上を動く）。撮影では動かさない ----
interface DesignSnap {
  kind: Kind;
  stone: Stone;
  stoneKey: string | null;
  imported: Stone | null;
  /** 組み直すのに使った石（同じなら設計の場を作り直さない） */
  params: RingSession["stone"];
  state: RingSession["state"];
  band: Band;
  bandMetal: Metal;
}
const historyOn = !filming();
const hist = new DesignHistory<DesignSnap>();
let histTimer = 0;
let histHold = false;
/** 石は大きさのつまみで中身が書きかわるので、写しを取る */
function captureDesign(): DesignSnap | null {
  if (!stone || !session) return null;
  const state = session.snapshot();
  // 比べている間の爪の太さではなく、職人の決まりで組んだときの太さを覚える
  if (compare) state.prongMm = compare.prongMm;
  return { kind, stone: { ...stone }, stoneKey, imported: imported && { ...imported }, params: session.stone, state, band: structuredClone(band), bandMetal };
}
const designKey = (s: DesignSnap) => JSON.stringify([s.kind, s.stone.label, s.stone.shapeName, s.stone.measured.longMm, s.stone.measured.widthMm, s.stone.depthMm, s.state, s.band, s.bandMetal]);
function historyCommit() {
  clearTimeout(histTimer);
  histTimer = 0;
  if (!historyOn || histHold) return;
  const s = captureDesign();
  if (!s) return;
  hist.commit(s, designKey(s));
  renderHistory();
}
/** 形が変わったら、少し待って覚える（つまみを動かしている間は 1 つにまとめる。断面を描いている間は待つ） */
function historySoon() {
  if (!historyOn || histHold) return;
  clearTimeout(histTimer);
  histTimer = window.setTimeout(() => (holdPanel ? historySoon() : historyCommit()), 400);
}
/** Claude の作業の間は覚えず、終わったら 1 つにまとめる */
function historyBegin(): number {
  historyCommit();
  histHold = true;
  renderHistory();
  return hist.mark();
}
function historyEnd(mark: number, generated: boolean) {
  histHold = false;
  historyCommit();
  if (generated) hist.endGeneration(mark);
  renderHistory();
}
function renderHistory() {
  const undo = document.querySelector<HTMLButtonElement>(".act-undo");
  const redo = document.querySelector<HTMLButtonElement>(".act-redo");
  if (undo) undo.disabled = making || !hist.canUndo;
  if (redo) redo.disabled = making || !hist.canRedo;
  const pill = $(".gen-swap");
  const label = making ? null : hist.generationLabel;
  pill.hidden = !label;
  pill.textContent = label ?? "";
}
/** 覚えた設計へ移る（形も石も、そのまま） */
function applyDesign(s: DesignSnap) {
  stopIntro();
  clearTimeout(histTimer);
  histTimer = 0;
  compare = null;
  stone = { ...s.stone };
  stoneKey = s.stoneKey;
  imported = s.stoneKey === "imported" ? stone : s.imported && { ...s.imported };
  keptPhoto = null;
  keptImportedPhoto = null;
  $<HTMLInputElement>(".in-long").value = String(Number(stone.longMm.toFixed(2)));
  $<HTMLInputElement>(".in-depth").value = String(Number(stone.depthMm.toFixed(2)));
  $(".stone-sub").textContent = `${stone.shapeName}・${stone.measured.longMm.toFixed(2)} × ${stone.measured.widthMm.toFixed(2)} mm`;
  drawThumb();
  renderStoneButtons();
  if (!session || session.stone !== s.params) {
    session = newSession(stone.measured, stone.depthMm);
    s.params = session.stone;
  }
  session.state = structuredClone(s.state);
  band = structuredClone(s.band);
  bandMetal = s.bandMetal;
  // 見比べられるように、カメラを動かさない
  clearTimeout(keepCamTimer);
  viewer.keepCamera = true;
  if (s.kind !== kind) setKind(s.kind);
  else if (kind === "band") showBand();
  else session.build("戻す・進む");
  keepCamTimer = window.setTimeout(() => (viewer.keepCamera = false), 2500);
  // 組み直した状態を、この場所の覚えにする（あとで「変わった」と数えて、進む先を消さないように）
  clearTimeout(histTimer);
  histTimer = 0;
  const now = captureDesign();
  if (now) hist.replaceCurrent(now, designKey(now));
}
function stepHistory(dir: "undo" | "redo") {
  if (making) return;
  historyCommit();
  const s = dir === "undo" ? hist.undo() : hist.redo();
  if (s) applyDesign(s);
  renderHistory();
}
document.querySelector(".act-undo")?.addEventListener("click", () => stepHistory("undo"));
document.querySelector(".act-redo")?.addEventListener("click", () => stepHistory("redo"));
$(".gen-swap").addEventListener("click", () => {
  if (making) return;
  historyCommit();
  const before = hist.generationLabel === "生成の前に戻す";
  const s = hist.toggleGeneration();
  if (!s) return;
  applyDesign(s);
  renderHistory();
  setStatus(before ? "生成の前に戻しました。もう一度押すと、生成のあとに戻ります。" : "生成のあとに戻しました。");
});
if (historyOn) {
  /** 字を打ったばかりの欄（その間は、字の取り消しのまま） */
  const typed = new WeakSet<EventTarget>();
  /** 断面の編集の中を最後に押したか（その間は ⌘Z を断面の編集へ） */
  let inSection = false;
  document.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement | null;
    if (!t) return;
    // 字を全部取り消したら、次の ⌘Z は設計へ（ブラウザの「閉じたタブを開く」へ行かないように）
    if ((e as InputEvent).inputType === "historyUndo" && !t.value) typed.delete(t);
    else typed.add(t);
  });
  document.addEventListener("focusout", (e) => e.target && typed.delete(e.target));
  document.addEventListener("pointerdown", (e) => (inSection = !!(e.target as HTMLElement).closest?.(".sec-edit")), true);
  document.addEventListener("keydown", (e) => {
    const act = undoKey(e);
    if (!act) return;
    const el = e.target as HTMLElement & { type?: string };
    if (isTextField(el) && typed.has(el)) return;
    // 戻すものがないときも、ブラウザの「閉じたタブを開く」へ行かせない
    e.preventDefault();
    const why = document.querySelector<HTMLElement>(".why");
    if (document.querySelector("dialog[open]") || (why && !why.hidden)) return;
    if (inSection) {
      const b = document.querySelector<HTMLButtonElement>(`.sec-edit ${act === "undo" ? ".se-undo" : ".se-redo"}`);
      if (b && !b.disabled && b.offsetParent) return b.click();
    }
    stepHistory(act);
  });
}

/** 手で変える欄を開いて、確かめるへ（合言葉がなくても、ここから続けられる） */
function toManual() {
  manualOpen = true;
  setMode("refine");
  // 質問や帳面の欄の下に隠れないよう、手で変える欄まで動かす
  const m = document.querySelector<HTMLDetailsElement>(".studio-refine details.manual");
  if (m) {
    m.open = true;
    requestAnimationFrame(() => m.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}
document.querySelector(".make-next")?.addEventListener("click", toManual);

/**
 * 表せなかった希望の札。Claude の作業の欄の中に、ふつうの行として出す（全文が読め、閉じられる）。
 * 前は 3D の下に浮かせていて、スマホでは入力欄に重なり、下が切れて読めなかった（2026-11-05 作者）
 */
function showCannot(text: string) {
  const el = $(".cannot-note");
  el.hidden = !text;
  el.querySelector("p")!.textContent = text ? `まだできないこと：${text}` : "";
  if (text) requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" }));
}
$(".cn-close").addEventListener("click", () => showCannot(""));

// ---- 確かめる。：作れるか。直す所は短く ----
const SHORT: Record<string, string> = {
  "prong-thin": "爪が細い",
  "finger-gap": "石が指に近い",
  "tip-height": "爪の先の高さ",
  hold: "爪が石を押さえる力が足りない",
  "prong-gap": "爪と爪の間が広い",
  corner: "角が守られていない",
  "bezel-wall": "覆輪の壁が薄い",
  "band-thin": "腕が薄い",
  "band-narrow": "腕の幅が細い",
  "band-spike": "腕の断面が尖りすぎ",
  "band-relief": "腕の彫りの下の地金が薄い",
  "band-valley": "断面の溝の底が薄い",
  "stone-space": "となりの石と近すぎる",
  "metal-space": "石座の間のすき間が狭い",
  "collar-wall": "石座の下の輪の板が薄い",
  "band-end": "腕の端が石座に届いていない",
  "tension-gap": "腕の開きが作れない",
  "tension-cut": "溝で腕が切れる",
  "tension-lip": "溝の高さが腕に収まらない",
  "tension-girdle": "石の縁が溝に入らない",
  "tension-pit": "くぼみの両わきに地金が残らない",
  "tension-culet": "石の先が指の側へ出る",
  "tension-sunk": "石が腕に沈む",
  "tension-overhang": "石が腕の幅から出すぎる",
  "tsuchime-thin": "槌目を打つには腕が薄い",
  "milgrain-fit": "ミルの粒が腕の縁に収まらない",
};
function grouped(b: Built) {
  const groups = new Map<string, { p: (typeof b.problems)[number]; n: number }>();
  for (const p of b.problems) {
    const g = groups.get(p.check);
    if (g) g.n++;
    else groups.set(p.check, { p, n: 1 });
  }
  return [...groups.values()];
}
// ---- 職人の決まりを外して比べる：公開情報だけで組んだ形と、職人の決まりで組んだ形 ----
/** 比べている間：職人の決まりで組んだときの数字（戻すときの爪の太さも） */
let compare: { prongMm?: number; nums: CompareNums } | null = null;
interface CompareNums {
  prong: string;
  height: string;
  gap: string;
  weight: string;
  probs: number;
}
/** いま組むのに使う帳面（比べている間は、公開情報の目安だけ） */
function ledgerNow() {
  return compare ? seedLedger() : store.ledger();
}
function numsOf(b: Built): CompareNums {
  const r = b.ring;
  const mm = r.setting.prongs[0]?.diameterMm;
  return {
    prong: r.setting.style === "prong" && mm ? `${mm.toFixed(2)} mm × ${r.setting.prongs.length}` : r.setting.tension ? "テンション" : "覆輪",
    height: `${r.setting.heights.heightAboveFingerMm.toFixed(2)} mm`,
    gap: `${r.culetGapMm.toFixed(2)} mm`,
    weight: `約 ${r.metalWeightG.toFixed(1)} g`,
    probs: grouped(b).length,
  };
}
function setCompare(on: boolean) {
  if (!session?.built || kind !== "solitaire") return;
  if (on && !compare) {
    compare = { prongMm: session.state.prongMm, nums: numsOf(session.built) };
    // 公開情報だけなら、どう組むか（爪の太さはその目安の標準から。留まりが足りなければ、これまでどおり太くする）
    session.state.prongMm = undefined;
    tuneProngs();
    session.build("職人の決まりを外した（公開情報の目安だけ）");
  } else if (!on && compare) {
    session.state.prongMm = compare.prongMm;
    compare = null;
    session.build("職人の決まりに戻した");
  }
  renderCheck();
}
// ---- 工房ごとの帳面：使う帳面を切り替える・工房を足す・同じ指輪を工房ごとに比べる ----
function workshopBarHtml(): string {
  if (kind !== "solitaire") return "";
  const ws = store.workshops();
  const mainName = bookLabel(store.mainLedger());
  const opts = [`<option value="${MAIN}"${ws.active === MAIN ? " selected" : ""}>${esc(bookTitle(mainName))}</option>`, ...ws.list.map((w) => `<option value="${esc(w.id)}"${ws.active === w.id ? " selected" : ""}>${esc(bookTitle(w.name))}</option>`)];
  const hasSample = ws.list.some((w) => w.sample);
  return `<section class="ws-bar"><label><span>使う帳面</span><select class="ws-pick">${opts.join("")}<option value="__new">＋ 工房の帳面を作る</option>${hasSample ? "" : `<option value="__sample">＋ 見本の工房を足す（${esc(GUIDES.prong.sampleWorkshop.name)}）</option>`}</select></label>
    <div class="ws-new" hidden><input class="ws-name" type="text" placeholder="工房の名前（例：工房 C）"><button type="button" class="primary ws-make">作る</button></div>
    ${workshopBasicsHtml()}
    ${ws.list.length ? `<button type="button" class="ghost-d ws-cmp">同じ指輪を、帳面ごとに比べる</button>` : `<p class="hint">工房の帳面を作ると、同じ指輪を工房ごとの決まりで確かめられます。</p>`}
    ${ws.list.length && !filming() ? `<a class="link ws-edit" href="app.html#ledger">この帳面の決まりを見る・直す →</a>` : ""}
    <div class="ws-table"></div></section>`;
}
const PRONG_TIP_LABEL: Record<ProngTip, string> = { round: "丸い爪", oni: "尖り爪" };
const PRONG_TIP_PICK = "爪の形";
const PRONG_TIP_NOTE: Record<ProngTip, string> = {
  round: "先を丸めた、シンプルな爪",
  oni: "先が尖り、石の上に少しかかる爪。シャープに見える。尖り具合は仮の目安・最後は職人が決める",
};
/** 工房のベーシックの雰囲気：爪の形と太さ。工房ごとの既定で、ここで直せる。爪の太さは帳面の決まりなので、はじめの帳面は決まりの画面で直す */
function workshopBasicsHtml(): string {
  const ws = store.workshops();
  const w = ws.list.find((x) => x.id === ws.active);
  const tip: ProngTip = store.ledger().basics?.prongTip ?? "round";
  const now = session?.built?.ring.setting;
  const std = now?.style === "prong" ? now.standardProngMm : undefined;
  return `<div class="ws-basics"><p class="ws-b-h"><b>この工房のベーシック</b><small>いつもの雰囲気の既定。あとで直せます</small></p>
    <div class="seg ws-tip" role="group" aria-label="爪の形（工房の既定）">${(["round", "oni"] as const).map((v) => `<button type="button" data-tip="${v}" aria-pressed="${v === tip}">${PRONG_TIP_LABEL[v]}</button>`).join("")}</div>
    ${w ? `<label class="ws-b-mm"><span>爪の太さ（大きな石の標準）</span><span class="in"><input class="ws-mm" type="number" inputmode="decimal" min="0.5" max="2" step="0.05" value="${(prongBasicMm(store.ledger()) ?? std ?? GUIDES.prong.sampleWorkshop.prongMm).toFixed(2)}"><i>mm</i></span></label>` : std !== undefined ? `<p class="hint">爪の太さは帳面の決まりから（この石で標準 ø ${std.toFixed(2)} mm）。</p>` : ""}
    ${w?.sample ? `<p class="hint ws-sample">${esc(w.name)}${/[A-Za-z0-9]$/.test(w.name) ? " " : ""}は見本の工房です。爪の太さと形は雰囲気の例で、本当の工房の値ではありません。目安・最後は職人が決めます。</p>` : ""}</div>`;
}
function switchLedger(id: string) {
  store.setWorkshops(setActive(store.workshops(), id));
  if (!session) return;
  session.state.prongMm = undefined;
  // 爪の形も、切り替えた帳面のベーシックへ
  session.state.prongTip = undefined;
  tuneProngs();
  session.build("帳面を切り替えた");
  lastRule = null;
  pastCheck = null;
  renderCheck();
  const ws = store.workshops();
  const label = bookTitle(ws.active === MAIN ? bookLabel(store.mainLedger()) : (ws.list.find((w) => w.id === ws.active)?.name ?? "工房"));
  toast(`${label}で確かめ直しました`);
}
const ASK_LATER_KEY = "tsugu.askLater";
/** 今見せている質問の順番（「次の質問」で進む） */
let askIndex = 0;

/**
 * Claude が聞きに来る：確かめる場面で、今の設計に関わる「帳面に足りない所」を 1 つ出す（2026-11-05 作者：帳面まで見に行くのは遠い）。
 * 今の石の大きさの爪の点がなければそれを、なければ次の質問を。撮影（?rec）では、?ask があるときだけ出す
 */
function askNudgeHtml(b: Built): string {
  const q = new URLSearchParams(location.search);
  if (q.has("rec") && !q.has("ask")) return "";
  const gaps = ringGaps(store.ledger());
  if (!gaps.length) return "";
  let later = false;
  try {
    later = !!sessionStorage.getItem(ASK_LATER_KEY);
  } catch {
    /* 読めなければ、出す */
  }
  // 「あとで」のあとも消さない：数と「見る」を残す。暇なときに答え続けられるように（2026-11-05 作者）
  if (later) return `<button type="button" class="ghost-d ask-again">Claude から質問が ${gaps.length} 個あります ・ 見る</button>`;
  const size = stoneSizeMm(b.ring.params.stone.longMm, b.ring.params.stone.widthMm);
  const near = gaps
    .filter((g) => g.stoneMm !== undefined && Math.abs(g.stoneMm - size) <= 1.5)
    .sort((x, y) => Math.abs(x.stoneMm! - size) - Math.abs(y.stoneMm! - size));
  const ordered = [...near, ...gaps.filter((g) => !near.includes(g))];
  const at = ((askIndex % ordered.length) + ordered.length) % ordered.length;
  const g = ordered[at];
  const isNear = near.includes(g);
  // 一般の「足りない所があります」は、題の「Claude から質問」と同じことを言うだけなので出さない（2026-11-07）
  const why = isNear ? `この指輪の石（${size.toFixed(1)} mm）に近い大きさの決まりが、帳面に足りません。` : "";
  const moves = ordered.length > 1 && !q.has("rec") ? `<button type="button" class="ghost-d ask-prev" aria-label="前の質問">← 前</button><span class="ask-pos">${at + 1} / ${ordered.length}</span><button type="button" class="ghost-d ask-next" aria-label="次の質問">次 →</button>` : "";
  return `<section class="ask-nudge"><small>Claude から質問</small><b>${esc(g.question)}</b>${why ? `<p>${why}</p>` : ""}<div class="row"><a class="primary" href="app.html#ledger/ask?gap=${encodeURIComponent(g.id)}">答える</a><button type="button" class="ghost-d ask-later">あとで</button>${moves}</div></section>`;
}

/** 質問の札の押す所をつなぐ（札を入れ替えたあとも、もう一度呼ぶ） */
function wireAskNudge(box: HTMLElement, b: Built) {
  const swap = () => {
    const el = box.querySelector(".ask-nudge, .ask-again");
    if (!el) return;
    el.outerHTML = askNudgeHtml(b);
    wireAskNudge(box, b);
  };
  const setLater = (on: boolean) => {
    try {
      if (on) sessionStorage.setItem(ASK_LATER_KEY, "1");
      else sessionStorage.removeItem(ASK_LATER_KEY);
    } catch {
      /* 覚えられなくても、今は入れ替える */
    }
    swap();
  };
  box.querySelector(".ask-later")?.addEventListener("click", () => setLater(true));
  box.querySelector(".ask-again")?.addEventListener("click", () => setLater(false));
  box.querySelector(".ask-next")?.addEventListener("click", () => {
    askIndex += 1;
    swap();
  });
  box.querySelector(".ask-prev")?.addEventListener("click", () => {
    askIndex -= 1;
    swap();
  });
}

function workshopTable(): string {
  if (!session?.built) return "";
  const state = session.snapshot();
  const rows: [string, Ledger][] = [["公開情報だけ", seedLedger()], [bookLabel(store.mainLedger()), store.mainLedger()], ...store.workshops().list.map((w) => [w.name, w.ledger] as [string, Ledger])];
  return `<table><thead><tr><th>帳面</th><th>爪の太さと形</th><th>作れない所</th></tr></thead><tbody>${rows
    .map(([name, led]) => {
      // 帳面を切り替えたときと同じ順で組む（前は別の太くし方で、表と切り替えた後の爪の太さがちがった）
      const b = underLedger(session!.stone, state, led);
      const st = b.ring.setting;
      return `<tr><th>${esc(name)}</th><td>${st.tension ? tensionWord(st) : st.style === "bezel" ? `覆輪 ・ 壁 ${st.bezel?.wallMm.toFixed(2)} mm` : `${prongDiaWord(st)} × ${st.prongs.length} ・ ${PRONG_TIP_LABEL[st.prongTip]}`}</td><td>${grouped(b).length}</td></tr>`;
    })
    .join("")}</tbody></table><p class="hint">同じ石・同じ形を、帳面だけ替えて組んだ結果です（爪の太さと形は、それぞれの帳面の標準から）。目安・最後は職人が決めます。</p>`;
}
function bindWorkshops(box: HTMLElement) {
  const pick = box.querySelector<HTMLSelectElement>(".ws-pick");
  if (!pick) return;
  pick.addEventListener("change", () => {
    if (pick.value === "__new") {
      box.querySelector<HTMLElement>(".ws-new")!.hidden = false;
      box.querySelector<HTMLInputElement>(".ws-name")!.focus();
      return;
    }
    if (pick.value === "__sample") {
      store.setWorkshops(addSampleWorkshop(store.workshops(), seedLedger(), today()));
      switchLedger(store.workshops().active);
      return;
    }
    switchLedger(pick.value);
  });
  // 工房のベーシック：帳面に書いて、今の指輪も組み直す（この設計で手で選んだ形より、いま直した既定を見せる）
  const rebuildBasics = () => {
    if (!session) return renderCheck();
    session.state.prongMm = undefined;
    session.state.prongTip = undefined;
    tuneProngs();
    session.build("工房のベーシックを直した");
    renderCheck();
  };
  box.querySelectorAll<HTMLButtonElement>(".ws-tip button").forEach((b) =>
    b.addEventListener("click", () => {
      store.setLedger(setBasics(store.ledger(), { prongTip: b.dataset.tip as ProngTip }));
      rebuildBasics();
    }),
  );
  box.querySelector<HTMLInputElement>(".ws-mm")?.addEventListener("change", (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v) || v < 0.5 || v > 2) return renderCheck();
    store.setLedger(setProngBasic(store.ledger(), v, today()));
    rebuildBasics();
  });
  box.querySelector(".ws-make")?.addEventListener("click", () => {
    const name = box.querySelector<HTMLInputElement>(".ws-name")!.value.trim() || "新しい工房";
    store.setWorkshops(addWorkshop(store.workshops(), name, seedLedger()));
    switchLedger(store.workshops().active);
  });
  box.querySelector(".ws-cmp")?.addEventListener("click", () => {
    box.querySelector(".ws-table")!.innerHTML = workshopTable();
  });
}
function compareHtml(): string {
  if (kind !== "solitaire") return "";
  const has = activeRules(store.ledger()).some((r) => r.source.kind === "craftsman" && r.param);
  if (!has) return "";
  if (!compare) return `<button type="button" class="ghost-d compare-btn">職人の決まりを外して比べる</button>`;
  const pub = session?.built ? numsOf(session.built) : null;
  const c = compare.nums;
  const row = (k: string, a: string, b: string) => `<tr${a !== b ? ` class="diff"` : ""}><th>${k}</th><td>${esc(b)}</td><td>${esc(a)}</td></tr>`;
  return `<section class="compare"><p class="cmp-k">いまは、公開情報の目安だけで組んでいます（職人の決まりを外しています）</p>
    ${pub ? `<table><thead><tr><th></th><th>公開情報だけ</th><th>${esc(bookLabel(store.ledger()))}の決まり</th></tr></thead><tbody>${row("爪", c.prong, pub.prong)}${row("指から上", c.height, pub.height)}${row("石と指のすき間", c.gap, pub.gap)}${row("地金の重さ", c.weight, pub.weight)}${row("作れない所", String(c.probs), String(pub.probs))}</tbody></table>` : ""}
    <button type="button" class="primary compare-back">${esc(bookLabel(store.ledger()))}の決まりに戻す</button></section>`;
}
// ---- 一言が、どこまで効くか：よくある 270 の設計に、職人の決まりを当てる ----
const SW = { w: 720, h: 260, l: 44, r: 16, t: 14, b: 34, x0: 1.5, x1: 14, y0: 0.3, y1: 2.0 };
const swX = (mm: number) => SW.l + ((mm - SW.x0) / (SW.x1 - SW.x0)) * (SW.w - SW.l - SW.r);
const swY = (mm: number) => SW.h - SW.b - ((mm - SW.y0) / (SW.y1 - SW.y0)) * (SW.h - SW.t - SW.b);
function sweepDot(r: SweepResult): string {
  const size = (r.design.stone.longMm + r.design.stone.widthMm) / 2;
  return `<circle cx="${swX(size).toFixed(1)}" cy="${swY(r.after.prongMm).toFixed(1)}" r="2.2"/>`;
}
/** 石の大きさと爪の最低の太さ：公開情報の線と、職人の決まりの線。職人が言った点に、その言葉を添える */
function sweepChartHtml(): string {
  const rule = activeRules(store.ledger()).find((r) => r.param === "prong.minDiameterMm" && r.source.kind === "craftsman");
  const xs = Array.from({ length: 51 }, (_, i) => SW.x0 + ((SW.x1 - SW.x0) * i) / 50);
  const line = (f: (x: number) => number) => xs.map((x, i) => `${i ? "L" : "M"}${swX(x).toFixed(1)} ${swY(Math.min(SW.y1, f(x))).toFixed(1)}`).join("");
  const pub = line((x) => minProngMm(x));
  const craft = rule ? line((x) => valueFor(rule, x) ?? 0) : "";
  const pts = rule?.bySizeLine ? (rule.bySize ?? []).filter((s) => s.upToMm !== null) : [];
  const ticksX = [2, 4, 6, 8, 10, 12, 14].map((v) => `<line class="g" x1="${swX(v)}" x2="${swX(v)}" y1="${SW.t}" y2="${SW.h - SW.b}"/><text class="ax" x="${swX(v)}" y="${SW.h - SW.b + 14}" text-anchor="middle">${v}</text>`).join("");
  const ticksY = [0.5, 1.0, 1.5, 2.0].map((v) => `<line class="g" x1="${SW.l}" x2="${SW.w - SW.r}" y1="${swY(v)}" y2="${swY(v)}"/><text class="ax" x="${SW.l - 6}" y="${swY(v) + 3.5}" text-anchor="end">${v.toFixed(1)}</text>`).join("");
  const lab = (x: number, y: number, t: string, cls: string) => `<text class="${cls}" x="${swX(x).toFixed(1)}" y="${swY(y).toFixed(1)}">${esc(t)}</text>`;
  return `<figure class="sw-chart"><svg viewBox="0 0 ${SW.w} ${SW.h}" role="img" aria-label="石の大きさと爪の最低の太さ">
    ${ticksX}${ticksY}
    <text class="ax" x="${SW.w - SW.r}" y="${SW.h - 4}" text-anchor="end">石の大きさ（mm）</text><text class="ax" x="${SW.l}" y="${SW.t - 3}">爪の太さ（mm）</text>
    <path class="pub" d="${pub}"/>${lab(11.2, Math.min(SW.y1, minProngMm(11.2)) + 0.08, "公開情報の最低", "lp")}
    ${craft ? `<path class="craft" d="${craft}"/>${lab(11.2, (valueFor(rule!, 11.2) ?? 0) - 0.12, `${bookLabel(store.ledger())}の最低`, "lc")}` : ""}
    <g class="sw-dots"></g>
    ${pts.map((p) => `<circle class="said" cx="${swX(p.upToMm!)}" cy="${swY(p.value)}" r="5"/><text class="ls" x="${swX(p.upToMm!) + 8}" y="${swY(p.value) - 8}">「${p.upToMm! < 4 ? "メレだと" : "このサイズなら"} ${p.value} mm」</text>`).join("")}
  </svg><figcaption>職人が言った 2 つの点（●）から、どの大きさの石にも効く線ができます。小さな点は、270 の設計の爪（この線から組んだ太さ）。言葉が増えるほど、線は細かくなります。</figcaption></figure>`;
}
function openSweep() {
  let el = document.querySelector<HTMLElement>(".sweep");
  if (!el) {
    el = document.createElement("div");
    el.className = "sweep";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "よくある設計に当てる");
    document.body.appendChild(el);
  }
  const ds = sweepDesigns();
  const name = bookLabel(store.ledger());
  const poly = (d: SweepDesign) => {
    const k = 15 / Math.max(d.preset.longMm, d.preset.widthMm);
    return d.stone.outlineMm.map((p) => `${(20 + (p.x / d.scale) * k).toFixed(1)},${(20 - (p.y / d.scale) * k).toFixed(1)}`).join(" ");
  };
  el.innerHTML = `<div class="sw-in"><button type="button" class="sw-close" aria-label="閉じる">×</button>
    <p class="sw-k">${esc(name)}の決まりを、よくある設計に当てる</p>
    <h2>石の形 6 × 大きさ 5 × 高さ 3 × 号 3 ＝ ${ds.length} の設計</h2>
    <p class="sw-sub">それぞれを、公開情報の目安だけで組んだときと、${esc(name)}の決まりで組んだときで比べます（どちらも同じ計算。爪の太さは帳面の標準から）。</p>
    <div class="sw-stats"><div><b class="sw-n">0</b><small>確かめた設計</small></div><div><b class="sw-c">0</b><small>爪が細くなった ・ 太くなった</small></div><div><b class="sw-p">—</b><small>爪の太さの平均</small></div><div><b class="sw-w">—</b><small>地金の重さの合計</small></div></div>
    ${sweepChartHtml()}
    <div class="sw-grid">${ds.map((d, i) => `<i class="t" data-i="${i}" title="${esc(d.preset.name)} ${d.stone.longMm.toFixed(1)} mm ・ ${({ low: "低め", standard: "標準", high: "高め" } as const)[d.height]} ・ ${d.gou} 号"><svg viewBox="0 0 40 40"><polygon points="${poly(d)}"/></svg><span></span></i>`).join("")}</div>
    <p class="sw-note">数字は目安の比べ。最後は職人が決めます。</p></div>`;
  el.hidden = false;
  el.scrollTop = 0;
  let stop = false;
  const close = () => {
    stop = true;
    el!.hidden = true;
  };
  el.querySelector(".sw-close")!.addEventListener("click", close);
  const pub = seedLedger();
  const craft = store.ledger();
  const results: SweepResult[] = [];
  let i = 0;
  const step = () => {
    if (stop) return;
    const t0 = performance.now();
    while (i < ds.length && performance.now() - t0 < 40) {
      const r = sweepOne(ds[i], pub, craft);
      results.push(r);
      const t = el!.querySelector<HTMLElement>(`.t[data-i="${i}"]`)!;
      const d = r.after.prongMm - r.before.prongMm;
      t.classList.add(Math.abs(d) > 0.01 ? (d < 0 ? "thin" : "thick") : "same");
      t.querySelector("span")!.textContent = r.after.prongMm.toFixed(2);
      const dots = el!.querySelector(".sw-dots");
      if (dots) dots.insertAdjacentHTML("beforeend", sweepDot(r));
      t.title += `\n爪 ${r.before.prongMm.toFixed(2)} → ${r.after.prongMm.toFixed(2)} mm ・ ${r.before.weightG.toFixed(1)} → ${r.after.weightG.toFixed(1)} g`;
      i++;
    }
    const s = summarize(results);
    el!.querySelector(".sw-n")!.textContent = String(s.total);
    el!.querySelector(".sw-c")!.textContent = `${s.thinner} ・ ${s.thicker}`;
    el!.querySelector(".sw-p")!.textContent = `${s.prongBefore.toFixed(2)} → ${s.prongAfter.toFixed(2)} mm`;
    el!.querySelector(".sw-w")!.textContent = `${s.weightDiffG > 0 ? "+" : "−"}${Math.abs(s.weightDiffG).toFixed(1)} g`;
    if (i < ds.length) setTimeout(step, 0);
    else {
      el!.querySelector(".sw-in")!.classList.add("done");
      const thick = results.filter((r) => r.after.prongMm > r.before.prongMm + 0.01);
      if (thick.length) {
        const max = Math.max(...thick.map((r) => (r.design.stone.longMm + r.design.stone.widthMm) / 2));
        el!.querySelector(".sw-note")!.textContent = `太くなった ${thick.length} の設計は、石の大きさ ${max.toFixed(1)} mm 以下の小さめの石。決まりが「この大きさの石なら 0.7 mm」を小さめの石にも当てているため。小さめの石の太さは、職人に聞いて決まりに足します。数字は目安の比べ。最後は職人が決めます。`;
      }
    }
  };
  setTimeout(step, 400);
}
/** 留め方の型：4 本爪・6 本爪・V 字の爪（尖った角のある石だけ）・覆輪 */
type Pattern = "3" | "4" | "5" | "6" | "v" | "bezel" | "tension";
/** テンションの一言（留め方の札） */
function tensionWord(st: SettingResult): string {
  return `テンション ・ 開き ${st.tension!.gapMm.toFixed(2)} mm`;
}
/** 見せるに出す、テンションの職人の言葉の決まり */
const TENSION_RULE_ID = "rule-tension-depth-ishikawa";
/**
 * 爪の本数が、石の形に対して不自然に見えるとき、その一言（なければ空）。作れるかどうかとは別の、見た目の注意。
 * 作者の声：四角い石に 6 本爪などは、問題はないが不自然（2026-11-04）
 */
function prongCountNote(b: Built): string {
  const st = b.ring.setting;
  if (st.style !== "prong") return "";
  const n = st.prongs.length;
  const c = st.corners.length;
  if (c >= 3 && n !== c && n !== c * 2) return `角が ${c} つの石に、爪 ${n} 本`;
  if (c === 0 && n === 5) return "丸い形の石に、爪 5 本";
  return "";
}
const PATTERNS: [Pattern, string][] = [["3", "3 本爪"], ["4", "4 本爪"], ["6", "6 本爪"], ["v", "V 字の爪"], ["bezel", "覆輪"], ["tension", "テンション"]];
/** 留め方の札。今の爪の本数が 3・4・6 のどれでもなければ（5 本など）、その本数の札も足して、いつも 1 つが選ばれて見えるように */
function patternsFor(b: Built): [Pattern, string][] {
  const st = b.ring.setting;
  const n = st.style === "prong" && !st.prongs.some((p) => p.isV) ? st.prongs.length : 0;
  const list = PATTERNS.filter(([v]) => v !== "v");
  if (n && !list.some(([v]) => v === String(n))) {
    // 本数の順に入れる（3・4・5・6）
    const at = list.findIndex(([v]) => !/^\d$/.test(v) || Number(v) > n);
    list.splice(at, 0, [String(n) as Pattern, `${n} 本爪`]);
  }
  return list;
}
/** 撮影の絵は前の腕の断面の名前のまま（前の動画とそろえる） */
const FILM_SECTION_LABEL: Record<ShankSection, string> = { kouman: "甲丸", hirauchi: "平打ち", hangouman: "半甲丸", kaku: "角", maru: "丸線", free: "自由な線" };
function patternOf(b: Built): Pattern | "" {
  const st = b.ring.setting;
  if (st.style === "bezel") return "bezel";
  if (st.style === "tension") return "tension";
  if (st.prongs.some((p) => p.isV)) return "v";
  return String(st.prongs.length) as Pattern;
}
const round2 = (v: number) => Math.round(v * 100) / 100;
/** 「手で変える」を人が開いた・閉じたか（一度触ったら、描き直してもそのまま。触る前は、作れない所がなければ開く） */
let manualOpen: boolean | null = null;
/** 断面を描いている間は、確かめるのパネルを描き直さない（描き直すと、指で押さえている点が消える） */
let holdPanel = false;
/** 確かめるの数のつまみ（爪の太さ・号） */
function prongSlider(b: Built): SliderSpec {
  // 1 本ずつ太さを決めた爪があるときは、決めていない爪の太さを出す（このつまみは全部の爪の太さ）
  const ps = b.ring.setting.prongs;
  const plain = ps.find((_, i) => !session?.state.prongEdits?.[i]?.diameterMm) ?? ps[0];
  return { cls: "r-prong", label: "爪の太さ", min: 0.4, max: 1.6, step: 0.05, value: plain?.diameterMm ?? 0.8, unit: "mm" };
}
/** 爪の太さの言葉。1 本ずつ変えた爪があれば、細い方〜太い方 */
function prongDiaWord(st: Built["ring"]["setting"]): string {
  const ds = st.prongs.map((p) => p.diameterMm);
  if (!ds.length) return "";
  const lo = Math.min(...ds);
  const hi = Math.max(...ds);
  return hi - lo > 1e-6 ? `ø ${lo.toFixed(2)}〜${hi.toFixed(2)} mm` : `ø ${lo.toFixed(2)} mm`;
}
function stoneSlider(): SliderSpec {
  return { cls: "r-stone", label: "石の大きさ", min: STONE_LONG_RANGE.min, max: STONE_LONG_RANGE.max, step: 0.1, value: Number((session?.stone.longMm ?? 8).toFixed(1)), unit: "mm" };
}
/**
 * 石を同じ形のまま大きく・小さくする（長辺 mm）。爪の太さは手で決めた値を外し、帳面の決まりで決め直す。
 * 石が大きくなれば爪も変わるのを、その場で見られるように（作者の声：動画の中でなく、本当にできる画面で）。
 */
function resizeStone(longMm: number, final: boolean) {
  if (!session || !stone) return;
  const k = longMm / session.stone.longMm;
  if (Math.abs(k - 1) < 1e-6) return;
  const scale = (pts: readonly { x: number; y: number }[]) => pts.map((q) => ({ x: q.x * k, y: q.y * k }));
  session.stone = { ...session.stone, outlineMm: scale(session.stone.outlineMm), longMm: session.stone.longMm * k, widthMm: session.stone.widthMm * k, depthMm: session.stone.depthMm * k };
  stone.measured = { ...stone.measured, outlineMm: scale(stone.measured.outlineMm), longMm: stone.measured.longMm * k, widthMm: stone.measured.widthMm * k };
  stone.longMm = session.stone.longMm;
  stone.depthMm = session.stone.depthMm;
  $<HTMLInputElement>(".in-long").value = stone.longMm.toFixed(2);
  $<HTMLInputElement>(".in-depth").value = stone.depthMm.toFixed(2);
  $(".stone-sub").textContent = `${stone.shapeName}・${stone.measured.longMm.toFixed(2)} × ${stone.measured.widthMm.toFixed(2)} mm`;
  session.state.prongMm = undefined;
  // 1 本ずつ決めた爪の太さは、前の石の大きさのもの
  session.state.prongEdits = session.state.prongEdits?.map((e) => {
    if (!e) return null;
    const { diameterMm: _d, ...rest } = e;
    return Object.keys(rest).length ? rest : null;
  });
  if (!session.state.prongEdits?.some(Boolean)) session.state.prongEdits = undefined;
  // 三石・横一列は、石の大きさに合わせて並べ直す（止めたときだけ。動かしている間は場所をそのまま）
  const lay = session.state.layout;
  if (final && (lay === "trio" || lay === "row")) session.arrange(lay);
  if (final) tuneProngs();
  // 細かい形への作り直し（少し後）でも寄せ直さないよう、しばらくカメラを止めておく
  clearTimeout(keepCamTimer);
  viewer.keepCamera = true;
  session.build(final ? "石の大きさを変えた" : "");
  keepCamTimer = window.setTimeout(() => (viewer.keepCamera = false), 2500);
}
let stoneLive = 0;
let keepCamTimer = 0;
/** 石座と腕の付け方を選ぶ所の名前と、ふたつの選び方の一行の説明（職人 石川の言葉 2026-11-04） */
const JOIN_PICK = "腕への付け方";
export const JOIN_LABEL: Record<JoinStyle, string> = { between: "腕の間に挟む", on: "腕の上にのせる" };
export const JOIN_NOTE: Record<JoinStyle, string> = {
  between: "腕のいちばん上を切り、腕の両はしの間に石座をはさんでロウ付けします。わりと基本の作り方（職人の言葉）",
  on: "腕の上に浅い溝を入れて、石座をのせてロウ付けします。だめではないが、あまり一般的ではない作り方（職人の言葉）",
};
function prongTipPickHtml(pick: <T extends string | number>(name: string, cur: T, list: [T, string][]) => string, cur: ProngTip): string {
  return `${pick(PRONG_TIP_PICK, cur, [["round", PRONG_TIP_LABEL.round], ["oni", PRONG_TIP_LABEL.oni]])}<ul class="pick-notes">${(["round", "oni"] as const).map((j) => `<li${j === cur ? ' class="on"' : ""}><b>${PRONG_TIP_LABEL[j]}</b>${esc(PRONG_TIP_NOTE[j])}</li>`).join("")}</ul>`;
}
/** 爪を押して直せることの案内と、直した爪の数 */
function prongHintHtml(b: Built): string {
  const st = session!.state;
  const n = b.ring.setting.prongs.filter((_, i) => st.prongEdits?.[i]).length;
  return `<p class="hint prong-hint">3D の爪を押すと、その爪だけ太さや先の形を直せます。${n ? `<br>1 本ずつ直した爪：${n} 本。` : ""}${n || st.prongLook ? ` <button type="button" class="link prong-reset-all">爪の形の直しを全部消す</button>` : ""}</p>`;
}
function joinPickHtml(pick: <T extends string | number>(name: string, cur: T, list: [T, string][]) => string, cur: JoinStyle): string {
  return `${pick(JOIN_PICK, cur, [["between", JOIN_LABEL.between], ["on", JOIN_LABEL.on]])}<ul class="pick-notes">${(["between", "on"] as const).map((j) => `<li${j === cur ? ' class="on"' : ""}><b>${JOIN_LABEL[j]}</b>${esc(JOIN_NOTE[j])}</li>`).join("")}</ul>`;
}
/** テンションの腕の丸線の太さ（幅と厚みを同じに） */
function wireSlider(b: Built): SliderSpec {
  return { cls: "r-wire", label: "腕の線の太さ", min: GUIDES.tension.wireMinMm, max: GUIDES.tension.wireMaxMm, step: 0.1, value: b.ring.shank.thicknessMm, unit: "mm" };
}
/** テンションの計算の表で見る硬さの状態（硬い状態が、この留め方の条件） */
/** 開いて読む欄のうち、開いているもの（形を作り直して欄を描き直しても、閉じない） */
const tnOpen = new Set<string>();
const GRIP_LABEL: Record<TensionGrip, string> = { short: "短い向きで挟む", long: "長い向きで挟む", corner: "角で挟む" };
/** 三角の石の挟む向きの言葉（作者の本物の指輪は、長い辺の両はしの角を挟む。2026-11-07） */
const GRIP_LABEL_TRI: Partial<Record<TensionGrip, string>> = { short: "角と辺を挟む", corner: "長い辺の両はしの角を挟む" };
const GRIP_NOTE_TRI: Partial<Record<TensionGrip, string>> = {
  short: "1 つの角をくぼみに、向かいの辺を溝に入れます。腕は石のいちばん狭い幅を挟みます",
  corner: "いちばん長い辺の両はしの角を、両方くぼみに入れます（作者の本物の指輪の向き）。残りの角は腕の幅の外へ出ます",
};
const gripLabel = (x: TensionGrip, info: { cornerCount: number }) => (info.cornerCount === 3 ? GRIP_LABEL_TRI[x] : undefined) ?? GRIP_LABEL[x];
const gripNote = (x: TensionGrip, info: { cornerCount: number }) => (info.cornerCount === 3 ? GRIP_NOTE_TRI[x] : undefined) ?? GRIP_NOTE[x];
const GRIP_NOTE: Record<TensionGrip, string> = {
  short: "石のいちばん狭い幅を腕で挟みます。長い向きは指に沿って、腕の幅の外へ出ます",
  long: "石の長い向きを腕で挟みます。腕の開きは広くなり、腕の幅の外へ出る所は小さくなります",
  corner: "向かい合う 2 つの角をくぼみに入れます。横にずれませんが、挟む力が角の先にかかります",
};
/** 腕の幅の注意（黄色・オレンジ。職人 石川の決まり 2026-11-06。作れない所ではない。赤は作れない所の方に出る） */
function narrowArmOf(b: Built): WidthNote | null {
  return shankWidthNote(b.ring.shank, session!.guides());
}
/** 腕の幅の注意の札（黄色・オレンジ）。止めていないことが分かる言葉で。職人の言葉があれば添える */
function widthNoteHtml(n: WidthNote | null, near = false): string {
  if (!n) return "";
  const r = craftRuleFor("band-narrow");
  const g = kind === "band" ? bandGuides() : session!.guides();
  const line = n.level === "orange" ? `${g.band.widthOrangeMm} mm より細い` : `${g.band.widthYellowMm} mm 以下`;
  return `<p class="look-note width-note w-${n.level}${near ? " near" : ""}"><b>${esc(n.where)} ${n.widthMm.toFixed(2)} mm</b>${esc(n.text)}。<small>${n.level === "orange" ? "オレンジ" : "黄色"}の注意（${line}）。止めません。作れない所には数えません。${!near && r?.quote ? `「${esc(r.quote)}」${esc(masterName(store.ledger()))}` : ""}</small></p>`;
}
/** 指示書の行：腕の幅の注意 */
function widthSpecRow(n: WidthNote | null): { label: string; value: string }[] {
  return n ? [{ label: n.level === "orange" ? "腕の幅（オレンジの注意）" : "腕の幅（黄色の注意）", value: `${n.where} ${n.widthMm.toFixed(2)} mm。${n.text}` }] : [];
}
/** 腕の断面の、鋳造では出ない細い溝（作れない所ではない。札を黄色にして、注意だけ出す） */
function handGrooveOf(b: Built): GrooveNote | null {
  return grooveNote(b.ring.shank, session!.guides());
}
/** 細い溝の黄色の注意。腕の薄さと間違えないよう「溝の幅」と書く。職人の言葉があれば添える */
function grooveNoteHtml(n: GrooveNote | null): string {
  if (!n) return "";
  const r = craftRuleFor("band-groove");
  return `<p class="look-note groove-note"><b>${esc(n.where)} ${n.widthMm.toFixed(2)} mm</b>${esc(n.text)}。<small>形はこのままでかまいません。${r?.quote ? `「${esc(r.quote)}」${esc(masterName(store.ledger()))}` : ""}</small></p>`;
}
/** 指示書の行：手で彫る溝 */
function grooveSpecRow(n: GrooveNote | null): { label: string; value: string }[] {
  return n ? [{ label: "手で彫る溝", value: `${n.where} ${n.widthMm.toFixed(2)} mm。${n.text}` }] : [];
}
/** 作れない所ではないが、職人に確かめること（札を緑にしない） */
function tensionCautionsOf(b: Built): TensionCaution[] {
  const st = b.ring.setting;
  if (!st.tension) return [];
  const g = session!.guides();
  return tensionCautions(st, tensionSpring(st, b.ring.shank, "hardened", g), springIdOf(session!.state.metal), g);
}
/**
 * テンションの札：まず結論（深さ・開き・入れ方・今の地金の数）。次に地金ごとの小さな表。
 * 式と前提と出典、気をつけることは、開いて読む（作者の声 2026-11-05：文章が読みにくい）
 */
function tensionCardHtml(b: Built): string {
  const r = b.ring;
  const info = r.setting.tension!;
  const g = session!.guides();
  const insert = tensionInsert(info);
  const mine = springIdOf(session!.state.metal);
  const table = tensionSpring(r.setting, r.shank, "hardened", g)!;
  const myRow = table.rows.find((x) => x.metal === mine)!;
  const facts: [string, string][] = [...info.ends.map((e): [string, string] => [e.kind === "pit" ? "角のくぼみ" : "辺の溝", `${e.depthMm.toFixed(2)} mm`]), ["開き（図面）", `${info.gapMm.toFixed(2)} mm`], ["石の先と指", `${r.culetGapMm.toFixed(2)} mm`]];
  const cautions = tensionCautionsOf(b);
  const row = (x: SpringRow) => {
    const name = `${esc(x.name)}${x.verdict === "tight" ? `<i class="tight">ぎりぎり</i>` : ""}`;
    const cells =
      x.shrinkMm === null
        ? `<td colspan="3" class="short">この腕のままでは開ききらない見込み（約 ${x.bentMm.toFixed(2)} mm 曲がりが残る）。腕の太さ・形を変えて組み直す</td>`
        : `<td>${x.shrinkMm.toFixed(2)}</td><td>${x.makeGapMm!.toFixed(2)}</td><td>${x.spreadMm!.toFixed(2)}</td>`;
    return `<tr class="${x.metal === mine ? "on" : ""}"><th>${name}</th>${cells}</tr>`;
  };
  const slide = table.slides ? `<p>横から滑らせるなら、開くのは締まりの分だけ。小さめに作れる量：${table.rows.map((x) => `${esc(x.name)} ${x.slideShrinkMm!.toFixed(2)}`).join("・")} mm（仮）</p>` : "";
  const basis = table.rows.map((x) => `<li><b>${esc(x.name)}</b>ヤング率（地金の曲がりにくさ）${x.young.gpa} GPa${x.young.provisional ? "（仮）" : ""}：${esc(x.young.basis)}。耐力（これを超えると曲がったまま戻らない強さ）${x.proof.mpa} MPa${x.proof.provisional ? "（仮）" : ""}：${esc(x.proof.basis)}</li>`).join("");
  const more = (key: string, title: string, body: string) => `<details class="tn-more" data-tn="${key}" ${tnOpen.has(key) ? "open" : ""}><summary>${title}</summary>${body}</details>`;
  const notes = tensionNotes(r.setting, r.shank.thicknessMm, g);
  return `<section class="tn-card">
    <h5>テンション（腕のばねで石を挟む）</h5>
    <small class="tn-note">この石の場合の案です。深さや開きは、石によって変わります。</small>
    <dl class="tn-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    <p class="tn-line"><b>入れ方</b>${esc(insert.how)}。${esc(insert.hold)}。</p>
    <p class="tn-line"><b>計算</b>${esc(springSummary(myRow))}。</p>
    <small class="tn-note">${esc(GUIDE_NOTE)}</small>
    ${cautions.length ? `<ul class="tn-cautions">${cautions.map((c) => `<li><b>${esc(c.title)}</b>${esc(c.text)}</li>`).join("")}</ul>` : ""}
    <div class="tn-table">
      <div class="tn-head"><b>地金ごとの比べ（mm）</b></div>
      <table><thead><tr><th>地金</th><td>小さめに<br>作る</td><td>作る時の<br>開き</td><td>広げて<br>入れる</td></tr></thead><tbody>${table.rows.map(row).join("")}</tbody></table>
      <p>石の長さ ${table.spanMm.toFixed(2)} mm まで広げると石が通り、手を離すと「小さめに作る」の分だけ戻ろうとして、石を押さえます。</p>
      ${slide}
      <p>${esc(SPRING_PREMISE)}</p>
    </div>
    ${more("calc", "式と前提と出典を読む", `<p>${esc(TENSION_OPENING_NOTE)}。</p><p>${esc(TENSION_WORDS_NOTE)}。今は R ${table.radiusMm.toFixed(2)} mm（指の半径 ＋ 太さ ÷ 2）・d ${table.wireMm.toFixed(1)} mm。</p><p>開ける限界（戻れる範囲で開ける量）：${table.rows.map((x) => `${esc(x.name)} ${x.limitMm.toFixed(2)}${x.provisional ? "（仮）" : ""}`).join("・")} mm。これは、この式の値です。太い輪は線の内側で曲げが強まるので、「小さめに作る」は、限界を ${table.factor.toFixed(2)} で割ってから、開いて入れるのに要る量（${esc(table.needText)}）を引きました（ばねの手引きの式）。割ると足りないときは「ぎりぎり」です。</p><ul>${basis}</ul><p>帳面の決まり「テンションの角はくぼみ、辺は溝」「テンションの地金は硬い状態で」とつながっています。${filming() ? "" : `<a class="link" href="app.html#ledger">帳面で読む →</a>`}</p>`)}
    ${holdSectionHtml(b, table)}
    ${more("notes", `気をつけること（${notes.length}）`, `<ul class="tension-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`)}
  </section>`;
}
/** 図面の表題欄の行：詰める量と外れにくさ（目安・仮） */
function tensionHoldRows(b: Built, sess: RingSession): { label: string; value: string }[] {
  const r = b.ring;
  if (!r.setting.tension) return [];
  const g = sess.guides();
  const mine = springIdOf(sess.state.metal);
  const table = tensionSpring(r.setting, r.shank, "hardened", g);
  if (!table) return [];
  const row = table.rows.find((x) => x.metal === mine)!;
  const h = tensionHoldSet(table, r.metalWeightG, mine, mine, g).now;
  const need = Number.isFinite(h.needSqueezeMm) ? h.needSqueezeMm.toFixed(2) : "—";
  return [
    {
      label: "開きを詰める（目安・仮。最後は職人が決める）",
      value: `${row.shrinkMm !== null ? `約 ${row.shrinkMm.toFixed(2)} 小さめに ・ 作る時の開き 約 ${row.makeGapMm!.toFixed(2)}` : "開く量が足りない見込み"} ・ 留めるのに要る 約 ${need} ・ ${HOLD_VERDICT_LABEL[h.verdict]}`,
    },
  ];
}
/** 浅く留めたいときのつまみ（くぼみ・溝の深さ）。両方あれば 2 本、片方だけなら 1 本 */
function holdSliders(b: Built): SliderSpec[] {
  const info = b.ring.setting.tension!;
  const pit = info.ends.find((e) => e.kind === "pit");
  const groove = info.ends.find((e) => e.kind === "groove");
  const both = info.ends[0].kind === info.ends[1].kind ? "（両はし）" : "";
  const spec = (cls: string, label: string, v: number): SliderSpec => ({ cls, label, min: HOLD_DEPTH_RANGE.min, max: HOLD_DEPTH_RANGE.max, step: 0.05, value: Math.min(HOLD_DEPTH_RANGE.max, Math.max(HOLD_DEPTH_RANGE.min, v)), unit: "mm" });
  return [...(pit ? [spec("r-hold-pit", `角のくぼみの深さ${both}`, pit.depthMm)] : []), ...(groove ? [spec("r-hold-groove", `辺の溝の深さ${both}`, groove.depthMm)] : [])];
}
/** 深さのつまみの範囲（mm。形を作るための決まり。作者の頼み 2026-11-07「0.2〜0.8 mm くらい」） */
const HOLD_DEPTH_RANGE = { min: 0.2, max: 0.8 };
/**
 * 浅く留めたいとき（作者の頼み 2026-11-07）：今の深さで、留めるのに要る詰める量と、腕が戻れる範囲で詰められる量。
 * いちばん浅い深さ、足りないときのほかの手。値の多くは仮。最後は職人が決める（src/rules/tension-hold.ts）
 */
function holdSectionHtml(b: Built, table: SpringTable): string {
  const r = b.ring;
  const info = r.setting.tension!;
  const g = session!.guides();
  const mine = springIdOf(session!.state.metal);
  const set = tensionHoldSet(table, r.metalWeightG, mine, mine, g);
  const h = set.now;
  const row = table.rows.find((x) => x.metal === mine)!;
  const kari = "（仮）";
  const num = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} mm` : "—");
  // 両はしが同じ種類なら「両はしのくぼみ 0.30」、ちがえば「くぼみ 0.30・溝 0.20」
  const word = (k: "pit" | "groove") => (k === "pit" ? "くぼみ" : "溝");
  const same = info.ends[0].kind === info.ends[1].kind && Math.abs(info.ends[0].depthMm - info.ends[1].depthMm) < 1e-9;
  const depthWords = (d: (e: (typeof info.ends)[number]) => number) => (same ? `両はしの${word(info.ends[0].kind)} ${d(info.ends[0]).toFixed(2)}` : info.ends.map((e) => `${word(e.kind)} ${d(e).toFixed(2)}`).join("・"));
  const ends = depthWords((e) => e.depthMm);
  // いちばん浅い深さを、今の深さの割合で両はしに分ける
  const split = (sum: number) => depthWords((e) => (sum * e.depthMm) / Math.max(1e-9, table.needMm));
  const min = h.minDepthSumMm;
  const minTight = h.minDepthSumTightMm;
  const shallow =
    min === null
      ? `<p>この地金・この太さ・この号では、どの深さでも、腕が戻れる範囲の詰め方では「留まる見込み」になりません${kari}。</p>`
      : `<p>この指輪（${esc(row.name)}・ø ${table.wireMm.toFixed(1)} mm・${r.shank.gou} 号）で、留まる見込みになるいちばん浅い深さ：両はしの和 約 ${min.toFixed(2)} mm（例：${split(min)} mm。そのとき詰める量 約 ${(table.factor > 0 ? row.limitMm / table.factor - min : 0).toFixed(2)} mm）${minTight !== null ? `。ぎりぎりなら 約 ${minTight.toFixed(2)} mm` : ""}${kari}。</p>`;
  const parts = set.atAppSqueeze?.work ?? h.work;
  const pct = (v: number) => `${Math.round((100 * v) / Math.max(1e-9, parts.total))} %`;
  const app = set.atAppSqueeze
    ? `<p>地金ごとの計算の「小さめに作る」約 ${row.shrinkMm!.toFixed(2)} mm で作ると、外れにくさは求める分の 約 ${set.atAppSqueeze.margin.toFixed(2)} 倍${kari}。内わけ：深さのかかり ${pct(parts.lock)}・詰めた分 ${pct(parts.squeeze)}・摩擦 ${pct(parts.friction)}。</p>`
    : "";
  const ideas: string[] = [];
  if (h.verdict !== "hold") {
    ideas.push("もっと硬くする（加工硬化を強める・熱で硬くする合金にする）と、詰められる量が増えます。硬さの値は仮なので、職人が確かめます");
    if (min !== null && min > h.depthSumMm) ideas.push(`深くする：両はしの和 約 ${min.toFixed(2)} mm 以上（例：${split(min)} mm）${kari}`);
    const ok = set.options.filter((o) => o.verdict === "hold");
    if (ok.length) ideas.push(`同じ深さで留まる見込み：${ok.map((o) => `${o.label}（要る ${num(o.needSqueezeMm)}・詰められる ${num(o.safeSqueezeMm)}）`).join("、")}${kari}`);
    const tight = set.options.filter((o) => o.verdict === "tight");
    if (tight.length) ideas.push(`ぎりぎり：${tight.map((o) => o.label).join("、")}${kari}`);
  }
  const fromCraft = session!.state.tensionPitMm !== undefined || session!.state.tensionGrooveMm !== undefined;
  return `<section class="tn-hold" data-v="${h.verdict}">
    <div class="tn-head"><b>浅く留めたいとき</b>${fromCraft ? `<button type="button" class="link hold-reset">職人の値に戻す</button>` : ""}</div>
    <small class="tn-note">深さを変えると、留めるのに要る詰める量（締めつけ）と、腕が戻れる範囲で詰められる量を比べます。形・図面・作り方も、この深さに変わります。</small>
    <div class="sliders">${holdSliders(b).map(sliderHtml).join("")}</div>
    <p class="tn-verdict ${h.verdict}"><b>${esc(HOLD_VERDICT_LABEL[h.verdict])}</b><small>${esc(ends)} mm（和 ${h.depthSumMm.toFixed(2)} mm）・${esc(row.name)}・目安・仮</small></p>
    <dl class="tn-facts">
      <div><dt>留めるのに要る詰める量</dt><dd>${Number.isFinite(h.needSqueezeMm) ? `約 ${h.needSqueezeMm.toFixed(2)} mm` : "—"}</dd></div>
      <div><dt>詰められる量（太い輪の分）</dt><dd>約 ${h.safeSqueezeMm.toFixed(2)} mm</dd></div>
      <div><dt>詰められる上限（細い輪の式）</dt><dd>約 ${h.limitSqueezeMm.toFixed(2)} mm</dd></div>
      <div><dt>図面の開き</dt><dd>${h.gapMm.toFixed(2)} mm</dd></div>
      <div><dt>${h.verdict === "short" ? "詰められるだけ詰めて作る時の開き" : "要る量で作る時の開き"}</dt><dd>約 ${h.makeGapMm.toFixed(2)} mm</dd></div>
      <div><dt>そのとき広げて入れる量</dt><dd>約 ${h.spreadMm.toFixed(2)} mm</dd></div>
      <div><dt>広げられる限界（細い輪の式）</dt><dd>約 ${row.limitMm.toFixed(2)} mm</dd></div>
    </dl>
    ${app}
    ${shallow}
    ${ideas.length ? `<ul class="tn-ideas">${ideas.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    <small class="tn-note">${esc(HOLD_PREMISE)}。落とす高さ ${(h.dropMm / 1000).toFixed(1)} m・摩擦 ${h.mu}・壁の傾き ${h.wallDeg}° は仮の値で、帳面で職人が変えられます。</small>
  </section>`;
}
function bindHold(box: HTMLElement, b: Built): void {
  const info = b.ring.setting.tension;
  if (!info) return;
  const cur = () => ({ pit: info.ends.find((e) => e.kind === "pit")?.depthMm, groove: info.ends.find((e) => e.kind === "groove")?.depthMm });
  for (const sp of holdSliders(b))
    bindSlider(box, sp, (v) => {
      const c = cur();
      session!.setTensionDepths(sp.cls === "r-hold-pit" ? v : c.pit, sp.cls === "r-hold-groove" ? v : c.groove);
    });
  box.querySelector(".hold-reset")?.addEventListener("click", () => session!.setTensionDepths(undefined, undefined));
}
function gouSlider(gou: number): SliderSpec {
  return { cls: "r-gou", label: "号", min: RING_GOU_RANGE.min, max: RING_GOU_RANGE.max, step: 1, value: gou, unit: "号" };
}
/** 新しい決まりで確かめ直した知らせ。n：今の作れない所の数 */
function ruleFlashHtml(n: number): string {
  if (!lastRule) return "";
  return `<section class="rule-flash"><small>${esc(lastRule.by)}の決まりで、確かめ直しました</small><b>${lastRule.spoken ? `「${esc(lastRule.quote)}」` : esc(lastRule.quote)}</b><span>作れない所 <em>${lastRule.before}</em> → <em class="${lastRule.after ? "ng" : "ok"}">${lastRule.after}</em>${lastRule.after && n < lastRule.after ? ` → 直して <em class="${n ? "ng" : "ok"}">${n}</em>` : ""}</span></section>`;
}
function renderCheck() {
  ruleVoice?.stop();
  if (kind === "band") return renderBandCheck();
  if (!session?.built) return;
  const b = session.built;
  const s = session.state;
  const probs = grouped(b);
  const box = $(".studio-refine");
  const pick = <T extends string | number>(name: string, cur: T, list: [T, string][]) =>
    `<div class="pick"><span>${name}</span><div>${list.map(([v, l]) => `<button type="button" data-k="${name}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join("")}</div></div>`;
  const fresh = lastRule ? new Set<string>(lastRule.checks) : new Set<string>();
  /** 腕の断面の札：ふだんは作ると同じ 12 の見本。テンション（丸線の腕）と撮影では、前の腕の断面の札（撮影の台本が data-v で押す） */
  const presetPick = !filming() && s.style !== "tension";
  const sectionName: Record<ShankSection, string> = filming() ? FILM_SECTION_LABEL : SHANK_SECTION_LABEL;
  // 決まりの案と「案にしています…」は、欄を描き直しても消さない（形の作り直しが案を消すと、もう押せなくなる）
  const heldProposal = [...(box.querySelector(".ar-proposal")?.childNodes ?? [])];
  box.innerHTML = `
    ${ruleFlashHtml(probs.length)}
    <section class="big-verdict ${probs.length ? "ng" : tensionCautionsOf(b).length || handGrooveOf(b) || narrowArmOf(b) ? (narrowArmOf(b)?.level === "orange" ? "warn2" : "warn") : "ok"}"><b>${probs.length ? "このままでは作れません" : tensionCautionsOf(b).length ? "形は作れます。職人に確かめる所があります" : narrowArmOf(b) ? `作れます。腕が${narrowArmOf(b)!.level === "orange" ? "かなり細いので" : "細めなので"}、注意があります` : handGrooveOf(b) ? "形は作れます。細い溝は、あとから手で彫ります" : "このまま作れます"}</b><small>${probs.length ? `直す所 ${probs.length}` : tensionCautionsOf(b).length ? tensionCautionsOf(b).map((c) => esc(c.title)).join("・") : b.ring.setting.tension ? "溝・くぼみ・すき間は目安の内側。ばねの強さは職人が決める" : `爪・留まり・すき間・角、すべて目安の内側`}</small></section>
    ${filming() ? "" : `<div class="stone-pick"><span>石の形</span><div class="presets" role="group" aria-label="石の形">${stoneButtonsHtml()}</div></div>`}
    ${askNudgeHtml(b)}
    ${workshopBarHtml()}
    ${compareHtml()}
    ${MULTI_STONE_UI ? stonesSectionHtml(b) : ""}
    ${
      probs.length
        ? `<ul class="probs">${probs
            .map(
              ({ p, n }, i) => `<li class="${fresh.has(p.check) ? "fresh" : ""}"><div class="p-head"><b>${esc(SHORT[p.check] ?? p.where)}</b>${n > 1 ? `<small>${n} か所</small>` : ""}${fresh.has(p.check) ? `<i class="new-tag">新しい決まり</i>` : ""}</div>
              <p class="p-num">${esc(p.current)} <span>→</span> ${esc(p.required)}</p>
              <div class="p-act"><button type="button" class="fix-go" data-p="${i}">${esc(p.options[0]?.label ?? "直す")}</button>${(() => {
                const r = craftRuleFor(p.check);
                return r && voices.has(r.id) ? `<button type="button" class="voice-play" data-rid="${esc(r.id)}">▶ 職人の声で聞く</button>` : "";
              })()}<details><summary>なぜ</summary><p>${esc(p.reason)}</p>${(() => {
                const r = craftRuleFor(p.check);
                return r?.quote ? `<p class="p-quote">「${esc(r.quote)}」<span>${esc(masterName(store.ledger()))}</span></p>` : "";
              })()}</details></div></li>`,
            )
            .join("")}</ul>`
        : ""
    }
    ${widthNoteHtml(narrowArmOf(b))}
    ${grooveNoteHtml(handGrooveOf(b))}
    ${(() => {
      const note = prongCountNote(b);
      const r = b.ring;
      // 石の先（キューレット）が腕の厚みの中まで下りているときは、形の方で腕の上をもうザグってある（geometry/notch.ts）
      const zaguri = r.notchDepthMm > 0 ? `<p class="look-note"><b>ザグり</b>石の先が当たる所を、腕の上で自動でザグりました（深さ ${r.notchDepthMm.toFixed(2)} mm、丸いビット 直径 約 ${r.shank.notchBallDiameterMm.toFixed(1)} mm）。<small>石の先〜指 ${r.culetGapMm.toFixed(2)} mm、腕の厚み ${r.shank.thicknessMm.toFixed(1)} mm。石とのすき間 ${GUIDES.bezel.clearanceMm} mm を残しています。3D・図面・重さ・STL に入っています（作り方の「石座を腕に付ける」）</small></p>` : "";
      const small = r.setting.style === "prong" && r.setting.join === "on" && !session?.state.joinSet || r.setting.prongsOnArm > 0;
      const tension = r.setting.tension
        ? tensionCardHtml(b)
        : "";
      return tension + (small ? `<p class="look-note"><b>この石は、別の留め方がおすすめ</b>この大きさ・形では、爪を腕から避けたり、下の輪に収めたりできません。おちょこ留めや、腕に下穴を開けて留めるミル留め・パヴェのような留め方をすすめます。覆輪にする、腕を細くするのも手です。この爪留めのままなら、腕の上にのせる形になります（職人の言葉）<small>覆輪と腕の太さは「手で変える」で選べます。ほかの留め方は、まだ形にできません</small></p>` : "") + (note ? `<p class="look-note"><b>見た目の注意</b>${esc(note)}<small>作れますが、形に対して不自然に見えることがあります（確かめの決まりではありません）</small></p>` : "") + zaguri;
    })()}
    <details class="manual" ${manualOpen ?? !probs.length ? "open" : ""}><summary>手で変える</summary>
      ${s.style === "prong" && !filming() ? prongHintHtml(b) : ""}
      ${pick("留め方", patternOf(b), filming() ? PATTERNS.filter(([v]) => v !== "v" && v !== "3") : patternsFor(b))}
      ${s.style === "prong" ? pick("爪の本数", s.prongCount ?? 0, [[0, "自動"], [3, "3"], [4, "4"], [5, "5"], [6, "6"]]) : ""}
      ${b.ring.setting.tension && b.ring.setting.tension.grips.length > 1 ? `${pick("挟む向き", b.ring.setting.tension.grip, b.ring.setting.tension.grips.map((x) => [x, gripLabel(x, b.ring.setting.tension!)] as [TensionGrip, string]))}<ul class="pick-notes">${b.ring.setting.tension.grips.map((x) => `<li${x === b.ring.setting.tension!.grip ? ' class="on"' : ""}><b>${gripLabel(x, b.ring.setting.tension!)}</b>${esc(gripNote(x, b.ring.setting.tension!))}</li>`).join("")}</ul>` : ""}
      ${s.style === "tension" ? "" : pick("高さ", s.height, [["low", "低め"], ["standard", "標準"], ["high", "高め"]])}
      ${s.style === "tension" ? "" : pick("向き", s.orientation, [["along", "縦"], ["across", "横"]])}
      ${s.style === "prong" ? prongTipPickHtml(pick, b.ring.setting.prongTip) : ""}
      ${s.style === "prong" && b.ring.stones.length === 1 ? joinPickHtml(pick, b.ring.setting.join) : ""}
      ${pick("地金", s.metal, (["k18yg", "pt900", "k18wg", "k18pg", "sv925"] as Metal[]).map((m) => [m, METAL_LABEL[m]] as [Metal, string]))}
      ${tradHtml(pick, s)}
      <div class="sliders">
        ${s.style === "prong" ? sliderHtml(prongSlider(b)) : ""}
        ${s.style === "tension" ? sliderHtml(wireSlider(b)) : ""}
        ${kind === "solitaire" ? sliderHtml(stoneSlider()) : ""}
        ${sliderHtml(gouSlider(s.gou))}
      </div>
      ${
        presetPick
          ? // 作るの「腕の形」と同じ 12 の名前と並び（2026-11-06）。押すと作ると同じ見本の線になる
            pick("腕の断面", ringSectionKind(s, b.ring.shank.widthMm, b.ring.shank.thicknessMm) as string, [...SECTION_LIST.map((x) => [x.id, x.label] as [string, string]), ["free", "手で描く"]])
          : pick("腕の断面", s.shankSection ?? "kouman", [...(s.style === "tension" || s.shankSection === "maru" ? [["maru", sectionName.maru] as [ShankSection, string]] : []), ...SHANK_SECTIONS.filter((k) => filming() || k !== "hangouman" || s.shankSection === "hangouman").map((k) => [k, sectionName[k]] as [ShankSection, string]), ...(s.shankSection === "free" ? [["free", ringSectionWord(s, b.ring.shank.widthMm, b.ring.shank.thicknessMm)] as [ShankSection, string]] : [])])
      }
      ${s.style === "tension" ? "" : sectionEditorHtml()}
      ${s.shankStations?.length ? "" : widthNoteHtml(narrowArmOf(b), true)}
      ${shankLineHtml(s, session!.guides())}
    </details>
    ${pastCheckHtml()}
    ${probs.length ? `<button type="button" class="next-btn claude-fix">Claude に直してもらう</button>` : ""}
    ${fixLog.length ? `<ol class="worklog fix-log">${fixLog.map((l) => `<li class="${l.cls}">${esc(l.text)}</li>`).join("")}</ol>` : ""}
    ${rulesSectionHtml()}
    <button type="button" class="next-btn to-build">作り方を見る →</button>`;
  box.querySelector(".ar-proposal")?.append(...heldProposal);
  bindRules(box);
  bindWorkshops(box);
  bindStones(box, b);
  box.querySelectorAll<HTMLDetailsElement>(".tn-more").forEach((el) =>
    el.addEventListener("toggle", () => {
      if (el.open) tnOpen.add(el.dataset.tn!);
      else tnOpen.delete(el.dataset.tn!);
    }),
  );
  const manual = box.querySelector<HTMLDetailsElement>(".manual")!;
  manual.addEventListener("toggle", () => (manualOpen = manual.open));
  box.querySelector(".prong-reset-all")?.addEventListener("click", () => session!.resetProngLook(null));
  box.querySelector(".compare-btn")?.addEventListener("click", () => setCompare(true));
  box.querySelector(".sweep-btn")?.addEventListener("click", () => openSweep());
  box.querySelector(".compare-back")?.addEventListener("click", () => setCompare(false));
  wireAskNudge(box, b);
  box.querySelector(".past-fix")?.addEventListener("click", () => {
    if (askConfirm("今の設計と、これまでの作品を、まとめて直しますか？\n爪の太さなどが変わります。")) fixPastWorks();
  });
  box.querySelector(".claude-fix")?.addEventListener("click", () => void fixWithClaude());
  box.querySelectorAll<HTMLButtonElement>(".voice-play").forEach((btn) =>
    btn.addEventListener("click", () => {
      const r = activeRules(store.ledger()).find((x) => x.id === btn.dataset.rid);
      if (r) void playRuleVoice(r);
    }),
  );
  box.querySelectorAll<HTMLButtonElement>(".voice-rec").forEach((btn) => btn.addEventListener("click", () => void toggleRecord(btn.dataset.rid!)));
  box.querySelectorAll<HTMLButtonElement>(".fix-go").forEach((btn) =>
    btn.addEventListener("click", () => {
      const { p } = probs[Number(btn.dataset.p)];
      if (p.options[0]) applyFix(p.options[0].id, session!, p);
    }),
  );
  box.querySelectorAll<HTMLButtonElement>(".pick button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const k = btn.dataset.k!;
      const v = btn.dataset.v!;
      if (k === "留め方") {
        const pat = v as Pattern;
        if (pat === "bezel") session!.setSetting({ style: "bezel", reason: "手で" });
        else if (pat === "tension") session!.setSetting({ style: "tension", reason: "手で" });
        else if (pat === "v") session!.setSetting({ style: "prong", v_corners: true, reason: "手で" });
        else session!.setSetting({ style: "prong", v_corners: false, prong_count: Number(pat), reason: "手で" });
      }
      if (k === "挟む向き") session!.setSetting({ tension_grip: v as TensionGrip, reason: "手で" });
      if (k === "腕の断面") {
        if (!presetPick) session!.setShank({ section: v as ShankSection, reason: "手で" });
        else if (v === "free") {
          // 手で描く：下の断面を描く画面へ
          box.querySelector<HTMLElement>(".sec-edit")?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        } else {
          const sh = session!.built!.ring.shank;
          session!.setShank({ ...ringSectionInput(v as PresetKind, sh.widthMm, sh.thicknessMm), reason: "手で" });
        }
      }
      if (k === "爪の本数") {
        if (Number(v)) session!.setSetting({ prong_count: Number(v), reason: "手で" });
        else {
          session!.state.prongCount = undefined;
          session!.build("自動");
        }
      }
      if (k === "高さ") session!.setSetting({ height: v as "low", reason: "手で" });
      if (k === "向き") session!.setSetting({ orientation: v as "along", reason: "手で" });
      if (k === JOIN_PICK) session!.setSetting({ join: v as JoinStyle, reason: "手で" });
      if (k === PRONG_TIP_PICK) session!.setSetting({ prong_tip: v as ProngTip, reason: "手で" });
      if (k === "地金") session!.setShank({ metal: v as Metal, reason: "手で" });
      if (k in TRAD_KEYS) tradPick(k as keyof typeof TRAD_KEYS, v);
    }),
  );
  if (s.style === "prong") bindSlider(box, prongSlider(b), (v) => session!.setSetting({ prong_mm: v, reason: "手で" }));
  if (s.style === "tension") bindSlider(box, wireSlider(b), (v) => session!.setShank({ width_mm: v, thickness_mm: v, reason: "手で" }));
  bindHold(box, b);
  bindSlider(box, gouSlider(s.gou), (v) => session!.setShank({ gou: v, reason: "手で" }));
  bindSlider(
    box,
    stoneSlider(),
    (v) => {
      cancelAnimationFrame(stoneLive);
      holdPanel = false;
      resizeStone(v, true);
    },
    (v) => {
      // 動かしている間は、粗い形ですぐ見せる（1 こまに 1 回まで）。指の下のつまみを消さないよう、欄は描き直さない
      cancelAnimationFrame(stoneLive);
      holdPanel = true;
      stoneLive = requestAnimationFrame(() => resizeStone(v, false));
    },
  );
  // 腕の線：肩と下の幅・厚み・断面
  bindShankLine(box, session!, renderCheck);
  bindRingSectionEditor(box);
  box.querySelector(".to-build")!.addEventListener("click", () => setMode("hand"));
}
// ---- 伝統の仕上げ（煮色の色金・槌目・ミル打ち・布目象嵌）。2026-11-06 作者が作ると決めた ----
/** 色金を「なし」に戻したときの地金（色金を選ぶ前の地金） */
let plainMetal: Metal = "k18yg";
const TRAD_KEYS = { 色金: "metal", 槌目: "tsuchime_style", 槌目の大きさ: "tsuchime", 槌目の場所: "tsuchime_area", ミル打ち: "milgrain", 象嵌: "inlay" } as const;
/** それぞれの技の、ふつうの言葉の一行（数は目安・仮。最後は職人が決める） */
const TRAD_NOTE: Record<keyof typeof TRAD_KEYS, string> = {
  色金: "銅に金や銀を混ぜた地金を、液で煮て色を出す（煮色）。赤銅は紫がかった黒、四分一は銀灰、銅は赤茶になる",
  槌目: "金づちで叩いた跡を、模様として面に残す。鎚の面の形で跡の形が変わる",
  槌目の大きさ: "小さい跡は細かく光り、大きい跡は力強く見える",
  槌目の場所: "指に当たる内側には打たない",
  ミル打ち: "腕の縁の細い山に、ミル鏨で小さな粒を一粒ずつ押しこんで並べる。粒は半分ほど縁に埋まり、となりと離さず、重ねず",
  象嵌: "細い溝を刻んだ面に、金や銀を打ちこむ（布目象嵌）。腕の真ん中に帯の模様が入る",
};
function tradHtml(pick: <T extends string | number>(name: string, cur: T, list: [T, string][]) => string, s: RingState): string {
  const f = s.finish;
  const note = (k: keyof typeof TRAD_KEYS) => `<p class="trad-note">${esc(TRAD_NOTE[k])}</p>`;
  const beadMm = session?.built?.ring.milgrain?.beadMm ?? GUIDES.finish.milgrain.beadMm;
  return `<section class="trad" aria-label="伝統の仕上げ">
    <h4>伝統の仕上げ<small>彫金・鍛金の技</small></h4>
    ${pick("色金", isIrogane(s.metal) ? s.metal : "none", [["none", "なし"], ["shakudo", "赤銅"], ["shibuichi", "四分一"], ["copper", "銅"]])}${note("色金")}
    ${pick("槌目", f?.tsuchime ? tsuchimeStyleOf(f.tsuchime) : "none", [["none", "なし"], ...TSUCHIME_STYLES.map((k) => [k, TSUCHIME_STYLE_LABEL[k].replace("槌目", "")] as [string, string])])}${note("槌目")}
    <ul class="pick-notes trad-styles">${TSUCHIME_STYLES.map((k) => `<li${f?.tsuchime && tsuchimeStyleOf(f.tsuchime) === k ? ' class="on"' : ""}><b>${TSUCHIME_STYLE_LABEL[k]}</b>${esc(TSUCHIME_STYLE_NOTE[k])}</li>`).join("")}</ul>
    ${f?.tsuchime && tsuchimeStyleOf(f.tsuchime) !== "arashi" ? `${pick("槌目の大きさ", f.tsuchime.size, (["small", "medium", "large"] as const).map((k) => [k, TSUCHIME_LABEL[k]] as [string, string]))}${note("槌目の大きさ")}` : ""}
    ${f?.tsuchime ? `${pick("槌目の場所", f.tsuchime.area, [["outer", TSUCHIME_AREA_LABEL.outer], ["all", TSUCHIME_AREA_LABEL.all]])}${note("槌目の場所")}` : ""}
    ${MILGRAIN_OFFERED ? `${pick("ミル打ち", f?.milgrain ?? "none", [["none", "なし"], ["edges", "腕の縁"]])}${note("ミル打ち")}` : ""}
    ${pick("象嵌", f?.inlay ?? "none", [["none", "なし"], ["nunome", "布目象嵌"]])}${note("象嵌")}
    <p class="trad-foot">槌目の跡 ${f?.tsuchime ? tsuchimeMarkWords(f.tsuchime) : `${GUIDES.finish.tsuchimeStyle.arashi.markMm}〜${GUIDES.finish.tsuchime.large.markMm} mm`}${MILGRAIN_OFFERED ? `・ミルの粒 ø${beadMm.toFixed(2)} mm` : ""} は仮の目安。最後は職人が決める。</p>
  </section>`;
}
const TSUCHIME_STYLES: TsuchimeStyle[] = ["maru", "kaku", "tate", "arashi"];
/** 槌目の跡の大きさの言葉（縦槌目は 幅 × 長さ） */
function tsuchimeMarkWords(t: NonNullable<RingState["finish"]>["tsuchime"] & object): string {
  const sp = tsuchimeSpec(t);
  return tsuchimeStyleOf(t) === "tate" ? `幅 ${sp.markMm} × 長さ ${sp.lengthMm.toFixed(1)} mm` : `${sp.markMm} mm`;
}
function tradPick(k: keyof typeof TRAD_KEYS, v: string) {
  const s = session!;
  if (k === "槌目") {
    s.setShank({ finish: v === "none" ? { tsuchime: "none" } : { tsuchime_style: v as TsuchimeStyle }, reason: "手で" });
    return;
  }
  if (k === "色金") {
    if (!isIrogane(s.state.metal)) plainMetal = s.state.metal;
    s.setShank({ metal: v === "none" ? plainMetal : (v as Metal), reason: "手で" });
    return;
  }
  s.setShank({ finish: { [TRAD_KEYS[k]]: v } as FinishInput, reason: "手で" });
}

/** 腕の断面を描く画面をつなぐ（確かめるの欄と、作るの腕の形の欄で同じ） */
function bindRingSectionEditor(box: HTMLElement) {
  // 腕の断面：点を動かしている間は 3D の腕だけ変え（パネルは描き直さない）、離したときに確かめ直す
  const b = session!.built!;
  const s = session!.state;
  const sh = b.ring.shank;
  const place = s.style !== "tension" ? sectionBinding(s) : null;
  // 図で描く相手が肩や下のとき：動かしている間も離したときも、その場所の断面だけを変える
  if (place) bindSectionEditor(
    box,
    place.start,
    (sec) => {
      holdPanel = true;
      const cur = session!.built!;
      const stations = place.apply(sec).stations!.map(stationFrom);
      viewer.updateShank(rebuildShank(cur.ring, { ...cur.ring.params.shank, stations }), cur.problems);
    },
    (sec) => {
      holdPanel = false;
      session!.setShank({ ...place.apply(sec), reason: "断面を手で描いた" });
    },
    { guides: session!.guides() },
  );
  else if (s.style !== "tension") bindSectionEditor(
    box,
    startShape(s.shankSection ?? "kouman", s.sectionCurve, s.sectionPoints, sh.widthMm, sh.thicknessMm),
    (sec) => {
      holdPanel = true;
      Object.assign(session!.state, { shankSection: "free", sectionCurve: sec.curve, sectionPoints: undefined, shankWidthMm: sec.widthMm, shankThicknessMm: sec.thicknessMm });
      // 動かしている間は、3D の腕だけを差し替える（石座は作り直さない：一体の石座は重く、指の動きに遅れるため）。
      // 腕の確かめ（局所的に薄い所の赤い印）も、その場で。指を離したら、全部を作り直して確かめ直す
      const cur = session!.built!;
      const shank = rebuildShank(cur.ring, { ...cur.ring.params.shank, section: "free", sectionCurve: sec.curve, sectionPoints: undefined, widthMm: sec.widthMm, thicknessMm: sec.thicknessMm });
      const probs = [...cur.problems.filter((p) => !p.check.startsWith("band-")), ...checkShank(shank, { guides: session!.guides() })];
      viewer.updateShank(shank, probs);
    },
    (sec) => {
      holdPanel = false;
      const dims = { width_mm: round2(sec.widthMm), thickness_mm: round2(sec.thicknessMm) };
      // リセットは決まった断面に戻す。それ以外は手で描いた線
      if (sec.section !== "free") session!.setShank({ section: sec.section, ...dims, reason: "断面をリセット" });
      else session!.setShank({ section_curve: sec.curve, ...dims, reason: "断面を手で描いた" });
    },
    { guides: session!.guides() },
  );
}
/**
 * 石を並べる欄を画面に出すか。2026-11-04：三石だけ、並び方を直したので出す（一粒と三石だけ）。
 * 横一列と、石を 1 つずつ置く（自由な並び）は、まだ並び方が不自然なので出さない（作者と決めた）。形の処理とテストは残す
 */
// 2026-11-05：石座の既定を「腕の間に挟む」にしてから、三石も脇の石が真ん中の石にめりこむ・浮く。直るまで、石を並べる欄は出さない
const MULTI_STONE_UI = false;
/** 横一列・石を置く（自由な並び）を画面に出すか */
const ROW_AND_FREE_UI = false;
// ---- 石を並べる：三石・横一列・石を置く（腕の上を押して足す・なぞって動かす・押して選ぶ） ----
/** 石を置く場面か（3D を押すと石を足す・選ぶ・動かす） */
let placeOn = false;
/** 選んでいる石（RingDesign.stones の番号。−1 ＝ なし） */
let selStone = -1;
/** 「石を並べる」を人が開いた・閉じたか（一度触ったら、描き直してもそのまま） */
let stonesOpen: boolean | null = null;
/** 並べ方の名前（作品の名前・図面の題に使う） */
function layoutName(sess: RingSession = session!): string {
  const l = sess.state.layout;
  return l && l !== "solo" ? LAYOUT_LABEL[l] : sess.state.stones?.length ? LAYOUT_LABEL.free : LAYOUT_LABEL.solo;
}
const SLOT_SHAPES = Object.keys(SLOT_SHAPE_LABEL) as SlotShape[];
function slotSizeSlider(mm: number): SliderSpec {
  return { cls: "r-slot", label: "大きさ", min: 1.5, max: 12, step: 0.1, value: Number(mm.toFixed(1)), unit: "mm" };
}
/** 横一列の石の大きさ（どの石も今の石と同じ。今の石の大きさを変えて並べ直す） */
function rowSizeSlider(): SliderSpec {
  return { cls: "r-rowsize", label: "石の大きさ", min: 1.5, max: 10, step: 0.1, value: Number((session?.stone.longMm ?? 3).toFixed(1)), unit: "mm" };
}
/** 三石の脇の石に選べる形（丸い石・ペア・今の石と同じ形） */
const TRIO_SIDE_SHAPES: SlotShape[] = ["round", "pear", "photo"];
/** 三石の脇の石の大きさ（長辺。両脇を同じ大きさで並べ直す） */
function trioSideSlider(mm: number): SliderSpec {
  return { cls: "r-trioside", label: "脇の石の大きさ", min: 1.5, max: 10, step: 0.1, value: Number(mm.toFixed(1)), unit: "mm" };
}
function stonesSectionHtml(b: Built): string {
  const s = session!.state;
  const r = b.ring;
  const lay = s.layout ?? (s.stones?.length ? "free" : "solo");
  const bad = new Set(b.problems.flatMap((p) => (p.target.kind === "space" ? p.target.stones : [])));
  const sel = selStone > 0 && selStone < r.stones.length ? r.stones[selStone] : null;
  const slot = sel ? s.stones?.[selStone - 1] : undefined;
  const pick = <T extends string | number>(name: string, cur: T, list: [T, string][]) =>
    `<div class="pick"><span>${name}</span><div>${list.map(([v, l]) => `<button type="button" data-sk="${name}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join("")}</div></div>`;
  const [lo, , hi] = GUIDES.multi.rowCount;
  const layouts: [string, string][] = ROW_AND_FREE_UI ? [["solo", "一粒"], ["trio", "三石"], ["row", "横一列"]] : [["solo", "一粒"], ["trio", "三石"]];
  const trioSide = lay === "trio" ? s.stones?.[0] : undefined;
  return `<details class="stones-sec" ${stonesOpen ?? (r.stones.length > 1 || placeOn) ? "open" : ""}><summary>石を並べる${r.stones.length > 1 ? `<small>${esc(layoutName())} ・ ${r.stones.length} 石</small>` : ""}</summary>
    ${pick("並べ方", lay === "free" ? "" : lay, layouts)}
    ${trioSide ? pick("脇の石", trioSide.shape, TRIO_SIDE_SHAPES.map((k) => [k, SLOT_SHAPE_LABEL[k]] as [SlotShape, string])) : ""}
    ${trioSide ? `<div class="sliders">${sliderHtml(trioSideSlider(trioSide.longMm))}</div>` : ""}
    ${lay === "row" ? pick("石の数", r.stones.length, Array.from({ length: hi - lo + 1 }, (_, i) => [lo + i, String(lo + i)] as [number, string]).filter(([n]) => n <= 7)) : ""}
    ${lay === "row" ? `<div class="sliders">${sliderHtml(rowSizeSlider())}</div>` : ""}
    ${ROW_AND_FREE_UI ? `<div class="place-row"><button type="button" class="place-btn" aria-pressed="${placeOn}">${placeOn ? "石を置くのをやめる" : "石を置く"}</button><small>${placeOn ? "腕の上を押すと石を足します。石を押すと選べて、石をなぞると腕に沿って動きます" : "3D の腕の上を押して、石を 1 つずつ置けます"}</small></div>` : ""}
    <ol class="stone-list">${r.stones
      .map(
        (x, i) =>
          `<li><button type="button" class="stone-row${i === selStone ? " on" : ""}${bad.has(i) ? " bad" : ""}" data-i="${i}"><b>${i + 1}</b><span>${i === 0 ? "真ん中の石" : esc(SLOT_SHAPE_LABEL[s.stones?.[i - 1]?.shape ?? "photo"])} ${x.params.longMm.toFixed(1)} mm</span><small>${esc(placeText(x))}</small></button></li>`,
      )
      .join("")}</ol>
    ${
      sel && slot && ROW_AND_FREE_UI
        ? `<div class="stone-edit"><b>石 ${selStone + 1}</b>
        ${pick("形", slot.shape, SLOT_SHAPES.map((k) => [k, SLOT_SHAPE_LABEL[k]] as [SlotShape, string]))}
        <div class="sliders">${sliderHtml(slotSizeSlider(slot.longMm))}</div>
        ${pick("留め方", sel.setting.style === "bezel" ? "bezel" : String(slot.prongCount ?? 0), [["0", "自動"], ["4", "4 本爪"], ["6", "6 本爪"], ["bezel", "覆輪"]])}
        <button type="button" class="stone-del">この石を外す</button></div>`
        : ""
    }
    <p class="stones-note">${lay === "trio" ? `三石：脇の石座は真ん中より低く寄せ、石座どうしは短い線でつないでロウ付けします。石どうし ${GUIDES.multi.trio.stoneGapMm} mm・爪どうし ${GUIDES.multi.trio.prongGapMm} mm あけます（仮の目安・最後は職人が決める）` : `間の目安：石どうし ${GUIDES.multi.stoneGapMinMm} mm 以上、離れた石座どうし ${GUIDES.multi.metalGapMinMm} mm 以上（仮の目安・最後は職人が決める）`}</p>
  </details>`;
}
function bindStones(box: HTMLElement, b: Built) {
  const sec = box.querySelector<HTMLDetailsElement>(".stones-sec");
  if (!sec) return;
  sec.addEventListener("toggle", () => (stonesOpen = sec.open));
  sec.querySelectorAll<HTMLButtonElement>(".pick button[data-sk]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const k = btn.dataset.sk!;
      const v = btn.dataset.v!;
      if (k === "並べ方") {
        selStone = -1;
        session!.setStones({ layout: v as "solo", count: v === "row" ? GUIDES.multi.rowCount[1] : undefined, reason: "手で" });
      } else if (k === "脇の石") {
        session!.arrange("trio", { sideShape: v as SlotShape });
        session!.build("手で");
      } else if (k === "石の数") session!.setStones({ layout: "row", count: Number(v), reason: "手で" });
      else if (k === "形") {
        session!.editStone(selStone, { shape: v as SlotShape });
        session!.build("手で");
      } else if (k === "留め方") {
        session!.editStone(selStone, v === "bezel" ? { style: "bezel" } : { style: "prong", prongCount: Number(v) || undefined });
        session!.build("手で");
      }
    }),
  );
  sec.querySelector(".place-btn")?.addEventListener("click", () => setPlace(!placeOn));
  const trioSide = session!.state.layout === "trio" ? session!.state.stones?.[0] : undefined;
  if (trioSide)
    bindSlider(sec, trioSideSlider(trioSide.longMm), (v) => {
      session!.arrange("trio", { sideMm: v });
      session!.build("手で");
    });
  sec.querySelectorAll<HTMLButtonElement>(".stone-row").forEach((btn) =>
    btn.addEventListener("click", () => {
      selStone = Number(btn.dataset.i);
      renderCheck();
      drawStoneTags();
    }),
  );
  sec.querySelector(".stone-del")?.addEventListener("click", () => {
    if (!askConfirm("この石を外しますか？")) return;
    session!.removeStone(selStone);
    selStone = -1;
    session!.build("石を外した");
  });
  if (session!.state.layout === "row") bindSlider(sec, rowSizeSlider(), (v) => resizeStone(v, true));
  const slot = session!.state.stones?.[selStone - 1];
  if (slot)
    bindSlider(sec, slotSizeSlider(slot.longMm), (v) => {
      session!.editStone(selStone, { longMm: v });
      session!.build("手で");
    });
  void b;
}
function setPlace(on: boolean) {
  placeOn = on;
  $(".pro").classList.toggle("placing", on);
  if (on && !dispChosen) setDisp("shaded");
  if (!$(".studio-refine").hidden) renderCheck();
  drawStoneTags();
}
/** 3D の上に、石の番号の札（石を置く場面か、石を並べたとき） */
function drawStoneTags() {
  const box = $(".stone-tags");
  const r = session?.built?.ring;
  if (!r || kind !== "solitaire" || presentOn || (!placeOn && r.stones.length < 2) || $(".studio-refine").hidden) {
    box.innerHTML = "";
    return;
  }
  const lift = r.shank.outerRadiusMm;
  const bad = new Set(session!.built!.problems.flatMap((p) => (p.target.kind === "space" ? p.target.stones : [])));
  box.innerHTML = r.stones
    .map((x, i) => {
      const [px, py, pz] = placePoint(x.transform, 0, 0, x.stone.heights.tableZ + 0.9);
      const q = viewer.project(px, py, pz + lift);
      return q ? `<i class="${i === selStone ? "on" : ""}${bad.has(i) ? " bad" : ""}" style="left:${q.x.toFixed(1)}px;top:${q.y.toFixed(1)}px">${i + 1}</i>` : "";
    })
    .join("");
}
viewer.onFrame(() => drawStoneTags());
/** 3D の点（指輪の座標）が、どの石の上か（石・石座に当たったとき）。なければ −1 */
function stoneAt(p: [number, number, number], onStone: boolean): number {
  const r = session?.built?.ring;
  if (!r) return -1;
  const rho = Math.hypot(p[1], p[2]);
  const phi = Math.atan2(p[1], p[2]);
  // 腕の外側より上にある点は石座（または石）。腕の面に当たったときは石ではない
  if (!onStone && rho < r.shank.outerRadiusMm + 0.15) return -1;
  let best = -1;
  let bestD = Infinity;
  r.stones.forEach((x, i) => {
    const d = Math.abs(phi - x.phi) * rho;
    const reach = Math.max(x.params.longMm, x.params.widthMm) / 2 + 1.2;
    if (d < reach && d < bestD) [best, bestD] = [i, d];
  });
  return best;
}
{
  const gl = $(".gl");
  let down: { x: number; y: number; i: number; moved: boolean } | null = null;
  let raf = 0;
  gl.addEventListener(
    "pointerdown",
    (e) => {
      if (!placeOn || measure?.on || !session?.built || kind !== "solitaire") return;
      const hit = viewer.pickRing(e.clientX, e.clientY);
      const i = hit ? stoneAt(hit.p, hit.stone) : -1;
      down = { x: e.clientX, y: e.clientY, i, moved: false };
      // 石の上で押したら、回すのを止めて、石を腕に沿って動かす
      if (i >= 0) viewer.setOrbit(false);
    },
    { capture: true },
  );
  addEventListener("pointermove", (e) => {
    if (!down || down.i < 0 || !session) return;
    if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) return;
    down.moved = true;
    const p = viewer.pickPlaneX(e.clientX, e.clientY, 0);
    if (!p) return;
    const at = Math.atan2(p[1], p[2]) * session.built!.ring.shank.outerRadiusMm;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      session!.moveStone(down?.i ?? selStone, Math.round(at * 100) / 100);
      holdPanel = true;
      viewer.keepCamera = true;
      session!.build("");
    });
  });
  addEventListener("pointerup", (e) => {
    const d = down;
    down = null;
    viewer.setOrbit(true);
    if (!d || !session?.built) return;
    if (d.moved) {
      holdPanel = false;
      selStone = d.i;
      cancelAnimationFrame(raf);
      session.build("石を動かした");
      viewer.keepCamera = false;
      return;
    }
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    if (d.i >= 0) {
      // 押した石を選ぶ（もう一度押すと選ぶのをやめる）
      selStone = selStone === d.i ? -1 : d.i;
      renderCheck();
      drawStoneTags();
      return;
    }
    const hit = viewer.pickRing(e.clientX, e.clientY);
    if (!hit) return;
    // 腕の上を押したら、そこに石を足す（腕の上の側だけ）
    if (hit.p[2] <= 0) return toast("腕の上の側（石のある側）を押してください");
    const at = Math.atan2(hit.p[1], hit.p[2]) * session.built.ring.shank.outerRadiusMm;
    viewer.keepCamera = true;
    selStone = session.addStone(Math.round(at * 100) / 100);
    session.build("石を置いた");
    viewer.keepCamera = false;
  });
}
function applyFix(id: string, sess: RingSession = session!, prob?: Problem) {
  const session = sess;
  const s = session!.state;
  const std = session!.built!.ring.setting.standardProngMm;
  // 石を並べた指輪で、真ん中の石でない石の問題は、その石だけを直す
  const si = prob?.stone ?? 0;
  const other = si > 0 ? session.built!.ring.stones[si] : null;
  if (other && (id === "thicker" || id === "moreProngs" || id === "addProng" || id === "bezel" || id === "vAtCorner")) {
    if (id === "thicker") {
      const need = Math.max(prob!.check === "prong-thin" ? prob!.requiredValue : 0, other.setting.standardProngMm);
      session.editStone(si, { prongMm: Math.ceil(Math.max(need, (other.setting.prongs[0]?.diameterMm ?? need) * 1.15) * 100) / 100 });
    } else if (id === "bezel") session.editStone(si, { style: "bezel" });
    else if (id === "vAtCorner") session.editStone(si, { style: "prong", prongCount: undefined });
    else session.editStone(si, { prongCount: Math.min(8, other.setting.prongs.length + 1) });
    session.build("直し方から");
    return;
  }
  switch (id) {
    case "spreadStones":
      session.spreadStones(prob?.target.kind === "space" ? prob.target.stones : undefined);
      session.build("直し方から");
      break;
    case "smallerStones":
      session.smallerStones();
      session.build("直し方から");
      break;
    case "raise": {
      // 決まりのすき間まで上げる（高めでも足りないときは、すき間を直接その値に）
      const fg = session!.built!.problems.find((p) => p.check === "finger-gap");
      if (s.height !== "high" && !fg) session!.setSetting({ height: s.height === "low" ? "standard" : "high", reason: "直し方から" });
      else if (fg) {
        s.culetGapMm = Math.ceil((fg.requiredValue + 0.05) * 100) / 100;
        session!.build("直し方から");
      } else session!.build("直し方から");
      break;
    }
    case "lower":
      session!.setSetting({ height: s.height === "high" ? "standard" : "low", reason: "直し方から" });
      break;
    case "tipUp":
    case "tipDown":
      // 爪の先の高さが目安を外れるのは、先の反りや長さを手で直したとき。その直しを消す
      session!.resetProngTips();
      break;
    case "thicker": {
      // 必要な太さまで一度に上げる（何度も押さなくてよいように）
      const need = Math.max(...session!.built!.problems.filter((p) => p.check === "prong-thin").map((p) => p.requiredValue), std);
      session!.setSetting({ prong_mm: Math.ceil(Math.max(need, (s.prongMm ?? std) * 1.15) * 100) / 100, reason: "直し方から" });
      break;
    }
    case "moreProngs":
    case "addProng":
      session!.setSetting({ prong_count: Math.min(8, session!.built!.ring.setting.prongs.length + 1), reason: "直し方から" });
      break;
    case "bezel":
      session!.setSetting({ style: "bezel", reason: "直し方から" });
      break;
    case "vAtCorner":
      // V 字の爪は画面では使わないので、角の数だけ爪を置き、角に寄せる（爪の置き方の自動）
      session!.setSetting({ style: "prong", v_corners: false, prong_count: 0, reason: "直し方から" });
      break;
    case "shallowerRelief": {
      const relief = reliefFixInput(s, session!.built!.ring.shank.relief?.peakUnderMm ?? 0);
      if (relief) session!.setShank({ relief, reason: "直し方から" });
      break;
    }
    case "smallerTsuchime":
      session!.setShank({ finish: { tsuchime: smallerTsuchime(s.finish) }, reason: "直し方から" });
      break;
    case "noTsuchime":
      session!.setShank({ finish: { tsuchime: "none" }, reason: "直し方から" });
      break;
    case "noMilgrain":
      session!.setShank({ finish: { milgrain: "none" }, reason: "直し方から" });
      break;
    case "thickerBand":
      session!.setShank({ ...bandFixInput("thickerBand", s), reason: "直し方から" });
      break;
    case "widerBand":
      session!.setShank({ ...bandFixInput("widerBand", s), reason: "直し方から" });
      break;
    case "thickerWire": {
      // テンションの腕の線を 1 歩太く（幅と厚みを同じだけ）
      const next = round2(session!.built!.ring.shank.thicknessMm + WIRE_STEP_MM);
      session!.setShank({ width_mm: next, thickness_mm: next, reason: "直し方から" });
      break;
    }
    case "thinnerWire": {
      const next = round2(session!.built!.ring.shank.thicknessMm - WIRE_STEP_MM);
      session!.setShank({ width_mm: next, thickness_mm: next, reason: "直し方から" });
      break;
    }
    case "turnGrip":
      session!.setSetting({ tension_grip: nextGrip(session!.built!.ring.setting.tension), reason: "直し方から" });
      break;
    case "prongInstead":
      session!.setSetting({ style: "prong", reason: "直し方から" });
      break;
    case "thickerCollar":
      // 下の輪の板の厚みを、決まりの最低まで一度に
      s.collarWallMm = Math.max(prob?.requiredValue ?? 0, session!.built!.ring.setting.collar?.wallMm ?? 0);
      session!.build("直し方から");
      break;
    case "tallerCollar":
      s.collarHeightMm = Math.round(((session!.built!.ring.setting.collar?.heightMm ?? 0) + COLLAR_STEP_MM) * 100) / 100;
      session!.build("直し方から");
      break;
    case "thinnerBand":
      session!.setShank({ thickness_mm: Math.max(GUIDES.band.minThicknessMm, Math.round((session!.built!.ring.shank.thicknessMm - BAND_THIN_STEP_MM) * 100) / 100), reason: "直し方から" });
      break;
    case "bluntTip":
      // とがりは形の好みに深くかかわるので、自動では直さない。断面を描く画面を開いて、赤い所を見せる
      manualOpen = true;
      $(".fix-pop").hidden = true;
      setMode("refine");
      session!.build("直し方から");
      requestAnimationFrame(() => document.querySelector(".studio-refine .sec-edit")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      break;
    default:
      session!.build("直し方から");
  }
}

// ---- 作る。：鋳造と鍛造の工程（この石・この形から計算した数字つき） ----
/** 画面の地金 → 温度の表の地金（表のない地金は null） */
function alloyOf(m: Metal): AlloyId | null {
  return m === "k18yg" ? "k18y" : m === "pt900" ? "pt900" : m === "sv925" ? "sv925" : null;
}
/** 前の記録から：この工程で、前に職人が話したコツ */
function pastTipsHtml(title: string): string {
  const past = tipsFor(loadWorks(), title);
  if (!past.length) return "";
  return `<div class="past"><small>前の記録から</small>${past.map((t) => `<p><i class="k-${t.kind}">${esc(t.kind)}</i>${esc(t.text)}<span>${esc(t.maker || "職人")} ・ ${esc(t.date)}</span></p>`).join("")}</div>`;
}
/**
 * 作り方の札：番号・題・流れの文・この指輪の数字の表・職人の決まり・前の記録。
 * 流れの文の中の道具と専門の言葉を押すと、そのすぐ下に開き、もう一度押すと閉じる（下にまとめる「詳しく」はやめた。作者の声 2026-11-05）。
 * 文に出てこない道具だけ、札の最後に一言で書く。同じ言葉に印を付けるのは、札の中で 1 回だけ
 */
function stepsHtml(steps: Step[]): string {
  return `<ol class="cards">${steps
    .map((st, i) => {
      const c = stepCard(st, i);
      const f = cardFlow(c, method);
      const seen = new Set<string>();
      const mark = (t: string) => markTerms(esc(t), seen);
      const lead = mark(c.text);
      const added = f.added ? `<p>${mark(f.added)}</p>` : "";
      const lines = f.lines.map((l) => (l.g ? `<p class="flow-g">${mark(l.g)}</p>` : `<p>${mark(l.t ?? "")}</p>`)).join("");
      return `<li class="mk-card">
        <div class="card-head"><span class="n">${c.no}</span><div><h3>${esc(c.title)}</h3><p class="card-lead">${lead}</p></div></div>
        ${added || lines ? `<div class="flow">${added}${lines}</div>` : ""}
        ${c.rows.length ? `<table class="spec">${c.rows.map((x) => `<tr><th scope="row">${esc(x.label)}</th><td>${esc(x.value)}</td></tr>`).join("")}</table>` : ""}
        ${c.watch ? `<p class="watch">${mark(c.watch)}</p>` : ""}
        ${makingRulesHtml(st.id)}${pastTipsHtml(st.title)}
        ${f.rest.length ? `<p class="flow-tools">ほかに使う道具：${mark(f.rest.join("、"))}</p>` : ""}
        ${stepSourcesHtml(st)}
      </li>`;
    })
    .join("")}</ol>`;
}
/** 札の出どころ（技の作り方の目安帳から作った工程だけ）：職人が確かめたことと、資料の名前（開ける所はつなぐ） */
function stepSourcesHtml(st: Step): string {
  if (!st.sources?.length && !st.checkedBy) return "";
  const list = (st.sources ?? []).map((x) => (x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>` : esc(x.label))).join("　");
  return `<p class="card-src">${st.checkedBy ? `<span class="card-checked">職人が確かめた：${esc(st.checkedBy)}</span>` : ""}${list ? `<span>出どころ：${list}</span>` : ""}</p>`;
}
/** いちばん近い、中を動かせる親（なければページ） */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === "auto" || y === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}
/**
 * 言葉を押すと、その文のすぐ下に、やわらかい箱で意味を出す（もう一度押すと消す。道具なら使い方も）。
 * 開くのは 1 つだけ。上の箱が閉じても、押した言葉が画面の同じ所に残るように動かす
 */
function bindTerms(box: HTMLElement) {
  box.querySelectorAll<HTMLButtonElement>(".term").forEach((b) =>
    b.addEventListener("click", () => {
      const word = b.dataset.term!;
      const wasOpen = b.getAttribute("aria-expanded") === "true";
      const y0 = b.getBoundingClientRect().top;
      box.querySelectorAll(".term-def").forEach((x) => x.remove());
      box.querySelectorAll(".term[aria-expanded]").forEach((x) => x.removeAttribute("aria-expanded"));
      if (!wasOpen) {
        const g = glossOf(word);
        if (g) {
          const line = b.closest<HTMLElement>("li:not(.mk-card), p")!;
          const el = document.createElement("div");
          el.className = "term-def";
          el.dataset.term = word;
          const t = g.tool;
          el.innerHTML = `<p class="td-h"><b>${esc(g.word)}</b>${g.reading ? `<small>${esc(g.reading)}</small>` : ""}${t ? `<i>道具 ・ ${esc(t.kind)}</i>` : ""}</p>
        <p>${esc(g.meaning)}</p>${t && t.what !== g.meaning ? `<p>${esc(t.what)}</p>` : ""}
        ${t ? `<p class="td-sub">使い方${t.name !== g.word ? `（${esc(t.name)}）` : ""}</p><ol>${t.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>${t.watch ? `<p class="td-watch">${esc(t.watch)}</p>` : ""}` : ""}`;
          // 行（li）の中なら行の終わりに、文（p）なら文のすぐ後に置く
          if (line.tagName === "LI") line.appendChild(el);
          else line.after(el);
          b.setAttribute("aria-expanded", "true");
        }
      }
      const dy = b.getBoundingClientRect().top - y0;
      if (Math.abs(dy) > 1) {
        const sc = scrollerOf(b);
        if (sc) sc.scrollTop += dy;
        else scrollBy(0, dy);
      }
    }),
  );
}
let method: Method = "hand";
/** 作り方や記録に使う石の数字（今の石、または見本の石） */
interface StoneInfo {
  shapeName: string;
  outlineMm: readonly { x: number; y: number }[];
  longMm: number;
  widthMm: number;
  depthMm: number;
}
const currentStone = (): StoneInfo => ({ shapeName: stone!.shapeName, outlineMm: stone!.measured.outlineMm, longMm: stone!.measured.longMm, widthMm: stone!.measured.widthMm, depthMm: stone!.depthMm });
function howInput(b: Built, sess: RingSession = session!, info: StoneInfo = currentStone()) {
  const m = sess.state.metal;
  return { ring: b.ring, outlineMm: info.outlineMm, longMm: info.longMm, widthMm: info.widthMm, depthMm: info.depthMm, metalLabel: METAL_LABEL[m], alloy: alloyOf(m), springMetal: springIdOf(m), irogane: isIrogane(m) ? m : undefined, guides: sess.guides() };
}
function sheet(): string | undefined {
  if (!stone) return;
  const m = stone.measured;
  return patternSvg({ ...m, depthMm: stone.depthMm, shapeName: stone.shapeName, label: stone.label, date: new Date().toLocaleDateString("ja-JP") });
}
/** 印刷（新しい窓を開かない。ポップアップを止めるブラウザでも印刷できる） */
const openPrint = printHtml;
function renderBuild() {
  if (kind === "band") return renderBandBuild();
  if (!session?.built || !stone) return;
  const b = session.built;
  const steps = howToMake(howInput(b), method);
  const box = $(".build-panel");
  const probs = grouped(b);
  box.innerHTML = `
    ${
      isIrogane(session.state.metal)
        ? `<div class="seg method"><button type="button" data-m="hand" aria-pressed="true">鍛造</button><button type="button" data-m="cast" aria-pressed="false" disabled title="色金は板と線から作る">鋳造</button></div><p class="note-b">${esc(METAL_LABEL[session.state.metal])}は、板と線から作ります（色金の鋳造の目安は、資料にありません）。</p>`
        : `<div class="seg method"><button type="button" data-m="hand" aria-pressed="${method === "hand"}">鍛造</button><button type="button" data-m="cast" aria-pressed="${method === "cast"}">鋳造</button></div>`
    }
    ${probs.length ? `<p class="build-warn">このままでは作れない所が ${probs.length} あります。<button type="button" class="link to-check">確かめる →</button></p>` : ""}
    ${stepsHtml(steps)}
    <p class="note-b">寸法は、この石とこの形から計算した目安。${NOTE}</p>
    <div class="row out"><button type="button" class="primary p-instr">図面・指示書を印刷</button><button type="button" class="ghost-d p-stl">STL を書き出す</button></div>
    <div class="save-work"><button type="button" class="next-btn p-save">この作品の記録を残す</button></div>`;
  box.querySelector(".p-save")!.addEventListener("click", () => openSaveWork(box.querySelector(".save-work")!, solitaireData()));
  box.querySelectorAll<HTMLButtonElement>(".method button").forEach((btn) =>
    btn.addEventListener("click", () => {
      method = btn.dataset.m as Method;
      renderBuild();
    }),
  );
  box.querySelector(".to-check")?.addEventListener("click", () => setMode("refine"));
  bindTerms(box);
  box.querySelector(".p-instr")!.addEventListener("click", () => printSheet());
  box.querySelector(".p-stl")!.addEventListener("click", () => exportStl());
}

/** 図面・指示書を印刷する（印刷する物を選ぶ窓から）。どの場面からでも */
function printSheet() {
  // 図面は 3D の絵から描くので、細かい一体の形にしてから
  if (kind === "solitaire") session?.flush();
  if (kind === "band") {
    if (!bandPositions) return;
    return askPrint(false, (pick) => {
      const probs = bandProblems();
      openPrint(
        sheetHtml({
          includeSteps: pick.steps,
          includeDetails: pick.details,
          drawingHtml: pick.drawing ? bandDrawing(probs.map((p) => p.title)) : "",
          title: bandName(),
          date: today(),
          imageDataUrl: withWholeBand(() => viewer.snapshot()),
          specs: [...bandSpecRows(band, bandWeight), ...widthSpecRow(bandWidthNote(band, bandGuides())), ...grooveSpecRow(bandGrooveNote(band, bandGuides()))],
          problems: probs.map((p) => `${p.title}（${p.current} → ${p.required}）`),
          methodLabel: method === "hand" ? "鍛造" : "鋳造",
          steps: bandHowTo(band, method, bandWeight, alloyOf(bandMetal)),
          patternSvg: "",
        }),
      );
    });
  }
  if (!session?.built || !stone) return toast("指輪が組み上がるまで、少し待ってください");
  askPrint(true, (pick) => {
    const svg = sheet();
    if (!svg || !session?.built) return;
    const b = session.built;
    const probs = grouped(b);
    const r = b.ring;
    const st = r.setting;
    openPrint(
      sheetHtml({
        title: `${stone!.shapeName}の一粒石の指輪`,
        date: today(),
        imageDataUrl: viewer.snapshot(),
        specs: [
          { label: "石", value: `${stone!.measured.longMm.toFixed(2)} × ${stone!.measured.widthMm.toFixed(2)} × ${stone!.depthMm.toFixed(2)} mm` },
          { label: "号", value: `${session.state.gou} 号 ・ 内径 ${r.shank.innerDiameterMm.toFixed(1)} mm` },
          { label: "留め方", value: st.tension ? tensionWord(st) : st.style === "bezel" ? `覆輪 ・ 壁 ${st.bezel?.wallMm.toFixed(2)} mm` : `爪 ${st.prongs.length} ・ ${prongDiaWord(st)}${st.prongTip === "oni" ? ` ・ ${PRONG_TIP_LABEL.oni}` : ""}` },
          { label: "腕", value: `${r.shank.widthMm.toFixed(1)} × ${r.shank.thicknessMm.toFixed(1)} mm` },
          { label: "石と指のすき間", value: `${r.culetGapMm.toFixed(2)} mm` },
          { label: "地金", value: `${METAL_LABEL[session.state.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g` },
          ...(finishWords(session.state.finish).length ? [{ label: "仕上げ", value: finishWords(session.state.finish).join(" ・ ") }] : []),
          ...widthSpecRow(narrowArmOf(b)),
          ...grooveSpecRow(handGrooveOf(b)),
        ],
        problems: probs.map(({ p }) => `${SHORT[p.check] ?? p.where}（${p.current} → ${p.required}）`),
        methodLabel: method === "hand" || isIrogane(session.state.metal) ? "鍛造" : "鋳造",
        steps: howToMake(howInput(b), method),
        patternSvg: pick.pattern ? svg : "",
        includeSteps: pick.steps,
        includeDetails: pick.details,
        drawingHtml: pick.drawing ? solitaireDrawing(b, probs.map(({ p }) => SHORT[p.check] ?? p.where)) : "",
      }),
    );
  });
}
/** STL を書き出す。どの場面からでも。作れない所があれば、書き出したうえで知らせる */
function exportStl() {
  const save = (positions: Float32Array, name: string, problems: number) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toStl(positions)], { type: "model/stl" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(`STL を書き出しました：${name}${problems ? `（作れない所が ${problems} あります。確かめるで直せます）` : ""}`);
  };
  if (kind === "band") {
    if (bandPositions) save(bandPositions, `継ぐ_${bandName()}_${band.gou}号.stl`, bandProblems().length);
    return;
  }
  if (!session?.built || !stone) return toast("指輪が組み上がるまで、少し待ってください");
  // 動かした直後は、すぐの形・粗い形のことがある。STL はいつも細かい一体の形で
  session.flush();
  const r = session.built.ring.ringPositions;
  const all = new Float32Array(r.setting.length + r.shank.length);
  all.set(r.setting, 0);
  all.set(r.shank, r.setting.length);
  save(all, `継ぐ_${stone.shapeName}_${session.state.gou}号.stl`, grouped(session.built).length);
}

async function addRuleFromWords(said: string) {
  if (!said) return;
  const name = masterName(store.ledger());
  const slot = $(".ar-proposal");
  const pass = store.password() || (await askPassword(true));
  if (!pass) {
    slot.innerHTML = `<p class="tech-what">決まりの案を作るには Claude が要ります。合言葉がなくても、下の「Claude なしで、数字で書く」で決まりにできます。</p>`;
    showProposalSlot();
    return;
  }
  slot.innerHTML = `<p class="tech-what"><span class="pulse"></span> Claude が決まりの案にしています…</p>`;
  showProposalSlot();
  const host: ToolHost<null> = {
    setSetting: () => Promise.reject(new Error("使わない")),
    setShank: () => Promise.reject(new Error("使わない")),
    check: () => Promise.reject(new Error("使わない")),
    look: () => Promise.reject(new Error("使わない")),
    snapshot: () => null,
    restore: () => undefined,
    proposeRule: (p) => propose(slot, p, name, said),
  };
  const now = designNow();
  const design = now ? designNowText(store.ledger(), now) : kind === "band" ? "今の設計：地金だけの指輪（石はない）。" : "今の設計：まだ組み上がっていない。";
  const r = await runClaude({ host, messages: [{ role: "user", content: `${name}さんが、今の設計を見ながら話したこと：${said}` }], system: correctPrompt(store.ledger(), name, design), tools: TOOLS.filter((t) => t.name === "propose_rule"), password: pass, maxTurns: 3, speed: "fast" });
  if (r.offline || (r.error && !r.log.length)) {
    if (r.error?.code === "wrong_password") resetPassword();
    $(".ar-proposal").innerHTML = `<p class="tech-what">${esc(offlineWords(r.error?.message, "通信を確かめて、もう一度試してください。"))}</p>`;
    showProposalSlot();
  }
}
/**
 * 決まりの案の所まで欄を動かす。「これまでの作品」の欄があると、案が画面の下に隠れて見えなかった（2026-11-05）。
 * 撮影（?rec・?nointro）では動かさない（台本が自分で動かす）
 */
function showProposalSlot() {
  if (filming()) return;
  requestAnimationFrame(() => document.querySelector(".ar-proposal")?.scrollIntoView({ behavior: "smooth", block: "center" }));
}
function propose(slot: HTMLElement, p: ProposeRuleInput, name: string, said = ""): Promise<ProposeRuleResult> {
  return new Promise((resolve) => {
    // 待っている間に欄が描き直されていても、今の欄に出す
    if (!slot.isConnected) slot = $(".ar-proposal");
    // 爪の太さを石の大きさで言ったときは、職人の点と、Claude が割合で推し量った点を、前 → 後の表で見せる
    const pv = isPointProposal(p) ? previewPoints(store.ledger(), p, said, designNow(), today()) : null;
    const valueLine = pv?.added.length ? "" : p.param ? `<p class="tech-what">値：${p.value}${PARAMS[p.param].unit ? ` ${esc(PARAMS[p.param].unit)}` : ""}</p>` : "";
    slot.innerHTML = `<div class="proposal-d"><b>${esc(p.title)}</b>${said ? `<p class="pp-said">「${esc(said)}」</p>` : ""}<p>${esc(p.text)}</p><p class="tech-what">なぜ：${esc(p.reason)}</p>${valueLine}${pv ? pointsPreviewHtml(pv) : ""}${!p.param && p.steps?.length ? `<p class="tech-what">入る工程：${esc(p.steps.map((s) => MAKING_STEPS[s]).join("・"))}</p>` : ""}
      <div class="row"><button type="button" class="primary ok">これでいい</button><button type="button" class="ghost-d no">いらない</button></div></div>`;
    showProposalSlot();
    // 案は欄の描き直しで今の欄へ移されることがあるので、案そのものを消す
    const card = slot.querySelector<HTMLElement>(".proposal-d")!;
    card.querySelector(".no")!.addEventListener("click", () => {
      card.remove();
      resolve({ status: "declined", note: "職人が見送った" });
    });
    card.querySelector(".ok")!.addEventListener("click", () => {
      if (!askConfirm(`この決まりを帳面に入れますか？\n「${p.title}」\n今の設計とこれまでの作品を確かめ直します。`)) return;
      // 押したらすぐ案を消す（2 度押しで同じ決まりが 2 つ入らないように）
      card.remove();
      resolve({ status: "accepted", rule_id: acceptRule(p, name, said) });
    });
  });
}
/** 職人の点と推測の点を持つ爪の決まりの名前（直すたびに Claude の案の名前が変わらないように、いつも同じ） */
const PRONG_POINTS_TITLE = "爪の最低の太さ（石の大きさで）";
/** 「Claude に教える」で、職人が見ている今の設計（石の大きさと爪の太さ）。一粒石の指輪で、組み上がっているときだけ */
function designNow(): DesignNow | undefined {
  if (kind !== "solitaire" || !session?.built) return undefined;
  const st = session.built.ring.setting;
  const size = Math.round(stoneSizeMm(session.stone.longMm, session.stone.widthMm) * 10) / 10;
  const prong = st.style === "prong" && !st.tension ? st.prongs[0]?.diameterMm : undefined;
  return { stoneMm: size, ...(prong !== undefined ? { prongMm: Math.round(prong * 100) / 100 } : {}) };
}
/** 石の大きさごとの爪の最低の表（職人の点と推測の点）。before があれば「いま → この案」の 2 行 */
function pointsTableHtml(rows: { stoneMm: number; after: { value: number; by: string }; before?: { value: number; by: string } }[], nowMm?: number): string {
  const tag = (by: string) => (by === "craftsman" ? `<i class="pt-c">職人</i>` : by === "inferred" ? `<i class="pt-g">推測</i>` : `<i class="pt-p">目安</i>`);
  const head = rows.map((r) => `<th${nowMm !== undefined && Math.abs(r.stoneMm - nowMm) < 0.5 ? ` class="pt-now"` : ""}>${mmText(r.stoneMm)}</th>`).join("");
  const cell = (x: { value: number; by: string }, changed: boolean) => `<td class="${x.by === "craftsman" ? "is-c" : x.by === "inferred" ? "is-g" : "is-p"}${changed ? " chg" : ""}">${x.value.toFixed(2)}${tag(x.by)}</td>`;
  const hasBefore = rows.some((r) => r.before);
  return `<table class="pt-table"><thead><tr><th>石の大きさ（mm）</th>${head}</tr></thead><tbody>${
    hasBefore ? `<tr class="pt-before"><th>いま</th>${rows.map((r) => (r.before ? cell(r.before, false) : "<td></td>")).join("")}</tr>` : ""
  }<tr class="pt-after"><th>${hasBefore ? "この案" : "爪の最低（mm）"}</th>${rows.map((r) => cell(r.after, Boolean(r.before && (Math.abs(r.before.value - r.after.value) > 0.004 || r.before.by !== r.after.by)))).join("")}</tr></tbody></table>`;
}
/** 決まりの案の、職人の点と推測の点（前 → 後） */
function pointsPreviewHtml(pv: PointsPreview): string {
  if (!pv.added.length) return pv.dropped.length ? `<p class="pp-drop">${pv.dropped.map(esc).join("<br>")}</p>` : "";
  const now = designNow();
  const said = pv.added.map((c) => `石の大きさ ${mmText(c.stoneMm)} mm → 最低 ${mmText(c.value)} mm`).join("、");
  return `<div class="pp">
    <p class="pp-read"><small>Claude の読み取り</small>${esc(said)}<i class="pt-c">職人</i></p>
    ${pointsTableHtml(pv.rows, now?.stoneMm)}
    <p class="pp-how"><small>推測の出し方</small>${esc(pv.rule.inferNote ?? "")}</p>
    ${pv.claudeWhy.length ? `<p class="pp-why"><small>Claude の考え</small>${pv.claudeWhy.map(esc).join(" ／ ")}</p>` : pv.claudeRedone ? `<p class="pp-why"><small>Claude の考え</small>Claude の推測を、職人の点をすべて通る同じ計算で出し直しました（表の値）。</p>` : ""}
    ${pv.dropped.length ? `<p class="pp-drop">${pv.dropped.map(esc).join("<br>")}</p>` : ""}
    <p class="pp-note">推測は、職人がまだ確かめていない値です。ちがえば一言で直せます（例：「18 ミリなら 1.2 は欲しい」）。${esc(GUIDE_NOTE)}</p>
  </div>`;
}
/** 職人が「これでいい」と言った決まりを帳面に足し、今の設計とこれまでの作品を確かめ直す（Claude の案でも、数字で書いた決まりでも同じ） */
function acceptRule(p: ProposeRuleInput, _name: string, said = ""): string {
  // 出どころは、はじめの帳面なら職人の名前、工房の帳面なら工房の名前。知らせには帳面の呼び名（工房 A など）
  const name = sourceName(store.ledger(), store.workshops().active === MAIN);
  const by = bookLabel(store.ledger());
  const isBand = kind === "band";
  const before = isBand ? bandProblems().length : (session?.built?.problems.length ?? 0);
  // 爪の太さを石の大きさで言ったときは、職人の点を前の職人の点に足し、ほかの大きさは割合で推し量った推測の点にする（src/rules/prong-points.ts）
  const added = isPointProposal(p) ? craftPointsFromProposal(p, said, designNow(), today()).points : [];
  const pointsRule = added.length ? prongPointsRule(mergeCraftPoints(craftProngPoints(store.ledger()), added), added[added.length - 1].value) : null;
  const prev = craftProngRule(store.ledger());
  const next = pointsRule
    ? addRule(store.ledger(), { title: PRONG_POINTS_TITLE, reason: prev?.reason && /まだ聞いていない/.test(p.reason) ? prev.reason : p.reason, example: p.example, quote: p.quote ?? said, ...pointsRule, source: { kind: "craftsman", name }, date: today() })
    : addRule(store.ledger(), { title: p.title, text: p.text, reason: p.reason, example: p.example, quote: p.quote, param: p.param, value: p.value, steps: p.steps, bySize: p.by_size?.map((x) => ({ upToMm: x.up_to_mm, value: x.value })), source: { kind: "craftsman", name }, date: today() });
  store.setLedger(next);
  const id = next.rules[next.rules.length - 1].id;
  lastRule = { by, quote: p.quote || p.text, spoken: Boolean(p.quote), before: !isBand && session?.built ? grouped(session.built).length : before, after: 0, checks: p.param ? [...PARAMS[p.param].checks] : [] };
  fixLog = [];
  ruleDraft = "";
  // 爪の太さの決まりなら、今の設計の爪を手で決めた値から外し、新しい決まりの「基本の太さ」で組み直す
  // （作者の声：一言を決まりにすると、まず基本の形が出て、そこから調整できる）
  if (session && p.param?.startsWith("prong.")) {
    session.state.prongMm = undefined;
    tuneProngs();
  }
  // 地金のみの指輪を見ている間は、石のある形を作り直さない（作り直すと 3D が入れ替わる）。一粒石の指輪に戻るときに作り直す
  const after = isBand ? bandProblems().length : session ? session.build("帳面が変わった").problems.length : 0;
  lastRule.after = !isBand && session?.built ? grouped(session.built).length : after;
  if (isBand) showBand(true);
  pastCheck = recheckWorks(lastRule);
  if (!$(".studio-refine").hidden) {
    renderCheck();
    // 決まりを足したら、上の「〇〇さんの決まりで、確かめ直しました」まで戻して見せる
    requestAnimationFrame(() => document.querySelector(".rule-flash")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  toast(p.param ? `${by}の決まりで確かめ直しました：作れない所 ${before} → ${after}` : `${bookTitle(by)}に決まりを足しました`);
  flashVerdict();
  return id;
}
// ---- 職人の声：決まりに職人本人の声を添え、赤い所や問題の札から聞けるようにする ----
let voices = new Set<string>();
void voiceIds().then((v) => {
  voices = v;
  if (!$(".studio-refine").hidden) renderCheck();
});
/** その確かめに効く、職人の決まり（いちばん新しいもの） */
function craftRuleFor(check: string): Rule | undefined {
  return activeRules(store.ledger())
    .filter((r) => r.source.kind === "craftsman" && (r.checks?.includes(check as never) || (r.param && (PARAMS[r.param].checks as readonly string[]).includes(check))))
    .at(-1);
}
// 3D の赤い所を押すと、その問題に効く職人の決まりの声が流れる（声がなければ、職人の言葉と理由を出す）
viewer.onWarnClick(() => {
  // 寸法を引いている間と、爪を選んだ押しでは、案内を流さない
  if (measure?.on || prongEdit?.claimed) return;
  if (kind === "band") {
    const list = bandProblems();
    for (const p of list) {
      const r = craftRuleFor(p.check);
      if (r && voices.has(r.id)) return void playRuleVoice(r);
    }
    if (!list.length) return;
    const r = craftRuleFor(list[0].check);
    return toast(r?.quote ? `「${r.quote}」（${masterName(store.ledger())}）` : list[0].why);
  }
  const probs = session?.built ? grouped(session.built) : [];
  for (const { p } of probs) {
    const r = craftRuleFor(p.check);
    if (r && voices.has(r.id)) return void playRuleVoice(r);
  }
  const p = probs[0]?.p;
  if (!p) return;
  const r = craftRuleFor(p.check);
  toast(r?.quote ? `「${r.quote}」（${masterName(store.ledger())}）` : p.reason);
});
let stopRec: (() => Promise<Blob>) | null = null;
let recFor = "";
async function toggleRecord(ruleId: string) {
  if (stopRec) {
    const stop = stopRec;
    stopRec = null;
    const blob = await stop();
    await putVoice(recFor, blob);
    voices.add(recFor);
    toast("職人の声を、決まりに添えました");
    renderCheck();
    return;
  }
  try {
    recFor = ruleId;
    stopRec = await startRecording(() => void toggleRecord(ruleId));
    renderCheck();
  } catch {
    stopRec = null;
    toast("マイクが使えませんでした（ブラウザの設定で、マイクを許してください）");
  }
}
async function playRuleVoice(r: Rule) {
  if (await playVoice(r.id)) toast(`${masterName(store.ledger())}の声：「${r.quote ?? r.text}」`);
}

// ---- 職人の一言で、設計の決まりが変わる（確かめるの中） ----
let lastRule: { by: string; quote: string; spoken: boolean; before: number; after: number; checks: string[] } | null = null;
let fixLog: { text: string; cls: string }[] = [];
let ruleDraft = "";
/** 決まりの欄の「話す」（欄を描き直す前に止める。止めないと、ボタンは戻るのにマイクだけ聞き続けた） */
let ruleVoice: { stop(): void } | null = null;
function rulesSectionHtml(): string {
  const name = masterName(store.ledger());
  const all = activeRules(store.ledger()).filter((r) => r.source.kind === "craftsman");
  const mine = all.filter((r) => isCheckRule(r));
  const making = all.filter((r) => !isCheckRule(r));
  const where = (r: Rule) => stepsOfRule(r).map((s) => MAKING_STEPS[s]).join("・");
  const now = designNow();
  const here = now ? prongMinAt(store.ledger(), now.stoneMm) : null;
  const hereTag = here ? (here.by === "craftsman" ? `<i class="pt-c">職人</i>` : here.by === "inferred" ? `<i class="pt-g">推測</i>` : `<i class="pt-p">目安</i>`) : "";
  return `<section class="sec rules-sec teach-sec"><h4>Claude に教える<small>職人の決まり ・ 確かめに効く ${mine.length} 件</small></h4>
    <p class="hint">今の設計を見ながら、一言で教えてください。Claude が読み取って決まりの案にし、ほかの大きさの石も割合で推し量ります（推測）。ちがう所は、また一言で直せます。「これでいい」を押すと、その場で確かめ直します。</p>
    ${now ? `<p class="teach-now"><small>いまの設計</small>石の大きさ ${now.stoneMm.toFixed(1)} mm${now.prongMm !== undefined ? ` ・ 爪 ø ${now.prongMm.toFixed(2)} mm` : ""} ・ この石の爪の最低 ${here!.value.toFixed(2)} mm${hereTag}</p>` : ""}
    <textarea rows="1" class="ar-text" placeholder="${kind === "band" ? "例：平打ちなら、腕の厚みは最低 1.5 mm" : "例：18 ミリなら 1.2 は欲しい ／ この爪は細く見えるけど、これで十分"}">${esc(ruleDraft)}</textarea>
    <div class="row"><button type="button" class="ghost-d ar-mic">話す</button><button type="button" class="primary ar-go">Claude に教える</button></div>
    <div class="ar-proposal"></div>
    ${prongPointsCardHtml()}
    <details class="more manual-rule"><summary>Claude なしで、数字で書く</summary>
      <label class="mr-row"><span>何の値か</span><select class="mr-param">${(Object.keys(PARAMS) as ParamId[])
        .map((k) => `<option value="${k}"${kind === "band" && k === "band.minThicknessMm" ? " selected" : ""}>${esc(PARAMS[k].label)}${PARAMS[k].unit ? `（${esc(PARAMS[k].unit)}）` : ""}</option>`)
        .join("")}</select></label>
      <label class="mr-row"><span>値</span><input class="mr-value" type="number" step="0.05" min="0" inputmode="decimal" placeholder="例：2.5"></label>
      <label class="mr-row"><span>職人の言葉</span><input class="mr-quote" type="text" placeholder="例：この大きさなら、爪は基本 0.8 mm"></label>
      <div class="row"><button type="button" class="primary mr-go">決まりにする</button></div>
    </details>
    ${mine.length ? `<ul class="rules-mini">${mine
      .slice()
      .reverse()
      .map((r) => `<li><b>${esc(r.title)}</b>${r.param && r.value !== undefined && r.param !== "hold.cornerSet" && !r.sizePoints?.length ? `<span class="v">${r.value} ${esc(PARAMS[r.param].unit)}</span>` : ""}${r.quote ? `<small>「${esc(r.quote)}」</small>` : ""}<small>${esc(name)} ・ ${esc(r.date)}</small><span class="voice-row">${voices.has(r.id) ? `<button type="button" class="link voice-play" data-rid="${esc(r.id)}">▶ 声</button>` : ""}<button type="button" class="link voice-rec${stopRec && recFor === r.id ? " on" : ""}" data-rid="${esc(r.id)}">${stopRec && recFor === r.id ? `■ 止める（${MAX_SECONDS} 秒まで）` : voices.has(r.id) ? "録り直す" : "● 理由を声で残す"}</button></span></li>`)
      .join("")}</ul>` : `<p class="hint">確かめに効く職人の決まりは、まだありません（いまは公開の目安で確かめています）。</p>`}
    ${loadWorks().some((w) => w.design) ? "" : filming() ? `<p class="hint no-works">記録に作品がないので、決まりを足しても「これまでの作品」は確かめ直せません。<button type="button" class="link add-samples">見本の作品を入れて試す</button></p>` : `<p class="hint no-works">設計を記録に残すと、新しい決まりで確かめ直せます。</p>`}
    ${making.length ? `<details class="more making-rules"><summary>作り方の決まり ${making.length} 件（手順の工程に出ます）</summary><ul class="rules-mini">${making
      .slice()
      .reverse()
      .map((r) => `<li><b>${esc(r.title)}</b><small class="where">${where(r) ? `工程：${esc(where(r))}` : "工程なし"}</small><small>${esc(name)} ・ ${esc(r.date)}</small></li>`)
      .join("")}</ul></details>` : ""}
  </section>`;
}
/** 帳面の爪の太さの決まり（職人の点と推測の点）を、表で */
function prongPointsCardHtml(): string {
  const r = kind === "solitaire" ? craftProngRule(store.ledger()) : undefined;
  if (!r?.sizePoints?.length) return "";
  const now = designNow();
  const rows = prongTable(r.sizePoints).map((x) => ({ stoneMm: x.stoneMm, after: x }));
  return `<div class="pt-card"><b>${esc(r.title)}</b><small>${esc(masterName(store.ledger()))} ・ ${esc(r.date)}</small>
    ${pointsTableHtml(rows, now?.stoneMm)}
    ${r.inferNote ? `<p class="pp-how"><small>推測の出し方</small>${esc(r.inferNote)}</p>` : ""}
    <p class="pp-note">職人の点を先に、次に推測の点で確かめます。${esc(GUIDE_NOTE)}</p></div>`;
}
/** 手順の工程の中に出す、職人の作り方の決まり */
function makingRulesHtml(stepId: string | undefined): string {
  if (!stepId) return "";
  const rules = makingRulesFor(activeRules(store.ledger()), stepId);
  if (!rules.length) return "";
  const name = masterName(store.ledger());
  const mine = rules.filter((r) => r.source.kind === "craftsman");
  const pub = rules.filter((r) => r.source.kind !== "craftsman");
  const one = (r: Rule) => `<p class="r-text">${esc(r.text)}</p>${r.reason ? `<p class="r-why">なぜ：${esc(r.reason)}</p>` : ""}${r.quote ? `<p class="r-q">「${esc(r.quote)}」<span>${esc(name)} ・ ${esc(r.date)}</span></p>` : ""}`;
  const src = (r: Rule) => (r.source.kind === "public" && r.source.url ? `<a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(sourceLabel(r.source))}</a>` : esc(sourceLabel(r.source)));
  return `${mine.length ? `<div class="past rule-in-step"><small>職人の決まり</small>${mine.map(one).join("")}</div>` : ""}${
    pub.length
      ? `<details class="past rule-in-step pub-in-step"><summary><small>資料の目安 ${pub.length}（職人がまだ確かめていない）</small></summary>${pub
          .map((r) => `<p class="r-text"><b>${esc(r.title)}</b>：${esc(r.text)}</p><p class="r-why">なぜ：${esc(r.reason)}</p><p class="r-q"><span>${src(r)}${r.unverified ? " ・ 未確認" : ""} ・ ${esc(r.date)}</span></p>`)
          .join("")}</details>`
      : ""
  }`;
}
function bindRules(box: HTMLElement) {
  const field = box.querySelector<HTMLTextAreaElement>(".ar-text");
  if (!field) return;
  // 一行の欄。長く話したら、そのぶん伸びる。Enter で Claude に教える（Shift ＋ Enter は改行）
  const grow = () => {
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + 2}px`;
  };
  requestAnimationFrame(grow);
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      box.querySelector<HTMLButtonElement>(".ar-go")?.click();
    }
  });
  field.addEventListener("input", () => {
    grow();
    ruleDraft = field.value;
    // 欄を描き直したあとに届いた言葉（止める間際に決まった言葉）も、今の欄に入れる
    const now = document.querySelector<HTMLTextAreaElement>(".ar-text");
    if (now && now !== field) now.value = field.value;
  });
  const voice = bindVoice(box.querySelector<HTMLButtonElement>(".ar-mic")!, field);
  ruleVoice = voice;
  box.querySelector(".ar-go")!.addEventListener("click", () => {
    voice.stop();
    ruleDraft = field.value;
    void addRuleFromWords(field.value.trim());
  });
  box.querySelector(".mr-go")?.addEventListener("click", () => {
    const param = box.querySelector<HTMLSelectElement>(".mr-param")!.value as ParamId;
    const value = Number(box.querySelector<HTMLInputElement>(".mr-value")!.value);
    const quote = box.querySelector<HTMLInputElement>(".mr-quote")!.value.trim();
    if (!Number.isFinite(value) || value <= 0) return toast("値を数字で入れてください");
    const d = PARAMS[param];
    acceptRule({ title: d.label, text: `${d.label}は ${value}${d.unit ? ` ${d.unit}` : ""}`, reason: quote || "職人が決めた", quote: quote || undefined, param, value }, masterName(store.ledger()));
  });
  box.querySelector(".add-samples")?.addEventListener("click", () => {
    const n = addSampleWorks();
    toast(`見本の作品を ${n} つ入れました`);
    if (lastRule) pastCheck = recheckWorks(lastRule);
    renderCheck();
  });
}
// ---- 新しい決まりで、これまでの作品を全部確かめ直す ----
interface PastRow {
  work: WorkRecord;
  probs: string[];
  fixed?: string;
  after?: number;
  ok?: boolean;
}
let pastCheck: { rule: string; by: string; total: number; rows: PastRow[] } | null = null;
function workSession(w: WorkRecord): RingSession | null {
  if (!w.design) return null;
  const s = new RingSession(w.design.stone, () => store.ledger(), () => undefined, () => "");
  s.state = structuredClone(w.design.state);
  s.build("記録を確かめ直す");
  return s;
}
const probLabels = (b: Built) => grouped(b).map(({ p }) => `${SHORT[p.check] ?? p.where}（${p.current} → ${p.required}）`);
const bandLabel = (p: BandProblem) => `${p.title}（${p.current} → ${p.required}）`;
function recheckWorks(rule: { by: string; quote: string }) {
  const works = loadWorks().filter((w) => w.design || w.bandDesign);
  const rows: PastRow[] = [];
  for (const w of works) {
    if (w.bandDesign) {
      const labels = checkBand(normalizeBand(w.bandDesign.band), bandGuides()).map(bandLabel);
      if (labels.length) rows.push({ work: w, probs: labels });
      continue;
    }
    const s = workSession(w);
    if (!s?.built) continue;
    const labels = probLabels(s.built);
    if (labels.length) rows.push({ work: w, probs: labels });
  }
  return works.length ? { rule: rule.quote, by: rule.by, total: works.length, rows } : null;
}
/** 地金のみの指輪の記録を、直し方のボタンと同じ直し方で直す（断面を描き直す直し方は、職人に残す） */
function fixPastBand(row: PastRow, by: string, rule: string) {
  const d = row.work.bandDesign!;
  let b = normalizeBand(d.band);
  const before = sizeWord(b);
  for (const p of checkBand(b, bandGuides())) if (!p.fix.editor) b = p.fix.apply(b);
  const left = checkBand(b, bandGuides()).map(bandLabel);
  const change = sizeWord(b) !== before ? `${before} → ${sizeWord(b)}` : "直し方で直した";
  row.fixed = left.length ? `${change}（まだ：${left.join("、")}）` : change;
  row.ok = !left.length;
  row.after = left.length;
  updateWork({ ...row.work, bandDesign: { band: b, metal: d.metal }, problems: left, revisions: [...(row.work.revisions ?? []), { date: today(), by, rule, change }] });
}
function pastCheckHtml(): string {
  if (!pastCheck) return "";
  const { total, rows } = pastCheck;
  const left = rows.filter((r) => !r.ok).length;
  return `<section class="sec past-check"><h4>これまでの作品<small>${total} 作品を確かめ直しました</small></h4>
    ${rows.length ? `<p class="pc-sum"><em class="${left ? "ng" : "ok"}">${left ? `${left} 作品が、この決まりでは作れません` : "すべて、この決まりで作れる形に直しました"}</em></p>
    <ul class="pc-list">${rows
      .map(
        (r, i) => `<li class="${r.ok ? "ok" : "ng"}" style="animation-delay:${i * 0.12}s">${r.work.image ? `<img alt="" src="${r.work.image}">` : "<span></span>"}<div><b>${esc(r.work.title)}</b><small>${esc(r.work.date)}${r.work.maker ? ` ・ ${esc(r.work.maker)}` : ""}</small><p>${esc(r.fixed ?? r.probs.join("、"))}</p></div><i>${r.ok ? "直した" : r.fixed ? "職人へ" : "作れない"}</i></li>`,
      )
      .join("")}</ul>
    ${rows.some((r) => !r.fixed) ? `<button type="button" class="next-btn past-fix">今の設計も、これまでの作品も、直し方でまとめて直す</button>` : left ? `<p class="hint">直し方だけでは直らない作品は、職人が見て決めます。次に作る人の設計にも、この決まりが効きます。</p>` : `<p class="hint">次に作る人の設計にも、この決まりが効きます。</p>`}` : `<p class="pc-sum"><em class="ok">どの作品も、この決まりで作れる形でした</em></p>`}
  </section>`;
}
/** 記録の作品を、直し方のボタンと同じ直し方で直す。何を変えたかを記録に残す */
function fixPastWorks() {
  if (!pastCheck) return;
  for (const row of pastCheck.rows) {
    if (row.ok) continue;
    if (row.work.bandDesign) {
      fixPastBand(row, pastCheck.by, pastCheck.rule);
      continue;
    }
    const s = workSession(row.work);
    if (!s?.built) continue;
    const before = structuredClone(s.state);
    const beforeMm = s.built.ring.setting.prongs[0]?.diameterMm;
    // 問題を 1 つずつ、最初の直し方で直す（形が変わらなければ次の問題へ）
    for (let i = 0; i < 8 && s.built!.problems.length; i++) {
      const key = JSON.stringify(s.state);
      const p = s.built!.problems.find((q) => q.options[0]);
      if (!p) break;
      applyFix(p.options[0].id, s);
      if (JSON.stringify(s.state) === key) break;
    }
    const st = s.state;
    const H = { low: "低め", standard: "標準", high: "高め" } as const;
    const changes: string[] = [];
    if (st.culetGapMm !== undefined && st.culetGapMm !== before.culetGapMm) changes.push(`石と指のすき間 ${s.built!.ring.culetGapMm.toFixed(2)} mm に`);
    else if (st.height !== before.height) changes.push(`高さ ${H[before.height]} → ${H[st.height]}`);
    const afterMm = s.built!.ring.setting.prongs[0]?.diameterMm;
    if (beforeMm && afterMm && Math.abs(afterMm - beforeMm) > 0.005) changes.push(`爪 ø${beforeMm.toFixed(2)} → ø${afterMm.toFixed(2)} mm`);
    if (st.prongCount !== before.prongCount) changes.push(`爪 ${s.built!.ring.setting.prongs.length} 本`);
    if (st.style !== before.style) changes.push(st.style === "bezel" ? "覆輪に" : st.style === "tension" ? "テンションに" : "爪留めに");
    const change = changes.join("、") || "直し方で直した";
    const left = probLabels(s.built!);
    row.fixed = left.length ? `${change}（まだ：${left.join("、")}）` : change;
    row.ok = !left.length;
    row.after = left.length;
    updateWork({
      ...row.work,
      design: { stone: row.work.design!.stone, state: structuredClone(st) },
      problems: left,
      revisions: [...(row.work.revisions ?? []), { date: today(), by: pastCheck.by, rule: pastCheck.rule, change }],
    });
  }
  // 今の設計も、同じ直し方で直す（決まりは今の設計にも、これまでの作品にも効く）
  if (session?.built && kind === "solitaire") {
    for (let i = 0; i < 8 && session.built.problems.length; i++) {
      const key = JSON.stringify(session.state);
      const p = session.built.problems.find((q) => q.options[0]);
      if (!p) break;
      applyFix(p.options[0].id);
      session.flush();
      if (JSON.stringify(session.state) === key) break;
    }
  }
  if (kind === "band") {
    for (const p of bandProblems()) if (!p.fix.editor) band = p.fix.apply(band);
    showBand(true);
  }
  renderCheck();
  flashVerdict();
  // 結果の欄まで動かす（スマホで画面の外に出て、直ったのか分からなかった）
  if (!filming()) requestAnimationFrame(() => document.querySelector(".past-check")?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function flashVerdict() {
  const c = $(".verdict-chip");
  c.classList.remove("flash");
  void c.offsetWidth;
  c.classList.add("flash");
}
/** 新しい決まりに合うように、Claude に直してもらう（作業は確かめるの中に一行ずつ） */
// ---- 作れない所を押すと：どこが・なぜ・直す（1 つずつ・まとめて・Claude で）をその場で ----
/** 確かめの種類 → その値を手で変える欄（赤く印をつける） */
const CHECK_CONTROL: Record<string, string> = {
  "prong-thin": '.slider[data-s="r-prong"]',
  hold: '.slider[data-s="r-prong"]',
  "finger-gap": '.pick:has(button[data-k="高さ"])',
  "tip-height": '.pick:has(button[data-k="高さ"])',
  "prong-gap": '.pick:has(button[data-k="爪の本数"])',
  corner: '.pick:has(button[data-k="爪の本数"])',
  "band-thin": ".sec-edit",
  "band-narrow": ".sec-edit",
  "bezel-wall": '.pick:has(button[data-k="留め方"])',
  "stone-space": ".stones-sec",
  "metal-space": ".stones-sec",
  "collar-wall": '.pick:has(button[data-k="腕への付け方"])',
  "band-end": '.pick:has(button[data-k="腕への付け方"])',
  "tension-gap": '.pick:has(button[data-k="留め方"])',
  "tension-cut": '.slider[data-s="r-wire"]',
  "tension-lip": '.slider[data-s="r-wire"]',
  "tension-girdle": '.slider[data-s="r-wire"]',
  "tension-pit": '.slider[data-s="r-wire"]',
  "tension-culet": '.slider[data-s="r-wire"]',
  "tension-sunk": '.slider[data-s="r-wire"]',
  "tension-overhang": '.pick:has(button[data-k="挟む向き"])',
  "tsuchime-thin": '.pick:has(button[data-k="槌目"])',
  "milgrain-fit": '.pick:has(button[data-k="ミル打ち"])',
};
function markBadControls() {
  document.querySelectorAll(".ctl-bad, .ctl-warn, .ctl-warn2").forEach((e) => e.classList.remove("ctl-bad", "ctl-warn", "ctl-warn2"));
  if (!session?.built) return;
  for (const p of session.built.problems) {
    const sel = CHECK_CONTROL[p.check];
    if (sel) document.querySelectorAll(`.studio-refine ${sel}`).forEach((e) => e.classList.add("ctl-bad"));
  }
  // 腕の幅の注意（黄色・オレンジ）：断面の図に、その色の枠（場所ごとの形では、つまみの方に色が付く）
  const arm = narrowArmOf(session.built);
  if (arm && !session.state.shankStations?.length) document.querySelectorAll(`.studio-refine ${CHECK_CONTROL["band-narrow"]}`).forEach((e) => e.classList.add(arm.level === "orange" ? "ctl-warn2" : "ctl-warn"));
}
function renderFixPop() {
  const pop = $(".fix-pop");
  if (pop.hidden || !session?.built) return;
  const probs = grouped(session.built);
  if (!probs.length) {
    pop.hidden = true;
    return;
  }
  pop.innerHTML = `<div class="fp-h"><b>作れない所 ${probs.length}</b><button type="button" class="fp-x" aria-label="閉じる">×</button></div>
    <ul>${probs
      .map(({ p, n }, i) => {
        const r = craftRuleFor(p.check);
        return `<li><div><b>${esc(SHORT[p.check] ?? p.where)}</b>${n > 1 ? `<small> ${n} か所</small>` : ""}<span>${esc(p.current)} → ${esc(p.required)}</span>${r?.quote ? `<em>「${esc(r.quote)}」</em>` : `<em>${esc(p.reason)}</em>`}</div>${p.options[0] ? `<button type="button" class="fp-fix" data-i="${i}">${esc(p.options[0].label)}</button>` : ""}</li>`;
      })
      .join("")}</ul>
    <div class="fp-all"><button type="button" class="primary fp-every">まとめて直す</button><button type="button" class="ghost-d fp-claude">Claude で直す</button></div>`;
  pop.querySelector(".fp-x")!.addEventListener("click", () => (pop.hidden = true));
  pop.querySelectorAll<HTMLButtonElement>(".fp-fix").forEach((b) =>
    b.addEventListener("click", () => {
      const pr = probs[Number(b.dataset.i)].p;
      const o = pr.options[0];
      if (o) applyFix(o.id, session!, pr);
      renderFixPop();
    }),
  );
  pop.querySelector(".fp-every")!.addEventListener("click", () => {
    if (!askConfirm("作れない所を、まとめて直しますか？\n設計の数字が変わります。")) return;
    for (let k = 0; k < 6 && session?.built?.problems.length; k++) {
      const pr = session.built.problems[0];
      const o = pr.options[0];
      if (!o) break;
      applyFix(o.id, session, pr);
    }
    renderFixPop();
  });
  pop.querySelector(".fp-claude")!.addEventListener("click", () => {
    pop.hidden = true;
    void fixWithClaude();
  });
}
$(".verdict-chip").addEventListener("click", () => {
  if (kind === "band") {
    if (!bandProblems().length) {
      // 作れない所はないが、幅の注意があるとき：確かめるの欄の注意へ
      if (bandWidthNote(band, bandGuides())) {
        setMode("refine");
        document.querySelector(".width-note")?.scrollIntoView({ block: "center" });
      }
      return;
    }
    const pop = $(".fix-pop");
    pop.hidden = !pop.hidden;
    renderBandFixPop();
    return;
  }
  // 作れない所はないが、職人に確かめることがあるとき：確かめるの欄の札へ
  if (session?.built && !session.built.problems.length && tensionCautionsOf(session.built).length) {
    setMode("refine");
    document.querySelector(".tn-card")?.scrollIntoView({ block: "start" });
    return;
  }
  if (session?.built && !session.built.problems.length && narrowArmOf(session.built)) {
    setMode("refine");
    document.querySelector(".width-note")?.scrollIntoView({ block: "center" });
    return;
  }
  if (session?.built && !session.built.problems.length && handGrooveOf(session.built)) {
    setMode("refine");
    document.querySelector(".groove-note")?.scrollIntoView({ block: "center" });
    return;
  }
  if (!session?.built?.problems.length) return;
  const pop = $(".fix-pop");
  pop.hidden = !pop.hidden;
  renderFixPop();
});
async function fixWithClaude() {
  if (!session || !stone || making) return;
  const pass = store.password() || (await askPassword(true));
  if (!pass) {
    fixLog = [{ text: "Claude に直してもらうには合言葉が要ります。合言葉がなくても、上の直し方のボタンか「手で変える」で直せます。", cls: "note" }];
    renderCheck();
    return;
  }
  making = true;
  const mark = historyBegin();
  fixLog = [{ text: "Claude が、帳面の決まりに合うように直しています…", cls: "note" }];
  renderCheck();
  const r = await runClaude({
    host: session,
    messages: [{ role: "user", content: `${stoneText()}\n今の形のまま、帳面の決まりに合わない所だけを直してください。まず check で確かめ、直したらもう一度 check で確かめます。見た目はなるべく変えません。最後に、何をなぜ変えたかを 1〜2 行で書いてください。` }],
    system: designPrompt(store.ledger()),
    tools: TOOLS.filter((t) => ["set_setting", "set_shank", "check"].includes(t.name)),
    password: pass,
    speed: "fast",
    maxTurns: 6,
    onLog: (e) => {
      if (e.kind === "note") {
        if (hasJapanese(e.text)) fixLog.push({ text: plainWords(withoutCannot(e.text), titlesNow()), cls: "note" });
      }
      else {
        const li = document.createElement("li");
        logLineTo(li, e);
        fixLog.push({ text: li.textContent ?? "", cls: li.className });
      }
      renderCheck();
    },
  });
  making = false;
  historyEnd(mark, false);
  if (r.offline || (r.error && !r.log.length)) {
    if (r.error?.code === "wrong_password") resetPassword();
    fixLog.push({ text: offlineWords(r.error?.message, "上の直し方のボタンか「手で変える」で直せます。"), cls: "ng" });
  }
  renderCheck();
  flashVerdict();
}

function toast(t: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = t;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---- 地金のみの指輪（甲丸・平打ち ほか） ----
type Kind = "solitaire" | "band";
let kind: Kind = "solitaire";
let bandMetal: Metal = "k18yg";
let band: Band = defaultBand(GUIDES.metals.k18y.densityGPerCm3, METAL_LABEL.k18yg);
let bandWeight = 0;
let bandPositions: Float32Array | null = null;
/** 切って断面を見ているか（3D の見た目だけ。STL・重さ・図面は、いつも輪のまま） */
let bandCut = false;

/** 今の帳面の目安で確かめる（職人の決まりが効く） */
const bandGuides = () => effectiveGuides(store.ledger());
const bandProblems = () => checkBand(band, bandGuides());
const bandHost: BandPanelHost = {
  band: () => band,
  change: (next, live) => {
    band = next;
    showBand(live);
  },
  metal: () => bandMetal,
  setMetal: (m) => {
    setBandMetal(m);
    showBand();
  },
  cut: () => bandCut,
  setCut: (on) => {
    bandCut = on;
    showBand();
  },
  guides: bandGuides,
};
function setBandMetal(m: Metal) {
  bandMetal = m;
  band = { ...band, density: GUIDES.metals[metalIdOf(m)].densityGPerCm3, metalLabel: METAL_LABEL[m] };
}
function bandName() {
  return `${sectionWord(band)}の指輪`;
}
/** 3D に形を置く。腕ぜんぶに関わる問題なら赤く、とがった先だけなら、その所に赤い線 */
function placeBand(probs: BandProblem[], cut = bandCut) {
  const r = bandInnerDiameter(band.gou) / 2;
  const z = r + band.bottom.thickness;
  const spots = probs.some((p) => p.check === "band-spike") ? thinSpotsOf(band, bandGuides()).map((s) => ({ x: s.at.x, rho: r + s.at.y, z })) : [];
  viewer.setMetalMesh(cut ? bandCutMesh(band, bandTarget(band)) : bandPositions!, metalIdOf(bandMetal), "band", { shade: bandMetal, warn: probs.some((p) => p.check !== "band-spike"), spots, tint: bandWidthNote(band, bandGuides())?.level });
}
/** 図面・印刷の絵・記録の絵は、切っていても輪で描く */
function withWholeBand<T>(f: () => T): T {
  if (kind !== "band" || !bandCut || !bandPositions) return f();
  const probs = bandProblems();
  placeBand(probs, false);
  try {
    return f();
  } finally {
    placeBand(probs);
  }
}
/** live：つまみや点を動かしている間（パネルは描き直さない。描き直すと、指で押さえている物が消える） */
function showBand(live = false) {
  keepDesignSoon();
  historySoon();
  renderMakeOpts();
  const m = bandMesh(band);
  bandPositions = m.positions;
  bandWeight = m.weightG;
  const probs = bandProblems();
  placeBand(probs);
  headBox = null;
  setDims(bandDims(m.positions, probs));
  const chip = $(".verdict-chip");
  chip.hidden = false;
  const handGroove = bandGrooveNote(band, bandGuides());
  const arm = bandWidthNote(band, bandGuides());
  chip.className = `verdict-chip ${probs.length ? "ng" : handGroove || arm ? (arm?.level === "orange" ? "warn2" : "warn") : "ok"}`;
  chip.textContent = probs.length ? `作れない所 ${probs.length}` : arm ? `作れます（注意 ${[arm, handGroove].filter(Boolean).length}）` : handGroove ? "手で彫る溝あり" : "作れます";
  markDrawFault();
  $(".word-name").textContent = bandName();
  $(".specs").innerHTML = bandSpecRows(band, bandWeight)
    .map(({ label, value }) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`)
    .join("");
  // 図面を開いたままなら、図面も描き直す（一粒石の指輪と同じ）
  if (sheetOn) {
    clearTimeout(sheetTimer);
    // すぐの形（一体の形が別の糸から届く前）では描かない。届いたときに、もう一度ここへ来る
    sheetTimer = window.setTimeout(() => sheetOn && !session?.quick && showSheet(), 400);
  }
  renderPresent();
  if (live) return;
  renderBandFixPop();
  if (!$(".make-panel").hidden) renderBandPanel($(".band-ctrl"), bandHost);
  if (!$(".studio-refine").hidden) renderBandCheck();
  if (!$(".build-panel").hidden) renderBandBuild();
}
/** スマホの地金のみの指輪では、希望の欄を「Claude の作業」の中へ（下にいつも出ていると、欄がせまくなって断面の下の設定が見えなかった。2026-11-05 作者） */
const phoneWidth = matchMedia("(max-width: 820px)");
function placeWish() {
  const wrap = $(".cmd-wrap");
  const to = !filming() && kind === "band" && phoneWidth.matches ? $(".wish-slot") : $(".pro");
  if (wrap.parentElement !== to) to.appendChild(wrap);
}
phoneWidth.addEventListener("change", placeWish);
const WISH_EXAMPLE: Record<Kind, string> = { solitaire: "例：華奢に。毎日つける。石を大きく見せたい", band: "例：細めに。毎日つける。手のひら側は薄く" };
function setKind(k: Kind) {
  stopIntro();
  kind = k;
  keepDesignSoon();
  $(".fix-pop").hidden = true;
  document.querySelectorAll<HTMLButtonElement>(".kinds [data-kind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === k)));
  document.querySelectorAll<HTMLElement>(".solitaire-only").forEach((e) => (e.hidden = k !== "solitaire"));
  document.querySelectorAll<HTMLElement>(".band-only").forEach((e) => (e.hidden = k !== "band"));
  showCannot("");
  setStatus("");
  placeWish();
  $<HTMLInputElement>(".wish").placeholder = WISH_EXAMPLE[k];
  if ($(".pro").getAttribute("data-mode") === "make") $(".word-sub").textContent = k === "band" ? "断面と言葉から形を組む" : MODES[0].sub;
  $(".worklog").innerHTML = `<li class="note">${k === "band" ? "希望（例：細めで、手のひら側を薄く）を書いて「生成」。上の「形」で、断面も数字も手で変えられます。" : "下の行に希望を書いて「生成」を押すと、Claude が組み、作れるか確かめて直します。"}</li>`;
  if (k === "band") showBand();
  else if (session) session.build("一粒石の指輪に戻る");
  if (k !== "band" && !$(".studio-refine").hidden) renderCheck();
  if (k !== "band" && !$(".build-panel").hidden) renderBuild();
}
document.querySelectorAll<HTMLButtonElement>(".kinds [data-kind]").forEach((b) => b.addEventListener("click", () => setKind(b.dataset.kind as Kind)));

/** 直す。断面の形に関わるとがりは自動で直さず、断面を描く画面を見せる */
function fixBand(p: BandProblem) {
  if (p.fix.editor) {
    $(".fix-pop").hidden = true;
    manualOpen = true;
    setMode("refine");
    const ed = document.querySelector<HTMLElement>(".studio-refine .sec-edit");
    if (ed) requestAnimationFrame(() => ed.scrollIntoView({ behavior: "smooth", block: "center" }));
    return;
  }
  band = p.fix.apply(band);
  showBand();
}
/** 作れない所を押すと出る窓（一粒石の指輪と同じ窓。Claude で直すは、地金のみの指輪にはまだない） */
function renderBandFixPop() {
  const pop = $(".fix-pop");
  if (pop.hidden || kind !== "band") return;
  const probs = bandProblems();
  if (!probs.length) {
    pop.hidden = true;
    return;
  }
  pop.innerHTML = `<div class="fp-h"><b>作れない所 ${probs.length}</b><button type="button" class="fp-x" aria-label="閉じる">×</button></div>
    <ul>${probs
      .map((p, i) => {
        const r = craftRuleFor(p.check);
        return `<li><div><b>${esc(p.title)}</b><span>${esc(p.current)} → ${esc(p.required)}</span>${r?.quote ? `<em>「${esc(r.quote)}」</em>` : `<em>${esc(p.why)}</em>`}</div><button type="button" class="fp-fix" data-i="${i}">${esc(p.fix.label)}</button></li>`;
      })
      .join("")}</ul>
    ${probs.some((p) => !p.fix.editor) ? `<div class="fp-all"><button type="button" class="primary fp-every">まとめて直す</button></div>` : ""}`;
  pop.querySelector(".fp-x")!.addEventListener("click", () => (pop.hidden = true));
  pop.querySelectorAll<HTMLButtonElement>(".fp-fix").forEach((b) => b.addEventListener("click", () => fixBand(probs[Number(b.dataset.i)])));
  pop.querySelector(".fp-every")?.addEventListener("click", () => {
    if (!askConfirm("作れない所を、まとめて直しますか？\n設計の数字が変わります。")) return;
    for (const p of probs) if (!p.fix.editor) band = p.fix.apply(band);
    showBand();
  });
}
function renderBandCheck() {
  const box = $(".studio-refine");
  const probs = bandProblems();
  const fresh = new Set<string>(lastRule?.checks ?? []);
  // 決まりの案は、欄を描き直しても消さない（一粒石の指輪と同じ）
  const heldProposal = [...(box.querySelector(".ar-proposal")?.childNodes ?? [])];
  box.innerHTML = `
    ${ruleFlashHtml(probs.length)}
    <section class="big-verdict ${probs.length ? "ng" : bandGrooveNote(band, bandGuides()) || bandWidthNote(band, bandGuides()) ? (bandWidthNote(band, bandGuides())?.level === "orange" ? "warn2" : "warn") : "ok"}"><b>${probs.length ? "このままでは作れません" : bandWidthNote(band, bandGuides()) ? `作れます。${bandWidthNote(band, bandGuides())!.level === "orange" ? "かなり細いので" : "細めなので"}、注意があります` : bandGrooveNote(band, bandGuides()) ? "形は作れます。細い溝は、あとから手で彫ります" : "このまま作れます"}</b><small>${probs.length ? `直す所 ${probs.length}` : bandWidthNote(band, bandGuides()) ? "幅の注意は止めません。厚み・断面の薄い所は目安の内側" : "厚み・幅・断面の薄い所、どれも目安の内側"}</small></section>
    ${widthNoteHtml(bandWidthNote(band, bandGuides()))}
    ${grooveNoteHtml(bandGrooveNote(band, bandGuides()))}
    ${
      probs.length
        ? `<ul class="probs">${probs
            .map((p, i) => {
              const r = craftRuleFor(p.check);
              return `<li class="${fresh.has(p.check) ? "fresh" : ""}"><div class="p-head"><b>${esc(p.title)}</b>${fresh.has(p.check) ? `<i class="new-tag">新しい決まり</i>` : ""}</div><p class="p-num">${esc(p.current)} <span>→</span> ${esc(p.required)}</p><div class="p-act"><button type="button" class="fix-go" data-i="${i}">${esc(p.fix.label)}</button>${r && voices.has(r.id) ? `<button type="button" class="voice-play" data-rid="${esc(r.id)}">▶ 職人の声で聞く</button>` : ""}<details><summary>なぜ</summary><p>${esc(p.why)}</p>${r?.quote ? `<p class="p-quote">「${esc(r.quote)}」<span>${esc(masterName(store.ledger()))}</span></p>` : ""}</details></div></li>`;
            })
            .join("")}</ul>`
        : ""
    }
    <details class="manual" ${manualOpen ?? !probs.length ? "open" : ""}><summary>手で変える</summary><div class="band-ctrl-2"></div></details>
    ${pastCheckHtml()}
    ${rulesSectionHtml()}
    <button type="button" class="next-btn to-build">作り方を見る →</button>`;
  box.querySelector(".ar-proposal")?.append(...heldProposal);
  renderBandPanel(box.querySelector(".band-ctrl-2")!, bandHost);
  bindRules(box);
  const manual = box.querySelector<HTMLDetailsElement>(".manual")!;
  manual.addEventListener("toggle", () => (manualOpen = manual.open));
  box.querySelector(".past-fix")?.addEventListener("click", () => {
    if (askConfirm("今の設計と、これまでの作品を、まとめて直しますか？\n幅や厚み、爪の太さなどが変わります。")) fixPastWorks();
  });
  box.querySelectorAll<HTMLButtonElement>(".voice-play").forEach((btn) =>
    btn.addEventListener("click", () => {
      const r = activeRules(store.ledger()).find((x) => x.id === btn.dataset.rid);
      if (r) void playRuleVoice(r);
    }),
  );
  box.querySelectorAll<HTMLButtonElement>(".voice-rec").forEach((btn) => btn.addEventListener("click", () => void toggleRecord(btn.dataset.rid!)));
  box.querySelectorAll<HTMLButtonElement>(".fix-go").forEach((b) => b.addEventListener("click", () => fixBand(probs[Number(b.dataset.i)])));
  box.querySelector(".to-build")!.addEventListener("click", () => setMode("hand"));
}

function renderBandBuild() {
  const box = $(".build-panel");
  const steps = bandHowTo(band, method, bandWeight, alloyOf(bandMetal));
  const probs = bandProblems();
  box.innerHTML = `
    <div class="seg method"><button type="button" data-m="hand" aria-pressed="${method === "hand"}">鍛造</button><button type="button" data-m="cast" aria-pressed="${method === "cast"}">鋳造</button></div>
    ${probs.length ? `<p class="build-warn">このままでは作れない所が ${probs.length} あります。<button type="button" class="link to-check">確かめる →</button></p>` : ""}
    ${stepsHtml(steps)}
    <p class="note-b">寸法は、この形から計算した目安。${NOTE}</p>
    <div class="row out"><button type="button" class="primary p-instr">図面・指示書を印刷</button><button type="button" class="ghost-d p-stl">STL を書き出す</button></div>
    <div class="save-work"><button type="button" class="next-btn p-save">この作品の記録を残す</button></div>`;
  box.querySelector(".p-save")!.addEventListener("click", () => openSaveWork(box.querySelector(".save-work")!, bandData()));
  box.querySelectorAll<HTMLButtonElement>(".method button").forEach((b) => b.addEventListener("click", () => ((method = b.dataset.m as Method), renderBandBuild())));
  box.querySelector(".to-check")?.addEventListener("click", () => setMode("refine"));
  bindTerms(box);
  box.querySelector(".p-instr")!.addEventListener("click", () => printSheet());
  box.querySelector(".p-stl")!.addEventListener("click", () => exportStl());
}

async function makeBand() {
  if (making) return;
  const wish = $<HTMLInputElement>(".wish").value.trim();
  const pass = store.password() || (await askPassword(true));
  if (!pass) {
    setStatus("生成には Claude が要ります。合言葉がなくても、「形」の見本や数字を変えて手で作れます。", { links: [{ label: "手で変える →", run: toManual }] });
    return;
  }
  making = true;
  const mark = historyBegin();
  setStatus("Claude が形を考えています…", { busy: true });
  const gou = band.gou;
  const r = await callTool<BandDraft>({ system: bandPrompt(), user: `号：${gou} 号\n${wish || "ふつうの普段使いの指輪"}`, tool: MAKE_BAND, parse: parseBand, password: pass, speed: "fast" });
  making = false;
  if (!r.ok) {
    historyEnd(mark, true);
    if (r.code === "wrong_password") resetPassword();
    setStatus(r.error);
    return;
  }
  const d = keepGou(r.value, gou);
  band = applyDraft(band, d);
  setBandMetal(d.metal);
  showBand();
  historyEnd(mark, true);
  $(".worklog").innerHTML = `<li class="wl-tool set_shank">${esc(`${sectionWord(band)}・${sizeWord(band)}・${d.gou} 号・${METAL_LABEL[d.metal]}`)}</li><li class="note">${esc(d.reason)}</li>`;
  showCannot(d.cannotDo);
  setStatus(r.remaining !== undefined ? `今日あと ${r.remaining} 回` : "", { links: [{ label: "確かめる →", run: () => setMode("refine") }] });
  // 「形」の欄が長いので、Claude の答えの所まで動かす
  if (!$(".make-panel").hidden) requestAnimationFrame(() => $(".make-note").parentElement?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
}

// ---- 図面：3D から正面・横・上の線画を描き、寸法を入れる ----
const DRAW_PX = 40;
type DView = "front" | "side" | "top";
function views(list: [DView, string][], dimsOf: (v: DView, box: { min: number[]; max: number[] }) => Dim[], px = DRAW_PX): DrawingView[] {
  return list.map(([v, name]) => {
    const d = viewer.drawing(v, px);
    // 自分で引いた寸法のうち、この図と同じ向きから引いたものを入れる（記録に残す小さな図には入れない）
    // 画面の正面・横・上は、図面の正面図・側面図・上面図と同じ向き（2026-11-06 にそろえた）
    const own = px === DRAW_PX ? (measure?.items ?? []).filter((m) => m.plane && DRAW_AXIS[v](m.plane.dir)).map(measureDim) : [];
    return { name, url: d.url, widthMm: d.widthMm, heightMm: d.heightMm, widthPx: d.widthPx, heightPx: d.heightPx, project: d.project, dims: [...dimsOf(v, d.box), ...own] };
  });
}
/** 図面の図と同じ向きか（図面の正面図は指の軸から、側面図は横から見る） */
const DRAW_AXIS: Record<DView, (dir: readonly number[]) => boolean> = {
  front: (d) => Math.abs(d[0]) > 0.9,
  side: (d) => Math.abs(d[1]) > 0.9,
  top: (d) => Math.abs(d[2]) > 0.9,
};
/** 表題欄の行：斜めで引いた寸法（図の面に載らないので、数字だけ） */
function ownMeasureRows(px: number, sess: RingSession | null): { label: string; value: string }[] {
  if (px !== DRAW_PX || sess !== session || !measure) return [];
  return measure.items.filter((m) => !m.plane).map((m) => ({ label: `引いた寸法（${m.nameA ?? "面の点"} 〜 ${m.nameB ?? "面の点"}）`, value: measureLabel(m) }));
}
/** 一粒石の指輪の図面。いま 3D に出ている形（b）を描く。記録に残すときは px を小さくして軽くする */
function solitaireDrawing(b: Built, problems: string[], sess: RingSession = session!, info: StoneInfo = currentStone(), px = DRAW_PX): string {
  const r = b.ring;
  const lift = r.shank.outerRadiusMm;
  const ri = r.shank.innerDiameterMm / 2;
  const t = r.transform;
  const h = r.stone.heights;
  const c = Math.cos(t.rotationZ);
  const sn = Math.sin(t.rotationZ);
  const pts = info.outlineMm.map((q) => ({ x: q.x * c - q.y * sn + (t.translateX ?? 0), y: q.x * sn + q.y * c + (t.translateY ?? 0) }));
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const girdleZ = t.translateZ + h.culetZ + h.pavilionMm + lift;
  const culetZ = t.translateZ + h.culetZ + lift;
  const tableZ = t.translateZ + h.tableZ + lift;
  const fingerTop = lift + ri;
  const bad = new Set(b.problems.map((p) => p.check));
  const wide = Math.max(...xs) - Math.min(...xs);
  const deep = Math.max(...ys) - Math.min(...ys);
  const html = drawingPage({
    title: r.stones.length > 1 ? `${info.shapeName}の${layoutName(sess)}の指輪（石 ${r.stones.length}）` : `${info.shapeName}の一粒石の指輪`,
    date: today(),
    pxPerMm: px,
    problems,
    rows: [
      { label: "号", value: `${sess.state.gou} 号（内径 ${(ri * 2).toFixed(1)} mm）` },
      { label: "地金・重さ", value: `${METAL_LABEL[sess.state.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g${isIrogane(sess.state.metal) && sess.state.metal !== "copper" ? "（密度は仮）" : ""}` },
      ...(finishWords(sess.state.finish).length ? [{ label: "仕上げ", value: finishWords(sess.state.finish).join(" ・ ") }] : []),
      { label: "石（長さ × 幅 × 深さ）", value: `${info.longMm.toFixed(2)} × ${info.widthMm.toFixed(2)} × ${info.depthMm.toFixed(2)} mm` },
      { label: "留め方", value: r.setting.tension ? tensionWord(r.setting) : r.setting.style === "bezel" ? `覆輪（壁の厚み ${r.setting.bezel?.wallMm.toFixed(2)} mm）` : `爪 ${r.setting.prongs.length} 本（太さ ${prongDiaWord(r.setting)}${r.setting.prongTip === "oni" ? ` ・ ${PRONG_TIP_LABEL.oni}` : ""}）` },
      ...(r.setting.tension
        ? []
        : [{ label: "腕", value: `${ringSectionWord(sess.state, r.shank.widthMm, r.shank.thicknessMm)} 幅 ${r.shank.widthMm.toFixed(1)} × 厚み ${r.shank.thicknessMm.toFixed(1)} mm` }]),
      ...(r.setting.tension
        ? [
            { label: "腕の両はし", value: `${r.setting.tension.ends.map((e) => `${e.kind === "pit" ? "角のくぼみ" : "辺の溝"} ${e.depthMm.toFixed(2)}`).join(" ・ ")}${sess.state.tensionPitMm !== undefined || sess.state.tensionGrooveMm !== undefined ? "（浅く留める案）" : ""}` },
            ...tensionHoldRows(b, sess),
            { label: "腕の線", value: `${SHANK_SECTION_LABEL[r.shank.section]} ${r.shank.widthMm.toFixed(1)}${r.setting.tension.liftMm > 0 ? ` ・ 両はしを ${r.setting.tension.liftMm.toFixed(2)} 持ち上げる` : ""}` },
          ]
        : []),
      ...r.stones.slice(1).map((x, i) => ({
        label: `石 ${i + 2}`,
        value: `${x.params.longMm.toFixed(2)} × ${x.params.widthMm.toFixed(2)} ・ ${x.setting.style === "bezel" ? "覆輪" : `爪 ${x.setting.prongs.length} ・ ø${x.setting.prongs[0]?.diameterMm.toFixed(2)}`} ・ ${placeText(x)}`,
      })),
      ...ownMeasureRows(px, sess),
      ...(r.notchDepthMm > 0 ? [{ label: "腕の上のザグり（石の先を逃がす）", value: `深さ ${r.notchDepthMm.toFixed(2)} mm ・ 丸いビット 直径 約 ${r.shank.notchBallDiameterMm.toFixed(1)} mm` }] : []),
      ...(r.setting.collar
        ? [
            { label: "腕との付け方", value: "腕の間に挟む" },
            { label: "下の輪", value: `板 厚み ${r.setting.collar.wallMm.toFixed(2)} × 高さ ${r.setting.collar.heightMm.toFixed(2)} mm` },
            { label: "上の輪", value: "丸線。石の座をリューターでザグる" },
            { label: "ロウ付け", value: `腕の両はし ${r.solder?.contacts ?? 2} か所` },
          ]
        : r.solder
          ? [
              { label: "腕との付け方", value: `腕の上にのせる（下の輪の溝 深さ ${r.shank.railSeatDepthMm.toFixed(2)} mm）` },
              { label: "ロウ付け", value: `${r.solder.contacts} か所` },
            ]
          : []),
    ],
    views: views(
      [
        ["front", "正面図"],
        ["side", "側面図"],
        ["top", "上面図"],
      ],
      (v, box) => {
        const top = box.max[2];
        if (v === "front")
          return [
            { a: [0, -ri, lift], b: [0, ri, lift], label: `内径 ø${(ri * 2).toFixed(1)}` },
            ...(r.setting.tension ? [{ a: [0, -r.setting.tension.gapMm / 2, top] as V3, b: [0, r.setting.tension.gapMm / 2, top] as V3, ext: [0, 0, 3] as V3, label: `開き ${r.setting.tension.gapMm.toFixed(2)}` }] : []),
            { a: [0, 0, 0], b: [0, 0, top], ext: [0, box.max[1] + 3, 0], label: `全高 ${top.toFixed(1)}` },
            { a: [0, 0, fingerTop], b: [0, 0, top], ext: [0, box.min[1] - 3, 0], label: `${r.setting.tension ? "指から腕の上まで" : "指から石の上まで"} ${(top - fingerTop).toFixed(1)}`, bad: bad.has("tip-height") },
            { a: [0, 0, 0], b: [0, 0, r.shank.thicknessMm], ext: [0, box.min[1] - 3, 0], label: `厚み ${r.shank.thicknessMm.toFixed(1)}` },
            // 石の深さ（テーブルから石の先まで）：「指から石の上まで」と並べて読むと、石の先が指にどれだけ近いかが分かる（2026-11-06 作者の声）。
            // 石の右の、全高の線の内側に引く（石座と腕の肩にかからない所）
            ...(r.setting.tension ? [] : [{ a: [0, 0, culetZ] as V3, b: [0, 0, tableZ] as V3, ext: [0, Math.max(...ys.map(Math.abs)) + 2.2, 0] as V3, label: `石の深さ ${(tableZ - culetZ).toFixed(2)}` }]),
          ];
        if (v === "side")
          return [
            { a: [-r.shank.widthMm / 2, 0, 0], b: [r.shank.widthMm / 2, 0, 0], ext: [0, 0, -3], label: `幅 ${r.shank.widthMm.toFixed(1)}` },
            { a: [Math.min(...xs), 0, girdleZ], b: [Math.max(...xs), 0, girdleZ], ext: [0, 0, top - girdleZ + 3], label: `${wide.toFixed(2)}` },
            { a: [0, 0, fingerTop], b: [0, 0, t.translateZ + h.culetZ + lift], ext: [box.max[0] + 3, 0, 0], label: `すき間 ${r.culetGapMm.toFixed(2)}`, bad: bad.has("finger-gap") },
          ];
        return [
          { a: [Math.min(...xs), 0, top], b: [Math.max(...xs), 0, top], ext: [0, box.max[1] - 0 + 3, 0], label: `${wide.toFixed(2)}` },
          { a: [0, Math.min(...ys), top], b: [0, Math.max(...ys), top], ext: [box.max[0] + 3, 0, 0], label: `${deep.toFixed(2)}` },
        ];
      },
      px,
    ),
  });
  return html;
}
/** 断面図の、ほかの図に対する倍率（断面は小さいので、大きく描く） */
const SECTION_ZOOM = 2;
/** 断面図（本当の断面の線に斜線を入れた絵。寸法つき）。3D を使わずに、断面の線から描く */
function sectionView(name: string, s: SectionSpec, problems: string, px: number): DrawingView {
  const margin = 1.6;
  const widthMm = s.widthMm + margin * 2;
  const heightMm = s.thicknessMm + margin * 2;
  // 紙の上で SECTION_ZOOM 倍に。px も同じ倍率にして、寸法の字の大きさはほかの図とそろえる
  const pz = px * SECTION_ZOOM;
  const W = Math.round(widthMm * pz);
  const H = Math.round(heightMm * pz);
  // 図の座標：x は幅の向き、z は指の円からの高さ（下が指の側）
  const project = (x: number, _y: number, z: number) => ({ x: (x + widthMm / 2) * pz, y: (heightMm - margin - z) * pz });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-widthMm / 2} ${margin - heightMm} ${widthMm} ${heightMm}" width="${W}" height="${H}"><defs><pattern id="h" width="0.3" height="0.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.3" stroke="#555" stroke-width="0.02"/></pattern></defs><path d="${sectionPath(sectionLoop(s))}" fill="url(#h)" stroke="#111" stroke-width="0.035" stroke-linejoin="round"/></svg>`;
  return {
    name: `${name}（${SECTION_ZOOM} 倍）`,
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    widthMm: widthMm * SECTION_ZOOM,
    heightMm: heightMm * SECTION_ZOOM,
    widthPx: W,
    heightPx: H,
    project,
    dims: [
      { a: [-s.widthMm / 2, 0, s.thicknessMm], b: [s.widthMm / 2, 0, s.thicknessMm], ext: [0, 0, 0.8], label: `幅 ${dimNum(s.widthMm)}`, bad: problems.includes("幅") },
      { a: [s.widthMm / 2, 0, 0], b: [s.widthMm / 2, 0, s.thicknessMm], ext: [0.8, 0, 0], label: `厚み ${dimNum(s.thicknessMm)}`, bad: problems.includes("薄") },
    ],
  };
}
function bandDrawing(problems: string[], px = DRAW_PX): string {
  const ri = bandInnerDiameter(band.gou) / 2;
  let zmin = Infinity;
  const p = bandPositions!;
  for (let i = 2; i < p.length; i += 3) zmin = Math.min(zmin, p[i]);
  const cz = zmin + band.bottom.thickness + ri;
  const ztop = cz + ri + band.top.thickness;
  const titles = problems.join(" ");
  const two = !!band.split;
  return drawingPage({
    title: bandName(),
    date: today(),
    pxPerMm: px,
    problems,
    rows: [
      { label: "号・内径", value: `${band.gou} 号 ・ ø${(ri * 2).toFixed(1)}` },
      { label: "地金・重さ", value: `${band.metalLabel} ・ 約 ${bandWeight.toFixed(1)} g` },
      { label: "断面", value: sectionWord(band) },
      { label: two ? "上・下" : "幅 × 厚み", value: two ? `${band.top.width}×${band.top.thickness} ・ ${band.bottom.width}×${band.bottom.thickness}` : `${band.top.width}×${band.top.thickness}` },
    ],
    views: [
      ...withWholeBand(() =>
        views(
          [
            ["front", "正面図"],
            ["side", "側面図"],
          ],
          (v, box) =>
            v === "front"
              ? [
                  { a: [0, -ri, cz], b: [0, ri, cz], label: `内径 ø${(ri * 2).toFixed(1)}` },
                  { a: [0, 0, cz + ri], b: [0, 0, ztop], ext: [0, box.max[1] + 3, 0], label: `厚み ${dimNum(band.top.thickness)}`, bad: titles.includes("薄") },
                  { a: [0, 0, zmin], b: [0, 0, zmin + band.bottom.thickness], ext: [0, box.max[1] + 3, 0], label: `厚み ${dimNum(band.bottom.thickness)}`, bad: titles.includes("薄") },
                  { a: [0, 0, zmin], b: [0, 0, ztop], ext: [0, box.min[1] - 3, 0], label: `外径 ø${(ztop - zmin).toFixed(1)}` },
                ]
              : [
                  { a: [-band.top.width / 2, 0, ztop], b: [band.top.width / 2, 0, ztop], ext: [0, 0, 3], label: `幅 ${dimNum(band.top.width)}`, bad: titles.includes("幅") },
                  { a: [-band.bottom.width / 2, 0, zmin], b: [band.bottom.width / 2, 0, zmin], ext: [0, 0, -3], label: `幅 ${dimNum(band.bottom.width)}`, bad: titles.includes("幅") },
                ],
          px,
        ),
      ),
      sectionView(two ? "断面図 上" : "断面図", specOf(band, "top"), titles, px),
      ...(two ? [sectionView("断面図 下", specOf(band, "bottom"), titles, px)] : []),
    ],
  });
}
/** 印刷する物を選ぶ：図面・作り方・原寸の型紙 */
function askPrint(hasPattern: boolean, go: (p: { drawing: boolean; steps: boolean; pattern: boolean; details: boolean }) => void) {
  const dlg = document.createElement("dialog");
  dlg.className = "sheet print-pick";
  dlg.innerHTML = `<form method="dialog">
    <h3>印刷する物</h3>
    <label class="chk"><input type="checkbox" name="drawing" checked><span><b>図面</b><small>正面・横・上、寸法つき（A4 横）</small></span></label>
    <label class="chk"><input type="checkbox" name="steps" checked><span><b>作り方</b><small>${method === "hand" ? "鍛造" : "鋳造"}の手順と数字</small></span></label>
    <label class="chk"><input type="checkbox" name="details"><span><b>詳しい手順も</b><small>工程の細かい手順と温度（ページが増えます）</small></span></label>
    ${hasPattern ? `<label class="chk"><input type="checkbox" name="pattern"><span><b>原寸の型紙</b><small>石を置いて確かめる</small></span></label>` : ""}
    <div class="sheet-actions"><button value="cancel" class="ghost">やめる</button><button value="ok" class="primary">印刷</button></div>
  </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => {
    const f = (n: string) => !!dlg.querySelector<HTMLInputElement>(`[name="${n}"]`)?.checked;
    const pick = { drawing: f("drawing"), steps: f("steps"), pattern: f("pattern"), details: f("details") };
    dlg.remove();
    if (dlg.returnValue === "ok" && (pick.drawing || pick.steps || pick.pattern)) go(pick);
    else if (dlg.returnValue === "ok") toast("印刷するもの（図面・作り方・型紙）を 1 つ以上選んでください");
  });
  dlg.showModal();
}

// ---- 記録。：作った物ごとに残す ----
interface WorkData {
  title: string;
  kind: string;
  specs: { label: string; value: string }[];
  problems: string[];
  steps: ReturnType<typeof howToMake>;
  design?: WorkRecord["design"];
  bandDesign?: WorkRecord["bandDesign"];
  /** 図面（いま 3D に出ている形から描く。見本のように 3D に出ていない物は、帳面を開くときに描く） */
  drawing?: () => string;
}
function solitaireData(sess: RingSession = session!, info: StoneInfo = currentStone(), route: Method = method): WorkData {
  const b = sess.built!;
  const r = b.ring;
  const st = r.setting;
  return {
    title: `${info.shapeName}の一粒石の指輪`,
    kind: "一粒石の指輪",
    design: { stone: structuredClone(sess.stone), state: sess.snapshot(), look: sess === session && stone ? { color: stone.extraction.color, colorless: stone.extraction.colorless } : undefined },
    specs: [
      { label: "石", value: `${info.longMm.toFixed(2)} × ${info.widthMm.toFixed(2)} × ${info.depthMm.toFixed(2)} mm` },
      { label: "号", value: `${sess.state.gou} 号 ・ 内径 ${r.shank.innerDiameterMm.toFixed(1)} mm` },
      { label: "留め方", value: st.tension ? tensionWord(st) : st.style === "bezel" ? `覆輪 ・ 壁 ${st.bezel?.wallMm.toFixed(2)} mm` : `爪 ${st.prongs.length} ・ ${prongDiaWord(st)}${st.prongTip === "oni" ? ` ・ ${PRONG_TIP_LABEL.oni}` : ""}` },
      { label: "腕", value: `${r.shank.widthMm.toFixed(1)} × ${r.shank.thicknessMm.toFixed(1)} mm` },
      { label: "石と指のすき間", value: `${r.culetGapMm.toFixed(2)} mm` },
      { label: "地金", value: `${METAL_LABEL[sess.state.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g` },
    ],
    problems: grouped(b).map(({ p }) => `${SHORT[p.check] ?? p.where}（${p.current} → ${p.required}）`),
    steps: howToMake(howInput(b, sess, info), route),
    drawing: () => solitaireDrawing(b, grouped(b).map(({ p }) => SHORT[p.check] ?? p.where), sess, info, BOOK_PX),
  };
}
function bandData(): WorkData {
  return {
    title: bandName(),
    kind: bandName(),
    bandDesign: { band: structuredClone(band), metal: bandMetal },
    specs: bandSpecRows(band, bandWeight),
    problems: bandProblems().map((p) => `${p.title}（${p.current} → ${p.required}）`),
    steps: bandHowTo(band, method, bandWeight, alloyOf(bandMetal)),
    drawing: () => (bandPositions ? bandDrawing(bandProblems().map((p) => p.title), BOOK_PX) : ""),
  };
}
/** 記録に残す図面の細かさ（1 mm あたりの px）。このブラウザの入れ物が小さいので、印刷の図面より粗く */
const BOOK_PX = 24;
function safeDrawing(f?: () => string): string | undefined {
  try {
    return f?.() || undefined;
  } catch {
    return undefined;
  }
}
/** 図面のない記録（見本・前の記録）に、組み直した形から図面を描いて足す。描いたあと、3D を元の形に戻す */
function fillDrawings(works: WorkRecord[]): WorkRecord[] {
  const need = works.filter((w) => !w.drawing && w.design);
  if (!need.length) return works;
  const out = works.map((w) => {
    if (w.drawing || !w.design) return w;
    const s = workSession(w);
    if (!s?.built) return w;
    const st = w.design.stone;
    viewer.setRing(s.built.ring, { color: stone?.extraction.color ?? { r: 200, g: 220, b: 240 }, colorless: true, shade: s.state.metal }, s.built.problems);
    const shapeName = w.title.replace(/^見本：/, "").replace(/の一粒石の指輪.*$/, "");
    const drawing = safeDrawing(() => solitaireDrawing(s.built!, probLabels(s.built!).map((t) => t.replace(/（.*$/, "")), s, { shapeName, outlineMm: st.outlineMm, longMm: st.longMm, widthMm: st.widthMm, depthMm: st.depthMm }, BOOK_PX));
    if (!drawing) return w;
    const next = { ...w, drawing };
    updateWork(next);
    return next;
  });
  // 3D を、いま作っている形に戻す
  if (kind === "band") showBand();
  else if (session?.built && stone) viewer.setRing(session.built.ring, { color: stone.extraction.color, colorless: stone.extraction.colorless, shade: session.state.metal }, session.built.problems, narrowArmOf(session.built)?.level);
  return out;
}
function thumbnail(): string {
  return withWholeBand(() => {
    viewer.snapshot(); // いまの形を描き直してから切り出す
    const c = document.createElement("canvas");
    c.width = c.height = 360;
    const g = c.getContext("2d")!;
    // 真ん中を正方形に切り出す
    const cv = $(".gl canvas") as HTMLCanvasElement;
    const s0 = Math.min(cv.width, cv.height);
    g.drawImage(cv, (cv.width - s0) / 2, (cv.height - s0) / 2, s0, s0, 0, 0, 360, 360);
    return c.toDataURL("image/jpeg", 0.8);
  });
}
function openSaveWork(slot: HTMLElement, data: WorkData) {
  slot.innerHTML = `<div class="save-form">
    <label>作った人<input type="text" class="w-maker" value="${esc(masterName(store.ledger()) === "職人" ? "" : masterName(store.ledger()))}" placeholder="名前"></label>
    <label>話して残す（気をつけたこと・コツ・なぜそうしたか）<textarea rows="3" class="w-note" placeholder="${kind === "band" ? "例：角は落としすぎない。ロウは継ぎ目の反対から熱した" : "例：座は爪の 3 分の 1 まで。ロウは継ぎ目の反対から熱した"}"></textarea></label>
    <p class="hint">${store.password() ? "Claude が、話を工程ごとのコツに分けて残します。次に同じ工程を作る人の画面に「前の記録から」と出ます。" : "話はそのまま残します（合言葉があると、Claude が工程ごとのコツに分けます）。"}</p>
    <div class="row"><button type="button" class="ghost-d w-mic">話す</button><button type="button" class="primary w-save">記録する</button></div>
  </div>`;
  const note = slot.querySelector<HTMLTextAreaElement>(".w-note")!;
  const voice = bindVoice(slot.querySelector<HTMLButtonElement>(".w-mic")!, note);
  slot.querySelector(".w-save")!.addEventListener("click", async () => {
    voice.stop();
    const said = note.value.trim();
    const maker = slot.querySelector<HTMLInputElement>(".w-maker")!.value.trim();
    const titles = data.steps.map((s) => s.title);
    let tips: Tip[] = [];
    let leftOver = "";
    let sortNote = "";
    if (said) {
      // 話を残すだけなら、合言葉の窓を出さない（合言葉があるときだけ、工程に分ける）
      const pass = store.password();
      if (pass) {
        slot.innerHTML = `<p class="saved working"><span class="pulse"></span> Claude が、話を工程ごとのコツに分けています…</p>`;
        const r = await callTool({ system: tipsPrompt(titles), user: `作った物：${data.title}\n職人が話したこと：${said}`, tool: SORT_TIPS, parse: parseTips(titles), password: pass, speed: "fast" });
        if (r.ok) ({ tips, leftOver } = r.value);
        else {
          if (r.code === "wrong_password") resetPassword();
          sortNote = `工程に分けられませんでした（${r.error}）。話はそのまま残しました。`;
        }
      } else sortNote = "合言葉がないので、話はそのまま残しました（工程には分けていません）。";
    }
    const ok = saveWork({
      id: newWorkId(),
      date: today(),
      title: data.title,
      kind: data.kind,
      methodLabel: method === "hand" ? "鍛造" : "鋳造",
      image: thumbnail(),
      specs: data.specs,
      problems: data.problems,
      // 記録には細かい手順を入れない（このブラウザの入れ物が小さいため）
      steps: data.steps.map(({ details: _d, ...rest }) => rest),
      note: said,
      maker,
      tips,
      design: data.design,
      bandDesign: data.bandDesign,
      drawing: safeDrawing(data.drawing),
    });
    if (!ok) {
      slot.innerHTML = `<p class="build-warn">このブラウザにはもう入りません。「記録」で古い物を消してください。</p>`;
      return;
    }
    slot.innerHTML = `<div class="saved"><b>記録しました（${loadWorks().length} 作品目）</b>
      ${tips.length ? `<ul class="sorted">${tips.map((t) => `<li><i class="k-${t.kind}">${esc(t.kind)}</i><span><small>${esc(t.step)}</small>${esc(t.text)}</span></li>`).join("")}</ul>` : ""}
      ${leftOver ? `<p class="hint">工程に当てはまらなかった話：${esc(leftOver)}</p>` : ""}
      ${sortNote ? `<p class="hint">${esc(sortNote)}</p>` : ""}
      <button type="button" class="link to-works">記録を見る →</button></div>`;
    slot.querySelector(".to-works")?.addEventListener("click", () => setMode("works"));
  });
}
/** 見本の作品を記録に入れる（動画を撮るときだけ。画面からは外した 2026-11-05 作者。よくある形の石から組んだ設計で、職人の作品ではないと、名前と言葉で示す） */
function addSampleWorks(): number {
  let n = 0;
  const have = new Set(loadWorks().filter(isSample).map((w) => w.title));
  for (const d of SAMPLE_DESIGNS) {
    const { preset, stone: st } = sampleStone(d.preset, d.sizeMm);
    const title = `見本：${preset.name}の一粒石の指輪（${d.label}）`;
    if (have.has(title)) continue;
    const s = new RingSession(st, () => store.ledger(), () => undefined, () => "");
    s.state = sampleState(d);
    tuneSample(s);
    fixProngSize(s);
    if (!s.built) continue;
    const data = solitaireData(s, { shapeName: preset.name, outlineMm: st.outlineMm, longMm: st.longMm, widthMm: st.widthMm, depthMm: st.depthMm }, "hand");
    const ok = saveWork({
      id: newWorkId(),
      date: today(),
      title,
      kind: data.kind,
      methodLabel: "鍛造",
      image: outlineThumb(st),
      specs: data.specs,
      problems: data.problems,
      steps: data.steps.map(({ details: _d, ...rest }) => rest),
      note: SAMPLE_NOTE,
      maker: SAMPLE_MAKER,
      design: data.design,
    });
    if (ok) n++;
  }
  return n;
}
/**
 * 記録の形を開き直す（記録はそのまま。開いた形を直しても、記録は変わらない）。
 * 記録に写真はないので、石の写真の欄には輪郭から描いた絵を出す
 */
function openWork(w: WorkRecord) {
  if (!w.design && !w.bandDesign) return;
  if (!askConfirm(`この形を開きますか？\n「${w.title}」\n今の設計は、この形に変わります（記録は変わりません）。`)) return;
  if (w.bandDesign) {
    band = normalizeBand(structuredClone(w.bandDesign.band));
    setBandMetal(w.bandDesign.metal);
    setKind("band");
  } else if (w.design) {
    stopIntro();
    const st = w.design.stone;
    const W = 720;
    const k = 260 / st.longMm;
    const c = document.createElement("canvas");
    c.width = c.height = W;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.fillStyle = "#f6f5f2";
    g.fillRect(0, 0, W, W);
    g.beginPath();
    st.outlineMm.forEach((q, i) => (i ? g.lineTo(W / 2 + q.x * k, W / 2 - q.y * k) : g.moveTo(W / 2 + q.x * k, W / 2 - q.y * k)));
    g.closePath();
    g.fillStyle = "#a9b0b7";
    g.fill();
    const look = w.design.look ?? { color: { r: 200, g: 220, b: 240 }, colorless: true };
    const measured: StoneOutline = { outlineMm: [...st.outlineMm], longMm: st.longMm, widthMm: st.widthMm, widthFromPhotoMm: st.widthMm, widthFromPhoto: false, mmPerPx: 1 / k, imageAngle: 0 };
    const corners = findCorners(measured.outlineMm);
    stone = {
      photo: g.getImageData(0, 0, W, W),
      label: `記録：${w.title}`,
      extraction: { outlinePx: st.outlineMm.map((q) => ({ x: W / 2 + q.x * k, y: W / 2 - q.y * k })), color: look.color, colorless: look.colorless } as Extraction,
      measured,
      longMm: st.longMm,
      depthMm: st.depthMm,
      shapeName: w.title.replace(/^見本：/, "").replace(/の一粒石の指輪.*$/, "") || nameShape(measured.outlineMm, corners).name,
      cornerIdx: corners.map((x) => ({ index: outlineIndexAtT(measured.outlineMm, x.t), angle: Math.round(x.angleDeg) })),
    };
    keptPhoto = null;
    compare = null;
    stoneKey = null;
    renderStoneButtons();
    $<HTMLInputElement>(".in-long").value = String(Number(st.longMm.toFixed(2)));
    $<HTMLInputElement>(".in-depth").value = String(Number(st.depthMm.toFixed(2)));
    $(".stone-sub").textContent = `${stone.shapeName}・${st.longMm.toFixed(2)} × ${st.widthMm.toFixed(2)} mm`;
    drawThumb();
    session = newSession(measured, st.depthMm);
    session.state = structuredClone(w.design.state);
    setKind("solitaire");
  }
  lastRule = null;
  pastCheck = null;
  setMode("refine");
  $(".studio-refine").scrollTop = 0;
  toast(`開きました：${w.title}`);
}
/** 記録：自分で残した指輪の一覧。1 つの作品は小さな絵・名前・開くボタン。名前を押すと細かい事が出る */
function renderWorks() {
  const box = $(".works-panel");
  const works = loadWorks();
  box.innerHTML = `
    <p class="works-line">${works.length ? "残した指輪です。開くと続きを作れます。" : "設計を残すと、ここに並びます。あとで開いて続きを作れます"}</p>
    <button type="button" class="primary w-keep">今の設計を残す →</button>
    ${works.length ? `<ul class="works-list">${works
      .map(
        (w) => `<li><img alt="" src="${w.image}"><details class="w-more"><summary>${esc(w.title)}</summary><small>${esc(w.date)}${w.maker ? ` ・ ${esc(w.maker)}` : ""} ・ ${esc(w.methodLabel)}</small>${w.note ? `<p>「${esc(w.note)}」</p>` : ""}${(w.revisions ?? []).map((r) => `<p class="rev">${esc(r.by)}の決まりで直した：${esc(r.change)}</p>`).join("")}<span class="${w.problems.length ? "ng" : "ok"}">${w.problems.length ? "作れない所あり" : "作れる形"}</span></details>${w.design || w.bandDesign ? `<button type="button" class="ghost-d w-open" data-id="${esc(w.id)}">開く</button>` : "<span></span>"}<button type="button" class="w-del" data-id="${esc(w.id)}" aria-label="この記録を消す">×</button></li>`,
      )
      .join("")}</ul><button type="button" class="ghost-d w-print">記録の帳面を印刷</button>` : ""}
    <nav class="places-sm" aria-label="ほかの場所"><small>ほかの場所</small><a href="app.html#ledger">帳面<span>職人の決まりと、Claude からの質問</span></a><a href="app.html#learn">学ぶ<span>次の人が、職人の決まりに聞く</span></a><a href="app.html#waza">技<span>彫金・金工の技と、途切れた技を組み立て直す</span></a></nav>`;
  box.querySelector(".w-print")?.addEventListener("click", () => openPrint(worksBookHtml(fillDrawings(loadWorks()), today())));
  // 残す欄は「手順」の下にある。そこまで連れて行って、欄を開く
  box.querySelector(".w-keep")!.addEventListener("click", () => {
    setMode("hand");
    const save = document.querySelector<HTMLButtonElement>(".build-panel .p-save");
    if (!save) return;
    save.click();
    requestAnimationFrame(() => document.querySelector(".build-panel .save-work")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  });
  box.querySelectorAll<HTMLButtonElement>(".w-open").forEach((b) =>
    b.addEventListener("click", () => {
      const w = loadWorks().find((x) => x.id === b.dataset.id);
      if (w) openWork(w);
    }),
  );
  box.querySelectorAll<HTMLButtonElement>(".w-del").forEach((b) =>
    b.addEventListener("click", () => {
      if (!askConfirm("この記録を消しますか？\n消すと戻せません。")) return;
      removeWork(b.dataset.id!);
      renderWorks();
    }),
  );
}

// ---- なぜ継ぐ（往復の図・20 年の図・残し方） ----
function openWhy() {
  let el = document.querySelector<HTMLElement>(".why");
  if (!el) {
    el = document.createElement("div");
    el.className = "why";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "なぜ継ぐ");
    document.body.appendChild(el);
  }
  el.innerHTML = whyHtml();
  bindFlowMotion(el);
  el.hidden = false;
  el.scrollTop = 0;
  const close = () => {
    el!.hidden = true;
    if (location.hash === "#why") history.replaceState(null, "", location.pathname + location.search);
  };
  el.querySelector(".why-close")!.addEventListener("click", close);
  el.querySelector(".why-go")!.addEventListener("click", close);
}
$(".act-why").addEventListener("click", () => {
  history.replaceState(null, "", "#why");
  openWhy();
});
if (location.hash === "#why") openWhy();
// 寸法を引く・爪を押して直す（撮影では出さない。前の動画の絵を変えないため）
if (!filming()) {
  measure = setupMeasure(
    {
      viewer,
      vp: $(".vp"),
      gl: $(".gl"),
      toast,
      // 形の印：設計の写しと石の大きさ（細かい形への作り直しでは変わらない）
      shapeKey: () => JSON.stringify([kind, stone?.measured.longMm, stone?.measured.widthMm, stone?.depthMm, kind === "band" ? [band, bandMetal] : session?.snapshot()]),
      features: () => (kind === "solitaire" && session?.built ? ringFeatures(session.built.ring) : []),
      avoid: dimsAvoid,
    },
    $(".t-measure"),
  );
  $(".t-measure").addEventListener("click", () => prongEdit?.close());
  prongEdit = setupProngEdit({
    viewer,
    vp: $(".vp"),
    gl: $(".gl"),
    session: () => session,
    can: () => $(".pro").dataset.mode === "refine" && kind === "solitaire" && session?.state.style === "prong" && !measure?.on && !placeOn && !presentOn && !sheetOn && !compare,
    toast,
    tipLabel: PRONG_TIP_LABEL,
    // 爪の欄のつまみを動かしている間は、右の欄を描き直さない（離したときに描き直す）
    hold: (on) => (holdPanel = on),
  });
}
// 動画を 1 コマずつ撮るとき（?rec）：3D をページの外から回せるようにする
if (new URLSearchParams(location.search).has("rec")) {
  const w = window as unknown as { __viewer: Viewer; __propose: (p: ProposeRuleInput, said?: string) => Promise<ProposeRuleResult> };
  w.__viewer = viewer;
  // 画面の確かめ用：Claude の決まりの案の代わりに、案を直接出す（本番の動画には使わない）
  w.__propose = (p, said?: string) => propose($(".ar-proposal"), p, masterName(store.ledger()), said ?? p.quote ?? "");
}

// 前に入れた見本の作品は消す（職人が残した作品は消さない）。撮影は見本を使うので、そのまま
if (!filming()) removeSampleWorks();
setMode("make");
void restoreDesign()
  .catch(() => false)
  .then(async (back) => {
    if (!back) await loadSample();
    const gothicId = new URLSearchParams(location.search).get("gothic");
    if (gothicId) await openShowcaseGothic(gothicId, new URLSearchParams(location.search).has("fine"));
    // 帳面の「計算を見る」から来たとき：確かめるの札を開く
    if (location.hash === "#tension" && session) {
      if (session.state.style !== "tension") session.setSetting({ style: "tension", reason: "帳面の計算を見る" });
      setMode("refine");
      tnOpen.add("calc");
      renderCheck();
      document.querySelector(".tn-card")?.scrollIntoView({ block: "start" });
    }
  })
  .catch((e) => setStatus(`見本の石を読めませんでした：${(e as Error).message}`));
/** 入口のページの見本の指輪を開く（アプリの断面の編集で作った形。数字は src/lp/band-showcase.json） */
function openShowcaseBand(b: Band, cut = false) {
  setKind("band");
  band = normalizeBand(structuredClone(b));
  bandCut = cut;
  showBand();
}
const showcaseId = new URLSearchParams(location.search).get("band");
const showcase = (bandShowcase.shapes as unknown as { id: string; band: Band; cut?: string }[]).find((x) => x.id === showcaseId);
if (showcase) openShowcaseBand(showcase.band, !!showcase.cut);
/** 見本のゴシックを開く（?gothic=<id>。数字は src/lp/gothic-showcase.json。大きく写す絵の細かい網目は &fine=1 のときだけ） */
async function openShowcaseGothic(id: string, fine: boolean) {
  const { default: data } = await import("../lp/gothic-showcase.json");
  const d = (data as unknown as Record<string, { stone?: string; stoneLongMm?: number; stoneDepthMm?: number; state?: Partial<RingState> } | undefined>)[id];
  const preset = PRESETS.find((p) => p.id === d?.stone);
  if (!d?.state || !preset) return;
  await loadPreset(preset);
  if (d.stoneLongMm && stone) await loadStone(stone.photo, stone.label, d.stoneLongMm, d.stoneDepthMm ?? stone.depthMm, { same: { shape: true, size: false } });
  if (!session) return;
  const state = structuredClone(d.state);
  if (state.shankRelief && !fine) delete state.shankRelief.fine;
  session.state = { ...session.state, ...state };
  session.build("見本を開く");
  session.flush();
}
/** 入口のページの手順の札（public/lp/make-steps.json）を作る所：scripts/lp-shots.cjs の steps が読む */
function makeCards(m: Method) {
  if (!session?.built) return [];
  return howToMake(howInput(session.built), m).map((st, i) => {
    const c = stepCard(st, i);
    return { no: c.no, title: c.title, lead: c.text, rows: c.rows.map((x) => [x.label, x.value]), watch: c.watch ?? "", tools: c.tools, more: cardFlow(c, m).lines };
  });
}
(window as unknown as { __studio: unknown }).__studio = { get session() { return session; }, get measure() { return measure; }, setMode, dimsAvoid, loadPreset, viewer, makeCards, openShowcaseBand };
