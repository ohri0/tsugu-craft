// 手を比べるの、はじめに見せる例：「いい例」（手本）と「よくない例」を並べ、道具を追いかけて判定する（2026-11-07 作者の声：
// 「動画を入れてあげると優しい。いいパターンと悪いパターン」「大事なのはヤスリの角度」「本物のトラッキングのプログラムのように」）。
//
// 動画と手の点は public/mihon/ の master（いい例）と learner（よくない例）。作り方は scripts/make-mihon.ts --pair。
// ヤスリの線は public/mihon/tool-lines.json（scripts/mihon-tool-line.ts が動画から探した物）。
// 動画の上には、見つかった物だけを描く（手の 21 点とヤスリの線）。見つからなかったこまには何も描かない。
// 描く線は src/craft/overlay-smooth.ts で ならし、こまの間をつなぐ（作者の声：トラッキングがうるさい）。判定の数は、ならす前の点で測る。
// 判定は src/craft/hand-judge.ts（手本＝いい例を 1 とした倍。線は GUIDES.handJudge の仮の値）。
// 何の仕事か・左右の手・下の言葉と出どころ・正直な注は public/mihon/pair.json（動画を替えたら、ここも替える）。
import { HAND_CONNECTIONS } from "../craft/motion";
import { importRecord, type SkillRecord } from "../craft/record";
import { holdFlag, smoothTrack, splitHands, trackAt, type SmoothTrack } from "../craft/overlay-smooth";
import type { Side } from "../craft/pose";
import { measureTake, type PairHands, type PairToolLines, type TakeMeasure } from "../craft/pair-measure";
import { judgeTake, type JudgeRow } from "../craft/hand-judge";
import { cleanAngles, TOOL_WOBBLE, type ToolLine } from "../craft/tool-line";
import { GUIDES } from "../rules/guides";
import { clipUrl, MIHON_CLIPS } from "./mihon";
import { esc } from "./store";

/** public/mihon/pair.json */
export interface PairInfo extends PairHands {
  /** 何の仕事の動画か（例：ヤスリがけ） */
  work: string;
  /** いい例・よくない例の下の言葉 */
  good: string;
  bad: string;
  /** その言葉の出どころ（例：職人（石川）） */
  who?: string;
  /** 正直な注 */
  note: string;
}

export interface PairClip {
  record: SkillRecord;
  videoUrl: string;
  /** こまごとのヤスリの線（なければ null） */
  tool: PairToolLines | null;
  measure: TakeMeasure;
}

export interface PairDemo {
  info: PairInfo;
  good: PairClip;
  bad: PairClip;
  /** よくない例を、いい例と比べた判定 */
  rows: JudgeRow[];
}

/** public/mihon/tool-lines.json の 1 こま */
interface ToolFrame {
  t: number;
  a?: number;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  s?: number;
}

const side = (s: unknown): Side => (s === "left" ? "left" : "right");
const toLines = (fs: ToolFrame[] | undefined): (ToolLine | null)[] =>
  (fs ?? []).map((f) => (f.a === undefined ? null : { angle: f.a, x0: f.x0!, y0: f.y0!, x1: f.x1!, y1: f.y1!, support: f.s ?? 0 }));

/** 例を読む（読めなければ null。画面は「自分の手で比べる」だけになる） */
export async function loadPair(): Promise<PairDemo | null> {
  try {
    const [raw, g, b, tl] = await Promise.all([
      fetch("mihon/pair.json").then((r) => r.json() as Promise<PairInfo>),
      fetch(MIHON_CLIPS.master.record).then((r) => r.text()),
      fetch(MIHON_CLIPS.learner.record).then((r) => r.text()),
      fetch("mihon/tool-lines.json")
        .then((r) => (r.ok ? (r.json() as Promise<{ fps: number; master?: ToolFrame[]; learner?: ToolFrame[] }>) : null))
        .catch(() => null),
    ]);
    const info: PairInfo = { ...raw, hold: { ...raw.hold, side: side(raw.hold?.side) }, file: { ...raw.file, side: side(raw.file?.side) } };
    const clip = (text: string, c: typeof MIHON_CLIPS.master, frames: ToolFrame[] | undefined): PairClip => {
      const record = importRecord(text);
      const tool = tl && frames ? { fps: tl.fps, lines: toLines(frames) } : null;
      return { record, videoUrl: clipUrl(c), tool, measure: measureTake(record.landmarksSampled, info, tool) };
    };
    const good = clip(g, MIHON_CLIPS.master, tl?.master);
    const bad = clip(b, MIHON_CLIPS.learner, tl?.learner);
    return { info, good, bad, rows: judgeTake(good.measure, bad.measure, { hold: info.hold.name, tool: info.file.tool }) };
  } catch {
    return null;
  }
}

