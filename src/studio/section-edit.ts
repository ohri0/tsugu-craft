// 腕の断面を描く画面。断面は、なめらかな線（3 次の B スプライン）の制御点（線を引っぱる点）で決める。
// Rhino のような道具を、指でも使える大きなボタンで：動かす・点を足す・点を消す・左右対称・自由に描く・元に戻す・やり直す・リセット。
// 指の側（内側）はいつも平らな線の上。幅と厚みを mm で出し、目安より細い・薄いときは赤くする（作者の求め：2026-11-04）。
// 計算（mm の線を変える関数）は画面に依存しないので、テストで確かめる。
import {
  DEGREE,
  evalCurve,
  fitCurve,
  fitError,
  greville,
  insertKnot,
  isSymmetric,
  nearestOnCurve,
  resample,
  sampleCurve,
  symmetrize,
  type P2,
} from "../geometry/bspline";
import { curveFromHalf, curveKnots, normalizeCurve, presetCurve, type SectionCurve, type SectionPoint, type ShankSection } from "../geometry/shank";
import { GUIDES } from "../rules/guides";

/** 描く所の広さ（mm）：幅 ±X、厚み yMin〜yMax。点はこの中でだけ動く */
const VIEW = { x: 3.6, yMin: -0.6, yMax: 3.2 };
/** 形を作るための決まり：厚みは 0.3 mm、幅は 0.6 mm より小さくしない。点は 5 つより少なくしない */
const LIMIT = { minT: 0.3, minW: 0.6, minPoints: 5 };
/** 自由に描いた線に合わせるときの、点の数の範囲と、許す離れ（mm） */
const FIT = { minPoints: 6, maxPoints: 11, tolMm: 0.06 };

/** mm で持つ断面の線（右の端の内側 → 左の端の内側。最初と最後の点は y ＝ 0） */
export interface EditCurve {
  pts: P2[];
  knots: number[];
}

/** 3D の腕に渡す断面 */
export interface SectionShape {
  section: ShankSection;
  /** そろえた線（幅の端 ±1、いちばん高い所 1） */
  curve: SectionCurve;
  widthMm: number;
  thicknessMm: number;
}

// ---- 計算（画面に依存しない） ----

/** 今の断面から、mm の線を作る（決まった断面ならその線、手で描いた断面ならその線、古い片側の点ならそれを折り返す） */
export function startCurve(section: ShankSection, curve: SectionCurve | undefined, points: SectionPoint[] | undefined, widthMm: number, thicknessMm: number): EditCurve {
  const c = section !== "free" ? presetCurve(section) : curve?.points.length ? normalizeCurve(curve) : curveFromHalf(points?.length ? points : []);
  const hw = widthMm / 2;
  return { pts: c.points.map((p) => ({ x: p.x * hw, y: p.y * thicknessMm })), knots: curveKnots(c) };
}

/** mm の線の幅と厚み（細かく取った線の左右の端の差と、いちばん高い所） */
export function measure(ec: EditCurve): { widthMm: number; thicknessMm: number } {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMax = 0;
  for (const { p } of sampleCurve(ec.pts, ec.knots, 24)) {
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
    yMax = Math.max(yMax, p.y);
  }
  return { widthMm: xMax - xMin, thicknessMm: yMax };
}

/** 3D の腕に渡す形 */
export function shapeOf(ec: EditCurve): SectionShape {
  const { widthMm, thicknessMm } = measure(ec);
  return { section: "free", curve: normalizeCurve({ points: ec.pts, knots: ec.knots }), widthMm, thicknessMm };
}

const mirrorIndex = (ec: EditCurve, i: number) => ec.pts.length - 1 - i;
const clampX = (x: number) => Math.min(VIEW.x, Math.max(-VIEW.x, x));
const clampY = (y: number) => Math.min(VIEW.yMax, Math.max(0, y));
const snap01 = (v: number) => Math.round(v * 10) / 10;

