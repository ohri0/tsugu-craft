// 学ぶ人の動画から、ヤスリの線をこまごとに探す（ブラウザの中で。2026-11-07）。
// 見本の動画で使った探し方（src/craft/tool-line.ts）と同じ。動画を 10 こま／秒で止めては、長い辺 480 px に縮めて明るさだけにして探す。
import { findToolLine, type ToolLine } from "../craft/tool-line";
import { seek } from "./draw";

// 長い辺は見本と同じ 480 px（探し方の線の値 TOOL_LINE は、この大きさで決めた）
export const TOOL_TRACK = { fps: 10, long: 480 } as const;

export async function toolLinesFromVideo(video: HTMLVideoElement, onProgress?: (done: number, total: number) => void): Promise<{ fps: number; lines: (ToolLine | null)[] }> {
  if (video.readyState < 2) await new Promise((r) => video.addEventListener("loadeddata", r, { once: true }));
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const k = TOOL_TRACK.long / Math.max(vw, vh);
  const w = Math.max(16, Math.round(vw * k));
  const h = Math.max(16, Math.round(vh * k));
  const cv = document.createElement("canvas");
  Object.assign(cv, { width: w, height: h });
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  // 縮めるときの なめらかさを高く（ffmpeg で縮めた見本の動画と、縁の見え方をそろえる）
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const n = Math.floor((video.duration || 0) * TOOL_TRACK.fps);
  const gray = new Uint8Array(w * h);
  const lines: (ToolLine | null)[] = [];
  for (let i = 0; i < n; i++) {
    await seek(video, i / TOOL_TRACK.fps);
    ctx.drawImage(video, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    for (let p = 0; p < w * h; p++) gray[p] = (px[4 * p] * 77 + px[4 * p + 1] * 150 + px[4 * p + 2] * 29) >> 8;
    lines.push(findToolLine(gray, w, h));
    onProgress?.(i + 1, n);
  }
  return { fps: TOOL_TRACK.fps, lines };
}
