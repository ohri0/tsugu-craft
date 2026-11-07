// 「この手順で作ると、どんな模様になるか」：どの技でも使える、重ねた板の模様の見込み。画面に依存しない純粋な関数。
//
// 木目金の試し（src/rebuild/mokume-pattern.ts）の考え方を、決まった操作の並びに広げた。
// 操作（PatternOp）を作る順に並べ、最後の板の表の点が、はじめに重ねた板のどの層から来たかを、後ろから順にさかのぼる（trace）。
// 表の色＝その層の材料の色。断面＝同じ計算を、横から切った面で。
// 形の考え方だけで追う見込み（仮）。金属の本当の流れ・熱・割れは計算しない。数はどれも仮（src/rebuild/pattern-values.ts）。
//
// 座標：x＝板の幅の向き、y＝板の長さの向き（その時の板の大きさで。重ねたときの幅を 1 とする）、u＝表からの深さ（0＝表、1＝裏）。
import { rng } from "./sim";
import { PATTERN_COLORS, PATTERN_LIMITS, PATTERN_LOOK, PATTERN_METALS, PATTERN_VALUES, type MetalId } from "./pattern-values";
import { eachSpotNear, flowerBump, layerCoordOf, layerEdges, leafBump, spotsFor } from "./pattern-spots";

/** leaves＝葉の形、petals＝5 枚の花びらの形（2026-11-08：葉の鏨で打った所が、丸いくぼみでしか描けなかったため） */
export type CarveShape = "dots" | "pits" | "lines" | "waves" | "leaves" | "petals";
export type BondQuality = "good" | "partial" | "poor";
export type RearrangeMode = "edge_up" | "strips" | "tiles";
export type ColorKind = "none" | "etch" | "patina";

export type PatternOp =
  /** 色のちがう材料を重ねる（metals をくり返して count 枚）。thickness＝材料ごとの厚さの割合（metals と同じ順。無ければ同じ厚さ） */
  | { op: "stack"; metals: MetalId[]; count: number; thickness?: number[] }
  /**
   * 重ねずに、1 つの鋳た塊から始める（stack の代わりに最初に 1 回。2026-11-08）。
   * 塊の中に、混じり物などが結晶の枝（樹枝）のすき間に集まった 3 次元の網目のむらがあるとして描く（metals＝[網目になる材料, 地の材料]）。
   * cells＝塊の幅の中の網目の数（仮）。叩いてのばすと、網目は平たい帯になり、表がそれを切った所が模様になる。
   * 説の形の仮の見込み：網目の本当の形・量・並び方は分かっていない（research/restore/lost-wootz.md）
   */
  | {
      op: "ingot";
      metals: MetalId[];
      cells: number;
      /**
       * むらの形（2026-11-08 回 2）。cells（無いときも）＝粒のさかいの網目（前のまま）。
       * dendrite＝結晶の枝（樹枝）のすき間に、混じり物が切れ目なく濃くなったむら（大きさのちがう枝が重なり、さかいは丸い。濃さは 0〜1 の切れ目のない値）
       */
      form?: "cells" | "dendrite";
    }
  /** 熱して層をつなぐ（つながりの良さ） */
  | { op: "bond"; quality: BondQuality }
  /** のばして半分に切り、重ねる（times 回。層の数は 2 倍ずつ） */
  | { op: "fold"; times: number }
  /** 叩いて薄くのばす（厚みが 1/ratio。length＝長さの向きだけ、both＝縦横に） */
  | {
      op: "forge_thin";
      ratio: number;
      direction: "length" | "both";
      /**
       * 打ちむら（板の厚みに対して。0 か無ければ、むらなし＝前のまま。2026-11-08 回 2）。槌は板を同じには押さないので、1 回ずつの打ちが層を少し上下にずらし、
       * 金属は外へ逃げる。あとで削る・研ぐと、木目金と同じように、うねる木目の輪が出る
       */
      uneven?: number;
      /**
       * 大きな打ちと曲げ（板の幅の中の数。無いか 0 なら、小さな打ちだけ＝前のまま。2026-11-08 回 3）。uneven があるときだけ使う。
       * 強い打ちや曲げは、金属を板の幅ほどの大きさで上下と横に動かす。小さな打ちと重なって、削ると大きな輪（目）とうねりになる
       */
      swell?: number;
    }
  /**
   * 棒にしてねじる（板の長さの中で turns 回まわす）。bars＝ねじった棒を何本、横に並べてつなぐか（無ければ 1 本）。
   * 星の先は棒のふちに出るので、1 本では板のふちで半分に切れる。2 本以上なら、つなぎ目に星が丸ごと出る（2026-11-08）
   */
  | { op: "twist"; turns: number; bars?: number }
  /**
   * 表から彫る・穴をあける（top）か、裏から打ち出す（back）。depth は板の厚みに対して、size は板の幅に対して、across は幅の中の数。
   * count＝丸・くぼみ・葉・花を、その時の板の全体でちょうどこの数にする（無いか 0 なら、幅の中に across）
   */
  | { op: "carve"; side: "top" | "back"; shape: CarveShape; depth: number; size: number; across: number; count?: number }
  /** 叩いて平らにする */
  | { op: "flatten" }
  /** 表を平らに削る（depth は板の厚みに対して） */
  | {
      op: "grind";
      depth: number;
      /** 削る面のうねり（板の厚みに対して。0 か無ければ平ら＝前のまま。2026-11-08 回 2）。面が、層（帯）を少しずつちがう深さで切る */
      wave?: number;
      /** 面のうねりの数（板の幅の中。無いか 0 なら前のまま＝0.4〜1.8 ほど。2026-11-08 回 3）。大きな打ち（swell）と同じほどにすると、ふくらみの所が輪になる */
      ripples?: number;
    }
  /** 切って並べかえる。edge_up＝横にして層のふちを表に、strips＝細く切って 1 本おきに向きを変える、tiles＝四角に切って 1 つおきに回す */
  | { op: "rearrange"; mode: RearrangeMode; pieces: number }
  /** 最後に色を出す（none＝しない、etch＝酸で地を出す、patina＝煮色のように色を出す） */
  | {
      op: "color";
      kind: ColorKind;
      /**
       * 濃淡（0〜1。0 か無ければ 2 色＝前のまま。2026-11-08 回 2）。鋳た塊の樹枝のむら（ingot の dendrite）のときだけ使う：
       * 酸で出す明るさは、その所の混じり物（ウーツ鋼なら炭化物）の濃さで、2 色にくっきり分かれず、間の色が続く
       */
      graded?: number;
    }

export type OpName = PatternOp["op"];
export const OP_NAMES: OpName[] = ["stack", "ingot", "bond", "fold", "forge_thin", "twist", "carve", "flatten", "grind", "rearrange", "color"];

/** 画面に出す操作の名前 */
export const OP_LABEL: Record<OpName, string> = {
  stack: "重ねる",
  ingot: "鋳た塊を用意する（中にむら）",
  bond: "熱してつなぐ",
  fold: "のばして切り、重ねる",
  forge_thin: "叩いて薄くのばす",
  twist: "ねじる",
  carve: "彫る・打ち出す",
  flatten: "叩いて平らにする",
  grind: "表を削る",
  rearrange: "切って並べかえる",
  color: "色を出す",
};

interface Wave {
  fx: number;
  fy: number;
  ph: number;
  a: number;
}

function makeWaves(rand: () => number, n: number, fmin: number, fmax: number): Wave[] {
  return Array.from({ length: n }, (_, k) => ({
    fx: (fmin + rand() * (fmax - fmin)) * (rand() < 0.5 ? -1 : 1),
    fy: (fmin + rand() * (fmax - fmin)) * (rand() < 0.5 ? -1 : 1),
    ph: rand() * Math.PI * 2,
    a: 1 / (k + 1),
  }));
}

/** のばした向き（y）に長くのびた波（x の向きに細かく、y の向きにゆるやか） */
function makeStreaks(rand: () => number, n: number, fx: readonly [number, number], fy: readonly [number, number]): Wave[] {
  return Array.from({ length: n }, (_, k) => ({
    fx: (fx[0] + rand() * (fx[1] - fx[0])) * (rand() < 0.5 ? -1 : 1),
    fy: (fy[0] + rand() * (fy[1] - fy[0])) * (rand() < 0.5 ? -1 : 1),
    ph: rand() * Math.PI * 2,
    a: 1 / Math.sqrt(k + 1),
  }));
}

