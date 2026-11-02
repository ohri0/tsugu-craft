# 継ぐ（つぐ）

**ジュエリーが「作れるか」を確かめ、「どう作るか」を道具まで示し、作った物ごとに記録を残す。**

公開しているページ：https://tsugu-craft.vercel.app/ （Claude を使う所は、合言葉が要ります）

入口（はじめの説明のページ）は [/](https://tsugu-craft.vercel.app/)、エディターは [studio.html](https://tsugu-craft.vercel.app/studio.html)。

デザイナーの絵が、製作の段階で「これは作れない」と分かって戻ってくる。その判断と作り方は、職人の頭の中にしかない。
職人は同じ物を繰り返して覚える。でも一点物の石やデザインは、二度と同じ物が来ない。
「継ぐ」は、石の写真や絵、希望の言葉から Claude が形を組み、作れるかを確かめ、手作りと鋳造の作り方を数字と道具で示し、作った物ごとに記録を残して、次の人がそこから始められるようにする道具です。最初の題材は、作者自身の仕事である指輪（一粒石の指輪、甲丸・平打ちの指輪）。

Built with Claude: Japan 2026 の作品（テーマ #1「あなたにしかない深さを。」）。作者は宝飾の彫金職人。

> 開発の記録（試行錯誤）は [docs/LOG.md](docs/LOG.md)、動画の絵コンテは [docs/DEMO.md](docs/DEMO.md)、使った公開情報は [docs/RESEARCH.md](docs/RESEARCH.md)・[docs/RESEARCH-rules.md](docs/RESEARCH-rules.md)・[research/](research/)。

## 誰の、どんな課題か

- **デザインと製作の往復**：デザイナーの絵が、CAD や製作の段階で「構造的に無理」と分かって戻される。爪の太さ、石と指のすき間、尖った角の守り方。その判断は、ベテランの頭の中にある。
- **教える人が足りない**：学校では 20〜30 人に先生 1〜2 人。工房では、先輩が教えるほど自分の仕事が止まる。
- **めったに作らない技ほど、経験で受け継げない**：形も技法も一つひとつ違うものを、すべて作り終えるまでに何年もかかる。それを 20 年に一度くり返す技は、一人の職人が一生のうちに数えるほどしか経験できない。

## 使い方（最初の画面）

CAD のような画面です。上のタブ（1〜4 のキーでも）で場面を切り替えます。左は見る向き・目盛り・寸法、3D の左上で「ワイヤー／シェード／レンダー」を切り替えます。

| 場面 | すること |
| --- | --- |
| **生む** | 作る物を選ぶ（一粒石の指輪／甲丸・平打ちの指輪）。石は写真（白い紙の上で真上から）か、よくある形（ラウンド・オーバル・スクエア・エメラルド・ペア・マーキス）。あればデザイナーの絵。下の欄に希望の言葉を書いて「生む」。Claude が形を組み、確かめ、作れない所を直す。作業が一行ずつ見え、できないことは「まだできないこと」と正直に出る |
| **確かめる** | 作れるかを出す。3D の上に寸法の線（内径・石・すき間・高さ）が出て、目安を外れた所は赤。直すボタンで直る。手でも変えられる |
| **作る** | 鋳造と鍛造を切り替え、工程ごとに、この形から計算した数字・地金の温度の目安・道具を出す。「詳しく」で細かい手順、点線の言葉を押すと意味。図面（正面・側面・上面、寸法と表題欄、A4 横）と作り方・原寸の型紙を選んで印刷。3D データ（STL） |
| **記録** | 「この作品の記録を残す」で、職人が話すと、Claude が工程ごとのコツ・注意・判断に分けて残す。次に同じ工程を作る人の画面に「前の記録から」と出る。一覧と記録の帳面の印刷 |
| **なぜ継ぐ**（右上） | デザインと CAD の往復の図と、20 年に一度の技と職人の一生の図 |

開くと、作者が撮った本物の石（淡い青の三角、長辺 8.88 mm・深さ 4.24 mm）の写真から、輪郭 → 立体の石 → 指輪の順に組み上がります。合言葉がなくても、決まりごとから作った案で、確かめる・作る・記録まで使えます。数字は目安で、最後は職人が決めます。

## ほかの道具

- **組み立て直す**（[app.html#rebuild](https://tsugu-craft.vercel.app/app.html#rebuild)）：作り方が途切れた技を、残っている品物と材料の手がかりだけから Claude が組み立て、隠しておいた本当の作り方と答え合わせをする。工程ごとに根拠の手がかりの番号か「もともとの知識から」を書かせ、分けて数える（言語モデルが学習のときに読んでいたかもしれないので）。最初の題材は木目金。
- **残す**（[app.html#keep](https://tsugu-craft.vercel.app/app.html#keep)）：学ぶ人から届いた質問に、職人が声か動画で答える。答えは帳面に入る。
- 前に作った画面（石座を確かめる）は [ring.html](https://tsugu-craft.vercel.app/ring.html) に残している。

## MCP サーバー（Claude のアプリから使う）

職人がふだん使っている Claude のアプリ（Claude Desktop・Claude Code）から、継ぐの道具を直接使える。API キーは要らない（アプリの Claude が道具を呼ぶ）。

| 道具 | すること |
| --- | --- |
| `list_rules` | 目安帳を読む（出どころ・日付つき。置き換えた古い決まりも見られる） |
| `propose_rule` | 職人の決まりを目安帳に足す。同じ値の決まりは置き換え、古い決まりは履歴に残る |
| `check_ring` | 石と設計から指輪を組み、目安帳で確かめる。問題に「誰のどの決まりか」と直し方（見た目への影響つき）を添え、石の一番下と指のすき間・地金の重さも返す |
| `pattern_svg` | 原寸の型紙（A4 の SVG）を返す。`out/` に書き出すこともできる |

目安帳そのもの（`tsugu://ledger/jewelry`）と、会話の最初に目安帳を読み込むプロンプト（`ledger_context`）も出している。

**なぜ MCP か**：職人が目安帳を育てる場所と、設計を確かめる場所を、職人がもう使っている Claude のアプリにするため。画面と同じ関数・同じ決まりで確かめるので、どちらで確かめても答えが同じになる。目安帳はリポジトリの `ledger/jewelry.json` に書き込まれ、コミットすれば「誰がいつ何を変えたか」が git の履歴に残る（画面の目安帳はブラウザの中に残り、JSON で書き出し・読み込みできる）。

用意（最初の 1 回）：

```
npm install
npm run ledger:init   # ledger/jewelry.json を出発点の目安帳から作る（もうあれば何もしない）
```

Claude Code に足す（リポジトリのいちばん上で）：

```
claude mcp add tsugu -- "$PWD/node_modules/.bin/tsx" "$PWD/mcp/server.ts"
```

Claude Desktop に足す（設定の「開発者」→ 設定ファイル `claude_desktop_config.json` に。パスはリポジトリを置いた所に直す）：

```json
{
  "mcpServers": {
    "tsugu": {
      "command": "/path/to/tsugu-craft/node_modules/.bin/tsx",
      "args": ["/path/to/tsugu-craft/mcp/server.ts"]
    }
  }
}
```

- `npm run mcp` でも始まるが、npm が最初に出す行が MCP のやり取りに混ざるので、アプリの設定では上のように `tsx` を直接呼ぶ（`npm run --silent mcp` でもよい）。
- Claude Desktop が `node` を見つけられないとき（nvm などで入れたとき）は、`command` を node の絶対パス（`which node` で分かる）にし、`args` を `["/path/to/tsugu-craft/node_modules/tsx/dist/cli.mjs", "/path/to/tsugu-craft/mcp/server.ts"]` にする。
- 別の目安帳のファイルを使うときは、環境変数 `TSUGU_LEDGER` にそのパスを入れる。
- 試し方の例：「三角の石（長辺 8.88 mm、深さ 4.35 mm）で、爪を標準の 0.8 倍にした指輪を確かめて」「石の一番下は指から 1 mm 離す、という決まりを作者の名前で足して」。

## 開発の進め方（アカウント）

開発は作者の Claude アカウントで始め、そのアカウントのクレジットが切れたら、大会で配布されたアカウントに移って続ける。2 つのアカウントを同時には使わない。作ったもの・決めたこと・次にやることはすべてこのリポジトリ（`docs/NEXT.md` など）にあるので、移った後も同じ続きから進められる。移った日はここに書く。

- 移った日：（まだ）

## Claude の使い方

| 機能 | 何に使ったか | なぜ |
| --- | --- | --- |
| Claude Code | 開発の中心。仕様書と決まり（CLAUDE.md）を読み、作者と話しながら、画面・形の処理・写真の読み取り・確かめるルール・Claude とのつなぎ・MCP・手の記録を書いた。うまくいかなかったことと直し方を記録に残した | 職人の話をその場で仕様と動くものに変え、試行錯誤を回す速さのため |
| Skill | 職人の目安（`.claude/skills/jeweler-guides`） | 開発中の Claude もアプリの中の Claude も、同じ職人の目安を読むため |
| フック | API キーの混入を止める・形の処理を直したらテスト | 公開リポジトリにキーを入れないため。実際にテストの偽のキーで送信を止めた（LOG） |
| サブエージェント | Claude とのつなぎ・指輪の枠と確かめるルール・教える・MCP・手の記録・3D の作り直し・公開情報の調査を、別の作業フォルダで並行に作り、取り込んだ | 互いに触らない部品を同時に進め、一人（作者）の 6 日間で全体をそろえるため |
| MCP | 継ぐの道具（目安帳を読む・決まりを足す・組んで確かめる・型紙）を、Claude Desktop・Claude Code から使う（`mcp/`） | 職人がふだん使う Claude のアプリで目安帳を育て、設計を確かめられるように。画面と同じ関数・同じ決まりで動く |
| アプリの中の Claude | 指輪を道具で組み、帳面の決まりで確かめて直す（set_setting / set_shank / check / look。作業の記録を一行ずつ見せ、全部戻せる）・職人の話を決まりの案にする（propose_rule）・途切れた技を手がかりから組み立て、隠した答えと照らす（propose_process / grade_process）・学ぶ人の質問に帳面の理由で答え、答えられない質問を職人に回す（ask_teacher） | Claude は答えを決めるのではなく、職人の決まりを読んで選び、理由を残す役。道具の実行は画面の中、API キーはサーバーの関数だけが持つ。画面の前で待つ作業は考える量を少なくして速く返す |

## 使っているもの（ライセンス）

| 名前 | 用途 | ライセンス |
| --- | --- | --- |
| [three.js](https://github.com/mrdoob/three.js) | 3D の表示 | MIT |
| [Vite](https://github.com/vitejs/vite) | 開発用のサーバーと組み立て | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | 言語 | Apache-2.0 |
| [Vitest](https://github.com/vitest-dev/vitest) | テスト | MIT |
| [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)（`@anthropic-ai/sdk`） | Claude API を呼ぶ（`api/claude.ts`）。画面は型だけ使う | Apache-2.0 |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | serverless 関数（Node）の型 | MIT |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)（`@modelcontextprotocol/sdk`） | MCP サーバー（`mcp/`）で、Claude のアプリに道具を出す | MIT |
| [Zod](https://github.com/colinhacks/zod) | MCP の道具の入力の形を決めて確かめる | MIT |
| [tsx](https://github.com/privatenumber/tsx) | MCP サーバーと目安帳を作る小さな処理を、TypeScript のまま動かす | MIT |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe)（`@mediapipe/tasks-vision`） | 手の記録：動画から手の位置（21 点）をブラウザの中で読む。wasm はこのパッケージのものを一緒に配る | Apache-2.0 |
| [MediaPipe の手の点を読むモデル](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)（`hand_landmarker.task`、float16） | 手の記録で使うモデル。使うときに Google の配布先から読み込む（リポジトリには入れない） | Apache-2.0 |


画像を使うときは、ここに出典と利用条件を書き足す。`samples/triangle_closeup_2026-11-02.jpg` と、同じ写真の `public/stones/triangle.jpg` は作者が撮った写真（撮影情報は消してある）。

## ライセンス

（大会の運営に確認してから決める）
