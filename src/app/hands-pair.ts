// 手を比べるの、はじめに見せる例：「いい例」（手本）と「よくない例」を並べ、どこが違うかを 1 行で出す（2026-11-07 作者の声：
// 「動画を入れてあげると優しい。いいパターンと悪いパターン」）。はじめて開いた人でも、3 秒で何をする画面か分かるように。
//
// 動画と手の点は public/mihon/ の master（いい例）と learner（よくない例）。作り方は scripts/make-mihon.ts。
// 何の仕事か・どちらの手を見るか・下の短い言葉・正直な注は public/mihon/pair.json（動画を替えたら、ここも替える）。
// 「何倍」は、ここで 2 つの手の点の記録から計算する（src/craft/pose.ts の comparePose。結果の画面と同じ計算）。
import { importRecord, type SkillRecord } from "../craft/record";
import { comparePose, poseTrack, type PoseComparison, type PoseTrack } from "../craft/pose";
import { poseAt } from "./draw";
import { clipUrl, MIHON_CLIPS } from "./mihon";
import { esc } from "./store";

/** public/mihon/pair.json */
export interface PairInfo {
  /** 何の仕事の動画か（例：ヤスリがけ） */
  work: string;
  /** 比べる手（画面の右か左） */
  side: "right" | "left";
  /** その手の呼び名（例：押さえる手） */
  hand: string;
  /** いい例・よくない例の下の短い言葉 */
  good: string;
  bad: string;
  /** 正直な注（同じ職人の別の場面を見立てた、など） */
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
  cmp: PoseComparison;
}

/** 例を読む（読めなければ null。画面は「自分の手で比べる」だけになる） */
export async function loadPair(): Promise<PairDemo | null> {
  try {
    const [info, g, b] = await Promise.all([
      fetch("mihon/pair.json").then((r) => r.json() as Promise<PairInfo>),
      fetch(MIHON_CLIPS.master.record).then((r) => r.text()),
      fetch(MIHON_CLIPS.learner.record).then((r) => r.text()),
    ]);
    const good: PairClip = { record: importRecord(g), videoUrl: clipUrl(MIHON_CLIPS.master) };
    const bad: PairClip = { record: importRecord(b), videoUrl: clipUrl(MIHON_CLIPS.learner) };
    const side = info.side === "left" ? "left" : "right";
    return { info: { ...info, side }, good, bad, cmp: comparePose(good.record.landmarksSampled, bad.record.landmarksSampled, side) };
  } catch {
    return null;
  }
}

/** 「どこが違うか」の 1 行（何倍は小数 1 けた） */
export function pairHeadline(d: PairDemo): string {
  const r = d.cmp.ratio;
  if (!Number.isFinite(r)) return `${esc(d.info.hand)}の動きを見てください`;
  if (r >= 1.3) return `${esc(d.info.hand)}のふらつきが <em>${r.toFixed(1)} 倍</em>`;
  if (r <= 0.77) return `${esc(d.info.hand)}の動きが、手本より小さい`;
  return `${esc(d.info.hand)}の動きは、ほぼ同じ`;
}

const GOLD = "#e9c46a";
const RED = "#ff453a";

