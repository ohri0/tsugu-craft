// 図面：上から見た輪郭の点を指で動かす・線を彫る。指輪は断面の形を動かす。単位は mm。
import { outlineOf, measureOutline, type Design } from "./model";
import type { Pt, Section } from "./solid";

const SVGNS = "http://www.w3.org/2000/svg";
const f1 = (v: number) => v.toFixed(1);

export type EditMode = "shape" | "engrave";

/** 板ものの図面。onChange(live) は動かしている間、onChange(false) は離したとき */
export function mountOutlineEditor(host: HTMLElement, get: () => Design, onChange: (live: boolean) => void, mode: () => EditMode) {
  host.innerHTML = `<svg class="plan" xmlns="${SVGNS}"></svg><p class="plan-hint"></p>`;
  const svg = host.querySelector("svg")!;
  let view = { x: -20, y: -20, w: 40, h: 40 };

  function frame() {
    const d = get();
    const m = measureOutline(outlineOf(d));
    const s = Math.max(m.long * 1.35, 12);
    view = { x: -s / 2, y: -s / 2, w: s, h: s };
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  }

  function toMm(e: PointerEvent): Pt {
    const r = svg.getBoundingClientRect();
    // y は上が正（図面の向き）。SVG は下が正なので返す
    return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: -(view.y + ((e.clientY - r.top) / r.height) * view.h) };
  }

  function draw() {
    const d = get();
    const out = outlineOf(d);
    const m = measureOutline(out);
    const u = view.w / 100; // 線の太さなどの単位
    const grid: string[] = [];
    const g0 = Math.floor(view.x);
    for (let v = g0; v <= view.x + view.w; v++) {
      const major = v % 5 === 0;
      grid.push(`<line x1="${v}" y1="${view.y}" x2="${v}" y2="${view.y + view.h}" class="${major ? "g5" : "g1"}"/>`);
      grid.push(`<line x1="${view.x}" y1="${v}" x2="${view.x + view.w}" y2="${v}" class="${major ? "g5" : "g1"}"/>`);
    }
    const path = `M${out.map((p) => `${p.x.toFixed(3)} ${(-p.y).toFixed(3)}`).join("L")}Z`;
    const eng = d.engraves.map((l) => `<polyline class="eng" points="${l.map((p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(" ")}" stroke-width="${Math.max(d.engraveWidth, u * 0.6)}"/>`).join("");
    const pts = mode() === "shape" ? d.ctrl.map((p, i) => `<circle class="cp" data-i="${i}" cx="${p.x}" cy="${-p.y}" r="${u * 2.2}"/>`).join("") : "";
    // 寸法：幅と高さ
    const bx = Math.min(...out.map((p) => p.x));
    const by = Math.max(...out.map((p) => p.y));
    const dims = `<text class="dim" x="${bx}" y="${-by - u * 3}" font-size="${u * 3.6}">${f1(m.width)} × ${f1(m.height)} mm</text>`;
    svg.innerHTML = `<g class="grid" stroke-width="${u * 0.12}">${grid.join("")}</g><path class="body" d="${path}" stroke-width="${u * 0.5}"/><g>${eng}</g>${dims}<g>${pts}</g>`;
    host.querySelector(".plan-hint")!.textContent =
      mode() === "shape" ? "点を動かすと形が変わります。線の上を押すと点が増え、点を 2 回押すと消えます。マス目は 1 mm。" : "板の上をなぞると、毛彫りの線が入ります（V 字の溝）。";
  }

  let drag: number | null = null;
  let stroke: Pt[] | null = null;
  let lastTap = { i: -1, t: 0 };

  svg.addEventListener("pointerdown", (e) => {
    const d = get();
    const p = toMm(e);
    svg.setPointerCapture(e.pointerId);
    if (mode() === "engrave") {
      stroke = [p];
      d.engraves.push(stroke);
      return;
    }
    const target = e.target as SVGElement;
    if (target.classList.contains("cp")) {
      const i = Number(target.dataset.i);
      const now = performance.now();
      if (lastTap.i === i && now - lastTap.t < 350 && d.ctrl.length > 4) {
        d.ctrl.splice(i, 1);
        lastTap = { i: -1, t: 0 };
        draw();
        onChange(false);
        return;
      }
      lastTap = { i, t: now };
      drag = i;
      return;
    }
    if (target.classList.contains("body")) {
      // いちばん近い辺に点を足す
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < d.ctrl.length; i++) {
        const a = d.ctrl[i];
        const b = d.ctrl[(i + 1) % d.ctrl.length];
        const dd = Math.hypot((a.x + b.x) / 2 - p.x, (a.y + b.y) / 2 - p.y);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      d.ctrl.splice(best + 1, 0, { x: p.x, y: p.y });
      drag = best + 1;
      draw();
      onChange(true);
    }
  });
  svg.addEventListener("pointermove", (e) => {
    const d = get();
    const p = toMm(e);
    if (drag !== null) {
      d.ctrl[drag] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
      draw();
      onChange(true);
    } else if (stroke) {
      const last = stroke[stroke.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 0.25) {
        stroke.push(p);
        draw();
      }
    }
  });
  const end = () => {
    if (drag !== null) onChange(false);
    if (stroke) {
      const d = get();
      if (stroke.length < 2) d.engraves.pop();
      onChange(false);
    }
    drag = null;
    stroke = null;
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);

  return {
    refresh() {
      frame();
      draw();
    },
    redraw: draw,
  };
}