/** 幅と厚みが、形を作れる大きさか */
function okSize(ec: EditCurve): boolean {
  const m = measure(ec);
  return m.thicknessMm >= LIMIT.minT - 1e-9 && m.widthMm >= LIMIT.minW - 1e-9;
}

/**
 * 点 i を (x, y) mm へ動かす。両端の点は内側の線の上（y ＝ 0）だけを動く。
 * 左右対称なら、反対側の点もいっしょに動く（真ん中の点は上下だけ）。0.1 mm にそろえるなら、位置を 0.1 mm の格子に合わせる。
 * 細すぎる・薄すぎる形になるときは動かさない
 */
export function movePoint(ec: EditCurve, i: number, x: number, y: number, o: { sym: boolean; snap: boolean }): EditCurve {
  const n = ec.pts.length;
  if (i < 0 || i >= n) return ec;
  let px = clampX(o.snap ? snap01(x) : x);
  let py = clampY(o.snap ? snap01(y) : y);
  const j = mirrorIndex(ec, i);
  if (i === 0 || i === n - 1) py = 0;
  if (o.sym && i === j) px = 0;
  const pts = ec.pts.map((p) => ({ ...p }));
  pts[i] = { x: px, y: py };
  if (o.sym && j !== i) pts[j] = { x: -px, y: py };
  const next = { pts, knots: [...ec.knots] };
  return okSize(next) ? next : ec;
}

/**
 * 線の上の (x, y) mm の所に点を足す（形は変わらない）。線から tolMm より遠ければ足さない（null）。
 * 左右対称なら、反対側の同じ所にも足す
 */
export function addPointAt(ec: EditCurve, x: number, y: number, o: { sym: boolean; tolMm: number }): EditCurve | null {
  const hit = nearestOnCurve(ec.pts, ec.knots, { x, y });
  if (hit.d > o.tolMm || hit.t <= 1e-6 || hit.t >= 1 - 1e-6) return null;
  let r = insertKnot(ec.pts, ec.knots, hit.t);
  if (o.sym && Math.abs(hit.t - 0.5) > 1e-6) r = insertKnot(r.pts, r.knots, 1 - hit.t);
  return { pts: r.pts, knots: r.knots };
}

/**
 * 点 i を消す（両端の点は消さない。点が少なくなりすぎるときも消さない → null）。
 * 点のまわりの節を 1 つ消すので、まわりの形は少し変わる。左右対称なら、反対側の点もいっしょに消す
 */
export function deletePoint(ec: EditCurve, i: number, o: { sym: boolean }): EditCurve | null {
  const n = ec.pts.length;
  if (i <= 0 || i >= n - 1) return null;
  const j = mirrorIndex(ec, i);
  const pair = o.sym && j !== i;
  if (n - (pair ? 2 : 1) < LIMIT.minPoints) return null;
  const u = ec.knots;
  const m = u.length - 1;
  // 消す節：その点の受け持ちの位置にいちばん近い、中の節（左右対称で 2 つ消すときは、真ん中の節は残す）
  const pick = (g: number, skip: Set<number>) => {
    let best = -1;
    for (let k = DEGREE + 1; k < n; k++) {
      if (skip.has(k)) continue;
      if (best < 0 || Math.abs(u[k] - g) < Math.abs(u[best] - g)) best = k;
    }
    return best;
  };
  const skip = new Set<number>();
  if (pair && m % 2 === 0) skip.add(m / 2);
  const k1 = pick(greville(u, i), skip);
  if (k1 < 0) return null;
  const dropPts = new Set([i]);
  const dropKnots = new Set([k1]);
  if (pair) {
    dropPts.add(j);
    dropKnots.add(m - k1);
  } else if (o.sym && i === j && m % 2 === 0) {
    // 真ん中の点は、真ん中の節といっしょに消す（左右対称のまま）
    dropKnots.clear();
    dropKnots.add(m / 2);
  }
  return { pts: ec.pts.filter((_, k) => !dropPts.has(k)).map((p) => ({ ...p })), knots: u.filter((_, k) => !dropKnots.has(k)) };
}

