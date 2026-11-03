// 腕の断面を手で描く小さな画面：断面の片側の点を指やマウスで動かすと、左右同じ形のなめらかな断面になり、3D の腕も変わる。
// 決まった断面（甲丸・平打ち・半甲丸・角）から始めて、点を動かして形を変える（作者の求め：2026-11-03）。
// 点を動かしている間も、幅と厚みを mm で出し、目安より細い・薄いときは赤くする。
import { cleanPoints, sectionControlPoints, sectionOutline, type SectionPoint, type ShankSection } from "../geometry/shank";
import { GUIDES } from "../rules/guides";

/** 描く所の広さ（mm）：幅 ±X、厚み −0.5〜Y。点はこの中でだけ動く（幅 7 mm・厚み 3.1 mm まで） */
const VIEW = { x: 3.5, yMin: -0.4, yMax: 3.1 };
/** 点の動く範囲（形を作るための決まり）：厚みは 0.3 mm、幅は 0.6 mm より小さくしない */
const LIMIT = { minT: 0.3, minHalfW: 0.3 };

export interface SectionShape {
  section: ShankSection;
  /** 片側の点（0〜1）。決まった断面ならその始まりの点 */
  points: SectionPoint[];
  widthMm: number;
  thicknessMm: number;
}

/** 点を 1 つ動かしたあとの形（mm の位置で受け取る）。真ん中の点は上下だけ、端の点は左右だけ動く */
export function dragPoint(shape: SectionShape, index: number, xMm: number, yMm: number): SectionShape {
  const hw = shape.widthMm / 2;
  const mmPts = shape.points.map((p) => ({ x: p.x * hw, y: p.y * shape.thicknessMm }));
  const last = mmPts.length - 1;
  const x = Math.min(VIEW.x, Math.max(0, xMm));
  const y = Math.min(VIEW.yMax, Math.max(0, yMm));
  if (index === 0) mmPts[0] = { x: 0, y: Math.max(LIMIT.minT, y) };
  else if (index === last) mmPts[last] = { x: Math.max(LIMIT.minHalfW, x), y: 0 };
  else mmPts[index] = { x, y: Math.min(y, mmPts[0].y) };
  const t = mmPts[0].y;
  const halfW = Math.max(LIMIT.minHalfW, ...mmPts.map((p) => p.x));
  const points = cleanPoints(mmPts.map((p) => ({ x: p.x / halfW, y: p.y / t })));
  return { section: "free", points, widthMm: 2 * halfW, thicknessMm: t };
}

/** 断面の外の形（mm）：内側の平らな線 ＋ 外側の線。SVG の多角形の点（y は上が正） */
export function sectionPolygonMm(shape: SectionShape): [number, number][] {
  const hw = shape.widthMm / 2;
  const outer = sectionOutline(shape.section, shape.section === "free" ? shape.points : undefined).map(([x, y]) => [x * hw, y * shape.thicknessMm] as [number, number]);
  return [[-hw, 0], [hw, 0], ...outer];
}

export function startShape(section: ShankSection, points: SectionPoint[] | undefined, widthMm: number, thicknessMm: number): SectionShape {
  return { section, points: section === "free" && points?.length ? cleanPoints(points) : sectionControlPoints(section), widthMm, thicknessMm };
}

// ---- 画面 ----

const sy = (y: number) => VIEW.yMax + VIEW.yMin - y; // SVG は下が正なので、上下を返す

