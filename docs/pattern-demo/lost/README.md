# 本当に途切れた技：ダマスカス鋼（ウーツ鋼）の模様（2026-11-08）

架空の技ではなく、本当に作り方が途切れた技を、途切れた技の流れ（手がかり → Claude の案 → 模様の見込み）に通した記録。

- 手がかり 6 つは公開の資料から書いた（`scripts/pattern-lost.ts` の `LOST_CLUES`。資料と、分かっていること・分からないことは `research/restore/lost-wootz.md`）。はしごの段の作り方は、昔のやり方が分からないので、手がかりに入れていない。
- Claude の返事は本物（画面と同じ `api/claude.ts` の関数）。手を加えていない。
- 絵は形だけの見込み。重ねずに 1 つの鋳た塊から始める操作 `ingot` で描いた。塊の中の網目のむらは、説の形を借りた仮の物（網目の数・太さ・とぎれ方は仮）。熱の上げ下げで粒が育つことは計算しない。

| ファイル | 中身 |
|---|---|
| `wootz-solo-*` | 職人の帳面を外して（Claude だけ） |
| `wootz-book-*` | 職人の帳面を渡して（2026-11-08 に足した石川さんの言葉 5 つも入る） |
| `wootz-old-*` | 帳面を渡すが、2026-11-08 の 5 つだけ外す |
| `*-top.png`・`*-section.png`・`*-stage<n>.png` | 出来上がりの表・断面・途中の段 |
| `cases/wootz-*.log.md` | 案の工程（帳面の印・もともとの知識の印）と、操作と仮の値 |
| `cases/wootz-*.json` | 記録のファイル（画面の「ファイルを読み込む」で開ける） |
| `damascus-compare.png` | 帳面なし・ありを並べた絵と工程 |
| `beat-candidate*.png` | 動画 2:46 の場面の候補（上：ダマスカス鋼、下：架空の技） |
| `wootz-book-flow-01〜09.png` | 画面の流れ（幅 1440。Claude の返事は残した本物の返事を同じ順で返して撮った） |

作り直し方：`npx tsx scripts/pattern-lost.ts <.env のある所> [solo book old]`、絵だけなら `--render`。並べた絵は `node scripts/lost-compose.cjs`。
画面の流れは、開発用のサーバーを立てて `node scripts/pattern-flow-shots.cjs <URL の頭> wootz-book docs/pattern-demo/lost`。

絵はほぼ同じだった。ちがうのは、はしごの段と色を出す工程の根拠（帳面なしでは Claude の推し量り、帳面ありでは職人の帳面の言葉）。