function waveAt(ws: readonly Wave[], x: number, y: number): number {
  let v = 0;
  let s = 0;
  for (const w of ws) {
    v += w.a * Math.sin(2 * Math.PI * (w.fx * x + w.fy * y) + w.ph);
    s += w.a;
  }
  return s ? v / s : 0;
}

/** 決まった散らばり（同じ i, j, k, たねなら同じ 0〜1） */
function hash(i: number, j: number, k: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 974634469) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** ふちがなめらかなくぼみの形（中心で 1、ふちで 0） */
function profile(t: number): number {
  if (t >= 1) return 0;
  const s = 1 - t * t;
  return s * Math.sqrt(s);
}

/** 1 つの操作と、その時の板の大きさ（操作の前） */
interface Stage {
  op: Exclude<PatternOp, { op: "stack" } | { op: "ingot" }>;
  /** 元の並びの何番目か（0 から） */
  index: number;
  W: number;
  H: number;
  seed: number;
  /** 叩く操作の、横のゆらぎと層の波打ち */
  waves?: Wave[][];
  /** 彫ったあと、平らにされたか（裏から打ち出したものは、削られたか） */
  flattened?: boolean;
  /** 打ちむら（forge_thin の uneven）：1 回ずつの打ちの所（この操作のあとの板の大きさで）、半径、向き（1＝表から、-1＝裏から） */
  dents?: { x: number; y: number; r: number; s: number }[];
  /** 大きな打ちと曲げ（forge_thin の swell）：所、幅の向きの半径 r、長さの向きの半径 ry、向き */
  swells?: { x: number; y: number; r: number; ry: number; s: number }[];
  /** 削る面のうねり（grind の wave） */
  grindWaves?: Wave[];
}

