// 模様の試し（#waza/rebuild/moyou）：木目金を「隠しておいた本当の手順」と「Claude が組み立てた手順」で作ったら、どんな模様になるか。
// 計算は src/rebuild/mokume-pattern.ts（画面に依存しない）。値は src/rebuild/mokume-values.ts の 1 か所。
// 段が 1 つずつ現れ（① 板を重ねる → ⑤ 色を出す）、最後に 2 つの模様と本物の鐔の写真が並ぶ。
// 撮影：?rec で上の帯とボタンを隠す。→・スペースで 1 段ずつ、← で戻る、R ではじめから、P で順に見る。#waza/rebuild/moyou?auto で自動で始まる。
import "./moyou.css";
import {
  AIR,
  GAP,
  buildModel,
  layerColors,
  recipeFrom,
  section,
  sectionRow,
  statusesFromGrade,
  surface,
  hexRgb,
  type AnswerId,
  type Mark,
  type Model,
  type Recipe,
  type Stage,
  type Statuses,
} from "../rebuild/mokume-pattern";
import { MOKUME_METALS, MOKUME_VALUES } from "../rebuild/mokume-values";
import { CLAUDE_RECIPE, CLAUDE_STATUSES, MOKUME_TRIAL, TRUE_RECIPE, reached } from "../rebuild/mokume-trial";
import { PUBLISHED_RUNS } from "../rebuild/published";
import { filming } from "./confirm";
import { esc } from "./store";

/** 本当の工程の短い名前（research/mokume/answer.md の見出しから） */
const STEP_NAME: Record<AnswerId, string> = {
  A1: "地金を用意し、切りそろえる",
  A2: "面をみがく",
  A3: "色ちがいを交互に重ねる",
  A4: "締めつけて固定する",
  A5: "熱して、ろうなしでつなぐ",
  A6: "すぐ叩いて、つながりを仕上げる",
  A7: "叩いて薄くのばす",
  A8: "表を彫る",
  A9: "叩いて平らに（くり返す）",
  A10: "品物の形にする",
  A11: "煮色（にいろ）で色を出す",
};

interface StageDef {
  n: string;
  title: string;
  ids: AnswerId[];
  /** 本当の手順の絵の説明 */
  trueNote: string;
  /** Claude の手順の絵の説明（作り方による） */
  claudeNote: (r: Recipe) => string;
}

const STAGES: StageDef[] = [
  {
    n: "①",
    title: "板を重ねる",
    ids: ["A1", "A2", "A3"],
    trueNote: "赤銅と銅の板を、切りそろえて交互に。",
    claudeNote: (r) => (r.sameSize ? "同じ。" : "切りそろえていないので、はしがずれる。"),
  },
  {
    n: "②",
    title: "一体にする",
    ids: ["A4", "A5", "A6", "A7"],
    trueNote: "鉄の板で締めつけて熱し、すぐ叩く。",
    claudeNote: (r) => (r.unbonded > 0 ? `締めつけ・すぐ叩くが無い。つながらない所（黄）が残る。` : "同じ。"),
  },
  {
    n: "③",
    title: "彫る",
    ids: ["A8"],
    trueNote: "のばした板の表を、鏨（たがね）で彫る。",
    claudeNote: (r) => (r.punch ? "表を彫り、裏から打ち出す（盛り上げる）。" : "同じ。"),
  },
  {
    n: "④",
    title: "平らにする・削る",
    ids: ["A9"],
    trueNote: `叩いて平らに。彫る・平らにするを ${MOKUME_VALUES.cycles.value} 回（仮）。`,
    claudeNote: (r) =>
      `${r.cycles < MOKUME_VALUES.cycles.value ? "くり返さず 1 回だけ。" : ""}${r.unbonded > 0 ? "叩くと、はがれが開く。" : ""}` || "同じ。",
  },
  {
    n: "⑤",
    title: "色を出す",
    ids: ["A10", "A11"],
    trueNote: "煮色で、赤銅が黒、銅が赤茶に。上から見た面。",
    claudeNote: (r) => (r.unbonded > 0 ? "模様は出るが、はがれた所（黄の縁）がある。" : "同じ。"),
  },
];

