// 手を比べるの、はじめに見せる例：「いい例」（手本）と「よくない例」を並べ、道具を追いかけて判定する（2026-11-07 作者の声：
// 「動画を入れてあげると優しい。いいパターンと悪いパターン」「大事なのはヤスリの角度」「本物のトラッキングのプログラムのように」）。
//
// 動画と手の点は public/mihon/ の master（いい例）と learner（よくない例）。作り方は scripts/make-mihon.ts --pair。
// ヤスリの線は public/mihon/tool-lines.json（scripts/mihon-tool-line.ts が動画から探した物）。
// 動画の上には、見つかった物だけを描く（手の 21 点とヤスリの線）。見つからなかったこまには何も描かない。
// 判定は src/craft/hand-judge.ts（手本＝いい例を 1 とした倍。線は GUIDES.handJudge の仮の値）。
// 何の仕事か・左右の手・下の言葉と出どころ・正直な注は public/mihon/pair.json（動画を替えたら、ここも替える）。
import { HAND_CONNECTIONS } from "../craft/motion";
import { importRecord, type SampledLandmarks, type SkillRecord } from "../craft/record";
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

/** 判定の表（例でも、学ぶ人の動画でも同じ形） */
export function judgeHtml(rows: JudgeRow[], tool: string, youLabel: string): string {
  const mk = (m: JudgeRow["mark"]) => (m ? `<b class="jd-mark jd-${{ "○": "ok", "△": "warn", "×": "ng" }[m]}">${m}</b>` : `<b class="jd-mark jd-na">－</b>`);
  const th = GUIDES.handJudge;
  return `<section class="judge" aria-label="判定">
      <p class="jd-h"><b>判定</b><span>道具を追いかけ、手本（いい例）と比べて、扱えているかを見ます。いまは${esc(tool)}。ほかの道具も、手本を残せば同じしくみで比べられます。</span></p>
      <table class="jd-table">
        <thead><tr><th></th><th>手本（いい例）</th><th>${esc(youLabel)}</th><th></th></tr></thead>
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
const BONE = "rgba(120, 220, 255, 0.95)";
/** 直前 1 秒の角度の幅がこれより広いとき「角度がぶれた」と出す（度。いい例でも広がれば出す） */
const HOT_DEG = 5;

/** その時刻の手の点（読んだこまが近くになければ空。作らない） */
function handsAt(s: SampledLandmarks, t: number): number[][] {
  let best = -1;
  let bd = Infinity;
  s.frames.forEach((f, i) => {
    const d = Math.abs(f.t - t);
    if (d < bd) [bd, best] = [d, i];
  });
  return best >= 0 && bd <= 0.6 / Math.max(1, s.fps) ? s.frames[best].hands.filter((h) => h.length >= 42) : [];
}

/** 例を描く。戻り値は止める関数 */
export function mountPair(slot: HTMLElement, d: PairDemo): () => void {
  const toolName = d.info.file.tool;
  const fig = (kind: "good" | "bad", label: string, clip: PairClip, words: string) => `
    <figure class="pd-fig pd-${kind}">
      <div class="pd-frame" style="aspect-ratio:${clip.record.landmarksSampled.aspect || 16 / 9}"><video src="${clip.videoUrl}" muted loop playsinline autoplay preload="auto" aria-label="${label}の動画"></video><canvas aria-hidden="true"></canvas>
        <span class="pd-tag">${kind === "good" ? "◯" : "×"} ${label}</span><span class="pd-track" aria-hidden="true"></span><span class="pd-here" hidden>角度がぶれた</span></div>
      <figcaption>${esc(words)}${d.info.who ? `<small>${esc(d.info.who)}の言葉</small>` : ""}</figcaption>
    </figure>`;
  slot.innerHTML = `
    <section class="pair-demo" aria-label="いい例とよくない例">
      <div class="pd-diff"><span class="pd-diff-h">どこが違うか</span>${headline(d)}</div>
      <div class="pd-grid">${fig("good", "いい例", d.good, d.info.good)}${fig("bad", "よくない例", d.bad, d.info.bad)}</div>
      <p class="small muted pd-note"><span class="pd-key"><i class="k-hand"></i>手（21 点・MediaPipe）</span><span class="pd-key"><i class="k-tool"></i>${esc(toolName)}（線・縁を探す）</span>薄い線は直前 1 秒の${esc(toolName)}の角度（広がるほど、ぶれている）。見つからなかったこまには何も描きません。${esc(d.info.note)}</p>
      ${judgeHtml(d.rows, toolName, "よくない例")}
    </section>`;

  const track = {
    good: d.good.tool ? { fps: d.good.tool.fps, lines: d.good.tool.lines, angles: cleanAngles(d.good.tool.lines, d.good.tool.fps) } : null,
    bad: d.bad.tool ? { fps: d.bad.tool.fps, lines: d.bad.tool.lines, angles: cleanAngles(d.bad.tool.lines, d.bad.tool.fps) } : null,
  };

  const paint = (kind: "good" | "bad") => {
    const clip = d[kind];
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
    const font = `600 ${Math.round(Math.max(10, Math.min(w, h) / 34))}px ${getComputedStyle(cv).fontFamily}`;
    const tag = (text: string, x: number, y: number, color: string) => {
      ctx.save();
      ctx.font = font;
      const tw = ctx.measureText(text).width;
      const pad = Math.round(Math.min(w, h) / 120) + 2;
      const fh = parseInt(font.split(" ")[1], 10);
      const bx = Math.min(Math.max(2, x), w - tw - 2 * pad - 2);
      const by = Math.min(Math.max(2, y), h - fh - 2 * pad - 2);
      ctx.fillStyle = "rgba(10, 10, 12, 0.72)";
      ctx.fillRect(bx, by, tw + 2 * pad, fh + 2 * pad);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, tw + 2 * pad - 1, fh + 2 * pad - 1);
      ctx.fillStyle = color;
      ctx.textBaseline = "top";
      ctx.fillText(text, bx + pad, by + pad);
      ctx.restore();
    };
    // 手：読んだ 21 点と骨（見つかった手だけ）
    const hands = handsAt(clip.record.landmarksSampled, t);
    for (const pts of hands) {
      ctx.save();
      ctx.strokeStyle = BONE;
      ctx.fillStyle = BONE;
      ctx.lineWidth = Math.max(1.5, w / 260);
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 2;
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(pts[2 * a] * w, pts[2 * a + 1] * h);
        ctx.lineTo(pts[2 * b] * w, pts[2 * b + 1] * h);
        ctx.stroke();
      }
      for (let i = 0; i < 21; i++) {
        ctx.beginPath();
        ctx.arc(pts[2 * i] * w, pts[2 * i + 1] * h, Math.max(2, w / 170), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // 名札は手首（0 番）のそば
      tag("手（21 点）", pts[0] * w + w / 60, pts[1] * h + h / 80, BONE);
    }
    // ヤスリ：見つかった縁の線（ならした角度）と、直前 1 秒の角度
    const tr = track[kind];
    let hot = false;
    if (tr) {
      const i = Math.round(t * tr.fps);
      const l = tr.lines[i];
      const a = tr.angles[i];
      const back = Math.round(TOOL_WOBBLE.halfS * tr.fps);
      const recent = tr.angles.slice(Math.max(0, i - back), i).filter((x): x is number => x !== null);
      if (l && a !== null && a !== undefined) {
        hot = recent.length >= 3 && Math.max(...recent, a) - Math.min(...recent, a) >= HOT_DEG;
        const color = kind === "good" ? GOLD : RED;
        const mx = ((l.x0 + l.x1) / 2) * w;
        const my = ((l.y0 + l.y1) / 2) * h;
        const len = Math.hypot((l.x1 - l.x0) * w, (l.y1 - l.y0) * h) / 2 + h * 0.05;
        const seg = (deg: number, width: number, alpha: number) => {
          const r = (deg * Math.PI) / 180;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.lineCap = "round";
          ctx.shadowColor = "rgba(0,0,0,0.7)";
          ctx.shadowBlur = 3;
          ctx.beginPath();
          ctx.moveTo(mx - Math.cos(r) * len, my + Math.sin(r) * len);
          ctx.lineTo(mx + Math.cos(r) * len, my - Math.sin(r) * len);
          ctx.stroke();
          ctx.restore();
        };
        for (const r of recent) seg(r, Math.max(2, w / 180), 0.3);
        seg(a, Math.max(3, w / (hot ? 70 : 100)), 1);
        // 名札は線の上の端のそば
        const r = (a * Math.PI) / 180;
        tag(`${toolName}（線） ${a.toFixed(0)}°`, mx + Math.cos(r) * len + w / 60, my - Math.sin(r) * len - h / 40, color);
      }
    }
    box.querySelector<HTMLElement>(".pd-here")!.hidden = !hot;
    // 右上の小さな表示：いま追いかけている物
    const n = hands.length;
    const found = tr && tr.lines[Math.round(t * tr.fps)] ? 1 : 0;
    box.querySelector<HTMLElement>(".pd-track")!.textContent = `手 ${n} ・ ${toolName} ${found}`;
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