/** 判定の表（例でも、学ぶ人の動画でも同じ形）。baseLabel を渡すと、いい例ではない手本（ほかの技の手本）と比べた表 */
export function judgeHtml(rows: JudgeRow[], tool: string, youLabel: string, baseLabel?: string): string {
  const mk = (m: JudgeRow["mark"]) => (m ? `<b class="jd-mark jd-${{ "○": "ok", "△": "warn", "×": "ng" }[m]}">${m}</b>` : `<b class="jd-mark jd-na">－</b>`);
  const th = GUIDES.handJudge;
  return `<section class="judge" aria-label="判定">
      <p class="jd-h"><b>判定</b><span>${baseLabel ? `道具のまっすぐな縁を追いかけ、${esc(baseLabel)}と角度のぶれを比べます。線が見つからない道具は、判定しません。` : `道具を追いかけ、手本（いい例）と比べて、扱えているかを見ます。いまは${esc(tool)}。ほかの道具も、手本を残せば同じしくみで比べられます。`}</span></p>
      <table class="jd-table">
        <thead><tr><th></th><th>${esc(baseLabel ?? "手本（いい例）")}</th><th>${esc(youLabel)}</th><th></th></tr></thead>
        <tbody>${rows
          .map((r) => `<tr class="jd-${r.key}"><th scope="row">${esc(r.label)}</th><td>${esc(r.base)}</td><td>${esc(r.you)}</td><td>${mk(r.mark)}</td></tr><tr class="jd-say"><td colspan="4">${esc(r.say)}</td></tr>`)
          .join("")}</tbody>
      </table>
      <p class="small muted jd-note">○ は手本の ${th.okRatio} 倍まで、△ は ${th.warnRatio} 倍まで（仮の線・最後は職人が決める）。測れなかった項目は判定しません。</p>
    </section>`;
}

/** 「どこが違うか」：判定で △・× の、ヤスリの角度とストローク（押さえる手は、作者の声で見出しに出さない） */
function headline(d: PairDemo): string {
  const items: string[] = [];
  for (const r of d.rows) {
    if (r.key === "hold" || !r.mark || r.mark === "○") continue;
    if (r.key === "angle") items.push(`<li><span class="pd-l">${esc(r.label)}のぶれが <em>${r.ratio!.toFixed(1)} 倍</em></span><small>いい例 ${esc(r.base)} ・ よくない例 ${esc(r.you)}</small></li>`);
    else items.push(`<li><span class="pd-l">${esc(r.say.replace(/（.*$/, ""))}</span><small>いい例 ${esc(r.base)}／よくない例 ${esc(r.you)}</small></li>`);
  }
  return items.length ? `<ul class="pd-diffs">${items.join("")}</ul>` : `<b>2 本を見比べてください</b>`;
}

const GOLD = "#e9c46a";
const RED = "#ff453a";
const BONE = "rgba(120, 220, 255, 1)";
/** 直前 1 秒の角度の幅がこれより広いとき「角度がぶれた」と出す（度。よくない例だけに出す） */
const HOT_DEG = 5;
/** 「角度がぶれた」は、一度出たらこの秒（動画の時間）は出しておく（ぱっと出て消えると読めない） */
const HOT_HOLD_S = 1.2;
/** 再生の速さ（作者の声：もうちょっとスピードゆっくりに）。はじめは ゆっくり */
export const PAIR_SPEEDS = [
  { rate: 0.5, label: "ゆっくり" },
  { rate: 1, label: "ふつう" },
] as const;

/** 描くためにならした、1 本の動画の線（判定の数は、ならす前の読んだ点で測っている） */
interface ClipOverlay {
  hands: SmoothTrack[];
  /** ヤスリの線：[角度, 真ん中の x, 真ん中の y, 半分の長さ（画面の高さを 1 として）] */
  tool: SmoothTrack | null;
  /** こまごとの「角度がぶれた」（よくない例だけ。HOT_HOLD_S 秒は出しておく） */
  hot: { ts: number[]; on: boolean[] } | null;
}

