# 継ぐ（つぐ）

職人の判断を、聞き取り、使い、次の人へ。

職人の頭の中にある設計の判断（なぜこの形か・どこまでなら大丈夫か・何を見て駄目と言うか）を、Claude が聞き取って「目安帳」に書き残し、デザイナーや生徒の設計をその目安で確かめ、理由つきで教える道具です。最初の題材はジュエリー（一粒石の指輪）。Built with Claude: Japan 2026 の作品（テーマ #1「あなたにしかない深さを。」）。

> 作っている途中です。仕様は [docs/SPEC.md](docs/SPEC.md)、開発の記録は [docs/LOG.md](docs/LOG.md)、使った公開情報は [docs/RESEARCH.md](docs/RESEARCH.md)。

## 誰の、どんな課題か

作者はジュエリー職人。現場で時間がかかっているのは、手を動かすことより、判断を人から人へ渡すところ。

- **デザインと設計の往復**：ディレクターのラフ → デザイナーの清書 → CAD オペレーターが CAD に起こす。CAD オペレーターは設計も兼ねるので、起こす段階で「構造的に無理」に気づき、デザイナーに戻す。ここを何度も往復する。
- **教える人が足りない**：学校では 20〜30 人に先生 1〜2 人。一人ひとり別のものを作るので、質問の順番待ちが 1 時間を超えることもある。工房では、先輩が教えるほど自分の仕事が止まる。
- **めったに作らない技ほど、経験で受け継げない**：何年もかけて作り、20 年に一度しか作り直さない工芸の技は、職人が一生のうちに数回しか経験できない。担い手が急にいなくなれば、判断の理由ごと失われる。

（数字は作者の現場の数字で書き足す。公開の数字は docs/RESEARCH.md）

## 使い方

（できあがったら書く）

開発：

```
npm install
npm run dev     # 画面
npm test        # 形の処理・写真の読み取り・確かめるルール・Claude とのつなぎのテスト
```

Claude を使うときは `.env.example` を `.env` に写し、`ANTHROPIC_API_KEY` と `DEMO_PASSWORD`（公開ページの合言葉）を入れる。`npm run dev` で `/api/claude` も動く（公開先では Vercel の関数として動く）。

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

## Claude の使い方

| 機能 | 何に使ったか | なぜ |
| --- | --- | --- |
| Claude Code | 開発の中心 | （書く） |
| Skill | 職人の目安（`.claude/skills/jeweler-guides`） | 開発中の Claude もアプリの中の Claude も、同じ職人の目安を読むため |
| フック | API キーの混入を止める・形の処理を直したらテスト | 公開リポジトリにキーを入れないため。実際にテストの偽のキーで送信を止めた（LOG） |
| サブエージェント | Claude とのつなぎ・指輪の枠と確かめるルール・公開情報の調査を並行で作った | 互いに触らない部品を別の作業フォルダで同時に進めるため |
| MCP | 継ぐの道具（目安帳を読む・決まりを足す・組んで確かめる・型紙）を、Claude Desktop・Claude Code から使う（`mcp/`） | 職人がふだん使う Claude のアプリで目安帳を育て、設計を確かめられるように。画面と同じ関数・同じ決まりで動く |
| アプリの中の Claude | 職人に聞き取る・ラフを読んで組む・確かめて直す・理由つきで教える | |

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


画像を使うときは、ここに出典と利用条件を書き足す。`samples/triangle_closeup_2026-11-02.jpg` は作者が撮った写真。

## ライセンス

（大会の運営に確認してから決める）
