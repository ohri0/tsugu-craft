// 手の骨組みと、手のひらの中心の通った跡（ふらつき）を描く。
import { HAND_CONNECTIONS } from "../craft/motion";
import type { PoseFrame, PoseTrack } from "../craft/pose";

/** 動画の今のこまを、骨組みと跡つきで canvas に描く（w × h の大きさで） */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  w: number,
  h: number,
  opts: { pose?: PoseFrame | null; trail?: PoseFrame[]; color: string; trailColor?: string },
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(video, 0, 0, w, h);
  const { pose, trail, color } = opts;
  if (trail && trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = opts.trailColor ?? color;
    ctx.lineWidth = Math.max(2, w / 160);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    trail.forEach((p, i) => (i ? ctx.lineTo(p.cx * w, p.cy * h) : ctx.moveTo(p.cx * w, p.cy * h)));
    ctx.stroke();
    ctx.restore();
  }
  if (pose) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.5, w / 260);
    ctx.globalAlpha = 0.9;
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(pose.pts[2 * a] * w, pose.pts[2 * a + 1] * h);
      ctx.lineTo(pose.pts[2 * b] * w, pose.pts[2 * b + 1] * h);
      ctx.stroke();
    }
    for (let i = 0; i < 21; i++) {
      ctx.beginPath();
      ctx.arc(pose.pts[2 * i] * w, pose.pts[2 * i + 1] * h, Math.max(2, w / 220), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** 時刻 t にいちばん近いこまの手（なければ null） */
export function poseAt(tr: PoseTrack, t: number): PoseFrame | null {
  let best = -1;
  let bd = Infinity;
  tr.times.forEach((tt, i) => {
    const d = Math.abs(tt - t);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best >= 0 && bd < 0.25 ? tr.frames[best] : null;
}

/** t の前後 halfS 秒の、手のひらの中心の跡 */
export function trailAround(tr: PoseTrack, t: number, halfS = 1): PoseFrame[] {
  return tr.frames.filter((f, i): f is PoseFrame => !!f && Math.abs(tr.times[i] - t) <= halfS);
}

/** 動画を t 秒に合わせる（合ったら返す） */
export function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 0.01 && video.readyState >= 2) return resolve();
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = t;
    setTimeout(done, 1500);
  });
}
