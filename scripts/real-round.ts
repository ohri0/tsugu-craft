// 本物の刀の写真と、Claude の見込みの絵を並べて、作者が職人の目で直していく「回」（2026-11-08）。
// 回 0：今ある絵（Claude だけ・帳面あり。scripts/pattern-lost.ts が描いた物）を、本物の写真と目を隠してくらべ、並べた絵を作る。Claude の案は出し直さない。
// 回 1 から：作者の言葉のファイル（1 行に 1 つ。「題｜本文」と書けば題を分ける）を ledger/wootz.json に石川さんの言葉として足し、
//            帳面ありだけ本物の Claude で出し直して、描き直し、目を隠してくらべ直し、並べた絵を作る。前の回は消さない。
// 使い方：npx tsx scripts/real-round.ts <.env のある所>                 （回 0）
//         npx tsx scripts/real-round.ts <.env のある所> <言葉のファイル>  （次の回）
//         言葉のファイルに言葉が 1 つも無い（# の行だけ）なら、言葉は足さず、計算を直した回にする（並べた絵に「計算を直した（言葉は回 1 と同じ）」と書く。2026-11-08 回 2。続けて計算だけ直した回は「さらに」。回 3）
//         npx tsx scripts/real-round.ts <.env のある所> <言葉のファイル> --alt  （2026-11-08 回 4）
//           案 1 は今までどおり手がかりのとおり。そのうえで、この回に足した職人の言葉の 1 つ目を「職人の見立て」として、
//           それを試す案 2 も出してもらい、絵にして、同じく目を隠してくらべる。並べた絵は 本物｜案 1｜案 2
//           前の回の案 1（と、あれば案 2）も、くらべる中に入れ直す（並べた絵には出さない。回 5 から前の案 2 も）
//         npx tsx scripts/real-round.ts --sheet                          （Claude を呼ばず、いちばん新しい回の並べた絵だけ描き直す）
// 出すもの：docs/pattern-demo/lost/real/round-<n>/（絵・記録・judge.json・real-compare-round-<n>.png）と、いちばん新しい並べた絵 docs/pattern-demo/lost/real-compare.png
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { bookFor, loadEnv, run } from "./pattern-lost";
import { type Candidate, judgeAll, JUDGE_POINTS, type RealRef } from "./real-judge";

const DAY = "2026-11-08";
const LOST = "docs/pattern-demo/lost";
const REAL = `${LOST}/real`;
const LEDGER = "ledger/wootz.json";

/** 本物の写真（メトロポリタン美術館。パブリックドメイン。出典は research/restore/lost-wootz.md） */
export const REAL_REFS: (RealRef & { title: string; url: string })[] = [
  { id: "met-30932", file: `${REAL}/met-30932-crop.png`, title: "サーベル（刃はイラン、18〜19 世紀）", url: "https://www.metmuseum.org/art/collection/search/30932" },
  { id: "met-31130", file: `${REAL}/met-31130-crop.png`, title: "シャムシール（刃は北インド、1748〜49 年）", url: "https://www.metmuseum.org/art/collection/search/31130" },
  { id: "met-32739", file: `${REAL}/met-32739-crop.png`, title: "サーベル（ペルシャ、1777〜78 年か）", url: "https://www.metmuseum.org/art/collection/search/32739" },
];

interface WootzRule {
  id: string;
  title: string;
  text: string;
  reason: string;
  quote: string;
  source: { kind: "craftsman"; name: string };
  date: string;
  round: number;
}

function nextRound(): number {
  if (!existsSync(REAL)) return 0;
  const ns = readdirSync(REAL)
    .filter((d) => existsSync(`${REAL}/${d}/judge.json`)) // 途中で止まった回は数えない（やり直す）
    .map((d) => /^round-(\d+)$/.exec(d)?.[1])
    .filter((x): x is string => !!x)
    .map(Number);
  return ns.length ? Math.max(...ns) + 1 : 0;
}

/** 作者の言葉を帳面の決まりにする。言葉は変えない（題は「｜」の前、なければ頭の 30 字） */
function wordsToRules(text: string, round: number): WootzRule[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l, i) => {
      const [t, ...rest] = l.split("｜");
      const body = rest.length ? rest.join("｜").trim() : t.trim();
      return {
        id: `wootz-r${round}-${i + 1}-ishikawa`,
        title: (rest.length ? t.trim() : body).slice(0, 30),
        text: body,
        reason: `本物の刀の写真と見込みの絵を見くらべて、職人が言った（回 ${round}）`,
        quote: l,
        source: { kind: "craftsman", name: "石川" },
        date: DAY,
        round,
      };
    });
}