/** 左右対称にする（もう対称なら、そのまま） */
export function makeSymmetric(ec: EditCurve): EditCurve {
  if (isSymmetric(ec.pts, ec.knots)) return ec;
  const r = symmetrize(ec.pts, ec.knots);
  r.pts[0].y = 0;
  r.pts[r.pts.length - 1].y = 0;
  return okSize(r) ? r : ec;
}

/**
 * 指で描いた線（mm）を、なめらかな線にする。点の数は、線との離れが FIT.tolMm に収まるいちばん少ない数（FIT の範囲）。
 * - 右から描いても左から描いても同じ（右の端から始まる向きにそろえる）。
 * - 左右対称で、片側だけ描いたときは、真ん中で折り返して両側にする。
 * - 端が内側の線から浮いていれば、そこからまっすぐ下ろす（指の側は平ら）。
 * 短すぎる線は使わない（null）
 */
export function fitStroke(stroke: readonly P2[], o: { sym: boolean }): EditCurve | null {
  let s = stroke.filter((p, i) => i === 0 || Math.hypot(p.x - stroke[i - 1].x, p.y - stroke[i - 1].y) > 1e-4).map((p) => ({ x: clampX(p.x), y: clampY(p.y) }));
  if (s.length < 5) return null;
  const xs = s.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const span = xMax - xMin;
  if (span < LIMIT.minW / 2 && Math.max(...s.map((p) => p.y)) < LIMIT.minT) return null;
  if (o.sym) {
    // 片側だけ描いたか（反対側へ、描いた幅の 15 % より出ていない）
    const right = xMin > -0.15 * Math.max(Math.abs(xMax), 1e-6);
    const left = xMax < 0.15 * Math.max(Math.abs(xMin), 1e-6);
    if (right || left) {
      let half = s.map((p) => ({ x: Math.abs(p.x), y: p.y }));
      // 端（x の大きい方）から真ん中へ向かう順に
      if (half[0].x < half[half.length - 1].x) half = half.reverse();
      const tip = half[half.length - 1];
      half[half.length - 1] = { x: 0, y: tip.y };
      s = [...half, ...half.slice(0, -1).reverse().map((p) => ({ x: -p.x, y: p.y }))];
    }
  }
  if (s[0].x < s[s.length - 1].x) s = s.reverse();
  // 端が浮いていれば、内側の線までまっすぐ下ろす
  if (s[0].y > 0.02) s.unshift({ x: s[0].x, y: 0 });
  else s[0] = { x: s[0].x, y: 0 };
  const e = s[s.length - 1];
  if (e.y > 0.02) s.push({ x: e.x, y: 0 });
  else s[s.length - 1] = { x: e.x, y: 0 };
  const data = resample(s, 120);
  let best: EditCurve | null = null;
  for (let n = FIT.minPoints; n <= FIT.maxPoints; n++) {
    if (o.sym && n % 2 === 0) continue; // 左右対称は真ん中に点を置く（奇数）
    let r = fitCurve(data, n);
    if (o.sym) r = symmetrize(r.pts, r.knots);
    r.pts = r.pts.map((p, i) => ({ x: clampX(p.x), y: i === 0 || i === r.pts.length - 1 ? 0 : clampY(p.y) }));
    best = r;
    if (fitError(data, r.pts, r.knots) <= FIT.tolMm) break;
  }
  return best && okSize(best) ? best : null;
}

/** 断面の外の形（mm）：外側の線 ＋ 内側の平らな線で閉じた多角形（y は上が正） */
export function outlineMm(ec: EditCurve): P2[] {
  return sampleCurve(ec.pts, ec.knots, 24).map((s) => s.p);
}