const MARK: Record<Mark, { label: string; cls: string; sym: string }> = {
  ok: { label: "一致", cls: "ok", sym: "○" },
  part: { label: "一部", cls: "part", sym: "△" },
  miss: { label: "たどり着けず", cls: "miss", sym: "×" },
};

/** 比べる Claude の回。11-04 は動画と入口のページの回。公開の記録があれば、それも選べる */
interface ClaudeRun {
  id: string;
  label: string;
  statuses: Statuses;
  recipe: Recipe;
}
function claudeRuns(): ClaudeRun[] {
  const out: ClaudeRun[] = [
    { id: "1104", label: `${MOKUME_TRIAL.date}（11 のうち ${reached(CLAUDE_STATUSES)}）`, statuses: CLAUDE_STATUSES, recipe: CLAUDE_RECIPE },
  ];
  const pub = PUBLISHED_RUNS.find((r) => r.technique === "mokume" && r.grade);
  if (pub?.grade) {
    const st = statusesFromGrade(pub.grade);
    out.push({ id: "pub", label: `${pub.date}（公開の記録・11 のうち ${reached(st)}）`, statuses: st, recipe: recipeFrom(st, pub.hypothesis.steps.map((s) => s.title)) });
  }
  return out;
}

// ---- 描く ----

const BG = "#0c0b0b";
const GAP_COLOR = "#e2a43c";
const IRON = "#4b4f55";

function dpr(): number {
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

/** canvas の画素を、見えている大きさ × 画面の細かさに合わせる */
function fit(c: HTMLCanvasElement): { w: number; h: number; ctx: CanvasRenderingContext2D } {
  const r = c.getBoundingClientRect();
  const k = dpr();
  const w = Math.max(40, Math.round(r.width * k));
  const h = Math.max(20, Math.round(r.height * k));
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return { w, h, ctx: c.getContext("2d")! };
}

/** 決まった細かいざらつき（金属の地の手ざわり。同じ場所なら同じ値） */
function grain(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h & 1023) / 1023 - 0.5) * 2;
}

function drawSection(c: HTMLCanvasElement, m: Model, stage: Stage, row: number) {
  const { w, h, ctx } = fit(c);
  const sec = section(m, stage, w, h, row);
  const cols = layerColors(m, false).map(hexRgb);
  const gap = hexRgb(GAP_COLOR);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = sec.cells[y * w + x];
      const o = 4 * (y * w + x);
      if (v === AIR) continue;
      let r: number, g: number, b: number;
      if (v === GAP) [r, g, b] = gap;
      else {
        [r, g, b] = cols[v];
        // 上からの光で、わずかに明るさを変える＋ざらつき
        const s = 1.06 - 0.12 * (y / h) + 0.035 * grain(x, y);
        r *= s;
        g *= s;
        b *= s;
      }
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.clearRect(0, 0, w, h);
  if (stage === 2) {
    // 熱する：下からの火のあかり
    const glow = ctx.createRadialGradient(w / 2, h * 1.1, 0, w / 2, h * 1.1, w * 0.6);
    glow.addColorStop(0, "rgba(255,120,40,0.30)");
    glow.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  tmp.getContext("2d")!.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0);
  if (stage === 2 && m.recipe.clamp > 0) {
    // 締めつける：上下を鉄の板ではさみ、針金で縛る
    const t = Math.max(3, Math.round(h * 0.07));
    const l = sec.left - Math.round(w * 0.035);
    const r = sec.right + Math.round(w * 0.035);
    ctx.fillStyle = IRON;
    ctx.fillRect(l, sec.top - t - 1, r - l, t);
    ctx.fillRect(l, sec.bottom + 1, r - l, t);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(l, sec.top - t - 1, r - l, Math.max(1, t / 4));
    // 針金：板のはしの外で、上下の鉄の板をつなぐ
    ctx.strokeStyle = "#9aa0a6";
    ctx.lineWidth = Math.max(1.5, dpr() * 1.2);
    for (const x of [l + (sec.left - l) * 0.45, r - (r - sec.right) * 0.45]) {
      ctx.beginPath();
      ctx.moveTo(x, sec.top - t - 2);
      ctx.lineTo(x, sec.bottom + t + 2);
      ctx.stroke();
    }
  }
}

