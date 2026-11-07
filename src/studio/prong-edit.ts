// 爪を押して、その爪だけ（または全部の爪）の形を直す小さな欄（作者の声 2026-11-06：爪だけをタップしたら編集できるモードをつけたら、先を反らせるとかできる）。
// 値の範囲は GUIDES.prong.edit の 1 か所から。どれも仮の数字。確かめのルールは今までどおり効く。
import type { ProngLook, ProngTip } from "../geometry/setting";
import type { Viewer } from "../ui/viewer";
import { GUIDES, GUIDE_NOTE } from "../rules/guides";
import type { Built, RingSession } from "./session";
import { bindSlider, liveWait, sliderHtml, type SliderSpec } from "./slider";

/** 押した所から爪を探す距離（画面の px）：マウスと指 */
const PICK_PX = { mouse: 6, touch: 20 };
/** 押した指がこれより動いたら、回す操作とみなす（px） */
const TAP_PX = 6;

export interface ProngEditHost {
  viewer: Viewer;
  vp: HTMLElement;
  gl: HTMLElement;
  session: () => RingSession | null;
  /** 今、爪を押して直せる場面か（確かめるの場面で、爪留めで、ほかの道具を使っていないとき） */
  can: () => boolean;
  toast: (t: string) => void;
  /** 先の形の名前 */
  tipLabel: Record<ProngTip, string>;
  /** つまみを動かしている間は true、離したら false（画面の欄を描き直さない。指の下のつまみが消えないように） */
  hold?: (on: boolean) => void;
}

export interface ProngEditUi {
  /** 形を作り直したあとに呼ぶ（選んだ爪の印を置き直し、欄の数字をそろえる） */
  sync: (b: Built) => void;
  close: () => void;
  /** この指の押しで爪を選んだか（赤い所を押したときの案内と、ぶつからないように） */
  readonly claimed: boolean;
}

type Scope = "one" | "all";