/** 線の上の点（t：0〜1。画面とテスト用） */
export const pointOn = (ec: EditCurve, t: number) => evalCurve(ec.pts, ec.knots, t);

// ---- 画面 ----

type Mode = "move" | "add" | "del" | "draw";
const MODES: [Mode, string, string][] = [
  ["move", "動かす", "点をつまんで動かす。点線は線を引っぱる点のつながり"],
  ["add", "点を足す", "線の上を押すと、そこに点が増える（形は変わらない）"],
  ["del", "点を消す", "点を押すと消える（まわりの形が少し変わる）"],
  ["draw", "自由に描く", "指やマウスで断面をなぞる。離すと、なめらかな線に直る"],
];

/** 画面を描き直しても続くもの（元に戻す・やり直す、選んだ道具） */
interface Memo {
  cur: EditCurve;
  past: EditCurve[];
  future: EditCurve[];
  mode: Mode;
  sym: boolean;
  snap: boolean;
  preset: Exclude<ShankSection, "free">;
  shape: SectionShape;
}
let memo: Memo | null = null;

/** 同じ形か（幅と厚みは 0.01 mm、そろえた点は 0.005 までの差を同じと見る） */
export function sameShape(a: SectionShape, b: SectionShape): boolean {
  if (a.section !== b.section) return false;
  if (Math.abs(a.widthMm - b.widthMm) > 0.011 || Math.abs(a.thicknessMm - b.thicknessMm) > 0.011) return false;
  if (a.section !== "free") return true;
  const p = a.curve.points;
  const q = b.curve.points;
  return p.length === q.length && p.every((v, i) => Math.abs(v.x - q[i].x) < 0.005 && Math.abs(v.y - q[i].y) < 0.005);
}

const sy = (y: number) => -y; // SVG は下が正なので、上下を返す
const f3 = (v: number) => v.toFixed(3);

/** 見る広さ（mm）：幅 ±x、高さ yMin〜yMax。画面の横と縦の比はいつも同じ（ASPECT） */
interface View {
  x: number;
  yMin: number;
  yMax: number;
}
const ASPECT = 1.9;

/** 形の大きさに合わせた見る広さ（小さい形は大きく見せる。広さは画面を作り直すときだけ変える：動かしている間は変えない） */
export function viewFor(widthMm: number, thicknessMm: number): View {
  const x = Math.min(VIEW.x, Math.max(1.8, widthMm / 2 + 0.9, ((thicknessMm + 1.1) * ASPECT) / 2));
  const h = (2 * x) / ASPECT;
  const yMin = -Math.min(0.6, Math.max(0.42, h * 0.16));
  return { x, yMin, yMax: yMin + h };
}

/** 方眼（0.1 mm・0.5 mm・1 mm）と目盛りの数字、指の側の線 */
function gridSvg(v: View): string {
  const fine: string[] = [];
  const minor: string[] = [];
  const major: string[] = [];
  const labels: string[] = [];
  const lx = v.yMin * 0.62;
  for (let k = -Math.floor(v.x * 10); k <= Math.floor(v.x * 10); k++) {
    const x = k / 10;
    const line = `<line x1="${x}" y1="${sy(0)}" x2="${x}" y2="${f3(sy(v.yMax))}"/>`;
    if (k % 10 === 0) {
      major.push(line);
      if (Math.abs(x) <= v.x - 0.3) labels.push(`<text x="${x}" y="${f3(sy(lx))}" text-anchor="middle">${x === 0 ? "0" : x > 0 ? x : `−${-x}`}</text>`);
    } else if (k % 5 === 0) minor.push(line);
    else fine.push(line);
  }
  for (let k = 1; k <= Math.floor(v.yMax * 10); k++) {
    const y = k / 10;
    const line = `<line x1="${f3(-v.x)}" y1="${sy(y)}" x2="${f3(v.x)}" y2="${sy(y)}"/>`;
    if (k % 10 === 0) {
      major.push(line);
      labels.push(`<text x="${f3(-v.x + 0.08)}" y="${f3(sy(y) + 0.07)}">${y}</text>`);
    } else if (k % 5 === 0) minor.push(line);
    else fine.push(line);
  }
  labels.push(`<text x="${f3(v.x - 0.08)}" y="${f3(sy(lx))}" text-anchor="end">mm</text>`);
  return `<g class="se-grid"><g class="fine">${fine.join("")}</g><g class="minor">${minor.join("")}</g><g class="major">${major.join("")}</g></g>
      <g class="se-labels">${labels.join("")}</g>
      <text class="se-finger-label" x="0" y="${f3(sy(lx * 0.5))}" text-anchor="middle">指の側</text>`;
}