/** 鐔の形（中の穴と左右の穴）。形にしない作り方なら四角の板 */
function tsubaPath(ctx: CanvasRenderingContext2D, s: number, form: boolean) {
  const p = new Path2D();
  if (!form) {
    const m = s * 0.08;
    p.rect(m, m, s - 2 * m, s - 2 * m);
    return p;
  }
  const c = s / 2;
  p.ellipse(c, c, s * 0.46, s * 0.47, 0, 0, Math.PI * 2);
  // 中の穴（刀の茎を通す。上が細いくさびの形）
  p.moveTo(c - s * 0.032, c - s * 0.17);
  p.lineTo(c + s * 0.032, c - s * 0.17);
  p.lineTo(c + s * 0.052, c + s * 0.15);
  p.lineTo(c - s * 0.052, c + s * 0.15);
  p.closePath();
  // 左右の穴
  for (const dx of [-1, 1]) {
    p.moveTo(c + dx * s * 0.235 + s * 0.06, c);
    p.ellipse(c + dx * s * 0.235, c, s * 0.06, s * 0.16, 0, 0, Math.PI * 2);
  }
  void ctx;
  return p;
}

/** 上から見た面。tsuba なら鐔の形に切り抜き、光と縁をつける */
function drawTop(c: HTMLCanvasElement, m: Model, opts: { tsuba: boolean; view?: { x0: number; y0: number; size: number } }) {
  const { w, h, ctx } = fit(c);
  // 輪のふちのぎざぎざを消すため、1.5 倍の細かさで計算して、なめらかに縮める
  const SS = 1.5;
  const W = Math.round(w * SS);
  const Hh = Math.round(h * SS);
  const n = Math.max(W, Hh);
  const view = opts.view ?? { x0: 0, y0: 0, size: 1 };
  const surf = surface(m, n, view);
  const cols = layerColors(m, true).map(hexRgb);
  const img = new ImageData(W, Hh);
  const ox = Math.floor((n - W) / 2);
  const oy = Math.floor((n - Hh) / 2);
  const def = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n && surf.defect[j * n + i] === 1;
  const gap = hexRgb(GAP_COLOR);
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const i = x + ox;
      const j = y + oy;
      const o = 4 * (y * W + x);
      let r: number, g: number, b: number;
      if (def(i, j)) {
        // はがれ：口の中は暗く、ふちを黄で
        const edge = !def(i - 1, j) || !def(i + 1, j) || !def(i, j - 1) || !def(i, j + 1);
        [r, g, b] = edge ? gap : [18, 13, 11];
      } else {
        [r, g, b] = cols[surf.layer[j * n + i]];
        const s = 1 + 0.045 * grain(i, j);
        r *= s;
        g *= s;
        b *= s;
      }
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  const big = document.createElement("canvas");
  big.width = W;
  big.height = Hh;
  big.getContext("2d")!.putImageData(img, 0, 0);
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d")!;
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(big, 0, 0, w, h);
  ctx.clearRect(0, 0, w, h);
  if (!opts.tsuba) {
    ctx.drawImage(tmp, 0, 0);
    shade(ctx, w, h);
    return;
  }
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  const path = tsubaPath(ctx, w, m.recipe.form);
  ctx.save();
  ctx.clip(path, "evenodd");
  ctx.drawImage(tmp, 0, 0);
  shade(ctx, w, h);
  ctx.restore();
  // 縁：外は細く暗く、左上に光
  ctx.save();
  ctx.lineWidth = Math.max(1.5, w * 0.006);
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.stroke(path);
  const rim = ctx.createLinearGradient(0, 0, w, h);
  rim.addColorStop(0, "rgba(255,226,196,0.35)");
  rim.addColorStop(0.5, "rgba(255,226,196,0.04)");
  rim.addColorStop(1, "rgba(0,0,0,0)");
  ctx.lineWidth = Math.max(1, w * 0.003);
  ctx.strokeStyle = rim;
  ctx.stroke(path);
  ctx.restore();
}

