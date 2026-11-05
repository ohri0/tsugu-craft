// 形の配列を GPU へ送る見張り（src/ui/gl-upload.ts）。Mac の Safari 26.5.2 の不具合を、偽物の GL でまねて確かめる。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GL_PIECE_BYTES, guardBufferUploads, type UploadGl } from "../src/ui/gl-upload";

const MIB = 1024 * 1024;
const T = 34962; // ARRAY_BUFFER
const U = 35044; // STATIC_DRAW

type Source = ArrayBufferView | ArrayBuffer;
const raw = (src: Source, srcOffset = 0, length = 0) => {
  if (!ArrayBuffer.isView(src)) return new Uint8Array(src);
  const unit = (src as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
  return new Uint8Array(src.buffer, src.byteOffset + srcOffset * unit, length ? length * unit : src.byteLength - srcOffset * unit);
};

/**
 * 偽物の GL。wrap ＝ 1 度の送りで、この大きさから先に、送る配列の始まりを繰り返して入れる（Safari 26.5.2 は 1 MiB）。
 * drop ＝ 送った物を入れない（直しようのない壊れ方）
 */
function fakeGl(opts: { wrap?: number; drop?: boolean; lost?: boolean } = {}) {
  let store = new Uint8Array(0);
  const wrap = opts.wrap ?? Infinity;
  const sent: number[] = [];
  const put = (at: number, b: Uint8Array) => {
    sent.push(b.length);
    if (opts.drop) return;
    for (let i = 0; i < b.length; i++) store[at + i] = b[i % wrap];
  };
  const gl = {
    bufferData(_t: number, src: Source | number | null, _u: number, srcOffset?: number, length?: number) {
      if (src === null || typeof src === "number") {
        store = new Uint8Array(src ?? 0);
        return;
      }
      const b = raw(src, srcOffset, length);
      store = new Uint8Array(b.length);
      put(0, b);
    },
    bufferSubData(_t: number, at: number, src: Source, srcOffset?: number, length?: number) {
      put(at, raw(src, srcOffset, length));
    },
    getBufferSubData(_t: number, at: number, dst: Uint8Array, dstOffset = 0, length = dst.length) {
      dst.set(store.subarray(at, at + length), dstOffset);
    },
    isContextLost: () => !!opts.lost,
  };
  return { gl: gl as unknown as UploadGl, store: () => store, sent };
}

/** 中身が場所ごとに違う配列（頂点の x・y・z に、ずれが分かるよう連番を入れる） */
function numbered(bytes: number): Float32Array {
  const a = new Float32Array(Math.floor(bytes / 4));
  for (let i = 0; i < a.length; i++) a[i] = i;
  return a;
}
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe("大きな配列を GPU へ送る", () => {
  it("Safari のまね：見張りなしだと 1 MiB の所から配列の始まりに戻る（頂点の組が 1 つずれる）", () => {
    const f = fakeGl({ wrap: MIB });
    const a = numbered(4.2 * MIB);
    f.gl.bufferData(T, a, U);
    const back = new Float32Array(f.store().buffer);
    expect(back[MIB / 4 - 1]).toBe(MIB / 4 - 1);
    expect(back[MIB / 4]).toBe(0);
    // 1 MiB は 12 で割り切れないので、次の頂点は x の場所に古い z が来る
    const v = Math.floor(MIB / 12);
    expect([back[v * 3], back[v * 3 + 1], back[v * 3 + 2]]).toEqual([v * 3, 0, 1]);
  });

  it("見張りがあれば、Safari のまねでも全部正しく届き、1 度に送る大きさは上限より小さい", () => {
    for (const mib of [1.01, 2, 4.2, 11, 32]) {
      const f = fakeGl({ wrap: MIB });
      let bad = 0;
      guardBufferUploads(f.gl, () => bad++);
      const a = numbered(mib * MIB);
      f.gl.bufferData(T, a, U);
      expect(same(f.store(), raw(a))).toBe(true);
      expect(Math.max(...f.sent)).toBeLessThanOrEqual(GL_PIECE_BYTES);
      expect(bad).toBe(0);
    }
  });

  it("もっと小さな所で折り返す GL でも、小さくして送り直す", () => {
    const f = fakeGl({ wrap: 100 * 1024 });
    let bad = 0;
    guardBufferUploads(f.gl, () => bad++);
    const a = numbered(2 * MIB);
    f.gl.bufferData(T, a, U);
    expect(same(f.store(), raw(a))).toBe(true);
    expect(bad).toBe(0);
  });

  it("どうしても届かなければ知らせる（止まらない）", () => {
    const f = fakeGl({ drop: true });
    let bad = 0;
    guardBufferUploads(f.gl, () => bad++);
    f.gl.bufferData(T, numbered(2 * MIB), U);
    expect(bad).toBe(1);
  });

  it("描く場所がなくなっている間（context lost）は、届かなくても知らせない", () => {
    const f = fakeGl({ drop: true, lost: true });
    let bad = 0;
    guardBufferUploads(f.gl, () => bad++);
    f.gl.bufferData(T, numbered(2 * MIB), U);
    expect(bad).toBe(0);
  });

  it("小さな配列・大きさだけ・null は、そのまま渡す", () => {
    const f = fakeGl({ wrap: MIB });
    guardBufferUploads(f.gl);
    const a = numbered(GL_PIECE_BYTES);
    f.gl.bufferData(T, a, U);
    expect(f.sent).toEqual([GL_PIECE_BYTES]);
    expect(same(f.store(), raw(a))).toBe(true);
    f.gl.bufferData(T, 16, U);
    expect(f.store().length).toBe(16);
    f.gl.bufferData(T, null as unknown as ArrayBuffer, U);
    expect(f.store().length).toBe(0);
  });

  it("要素の途中から・ArrayBuffer・DataView でも、WebGL の数え方のとおりに送る", () => {
    const a = numbered(3 * MIB);
    const from = 1000;
    const count = (2 * MIB) / 4;
    const f = fakeGl({ wrap: MIB });
    guardBufferUploads(f.gl);
    f.gl.bufferData(T, a, U, from, count);
    expect(same(f.store(), raw(a, from, count))).toBe(true);

    const g = fakeGl({ wrap: MIB });
    guardBufferUploads(g.gl);
    g.gl.bufferData(T, a.buffer, U);
    expect(same(g.store(), raw(a))).toBe(true);

    const h = fakeGl({ wrap: MIB });
    guardBufferUploads(h.gl);
    h.gl.bufferData(T, new DataView(a.buffer), U);
    expect(same(h.store(), raw(a))).toBe(true);
  });

  it("bufferSubData も分けて送る（three.js が配列を書き直すとき）", () => {
    const f = fakeGl({ wrap: MIB });
    let bad = 0;
    guardBufferUploads(f.gl, () => bad++);
    const a = numbered(3 * MIB);
    f.gl.bufferData(T, a.byteLength + 8, U);
    f.gl.bufferSubData(T, 8, a);
    expect(same(f.store().subarray(8), raw(a))).toBe(true);
    expect(Math.max(...f.sent)).toBeLessThanOrEqual(GL_PIECE_BYTES);
    // 小さな書き直し（要素の途中から）
    const small = numbered(1024);
    f.gl.bufferSubData(T, 16, small, 4, 8);
    expect(same(f.store().subarray(16, 16 + 32), raw(small, 4, 8))).toBe(true);
    expect(bad).toBe(0);
  });
});

describe("3D を描く所", () => {
  /** src の下の .ts ファイル全部 */
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
    });

  it("three.js の描き手を作る所は、どこも見張りをつけている（つけ忘れると Mac の Safari で形が崩れる）", () => {
    const src = join(__dirname, "..", "src");
    const users = files(src).filter((p) => readFileSync(p, "utf8").includes("new THREE.WebGLRenderer"));
    expect(users.length).toBeGreaterThan(0);
    for (const p of users) expect(readFileSync(p, "utf8"), p).toContain("guardBufferUploads(");
  });
});
