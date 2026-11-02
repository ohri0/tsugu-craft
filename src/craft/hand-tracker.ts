// 動画から手の点を読む（ブラウザの中だけで動く。MediaPipe の手の点を読むモデル）。
// wasm はパッケージのものを Vite が一緒に配る（?url）。モデルは Google の配布先から読む（リポジトリには入れない）。
// ライブラリは大きいので、手の記録を使うときに初めて読み込む。
import wasmBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import wasmLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import type { MotionFrame, MotionInput } from "./motion";

export const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/** 読むのは最初のこの秒数まで（長い動画で止まらないように） */
export const MAX_TRACK_S = 120;

type Delegate = "GPU" | "CPU";
const landmarkers = new Map<Delegate, Promise<HandLandmarker>>();
/** 速かった方を覚えておく。初めは GPU を試す */
let preferred: Delegate = "GPU";
/** 動画のこまの時刻（ms）は、同じ読み手の中でいつも増えていなければならない。動画を替えても続きから数える */
let lastTimestampMs = 0;
/** GPU で 1 こまにこれより時間がかかるときは、CPU も試して速い方にする（GPU のない端末やヘッドレスのブラウザ） */
const SLOW_MS = 150;

/** 手の点を読む道具を用意する（1 回だけ。2 回目からは同じものを使う） */
export function loadHandLandmarker(delegate: Delegate = preferred): Promise<HandLandmarker> {
  let p = landmarkers.get(delegate);
  if (!p) {
    p = (async () => {
      const { HandLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl };
      const options = (d: Delegate) => ({
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: d },
        runningMode: "VIDEO" as const,
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try {
        return await HandLandmarker.createFromOptions(fileset, options(delegate));
      } catch (e) {
        if (delegate === "CPU") throw e;
        // GPU が使えない端末（古いスマホ・一部のブラウザ）では CPU で
        preferred = "CPU";
        return await loadHandLandmarker("CPU");
      }
    })();
    p.catch(() => landmarkers.delete(delegate)); // 失敗したら、次に押したときにもう一度試す
    landmarkers.set(delegate, p);
  }
  return p;
}

function waitFor(el: HTMLMediaElement, events: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      events.forEach((e) => el.removeEventListener(e, done));
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    events.forEach((e) => el.addEventListener(e, done, { once: true }));
  });
}

/** 動画の長さ。録った直後の動画は長さが分からないことがあるので、いちばん後ろまで飛んで確かめる */
export async function videoDuration(video: HTMLVideoElement): Promise<number> {
  if (video.readyState < 1) await waitFor(video, ["loadedmetadata", "error"], 10000);
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  video.currentTime = 1e7;
  await waitFor(video, ["durationchange", "seeked"], 5000);
  const d = Number.isFinite(video.duration) ? video.duration : video.currentTime;
  video.currentTime = 0;
  await waitFor(video, ["seeked"], 3000);
  return d;
}

async function seekTo(video: HTMLVideoElement, t: number) {
  if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) return;
  const p = waitFor(video, ["seeked"], 4000);
  video.currentTime = t;
  await p;
  if (video.readyState < 2) await waitFor(video, ["canplay", "loadeddata"], 2000);
}

export interface TrackOptions {
  /** 1 秒あたり何こま読むか */
  fps: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** 動画を初めから終わりまで、決まった間隔で止めて手の点を読む（再生の速さに左右されない） */
export async function trackVideo(video: HTMLVideoElement, opts: TrackOptions): Promise<MotionInput> {
  let lm = await loadHandLandmarker();
  let using = preferred;
  const times: number[] = [];
  video.pause();
  const duration = await videoDuration(video);
  const span = Math.min(duration, MAX_TRACK_S);
  const total = Math.max(1, Math.floor(span * opts.fps));
  const frames: MotionFrame[] = [];
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) throw new DOMException("やめました", "AbortError");
    const t = Math.min(i / opts.fps, Math.max(0, duration - 0.01));
    await seekTo(video, t);
    if (!video.videoWidth) continue;
    lastTimestampMs = Math.max(lastTimestampMs + 1, Math.round(performance.now()));
    const startMs = performance.now();
    let r = lm.detectForVideo(video, lastTimestampMs);
    times.push(performance.now() - startMs);
    if (using === "GPU" && times.length === 3 && Math.min(...times) > SLOW_MS) {
      // GPU が遅い：CPU で同じこまを読んでみて、速ければ以後は CPU
      const cpu = await loadHandLandmarker("CPU");
      const c0 = performance.now();
      lastTimestampMs += 1;
      const rc = cpu.detectForVideo(video, lastTimestampMs);
      if (performance.now() - c0 < Math.min(...times)) {
        lm = cpu;
        using = preferred = "CPU";
        r = rc;
      }
    }
    frames.push({
      t,
      hands: r.landmarks.map((points, j) => ({
        landmarks: points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        handedness: r.handedness[j]?.[0]?.categoryName,
        score: r.handedness[j]?.[0]?.score,
      })),
    });
    opts.onProgress?.(i + 1, total);
  }
  const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
  return { frames, aspect, durationS: duration };
}