const viewBox = (v: View) => `${f3(-v.x)} ${f3(-v.yMax)} ${f3(2 * v.x)} ${f3(v.yMax - v.yMin)}`;

export function sectionEditorHtml(): string {
  const v = viewFor(2.2, 1.6);
  const modeBtns = MODES.map(([m, label]) => `<button type="button" class="se-mode" data-mode="${m}" aria-pressed="false">${label}</button>`).join("");
  return `<div class="sec-edit">
    <div class="se-tools" role="toolbar" aria-label="断面を描く道具">
      <div class="se-row se-modes">${modeBtns}</div>
      <div class="se-row se-opts">
        <button type="button" class="se-toggle se-sym" aria-pressed="true">左右対称</button>
        <button type="button" class="se-toggle se-snap" aria-pressed="false">0.1 mm にそろえる</button>
      </div>
      <div class="se-row se-acts">
        <button type="button" class="se-act se-undo">元に戻す</button>
        <button type="button" class="se-act se-redo">やり直す</button>
        <button type="button" class="se-act se-reset">リセット</button>
      </div>
    </div>
    <svg viewBox="${viewBox(v)}" preserveAspectRatio="xMidYMid meet" aria-label="腕の断面。下が指の側">
      <g class="se-back">${gridSvg(v)}</g>
      <path class="se-shape"/>
      <line class="se-finger se-finger-top" x1="${f3(-v.x)}" y1="0" x2="${f3(v.x)}" y2="0"/>
      <g class="se-dims"></g>
      <polyline class="se-poly"/>
      <g class="se-ghosts"></g>
      <g class="se-handles"></g>
      <polyline class="se-stroke"/>
    </svg>
    <div class="se-read"><span class="se-w"></span><span class="se-t"></span><span class="se-n"></span><small class="se-hint"></small></div>
  </div>`;
}

/**
 * 断面の画面を動くようにする。
 * onLive は点を動かしている間（1 こまに 1 回まで）、onCommit は形が決まったとき（指やマウスを離した・点を足した など）。
 * リセットのときは、決まった断面（section が free でない形）を onCommit に渡す
 */