export interface Sim {
  ops: PatternOp[];
  metals: MetalId[];
  /** 重ねた枚数 */
  count: number;
  /** 層の厚さを変えたときの、はじめの板の層のさかいの深さ（0 から 1 まで、枚数 + 1 個）。同じ厚さなら無い */
  edges?: number[];
  /** 最後の層の数（重ねる回数で増える） */
  layersFinal: number;
  /** 鋳た塊から始めたとき（ingot）：塊の中のむらの網目。層の代わりに、これで色を決める（0 番＝網目、1 番＝地） */
  ingot?: { cells: number; seed: number; form?: "dendrite"; cut?: number };
  /** 色の濃淡（0＝2 色。color の graded。樹枝のむらのときだけ 0 より大きい） */
  graded: number;
  stages: Stage[];
  /** 層の境のつながらない所の割合 */
  unbonded: number;
  holes: { waves: Wave[]; cut: number }[];
  /** 板そのもののわずかな波打ち（叩く操作がなければ無い） */
  plateWaves: Wave[];
  color: ColorKind;
  /** 見る所（最後の板の中の正方形） */
  view: { x0: number; y0: number; size: number };
  /** 最後の板の大きさ（重ねたときの幅を 1 として） */
  final: { W: number; H: number };
  /** 計算から分かる注意（やさしい日本語） */
  notes: string[];
  seed: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampTo = (v: number, r: readonly [number, number]) => clamp(v, r[0], r[1]);

/** 0〜1 の外に出たら、ふちで折り返す */
function reflect01(v: number): number {
  let t = v - 2 * Math.floor(v / 2);
  if (t > 1) t = 2 - t;
  return clamp(t, 0, 0.999999);
}

/**
 * 操作の並びから、計算の材料を作る。並びは parsePattern などで確かめたもの（最初が stack）であること。
 * bond：途中の段の絵で、あとの段でつなぐ良さを先に使う（重ねただけの段に、つながらない所を描かないため）
 */
export function buildSim(ops: readonly PatternOp[], seed = 7, opts: { bond?: BondQuality } = {}): Sim {
  const first = ops[0];
  if (!first || (first.op !== "stack" && first.op !== "ingot")) throw new Error("最初の操作は stack（重ねる）か ingot（鋳た塊）にしてください");
  const metals = first.metals.length ? first.metals : (["light", "dark"] as MetalId[]);
  const notes: string[] = [];
  const ingot =
    first.op === "ingot"
      ? { cells: Math.round(clampTo(first.cells, PATTERN_LIMITS.cells)), seed: seed + 5000, ...(first.form === "dendrite" ? { form: "dendrite" as const } : {}) }
      : undefined;
  if (ingot?.form === "dendrite") {
    // 明るい帯の割合が share になる濃さのさかいを、塊の中の点の濃さの並びから決める（濃さの散らばりは、網目の数や枝の重なりで変わるため）
    const r = rng(seed + 6000);
    const vals = Array.from({ length: 2048 }, () => dendriteConc(ingot, r(), r(), r())).sort((a, b) => a - b);
    (ingot as { cut?: number }).cut = vals[Math.floor((1 - PATTERN_VALUES.dendrite.share) * vals.length)];
  }
  // 鋳た塊は、網目と地の 2 つ（層ではない）
  const count = ingot ? 2 : Math.round(clampTo((first as Extract<PatternOp, { op: "stack" }>).count, PATTERN_LIMITS.count));
  const thick = first.op === "stack" ? first.thickness?.slice(0, metals.length).map((v) => clampTo(v, PATTERN_LIMITS.thickness)) : undefined;
  const edges = thick && thick.length === metals.length ? layerEdges(thick, count) : undefined;
  if (ingot) {
    notes.push(
      ingot.form === "dendrite"
        ? `鋳た塊の中のむらは、「混じり物が結晶の枝のすき間に集まり、叩いてのばすと平たい帯になる」という説の形を、大きさのちがう枝が重なった、切れ目のない濃さのむらとして仮に描きました（幅の中に枝の間 ${ingot.cells}・仮）。むらの本当の形・量・並び方は分かっていません。`
        : `鋳た塊の中のむらは、「混じり物が結晶の枝のすき間に集まり、叩いてのばすと平たい帯になる」という説の形を、3 次元の網目として仮に描きました（幅の中に網目 ${ingot.cells}・仮）。網目の本当の形・量・並び方は分かっていません。`,
    );
    if (metals.length < 2) notes.push("材料が 1 つだけなので、網目と地の色の差は出ません。");
  }
  if (edges) notes.push(`層の厚さは、${metals.map((m, k) => `${PATTERN_METALS[m].name.replace(/（.*）/, "")} ${Math.round(thick![k] * 100) / 100}`).join("・")} の割合（仮）として描きました。`);
  let W = 1;
  let H = 1;
  let layers = count;
  let bond: BondQuality | "none" = "none";
  let color: ColorKind = "none";
  let graded = 0;
  const stages: Stage[] = [];
  for (const [index, op] of ops.entries()) {
    if (op.op === "stack" || op.op === "ingot") {
      if (index > 0) notes.push("重ねる（塊を用意する）操作が 2 回ありました。1 回目だけを使いました。");
      continue;
    }
    const st: Stage = { op, index, W, H, seed: seed + 7919 * (index + 1) };
    if (op.op === "forge_thin" || op.op === "flatten" || op.op === "fold") {
      const r = rng(st.seed);
      // [0] 横のゆらぎ x、[1] y、[2] 層の波打ち
      st.waves = [makeWaves(r, 4, 1, 4), makeWaves(r, 4, 1, 4), makeWaves(r, 6, 1.5, 9)];
      // [3] 長さの向きにのばすときの層の波打ち：のばした向きに長い筋（丸いまだらにならないように）
      const S = PATTERN_VALUES.streak;
      if (op.op === "forge_thin" && op.direction === "length") st.waves.push(makeStreaks(r, S.n, S.fx, S.fy));
    }
    stages.push(st);
    switch (op.op) {
      case "bond":
        bond = op.quality;
        break;
      case "fold": {
        const times = Math.round(clampTo(op.times, PATTERN_LIMITS.times));
        for (let t = 0; t < times; t++) {
          if (layers * 2 > PATTERN_VALUES.maxLayers) {
            notes.push(`層が ${PATTERN_VALUES.maxLayers} を超えるので、重ねる回数を ${t} 回で止めました（絵で見分けられないため）。`);
            (st.op as { times: number }).times = t;
            break;
          }
          layers *= 2;
        }
        break;
      }
      case "forge_thin": {
        const f = clampTo(op.ratio, PATTERN_LIMITS.ratio);
        if (op.direction === "length") H *= f;
        else {
          W *= Math.sqrt(f);
          H *= Math.sqrt(f);
        }
        // 打ちむら：のばしたあとの板の上に、打った所をちらす（数は板の広さに比べて。仮）
        if (op.uneven && op.uneven > 0) {
          const hv = PATTERN_VALUES.hammer;
          const r = rng(st.seed + 13);
          const n = Math.max(1, Math.round((hv.perArea * W * H) / (W * W)));
          st.dents = Array.from({ length: n }, () => ({
            x: r() * W,
            y: r() * H,
            r: hv.radius * W * (1 - hv.radiusMix / 2 + hv.radiusMix * r()),
            s: r() < 0.5 ? 1 : -1,
          }));
          // 大きな打ちと曲げ（別のたねで。小さな打ちの所は変えない）
          if (op.swell && op.swell > 0) {
            const sv = PATTERN_VALUES.swell;
            const k = clampTo(op.swell, PATTERN_LIMITS.swell);
            const r2 = rng(st.seed + 19);
            const base = W / (2 * k);
            // 半径の 2 倍の四角あたり perCell。板のふちの外にも少しはみ出して置く（ふちで輪が切れても、その外から押された形が入るように）
            const m = Math.max(1, Math.round((sv.perCell * (W + 2 * base) * (H + 2 * base)) / (4 * base * base * sv.stretch)));
            st.swells = Array.from({ length: m }, () => {
              const rr = base * (1 - sv.radiusMix / 2 + sv.radiusMix * r2());
              return { x: -base + r2() * (W + 2 * base), y: -base + r2() * (H + 2 * base), r: rr, ry: rr * sv.stretch, s: r2() < 0.5 ? 1 : -1 };
            });
          }
        } else if (op.swell && op.swell > 0) notes.push("大きな打ち・曲げ（swell）は、打ちむらの深さ（uneven）が 0 なので描きませんでした。");
        break;
      }
      case "grind":
        if (op.wave && op.wave > 0) {
          const G = PATTERN_VALUES.grindWave;
          // うねりの数があれば、その数のまわり（0.6〜1.2 倍。縦と横の両方に入るので、1 つの向きでは、ほぼその数）
          const k = op.ripples && op.ripples > 0 ? clampTo(op.ripples, PATTERN_LIMITS.swell) : 0;
          st.grindWaves = k ? makeWaves(rng(st.seed + 17), G.n, 0.6 * k, 1.2 * k) : makeWaves(rng(st.seed + 17), G.n, G.f[0], G.f[1]);
        }
        break;
      case "twist":
        // 四角い棒にのばしてから、ねじる
        H *= PATTERN_VALUES.twistBar;
        break;
      case "color":
        color = op.kind;
        graded = op.graded && op.graded > 0 ? clampTo(op.graded, PATTERN_LIMITS.graded) : 0;
        break;
      default:
        break;
    }
  }
  // 彫ったあと、平らにされたか。裏から打ち出したものは、表を削らないと模様にならない
  for (const [i, st] of stages.entries()) {
    if (st.op.op !== "carve") continue;
    const later = stages.slice(i + 1).map((s) => s.op.op);
    st.flattened = st.op.side === "back" ? later.includes("grind") : later.some((o) => o === "flatten" || o === "grind" || o === "forge_thin" || o === "fold");
    if (!st.flattened) {
      notes.push(
        st.op.side === "back"
          ? "裏から打ち出したあと、表を削る手順がありません。盛り上がった所を削らないと、表に下の層は出ないので、模様は出ないとして描きました。"
          : "彫ったあと、平らにする手順がありません。表に凹凸が残ります（絵は、上から見たときの色です）。",
      );
    }
  }
  const has = (o: OpName) => stages.some((s) => s.op.op === o);
  // 表から彫れば、平らにしなくても、彫った底に下の層が出る（前は平らにしないと「模様を出す手順が無い」と、食いちがう知らせを出していた。2026-11-07 夜）
  const patterning = stages.some((s) => (s.op.op === "carve" && (s.op.side === "top" || s.flattened)) || s.op.op === "twist" || s.op.op === "rearrange" || s.op.op === "grind");
  if (ingot) {
    // 1 つの塊なので、層のつなぎ目もはがれも無い。表は、はじめから塊の中のむらの切り口
    if (!has("forge_thin") && !has("fold")) notes.push("叩いてのばす手順が無いので、むらは網目のまま（帯やすじにならない）として描きました。");
  } else {
    if (!patterning) notes.push("模様を出す手順（彫る・ねじる・削る・並べかえる）が無いので、表は、いちばん上の層の色だけになります。");
    if (!has("bond")) notes.push("層をつなぐ手順が見当たらないので、層の境に、つながらない所が多いとして描きました。");
    if (metals.length < 2) notes.push("材料が 1 つだけなので、層があっても色の差は出ません。");
  }
  if (color === "none") notes.push("最後に色を出す手順が無いので、材料そのものの色で描きました。色の差は小さく見えます。");
  if (graded > 0 && ingot?.form !== "dendrite") {
    notes.push("色の濃淡は、鋳た塊の樹枝のむら（濃さが切れ目なく変わる物）のときだけ描けます。重ねた層や網目は、2 色のまま描きました。");
    graded = 0;
  }
  if (stages.some((s) => s.dents)) notes.push("叩くときの打ちむら（1 回ずつの打ちで層が少し上下にずれる）は、跡の大きさ・数・深さを仮に決めて描きました。");
  if (stages.some((s) => s.swells))
    notes.push("大きな打ちと曲げ（金属を板の幅ほどの大きさで動かす）は、数・大きさ・ずれの深さを仮に決めて描きました。削ると、ふくらみの所に輪（目）が出ます。本当の打ち方は分かっていません。");

  const unbonded = ingot ? 0 : PATTERN_VALUES.unbonded[opts.bond ?? bond];
  const hr = rng(seed + 3000);
  const holes: Sim["holes"] = [];
  for (let k = 0; k < count; k++) {
    const waves = makeWaves(hr, 5, 2, 7);
    const vals: number[] = [];
    for (let j = 0; j < 30; j++) for (let i = 0; i < 30; i++) vals.push(waveAt(waves, (i + 0.5) / 30, (j + 0.5) / 30));
    vals.sort((a, b) => a - b);
    const cut = unbonded <= 0 ? -Infinity : vals[Math.min(vals.length - 1, Math.floor(unbonded * vals.length))];
    holes.push({ waves, cut });
  }
  const size = Math.min(W, H);
  return {
    ops: [...ops],
    metals,
    count,
    ...(edges ? { edges } : {}),
    layersFinal: layers,
    ...(ingot ? { ingot } : {}),
    graded,
    stages,
    unbonded,
    holes,
    plateWaves: !ingot && stages.some((s) => s.op.op === "forge_thin" || s.op.op === "flatten" || s.op.op === "fold") ? makeWaves(rng(seed + 4000), 4, 1, 4) : [],
    color,
    view: { x0: (W - size) / 2, y0: (H - size) / 2, size },
    final: { W, H },
    notes,
    seed,
  };
}

/**
 * 彫った（打ち出した）深さ（その時の板の厚みに対して 0〜1）。qx, qy はその時の板の幅を 1 とした位置。aspect はその時の板の長さ ÷ 幅
 * （count で板全体に置くときに、板の大きさを知るため）
 */
export function carveDepth(op: Extract<PatternOp, { op: "carve" }>, qx: number, qy: number, seed: number, aspect = 1): number {
  const across0 = clampTo(op.across, PATTERN_LIMITS.across);
  // 溝（lines・waves）を板全体の数 count で刻むとき：板の長さの中に count 本（手がかりの「段は 40」が、幅の中の 40 本の細かい縞になっていた。2026-11-08 回 3）
  const byCount = (op.shape === "lines" || op.shape === "waves") && op.count && op.count > 0;
  const across = byCount ? clamp(op.count! / Math.max(aspect, 1e-6), 0.05, PATTERN_LIMITS.across[1]) : across0;
  const a = 1 / across;
  const depth = clampTo(op.depth, PATTERN_LIMITS.depth);
  const size = clampTo(op.size, PATTERN_LIMITS.size);
  const J = PATTERN_VALUES.handJitter;
  /** -1〜1 の決まった散らばり */
  const jit = (i: number, j: number, k: number) => 2 * hash(i, j, k, seed) - 1;
  if (op.shape === "lines" || op.shape === "waves") {
    // 幅の向きに走る溝を、長さの向きに a おきに（はしごの模様の溝）。鏨で手で刻むので、溝ごとに間・幅・深さが少しずれ、わずかにうねる
    const y = op.shape === "waves" ? qy + 0.35 * a * Math.sin(2 * Math.PI * qx * Math.max(1, across / 3)) : qy;
    const g0 = Math.floor(y / a);
    let d = 0;
    for (let g = g0 - 1; g <= g0 + 1; g++) {
      const cy = (g + 0.5 + 0.5 * J.pos * jit(g, 0, 11)) * a + J.lineWander * size * Math.sin(2 * Math.PI * (qx * (1 + hash(g, 0, 12, seed)) + hash(g, 0, 13, seed)));
      const w = size * (1 + J.size * jit(g, 0, 14));
      const dd = depth * (1 + J.depth * jit(g, 0, 15));
      const t = Math.abs(y - cy) / w;
      if (t < 1) d = Math.max(d, dd * profile(t));
    }
    return Math.min(0.98, d);
  }
  let d = 0;
  /** 1 つの穴・くぼみ（i, j はばらつきの番号、(dx, dy) は中心からの位置）の深さ */
  const one = (i: number, j: number, dx: number, dy: number) => {
    if (op.shape === "leaves") {
      // 葉の鏨：先がとがり根元が丸い葉の形。向きは 1 つずつちがう。真ん中の葉脈が少し浅い
      const L = size * (0.85 + 0.3 * hash(i, j, 3, seed));
      const dd = depth * (0.8 + 0.2 * hash(i, j, 4, seed));
      d = Math.max(d, dd * Math.min(1, leafBump(dx, dy, L, 2 * Math.PI * hash(i, j, 10, seed))));
      return;
    }
    if (op.shape === "petals") {
      // 花の鏨：5 枚の花びら
      const R = size * (0.85 + 0.3 * hash(i, j, 3, seed));
      const dd = depth * (0.8 + 0.2 * hash(i, j, 4, seed));
      d = Math.max(d, dd * Math.min(1, flowerBump(dx, dy, R, 2 * Math.PI * hash(i, j, 10, seed))));
      return;
    }
    let r: number, dd: number;
    let e = 1;
    let ang = 0;
    if (op.shape === "dots") {
      // 錐で手であけるので、大きさ・深さが少しずれ、わずかに楕円になる
      r = size * (1 + J.size * jit(i, j, 7));
      dd = depth * (1 + J.depth * jit(i, j, 8));
      e = 1 + J.ellipse * jit(i, j, 9);
      ang = Math.PI * hash(i, j, 10, seed);
    } else {
      r = size * (0.55 + 0.9 * hash(i, j, 3, seed));
      dd = depth * (0.55 + 0.45 * hash(i, j, 4, seed));
    }
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const dist = Math.hypot((dx * c + dy * s) * e, (-dx * s + dy * c) / e) / r;
    if (dist < 1) d = Math.max(d, dd * profile(dist));
  };
  const count = op.count ? clampTo(op.count, PATTERN_LIMITS.items) : 0;
  if (count >= 1) {
    // 板全体でちょうど count 個（手がかりの「10 ほど」が、そのまま 10 になる。2026-11-08）。dots は列に、ほかはばらばらに
    const sp = spotsFor(op, count, 1, aspect, seed, op.shape === "dots" ? { arrange: "rows", jitter: J.pos, stagger: true } : { arrange: "scatter", margin: Math.min(0.45, size * 1.2) });
    eachSpotNear(sp, qx, qy, (k, dx, dy) => one(k, 0, dx, dy));
    return Math.min(0.98, d);
  }
  const i0 = Math.floor(qx / a);
  const j0 = Math.floor(qy / a);
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      // dots：決まった間かくの丸い穴（1 列おきに半分ずらす。手であけるので、位置が少しずれる）。ほか：ばらばらの所
      const cx = op.shape === "dots" ? (i + 0.5 + (j % 2 === 0 ? 0 : 0.5) + J.pos * jit(i, j, 5)) * a : (i + 0.15 + 0.7 * hash(i, j, 1, seed)) * a;
      const cy = op.shape === "dots" ? (j + 0.5 + J.pos * jit(i, j, 6)) * a : (j + 0.15 + 0.7 * hash(i, j, 2, seed)) * a;
      one(i, j, qx - cx, qy - cy);
    }
  }
  return Math.min(0.98, d);
}