/** 例を描く。戻り値は止める関数 */
export function mountPair(slot: HTMLElement, d: PairDemo): () => void {
  const c = d.cmp;
  const max = Math.max(c.masterWobble, c.learnerWobble) || 1;
  const num = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "-");
  const fig = (kind: "good" | "bad", label: string, clip: PairClip, words: string) => `
    <figure class="pd-fig pd-${kind}">
      <div class="pd-frame" style="aspect-ratio:${clip.record.landmarksSampled.aspect || 16 / 9}"><video src="${clip.videoUrl}" muted loop playsinline autoplay preload="auto" aria-label="${label}の動画"></video><canvas aria-hidden="true"></canvas>
        <span class="pd-tag">${kind === "good" ? "◯" : "×"} ${label}</span><span class="pd-here" hidden>ここで揺れる</span></div>
      <figcaption>${esc(words)}</figcaption>
    </figure>`;
  slot.innerHTML = `
    <section class="pair-demo" aria-label="いい例とよくない例">
      <p class="pd-diff"><span class="pd-diff-h">どこが違うか</span><b>${pairHeadline(d)}</b></p>
      <div class="pd-grid">${fig("good", "いい例", d.good, d.info.good)}${fig("bad", "よくない例", d.bad, d.info.bad)}</div>
      <div class="pd-bars" aria-label="ふらつきの大きさ" title="ふらつき：手のひらの中心が、前後 1 秒の真ん中からどれだけ離れたかの平均（手のひらの長さを 1 として）">
        <div><span>いい例</span><i class="gold" style="--w:${((100 * c.masterWobble) / max).toFixed(1)}%"></i><b>${num(c.masterWobble)}</b></div>
        <div><span>よくない例</span><i class="red" style="--w:${((100 * c.learnerWobble) / max).toFixed(1)}%"></i><b>${num(c.learnerWobble)}</b></div>
      </div>
      <p class="small muted pd-note">輪の中の手を見ます。線は、手のひらの中心が通った跡。${esc(d.info.note)}</p>
    </section>`;

  const tracks: Record<"good" | "bad", PoseTrack> = { good: poseTrack(d.good.record.landmarksSampled, d.info.side), bad: poseTrack(d.bad.record.landmarksSampled, d.info.side) };
  /** 輪：その手がいつもいる所（手のひらの中心の平均と、手のひらの長さ） */
  const ringOf = (tr: PoseTrack) => {
    const fs = tr.frames.filter((f): f is NonNullable<typeof f> => !!f);
    if (!fs.length) return null;
    const avg = (k: "cx" | "cy" | "palm") => fs.reduce((s, f) => s + f[k], 0) / fs.length;
    return { cx: avg("cx"), cy: avg("cy"), palm: avg("palm") };
  };
  const rings = { good: ringOf(tracks.good), bad: ringOf(tracks.bad) };
  const moments = c.moments;

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
    const tr = tracks[kind];
    const t = v.currentTime;
    const color = kind === "good" ? GOLD : RED;
    // よくない例の、違いがいちばん大きい所の前後
    const hot = kind === "bad" && moments.some((m) => t >= m.t0 - 0.6 && t <= m.t1 + 0.3);
    box.querySelector<HTMLElement>(".pd-here")!.hidden = !hot;
    const ring = rings[kind];
    if (ring) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = hot ? 1 : 0.75;
      ctx.lineWidth = Math.max(2, w / (hot ? 140 : 260));
      ctx.setLineDash(hot ? [] : [w / 90, w / 140]);
      ctx.beginPath();
      ctx.arc(ring.cx * w, ring.cy * h, ring.palm * h * 1.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.font = `600 ${Math.round(h / 17)}px ${getComputedStyle(cv).fontFamily}`;
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = Math.max(2, h / 120);
      ctx.textAlign = "center";
      const ty = Math.max(h / 12, ring.cy * h - ring.palm * h * 1.35 - h / 40);
      ctx.strokeText(d.info.hand, ring.cx * w, ty);
      ctx.fillText(d.info.hand, ring.cx * w, ty);
      ctx.restore();
    }
    // 手のひらの中心が、いままでの 1.2 秒に通った跡
    const trail = tr.frames.filter((f, i): f is NonNullable<typeof f> => !!f && tr.times[i] <= t && tr.times[i] >= t - 1.2);
    if (trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(3, w / 110);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      trail.forEach((p, i) => (i ? ctx.lineTo(p.cx * w, p.cy * h) : ctx.moveTo(p.cx * w, p.cy * h)));
      ctx.stroke();
      ctx.restore();
    }
    const p = poseAt(tr, t);
    if (p) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.cx * w, p.cy * h, Math.max(4, w / 90), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
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
  slot.querySelectorAll<HTMLElement>(".pd-frame").forEach((f) =>
    f.addEventListener("click", () => {
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