export function sectionEditorHtml(): string {
  const w = VIEW.x * 2;
  const h = VIEW.yMax - VIEW.yMin;
  const grid: string[] = [];
  for (let x = -VIEW.x; x <= VIEW.x + 1e-9; x += 1) grid.push(`<line x1="${x}" y1="${VIEW.yMin}" x2="${x}" y2="${VIEW.yMax}"/>`);
  for (let y = 0; y <= VIEW.yMax + 1e-9; y += 1) grid.push(`<line x1="${-VIEW.x}" y1="${sy(y)}" x2="${VIEW.x}" y2="${sy(y)}"/>`);
  return `<div class="sec-edit">
    <svg viewBox="${-VIEW.x} ${VIEW.yMin} ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-label="腕の断面。点を動かすと形が変わる">
      <g class="se-grid">${grid.join("")}</g>
      <line class="se-finger" x1="${-VIEW.x}" y1="${sy(0)}" x2="${VIEW.x}" y2="${sy(0)}"/>
      <polygon class="se-shape"/>
      <g class="se-mirror"></g>
      <g class="se-handles"></g>
    </svg>
    <div class="se-read"><span class="se-w"></span><span class="se-t"></span><small>点を動かすと形が変わります（左右は同じ形）・指の側が下</small></div>
  </div>`;
}

/**
 * 断面の画面を動くようにする。onLive は点を動かしている間（間引いて）、onCommit は指やマウスを離したとき
 */
export function bindSectionEditor(box: HTMLElement, start: SectionShape, onLive: (s: SectionShape) => void, onCommit: (s: SectionShape) => void): void {
  const root = box.querySelector<HTMLElement>(".sec-edit");
  if (!root) return;
  const svg = root.querySelector("svg")!;
  let shape = start;
  const g = GUIDES.band;
  const draw = () => {
    const pts = sectionPolygonMm(shape);
    root.querySelector(".se-shape")!.setAttribute("points", pts.map(([x, y]) => `${x.toFixed(3)},${sy(y).toFixed(3)}`).join(" "));
    const hw = shape.widthMm / 2;
    const hs = shape.points.map((p, i) => `<g class="se-h" data-i="${i}" transform="translate(${(p.x * hw).toFixed(3)} ${sy(p.y * shape.thicknessMm).toFixed(3)})"><circle class="hit" r="0.42"/><circle class="dot" r="0.16"/></g>`);
    root.querySelector(".se-handles")!.innerHTML = hs.join("");
    root.querySelector(".se-mirror")!.innerHTML = shape.points
      .slice(1)
      .map((p) => `<circle r="0.1" cx="${(-p.x * hw).toFixed(3)}" cy="${sy(p.y * shape.thicknessMm).toFixed(3)}"/>`)
      .join("");
    const wBad = shape.widthMm < g.minWidthMm - 1e-9;
    const tBad = shape.thicknessMm < g.minThicknessMm - 1e-9;
    const wEl = root.querySelector<HTMLElement>(".se-w")!;
    const tEl = root.querySelector<HTMLElement>(".se-t")!;
    wEl.textContent = `幅 ${shape.widthMm.toFixed(2)} mm`;
    tEl.textContent = `厚み ${shape.thicknessMm.toFixed(2)} mm`;
    wEl.classList.toggle("bad", wBad);
    tEl.classList.toggle("bad", tBad);
    wEl.title = wBad ? `${g.minWidthMm} mm より細い（目安）` : "";
    tEl.title = tBad ? `${g.minThicknessMm} mm より薄い（目安）` : "";
    root.classList.toggle("bad", wBad || tBad);
  };
  draw();
  let drag: { i: number; id: number } | null = null;
  let queued = false;
  const toMm = (e: PointerEvent): [number, number] => {
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, sy(p.y)];
  };
  svg.addEventListener("pointerdown", (e) => {
    const h = (e.target as Element).closest<SVGGElement>(".se-h");
    if (!h) return;
    e.preventDefault();
    drag = { i: Number(h.dataset.i), id: e.pointerId };
    svg.setPointerCapture(e.pointerId);
    root.classList.add("dragging");
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const [x, y] = toMm(e);
    shape = dragPoint(shape, drag.i, x, y);
    draw();
    root.querySelector(`.se-h[data-i="${drag.i}"]`)?.classList.add("on");
    // 3D の作り直しは 1 こまに 1 回まで
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        onLive(shape);
      });
    }
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    root.classList.remove("dragging");
    onCommit(shape);
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
}
