// 「寸法を引く」の画面：3D の上で 2 点を押すと、線と距離が出る。何本も引けて、選んで消せる。
// 形は変えない（戻す・進むの線に入らない）。形が変わったら古い数字を残さず、消して知らせる。
import type { Viewer } from "../ui/viewer";
import { dimsSvg, type Rect, type V3 } from "./dims";
import { extremePoints, MeasureList, measureDim, measureLabel, measureMm, pickSnap, triangleSnaps, type Measure, type SnapPoint } from "./measure";

const VIEW_WORD = { top: "上", side: "横", front: "正面" } as const;
/** 吸いつく距離（画面の px）：マウスと指 */
const SNAP_PX = { mouse: 12, touch: 26 };
/** 押した指がこれより動いたら、回す・動かす操作とみなす（px） */
const TAP_PX = 8;

export interface MeasureHost {
  viewer: Viewer;
  /** 3D の入れ物（.vp） */
  vp: HTMLElement;
  /** 3D の面（.gl） */
  gl: HTMLElement;
  toast: (t: string) => void;
  /** 今の形の印。違う印になったら、引いた寸法は古い */
  shapeKey: () => string;
  /** 名前のある点（爪の先・石の先など） */
  features: () => SnapPoint[];
  /** 札を重ねない所 */
  avoid: () => { avoid: Rect[]; bounds: Rect };
}

export interface MeasureUi {
  readonly on: boolean;
  /** 引いた寸法（図面に入れるときに読む） */
  readonly items: readonly Measure[];
  start: () => void;
  stop: () => void;
  /** 3D を描き直すたびに呼ぶ */
  frame: (placed: Rect[]) => void;
}