const WORD = ["まったくちがう", "少し似ている", "半分ほど似ている", "かなり似ている", "とても似ている"];
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const dataUrl = (f: string) => `data:image/${f.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(f).toString("base64")}`;

type Judged = Awaited<ReturnType<typeof judgeAll>>;

async function sheet(round: number, cols: (Candidate & { title: string; sub: string })[], judged: Judged, words: WootzRule[], out: string, note = "", honest = "") {
  const W = 72 + 360 + cols.length * 380;
  const main = REAL_REFS[0];
  const refRes = judged.results.find((r) => r.ref === main.id)!;
  const col = (c: (typeof cols)[number]) => {
    const m = judged.mean[c.tag] as { overall: number; points: Record<string, number>; orient: number };
    const one = refRes.scores.find((s) => s.tag === c.tag)!;
    return `<div class="col"><h2>${esc(c.title)}</h2><div class="sub">${esc(c.sub)}</div><img src="${dataUrl(c.file)}">
      <div class="big">近さ ${m.overall} / 10</div><div class="note">本物 3 枚とくらべた平均（目を隠した Claude の点）</div>
      <ul>${JUDGE_POINTS.map((p) => `<li><b>${p.name}</b>：${WORD[Math.round(m.points[p.key])]}（${m.points[p.key]}）</li>`).join("")}</ul>
      <div class="cm">左の写真とくらべて：「${esc(one.comment)}」</div>
      <div class="note">計算：線の向きの重なり ${m.orient}（1 なら同じ）</div></div>`;
  };
  const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#101010;color:#eee;font-family:"Hiragino Sans","Noto Sans JP",sans-serif;width:${W}px;padding:36px;box-sizing:border-box}
  h1{font-size:34px;margin:0 0 8px} .lead{color:#bbb;font-size:20px;margin-bottom:22px;line-height:1.5}
  .row{display:flex;gap:20px;align-items:flex-start} .col{width:360px} .col img{width:360px;height:360px;object-fit:cover;border-radius:6px;display:block}
  h2{font-size:26px;margin:0 0 4px;color:#e9c46a} .sub{font-size:17px;color:#aaa;min-height:48px;line-height:1.4}
  .big{font-size:30px;font-weight:700;margin-top:12px} ul{padding-left:20px;font-size:19px;line-height:1.6;margin:8px 0}
  .cm{font-size:18px;line-height:1.5;background:#1c1c1c;padding:8px 10px;border-radius:6px} .note{font-size:15px;color:#999;margin-top:4px;line-height:1.4}
  .refs{display:flex;gap:12px;margin-top:24px} .refs img{width:150px;height:150px;object-fit:cover;border-radius:4px} .refs div{font-size:14px;color:#aaa;width:150px}
  .words{margin-top:18px;font-size:19px;line-height:1.6;background:#1e1a10;padding:10px 14px;border-radius:6px}
  .foot{margin-top:22px;font-size:15px;color:#999;line-height:1.5}</style>
  <h1>本物とくらべる：ダマスカス鋼（ウーツ鋼）の模様　回 ${round}</h1>
  <div class="lead">左は本物の刀の刃の写真。右は、手がかり 6 つから本物の Claude が出した案を、計算で描いた見込み。<br>点は、別の Claude に、どれが何の絵かを隠し、順もまぜて、先に決めた 5 つの点でつけてもらった（0〜4）。</div>
  ${note ? `<div class="words"><b>${esc(note)}</b></div><br>` : ""}
  ${honest ? `<div class="words" style="background:#10161e"><b>${esc(honest)}</b></div>` : ""}
  ${words.length ? `<div class="words"><b>この回に足した職人の言葉（石川さん）</b><br>${words.map((w) => `・${esc(w.quote)}`).join("<br>")}</div><br>` : ""}
  <div class="row"><div class="col"><h2>本物（写真）</h2><div class="sub">${esc(main.title)}<br>メトロポリタン美術館・パブリックドメイン</div><img src="${dataUrl(main.file)}">
  <div class="note" style="margin-top:12px">刃の長さの向きは、上から下。絵も同じ向き。</div></div>${cols.map(col).join("")}</div>
  <div class="refs">${REAL_REFS.map((r) => `<div><img src="${dataUrl(r.file)}"><br>${esc(r.title)}</div>`).join("")}<div style="width:420px;font-size:16px">点の平均に使った本物の写真 3 枚。<br>出典：The Metropolitan Museum of Art（Open Access・パブリックドメイン）<br>${REAL_REFS.map((r) => esc(r.url.replace("https://www.", ""))).join("<br>")}</div></div>
  <div class="foot">※ 絵は、Claude が手順を計算の操作に置きかえ、形だけで描いた見込み。網目の数・のばす割合・溝の深さなどは、絵のための仮の値。熱で粒が育つことは計算しない。<br>※ 点は Claude 1 回の目で、ぶれがある。${cols.some((c) => c.tag === "solo") ? "Claude だけの絵は、毎回同じ絵を入れて、点のぶれの目安にしている。" : "前の回の絵も、くらべる中に入れ直した（並べた絵には出さない。点は judge.json）。"}記録：${esc(out.replace(/\/[^/]+$/, "/judge.json"))}</div>`;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: 800 }, deviceScaleFactor: 1 });
  await p.setContent(html);
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
}

async function main() {
  if (process.argv[2] === "--sheet") {
    // Claude を呼ばず、いちばん新しい回の judge.json から並べた絵だけ描き直す
    const round = nextRound() - 1;
    const dir = `${REAL}/round-${round}`;
    const j = JSON.parse(readFileSync(`${dir}/judge.json`, "utf8")) as Judged & { cols: (Candidate & { title: string; sub: string })[]; words: WootzRule[]; note?: string; show?: string[]; honest?: string };
    const out = `${dir}/real-compare-round-${round}.png`;
    await sheet(round, j.show ? j.cols.filter((c) => j.show!.includes(c.tag)) : j.cols, j, j.words ?? [], out, j.note ?? "", j.honest ?? "");
    copyFileSync(out, `${LOST}/real-compare.png`);
    console.log(out);
    return;
  }
  const envPath = process.argv[2];
  const wordsFile = process.argv[3];
  const withAlt = process.argv.includes("--alt");
  if (!envPath) throw new Error("使い方：npx tsx scripts/real-round.ts <.env のある所> [言葉のファイル]");
  loadEnv(envPath);
  const password = process.env.DEMO_PASSWORD!;
  const round = nextRound();
  if (round > 0 && !wordsFile) throw new Error("回 1 からは、作者の言葉のファイルが要ります");
  const dir = `${REAL}/round-${round}`;
  mkdirSync(dir, { recursive: true });
  const solo: Candidate & { title: string; sub: string } = { tag: "solo", file: `${LOST}/wootz-solo-top.png`, title: "Claude だけ", sub: "帳面なし（手がかり 6 つだけ）" };
  let words: WootzRule[] = [];
  let note = "";
  let cols: (Candidate & { title: string; sub: string })[];
  if (round === 0) {
    cols = [solo, { tag: "book-r0", file: `${LOST}/wootz-book-top.png`, title: "帳面あり", sub: "手がかり 6 つ ＋ 職人の帳面（木目金の言葉 5 つも）" }];
  } else {
    const ledger = JSON.parse(readFileSync(LEDGER, "utf8")) as { rules: WootzRule[] };
    words = wordsToRules(readFileSync(wordsFile, "utf8"), round);
    if (words.length) {
      ledger.rules.push(...words);
      writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
    } else {
      // 言葉を足さない回：帳面はそのまま。絵のちがいが、計算を直した所だけから出るように
      // 言葉を最後に足した回と、前の回も計算だけを直した回か（回 3 は「計算をさらに直した（言葉は回 1 と同じ）」。2026-11-08）
      const hasWords = (r: number) => existsSync(`${REAL}/round-${r}/words.txt`) && wordsToRules(readFileSync(`${REAL}/round-${r}/words.txt`, "utf8"), r).length > 0;
      let last = round - 1;
      while (last > 0 && !hasWords(last)) last--;
      const again = round - 1 > last ? "さらに" : "";
      note = `回 ${round}：計算を${again}直した（言葉は回 ${last} と同じ）。職人の言葉 ${ledger.rules.length} つのまま、本物の Claude で出し直した`;
    }
    writeFileSync(`${dir}/words.txt`, readFileSync(wordsFile, "utf8"));
    // 言葉を足さない回の --alt は、いちばん新しく言葉を足した回の 1 つ目を、見立てに使う（2026-11-08 回 6：計算を直して、回 5 の言葉のまま出し直す）
    let hypWords = words;
    if (withAlt && !words.length) {
      for (let r = round - 1; r > 0 && !hypWords.length; r--)
        if (existsSync(`${REAL}/round-${r}/words.txt`)) hypWords = wordsToRules(readFileSync(`${REAL}/round-${r}/words.txt`, "utf8"), r);
      if (!hypWords.length) throw new Error("--alt は、職人の言葉（見立て）が要ります");
    }
    const hyp = withAlt ? hypWords[0] : undefined;
    const alt = hyp
      ? {
          title: hyp.title,
          text:
            `職人（石川さん）の見立て「${hyp.title}」（帳面の、この題の言葉）を試す案として、案 ${2} を出してください。` +
            `その言葉のとおりの作り方（何層も重ねた金属を、叩いて折り返すことをくり返す）で、工程を組んでください。` +
            `手がかりの「材料の塊」は、板を重ねて作った物ではない、と言っています。この食いちがいは、uncertain と unknowns にはっきり書いてください。` +
            `この案は、昔の本当の作り方だと言うためではありません。職人の見立ての作り方で、本物の見た目に近づくかを試すための案です。`,
        }
      : undefined;
    await run("book", { out: dir, book: bookFor("book", ledger as never), ...(alt ? { alt } : {}) });
    if (hyp) {
      // 案 1（資料のとおり）と案 2（職人の見立て）。前の回の絵も、くらべる中に入れる（並べた絵には出さない）
      const prevTop = `${REAL}/round-${round - 1}/wootz-book-top.png`;
      cols = [
        { tag: `book-r${round - 1}`, file: prevTop, title: `帳面あり（回 ${round - 1}）`, sub: "前の回の絵" },
        { tag: `book-r${round}`, file: `${dir}/wootz-book-top.png`, title: "案 1（資料：るつぼの塊）", sub: `手がかりのとおり。職人の言葉 ${ledger.rules.length} つの帳面あり` },
        { tag: `book-r${round}-alt`, file: `${dir}/wootz-book-alt-top.png`, title: "案 2（職人の見立て）", sub: `「${hyp.title}」：何度も折り返して重ねる作り方で組んだ` },
      ];
      // 前の回にも案 2 があれば、それも入れ直す（並べた絵には出さない。2026-11-08 回 5）
      const prevAlt = `${REAL}/round-${round - 1}/wootz-book-alt-top.png`;
      if (existsSync(prevAlt)) cols.splice(1, 0, { tag: `book-r${round - 1}-alt`, file: prevAlt, title: `案 2（回 ${round - 1}）`, sub: "前の回の案 2" });
      // 2 つ前の回の案 1 も入れ直す（前の回が下がったときに、もっと前とくらべられるように。並べた絵には出さない。2026-11-08 回 6）
      const prev2 = `${REAL}/round-${round - 2}/wootz-book-top.png`;
      if (round >= 2 && existsSync(prev2)) cols.unshift({ tag: `book-r${round - 2}`, file: prev2, title: `帳面あり（回 ${round - 2}）`, sub: "2 つ前の回の絵" });
      const judged = await judgeAll(REAL_REFS, cols, password);
      const show = [`book-r${round}`, `book-r${round}-alt`];
      const honest = "ウーツ鋼は、昔は、るつぼで作った 1 つの鋼の塊から作った、と資料は言います（板を重ねた物ではない）。案 2 が本物に近く見えても、それは「その見た目に、折り返す作り方でも近づける」ということで、昔の作り方がそうだった、ということではありません。";
      writeFileSync(`${dir}/judge.json`, JSON.stringify({ date: DAY, round, cols, show, honest, words, ...(note ? { note } : {}), ...judged }, null, 2));
      const out = `${dir}/real-compare-round-${round}.png`;
      await sheet(round, cols.filter((c) => show.includes(c.tag)), judged, words, out, note, honest);
      copyFileSync(out, `${LOST}/real-compare.png`);
      console.log(JSON.stringify(judged.mean, null, 1));
      console.log(out);
      return;
    }
    const prev = round - 1 === 0 ? `${LOST}/wootz-book-top.png` : `${REAL}/round-${round - 1}/wootz-book-top.png`;
    cols = [
      solo,
      { tag: `book-r${round - 1}`, file: prev, title: `帳面あり（回 ${round - 1}）`, sub: "前の回の絵" },
      {
        tag: `book-r${round}`,
        file: `${dir}/wootz-book-top.png`,
        title: `帳面あり（回 ${round}）`,
        sub: words.length ? `本物を見た職人の言葉 ${ledger.rules.length} つを足して、出し直した` : `言葉は同じ ${ledger.rules.length} つ。直した計算で、出し直した`,
      },
    ];
  }
  const judged = await judgeAll(REAL_REFS, cols, password);
  writeFileSync(`${dir}/judge.json`, JSON.stringify({ date: DAY, round, cols, words, ...(note ? { note } : {}), ...judged }, null, 2));
  const out = `${dir}/real-compare-round-${round}.png`;
  await sheet(round, cols, judged, words, out, note);
  copyFileSync(out, `${LOST}/real-compare.png`);
  console.log(JSON.stringify(judged.mean, null, 1));
  console.log(out);
}

await main();