/** 四角（-1〜1）の点を円の中へ（ふちの四角が、ふちの円になる） */
export function squareToDisk(x: number, y: number): [number, number] {
  return [x * Math.sqrt(Math.max(0, 1 - (y * y) / 2)), y * Math.sqrt(Math.max(0, 1 - (x * x) / 2))];
}

/** squareToDisk のもどし */
export function diskToSquare(u: number, v: number): [number, number] {
  const r2 = 2 * Math.SQRT2;
  const a = 2 + u * u - v * v;
  const b = 2 - u * u + v * v;
  const x = 0.5 * Math.sqrt(Math.max(0, a + r2 * u)) - 0.5 * Math.sqrt(Math.max(0, a - r2 * u));
  const y = 0.5 * Math.sqrt(Math.max(0, b + r2 * v)) - 0.5 * Math.sqrt(Math.max(0, b - r2 * v));
  return [clamp(x, -1, 1), clamp(y, -1, 1)];
}

/** 幅 1 の制約 |a + b z| ≦ 1 を満たす z の範囲 */
function band1(a: number, b: number): [number, number] {
  if (Math.abs(b) < 1e-9) return [-Infinity, Infinity];
  const p = (-1 - a) / b;
  const q = (1 - a) / b;
  return p < q ? [p, q] : [q, p];
}

/**
 * 回った四角（四角い棒の切り口を th だけ回したもの）を、上下から押して四角にもどす（press）。
 * 縦の列ごとに：左からの面積の割合が同じ所へ横に動き、列の中の上下は、列の高さの割合のまま押しちぢめる（金属の量は変わらない）。
 * 押した四角の点（-1〜1）が、回った四角のどこから来たかを返す（回る前の切り口の座標で）。
 */
export function pressBack(X: number, Z: number, th: number): [number, number] {
  const c = Math.abs(Math.cos(th));
  const s = Math.abs(Math.sin(th));
  // 回った四角の、列の高さは台形：はし ±b で 0、±a の内で h0（面積は 4）
  const a = Math.abs(c - s);
  const b = c + s;
  const h0 = 2 / Math.max(c, s);
  const A1 = (h0 * (b - a)) / 2;
  const T = 2 * (clamp(X, -1, 1) + 1);
  let x: number;
  if (T < A1) x = -b + Math.sqrt((2 * T * (b - a)) / h0);
  else if (T <= 4 - A1) x = -a + (T - A1) / h0;
  else x = b - Math.sqrt((2 * Math.max(0, 4 - T) * (b - a)) / h0);
  const C = Math.cos(th);
  const S = Math.sin(th);
  const i1 = band1(x * C, S);
  const i2 = band1(-x * S, C);
  const lo = Math.max(i1[0], i2[0]);
  const hi = Math.min(i1[1], i2[1]);
  const z = hi > lo ? (lo + hi) / 2 + (Z * (hi - lo)) / 2 : 0;
  return [clamp(x * C + z * S, -1, 1), clamp(-x * S + z * C, -1, 1)];
}

/**
 * ねじって叩いた棒の切り口の点（-1〜1。x＝幅、u＝深さ）が、ねじる前にどこにあったか。th はその所の回った角度。
 * 2 つの見方の間を取る（PATTERN_VALUES.twistCorner）：
 *   なめらかな見方（四角 → 円 → 回す → 四角）：内の層は、ほぼ回るだけ
 *   押しもどす見方（pressBack）：回った四角の角が押しこまれ、角から層が放射状に集まる（星の先）
 * 叩くと、出っぱった角の分が表の薄い皮に押しこまれるので、深さは真ん中へ寄せる（PATTERN_VALUES.twistSkin）。
 */
