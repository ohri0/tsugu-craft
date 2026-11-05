// 腕の線：腕の場所ごとの形を、人が手で変える欄（Claude の set_shank の stations と同じ関数を動かす）。
// 肩と下の幅・厚み・断面、腕の流れ。石座のそばの形は、断面の図（section-edit）で決める。
// 画面の組み立てはここにまとめ、main.ts は呼ぶだけにする。
import { SHANK_SECTION_LABEL, SHANK_SECTIONS, type ShankSection, type ShankStation } from "../geometry/shank";
import { GUIDES } from "../rules/guides";
import { bindSlider, sliderHtml, type SliderSpec } from "./slider";
import { stationTo, type RingSession, type RingState } from "./session";
import type { SetShankInput } from "../claude/tools";
import { startShape, type SectionShape } from "./section-edit";

/** つまみの範囲（形を作るための決まり。目安との比べは確かめがする） */
const RANGE = { width: [1, 6, 0.05], thickness: [0.8, 4, 0.05], at: [30, 150, 5], sway: [-2, 2, 0.1] } as const;
/** 「場所で変える」を押したときの、はじめの置き方（肩と下。形を作るための決まり） */
const START = { shoulderDeg: 70, bottomDeg: 180, bottomRatio: 0.85 };

/** 腕の下は、断面の線を描く相手にできる。null ＝ 石座のそば */
let drawTarget: number | null = null;

/** 断面の図で描く相手（欄を描き直しても続く）。場所がなくなったら石座のそばに戻す */
export function sectionTarget(s: RingState): number | null {
  if (drawTarget !== null && !s.shankStations?.[drawTarget]) drawTarget = null;
  return drawTarget;
}

/** 場所ごとの形を、はじめて入れるときの形：肩はいちばん上と同じ、下は少し細く薄く（目安より細くはしない） */
export function startStations(widthMm: number, thicknessMm: number, g = GUIDES): ShankStation[] {
  return [
    { atDeg: START.shoulderDeg, widthMm, thicknessMm },
    { atDeg: START.bottomDeg, widthMm: round(Math.max(g.band.minWidthMm, widthMm * START.bottomRatio)), thicknessMm: round(Math.max(g.band.minThicknessMm, thicknessMm * START.bottomRatio)) },
  ];
}

const round = (v: number) => Math.round(v * 100) / 100;

function placeName(st: ShankStation): string {
  return st.atDeg >= 175 ? "腕の下" : st.atDeg >= 120 ? "下の方" : "肩";
}

const specs = (st: ShankStation, i: number): SliderSpec[] => {
  const name = placeName(st);
  const list: SliderSpec[] = [
    { cls: `sl-w${i}`, label: `${name}の幅`, min: RANGE.width[0], max: RANGE.width[1], step: RANGE.width[2], value: st.widthMm, unit: "mm" },
    { cls: `sl-t${i}`, label: `${name}の厚み`, min: RANGE.thickness[0], max: RANGE.thickness[1], step: RANGE.thickness[2], value: st.thicknessMm, unit: "mm" },
  ];
  if (st.atDeg < 175) {
    list.push({ cls: `sl-a${i}`, label: `${name}の場所`, min: RANGE.at[0], max: RANGE.at[1], step: RANGE.at[2], value: st.atDeg, unit: "°" });
    list.push({ cls: `sl-s${i}`, label: `${name}の流れ`, min: RANGE.sway[0], max: RANGE.sway[1], step: RANGE.sway[2], value: st.swayMm ?? 0, unit: "mm" });
  }
  return list;
};

const toggle = (key: string, value: string, on: boolean, label: string) => `<button type="button" data-line="${key}" data-v="${value}" aria-pressed="${on}">${label}</button>`;

