# 継ぐ（つぐ）

**職人の判断と手を、次の人へ。**

何年もかけ、限られた職人だけで作り継がれる伝統の技がある。作る機会はめったになく、一人いなくなれば、判断の理由も、手の動きも失われる。
「継ぐ」は、職人が「何を見て・どこまでなら・なぜ」そう決めるのかを Claude が聞き取って **技の帳面** に残し、手の動きを作業の動画から記録し、次に学ぶ人の設計や質問にその帳面で答える道具です。師弟の継承の代わりではなく、**もしも教える人がいなくなったときの備え**。最初の題材は、作者自身の仕事であるジュエリー。

Built with Claude: Japan 2026 の作品（テーマ #1「あなたにしかない深さを。」）。

> 作っている途中です。仕様は [docs/SPEC.md](docs/SPEC.md)、開発の記録（試行錯誤）は [docs/LOG.md](docs/LOG.md)、動画の絵コンテは [docs/DEMO.md](docs/DEMO.md)、使った公開情報は [docs/RESEARCH.md](docs/RESEARCH.md) と [docs/RESEARCH-rules.md](docs/RESEARCH-rules.md)。

## 誰の、どんな課題か

作者はジュエリー職人。現場で時間がかかり、失われやすいのは、手を動かすことより、判断を人から人へ渡すところ。

- **めったに作らない技ほど、経験で受け継げない**：形も技法も一つひとつ違うものを、すべて作り終えるまでに何年もかかる。それを 20 年に一度くり返す技は、一人の職人が一生のうちに数えるほどしか経験できない。修業を短くすれば済む話ではない。
- **教える人が足りない**：学校では 20〜30 人に先生 1〜2 人。一人ひとり別のものを作るので、質問の順番待ちが 1 時間を超えることもある。工房では、先輩が教えるほど自分の仕事が止まる。
- **デザインと設計の往復**：デザイナーの絵が、CAD の段階で「構造的に無理」と分かって戻される。その判断は、ベテランの頭の中にある。

## 4 つの画面

| 画面 | すること | 状態 |
| --- | --- | --- |
| **帳面**（最初の画面） | 職人の決まりを、名前・日付・理由・職人の言葉そのまま・石の大きさ別の値と一緒にためる。置き換えた古い決まりも履歴に残る。アプリがなくても読める 1 枚（技の帳面）に印刷できる | 動く |
| **残す** | 聞き取り：Claude が一つずつ質問し、答えを決まりの案にまとめ、職人が承認・直す・見送る。手の記録：作業の動画から手の骨格を追い、リズム・振れ幅・間を数字にし、職人の一言を動画の時刻と一緒に残す。手本と比べられる。一言はそのまま帳面の決まりの下書きにできる | 画面と仕組みは動く。聞き取りは API キーを入れて試すところ。手の記録は本物の手の動画で試すところ |
| **確かめる**（題材：ジュエリー） | 石の写真から輪郭と尖った角を読み、指輪（爪・V 字の爪・覆輪・腕）を 3D で組み、帳面の決まりで確かめる。無理な所は赤く、根拠の決まり（誰の・いつの）と、見た目への影響つきの直し方が出る。原寸の型紙と指示書を印刷できる | 動く（本物の三角の石の写真で、輪郭が縁に合い、角を 3 か所見つけた） |
| **教える** | 生徒の「なぜ？」に帳面の理由で答える。帳面にない質問は、似た質問をまとめて「先生に聞くこと」へ。先生の答えが新しい決まりになる | 画面と仕組みは動く。API キーを入れて試すところ |

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
| アプリの中の Claude | 職人に聞き取って決まりにする（propose_rule）・設計を道具で組んで確かめて直す（set_setting / set_shank / check / look）・生徒に帳面の理由で答え、答えられない質問を先生へ回す（ask_teacher） | Claude は答えを決めるのではなく、職人の決まりを読んで選び、理由を残す役。道具の実行は画面の中、API キーはサーバーの関数だけが持つ |

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


画像を使うときは、ここに出典と利用条件を書き足す。`samples/triangle_closeup_2026-11-02.jpg` は作者が撮った写真。

## ライセンス

（大会の運営に確認してから決める）