/** 金属の面の光：左上からやわらかく */
function shade(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "rgba(255,236,214,0.10)");
  g.addColorStop(0.45, "rgba(255,236,214,0.0)");
  g.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ---- 画面 ----

const LAST = STAGES.length + 1;

export function mountMoyou(root: HTMLElement, opts: { onBack?: () => void; auto?: boolean } = {}): void {
  const rec = filming();
  const runs = claudeRuns();
  let run = runs[0];
  let step = rec || opts.auto ? 0 : LAST;
  let timer = 0;
  const row = sectionRow();
  let models = { t: buildModel(TRUE_RECIPE), c: buildModel(run.recipe) };

  const html = document.documentElement;
  html.classList.add("mo-page");
  html.classList.toggle("mo-rec", rec);

  function marks(st: Statuses, ids: AnswerId[]) {
    return ids
      .map((id) => {
        const m = MARK[st[id]];
        return `<li class="${m.cls}"><i aria-hidden="true">${m.sym}</i><span>${esc(STEP_NAME[id])}${st[id] === "ok" ? "" : ` <em>${m.label}</em>`}</span></li>`;
      })
      .join("");
  }

  function diffs(r: Recipe): string[] {
    const out: string[] = [];
    if (r.unbonded > 0) out.push(`黄の縁は、層がはがれた所。締めつけ（A4）とすぐ叩く（A6）が無く、層がつながりきらないため（目安。量は仮）。`);
    if (r.cycles < MOKUME_VALUES.cycles.value) out.push(`彫る・平らにするをくり返さない（A9 が一部）ので、細かい目が無く、粗い。本当の手順は ${MOKUME_VALUES.cycles.value} 回（仮）。`);
    if (!r.sameSize) out.push(`板を切りそろえないと、はしがそろわない（形にするとき切り落とす）。`);
    // 番号（A4 など）は画面に出さない決まり（2026-11-06）。撮影（?rec）は前の字のまま
    return rec ? out : out.map((d) => d.replace(/（A\d+）/g, "").replace(/（A\d+ が一部）/g, "（一部しか当たっていない）"));
  }

  function render() {
    const r = run.recipe;
    root.innerHTML = `
    <section class="view moyou" data-step="${step}">
      ${opts.onBack && !rec ? `<button type="button" class="back">← 答え合わせの結果</button>` : ""}
      <header class="mo-head">
        <p class="mo-eyebrow">模様の試し ・ 木目金（もくめがね）</p>
        <h2>この手順で作ったら、どんな模様になるか</h2>
        <p class="mo-lead">隠しておいた<b>本当の手順</b>と、手がかり 9 だけから <b>Claude が組み立てた手順</b>。同じ計算で、出来上がりを描きました（<b>計算で描いた目安の絵</b>です）。</p>
        ${
          runs.length > 1 && !rec
            ? `<div class="mo-runs" role="radiogroup" aria-label="比べる Claude の回">${runs
                .map((x) => `<button type="button" role="radio" aria-checked="${x.id === run.id}" data-run="${x.id}">${esc(x.label)}</button>`)
                .join("")}</div>`
            : ""
        }
      </header>

      <div class="mo-grid">
        <div class="mo-rl rl-t"><b>本当の手順</b><small>隠しておいた答え</small></div>
        <div class="mo-rl rl-c"><b>Claude の手順</b><small>${esc(run.label)}</small></div>
        <div class="mo-rl rl-m"><small>本当の工程と<br>比べると</small></div>
        ${STAGES.map(
          (s, i) => `
        <div class="mo-sh s${i + 1}"><span class="mo-n">${s.n}</span><b>${esc(s.title)}</b></div>
        <figure class="mo-cell ct s${i + 1}"><canvas data-who="t" data-stage="${i + 1}" aria-label="本当の手順：${esc(s.title)}"></canvas><figcaption><span class="who">本当</span>${esc(s.trueNote)}</figcaption></figure>
        <figure class="mo-cell cc s${i + 1}${s.claudeNote(r) !== "同じ。" ? " differs" : ""}"><canvas data-who="c" data-stage="${i + 1}" aria-label="Claude の手順：${esc(s.title)}"></canvas><figcaption><span class="who">Claude</span>${esc(s.claudeNote(r))}</figcaption></figure>
        <ul class="mo-marks s${i + 1}">${marks(run.statuses, s.ids)}</ul>`,
        ).join("")}
      </div>

      <div class="mo-final">
        <figure class="mo-big bt"><canvas data-big="t" aria-label="本当の手順で作った模様"></canvas>
          <figcaption><b>本当の手順で作ったら</b><span><small class="mo-sim">※ 計算で描いたシミュレーション</small>層はすべてつながり、目が細かい。</span></figcaption></figure>
        <figure class="mo-big bc"><canvas data-big="c" aria-label="Claude の手順で作った模様"></canvas>
          <figcaption><b>Claude の手順で作ったら</b><span><small class="mo-sim">※ 計算で描いたシミュレーション</small>${r.unbonded > 0 ? "黄の縁＝層がはがれた所。" : ""}${r.cycles < MOKUME_VALUES.cycles.value ? "目が粗い。" : ""}${r.unbonded <= 0 && r.cycles >= MOKUME_VALUES.cycles.value ? "本当の手順とほぼ同じ模様。" : ""}</span></figcaption></figure>
        <figure class="mo-big br"><div class="mo-photo"><img src="heritage/mokume-tsuba-1-black.jpg" width="1352" height="1400" alt="本物の木目金の鐔。黒と赤茶の層が、木の年輪のような目を作っている" loading="lazy"></div>
          <figcaption><b>本物</b><span>木目金の鐔（つば）。19 世紀前半。メトロポリタン美術館・CC0</span></figcaption></figure>
      </div>
      ${diffs(r).length ? `<ul class="mo-why">${diffs(r).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}

      <p class="mo-honest">計算で描いた目安の絵です。金属の本当の流れや熱は計算していません。層が「彫った深さの所から表に出る」という形の考え方だけで描き、数の多くは仮です（下の表）。</p>

      <div class="mo-ctrl">
        <button type="button" class="ghost mo-prev" aria-label="前の段">‹</button>
        <span class="mo-count" aria-live="polite"></span>
        <button type="button" class="primary mo-next">次へ</button>
        <button type="button" class="ghost mo-play">順に見る</button>
      </div>

      <details class="mo-values">
        <summary>計算に使った値と、出どころ</summary>
        <table><tbody>
          <tr><th>重ねる金属</th><td>${esc(MOKUME_METALS.shakudo.name)}（${esc(MOKUME_METALS.shakudo.plain)}）と${esc(MOKUME_METALS.copper.name)}。一番上は赤銅</td><td>メトロポリタン美術館の鐔（34992）の材料「金属の積層板、鉄、赤銅、銅」</td></tr>
          ${Object.values(MOKUME_VALUES)
            .map(
              (v) =>
                `<tr><th>${esc(v.label)}</th><td>${esc(fmt(v.value))}${"unit" in v && v.unit ? ` ${esc(v.unit)}` : ""}${"kari" in v && v.kari ? ` <span class="kari">仮</span>` : ""}</td><td>${linkify(v.source)}</td></tr>`,
            )
            .join("")}
          <tr><th>色</th><td>煮色の前と後の色</td><td>赤銅は紫がかった黒、銅は赤茶（A11。https://kotobank.jp/word/赤銅）。色の数字は写真に近づけた絵の色 <span class="kari">仮</span></td></tr>
        </tbody></table>
        <p class="small">本当の工程の番号（A1〜A11）は、research/mokume/answer.md。Claude の回の答え合わせは research/mokume/trial-2026-11-04.json。</p>
      </details>
    </section>`;

    root.querySelector(".back")?.addEventListener("click", () => opts.onBack?.());
    root.querySelectorAll<HTMLButtonElement>(".mo-runs [data-run]").forEach((b) =>
      b.addEventListener("click", () => {
        run = runs.find((x) => x.id === b.dataset.run) ?? runs[0];
        models = { t: models.t, c: buildModel(run.recipe) };
        render();
      }),
    );
    root.querySelector(".mo-next")!.addEventListener("click", () => go(step + 1));
    root.querySelector(".mo-prev")!.addEventListener("click", () => go(step - 1));
    root.querySelector(".mo-play")!.addEventListener("click", () => play());
    show();
    paint();
  }

  /** 見えている段に合わせて、印をつける（絵は描き直さない） */
  function show() {
    const sec = root.querySelector<HTMLElement>(".moyou");
    if (!sec) return;
    sec.dataset.step = String(step);
    for (let i = 1; i <= STAGES.length; i++) sec.classList.toggle(`on${i}`, step >= i);
    sec.classList.toggle("on-final", step >= LAST);
    const count = root.querySelector(".mo-count");
    if (count) count.textContent = step >= LAST ? "出来上がり" : step === 0 ? "はじめ" : `${STAGES[step - 1].n} ${STAGES[step - 1].title}`;
    const next = root.querySelector<HTMLButtonElement>(".mo-next");
    if (next) next.disabled = step >= LAST;
    const prev = root.querySelector<HTMLButtonElement>(".mo-prev");
    if (prev) prev.disabled = step <= 0;
  }

  /** 絵を描く。重いので、ひとつずつ間をあけて（画面が固まらないように） */
  let paintToken = 0;
  function paint() {
    const token = ++paintToken;
    const jobs: (() => void)[] = [];
    root.querySelectorAll<HTMLCanvasElement>("canvas[data-stage]").forEach((c) => {
      const m = c.dataset.who === "t" ? models.t : models.c;
      const st = Number(c.dataset.stage);
      jobs.push(() => (st <= 4 ? drawSection(c, m, st as Stage, row) : drawTop(c, m, { tsuba: false, view: { x0: 0, y0: row - 0.5, size: 1 } })));
    });
    root.querySelectorAll<HTMLCanvasElement>("canvas[data-big]").forEach((c) => {
      jobs.push(() => drawTop(c, c.dataset.big === "t" ? models.t : models.c, { tsuba: true }));
    });
    const runJob = () => {
      if (token !== paintToken || !root.isConnected) return;
      const j = jobs.shift();
      if (!j) return;
      j();
      setTimeout(runJob, 0);
    };
    runJob();
  }

  function go(next: number) {
    step = Math.max(0, Math.min(LAST, next));
    show();
    if (step >= LAST) root.querySelector(".mo-final")?.scrollIntoView({ behavior: "smooth", block: rec ? "end" : "nearest" });
  }

  function stop() {
    clearTimeout(timer);
    timer = 0;
  }

  /** はじめから順に（およそ 13 秒） */
  function play() {
    stop();
    go(0);
    const tick = () => {
      if (!root.isConnected) return;
      go(step + 1);
      if (step < LAST) timer = window.setTimeout(tick, step === STAGES.length ? 2400 : 1900);
    };
    timer = window.setTimeout(tick, 900);
  }

  const onKey = (e: KeyboardEvent) => {
    if (!document.body.contains(root.querySelector(".moyou"))) return cleanup();
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      stop();
      go(step + 1);
    } else if (e.key === "ArrowLeft") {
      stop();
      go(step - 1);
    } else if (e.key === "r" || e.key === "R" || e.key === "Home") {
      stop();
      go(0);
    } else if (e.key === "p" || e.key === "P") play();
  };
  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(paint, 200);
  };
  const onHash = () => {
    if (!location.hash.startsWith("#waza/rebuild/moyou")) cleanup();
  };
  function cleanup() {
    stop();
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("hashchange", onHash);
    html.classList.remove("mo-page", "mo-rec");
  }
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  window.addEventListener("hashchange", onHash);

  render();
  if (opts.auto) play();
}

function fmt(v: number): string {
  if (Math.abs(v - 1 / 3) < 1e-9) return "1/3";
  return String(Math.round(v * 1000) / 1000);
}

function linkify(s: string): string {
  return esc(s).replace(/https?:\/\/[^\s）)、]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, "").slice(0, 38)}${u.length > 46 ? "…" : ""}</a>`);
}