/** 欄の HTML。テンション・丸線の腕には出さない（どこも同じ形） */
export function shankLineHtml(s: RingState): string {
  if (s.style === "tension" || s.shankSection === "maru") return "";
  const list = s.shankStations ?? [];
  const on = list.length > 0;
  const target = sectionTarget(s);
  return `<section class="shank-line">
    <div class="pick"><span>腕の線</span><div>${toggle("mode", "same", !on, "どこも同じ")}${toggle("mode", "vary", on, "場所で変える")}</div></div>
    ${
      on
        ? `<div class="sliders">${list.flatMap((st, i) => specs(st, i).map(sliderHtml)).join("")}</div>
      ${list
        .map((st, i) => {
          const cur = st.curve ? "free" : (st.section ?? "same");
          const opts: [string, string][] = [["same", "上と同じ"], ...SHANK_SECTIONS.map((k) => [k, SHANK_SECTION_LABEL[k]] as [string, string]), ...(st.curve ? [["free", SHANK_SECTION_LABEL.free] as [string, string]] : [])];
          return `<div class="pick"><span>${placeName(st)}の断面</span><div>${opts.map(([v, l]) => toggle(`section:${i}`, v, v === cur, l)).join("")}</div></div>`;
        })
        .join("")}
      <div class="pick"><span>図で描く断面</span><div>${toggle("draw", "top", target === null, "石座のそば")}${list.map((st, i) => toggle("draw", String(i), target === i, placeName(st))).join("")}</div></div>
      <small class="sl-note">石座のそばの幅と厚みは、上の断面の図で決めます。腕の端が石座に当たる所は、石座のそばの形のままです。流れは、片方の肩が指先へ寄ると、もう片方は付け根へ寄ります。${GUIDES.band.minWidthMm} mm・${GUIDES.band.minThicknessMm} mm より細い・薄い場所は、確かめが知らせます（目安・最後は職人が決める）。</small>`
        : ""
    }
  </section>`;
}

/** 断面の図を、選んだ場所の断面に向ける：はじまりの形と、変えたときに腕へ渡す入力 */
export function sectionBinding(s: RingState): { start: SectionShape; apply: (sec: SectionShape) => Pick<SetShankInput, "stations"> } | null {
  const i = sectionTarget(s);
  if (i === null) return null;
  const list = s.shankStations!;
  // その場所に断面を書いていなければ、上の場所の断面から描き始める
  let section: ShankSection = s.shankSection ?? "kouman";
  let curve = s.sectionCurve;
  for (let k = 0; k <= i; k++) {
    if (list[k].curve) {
      section = "free";
      curve = list[k].curve;
    } else if (list[k].section) {
      section = list[k].section!;
      curve = undefined;
    }
  }
  const st = list[i];
  return {
    start: startShape(section, curve, undefined, st.widthMm, st.thicknessMm),
    apply: (sec) => ({
      stations: list.map((q, k) => stationTo(k === i ? { ...q, widthMm: round(sec.widthMm), thicknessMm: round(sec.thicknessMm), ...(sec.section === "free" ? { section: "free" as const, curve: sec.curve } : { section: sec.section as ShankStation["section"], curve: undefined }) } : q)),
    }),
  };
}

/** 欄を動くようにする。ふつうの変更は session.setShank。図で描く相手を変えたときは redraw（欄を描き直す） */
export function bindShankLine(box: HTMLElement, session: RingSession, redraw: () => void): void {
  const s = session.state;
  const root = box.querySelector<HTMLElement>(".shank-line");
  if (!root) return;
  const list = s.shankStations ?? [];
  const send = (next: ShankStation[]) => session.setShank({ stations: next.map(stationTo), reason: "手で" });
  root.querySelectorAll<HTMLButtonElement>("button[data-line]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = b.dataset.line!;
      const v = b.dataset.v!;
      if (key === "mode") {
        if (v === "same") {
          drawTarget = null;
          send([]);
        } else if (!list.length) {
          const sh = session.built!.ring.shank;
          send(startStations(sh.widthMm, sh.thicknessMm));
        }
        return;
      }
      if (key === "draw") {
        drawTarget = v === "top" ? null : Number(v);
        redraw();
        return;
      }
      if (key.startsWith("section:")) {
        const i = Number(key.split(":")[1]);
        const st = list[i];
        if (v === "free") return;
        send(list.map((q, k) => (k === i ? { atDeg: st.atDeg, widthMm: st.widthMm, thicknessMm: st.thicknessMm, swayMm: st.swayMm, ...(v === "same" ? {} : { section: v as ShankStation["section"] }) } : q)));
      }
    }),
  );
  list.forEach((st, i) => {
    for (const spec of specs(st, i)) {
      bindSlider(box, spec, (v) => {
        const field = spec.cls.startsWith("sl-w") ? "widthMm" : spec.cls.startsWith("sl-t") ? "thicknessMm" : spec.cls.startsWith("sl-a") ? "atDeg" : "swayMm";
        const next = list.map((q, k) => (k === i ? { ...q, [field]: v } : q));
        // 場所は順に並ぶように
        next.sort((a, b) => a.atDeg - b.atDeg);
        send(next);
      });
    }
  });
}