export function untwist(x: number, u: number, th: number): [number, number] {
  const p = PATTERN_VALUES.twistSkin;
  const z = Math.sign(u) * Math.abs(u) ** p;
  const [dx, du] = squareToDisk(x, z);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const D = diskToSquare(dx * c + du * s, -dx * s + du * c);
  // 押しもどす見方は、回った四角の角の所で折れ目ができる（絵に段がついた）。となりの所と平均して、なめらかに
  const P = [0, 0];
  // 棒のふちでは平均しない（ふちの外の点を使うと、角から集まる線がくずれた）
  const d = PATTERN_VALUES.twistSmooth * clamp((0.9 - Math.abs(x)) / 0.25, 0, 1);
  for (const k of [-1, 0, 1]) {
    const q = pressBack(x + k * d, z, th);
    P[0] += q[0] / 3;
    P[1] += q[1] / 3;
  }
  const m = PATTERN_VALUES.twistCorner;
  return [clamp(D[0] * (1 - m) + P[0] * m, -1, 1), clamp(D[1] * (1 - m) + P[1] * m, -1, 1)];
}

export interface Trace {
  /** はじめに重ねた板の中での深さ（0＝表、1＝裏） */
  u0: number;
  /** はじめに重ねた板の中での位置（幅を 1 として） */
  x0: number;
  y0: number;
}

/**
 * 打ちむらをもどす：打った所の下では、層が押し下げられ（裏からなら押し上げられ）、金属は外へ逃げた。
 * (x, y, u) にある物が、打つ前にどこにあったかを返す。amp は上下のずれの大きさ（板の厚みに対して）。ずれは表と裏のごく近くでは消える
 */
export function undent(dents: readonly { x: number; y: number; r: number; s: number }[], amp: number, x: number, y: number, u: number): [number, number, number] {
  const hv = PATTERN_VALUES.hammer;
  let dz = 0;
  let dx = 0;
  let dy = 0;
  for (const d of dents) {
    const ex = x - d.x;
    const ey = y - d.y;
    const q = (ex * ex + ey * ey) / (d.r * d.r);
    if (q > 9) continue;
    const e = Math.exp(-q);
    dz += d.s * e;
    // 外へ逃げる量（跡のふちでいちばん大きい）
    dx += (ex / d.r) * e * d.r;
    dy += (ey / d.r) * e * d.r;
  }
  const edge = Math.min(1, u / hv.edge, (1 - u) / hv.edge);
  const L = hv.lateral * amp;
  return [x - L * dx, y - L * dy, reflect01(u - amp * dz * edge)];
}

/**
 * 大きな打ちと曲げをもどす（undent と同じ考えで、跡が長さの向きに長い楕円）。amp は上下のずれ（板の厚みに対して）。
 * 層は大きく上下にずれ、金属は外へ逃げる。表と裏のごく近くでは消える（2026-11-08 回 3）
 */
export function unswell(sw: readonly { x: number; y: number; r: number; ry: number; s: number }[], amp: number, x: number, y: number, u: number): [number, number, number] {
  const hv = PATTERN_VALUES.hammer;
  let dz = 0;
  let dx = 0;
  let dy = 0;
  for (const d of sw) {
    const ex = x - d.x;
    const ey = y - d.y;
    const q = (ex * ex) / (d.r * d.r) + (ey * ey) / (d.ry * d.ry);
    if (q > 9) continue;
    const e = Math.exp(-q);
    dz += d.s * e;
    dx += ex * e;
    dy += ey * e;
  }
  const edge = Math.min(1, u / hv.edge, (1 - u) / hv.edge);
  const L = hv.lateral * amp;
  return [x - L * dx, y - L * dy, reflect01(u - amp * dz * edge)];
}

/** 最後の板の (x, y)（最後の板の大きさで）の深さ u にある物が、はじめに重ねた板のどこにあったか */
export function trace(sim: Sim, x: number, y: number, u: number): Trace {
  let px = x;
  let py = y;
  let uu = u;
  const A = PATTERN_VALUES.wobble.forge;
  const Af = PATTERN_VALUES.wobble.flatten;
  for (let s = sim.stages.length - 1; s >= 0; s--) {
    const st = sim.stages[s];
    const { W, H } = st;
    const op = st.op;
    switch (op.op) {
      case "forge_thin": {
        const f = clampTo(op.ratio, PATTERN_LIMITS.ratio);
        const ws = st.waves!;
        // 打ちむら（のばしたあとの板の上で起きたので、のばす前にもどす前に、先にもどす）
        if (st.dents) [px, py, uu] = undent(st.dents, clampTo(op.uneven!, PATTERN_LIMITS.uneven), px, py, uu);
        // 大きな打ちと曲げ（小さな打ちより先に起きたので、小さな打ちをもどしたあとにもどす）
        if (st.swells) [px, py, uu] = unswell(st.swells, PATTERN_VALUES.swell.amp * clampTo(op.uneven!, PATTERN_LIMITS.uneven), px, py, uu);
        if (op.direction === "length") py /= f;
        else {
          px /= Math.sqrt(f);
          py /= Math.sqrt(f);
        }
        // のばす前の板で、層が少し波打っていた。それがのばされるので、波は、のばした向きに長くなる（丸いまだらにならない）
        const LW = PATTERN_VALUES.layerWave;
        if (ws[3]) {
          // 大きな筋の波打ちは、板の表と裏のごく近くでは消える（削らなければ、表はいちばん上の層のまま）
          const edge = Math.min(1, uu / LW.streakEdge, (1 - uu) / LW.streakEdge);
          uu = reflect01(uu + LW.streak * Math.sqrt(f) * edge * waveAt(ws[3], px / W, py / W));
        } else uu = reflect01(uu + LW.forge * Math.sqrt(f) * waveAt(ws[2], px / W, py / W));
        px += A * W * waveAt(ws[0], px / W, py / W);
        py += A * W * waveAt(ws[1], px / W, py / W);
        break;
      }
      case "flatten": {
        const ws = st.waves!;
        uu = reflect01(uu + PATTERN_VALUES.layerWave.flatten * waveAt(ws[2], px / W, py / W));
        px += Af * W * waveAt(ws[0], px / W, py / W);
        py += Af * W * waveAt(ws[1], px / W, py / W);
        break;
      }
      case "fold": {
        const ws = st.waves!;
        const times = Math.round(clampTo(op.times, [0, PATTERN_LIMITS.times[1]]));
        for (let t = 0; t < times; t++) {
          uu = reflect01(uu + PATTERN_VALUES.layerWave.fold * waveAt(ws[2], px / W + 0.37 * t, py / W));
          if (uu < 0.5) {
            uu = 2 * uu;
            py = py / 2;
          } else {
            uu = 2 * uu - 1;
            py = (py + H) / 2;
          }
        }
        break;
      }
      case "twist": {
        const turns = clampTo(op.turns, PATTERN_LIMITS.turns);
        // 四角い棒の切り口は、ねじると回る。そのあと四角に叩きもどすので、回った四角の角が内へ押しこまれる。
        // それを untwist（回すだけの見方と、上下から押しもどす見方の間）で近づける。角を折り返すと木の目のように、
        // 回すだけだと入れ子の山形だけになった（2026-11-07）。押しもどすと、角が棒のふちに来る所で層が集まり、星の先になる
        const bar = PATTERN_VALUES.twistBar;
        // 何本かの棒を横に並べてつないだときは、棒ごとに、その棒の幅の中でもどす（星の先が、となりの棒とのつなぎ目で丸ごとになる）
        const nb = Math.round(clampTo(op.bars ?? 1, PATTERN_LIMITS.bars));
        const xb = nb > 1 ? clamp(px / W, 0, 0.999999) * nb : px / W;
        const ib = nb > 1 ? Math.floor(xb) : 0;
        const [ox, ou] = untwist(2 * (xb - ib) - 1, 2 * uu - 1, (2 * Math.PI * turns * py) / (H * bar));
        px = ((ib + clamp((ox + 1) / 2, 0, 0.999999)) / nb) * W;
        uu = clamp((ou + 1) / 2, 0, 0.999999);
        py /= bar;
        break;
      }
      case "carve": {
        if (!st.flattened && op.side === "back") break;
        const e = carveDepth(op, px / W, py / W, st.seed, H / W);
        uu = e + uu * (1 - e);
        break;
      }
      case "grind": {
        let g = clampTo(op.depth, PATTERN_LIMITS.grind);
        // うねる面：場所ごとに削る深さが少しちがう（板の幅に対する位置で）
        if (st.grindWaves) g = clamp(g + clampTo(op.wave!, PATTERN_LIMITS.grindWave) * waveAt(st.grindWaves, px / W, py / W), 0, 0.95);
        uu = g + uu * (1 - g);
        break;
      }
      case "rearrange": {
        const n = Math.round(clampTo(op.pieces, PATTERN_LIMITS.pieces));
        if (op.mode === "edge_up") {
          // 重ねた塊を n 本に切り、1 本ずつ横に倒して並べる：どの 1 本にも、すべての層が縞になって出る
          const xn = clamp(px / W, 0, 0.999999) * n;
          const i = Math.floor(xn);
          px = ((i + uu) / n) * W;
          uu = clamp(xn - i, 0, 0.999999);
        } else if (op.mode === "strips") {
          const i = Math.floor(clamp(px / W, 0, 0.999999) * n);
          if (i % 2 === 1) {
            const w = W / n;
            px = i * w + (w - (px - i * w));
            py = H - py;
          }
        } else {
          const t = W / n;
          const i = Math.floor(px / t);
          const j = Math.floor(py / t);
          if ((((i + j) % 2) + 2) % 2 === 1) {
            const lx = px - i * t;
            const ly = py - j * t;
            px = i * t + ly;
            py = j * t + (t - lx);
          }
        }
        break;
      }
      default:
        break;
    }
  }
  // 板そのものの、わずかな波打ち
  uu = clamp(uu + (PATTERN_VALUES.waviness / sim.count) * waveAt(sim.plateWaves, px, py), 0, 0.999999);
  return { u0: uu, x0: px, y0: py };
}

