// 手を比べるの、はじめに見せる例：「いい例」（手本）と「よくない例」を並べ、どこが違うかを短い行で出す（2026-11-07 作者の声：
// 「動画を入れてあげると優しい。いいパターンと悪いパターン」「大事なのはヤスリの角度」）。はじめて開いた人でも、3 秒で分かるように。
//
// 動画と手の点は public/mihon/ の master（いい例）と learner（よくない例）。作り方は scripts/make-mihon.ts --pair。
// ヤスリの線は public/mihon/tool-lines.json（scripts/mihon-tool-line.ts が動画から探した物）。画面ではその線をそのまま重ねる。
// 何の仕事か・左右の手・下の言葉と出どころ・正直な注は public/mihon/pair.json（動画を替えたら、ここも替える）。
// 違いの数は、ここで計算する（src/craft/pair-measure.ts）。測れなかった所は数を出さず、注に書く。
import { importRecord, type SkillRecord } from "../craft/record";
import type { Side } from "../craft/pose";
import { comparePair, ratioText, shownDifferences, type PairHands, type PairItem, type PairToolLines } from "../craft/pair-measure";
import { cleanAngles, TOOL_WOBBLE, type ToolLine } from "../craft/tool-line";
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
}

export interface PairDemo {
  info: PairInfo;
  good: PairClip;
  bad: PairClip;
  /** 比べた所（ヤスリの角度のぶれ・1 回の動きの長さ） */
  items: PairItem[];
  /** 画面に出す違い */
  shown: PairItem[];
  /** こまごとのヤスリの線（なければ null） */
  tools: PairToolLines | null;
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
    const good: PairClip = { record: importRecord(g), videoUrl: clipUrl(MIHON_CLIPS.master) };
    const bad: PairClip = { record: importRecord(b), videoUrl: clipUrl(MIHON_CLIPS.learner) };
    const tools: PairToolLines | null = tl ? { fps: tl.fps, good: toLines(tl.master), bad: toLines(tl.learner) } : null;
    const items = comparePair(good.record.landmarksSampled, bad.record.landmarksSampled, info, tools ?? undefined);
    return { info, good, bad, items, shown: shownDifferences(items), tools };
  } catch {
    return null;
  }
}

/** 値の字（角度は度、ほかは手のひらの長さを 1 とした値） */
const valueText = (x: PairItem, v: number | null) => (v === null ? "-" : x.unit === "°" ? `${v.toFixed(1)}°` : v.toFixed(2));

/** 測れなかった所・ほぼ同じだった所の注（数を出さなかったわけ） */
export function missingNote(d: PairDemo): string {
  return d.items
    .filter((x) => !d.shown.includes(x))
    .map((x) => (x.ratio === null ? `${x.label}は、測れませんでした（${x.missing}）。` : `${x.label}は、ほぼ同じでした（${ratioText(x.ratio)}）。`))
    .join("");
}

/** こまごとの、ならした角度と、前後 1 秒の真ん中の角度（線のないこまは null）。測るのと同じ計算（src/craft/tool-line.ts） */
function angleTrack(lines: (ToolLine | null)[], fps: number): { angle: number | null; mid: number | null }[] {
  const u = cleanAngles(lines, fps);
  const half = Math.round(TOOL_WOBBLE.halfS * fps);
  return u.map((v, i) => {
    const near = u.slice(Math.max(0, i - half), i + half + 1).filter((x): x is number => x !== null).sort((p, q) => p - q);
    const mid = near.length >= 3 ? (near.length % 2 ? near[near.length >> 1] : (near[(near.length >> 1) - 1] + near[near.length >> 1]) / 2) : null;
    return { angle: v, mid };
  });
}

const GOLD = "#e9c46a";
const RED = "#ff453a";
/** 直前 1 秒の角度の幅がこれより広いとき「角度がぶれた」と出す（度。いい例でも広がれば出す） */
const HOT_DEG = 5;

