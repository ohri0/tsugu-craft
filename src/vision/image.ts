// 画素の並び。ブラウザの ImageData と同じ形なので、そのまま渡せる。

export interface RGBAImage {
  width: number;
  height: number;
  /** RGBA の順に 1 画素 4 バイト */
  data: Uint8ClampedArray;
}

/** 整数の倍率で縮める（ブロックの平均） */
export function downscale(img: RGBAImage, factor: number): RGBAImage {
  if (factor <= 1) return img;
  const w = Math.floor(img.width / factor);
  const h = Math.floor(img.height / factor);
  const out = new Uint8ClampedArray(w * h * 4);
  const n = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < factor; dy++) {
        let i = ((y * factor + dy) * img.width + x * factor) * 4;
        for (let dx = 0; dx < factor; dx++, i += 4) {
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}
