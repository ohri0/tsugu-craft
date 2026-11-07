// 本物の刀の写真と、Claude の見込みの絵を、目を隠してくらべる（2026-11-08）。
// - 見る点は、先に決めて変えない（JUDGE_POINTS）。絵の名前（帳面あり・なし）は Claude に見せず、並べる順は毎回まぜる。
// - 本物の写真は「本物」と見せる。くらべる絵だけを A・B・C… と呼ぶ。
// - Claude は、画面と同じ api/claude.ts の関数を通して呼ぶ（道具なし。キーは .env から読むだけ）。
// - あわせて、計算だけの簡単なくらべ（線の向きのかたより・明るい所の割合・線の細かさ）も出す。点数を見てから絵を直すことはしない。
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

/** 先に決めた、見る点（0＝まったくちがう 〜 4＝とても似ている） */
export const JUDGE_POINTS = [
  { key: "contrast", name: "明暗", ask: "明るい線と暗い地の、差の強さと、明るい所・暗い所の割合" },
  { key: "flow", name: "流れ", ask: "流れる水のように、うねって波打つ線かどうか（まっすぐな線・角ばった形とのちがい）" },
  { key: "bands", name: "横切る段", ask: "刃を横切る段（はしご）や、輪（バラ）があるか・ないか、ある所の見え方" },
  { key: "scale", name: "細かさ", ask: "線の太さと、線と線の間の大きさ（模様の細かさ）" },
  { key: "texture", name: "つながり方", ask: "線がとぎれて点やまだらで終わる網のようか、長くつながる縞か、角ばった格子か" },
] as const;
export type PointKey = (typeof JUDGE_POINTS)[number]["key"];

export interface Candidate {
  /** 絵の名前（Claude には見せない） */
  tag: string;
  file: string;
}
export interface RealRef {
  id: string;
  file: string;
}
export interface Stats {
  /** 線の向きのかたよりが、本物とどれだけ重なるか（0〜1。1＝同じ） */
  orient: number;
  /** 明るい所（中ほどの明るさより上）の割合 */
  light: number;
  /** 明暗の差（明るさのばらつき。0〜1） */
  spread: number;
  /** 線の細かさ（1 画素あたりの明暗の変わり目の多さ。幅を 300 にそろえて数える） */
  edges: number;
}
export interface Score {
  tag: string;
  label: string;
  points: Record<PointKey, number>;
  overall: number;
  comment: string;
}
export interface JudgeResult {
  ref: string;
  order: string[];
  scores: Score[];
  stats: Record<string, Stats>;
  raw: string;
}

const N = 300;

/** 画像を幅 N にそろえて、明るさの統計を取る（ブラウザの canvas で読む） */
export async function imageStats(files: string[]): Promise<{ stats: Record<string, Stats & { hist: number[] }>; jpeg: Record<string, string> }> {
  const b = await chromium.launch();
  const p = await b.newPage();
  // tsx（esbuild）が関数に名前をつける __name を、ブラウザの側にも用意する
  await p.evaluate("window.__name = (f) => f");
  const stats: Record<string, Stats & { hist: number[] }> = {};
  const jpeg: Record<string, string> = {};
  for (const f of files) {
    const mime = f.endsWith(".png") ? "image/png" : "image/jpeg";
    const data = `data:${mime};base64,${readFileSync(f).toString("base64")}`;
    const r = await p.evaluate(
      async ({ data, N }) => {
        const img = new Image();
        img.src = data;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = N;
        c.height = N;
        const g = c.getContext("2d")!;
        g.fillStyle = "#000";
        g.fillRect(0, 0, N, N);
        g.drawImage(img, 0, 0, N, N);
        const d = g.getImageData(0, 0, N, N).data;
        const L = new Float32Array(N * N);
        for (let i = 0; i < N * N; i++) L[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
        // 明るさを 0〜1 にのばして（写真の照りのちがいを減らす）、中ほどより上を「明るい」とする
        const sorted = Array.from(L).sort((a, b) => a - b);
        const lo = sorted[Math.floor(N * N * 0.02)];
        const hi = sorted[Math.floor(N * N * 0.98)];
        const n = (v: number) => Math.min(1, Math.max(0, (v - lo) / Math.max(1e-6, hi - lo)));
        let light = 0;
        let mean = 0;
        for (let i = 0; i < N * N; i++) mean += n(L[i]);
        mean /= N * N;
        let v2 = 0;
        for (let i = 0; i < N * N; i++) {
          const x = n(L[i]);
          if (x > 0.5) light++;
          v2 += (x - mean) ** 2;
        }
        // 線の向き：明るさの傾きの向きを 12 に分け、傾きの強さで重みをつける（線の向きは、傾きに直角）
        const hist = new Array(12).fill(0);
        let edges = 0;
        for (let y = 1; y < N - 1; y++)
          for (let x = 1; x < N - 1; x++) {
            const gx = n(L[y * N + x + 1]) - n(L[y * N + x - 1]);
            const gy = n(L[(y + 1) * N + x]) - n(L[(y - 1) * N + x]);
            const m = Math.hypot(gx, gy);
            if (m > 0.3) edges++;
            let a = Math.atan2(gy, gx);
            if (a < 0) a += Math.PI;
            hist[Math.min(11, Math.floor((a / Math.PI) * 12))] += m;
          }
        const s = hist.reduce((a, b) => a + b, 0) || 1;
        const q = document.createElement("canvas");
        q.width = 512;
        q.height = Math.round((512 * img.height) / img.width);
        q.getContext("2d")!.drawImage(img, 0, 0, q.width, q.height);
        return { hist: hist.map((h) => h / s), light: light / (N * N), spread: Math.sqrt(v2 / (N * N)), edges: edges / (N * N), jpeg: q.toDataURL("image/jpeg", 0.9).split(",")[1] };
      },
      { data, N },
    );
    stats[f] = { orient: 0, light: r.light, spread: r.spread, edges: r.edges, hist: r.hist };
    jpeg[f] = r.jpeg;
  }
  await b.close();
  return { stats, jpeg };
}

function overlap(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + Math.min(x, b[i]), 0);
}