/** はじめに重ねた板の深さ u0 が、何番の層の中のどこか（層の番号 + 層の中の割合）。同じ厚さなら u0 × 枚数 */
export const layerCoord = (sim: Sim, u0: number): number => layerCoordOf(sim.edges, sim.count, u0);

/** 3 次元の格子の点の散らばり（0〜1） */
function hash3(i: number, j: number, k: number, salt: number, seed: number): number {
  return hash(i * 73856093 + salt, j * 19349663, k * 83492791, seed);
}

/** なめらかな 3 次元のむら（0〜1。格子の値をなめらかにつなぐ） */
function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const k = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const fx = f(x - i);
  const fy = f(y - j);
  const fz = f(z - k);
  let v = 0;
  for (let c = 0; c < 8; c++) {
    const a = c & 1;
    const b = (c >> 1) & 1;
    const d = (c >> 2) & 1;
    v += hash3(i + a, j + b, k + d, 17, seed) * (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (d ? fz : 1 - fz);
  }
  return v;
}

/**
 * 鋳た塊の中の点 (x0, y0, u0)（はじめの塊の幅を 1、u0 は厚みの中の 0〜1）が、網目（0〜1）か地（1〜2）か。
 * 塊を、結晶の粒（1 つずつ中心が少しずれた格子）に分け、となりの粒とのさかい（いちばん近い中心と 2 番目に近い中心の距離の差が小さい所）を、
 * 混じり物が集まった網目とする。網目の太さは、細かなむらで変える（つぶの並びのように、とぎれとぎれの線になる）。どれも仮（PATTERN_VALUES.ingot）
 */
export function ingotCoord(ing: { cells: number; seed: number }, x0: number, y0: number, u0: number): number {
  const V = PATTERN_VALUES.ingot;
  const X = x0 * ing.cells;
  const Y = y0 * ing.cells;
  const Z = u0 * ing.cells * V.thick;
  const ci = Math.floor(X);
  const cj = Math.floor(Y);
  const ck = Math.floor(Z);
  let f1 = Infinity;
  let f2 = Infinity;
  for (let k = ck - 1; k <= ck + 1; k++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        const px = i + 0.5 + V.jitter * (hash3(i, j, k, 1, ing.seed) - 0.5);
        const py = j + 0.5 + V.jitter * (hash3(i, j, k, 2, ing.seed) - 0.5);
        const pz = k + 0.5 + V.jitter * (hash3(i, j, k, 3, ing.seed) - 0.5);
        const d = Math.hypot(X - px, Y - py, Z - pz);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) f2 = d;
      }
    }
  }
  const gap = f2 - f1;
  const b = V.beads;
  const w = V.wall * (1 - V.beadMix + 2 * V.beadMix * valueNoise3(X * b, Y * b, Z * b, ing.seed + 99));
  if (gap < w) return Math.min(0.999, gap / Math.max(1e-6, w));
  return 1 + Math.min(0.999, (gap - w) / Math.max(1e-6, 1 - w));
}

/**
 * 鋳た塊の樹枝のむら（form: dendrite）の、混じり物の濃さ（0〜1。切れ目がない）。
 * 大きさのちがう枝の間（PATTERN_VALUES.dendrite.scales）の、なめらかなむらの「尾根」（むらが真ん中の値を横切る所＝枝と枝の間）を重ねる。
 * 尾根は丸くつながり、枝分かれし、大きな網の中に小さな網が入る。粒のさかいの平らな面（前の網目）のような、角ばった格子にはならない
 */
export function dendriteConc(ing: { cells: number; seed: number }, x0: number, y0: number, u0: number): number {
  const V = PATTERN_VALUES.dendrite;
  const th = PATTERN_VALUES.ingot.thick;
  let v = 0;
  let w = 0;
  for (let k = 0; k < V.scales.length; k++) {
    const a = ing.cells * V.scales[k];
    const n = valueNoise3(x0 * a + 17.3 * k, y0 * a - 5.1 * k, u0 * a * th + 3.7 * k, ing.seed + 31 * k);
    v += V.weights[k] * (1 - Math.abs(2 * n - 1));
    w += V.weights[k];
  }
  return clamp(v / w, 0, 1) ** V.sharp;
}

/**
 * 樹枝のむらの濃さを、層の番号の値（0〜1＝明るい帯、1〜2＝地）に直す。濃さ share のめやすの所がさかい。
 * 色の濃淡（graded）は、この値から濃さを読みもどして使う（toneOf）
 */
export function dendriteCoord(ing: { cells: number; seed: number; cut?: number }, x0: number, y0: number, u0: number): number {
  const c = dendriteConc(ing, x0, y0, u0);
  const cut = clamp(ing.cut ?? 0.5, 0.01, 0.99);
  return c >= cut ? Math.min(0.999, (1 - c) / (1 - cut)) : 1 + Math.min(0.999, (cut - c) / cut);
}

/** 層の番号の値 s（樹枝のむら）から、明るい帯の色の割合（0〜1）。s＝0 で 1、さかい（s＝1）で半分、s＝2 で 0 */
export const toneOf = (s: number): number => {
  const g = clamp(1 - s / 2, 0, 1);
  return g * g * (3 - 2 * g);
};

/** 表・断面の点が、はじめのどこから来たか（trace）から、層の番号の切れ目のない値を出す（鋳た塊なら、網目か地か） */
export function coordAt(sim: Sim, t: Trace): number {
  if (!sim.ingot) return layerCoord(sim, t.u0);
  return sim.ingot.form === "dendrite" ? dendriteCoord(sim.ingot, t.x0, t.y0, t.u0) : ingotCoord(sim.ingot, t.x0, t.y0, t.u0);
}

/** はじめに重ねた板の、上から k 番の層（0 から） */
export function layerOf(sim: Sim, u0: number): number {
  return Math.min(sim.count - 1, Math.max(0, Math.floor(layerCoord(sim, u0))));
}

/** k 番の層の材料 */
export const metalOf = (sim: Sim, k: number): MetalId => sim.metals[k % sim.metals.length];

/** 層の境 k（k 番の層の上の面）が、はじめの位置 (x, y) でつながっていないか */
export function unbondedAt(sim: Sim, k: number, x: number, y: number): boolean {
  if (k < 1 || k >= sim.count) return false;
  const h = sim.holes[k];
  return h.cut > -Infinity && waveAt(h.waves, x, y) < h.cut;
}

/** 層ごとの色（最後の色の出し方で） */
export function layerColors(sim: Sim): string[] {
  return Array.from({ length: sim.count }, (_, k) => PATTERN_METALS[metalOf(sim, k)][sim.color === "none" ? "raw" : sim.color]);
}

// ---- 表（上から見た面） ----

