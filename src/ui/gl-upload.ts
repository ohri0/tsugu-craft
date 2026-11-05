// 形の配列を GPU へ送るときの見張り。3D の画面に依存しない（テストでは偽物の GL を渡す）。
// Mac の Safari（26.5.2 で実測）は、1 度の bufferData・bufferSubData で 1 MiB より大きい配列を送ると、
// 1 MiB から先に配列の始まりを繰り返して入れる。エラーは出ない。頂点は 3 個の数の組なので、1 MiB（12 で割り切れない）の所で
// 読む組がずれ、x・y・z が入れ替わった形が別の場所に出る。腕の上の石座や太い腕が崩れて見えたのは、これ（docs/LOG.md 2026-11-05）。
// 配列そのものと STL は正しいので、形の数を見ても分からない。小さく分けて送れば、32 MiB まで正しく届く（実測）。

/** 1 度に送る大きさの上限（バイト。折り返す 1 MiB より十分小さく） */
export const GL_PIECE_BYTES = 512 * 1024;
/** 読み返して違っていたら、ここまで小さくして送り直す（バイト） */
const GL_PIECE_MIN = 32 * 1024;
/** 読み返して比べる長さ（バイト） */
const CHECK_BYTES = 64;

/** ここで使う GL の口（本物は WebGL2RenderingContext） */
export type UploadGl = Pick<WebGL2RenderingContext, "bufferData" | "bufferSubData" | "getBufferSubData" | "isContextLost">;

type Source = ArrayBufferView | ArrayBufferLike;

/** 送る配列のバイトの並び（srcOffset・length の数え方は WebGL2 のとおり：要素の数。DataView は 1 バイトずつ） */
function bytesOf(src: Source, srcOffset = 0, length = 0): Uint8Array {
  if (!ArrayBuffer.isView(src)) return new Uint8Array(src);
  const unit = (src as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
  const start = src.byteOffset + srcOffset * unit;
  const size = length ? length * unit : src.byteLength - srcOffset * unit;
  return new Uint8Array(src.buffer, start, size);
}

/** GPU の中身が送った物と同じか（1 かけら目の終わりと、全体の終わりを読み返す。折り返せば、ここが違う） */
function arrived(gl: UploadGl, target: number, at: number, bytes: Uint8Array, piece: number): boolean {
  if (gl.isContextLost()) return true;
  const back = new Uint8Array(CHECK_BYTES);
  for (const end of [Math.min(piece, bytes.length), bytes.length]) {
    const from = Math.max(0, end - CHECK_BYTES);
    gl.getBufferSubData(target, at + from, back, 0, end - from);
    for (let i = from; i < end; i++) if (back[i - from] !== bytes[i]) return false;
  }
  return true;
}

/**
 * この GL の bufferData・bufferSubData を、大きな配列を小さく分けて送り、届いたか確かめる物に替える（three.js はこの 2 つで送る）。
 * 分けても届かなければ onBad で知らせる（絵は崩れるが、止めない）
 */
export function guardBufferUploads(gl: UploadGl, onBad?: () => void): void {
  const data = gl.bufferData.bind(gl) as (target: number, src: Source | number | null, usage: number, srcOffset?: number, length?: number) => void;
  const sub = gl.bufferSubData.bind(gl) as (target: number, at: number, src: Source, srcOffset?: number, length?: number) => void;
  const send = (target: number, at: number, bytes: Uint8Array) => {
    for (let piece = GL_PIECE_BYTES; ; piece >>= 2) {
      for (let o = 0; o < bytes.length; o += piece) sub(target, at + o, bytes.subarray(o, o + piece));
      if (arrived(gl, target, at, bytes, piece)) return;
      if (piece >> 2 < GL_PIECE_MIN) return onBad?.();
    }
  };
  gl.bufferData = ((target: number, src: Source | number | null, usage: number, srcOffset?: number, length?: number) => {
    if (src === null || typeof src === "number") return data(target, src, usage);
    const bytes = bytesOf(src, srcOffset, length);
    if (bytes.length <= GL_PIECE_BYTES) return srcOffset === undefined ? data(target, src, usage) : data(target, src, usage, srcOffset, length);
    data(target, bytes.length, usage);
    send(target, 0, bytes);
  }) as typeof gl.bufferData;
  gl.bufferSubData = ((target: number, at: number, src: Source, srcOffset?: number, length?: number) => {
    const bytes = bytesOf(src, srcOffset, length);
    if (bytes.length <= GL_PIECE_BYTES) return srcOffset === undefined ? sub(target, at, src) : sub(target, at, src, srcOffset, length);
    send(target, at, bytes);
  }) as typeof gl.bufferSubData;
}
