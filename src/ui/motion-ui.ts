// 手の記録の画面：職人が手元を撮った動画（スマホを固定して 20〜60 秒）から手の動きを読み、
// 動きの数字と職人の言葉（動画の時刻つき）を「手の記録」として残し、後で手本と比べる。
// 技そのものは読めない。残すのは、動きの数字と、職人が言った判断。
// 記録はこのブラウザに残し（localStorage）、JSON に書き出せる。動画そのものは記録に入れない。
import "./motion.css";
import { compareRecords, HAND_CONNECTIONS, summarizeMetrics, type HandMetrics, type MotionFrame, type MotionMetrics } from "../craft/motion";
import { MAX_TRACK_S, trackVideo } from "../craft/hand-tracker";
import { createRecord, exportRecord, importRecord, inputFromSampled, RecordFormatError, type SkillNote, type SkillRecord } from "../craft/record";

const INDEX_STORE = "tsugu.motion.index.v1";
const RECORD_STORE = "tsugu.motion.record.v1.";

/** 線の色（よく動いた手・もう一方の手）。白地で色の見分けにくい人にも分かれる 2 色 */
const MAIN_COLOR = "#a8661c";
const OTHER_COLOR = "#2b7bb9";

interface IndexItem {
  id: string;
  title: string;
  craftsman: string;
  date: string;
  durationS: number;
  tempoPerMin: number | null;
}

function loadIndex(): IndexItem[] {
  try {
    const raw = localStorage.getItem(INDEX_STORE);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as IndexItem[]) : [];
  } catch {
    return [];
  }
}

function loadSaved(id: string): SkillRecord | null {
  try {
    const raw = localStorage.getItem(RECORD_STORE + id);
    return raw ? importRecord(raw) : null;
  } catch {
    return null;
  }
}

/** このブラウザに残した手の記録すべて（技の帳面に載せるため） */
export function savedRecords(): SkillRecord[] {
  return loadIndex()
    .map((x) => loadSaved(x.id))
    .filter((r): r is SkillRecord => r !== null);
}

/** 残す。入りきらないときは false */
function storeRecord(r: SkillRecord): boolean {
  const main = r.metrics.mainHand === null ? null : r.metrics.hands[r.metrics.mainHand];
  const item: IndexItem = { id: r.id, title: r.title, craftsman: r.craftsman, date: r.date, durationS: r.durationS, tempoPerMin: main?.tempoPerMin ?? null };
  try {
    localStorage.setItem(RECORD_STORE + r.id, exportRecord(r));
    const idx = loadIndex().filter((x) => x.id !== r.id);
    idx.unshift(item);
    localStorage.setItem(INDEX_STORE, JSON.stringify(idx));
    return true;
  } catch {
    return false;
  }
}

