// 見本を作るときだけ使う、暗い手元の動画から手の点を読む処理（ブラウザの中で動く。scripts/make-mihon.ts が Vite 経由で読み込む）。
// アプリと同じ手の点のモデル（src/craft/hand-tracker.ts の HAND_MODEL_URL）を使う。
//
// 作者の手元は暗い所で撮っていて、手も画面の端で切れている。アプリのふだんの読み方（そのままの明るさ・確からしさ 0.5）では、
// 1 こまも手が見つからなかった。そこで、1 こまずつ
//   - 明るくした写しを、0°・90°・180°・270° に回して読み（回すと見つかる手がある）、
//   - 確からしさ 0.1 まで拾い、
//   - 同じ所に重なった手は、いちばん確かなもの 1 つにまとめる。
// 回した写しで読んだ点は、元の向きの座標に戻す。だから読んだ点は、見せる動画の上にそのまま重なる。
import { HandLandmarker } from "@mediapipe/tasks-vision";
import wasmBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import wasmLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import { HAND_MODEL_URL } from "../src/craft/hand-tracker";
import type { MotionFrame, MotionInput } from "../src/craft/motion";

export interface ReadOptions {
  fps: number;
  minConfidence: number;
  /** 読む前に写しへかける明るさ（canvas の filter） */
  filters: string[];
  /** 回す角度（度） */
  rotations: number[];
  /** 同じ手とみなす、手のひらの中心どうしの近さ（画面の高さに対して） */
  sameHandDist: number;
}

const once = (el: HTMLElement, ev: string) => new Promise<void>((r) => el.addEventListener(ev, () => r(), { once: true }));

export async function readHands(url: string, o: ReadOptions): Promise<MotionInput> {
  const lm = await HandLandmarker.createFromOptions(
    { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl },
    {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "CPU" },
      runningMode: "IMAGE",
      numHands: 2,
      minHandDetectionConfidence: o.minConfidence,
      minHandPresenceConfidence: o.minConfidence,
    },
  );
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.src = url;
  document.body.append(v);
  await once(v, "loadeddata");
  const W = v.videoWidth;
  const H = v.videoHeight;
  const aspect = W / H;
  const frames: MotionFrame[] = [];
  const n = Math.floor(v.duration * o.fps);
  for (let i = 0; i < n; i++) {
    const t = i / o.fps;
    const seeked = once(v, "seeked");
    v.currentTime = t;
    await seeked;
    const found: { score: number; cx: number; cy: number; pts: { x: number; y: number }[]; side?: string }[] = [];
    for (const filter of o.filters) {
      for (const rot of o.rotations) {
        const c = document.createElement("canvas");
        const turned = rot % 180 !== 0;
        c.width = turned ? H : W;
        c.height = turned ? W : H;
        const g = c.getContext("2d")!;
        g.filter = filter;
        g.translate(c.width / 2, c.height / 2);
        g.rotate((rot * Math.PI) / 180);
        g.drawImage(v, -W / 2, -H / 2, W, H);
        const r = lm.detect(c);
        const a = (-rot * Math.PI) / 180;
        const back = (x: number, y: number) => {
          const px = x * c.width - c.width / 2;
          const py = y * c.height - c.height / 2;
          return { x: (px * Math.cos(a) - py * Math.sin(a) + W / 2) / W, y: (px * Math.sin(a) + py * Math.cos(a) + H / 2) / H };
        };
        r.landmarks.forEach((p, j) => {
          const pts = p.map((q) => back(q.x, q.y));
          const P = [0, 5, 9, 13, 17];
          const cx = P.reduce((s, k) => s + pts[k].x, 0) / P.length;
          const cy = P.reduce((s, k) => s + pts[k].y, 0) / P.length;
          found.push({ score: r.handedness[j]?.[0]?.score ?? 0, cx, cy, pts, side: r.handedness[j]?.[0]?.categoryName });
        });
      }
    }
    const kept: typeof found = [];
    for (const f of found.sort((p, q) => q.score - p.score)) {
      if (kept.length >= 2) break;
      if (kept.some((k) => Math.hypot((k.cx - f.cx) * aspect, k.cy - f.cy) < o.sameHandDist)) continue;
      kept.push(f);
    }
    frames.push({ t, hands: kept.map((k) => ({ landmarks: k.pts, handedness: k.side, score: k.score })) });
  }
  v.remove();
  lm.close();
  return { frames, aspect, durationS: v.duration };
}