export interface Surface {
  n: number;
  /** こまごとの層の番号 */
  layer: Uint16Array;
  /** こまごとの、層がはがれて口を開けた所（1） */
  defect: Uint8Array;
  /** こまごとの、はじめの板の中の深さ × 枚数（層の番号の、切れ目のない値。細い層をなめらかに描くため） */
  s: Float32Array;
}

const newSurface = (n: number): Surface => ({ n, layer: new Uint16Array(n * n), defect: new Uint8Array(n * n), s: new Float32Array(n * n) });

/** 最後の板の見る所を、上から n × n のこまで見る */
export function surface(sim: Sim, n: number): Surface {
  const out = newSurface(n);
  surfaceRows(sim, out, 0, n);
  return out;
}

/** surface の j0〜j1 行だけを埋める（画面で少しずつ描くため） */
export function surfaceRows(sim: Sim, out: Surface, j0: number, j1: number): void {
  const { n, layer, defect } = out;
  const { x0, y0, size } = sim.view;
  for (let j = j0; j < Math.min(n, j1); j++) {
    for (let i = 0; i < n; i++) {
      const t = trace(sim, x0 + ((i + 0.5) / n) * size, y0 + ((j + 0.5) / n) * size, 0);
      const s = coordAt(sim, t);
      out.s[j * n + i] = s;
      layer[j * n + i] = Math.min(sim.count - 1, Math.max(0, Math.floor(s)));
      const k = Math.ceil(s);
      defect[j * n + i] = k - s < PATTERN_VALUES.openDepth && unbondedAt(sim, k, t.x0, t.y0) ? 1 : 0;
    }
  }
}

// ---- 断面（横から切った面） ----

export const AIR = -1;
export const GAP = -2;

export interface Section {
  w: number;
  h: number;
  cells: Int16Array;
  /** こまごとの、層の番号の切れ目のない値（空気とはがれは NaN） */
  s: Float32Array;
}

/** 見る所の真ん中（または row：見る所の上から 0〜1）を、幅の向きに切った断面。上が表 */
/** つなぐ良さ（つなぐ操作がなければ undefined） */
export function bondOf(ops: readonly PatternOp[]): BondQuality | undefined {
  let q: BondQuality | undefined;
  for (const o of ops) if (o.op === "bond") q = o.quality;
  return q;
}

/** 断面を切る行（見る所の上から 0〜1）。表の模様が、いちばん多く横切る所 */
export function sectionRow(sim: Sim): number {
  const { x0, y0, size } = sim.view;
  let best = 0.5;
  let bestScore = -1;
  for (let k = 0; k <= 30; k++) {
    const r = 0.2 + (0.6 * k) / 30;
    let score = 0;
    let last = -1;
    for (let i = 0; i < 90; i++) {
      const layer = Math.floor(coordAt(sim, trace(sim, x0 + ((i + 0.5) / 90) * size, y0 + r * size, 0)));
      if (i > 0 && layer !== last) score++;
      last = layer;
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

export function section(sim: Sim, w: number, h: number, row = 0.5): Section {
  const cells = new Int16Array(w * h).fill(AIR);
  const sv = new Float32Array(w * h).fill(NaN);
  const { x0, y0, size } = sim.view;
  const y = y0 + row * size;
  // 平らにしていない最後の彫り（表に凹凸が残る）
  const open = sim.stages.filter((s) => s.op.op === "carve" && s.op.side === "top" && !s.flattened);
  for (let i = 0; i < w; i++) {
    const x = x0 + ((i + 0.5) / w) * size;
    let top = 0;
    for (const st of open) if (st.op.op === "carve") top = Math.max(top, carveDepth(st.op, x / st.W, y / st.W, st.seed, st.H / st.W));
    for (let j = 0; j < h; j++) {
      const u = (j + 0.5) / h;
      if (u < top) continue;
      const t = trace(sim, x, y, u);
      const s = coordAt(sim, t);
      const k = Math.round(s);
      const gap = Math.abs(s - k) < 0.12 && unbondedAt(sim, k, t.x0, t.y0);
      cells[j * w + i] = gap ? GAP : Math.min(sim.count - 1, Math.max(0, Math.floor(s)));
      if (!gap) sv[j * w + i] = s;
    }
  }
  return { w, h, cells, s: sv };
}

// ---- 比べるための数 ----

/** 模様の細かさの目安：となりのこまと層がちがう割合（0〜1） */
export function fineness(s: Surface): number {
  let diff = 0;
  let all = 0;
  const { n, layer } = s;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n - 1; i++) {
      all++;
      if (layer[j * n + i] !== layer[j * n + i + 1]) diff++;
    }
  }
  return all ? diff / all : 0;
}

/** 表に出た色の数（材料の数で数える） */
export function metalsShown(sim: Sim, s: Surface): number {
  return new Set(Array.from(s.layer, (k) => metalOf(sim, k))).size;
}

/** はがれた所の割合（0〜1） */
export function defectShare(s: Surface): number {
  let d = 0;
  for (const v of s.defect) d += v;
  return s.defect.length ? d / s.defect.length : 0;
}

// ---- 絵（画面とファイルで同じ） ----
// 細い層が画素より細かいと、こまごとに 1 つの層の色を取るだけでは、ざらついた縞になる（霞刃の小刀で見えた。2026-11-07）。
// そこで、となりのこまとの層の番号の差から「1 つの画素に何枚の層が入るか」を出し、その幅の層の色を平均する（なめらかな線と、中間の色になる）。
// 四角を並べたさかいのように、層の番号が飛ぶ所は、差の小さい側を使って、さかいをぼかさない。

export function hexRgb(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** 決まった細かいざらつき（金属の地の手ざわり。-1〜1） */
function grain(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 1023) / 1023 - 0.5) * 2;
}

export interface Rgba {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

/** 層ごとの色を、幅をもって平均できる形にしたもの */
export interface LayerRamp {
  n: number;
  /** 層ごとの色（r, g, b の順） */
  cols: Float32Array;
  /** 0〜k-1 番の層の色の和（r, g, b の順。k = 0〜n） */
  pre: Float64Array;
}

export function layerRamp(colors: readonly (readonly number[])[]): LayerRamp {
  const n = colors.length;
  const cols = new Float32Array(n * 3);
  const pre = new Float64Array((n + 1) * 3);
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < 3; c++) {
      cols[k * 3 + c] = colors[k][c];
      pre[(k + 1) * 3 + c] = pre[k * 3 + c] + colors[k][c];
    }
  }
  return { n, cols, pre };
}

/** 層の番号の値 x までの色の和（板の外は、いちばん外の層の色が続くとする） */
function rampSum(r: LayerRamp, x: number, c: number): number {
  const n = r.n;
  if (x <= 0) return x * r.cols[c];
  if (x >= n) return r.pre[n * 3 + c] + (x - n) * r.cols[(n - 1) * 3 + c];
  const k = Math.floor(x);
  return r.pre[k * 3 + c] + (x - k) * r.cols[k * 3 + c];
}

/** 層の番号の値 s を真ん中に、幅 w（層の数）の色の平均。w がごく小さければ、その層の色。out に r, g, b */
export function rampColor(r: LayerRamp, s: number, w: number, out: number[]): void {
  if (!(w > 0.02)) {
    const k = Math.min(r.n - 1, Math.max(0, Math.floor(s)));
    out[0] = r.cols[k * 3];
    out[1] = r.cols[k * 3 + 1];
    out[2] = r.cols[k * 3 + 2];
    return;
  }
  const lo = s - w / 2;
  const hi = s + w / 2;
  for (let c = 0; c < 3; c++) out[c] = (rampSum(r, hi, c) - rampSum(r, lo, c)) / w;
}

/**
 * こま (i, j) の 1 つの中に入る層の幅（層の数）。となりのこまとの差を、左右（上下）の小さい方で取る
 * （層の番号が飛ぶさかいでは、飛んだ側を使わないので、さかいがぼけない）。NaN（空気など）のこまは使わない。
 */