export function setupProngEdit(host: ProngEditHost): ProngEditUi {
  const { viewer, vp, gl } = host;
  const pop = document.createElement("div");
  pop.className = "prong-pop";
  pop.hidden = true;
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "爪を直す");
  vp.appendChild(pop);

  let index: number | null = null;
  let scope: Scope = "one";
  /** 欄に出している値（形を作り直したあと、変わっていたときだけ欄を描き直す。押している間に作り直すとボタンが消えるため） */
  let shown = "";
  let claimed = false;
  let down: { x: number; y: number; id: number } | null = null;

  const E = GUIDES.prong.edit;
  const specs = (l: Required<ProngLook>): { spec: SliderSpec; key: keyof ProngLook }[] => [
    { key: "diameterMm", spec: { cls: "pp-dia", label: "太さ", ...E.diameterMm, value: l.diameterMm, unit: "mm" } },
    { key: "flareMm", spec: { cls: "pp-flare", label: "先の反り", ...E.flareMm, value: l.flareMm, unit: "mm" } },
    { key: "tipLengthMm", spec: { cls: "pp-len", label: "先の長さ", ...E.tipLengthMm, value: l.tipLengthMm, unit: "mm" } },
    { key: "baseScale", spec: { cls: "pp-base", label: "土台の太さ", ...E.baseScale, value: l.baseScale, unit: "倍" } },
    { key: "tipScale", spec: { cls: "pp-tip", label: "先の力強さ", ...E.tipScale, value: l.tipScale, unit: "倍" } },
  ];
  const lookNow = (): Required<ProngLook> | null => (index === null ? null : (host.session()?.prongLookAt(index) ?? null));
  const keyOf = (l: Required<ProngLook>) => JSON.stringify([l.diameterMm, l.tip, l.flareMm, l.tipLengthMm, l.baseScale, l.tipScale, scope]);

  /** この爪のことで出ている確かめの結果 */
  const checkHtml = (): string => {
    const b = host.session()?.built;
    if (!b || index === null) return "";
    const mine = b.problems.filter((p) => p.target.kind === "prong" && p.target.index === index);
    const hold = b.problems.find((p) => p.check === "hold");
    const lines = [...mine, ...(hold ? [hold] : [])].map((p) => `<li>${p.where}：${p.current} → ${p.required}</li>`);
    return lines.length ? `<ul class="pp-bad">${lines.join("")}</ul>` : `<p class="pp-ok">この爪は、確かめの目安の中です</p>`;
  };
  const apply = (patch: ProngLook) => {
    const s = host.session();
    if (!s || index === null) return;
    s.setProngLook(scope === "all" ? null : index, patch);
  };

  // つまみを動かしている間も、目盛りが 1 つ変わるごとに形を作り直して見せる（2026-11-06 作者の声：離したときに一度に変わると、ボンと跳んで見える）。
  // 作り直しは「すぐの形」（session.build。一体の形は別の糸）。1 こまに 1 回まで、遅い機械では前の作り直しと同じ時間だけ休んで、指の動きを止めない
  let dragging = false;
  let liveNext: ProngLook | null = null;
  let liveKey = "";
  let liveRaf = 0;
  let liveTimer = 0;
  let liveCost = 0;
  let liveAt = 0;
  const endLive = () => {
    cancelAnimationFrame(liveRaf);
    clearTimeout(liveTimer);
    liveRaf = 0;
    liveTimer = 0;
    liveNext = null;
    liveKey = "";
    if (!dragging) return;
    dragging = false;
    host.hold?.(false);
  };
  const runLive = () => {
    liveRaf = 0;
    const patch = liveNext;
    liveNext = null;
    if (!patch || !dragging) return;
    const t0 = performance.now();
    apply(patch);
    liveAt = performance.now();
    liveCost = liveAt - t0;
  };
  const liveLook = (patch: ProngLook) => {
    if (!dragging) {
      dragging = true;
      host.hold?.(true);
    }
    const k = JSON.stringify(patch);
    if (k === liveKey) return;
    liveKey = k;
    liveNext = patch;
    if (liveRaf || liveTimer) return;
    const wait = liveWait(liveAt, liveCost, performance.now());
    if (wait > 0)
      liveTimer = window.setTimeout(() => {
        liveTimer = 0;
        liveRaf = requestAnimationFrame(runLive);
      }, wait);
    else liveRaf = requestAnimationFrame(runLive);
  };
  const render = () => {
    const l = lookNow();
    if (!l || index === null) return;
    shown = keyOf(l);
    const n = host.session()?.built?.ring.setting.prongs.length ?? 0;
    const list = specs(l);
    pop.innerHTML = `<header><b>爪 ${index + 1}</b><small>全部で ${n} 本</small><button type="button" class="pp-x" aria-label="閉じる">×</button></header>
      <div class="pick pp-scope"><span>直す爪</span><div><button type="button" data-scope="one" aria-pressed="${scope === "one"}">この爪だけ</button><button type="button" data-scope="all" aria-pressed="${scope === "all"}">全部の爪にそろえる</button></div></div>
      <div class="pick"><span>先の形</span><div>${(["round", "oni"] as const).map((t) => `<button type="button" data-tip="${t}" aria-pressed="${l.tip === t}">${host.tipLabel[t]}</button>`).join("")}</div></div>
      <div class="sliders">${list.map((x) => sliderHtml(x.spec)).join("")}</div>
      <button type="button" class="ghost-d pp-strong">土台を太く、先を力強く</button>
      <div class="pp-check">${checkHtml()}</div>
      <div class="pp-foot"><button type="button" class="link pp-reset">${scope === "all" ? "全部の爪の直しを消す" : "この爪の直しを消す"}</button></div>
      <p class="hint">数字は仮です。${GUIDE_NOTE}</p>`;
    for (const { spec, key } of list)
      bindSlider(
        pop,
        spec,
        (v) => {
          // 離したとき：欄を描き直せるようにしてから、決めた値で作り直す
          endLive();
          apply({ [key]: v });
        },
        (v) => liveLook({ [key]: v }),
      );
    // 元の値に戻して離したとき（値が変わらないので上は呼ばれない）も、動かしている間の印を外す
    pop.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((r) => r.addEventListener("change", endLive));
    pop.querySelector(".pp-x")!.addEventListener("click", close);
    pop.querySelectorAll<HTMLButtonElement>("[data-scope]").forEach((b) =>
      b.addEventListener("click", () => {
        scope = b.dataset.scope as Scope;
        // 全部の爪にそろえる：この爪の形を、全部の爪へ。戻すは、上の「戻す」で
        if (scope === "all" && index !== null) host.session()?.alignProngs(index);
        render();
      }),
    );
    pop.querySelectorAll<HTMLButtonElement>("[data-tip]").forEach((b) => b.addEventListener("click", () => apply({ tip: b.dataset.tip as ProngTip })));
    pop.querySelector(".pp-strong")!.addEventListener("click", () => apply({ baseScale: E.strong.baseScale, tipScale: E.strong.tipScale }));
    pop.querySelector(".pp-reset")!.addEventListener("click", () => {
      host.session()?.resetProngLook(scope === "all" ? null : index);
    });
  };
  const mark = (b: Built | null | undefined) => {
    const pr = index === null ? null : b?.ring.setting.prongs[index];
    // 石を並べた指輪では、真ん中の石の三角形の範囲の中の番号
    const start = b?.ring.stones[0]?.ranges.setting.start ?? 0;
    viewer.markSetting(pr ? { start: start + pr.triangles.start, count: pr.triangles.count } : null);
  };
  function close() {
    endLive();
    if (index === null) return;
    index = null;
    pop.hidden = true;
    pop.innerHTML = "";
    viewer.markSetting(null);
  }
  const open = (i: number) => {
    index = i;
    scope = "one";
    pop.hidden = false;
    render();
    mark(host.session()?.built);
  };

  /** 石座の三角形の番号 → 爪（どの石の何本目か）。爪でなければ null */
  const prongOf = (b: Built, face: number): { stone: number; prong: number } | null => {
    const list = b.ring.stones.length ? b.ring.stones : [{ setting: b.ring.setting, ranges: { setting: { start: 0 } } }];
    for (let si = 0; si < list.length; si++) {
      const st = list[si];
      for (let i = 0; i < st.setting.prongs.length; i++) {
        const r = st.setting.prongs[i].triangles;
        const f = face - st.ranges.setting.start;
        if (f >= r.start && f < r.start + r.count) return { stone: si, prong: i };
      }
    }
    return null;
  };

  gl.addEventListener(
    "pointerdown",
    (e) => {
      claimed = false;
      down = e.button === 0 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    },
    { capture: true },
  );
  gl.addEventListener(
    "pointerup",
    (e) => {
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX) return;
      if (!host.can()) return;
      const b = host.session()?.built;
      if (!b) return;
      const hit = viewer.pickSetting(e.clientX, e.clientY, e.pointerType === "mouse" ? PICK_PX.mouse : PICK_PX.touch, (f) => prongOf(b, f));
      if (!hit) return close();
      claimed = true;
      if (hit.stone > 0) return host.toast("いまは、真ん中の石の爪だけ直せます");
      if (hit.prong === index) return close();
      open(hit.prong);
    },
    { capture: true },
  );
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || index === null) return;
    if ((e.target as HTMLElement).closest?.("input, textarea, select") || document.querySelector("dialog[open]")) return;
    close();
  });

  return {
    sync(b) {
      if (index === null) return;
      if (b.ring.setting.style !== "prong" || index >= b.ring.setting.prongs.length) return close();
      mark(b);
      const l = lookNow();
      // つまみを動かしている間は欄を描き直さない（指の下のつまみが消える）。確かめの結果だけ、その場で替える
      if (!dragging && l && keyOf(l) !== shown) render();
      else {
        const box = pop.querySelector(".pp-check");
        if (box) box.innerHTML = checkHtml();
      }
    },
    close,
    get claimed() {
      return claimed;
    },
  };
}
