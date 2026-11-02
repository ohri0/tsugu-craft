// 組み立てた工程を、模型で動かして見せる（重ねる → 彫る → 平らにする）。上から見た表と、真ん中で切った断面。
import { DEFAULT_SIM, carveDepth, colorsShown, layerAt, layerColor, makePits, patternAmount, topView, type SimParams, type SimStage } from "../rebuild/sim";

const STAGES: { id: SimStage; label: string; note: string }[] = [
  { id: "stack", label: "1 重ねる", note: "色のちがう金属の板を重ねて、つないだところ。表には一番上の層しか見えない。" },
  { id: "carve", label: "2 彫る", note: "表から丸いくぼみを彫ったところ。くぼみの底に、下の層がのぞく。" },
  { id: "flat", label: "3 平らにする", note: "叩いて平らにしたところ。くぼみのまわりに層が輪になって出る。" },
];

function hex(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mountSim(root: HTMLElement): void {
  let p: SimParams = { ...DEFAULT_SIM };
  let stage: SimStage = "flat";
  root.innerHTML = `
  <div class="sim">
    <div class="sim-head"><h3>工程を動かして、模様が出るか確かめる</h3><p class="small">ほんとうの金属の変形は計算しない、形の考え方だけの模型です。</p></div>
    <div class="sim-stages" role="tablist">${STAGES.map((s) => `<button type="button" role="tab" data-s="${s.id}">${s.label}</button>`).join("")}</div>
    <div class="sim-view"><canvas class="sim-top" width="360" height="360"></canvas><canvas class="sim-cut" width="360" height="70"></canvas></div>
    <p class="sim-note"></p>
    <div class="sim-ctrl">
      <label>層の数 <input type="range" min="2" max="30" step="1" data-k="layers"><output></output></label>
      <label>彫る深さ <input type="range" min="0" max="0.95" step="0.05" data-k="depth"><output></output></label>
      <label>くぼみの数 <input type="range" min="0" max="24" step="1" data-k="pits"><output></output></label>
      <div class="row"><button type="button" class="ghost tiny one-color">層を 1 色にする</button><button type="button" class="ghost tiny reseed">彫る場所を変える</button><button type="button" class="primary tiny play-sim">順に見る</button></div>
    </div>
    <p class="sim-check small"></p>
  </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const top = $<HTMLCanvasElement>(".sim-top");
  const cut = $<HTMLCanvasElement>(".sim-cut");

  function draw() {
    const n = 260;
    const view = topView(p, n, stage);
    const ctx = top.getContext("2d")!;
    const img = ctx.createImageData(n, n);
    const pits = makePits(p);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = view[j * n + i];
        let [r, g, b] = hex(layerColor(k, p));
        if (stage === "carve") {
          // くぼみは影をつけて、彫ったことが分かるように
          const d = carveDepth(pits, (i + 0.5) / n, (j + 0.5) / n);
          const s = 1 - Math.min(0.45, d * 0.6);
          r *= s;
          g *= s;
          b *= s;
        }
        const o = 4 * (j * n + i);
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    const tmp = document.createElement("canvas");
    Object.assign(tmp, { width: n, height: n });
    tmp.getContext("2d")!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, top.width, top.height);
    // 断面の線
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, top.height / 2);
    ctx.lineTo(top.width, top.height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 断面：真ん中の線で切った横から見た層
    const c = cut.getContext("2d")!;
    const W = cut.width;
    const H = cut.height;
    c.fillStyle = "#f4f0e6";
    c.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x++) {
      const d = stage === "stack" ? 0 : carveDepth(pits, (x + 0.5) / W, 0.5);
      for (let y = 0; y < H; y++) {
        const z = y / H;
        // 平らにしたあとは、彫った深さの分だけ層が上に寄って見える（表は平ら）
        const zz = stage === "flat" ? Math.min(0.999, z * (1 - d) + d) : z;
        if (stage === "carve" && z < d) continue;
        c.fillStyle = layerColor(layerAt(zz, p.layers), p);
        c.fillRect(x, y, 1, 1);
      }
    }

    root.querySelectorAll<HTMLButtonElement>(".sim-stages button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.s === stage)));
    $(".sim-note").textContent = STAGES.find((s) => s.id === stage)!.note;
    const flat = topView(p, 90, "flat");
    const amount = patternAmount(flat, 90);
    const colors = colorsShown(flat, p);
    $(".sim-check").textContent =
      colors <= 1 || amount < 0.01
        ? "この条件では、平らにしても模様は出ません。"
        : `平らにすると、${colors} 色の層が表に出て、輪の模様になります。`;
    root.querySelectorAll<HTMLInputElement>(".sim-ctrl input").forEach((inp) => {
      const k = inp.dataset.k as "layers" | "depth" | "pits";
      inp.value = String(p[k]);
      inp.nextElementSibling!.textContent = k === "depth" ? `${Math.round(p.depth * 100)}%` : String(p[k]);
    });
    $(".one-color").textContent = p.palette.length === 1 ? "層の色を元に戻す" : "層を 1 色にする";
  }

  root.querySelectorAll<HTMLButtonElement>(".sim-stages button").forEach((b) =>
    b.addEventListener("click", () => {
      stage = b.dataset.s as SimStage;
      draw();
    }),
  );
  root.querySelectorAll<HTMLInputElement>(".sim-ctrl input").forEach((inp) =>
    inp.addEventListener("input", () => {
      p = { ...p, [inp.dataset.k!]: Number(inp.value) };
      draw();
    }),
  );
  $(".one-color").addEventListener("click", () => {
    p = { ...p, palette: p.palette.length === 1 ? DEFAULT_SIM.palette : [DEFAULT_SIM.palette[0]] };
    draw();
  });
  $(".reseed").addEventListener("click", () => {
    p = { ...p, seed: p.seed + 1 };
    draw();
  });
  $(".play-sim").addEventListener("click", () => {
    let i = 0;
    const next = () => {
      stage = STAGES[i].id;
      draw();
      if (++i < STAGES.length) setTimeout(next, 1300);
    };
    next();
  });
  draw();
}
