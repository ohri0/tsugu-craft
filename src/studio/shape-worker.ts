// 別の糸（Web Worker）の中身：一体の石座の重い所（buildSolid）を作って返す。
// 画面の糸は、届いた重い所を使って同じ設計を組む（session.ts の shapeFromSolids）。形を作る処理は画面の糸と同じ関数。
import { solidsForJob, type ShapeJob } from "./session";

interface Ask {
  id: number;
  job: ShapeJob;
}

const scope = self as unknown as { onmessage: ((e: MessageEvent<Ask>) => void) | null; postMessage: (m: unknown, transfer?: Transferable[]) => void };

scope.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    const got = solidsForJob(job);
    // 配列は写さずに渡す（大きいので）
    scope.postMessage({ id, got }, buffersIn(got.list));
  } catch (err) {
    scope.postMessage({ id, error: String(err) });
  }
};

/** 中の型つき配列の ArrayBuffer（同じ物は 1 回） */
function buffersIn(v: unknown, out = new Set<ArrayBuffer>()): ArrayBuffer[] {
  if (ArrayBuffer.isView(v)) {
    if (v.buffer instanceof ArrayBuffer) out.add(v.buffer);
  } else if (v instanceof Map) for (const x of v.values()) buffersIn(x, out);
  else if (Array.isArray(v)) for (const x of v) buffersIn(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) buffersIn(x, out);
  return [...out];
}