export function bindSectionEditor(box: HTMLElement, start: SectionShape, onLive: (s: SectionShape) => void, onCommit: (s: SectionShape) => void): void {
  const root = box.querySelector<HTMLElement>(".sec-edit");
  if (!root) return;
  const svg = root.querySelector("svg")!;

  const startEc = startCurveOfShape(start);
  if (!memo) memo = { cur: startEc, past: [], future: [], mode: "move", sym: true, snap: false, preset: "kouman", shape: start };
  else if (!sameShape(memo.shape, start)) {
    // 画面の外で形が変わった（決まった断面を選んだ・Claude が直した など）。前の形は「元に戻す」で戻れる
    memo.past.push(memo.cur);
    memo.future = [];
    memo.cur = startEc;
    memo.shape = start;
  }
  if (start.section !== "free") memo.preset = start.section;
  const M = memo;
  let ec = M.cur;
  // 見る広さは、いまの形に合わせる（動かしている間は変えない）
  const m0 = measure(ec);
  const view = viewFor(m0.widthMm, m0.thicknessMm);
  svg.setAttribute("viewBox", viewBox(view));
  root.querySelector(".se-back")!.innerHTML = gridSvg(view);
  const fl = root.querySelector(".se-finger-top")!;
  fl.setAttribute("x1", f3(-view.x));
  fl.setAttribute("x2", f3(view.x));
  // 点の大きさ（mm）：見る広さに合わせ、画面の上でいつも同じくらいの大きさに。指で触る画面は少し大きく
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const R = { hit: f3(view.x * 0.11), dot: f3(view.x * (coarse ? 0.036 : 0.03)), ghost: f3(view.x * 0.024) };
  const g = GUIDES.band;
  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;

  const commit = (next: EditCurve, preset?: Exclude<ShankSection, "free">) => {
    M.past.push(M.cur);
    if (M.past.length > 60) M.past.shift();
    M.future = [];
    M.cur = next;
    ec = next;
    const out = preset ? { ...shapeOf(next), section: preset } : shapeOf(next);
    M.shape = roundShape(out);
    draw();
    onCommit(out);
  };
  const jump = (to: EditCurve) => {
    M.cur = to;
    ec = to;
    const out = shapeOf(to);
    M.shape = roundShape(out);
    draw();
    onCommit(out);
  };

  const draw = () => {
    const n = ec.pts.length;
    const line = outlineMm(ec);
    const d = `M${line.map((p) => `${f3(p.x)},${f3(sy(p.y))}`).join("L")}Z`;
    q(".se-shape").setAttribute("d", d);
    q(".se-poly").setAttribute("points", ec.pts.map((p) => `${f3(p.x)},${f3(sy(p.y))}`).join(" "));
    const isMain = (i: number) => !M.sym || i <= mirrorIndex(ec, i);
    q(".se-handles").innerHTML = ec.pts
      .map((p, i) => (isMain(i) ? `<g class="se-h${i === 0 || i === n - 1 ? " end" : ""}" data-i="${i}" transform="translate(${f3(p.x)} ${f3(sy(p.y))})"><circle class="hit" r="${R.hit}"/><circle class="dot" r="${R.dot}"/></g>` : ""))
      .join("");
    q(".se-ghosts").innerHTML = M.sym
      ? ec.pts.map((p, i) => (isMain(i) ? "" : `<g class="se-h ghost" data-i="${i}" transform="translate(${f3(p.x)} ${f3(sy(p.y))})"><circle class="hit" r="${R.hit}"/><circle class="dot" r="${R.ghost}"/></g>`)).join("")
      : "";
    const m = measure(ec);
    // 幅と厚みの寸法線
    let xMin = Infinity;
    let xMax = -Infinity;
    for (const p of line) {
      xMin = Math.min(xMin, p.x);
      xMax = Math.max(xMax, p.x);
    }
    const wBad = m.widthMm < g.minWidthMm - 1e-9;
    const tBad = m.thicknessMm < g.minThicknessMm - 1e-9;
    const yW = Math.min(view.yMax - 0.12, m.thicknessMm + 0.24);
    q(".se-dims").innerHTML =
      `<line x1="${f3(xMin)}" y1="${f3(sy(yW))}" x2="${f3(xMax)}" y2="${f3(sy(yW))}"/><line x1="${f3(xMin)}" y1="${f3(sy(yW - 0.08))}" x2="${f3(xMin)}" y2="${f3(sy(yW + 0.08))}"/><line x1="${f3(xMax)}" y1="${f3(sy(yW - 0.08))}" x2="${f3(xMax)}" y2="${f3(sy(yW + 0.08))}"/>` +
      `<text class="${wBad ? "bad" : ""}" x="${f3((xMin + xMax) / 2)}" y="${f3(sy(yW) - 0.07)}" text-anchor="middle">${m.widthMm.toFixed(2)}</text>` +
      `<line x1="${f3(xMax + 0.25)}" y1="${f3(sy(0))}" x2="${f3(xMax + 0.25)}" y2="${f3(sy(m.thicknessMm))}"/><line x1="${f3(xMax + 0.17)}" y1="${f3(sy(m.thicknessMm))}" x2="${f3(xMax + 0.33)}" y2="${f3(sy(m.thicknessMm))}"/>` +
      `<text class="${tBad ? "bad" : ""}" x="${f3(xMax + 0.33)}" y="${f3(sy(m.thicknessMm / 2) + 0.07)}">${m.thicknessMm.toFixed(2)}</text>`;
    const wEl = q<HTMLElement>(".se-w");
    const tEl = q<HTMLElement>(".se-t");
    wEl.textContent = `幅 ${m.widthMm.toFixed(2)} mm`;
    tEl.textContent = `厚み ${m.thicknessMm.toFixed(2)} mm`;
    q<HTMLElement>(".se-n").textContent = `点 ${n}`;
    wEl.classList.toggle("bad", wBad);
    tEl.classList.toggle("bad", tBad);
    wEl.title = wBad ? `${g.minWidthMm} mm より細い（目安・最後は職人が決める）` : "";
    tEl.title = tBad ? `${g.minThicknessMm} mm より薄い（目安・最後は職人が決める）` : "";
    root.classList.toggle("bad", wBad || tBad);
    root.dataset.mode = M.mode;
    root.classList.toggle("snap", M.snap);
    root.querySelectorAll<HTMLButtonElement>(".se-mode").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === M.mode)));
    q(".se-sym").setAttribute("aria-pressed", String(M.sym));
    q(".se-snap").setAttribute("aria-pressed", String(M.snap));
    q<HTMLButtonElement>(".se-undo").disabled = !M.past.length;
    q<HTMLButtonElement>(".se-redo").disabled = !M.future.length;
    const hint = MODES.find(([k]) => k === M.mode)![2];
    q<HTMLElement>(".se-hint").textContent = `${hint}。${wBad || tBad ? `赤い数字は目安（幅 ${g.minWidthMm} mm・厚み ${g.minThicknessMm} mm）より小さい。最後は職人が決める` : "下の線が指の側（いつも平ら）"}`;
  };
  draw();

  // ---- ボタン ----
  root.querySelectorAll<HTMLButtonElement>(".se-mode").forEach((b) =>
    b.addEventListener("click", () => {
      M.mode = b.dataset.mode as Mode;
      draw();
    }),
  );
  q(".se-sym").addEventListener("click", () => {
    M.sym = !M.sym;
    if (M.sym) {
      const s = makeSymmetric(ec);
      if (s !== ec) return commit(s);
    }
    draw();
  });
  q(".se-snap").addEventListener("click", () => {
    M.snap = !M.snap;
    draw();
  });
  q(".se-undo").addEventListener("click", () => {
    const prev = M.past.pop();
    if (!prev) return;
    M.future.push(M.cur);
    jump(prev);
  });
  q(".se-redo").addEventListener("click", () => {
    const next = M.future.pop();
    if (!next) return;
    M.past.push(M.cur);
    jump(next);
  });
  q(".se-reset").addEventListener("click", () => {
    const m = measure(ec);
    commit(startCurve(M.preset, undefined, undefined, m.widthMm, m.thicknessMm), M.preset);
  });

  // ---- 指・マウス ----
  const toMm = (e: PointerEvent): P2 => {
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: sy(p.y) };
  };
  /** 画面の px を mm に（指の太さで押せる広さ） */
  const pxToMm = (px: number) => px / Math.max(1e-6, svg.getScreenCTM()?.a ?? 40);
  const handleAt = (e: PointerEvent): number => {
    const h = (e.target as Element).closest<SVGGElement>(".se-h");
    if (h) return Number(h.dataset.i);
    const p = toMm(e);
    const tol = pxToMm(e.pointerType === "touch" ? 26 : 14);
    let best = -1;
    let bd = tol;
    ec.pts.forEach((c, i) => {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  let drag: { i: number; id: number; before: EditCurve } | null = null;
  let stroke: { id: number; pts: P2[] } | null = null;
  let queued = false;
  const live = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      onLive(shapeOf(ec));
    });
  };
  svg.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    const p = toMm(e);
    if (M.mode === "move") {
      const i = handleAt(e);
      if (i < 0) return;
      e.preventDefault();
      drag = { i, id: e.pointerId, before: ec };
      svg.setPointerCapture(e.pointerId);
      root.classList.add("dragging");
    } else if (M.mode === "add") {
      e.preventDefault();
      const next = addPointAt(ec, p.x, p.y, { sym: M.sym, tolMm: pxToMm(e.pointerType === "touch" ? 28 : 16) });
      if (next) commit(next);
    } else if (M.mode === "del") {
      e.preventDefault();
      const i = handleAt(e);
      if (i < 0) return;
      const next = deletePoint(ec, i, { sym: M.sym });
      if (next) commit(next);
      else q<HTMLElement>(".se-hint").textContent = `両端の点と、${LIMIT.minPoints} つより少なくなる点は消せません`;
    } else {
      e.preventDefault();
      stroke = { id: e.pointerId, pts: [p] };
      svg.setPointerCapture(e.pointerId);
      q(".se-stroke").setAttribute("points", "");
    }
  });
  svg.addEventListener("pointermove", (e) => {
    if (drag && e.pointerId === drag.id) {
      const p = toMm(e);
      ec = movePoint(ec, drag.i, p.x, p.y, { sym: M.sym, snap: M.snap });
      M.cur = ec;
      draw();
      root.querySelector(`.se-h[data-i="${drag.i}"]`)?.classList.add("on");
      live();
    } else if (stroke && e.pointerId === stroke.id) {
      stroke.pts.push(toMm(e));
      q(".se-stroke").setAttribute("points", stroke.pts.map((p) => `${f3(p.x)},${f3(sy(p.y))}`).join(" "));
    }
  });
  const end = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) {
      const { before } = drag;
      drag = null;
      root.classList.remove("dragging");
      if (ec === before) return draw();
      const moved = ec;
      M.cur = before;
      commit(moved);
    } else if (stroke && e.pointerId === stroke.id) {
      const pts = stroke.pts;
      stroke = null;
      q(".se-stroke").setAttribute("points", "");
      const next = fitStroke(pts, { sym: M.sym });
      if (next) commit(next);
      else q<HTMLElement>(".se-hint").textContent = "線が短すぎました。断面の外側を、端から端までなぞってください";
    }
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
}

/** 3D に渡す形の幅・厚みは 0.01 mm に丸めて渡す（画面の鍵もそれで作る） */
function roundShape(s: SectionShape): SectionShape {
  return { ...s, widthMm: Math.round(s.widthMm * 100) / 100, thicknessMm: Math.round(s.thicknessMm * 100) / 100 };
}

function startCurveOfShape(s: SectionShape): EditCurve {
  return startCurve(s.section, s.curve, undefined, s.widthMm, s.thicknessMm);
}

/** 今の腕の状態から、画面の始まりの形を作る */
export function startShape(section: ShankSection, curve: SectionCurve | undefined, points: SectionPoint[] | undefined, widthMm: number, thicknessMm: number): SectionShape {
  const ec = startCurve(section, curve, points, widthMm, thicknessMm);
  const c = { points: ec.pts.map((p) => ({ x: p.x / (widthMm / 2), y: p.y / thicknessMm })), knots: ec.knots };
  return roundShape({ section, curve: c, widthMm, thicknessMm });
}

/** テスト用：画面の覚えを消す */
export function resetSectionEditorMemo(): void {
  memo = null;
}