function deleteRecord(id: string) {
  try {
    localStorage.removeItem(RECORD_STORE + id);
    localStorage.setItem(INDEX_STORE, JSON.stringify(loadIndex().filter((x) => x.id !== id)));
  } catch {
    // 消せなくても画面は動く
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const clock = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
};

interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognizer {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechCtor = new () => SpeechRecognizer;

let uid = 0;

export interface MotionUI {
  /** 今開いている記録（まだ残していない読んだばかりのものも） */
  current(): SkillRecord | null;
}

export interface MotionOptions {
  /** 職人の一言を、帳面の決まりにするとき（仕事の名前・職人・動画の時刻を添えて渡す） */
  onNoteToRule?: (note: { text: string; t: number; clock: string; title: string; craftsman: string }) => void;
  /** 「残す」を押して記録を残したとき（読んだ動画のファイルも渡す。開き直した記録で動画がなければ null） */
  onSaved?: (record: SkillRecord, video: File | null) => void;
}

export function mountMotion(root: HTMLElement, opts: MotionOptions = {}): MotionUI {
  const p = `motion${++uid}`;
  root.classList.add("motion");
  root.innerHTML = `
    <p class="note">手元を撮った動画から手の動きを読み、動きの数字と職人の言葉を「手の記録」として残します。スマホを台に固定し、手首から指先まで入るように 20〜60 秒撮ってください。技そのものは読めません。残るのは動きの数字と、職人が言った判断です。</p>
    <div class="row motion-pick">
      <label class="btn primary" for="${p}-cam">撮る</label><input id="${p}-cam" type="file" accept="video/*" capture="environment">
      <label class="btn" for="${p}-file">動画を選ぶ</label><input id="${p}-file" type="file" accept="video/*">
      <label class="motion-fps">読む細かさ
        <select class="motion-fps-select">
          <option value="15">あらく（速い）</option>
          <option value="24" selected>ふつう</option>
          <option value="30">細かく（時間がかかる）</option>
        </select>
      </label>
    </div>
    <div class="motion-stage" hidden>
      <div class="motion-frame">
        <video class="motion-video" playsinline muted controls preload="auto"></video>
        <canvas class="motion-overlay" aria-hidden="true"></canvas>
      </div>
    </div>
    <div class="motion-progress" hidden>
      <progress class="motion-bar" max="1" value="0"></progress>
      <span class="motion-progress-text"></span>
      <button class="motion-cancel">やめる</button>
    </div>
    <p class="note motion-status" aria-live="polite"></p>
    <div class="row motion-retrack-row" hidden><button class="motion-retrack">手をもう一度読む</button></div>

    <div class="motion-result" hidden>
      <div class="motion-chart" role="img" aria-label="手の速さの時間の線"></div>
      <p class="note motion-legend"></p>
      <ul class="motion-summary"></ul>

      <h3 class="motion-h">職人の言葉（動画の時刻つき）</h3>
      <div class="row motion-note-row">
        <input class="motion-note-input" type="text" placeholder="例：ここで力を抜く" />
        <button class="primary motion-note-add">今の時刻に書く</button>
        <button class="motion-speak" hidden>話して記録</button>
      </div>
      <p class="note motion-note-time"></p>
      <ul class="motion-notes"></ul>

      <div class="controls motion-meta">
        <label>何の仕事か<input class="motion-title" type="text" placeholder="例：鏨で線を彫る" /></label>
        <label>誰の手か<input class="motion-who" type="text" placeholder="例：山田" /></label>
      </div>
      <div class="row motion-save-row">
        <button class="primary motion-save">このブラウザに残す</button>
        <button class="motion-export">書き出す（JSON）</button>
      </div>
    </div>

    <details class="sub motion-saved-box">
      <summary>残した記録 <span class="badge motion-count">0</span></summary>
      <div class="row motion-import-row">
        <label class="btn" for="${p}-json">記録を読み込む（JSON）</label><input id="${p}-json" type="file" accept="application/json,.json">
      </div>
      <ul class="motion-list"></ul>
    </details>

    <details class="sub motion-compare-box">
      <summary>手本と比べる</summary>
      <div class="controls motion-compare-pick">
        <label>手本<select class="motion-master"></select></label>
        <label>比べる記録<select class="motion-student"></select></label>
      </div>
      <div class="row"><button class="primary motion-compare">比べる</button></div>
      <ul class="motion-compare-out"></ul>
      <p class="note motion-compare-note"></p>
    </details>`;

  const q = <T extends HTMLElement>(cls: string) => root.querySelector<T>(`.${cls}`)!;
  const video = q<HTMLVideoElement>("motion-video");
  const overlay = q<HTMLCanvasElement>("motion-overlay");
  const chart = q<HTMLDivElement>("motion-chart");
  const status = (t: string, error = false) => {
    const el = q("motion-status");
    el.textContent = t;
    el.classList.toggle("error", error);
  };

  let videoUrl: string | null = null;
  let videoName = "";
  /** 骨組みを重ねるためのこま（読んだばかりなら全部、読み込んだ記録なら間引いたもの） */
  let overlayFrames: MotionFrame[] = [];
  let record: SkillRecord | null = null;
  let notes: SkillNote[] = [];
  let cursorT = 0;
  let abort: AbortController | null = null;
  /** 残した記録を開いて、その動画を待っているとき、その動画の名前。動画を読み終えたあとは null（名前が同じでも別の動画として読む） */
  let awaitingVideo: string | null = null;
  /** 今読んでいる動画のファイル（残したとき、呼ぶ側が動画もしまえるように） */
  let videoFile: File | null = null;

  // ---- 動画を選ぶ・読む ----

  function onVideoPicked(file: File | undefined) {
    if (!file) return;
    videoFile = file;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    videoName = file.name || "動画";
    video.src = videoUrl;
    q("motion-stage").hidden = false;
    const sameAsRecord = record !== null && awaitingVideo !== null && awaitingVideo === videoName && overlayFrames.length > 0;
    awaitingVideo = null;
    if (sameAsRecord) {
      status(`記録「${record!.title}」の動画としてつなぎました。骨組みは残した手の点から重ねます。`);
      q("motion-retrack-row").hidden = false;
      return;
    }
    // 別の動画：前の結果は消してから読む（読み終わる前に「残す」を押して、前の記録を上書きしないように）
    record = null;
    notes = [];
    cursorT = 0;
    q("motion-result").hidden = true;
    void runTracking();
  }

  async function runTracking() {
    abort?.abort();
    const ctl = new AbortController();
    abort = ctl;
    const fps = Number(q<HTMLSelectElement>("motion-fps-select").value) || 24;
    q("motion-progress").hidden = false;
    q("motion-retrack-row").hidden = true;
    q<HTMLProgressElement>("motion-bar").value = 0;
    q("motion-progress-text").textContent = "手を読む道具を用意しています（初めては 20 MB ほど読み込みます）…";
    status("");
    const started = performance.now();
    let firstFrameAt = started;
    try {
      const input = await trackVideo(video, {
        fps,
        signal: ctl.signal,
        onProgress: (done, total) => {
          if (done === 1) firstFrameAt = performance.now();
          q<HTMLProgressElement>("motion-bar").value = done / total;
          const left = done > 3 ? Math.round(((performance.now() - firstFrameAt) / (done - 1)) * (total - done) / 1000) : null;
          q("motion-progress-text").textContent = `手を読んでいます ${Math.round((100 * done) / total)}%（${done} / ${total} こま${left !== null ? `・あと約 ${left} 秒` : ""}）`;
        },
      });
      if (ctl.signal.aborted) return;
      const title = q<HTMLInputElement>("motion-title").value;
      const who = q<HTMLInputElement>("motion-who").value;
      record = createRecord(input, { title, craftsman: who, videoName, notes });
      overlayFrames = input.frames;
      const secs = ((performance.now() - started) / 1000).toFixed(0);
      const longNote = (input.durationS ?? 0) > MAX_TRACK_S ? `長い動画なので、初めの ${MAX_TRACK_S} 秒だけ読みました。` : "";
      if (record.metrics.hands.length === 0) {
        status(`手が見つかりませんでした（${input.frames.length} こまを読みました）。手首から指先まで画面に入るように、明るい所で、手が小さくなりすぎないように撮り直してください。${longNote}`, true);
      } else {
        status(`読み終わりました（${input.frames.length} こま・${secs} 秒）。再生すると手の骨組みが重なります。${longNote}`);
      }
      showRecord();
      video.currentTime = 0;
    } catch (e) {
      if ((e as Error).name === "AbortError") status("読むのをやめました。");
      else status(`手を読めませんでした：${(e as Error).message || String(e)}。通信がつながっているか、別のブラウザで試してください。`, true);
    } finally {
      if (abort === ctl) abort = null;
      q("motion-progress").hidden = true;
    }
  }

  root.querySelector<HTMLInputElement>(`#${p}-cam`)!.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    onVideoPicked(input.files?.[0]);
    input.value = "";
  });
  root.querySelector<HTMLInputElement>(`#${p}-file`)!.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    onVideoPicked(input.files?.[0]);
    input.value = "";
  });
  q("motion-cancel").addEventListener("click", () => abort?.abort());
  q("motion-retrack").addEventListener("click", () => void runTracking());

  // ---- 骨組みを重ねる ----

  function frameAt(t: number): MotionFrame | null {
    const f = overlayFrames;
    if (f.length === 0) return null;
    let lo = 0;
    let hi = f.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (f[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    const best = lo > 0 && Math.abs(f[lo - 1].t - t) < Math.abs(f[lo].t - t) ? f[lo - 1] : f[lo];
    return Math.abs(best.t - t) < 0.25 ? best : null;
  }

  /** 画面の左・右の手の色を、数字の「よく動いた手」に合わせる */
  function colorFor(x: number): string {
    const m = record?.metrics;
    if (!m || m.hands.length < 2 || m.mainHand === null) return MAIN_COLOR;
    const mainIsLeft = m.hands[m.mainHand].label === "画面の左の手";
    const isLeft = x < 0.5;
    return isLeft === mainIsLeft ? MAIN_COLOR : OTHER_COLOR;
  }

  function drawOverlay() {
    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (overlay.width !== Math.round(w * dpr)) overlay.width = Math.round(w * dpr);
    if (overlay.height !== Math.round(h * dpr)) overlay.height = Math.round(h * dpr);
    const ctx = overlay.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const f = frameAt(video.currentTime);
    if (!f) return;
    for (const hand of f.hands) {
      const pts = hand.landmarks;
      if (pts.length < 21) continue;
      const cx = (pts[0].x + pts[9].x) / 2;
      const color = colorFor(cx);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.85;
      ctx.lineCap = "round";
      // 白い縁取りの上に色の線（どんな背景でも見えるように）
      for (const pass of [4, 2]) {
        ctx.lineWidth = pass;
        ctx.strokeStyle = pass === 4 ? "#ffffff" : color;
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.moveTo(pts[a].x * w, pts[a].y * h);
          ctx.lineTo(pts[b].x * w, pts[b].y * h);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      for (const pt of pts) {
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  let raf = 0;
  const loop = () => {
    drawOverlay();
    updateCursor(video.currentTime);
    raf = video.paused || video.ended ? 0 : requestAnimationFrame(loop);
  };
  video.addEventListener("play", () => {
    if (!raf) raf = requestAnimationFrame(loop);
  });
  for (const ev of ["seeked", "pause", "loadeddata", "timeupdate"]) {
    video.addEventListener(ev, () => {
      if (abort) return; // 読んでいる間は描かない
      drawOverlay();
      updateCursor(video.currentTime);
    });
  }
  // 枠を動画と同じ縦横の比にして、骨組みの点が動画の上の正しい所に来るようにする
  video.addEventListener("loadedmetadata", () => {
    const frame = q<HTMLDivElement>("motion-frame");
    const a = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    frame.style.aspectRatio = String(a);
    frame.style.maxWidth = `calc(60vh * ${a.toFixed(4)})`;
  });
  new ResizeObserver(() => {
    drawOverlay();
    renderChart();
  }).observe(root);

  // ---- 時間の線（速さ・数えた 1 回・止まった所・職人の言葉） ----

  const CH = 132;
  const PAD = { l: 34, r: 8, t: 14, b: 22 };

  function chartScale() {
    const m = record?.metrics;
    const W = Math.max(240, chart.clientWidth || 320);
    const dur = Math.max(0.1, m?.durationS ?? video.duration ?? 1);
    let vmax = 0.5;
    for (const h of m?.hands ?? []) for (const v of h.timeline.speed) if (v !== null && v > vmax) vmax = v;
    vmax = niceCeil(vmax);
    const x = (t: number) => PAD.l + (Math.max(0, Math.min(dur, t)) / dur) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - v / vmax) * (CH - PAD.t - PAD.b);
    const tOf = (px: number) => ((px - PAD.l) / (W - PAD.l - PAD.r)) * dur;
    return { W, dur, vmax, x, y, tOf };
  }

  function niceCeil(v: number) {
    const e = 10 ** Math.floor(Math.log10(v));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * e >= v) return k * e;
    return 10 * e;
  }

  function linePath(h: HandMetrics, x: (t: number) => number, y: (v: number) => number) {
    let d = "";
    let pen = false;
    h.timeline.speed.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      const t = h.timeline.t0 + (i + 0.5) * h.timeline.dt;
      d += `${pen ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  function renderChart() {
    const m = record?.metrics;
    if (!m) {
      chart.innerHTML = "";
      return;
    }
    const { W, dur, vmax, x, y } = chartScale();
    const main = m.mainHand === null ? null : m.hands[m.mainHand];
    const parts: string[] = [];
    // 目盛り（控えめに）
    for (const v of [0, vmax / 2, vmax]) {
      parts.push(`<line class="motion-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/>`);
      parts.push(`<text class="motion-axis" x="${PAD.l - 4}" y="${y(v) + 3}" text-anchor="end">${+v.toFixed(2)}</text>`);
    }
    const stepT = dur > 40 ? 10 : dur > 15 ? 5 : dur > 6 ? 2 : 1;
    for (let t = 0; t <= dur + 1e-6; t += stepT) {
      const anchor = x(t) > W - PAD.r - 16 ? "end" : "middle";
      parts.push(`<text class="motion-axis" x="${x(t)}" y="${CH - 6}" text-anchor="${anchor}">${t} 秒</text>`);
    }
    // 止まった所・見えない所
    for (const pz of main?.pauses ?? []) {
      parts.push(
        `<rect class="motion-pause ${pz.kind}" x="${x(pz.start)}" y="${PAD.t}" width="${Math.max(1, x(pz.end) - x(pz.start))}" height="${CH - PAD.t - PAD.b}"><title>${pz.kind === "still" ? "止まっていた" : "手が見えない"} ${clock(pz.start)}〜${clock(pz.end)}</title></rect>`,
      );
    }
    // 速さの線（もう一方の手を先に、よく動いた手を上に）
    m.hands.forEach((h, i) => {
      if (i === m.mainHand) return;
      parts.push(`<path d="${linePath(h, x, y)}" fill="none" stroke="${OTHER_COLOR}" stroke-width="1.5" stroke-linejoin="round" opacity="0.8"/>`);
    });
    if (main) parts.push(`<path d="${linePath(main, x, y)}" fill="none" stroke="${MAIN_COLOR}" stroke-width="2" stroke-linejoin="round"/>`);
    // 数えた 1 回（下の縁に短い線）
    for (const s of main?.strokes ?? []) {
      const sx = x(s.t).toFixed(1);
      parts.push(`<line class="motion-tick" x1="${sx}" x2="${sx}" y1="${CH - PAD.b}" y2="${CH - PAD.b - 7}"/>`);
    }
    // 職人の言葉（ピン）
    notes.forEach((n, i) => {
      const nx = x(n.t).toFixed(1);
      parts.push(
        `<g class="motion-pin" data-i="${i}"><line x1="${nx}" x2="${nx}" y1="${PAD.t - 6}" y2="${CH - PAD.b}"/><circle cx="${nx}" cy="${PAD.t - 6}" r="5"/><title>${clock(n.t)} ${esc(n.text)}</title></g>`,
      );
    });
    parts.push(`<line class="motion-cursor" x1="${x(cursorT)}" x2="${x(cursorT)}" y1="${PAD.t}" y2="${CH - PAD.b}"/>`);
    parts.push(`<line class="motion-hover-line" x1="0" x2="0" y1="${PAD.t}" y2="${CH - PAD.b}" visibility="hidden"/>`);
    parts.push(`<rect class="motion-hit" x="${PAD.l}" y="0" width="${W - PAD.l - PAD.r}" height="${CH}" fill="transparent"/>`);
    chart.innerHTML = `<svg width="${W}" height="${CH}" viewBox="0 0 ${W} ${CH}">${parts.join("")}</svg><div class="motion-tip" hidden></div>`;
    const legend: string[] = [];
    if (m.hands.length > 1) {
      m.hands.forEach((h, i) => legend.push(`<span><i style="background:${i === m.mainHand ? MAIN_COLOR : OTHER_COLOR}"></i>${esc(h.label)}${i === m.mainHand ? "（よく動いた手）" : ""}</span>`));
    }
    legend.push("線：手の速さ（手のひらの長さ／秒）", "下の縁の短い線：数えた 1 回", "●：職人の言葉", "灰色：止まった所");
    q("motion-legend").innerHTML = legend.join("　");
  }

  function updateCursor(t: number) {
    cursorT = t;
    const line = chart.querySelector<SVGLineElement>(".motion-cursor");
    if (!line || !record) return;
    const xx = String(chartScale().x(t));
    line.setAttribute("x1", xx);
    line.setAttribute("x2", xx);
    q("motion-note-time").textContent = `書く時刻：${clock(t)}`;
  }

  function seek(t: number) {
    if (videoUrl && Number.isFinite(t)) video.currentTime = Math.max(0, t);
    updateCursor(t);
  }

  chart.addEventListener("click", (e) => {
    const pin = (e.target as Element).closest<SVGGElement>(".motion-pin");
    if (pin) {
      seek(notes[Number(pin.dataset.i)]?.t ?? 0);
      return;
    }
    const svg = chart.querySelector("svg");
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    seek(chartScale().tOf(e.clientX - r.left));
  });
  chart.addEventListener("pointermove", (e) => {
    const svg = chart.querySelector("svg");
    const tip = chart.querySelector<HTMLDivElement>(".motion-tip");
    const hl = chart.querySelector<SVGLineElement>(".motion-hover-line");
    const m = record?.metrics;
    if (!svg || !tip || !hl || !m) return;
    const r = svg.getBoundingClientRect();
    const px = e.clientX - r.left;
    const sc = chartScale();
    if (px < PAD.l || px > sc.W - PAD.r) {
      tip.hidden = true;
      hl.setAttribute("visibility", "hidden");
      return;
    }
    const t = sc.tOf(px);
    const rows = m.hands.map((h, i) => {
      const k = Math.floor((t - h.timeline.t0) / h.timeline.dt);
      const v = h.timeline.speed[k];
      const name = m.hands.length > 1 ? h.label : "速さ";
      return `<div><i style="background:${i === m.mainHand ? MAIN_COLOR : OTHER_COLOR}"></i>${esc(name)} <b>${v === null || v === undefined ? "見えない" : v.toFixed(1)}</b></div>`;
    });
    tip.innerHTML = `<div class="motion-tip-t">${clock(t)}</div>${rows.join("")}`;
    tip.hidden = false;
    tip.style.left = `${Math.min(px + 10, sc.W - 130)}px`;
    hl.setAttribute("x1", String(px));
    hl.setAttribute("x2", String(px));
    hl.setAttribute("visibility", "visible");
  });
  chart.addEventListener("pointerleave", () => {
    const tip = chart.querySelector<HTMLDivElement>(".motion-tip");
    if (tip) tip.hidden = true;
    chart.querySelector(".motion-hover-line")?.setAttribute("visibility", "hidden");
  });

  // ---- 数字と言葉 ----

  function renderSummary(m: MotionMetrics) {
    q("motion-summary").innerHTML = summarizeMetrics(m)
      .map((s) => `<li>${esc(s)}</li>`)
      .join("");
  }

  function renderNotes() {
    q("motion-notes").innerHTML = notes
      .map(
        (n, i) =>
          `<li><button class="motion-note-t" data-i="${i}">${clock(n.t)}</button><span>${esc(n.text)}</span>${
            opts.onNoteToRule ? `<button class="motion-note-rule" data-i="${i}">帳面の決まりにする</button>` : ""
          }<button class="motion-note-del" data-i="${i}" aria-label="この言葉を消す">×</button></li>`,
      )
      .join("");
    root.querySelectorAll<HTMLButtonElement>(".motion-note-t").forEach((b) => b.addEventListener("click", () => seek(notes[Number(b.dataset.i)].t)));
    root.querySelectorAll<HTMLButtonElement>(".motion-note-rule").forEach((b) =>
      b.addEventListener("click", () => {
        const n = notes[Number(b.dataset.i)];
        if (!n) return;
        opts.onNoteToRule?.({
          text: n.text,
          t: n.t,
          clock: clock(n.t),
          title: q<HTMLInputElement>("motion-title").value.trim(),
          craftsman: q<HTMLInputElement>("motion-who").value.trim(),
        });
      }),
    );
    root.querySelectorAll<HTMLButtonElement>(".motion-note-del").forEach((b) =>
      b.addEventListener("click", () => {
        notes = notes.filter((_, i) => i !== Number(b.dataset.i));
        renderNotes();
        renderChart();
      }),
    );
  }

  function addNoteAt(t: number, text: string) {
    const s = text.trim();
    if (!s) return;
    notes = [...notes, { t: Math.round(Math.max(0, t) * 1000) / 1000, text: s }].sort((a, b) => a.t - b.t);
    renderNotes();
    renderChart();
  }

  q("motion-note-add").addEventListener("click", () => {
    const input = q<HTMLInputElement>("motion-note-input");
    addNoteAt(videoUrl ? video.currentTime : cursorT, input.value);
    input.value = "";
  });
  q<HTMLInputElement>("motion-note-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) q("motion-note-add").click();
  });

  // 話して記録（ブラウザが日本語の音声の聞き取りを持っているときだけ）
  const w = window as unknown as { webkitSpeechRecognition?: SpeechCtor; SpeechRecognition?: SpeechCtor };
  const Speech = w.webkitSpeechRecognition ?? w.SpeechRecognition;
  if (Speech) {
    const btn = q<HTMLButtonElement>("motion-speak");
    btn.hidden = false;
    let rec: SpeechRecognizer | null = null;
    btn.addEventListener("click", () => {
      if (rec) {
        rec.stop();
        return;
      }
      const t = videoUrl ? video.currentTime : cursorT;
      rec = new Speech();
      rec.lang = "ja-JP";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      btn.textContent = "聞いています…（押すと止める）";
      btn.setAttribute("aria-pressed", "true");
      rec.onresult = (e) => {
        const text = Array.from(e.results)
          .map((r) => r[0]?.transcript ?? "")
          .join("");
        addNoteAt(t, text);
      };
      rec.onerror = (e) => status(e.error === "not-allowed" ? "マイクが使えません。書いて残してください。" : "聞き取れませんでした。書いて残せます。", true);
      rec.onend = () => {
        rec = null;
        btn.textContent = "話して記録";
        btn.setAttribute("aria-pressed", "false");
      };
      try {
        rec.start();
      } catch {
        rec = null;
        btn.textContent = "話して記録";
      }
    });
  }

  function currentRecord(): SkillRecord | null {
    if (!record) return null;
    const title = q<HTMLInputElement>("motion-title").value.trim() || record.title;
    const craftsman = q<HTMLInputElement>("motion-who").value.trim();
    return { ...record, title, craftsman, notes };
  }

  function showRecord() {
    if (!record) return;
    q("motion-result").hidden = false;
    renderSummary(record.metrics);
    renderNotes();
    renderChart();
    updateCursor(cursorT);
  }

  // ---- 残す・書き出す・読み込む ----

  q("motion-save").addEventListener("click", () => {
    const r = currentRecord();
    if (!r) return;
    record = r;
    if (storeRecord(r)) status(`「${r.title}」をこのブラウザに残しました。`);
    else status("このブラウザにはもう入りません。書き出す（JSON）で残してください。", true);
    renderSaved();
    opts.onSaved?.(r, videoFile && videoFile.name === r.videoName ? videoFile : null);
  });

  q("motion-export").addEventListener("click", () => {
    const r = currentRecord();
    if (!r) return;
    const blob = new Blob([exportRecord(r)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `手の記録_${r.title}_${r.date}.json`.replace(/[\\/:*?"<>|\s]+/g, "_");
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  function openRecord(r: SkillRecord) {
    abort?.abort();
    record = r;
    notes = r.notes.slice();
    overlayFrames = inputFromSampled(r.landmarksSampled, r.durationS).frames;
    q<HTMLInputElement>("motion-title").value = r.title;
    q<HTMLInputElement>("motion-who").value = r.craftsman;
    cursorT = 0;
    awaitingVideo = r.videoName || null;
    if (videoUrl && videoName === r.videoName) {
      q("motion-retrack-row").hidden = false;
    } else {
      video.removeAttribute("src");
      video.load();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      videoUrl = null;
      q("motion-stage").hidden = true;
    }
    status(`「${r.title}」を開きました。${r.videoName ? `動画（${r.videoName}）を選ぶと、骨組みを重ねて見られます。` : ""}`);
    showRecord();
  }

  root.querySelector<HTMLInputElement>(`#${p}-json`)!.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      openRecord(importRecord(await file.text()));
    } catch (err) {
      status(err instanceof RecordFormatError ? `読み込めませんでした：${err.message}` : "読み込めませんでした。", true);
    }
  });

  function renderSaved() {
    const idx = loadIndex();
    q("motion-count").textContent = String(idx.length);
    q("motion-list").innerHTML = idx.length
      ? idx
          .map(
            (it) =>
              `<li class="motion-item"><b>${esc(it.title)}</b><span class="note">${esc(it.craftsman || "名前なし")}・${esc(it.date)}・${Math.round(it.durationS)} 秒${
                it.tempoPerMin !== null ? `・1 分あたり ${Math.round(it.tempoPerMin)} 回` : ""
              }</span><span class="row"><button class="motion-open" data-id="${esc(it.id)}">開く</button><button class="motion-del" data-id="${esc(it.id)}">消す</button></span></li>`,
          )
          .join("")
      : `<li class="note">まだありません。動画を読んで「このブラウザに残す」を押すと、ここに並びます。</li>`;
    root.querySelectorAll<HTMLButtonElement>(".motion-open").forEach((b) =>
      b.addEventListener("click", () => {
        const r = loadSaved(b.dataset.id!);
        if (r) openRecord(r);
        else status("その記録は読めませんでした。", true);
      }),
    );
    root.querySelectorAll<HTMLButtonElement>(".motion-del").forEach((b) =>
      b.addEventListener("click", () => {
        if (!confirm("この記録を消しますか？（書き出した JSON は残ります）")) return;
        deleteRecord(b.dataset.id!);
        renderSaved();
      }),
    );
    const opts = idx.map((it) => `<option value="${esc(it.id)}">${esc(it.title)}（${esc(it.craftsman || "名前なし")}・${esc(it.date)}）</option>`).join("");
    const ms = q<HTMLSelectElement>("motion-master");
    const ss = q<HTMLSelectElement>("motion-student");
    const keepM = ms.value;
    const keepS = ss.value;
    ms.innerHTML = opts;
    ss.innerHTML = opts;
    if (idx.some((x) => x.id === keepM)) ms.value = keepM;
    if (idx.some((x) => x.id === keepS)) ss.value = keepS;
    else ss.selectedIndex = ms.selectedIndex === 0 ? Math.min(1, idx.length - 1) : 0;
    q<HTMLButtonElement>("motion-compare").disabled = idx.length < 2;
    q("motion-compare-note").textContent = idx.length < 2 ? "記録を 2 つ以上残すと比べられます（職人の記録を手本に）。" : "";
  }

  q("motion-compare").addEventListener("click", () => {
    const a = loadSaved(q<HTMLSelectElement>("motion-master").value);
    const b = loadSaved(q<HTMLSelectElement>("motion-student").value);
    if (!a || !b) return;
    const c = compareRecords(a, b);
    const hands =
      c.masterHand && c.studentHand && (a.metrics.hands.length > 1 || b.metrics.hands.length > 1)
        ? `<li class="note">比べた手：手本は${esc(c.masterHand)}、比べる記録は${esc(c.studentHand)}（それぞれよく動いた手）</li>`
        : "";
    q("motion-compare-out").innerHTML = hands + c.items.map((it) => `<li><b>${esc(it.label)}</b><span>${esc(it.text)}</span></li>`).join("");
    const fpsNote =
      Math.abs(a.metrics.fps - b.metrics.fps) > 1 ? "読む細かさが違う記録です。振れ幅と速さは、同じ細かさで読んだほうが比べやすくなります。" : "";
    q("motion-compare-note").textContent = [...c.cautions, fpsNote].filter(Boolean).join(" ");
  });

  renderSaved();
  return { current: currentRecord };
}