export function footprint(S: Float32Array, w: number, h: number, i: number, j: number): number {
  const s = S[j * w + i];
  if (!Number.isFinite(s)) return 0;
  const side = (a: number, b: number) => {
    const da = Number.isFinite(a) ? Math.abs(a - s) : Infinity;
    const db = Number.isFinite(b) ? Math.abs(b - s) : Infinity;
    const m = Math.min(da, db);
    return m === Infinity ? 0 : m;
  };
  const gx = side(i > 0 ? S[j * w + i - 1] : NaN, i < w - 1 ? S[j * w + i + 1] : NaN);
  const gy = side(j > 0 ? S[(j - 1) * w + i] : NaN, j < h - 1 ? S[(j + 1) * w + i] : NaN);
  return Math.min(PATTERN_LOOK.maxSpan, gx + gy);
}

/** 層ごとの色（r, g, b）。1 枚ずつの板の、わずかな色のちがいも入れる（同じたねなら同じ） */
export function layerTones(sim: Sim): [number, number, number][] {
  return layerColors(sim).map((c, k) => {
    const f = 1 + PATTERN_LOOK.layerTone * (2 * hash(k, 0, 21, sim.seed) - 1);
    const [r, g, b] = hexRgb(c);
    return [r * f, g * f, b * f];
  });
}

/** 色の濃淡（graded）：2 色の色 c を、濃さのとおりの間の色（明るい帯の色と地の色を、濃さで混ぜた色）へ、割合 k だけ寄せる */
function shade(ramp: LayerRamp, s: number, k: number, c: number[]): void {
  const g = toneOf(s);
  for (let q = 0; q < 3; q++) c[q] = c[q] * (1 - k) + (ramp.cols[q] * g + ramp.cols[3 + q] * (1 - g)) * k;
}

/** 上から見た面の絵（n × n）。ss 倍の細かさで計算して平均する */
export function surfaceImage(sim: Sim, n: number, ss = 1): Rgba {
  const surf = surface(sim, n * ss);
  return paintSurface(sim, surf, n, ss);
}

/** 上から見た面の帯（見る所の上から band[0]〜band[1] の行だけ）を描く範囲。n × n の絵の、j0〜j1 行 */
export function bandRows(n: number, band: readonly [number, number] = [0, 1]): [number, number] {
  const j0 = Math.max(0, Math.min(n - 1, Math.floor(band[0] * n)));
  return [j0, Math.max(j0 + 1, Math.min(n, Math.ceil(band[1] * n)))];
}

/**
 * surfaceImage を、行ごとに pause をはさんで計算する（画面が固まらないように）。stop が true を返したら null。
 * band を渡すと、見る所の上から band[0]〜band[1] の帯だけを描く（幅 n、高さは帯の分。光の当たり方は n × n の絵と同じ）
 */
export async function surfaceImageAsync(
  sim: Sim,
  n: number,
  ss: number,
  pause: () => Promise<void>,
  stop: () => boolean = () => false,
  band: readonly [number, number] = [0, 1],
): Promise<Rgba | null> {
  const N = n * ss;
  const surf = newSurface(N);
  const [j0, j1] = bandRows(n, band);
  // 帯の外の 1 行も計算する（層の幅を、となりのこまとの差で出すため）
  const J0 = Math.max(0, j0 * ss - 1);
  const J1 = Math.min(N, j1 * ss + 1);
  const chunk = Math.max(4, Math.round(24000 / N));
  for (let j = J0; j < J1; j += chunk) {
    surfaceRows(sim, surf, j, Math.min(J1, j + chunk));
    await pause();
    if (stop()) return null;
  }
  return paintSurface(sim, surf, n, ss, j0, j1);
}

function paintSurface(sim: Sim, surf: Surface, n: number, ss: number, j0 = 0, j1 = n): Rgba {
  const N = surf.n;
  const rows = j1 - j0;
  const ramp = layerRamp(layerTones(sim));
  const gap = hexRgb(PATTERN_COLORS.gap);
  const inside = hexRgb(PATTERN_COLORS.gapInside);
  const base = new Float32Array(n * rows * 3);
  const def = (i: number, j: number) => i >= 0 && j >= 0 && i < N && j < N && surf.defect[j * N + i] === 1;
  const k = ss * ss;
  const c = [0, 0, 0];
  for (let j = j0; j < j1; j++) {
    for (let i = 0; i < n; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dj = 0; dj < ss; dj++) {
        for (let di = 0; di < ss; di++) {
          const I = i * ss + di;
          const J = j * ss + dj;
          if (def(I, J)) {
            const e = !def(I - ss, J) || !def(I + ss, J) || !def(I, J - ss) || !def(I, J + ss) ? gap : inside;
            c[0] = e[0];
            c[1] = e[1];
            c[2] = e[2];
          } else {
            rampColor(ramp, surf.s[J * N + I], footprint(surf.s, N, N, I, J), c);
            if (sim.graded > 0) shade(ramp, surf.s[J * N + I], sim.graded, c);
          }
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const o = 3 * ((j - j0) * n + i);
      base[o] = r / k;
      base[o + 1] = g / k;
      base[o + 2] = b / k;
    }
  }
  return lightSurface(base, n, sim.color, j0, j1);
}

/**
 * 磨いた金属の面に、光をのせる：左上からの光と右下の陰、やわらかな照り、地のざらつき。
 * 酸で地を出したときは、明るい層がわずかに高く残るので、そのふちに陰と光をつける。
 */
function lightSurface(base: Float32Array, n: number, kind: ColorKind, j0: number, j1: number): Rgba {
  const L = PATTERN_LOOK;
  const rows = j1 - j0;
  const data = new Uint8ClampedArray(n * rows * 4);
  const lum = (i: number, j: number) => {
    const o = 3 * (Math.min(rows - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i)));
    return (0.299 * base[o] + 0.587 * base[o + 1] + 0.114 * base[o + 2]) / 255;
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n;
      const y = (j0 + j + 0.5) / n;
      const t = (x + y) / 2;
      let f = t < 0.5 ? 1 + L.light * (1 - 2 * t) : 1 - L.shadow * (2 * t - 1);
      if (kind === "etch") f += L.relief * 0.5 * (lum(i + 1, j) - lum(i - 1, j) + lum(i, j + 1) - lum(i, j - 1));
      f *= 1 + L.grain * grain(i, j0 + j);
      const add = 255 * L.sheen * Math.exp(-((x - 0.3) ** 2 + (y - 0.26) ** 2) / 0.08);
      const o = 3 * (j * n + i);
      const q = 4 * (j * n + i);
      data[q] = base[o] * f + add;
      data[q + 1] = base[o + 1] * f + add;
      data[q + 2] = base[o + 2] * f + add * 0.96;
      data[q + 3] = 255;
    }
  }
  return { w: n, h: rows, data };
}

/** 断面の絵（w × h）。空気は透明。ss 倍の細かさで計算して平均する（彫った穴のふちが、ぎざぎざにならないように） */
export function sectionImage(sim: Sim, w: number, h: number, row = 0.5, ss = 2): Rgba {
  const W = w * ss;
  const H = h * ss;
  const sec = section(sim, W, H, row);
  const ramp = layerRamp(layerTones(sim));
  const gap = hexRgb(PATTERN_COLORS.gap);
  const data = new Uint8ClampedArray(w * h * 4);
  const c = [0, 0, 0];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let m = 0;
      for (let dj = 0; dj < ss; dj++) {
        for (let di = 0; di < ss; di++) {
          const I = i * ss + di;
          const J = j * ss + dj;
          const v = sec.cells[J * W + I];
          if (v === AIR) continue;
          if (v === GAP) {
            c[0] = gap[0];
            c[1] = gap[1];
            c[2] = gap[2];
          } else {
            rampColor(ramp, sec.s[J * W + I], footprint(sec.s, W, H, I, J), c);
            if (sim.graded > 0) shade(ramp, sec.s[J * W + I], sim.graded, c);
            // 上の面（空気に接する所）に細い光
            const rim = J === 0 || sec.cells[(J - 1) * W + I] === AIR ? 1.22 : 1;
            c[0] *= rim;
            c[1] *= rim;
            c[2] *= rim;
          }
          r += c[0];
          g += c[1];
          b += c[2];
          m++;
        }
      }
      if (!m) continue;
      const o = 4 * (j * w + i);
      const f = (1.05 - 0.1 * (j / h)) * (1 + 0.03 * grain(i, j));
      data[o] = (r / m) * f;
      data[o + 1] = (g / m) * f;
      data[o + 2] = (b / m) * f;
      data[o + 3] = Math.round((255 * m) / (ss * ss));
    }
  }
  return { w, h, data };
}
