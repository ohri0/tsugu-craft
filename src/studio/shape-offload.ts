// 一体の石座の重い所を、別の糸（Web Worker）で作る口（session.ts の ShapeOffload）。
// 粗い形と細かい形で 1 つずつ糸を持つ（細かい形を作っている間も、粗い形はすぐ届く）。
// 作っている間に来た頼みは、いちばん新しい 1 つだけ残す（古い設計の形は、作っても session が捨てる）。
// 糸が作れない・読めないときは null を返し、session は前と同じく画面の糸で作る。
import type { ShapeJob, ShapeOffload, ShapeSolids } from "./session";
import type { SolidQuality } from "../geometry/setting";

interface Waiting {
  job: ShapeJob;
  done: (got: ShapeSolids | null) => void;
}

interface Lane {
  worker: Worker | null;
  busy: (Waiting & { id: number }) | null;
  next: Waiting | null;
  broken: boolean;
}

export function shapeOffload(): ShapeOffload | null {
  if (typeof Worker === "undefined") return null;
  let seq = 0;
  const lanes = new Map<SolidQuality, Lane>();
  const fail = (w: Waiting | null) => w && setTimeout(() => w.done(null), 0);
  const breakLane = (lane: Lane) => {
    lane.broken = true;
    lane.worker?.terminate();
    lane.worker = null;
    fail(lane.busy);
    fail(lane.next);
    lane.busy = null;
    lane.next = null;
  };
  const start = (lane: Lane, w: Waiting) => {
    const id = ++seq;
    lane.busy = { ...w, id };
    try {
      lane.worker!.postMessage({ id, job: w.job });
    } catch {
      breakLane(lane);
    }
  };
  const laneOf = (q: SolidQuality): Lane => {
    let lane = lanes.get(q);
    if (lane) return lane;
    lane = { worker: null, busy: null, next: null, broken: false };
    lanes.set(q, lane);
    const l = lane;
    try {
      l.worker = new Worker(new URL("./shape-worker.ts", import.meta.url), { type: "module" });
    } catch {
      l.broken = true;
      return l;
    }
    l.worker.onmessage = (e: MessageEvent<{ id: number; got?: ShapeSolids; error?: string }>) => {
      const cur = l.busy;
      if (!cur || cur.id !== e.data.id) return;
      l.busy = null;
      // 待っている頼みがあれば先に始める（画面の糸が組んでいる間も、別の糸は休まない）
      if (l.next) {
        const n = l.next;
        l.next = null;
        start(l, n);
      }
      cur.done(e.data.got ?? null);
    };
    l.worker.onerror = () => breakLane(l);
    return l;
  };
  return {
    request(q, job, done) {
      const lane = laneOf(q);
      if (lane.broken) return void fail({ job, done });
      if (lane.busy) {
        lane.next = { job, done };
        return;
      }
      start(lane, { job, done });
    },
  };
}