function overlayOf(clip: PairClip, showHot: boolean): ClipOverlay {
  const s = clip.record.landmarksSampled;
  const ts = s.frames.map((f) => f.t);
  const hands = splitHands(s.frames.map((f) => ({ hands: f.hands.filter((h) => h.length >= 42).map((h) => h.slice(0, 42)) }))).map((hs) => smoothTrack(ts, hs));
  if (!clip.tool) return { hands, tool: null, hot: null };
  const { fps, lines } = clip.tool;
  const angles = cleanAngles(lines, fps);
  const aspect = s.aspect || 9 / 16;
  const tts = lines.map((_, i) => i / fps);
  const frames = lines.map((l, i) => {
    const a = angles[i];
    if (!l || a === null) return null;
    return [a, (l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2, Math.hypot((l.x1 - l.x0) * aspect, l.y1 - l.y0) / 2 + 0.05];
  });
  let hot: ClipOverlay["hot"] = null;
  if (showHot) {
    const back = Math.round(TOOL_WOBBLE.halfS * fps);
    const hits = angles.map((a, i) => {
      if (a === null) return false;
      const recent = angles.slice(Math.max(0, i - back), i).filter((x): x is number => x !== null);
      return recent.length >= 3 && Math.max(...recent, a) - Math.min(...recent, a) >= HOT_DEG;
    });
    hot = { ts: tts, on: holdFlag(hits, tts, HOT_HOLD_S) };
  }
  return { hands, tool: smoothTrack(tts, frames), hot };
}

/** 例を描く。戻り値は止める関数 */
export function mountPair(slot: HTMLElement, d: PairDemo): () => void {
  const toolName = d.info.file.tool;
  const fig = (kind: "good" | "bad", label: string, clip: PairClip, words: string) => `
    <figure class="pd-fig pd-${kind}">
      <div class="pd-frame" style="aspect-ratio:${clip.record.landmarksSampled.aspect || 16 / 9}"><video src="${clip.videoUrl}" muted loop playsinline autoplay preload="auto" aria-label="${label}の動画"></video><canvas aria-hidden="true"></canvas>
        <span class="pd-tag">${kind === "good" ? "◯" : "×"} ${label}</span>${kind === "bad" ? `<span class="pd-here" aria-hidden="true">角度がぶれた</span>` : ""}</div>
      <figcaption>${esc(words)}${d.info.who ? `<small>${esc(d.info.who)}の言葉</small>` : ""}</figcaption>
    </figure>`;
  slot.innerHTML = `
    <section class="pair-demo" aria-label="いい例とよくない例">
      <div class="pd-diff"><span class="pd-diff-h">どこが違うか</span>${headline(d)}</div>
      <div class="pd-speed" role="group" aria-label="再生の速さ"><span>速さ</span>${PAIR_SPEEDS.map((s, i) => `<button type="button" data-rate="${s.rate}" aria-pressed="${i === 0}">${s.label}</button>`).join("")}</div>
      <div class="pd-grid">${fig("good", "いい例", d.good, d.info.good)}${fig("bad", "よくない例", d.bad, d.info.bad)}</div>
      <p class="small muted pd-note"><span class="pd-key"><i class="k-hand"></i>手（21 点）</span><span class="pd-key"><i class="k-tool"></i>${esc(toolName)}の線</span><span class="pd-key"><i class="k-fan"></i>直前 1 秒の角度の幅</span>動画を押すと止まります。${esc(d.info.note)}</p>
      ${judgeHtml(d.rows, toolName, "よくない例")}
    </section>`;

  const over = { good: overlayOf(d.good, false), bad: overlayOf(d.bad, true) };

  const paint = (kind: "good" | "bad") => {
    const ov = over[kind];
    const box = slot.querySelector<HTMLElement>(`.pd-${kind}`)!;
    const v = box.querySelector("video")!;
    const cv = box.querySelector("canvas")!;
    const w = Math.round(cv.clientWidth * devicePixelRatio);
    const h = Math.round(cv.clientHeight * devicePixelRatio);
    if (!w || !h) return;
    if (cv.width !== w || cv.height !== h) Object.assign(cv, { width: w, height: h });
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    const t = v.currentTime;
    // 手：ならした 21 点と骨。細く、少し透かして（動画の手が見えるように）
    for (const tr of ov.hands) {
      const at = trackAt(tr, t);
      if (!at) continue;
      const pts = at.v;
      ctx.save();
      ctx.globalAlpha = 0.8 * at.alpha;
      ctx.strokeStyle = BONE;
      ctx.fillStyle = BONE;
      ctx.lineWidth = Math.max(1, w / 400);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(pts[2 * a] * w, pts[2 * a + 1] * h);
        ctx.lineTo(pts[2 * b] * w, pts[2 * b + 1] * h);
      }
      ctx.stroke();
      for (let i = 0; i < 21; i++) {
        ctx.beginPath();
        ctx.arc(pts[2 * i] * w, pts[2 * i + 1] * h, Math.max(1.5, w / 260), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // ヤスリ：ならした線と、直前 1 秒の角度の幅（薄い扇）。角度の数は右下の決まった所に
    const tool = ov.tool ? trackAt(ov.tool, t) : null;
    if (ov.tool && tool) {
      const [a, mxN, myN, lenN] = tool.v;
      const color = kind === "good" ? GOLD : RED;
      const mx = mxN * w;
      const my = myN * h;
      const len = lenN * h;
      const past = Array.from({ length: 11 }, (_, k) => trackAt(ov.tool!, t - k * 0.1)?.v[0]).filter((x): x is number => x !== undefined);
      const lo = Math.min(...past);
      const hi = Math.max(...past);
      ctx.save();
      ctx.globalAlpha = tool.alpha;
      if (hi - lo >= 0.5) {
        // 扇：線の両側に、角度の幅だけ広げる
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.16 * tool.alpha;
        for (const dir of [0, 180]) {
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.arc(mx, my, len, (-(hi + dir) * Math.PI) / 180, (-(lo + dir) * Math.PI) / 180);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = tool.alpha;
      }
      const r = (a * Math.PI) / 180;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, w / 160);
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 2;
      ctx.beginPath();
      ctx.moveTo(mx - Math.cos(r) * len, my + Math.sin(r) * len);
      ctx.lineTo(mx + Math.cos(r) * len, my - Math.sin(r) * len);
      ctx.stroke();
      ctx.restore();
    }
    const deg = box.querySelector<HTMLElement>(".pd-deg");
    const shown = tool ? `${toolName} ${(((Math.round(tool.v[0]) % 180) + 180) % 180).toFixed(0)}°` : "";
    if (deg && deg.textContent !== shown) deg.textContent = shown;
    deg?.classList.toggle("on", !!tool);
    // 「角度がぶれた」：よくない例だけ。一度出たら しばらく出しておき、ふわっと出し入れする
    const here = box.querySelector<HTMLElement>(".pd-here");
    if (here && ov.hot) {
      const i = Math.round(t * (d.bad.tool?.fps ?? 10));
      here.classList.toggle("on", !!ov.hot.on[Math.min(ov.hot.on.length - 1, Math.max(0, i))]);
    }
  };
  // 角度の数は、動画の右下の決まった所に出す（線について動く札は、読みにくかった）
  slot.querySelectorAll<HTMLElement>(".pd-frame").forEach((fr) => fr.insertAdjacentHTML("beforeend", `<span class="pd-deg" aria-hidden="true"></span>`));

  let raf = 0;
  const loop = () => {
    if (!slot.isConnected) return;
    paint("good");
    paint("bad");
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const vids = [...slot.querySelectorAll<HTMLVideoElement>(".pd-frame video")];
  // 速さ：はじめは ゆっくり。2 本いっしょに変える
  const setRate = (rate: number) => {
    vids.forEach((v) => {
      v.defaultPlaybackRate = rate;
      v.playbackRate = rate;
    });
    slot.querySelectorAll<HTMLButtonElement>(".pd-speed button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.rate) === rate)));
  };
  setRate(PAIR_SPEEDS[0].rate);
  slot.querySelectorAll<HTMLButtonElement>(".pd-speed button").forEach((b) => b.addEventListener("click", () => setRate(Number(b.dataset.rate))));
  // 読み込みで速さが戻るブラウザがあるので、読めたらもう一度そろえる
  vids.forEach((v) => v.addEventListener("loadedmetadata", () => (v.playbackRate = v.defaultPlaybackRate)));
  // 押すと止める・動かす（2 本いっしょに）
  slot.querySelectorAll<HTMLElement>(".pd-frame").forEach((fr) =>
    fr.addEventListener("click", () => {
      const go = vids.some((v) => v.paused);
      vids.forEach((v) => void (go ? v.play().catch(() => {}) : v.pause()));
    }),
  );
  // 自動で動かないブラウザ（省電力など）でも、見えたら動かす
  vids.forEach((v) => void v.play().catch(() => {}));
  return () => {
    cancelAnimationFrame(raf);
    vids.forEach((v) => v.pause());
  };
}
