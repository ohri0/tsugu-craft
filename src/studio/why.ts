// 「なぜ継ぐ」のページ：デザインと CAD の往復、20 年に一度の技と職人の一生、残し方。
// 図は SVG と CSS で描く（動画にもこのページを映す。スライドは使わない）。
// 年の数字は作者（職人）の言葉から：すべての種類を一通り作るのに 10 年近く、作り直しは 20 年に一度。

/** 職人の一生（例）と、作り直しの年（図のための例。特定の計画ではない） */
export const LIFE = { start: 22, end: 65, cycle: 20, build: 9 };

/** 一人の職人が、一生のうちに関われる作り直しの回数（作る期間が少しでも重なれば 1 回と数える） */
export function chances(start: number, end: number, cycle: number, build: number, offset = 0): number {
  let n = 0;
  for (let y = offset; y < 120; y += cycle) if (y + build > start && y < end) n++;
  return n;
}

const x = (age: number) => 70 + (age - 15) * 8;

function lifeSvg(): string {
  const rows: string[] = [];
  // 作り直し：20 年ごとに、10 年近くかけて作る
  for (let y = 12; y < 75; y += LIFE.cycle) rows.push(`<rect class="w-build" x="${x(y)}" y="34" width="${LIFE.build * 8}" height="14" rx="3"/><text class="w-t" x="${x(y) + 4}" y="62">作る 10 年近く</text>`);
  const marks = [20, 30, 40, 50, 60, 70].map((a) => `<line class="w-grid" x1="${x(a)}" y1="24" x2="${x(a)}" y2="140"/><text class="w-ax" x="${x(a)}" y="156" text-anchor="middle">${a} 歳</text>`).join("");
  const roles = [
    { at: 32, t: "1 回目：教わる" },
    { at: 52, t: "2 回目：中心で作る・教える" },
  ];
  return `<svg class="w-life" viewBox="0 0 620 170" role="img" aria-label="20 年に一度の作り直しと、職人の一生">
    ${marks}
    <text class="w-lab" x="0" y="45">作り直し</text>
    ${rows.join("")}
    <text class="w-lab" x="0" y="106">職人</text>
    <rect class="w-life-bar" x="${x(LIFE.start)}" y="96" width="${(LIFE.end - LIFE.start) * 8}" height="14" rx="7"/>
    ${roles.map((r) => `<circle class="w-dot" cx="${x(r.at)}" cy="103" r="5"/><text class="w-t" x="${x(r.at) - 6}" y="128">${r.t}</text>`).join("")}
  </svg>`;
}

export function whyHtml(): string {
  return `<div class="why-in">
  <button type="button" class="why-close" aria-label="閉じる">×</button>
  <p class="why-k">なぜ継ぐ</p>

  <section class="why-sec">
    <h2>描いて、戻されて、また描く。</h2>
    <p>ジュエリーは、ディレクターのラフ、デザイナーの清書、CAD、製作と進みます。CAD の段で「これは作れない」と分かると、デザイナーへ戻る。その往復のたびに、待つ時間と費用がかかり、思った物と違う物ができることもあります。</p>
    <div class="flow">
      <div class="flow-col">
        <h4>これまで</h4>
        <ol class="flow-l old">
          <li><b>ディレクター</b><small>ラフ</small></li>
          <li class="loop-a"><b>デザイナー</b><small>清書</small></li>
          <li class="loop-b"><b>CAD オペレーター</b><small>設計</small></li>
          <li><b>製作</b><small>職人・工房</small></li>
        </ol>
        <div class="loop" aria-hidden="true"><span class="ball"></span><em class="say s1">これは作れない</em><em class="say s2">では、これは？</em></div>
      </div>
      <div class="flow-col">
        <h4>継ぐ</h4>
        <ol class="flow-l new">
          <li><b>言葉・絵・石の写真</b><small>誰でも</small></li>
          <li class="hub"><b>継ぐ</b><small>形・作れるか・作り方・図面</small></li>
          <li><b>製作</b><small>鋳造・鍛造</small></li>
        </ol>
      </div>
    </div>
  </section>

  <section class="why-sec">
    <h2>20 年に一度の技は、繰り返しでは覚えられない。</h2>
    <p>後継ぎが足りない技、できる人が限られた技があります。たとえば、何年もかけて作り、20 年に一度しか作り直さない技。すべての種類を一通り作るだけで 10 年近く。一人の職人が一生のうちに関われるのは、2 回か 3 回。もしもの時、技は途切れてしまう。</p>
    ${lifeSvg()}
    <p class="why-note">図は例。年の数字は職人の話から。一点物の石やデザインも同じで、同じ物は二度と来ません。</p>
  </section>

  <section class="why-sec">
    <h2>だから、作るたびに残す。</h2>
    <ol class="why-steps">
      <li><b>作る</b><span>形・作れるか・作り方・図面が、そのまま残る。</span></li>
      <li><b>話す</b><span>職人が話すと、Claude が工程ごとのコツに整理する。</span></li>
      <li><b>継ぐ</b><span>次に作る人の作り方に「前の記録から」と出る。</span></li>
    </ol>
    <button type="button" class="btn primary lg why-go">はじめる</button>
  </section>
</div>`;
}