/** 指輪の断面の図面：外側のふくらみの点を上下に動かす。幅 × 厚みは mm */
export function mountSectionEditor(host: HTMLElement, get: () => Section, onChange: (live: boolean) => void, label: () => string) {
  host.innerHTML = `<svg class="plan section" xmlns="${SVGNS}"></svg>`;
  const svg = host.querySelector("svg")!;
  const pad = 1.2;
  function geom() {
    const s = get();
    return { s, W: s.width + pad * 2, H: s.thickness * 1.25 + pad * 2 };
  }
  function draw() {
    const { s, W, H } = geom();
    svg.setAttribute("viewBox", `${-W / 2} ${-H + pad} ${W} ${H}`);
    const u = W / 100;
    const n = s.crown.length;
    const xs = s.crown.map((_, i) => -s.width / 2 + (s.width * i) / (n - 1));
    const top = s.crown.map((c, i) => `${xs[i].toFixed(3)} ${(-c * s.thickness).toFixed(3)}`);
    const path = `M${-s.width / 2} 0 L${top.join(" L")} L${s.width / 2} 0 Z`;
    const pts = s.crown.map((c, i) => `<circle class="cp" data-i="${i}" cx="${xs[i]}" cy="${-c * s.thickness}" r="${u * 2.6}"/>`).join("");
    svg.innerHTML = `<line x1="${-W / 2}" y1="0" x2="${W / 2}" y2="0" class="g5" stroke-width="${u * 0.25}"/>
      <path class="body" d="${path}" stroke-width="${u * 0.6}"/>${pts}
      <text class="dim" x="${-W / 2 + u * 2}" y="${-H + pad + u * 6}" font-size="${u * 5}">${label()}　${f1(s.width)} × ${f1(s.thickness)} mm</text>
      <text class="dim faint" x="${-W / 2 + u * 2}" y="${pad - u * 2}" font-size="${u * 4}">指に当たる面</text>`;
  }
  let drag: number | null = null;
  svg.addEventListener("pointerdown", (e) => {
    const t = e.target as SVGElement;
    if (!t.classList.contains("cp")) return;
    drag = Number(t.dataset.i);
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    const { s, W, H } = geom();
    const r = svg.getBoundingClientRect();
    const y = -H + pad + ((e.clientY - r.top) / r.height) * H;
    s.crown[drag] = Math.max(0.1, Math.min(1.2, -y / s.thickness));
    void W;
    draw();
    onChange(true);
  });
  const end = () => {
    if (drag !== null) onChange(false);
    drag = null;
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  return { refresh: draw };
}