const SYSTEM = `あなたは、刀の刃の表の模様を見くらべる係です。最初の画像は本物の古い刀の刃の写真です。そのあとの画像は、計算で描いた模様の絵です。
絵が何から作られたかは知らされません。決まった点ごとに、その点で本物の写真にどれだけ似ているかを、きびしく正直に点をつけてください。
写真と絵の、撮り方・色合い・照り・画質のちがいは数えません。模様の形だけを見ます。
答えは、説明の文を書かずに、次の形の JSON だけを返してください。`;

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 本物 1 枚と絵をくらべる。順はまぜる */
export async function judgeOne(ref: RealRef, cands: Candidate[], password: string): Promise<JudgeResult> {
  const { handle } = await import("../api/claude");
  const { PASSWORD_HEADER } = await import("../src/claude/wire");
  const order = shuffle(cands);
  const labels = order.map((_, i) => String.fromCharCode(65 + i));
  const { stats, jpeg } = await imageStats([ref.file, ...order.map((c) => c.file)]);
  const shape = `{"scores":[{"label":"A","points":{${JUDGE_POINTS.map((p) => `"${p.key}":0`).join(",")}},"overall":0,"comment":"何が近く、何がちがうかを、やさしい日本語で 60 字まで"}]}`;
  const content: unknown[] = [
    { type: "text", text: "本物の刀の写真：" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg[ref.file] } },
  ];
  order.forEach((c, i) => {
    content.push({ type: "text", text: `絵 ${labels[i]}：` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg[c.file] } });
  });
  content.push({
    type: "text",
    text: `見る点（それぞれ 0＝まったくちがう、1＝少し似ている、2＝半分ほど似ている、3＝かなり似ている、4＝とても似ている）：\n${JUDGE_POINTS.map((p) => `- ${p.key}（${p.name}）：${p.ask}`).join("\n")}\noverall は、模様の形として本物にどれだけ近いかの全体の点（0〜10）。\n絵 ${labels.join("・")} のすべてに点をつけて、次の形で返してください：\n${shape}`,
  });
  const body = JSON.stringify({ system: SYSTEM, messages: [{ role: "user", content }], tools: [] });
  const res = await handle(new Request("http://localhost/api/claude", { method: "POST", headers: { "content-type": "application/json", [PASSWORD_HEADER]: encodeURIComponent(password) }, body }));
  const msg = (await res.json()) as { content?: { type: string; text?: string }[]; message?: string };
  if (res.status !== 200) throw new Error(`くらべ：${res.status} ${msg.message ?? ""}`);
  const raw = (msg.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) throw new Error(`くらべ：JSON がありません：${raw.slice(0, 200)}`);
  const parsed = JSON.parse(m[0]) as { scores: { label: string; points: Record<PointKey, number>; overall: number; comment: string }[] };
  const scores: Score[] = parsed.scores.map((s) => ({ ...s, tag: order[labels.indexOf(s.label)]?.tag ?? "?" }));
  const refHist = stats[ref.file].hist;
  const out: Record<string, Stats> = {};
  for (const [f, s] of Object.entries(stats)) {
    const tag = f === ref.file ? "本物" : order.find((c) => c.file === f)!.tag;
    out[tag] = { orient: Math.round(overlap(refHist, s.hist) * 100) / 100, light: Math.round(s.light * 100) / 100, spread: Math.round(s.spread * 100) / 100, edges: Math.round(s.edges * 1000) / 1000 };
  }
  return { ref: ref.id, order: order.map((c) => c.tag), scores, stats: out, raw };
}

/** 本物の写真のどれとも、くらべる。本物ごとの点の平均も返す */
export async function judgeAll(refs: RealRef[], cands: Candidate[], password: string) {
  const results: JudgeResult[] = [];
  for (const r of refs) results.push(await judgeOne(r, cands, password));
  const mean = Object.fromEntries(
    cands.map((c) => {
      const ss = results.map((r) => r.scores.find((s) => s.tag === c.tag)!).filter(Boolean);
      const avg = (f: (s: Score) => number) => Math.round((ss.reduce((a, s) => a + f(s), 0) / ss.length) * 10) / 10;
      const st = results.map((r) => r.stats[c.tag]);
      return [
        c.tag,
        {
          overall: avg((s) => s.overall),
          points: Object.fromEntries(JUDGE_POINTS.map((p) => [p.key, avg((s) => s.points[p.key])])),
          orient: Math.round((st.reduce((a, s) => a + s.orient, 0) / st.length) * 100) / 100,
        },
      ];
    }),
  );
  return { points: JUDGE_POINTS, results, mean };
}