export function setupMeasure(host: MeasureHost, button: HTMLElement): MeasureUi {
  const { viewer, vp, gl } = host;
  const list = new MeasureList();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "dims measures");
  svg.setAttribute("aria-hidden", "true");
  gl.after(svg);
  const panel = document.createElement("div");
  panel.className = "ms-panel";
  panel.hidden = true;
  vp.appendChild(panel);

  let on = false;
  /** 1 点目（2 点目を待っている間） */
  let first: SnapPoint | null = null;
  /** マウスの下の吸いつく点 */
  let hover: SnapPoint | null = null;
  let down: { x: number; y: number; id: number } | null = null;
  let version = -1;
  let cached: SnapPoint[] = [];
  let raf = 0;

  /** 形の端と名前のある点（形が変わったときだけ作り直す） */
  const featurePoints = (): SnapPoint[] => {
    if (version === viewer.contentVersion) return cached;
    version = viewer.contentVersion;
    cached = [...host.features(), ...viewer.meshPositions().flatMap(({ positions, lift }) => extremePoints(positions, lift).map((p): SnapPoint => ({ p, kind: "feature", name: "形のいちばん外" })))];
    return cached;
  };
  const project = (x: number, y: number, z: number) => viewer.project(x, y, z);
  const snapAt = (cx: number, cy: number, touch: boolean): SnapPoint | null => {
    const r = gl.getBoundingClientRect();
    const radius = touch ? SNAP_PX.touch : SNAP_PX.mouse;
    const hit = viewer.pickSurface(cx, cy, radius * 0.6);
    const cands: SnapPoint[] = [...featurePoints()];
    if (hit) cands.push(...triangleSnaps(hit.tri), { p: hit.point, kind: "surface", name: hit.stone ? "石の面" : undefined });
    return pickSnap(cands, { x: cx - r.left, y: cy - r.top }, project, radius);
  };
  /** 今の向きの、測る面（斜めならなし） */
  const planeNow = (): Measure["plane"] => {
    const f = viewer.flatView;
    const v = viewer.view;
    return f && v !== "angle" ? { dir: f.dir, name: VIEW_WORD[v] } : undefined;
  };

  const renderPanel = () => {
    const rows = list.items
      .map((m, i) => `<li class="${list.selected === m.id ? "sel" : ""}" data-id="${m.id}"><button type="button" class="ms-row"><b>${i + 1}</b><span>${measureLabel(m)}</span><small>${m.nameA ?? "面の点"} 〜 ${m.nameB ?? "面の点"}</small></button><button type="button" class="ms-del" aria-label="${i + 1} 本目の寸法を消す">×</button></li>`)
      .join("");
    panel.hidden = !on && !list.items.length;
    panel.innerHTML = `${on ? `<p class="ms-say">${first ? "2 点目を押してください" : "1 点目を押してください"}<small>形の点や角に吸いつきます。形は変わりません</small></p>` : ""}${rows ? `<ol class="ms-list">${rows}</ol>` : ""}<div class="ms-act">${list.items.length ? `<button type="button" class="ms-clear">全部消す</button>` : ""}${on ? `<button type="button" class="ms-stop">${first ? "この線をやめる" : "引くのをやめる"}</button>` : ""}</div>`;
    button.setAttribute("aria-pressed", String(on));
  };
  const redraw = () => {
    renderPanel();
    frameNow(lastPlaced);
  };
  let lastPlaced: Rect[] = [];
  const frameNow = (placed: Rect[]) => {
    lastPlaced = placed;
    if (svg.getBoundingClientRect().width === 0) return;
    const dims = list.items.map(measureDim);
    const o = host.avoid();
    let inner = dimsSvg(dims, project, 1, { ...o, placed: [...placed], selected: list.selected === null ? "" : `m${list.selected}` });
    const dot = (p: V3, cls: string) => {
      const q = project(p[0], p[1], p[2]);
      return q ? `<circle class="${cls}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="3.5"/>` : "";
    };
    for (const m of list.items) inner += dot(m.a, "ms-pt") + dot(m.b, "ms-pt");
    if (on && first) inner += dot(first.p, "ms-pt now");
    if (on && first && hover) {
      const plane = planeNow();
      const end = hover.p;
      const m: Measure = { id: 0, a: first.p, b: end, ...(plane ? { plane } : {}) };
      inner += dimsSvg([{ ...measureDim(m), key: undefined }], project, 1, { ...o, placed: [...placed] });
    }
    if (on && hover) {
      const q = project(hover.p[0], hover.p[1], hover.p[2]);
      if (q) {
        const corner = hover.kind !== "surface";
        inner += corner ? `<rect class="ms-snap" x="${(q.x - 5).toFixed(1)}" y="${(q.y - 5).toFixed(1)}" width="10" height="10"/>` : `<circle class="ms-snap" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="4"/>`;
        if (hover.name) inner += `<text class="ms-snap-name" x="${(q.x + 10).toFixed(1)}" y="${(q.y - 8).toFixed(1)}">${hover.name}</text>`;
      }
    }
    svg.innerHTML = inner;
  };

  const start = () => {
    on = true;
    first = null;
    hover = null;
    redraw();
  };
  const stop = () => {
    on = false;
    first = null;
    hover = null;
    redraw();
  };
  const placePoint = (s: SnapPoint) => {
    if (!first) {
      first = s;
      hover = null;
      return redraw();
    }
    const plane = planeNow();
    if (measureMm(first.p, s.p, plane?.dir) < 1e-3) return host.toast("同じ点です。ちがう点を押してください");
    list.add(first.p, s.p, plane, host.shapeKey(), { a: first.name, b: s.name });
    first = null;
    hover = null;
    redraw();
  };

  button.addEventListener("click", () => (on ? stop() : start()));
  gl.addEventListener(
    "pointerdown",
    (e) => {
      if (on && e.button === 0) down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    { capture: true },
  );
  gl.addEventListener("pointerup", (e) => {
    const d = down;
    down = null;
    if (!on || !d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX) return;
    const s = snapAt(e.clientX, e.clientY, e.pointerType !== "mouse");
    if (!s) return host.toast("形の上を押してください");
    placePoint(s);
  });
  gl.addEventListener("pointercancel", () => (down = null));
  // マウスだけ、押す前に吸いつく先を見せる（指には「上にある」がないので、押した所で決まる）
  gl.addEventListener("pointermove", (e) => {
    if (!on || e.pointerType !== "mouse" || e.buttons) return;
    const { clientX: x, clientY: y } = e;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      hover = snapAt(x, y, false);
      frameNow(lastPlaced);
    });
  });
  gl.addEventListener("pointerleave", () => {
    if (!on || !hover) return;
    hover = null;
    frameNow(lastPlaced);
  });
  panel.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".ms-stop")) {
      if (first) {
        first = null;
        return redraw();
      }
      return stop();
    }
    if (t.closest(".ms-clear")) {
      list.clear();
      return redraw();
    }
    const id = Number(t.closest<HTMLElement>("li[data-id]")?.dataset.id);
    if (!id) return;
    if (t.closest(".ms-del")) list.remove(id);
    else list.selected = list.selected === id ? null : id;
    redraw();
  });
  // 線の札を押すと、その線を選ぶ（選ぶと Delete で消せる。欄の × でも消せる）
  svg.addEventListener("click", (e) => {
    const k = (e.target as Element).closest?.("[data-key]")?.getAttribute("data-key");
    if (!k) return;
    const id = Number(k.slice(1));
    list.selected = list.selected === id ? null : id;
    redraw();
  });
  document.addEventListener("keydown", (e) => {
    const el = e.target as HTMLElement;
    if (el.closest?.("input, textarea, select") || document.querySelector("dialog[open]")) return;
    if (e.key === "Escape" && on) {
      if (first) {
        first = null;
        redraw();
      } else stop();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && list.selected !== null) {
      e.preventDefault();
      list.remove(list.selected);
      redraw();
    }
  });

  let seen = -1;
  return {
    get on() {
      return on;
    },
    get items() {
      return list.items;
    },
    start,
    stop,
    frame(placed) {
      if (seen !== viewer.contentVersion) {
        seen = viewer.contentVersion;
        // 形が変わったら、古い数字を残さない。1 点目だけのときも、その点はもう形の上にない
        const n = list.syncShape(host.shapeKey());
        if (first) first = null;
        if (n) host.toast(`形が変わったので、引いた寸法 ${n} 本を消しました。もう一度引いてください`);
        if (n || on) renderPanel();
      }
      frameNow(placed);
    },
  };
}