/** 例を描く。戻り値は止める関数 */
export function mountPair(slot: HTMLElement, d: PairDemo): () => void {
  const toolName = d.info.file.tool;
  const fig = (kind: "good" | "bad", label: string, clip: PairClip, words: string) => `
    <figure class="pd-fig pd-${kind}">
      <div class="pd-frame" style="aspect-ratio:${clip.record.landmarksSampled.aspect || 16 / 9}"><video src="${clip.videoUrl}" muted loop playsinline autoplay preload="auto" aria-label="${label}の動画"></video><canvas aria-hidden="true"></canvas>
        <span class="pd-tag">${kind === "good" ? "◯" : "×"} ${label}</span><span class="pd-here" hidden>角度がぶれた</span></div>
      <figcaption>${esc(words)}${d.info.who ? `<small>${esc(d.info.who)}の言葉</small>` : ""}</figcaption>
    </figure>`;
  const diffs = d.shown
    .map((x) => {
      const max = Math.max(x.good ?? 0, x.bad ?? 0) || 1;
      const pct = (v: number | null) => ((100 * (v ?? 0)) / max).toFixed(1);
      return `<li><span class="pd-l">${esc(x.label)}が <em>${ratioText(x.ratio!)}</em></span>
        <span class="pd-mini"><i class="gold" style="--w:${pct(x.good)}%"></i><i class="red" style="--w:${pct(x.bad)}%"></i></span>
        <small>いい例 ${valueText(x, x.good)} ・ よくない例 ${valueText(x, x.bad)}</small></li>`;
    })
    .join("");
  const angleShown = d.shown.find((x) => x.key === "angle");
  const how = angleShown?.from === "tool"
    ? `色の線＝動画から見つけた${esc(toolName)}の縁。薄い線＝直前 1 秒の角度（広がるほど、ぶれている）。`
    : "数は、動画から読んだ手の点で測りました。";
  slot.innerHTML = `
    <section class="pair-demo" aria-label="いい例とよくない例">
      <div class="pd-diff"><span class="pd-diff-h">どこが違うか</span>${diffs ? `<ul class="pd-diffs">${diffs}</ul>` : `<b>2 本を見比べてください</b>`}</div>
      <div class="pd-grid">${fig("good", "いい例", d.good, d.info.good)}${fig("bad", "よくない例", d.bad, d.info.bad)}</div>
      <p class="small muted pd-note">${how}${esc(missingNote(d))}${esc(d.info.note)}</p>
    </section>`;

  const tools = d.tools;
  const lines = { good: tools?.good ?? [], bad: tools?.bad ?? [] };
  const track = { good: tools ? angleTrack(lines.good, tools.fps) : [], bad: tools ? angleTrack(lines.bad, tools.fps) : [] };

  const paint = (kind: "good" | "bad") => {
    const box = slot.querySelector<HTMLElement>(`.pd-${kind}`)!;
    const v = box.querySelector("video")!;
    const cv = box.querySelector("canvas")!;
    const w = Math.round(cv.clientWidth * devicePixelRatio);
    const h = Math.round(cv.clientHeight * devicePixelRatio);
    if (!w || !h) return;
    if (cv.width !== w || cv.height !== h) Object.assign(cv, { width: w, height: h });
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    if (!tools || angleShown?.from !== "tool") return;
    const i = Math.round(v.currentTime * tools.fps);
    const l = lines[kind][i];
    const a = track[kind][i];
    // 直前 1 秒の角度（扇のように重ねて描く。広がるほど、ぶれている）
    const back = Math.round(TOOL_WOBBLE.halfS * tools.fps);
    const recent = track[kind].slice(Math.max(0, i - back), i).flatMap((x) => (x.angle === null ? [] : [x.angle]));
    const hot = !!a && a.angle !== null && recent.length >= 3 && Math.max(...recent, a.angle) - Math.min(...recent, a.angle) >= HOT_DEG;
    box.querySelector<HTMLElement>(".pd-here")!.hidden = !hot;
    if (!l || !a || a.angle === null) return;
    const color = kind === "good" ? GOLD : RED;
    // 線の真ん中と長さ（画素）
    const mx = ((l.x0 + l.x1) / 2) * w;
    const my = ((l.y0 + l.y1) / 2) * h;
    const len = Math.hypot((l.x1 - l.x0) * w, (l.y1 - l.y0) * h) / 2 + h * 0.05;
    const seg = (deg: number, width: number, alpha: number) => {
      const a = (deg * Math.PI) / 180;
      const dx = Math.cos(a) * len;
      const dy = -Math.sin(a) * len;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.moveTo(mx - dx, my - dy);
      ctx.lineTo(mx + dx, my + dy);
      ctx.stroke();
      ctx.restore();
    };
    // 直前 1 秒の角度（薄く）と、いまのヤスリの角度（ならした角度。測るのと同じ）
    for (const r of recent) seg(r, Math.max(2, w / 180), 0.3);
    seg(a.angle, Math.max(3, w / (hot ? 70 : 100)), 1);
  };

  let raf = 0;
  const loop = () => {
    if (!slot.isConnected) return;
    paint("good");
    paint("bad");
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  // 押すと止める・動かす（2 本いっしょに）
  const vids = [...slot.querySelectorAll<HTMLVideoElement>(".pd-frame video")];
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
