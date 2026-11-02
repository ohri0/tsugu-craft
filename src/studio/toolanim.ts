// 道具の使い方を、動く絵で見せる（こちらで描いた簡単な SVG の動き。写真や他のサイトの絵は使わない）。
// 道具の名前に含まれる言葉で、どの動きを出すかを決める。動きがない道具は null。

const METAL = "#d9b25f";
const DARK = "#2a2522";
const LINE = "#efe7d6";

function svg(body: string, css: string): string {
  return `<svg class="tool-anim" viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><style>${css}</style>${body}</svg>`;
}

/** 青棒（研磨剤）をバフに付けて、回るバフに品を当てて磨く */
function polish(): string {
  return svg(
    `<g class="buff"><circle cx="80" cy="75" r="44" fill="#e9e1cf"/><g stroke="#cfc4ab" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<line x1="80" y1="75" x2="${80 + 44 * Math.cos((i * Math.PI) / 6)}" y2="${75 + 44 * Math.sin((i * Math.PI) / 6)}"/>`).join("")}</g><circle cx="80" cy="75" r="6" fill="${DARK}"/></g>
     <rect class="bar" x="150" y="30" width="56" height="16" rx="3" fill="#3f8f6a"/><text class="t1" x="150" y="22" fill="${LINE}" font-size="11">青棒</text>
     <g class="ring"><ellipse cx="190" cy="105" rx="22" ry="12" fill="none" stroke="${METAL}" stroke-width="6"/></g><text class="t2" x="160" y="140" fill="${LINE}" font-size="11">品を当てる</text>`,
    `.buff{transform-origin:80px 75px;animation:spin .6s linear infinite}
     .bar{animation:bar 4s ease-in-out infinite}.t1{animation:t1 4s infinite}
     .ring{animation:ring 4s ease-in-out infinite}.t2{animation:t2 4s infinite}
     @keyframes spin{to{transform:rotate(360deg)}}
     @keyframes bar{0%,10%{transform:translate(0,0)}30%,45%{transform:translate(-36px,22px)}55%,100%{transform:translate(0,0)}}
     @keyframes ring{0%,55%{transform:translate(0,0)}75%,90%{transform:translate(-62px,-18px)}100%{transform:translate(0,0)}}
     @keyframes t1{0%,50%{opacity:1}55%,100%{opacity:.25}}@keyframes t2{0%,55%{opacity:.25}60%,95%{opacity:1}}`,
  );
}

/** 爪を寄せる（倒す）：爪の先を石の上へ押して、石を押さえる */
function pusher(): string {
  return svg(
    `<polygon points="60,70 180,70 160,95 80,95" fill="#cfe3f2" stroke="#9fb9cc"/><polygon points="80,95 160,95 120,128" fill="#b7d0e3"/>
     <g class="prong"><rect x="176" y="40" width="9" height="62" rx="4" fill="${METAL}"/></g><rect x="55" y="40" width="9" height="62" rx="4" fill="${METAL}"/>
     <g class="pusher"><rect x="196" y="6" width="12" height="48" rx="3" fill="#8a8178"/><rect x="198" y="-30" width="8" height="40" rx="3" fill="#6d6560"/></g>
     <text x="8" y="146" fill="${LINE}" font-size="11">爪の先を、石の上へ少しずつ寄せる</text>`,
    `.prong{transform-origin:180px 100px;animation:bend 3s ease-in-out infinite}
     .pusher{animation:push 3s ease-in-out infinite}
     @keyframes bend{0%,15%{transform:rotate(0)}55%,85%{transform:rotate(-18deg)}100%{transform:rotate(0)}}
     @keyframes push{0%,15%{transform:translate(0,0) rotate(0)}55%,85%{transform:translate(-14px,24px) rotate(-18deg)}100%{transform:translate(0,0)}}`,
  );
}

/** 座を彫る：回るバーで、爪の内側の、石の縁の高さに溝を入れる */
function seat(): string {
  return svg(
    `<rect x="70" y="20" width="14" height="110" rx="5" fill="${METAL}"/><rect x="156" y="20" width="14" height="110" rx="5" fill="${METAL}"/>
     <rect class="notch" x="80" y="58" width="5" height="6" fill="${DARK}"/><rect class="notch" x="155" y="58" width="5" height="6" fill="${DARK}"/>
     <g class="bur"><rect x="117" y="-20" width="6" height="74" fill="#9b9289"/><ellipse class="head" cx="120" cy="61" rx="13" ry="7" fill="#c9c0b5"/></g>
     <line x1="20" y1="61" x2="62" y2="61" stroke="#e9c46a" stroke-dasharray="3 3"/><text x="8" y="54" fill="#e9c46a" font-size="10">縁の高さ</text>
     <text x="8" y="146" fill="${LINE}" font-size="11">回るバーで、爪の内側に溝（座）を彫る</text>`,
    `.bur{animation:go 3.2s ease-in-out infinite}.head{animation:wob .12s linear infinite}
     .notch{opacity:0;animation:cut 3.2s infinite}
     @keyframes go{0%,10%{transform:translate(0,-30px)}30%{transform:translate(0,0)}45%,55%{transform:translate(-27px,0)}65%,75%{transform:translate(27px,0)}90%,100%{transform:translate(0,-30px)}}
     @keyframes wob{50%{transform:scaleX(.92)}}
     @keyframes cut{0%,40%{opacity:0}55%,100%{opacity:1}}`,
  );
}

/** ヤスリ：すり板に品を押し付けて、ヤスリを前に押して削る */
function file(): string {
  return svg(
    `<rect x="10" y="88" width="150" height="22" rx="3" fill="#8b6a46"/><polygon points="160,88 230,96 230,104 160,110" fill="#8b6a46"/>
     <rect x="96" y="74" width="40" height="14" fill="${METAL}"/>
     <g class="file"><rect x="40" y="60" width="120" height="12" rx="2" fill="#7c7670"/><rect x="160" y="62" width="50" height="8" rx="3" fill="#4a3f38"/>${Array.from({ length: 14 }, (_, i) => `<line x1="${44 + i * 8}" y1="61" x2="${48 + i * 8}" y2="71" stroke="#5d5853"/>`).join("")}</g>
     <text x="8" y="140" fill="${LINE}" font-size="11">押すときに削る。角度を変えず、引くときは浮かせる</text>`,
    `.file{animation:stroke 1.6s ease-in-out infinite}
     @keyframes stroke{0%{transform:translate(30px,0)}45%{transform:translate(-30px,0)}55%{transform:translate(-30px,-6px)}95%{transform:translate(30px,-6px)}100%{transform:translate(30px,0)}}`,
  );
}

/** バーナー：継ぎ目のまわり全体を温め、ロウが流れて継ぎ目に入る */
function torch(): string {
  return svg(
    `<ellipse cx="120" cy="96" rx="58" ry="22" fill="none" stroke="${METAL}" stroke-width="10"/><rect class="glow" x="104" y="102" width="32" height="20" rx="6" fill="#ff8a3d" opacity="0"/>
     <rect class="solder" x="116" y="110" width="8" height="5" fill="#f2f2f2"/>
     <g class="torch"><rect x="10" y="20" width="60" height="12" rx="4" fill="#8a8178" transform="rotate(25 40 26)"/><path class="flame" d="M70 46 q30 18 44 46 q-34 -10 -50 -36z" fill="#5aa9ff" opacity=".85"/></g>
     <text x="8" y="146" fill="${LINE}" font-size="11">まわり全体を温める。ロウが流れて継ぎ目に入る</text>`,
    `.torch{animation:sweep 3s ease-in-out infinite}.flame{transform-origin:70px 46px;animation:flick .15s infinite alternate}
     .glow{animation:glow 3s infinite}.solder{animation:melt 3s infinite}
     @keyframes sweep{0%,100%{transform:translate(-10px,0)}50%{transform:translate(14px,4px)}}
     @keyframes flick{to{transform:scale(1.06,.94)}}
     @keyframes glow{0%,40%{opacity:0}70%,100%{opacity:.75}}
     @keyframes melt{0%,60%{transform:scale(1);opacity:1}80%,100%{transform:scaleX(2.6) scaleY(.4) translate(-4px,6px);opacity:.9}}`,
  );
}

/** 道具の名前から、使い方の動きを選ぶ */
export function animFor(name: string): string | null {
  if (/青棒|バフ|研磨/.test(name)) return polish();
  if (/プッシャー|爪倒し|爪寄せ|寄せ/.test(name)) return pusher();
  if (/座彫り|ベアリングバー|ハートバー|丸バー/.test(name)) return seat();
  if (/バーナー|トーチ/.test(name)) return torch();
  if (/ヤスリ/.test(name)) return file();
  return null;
}
