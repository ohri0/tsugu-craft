# Stone Fit

その石にしかない指輪を、写真から。

石の写真と、ノギスまたは 1 円玉だけで、その石に合う一粒リングを 3 案出し、職人がそのまま作れる原寸の型紙と指示書にして渡す道具です。Built with Claude: Japan 2026 の作品（テーマ #1「あなたにしかない深さを。」）。

> 作っている途中です。仕様は [docs/SPEC.md](docs/SPEC.md)、開発の記録は [docs/LOG.md](docs/LOG.md)。

## 誰の、どんな課題か

（作者の現場の言葉と数字で書く）

## 使い方

（できあがったら書く）

開発：

```
npm install
npm run dev     # 画面
npm test        # 形の処理・写真の読み取り・目安の式のテスト
```

Claude を使うときは `.env.example` を `.env` に写し、`ANTHROPIC_API_KEY` と `DEMO_PASSWORD`（公開ページの合言葉）を入れる。`npm run dev` で `/api/claude` も動く（公開先では Vercel の関数として動く）。

## Claude の使い方

| 機能 | 何に使ったか | なぜ |
| --- | --- | --- |
| Claude Code | 開発の中心 | （書く） |
| Skill | 職人の目安（`.claude/skills/jeweler-guides`） | 開発中の Claude もアプリの中の Claude も、同じ職人の目安を読むため |
| フック | API キーの混入を止める・形の処理を直したらテスト | （書く） |
| サブエージェント | （書く） | |
| MCP | （書く） | |
| アプリの中の Claude | 石を読む・3 案・道具で組んで確かめて直す | |

## 使っているもの（ライセンス）

| 名前 | 用途 | ライセンス |
| --- | --- | --- |
| [three.js](https://github.com/mrdoob/three.js) | 3D の表示 | MIT |
| [Vite](https://github.com/vitejs/vite) | 開発用のサーバーと組み立て | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | 言語 | Apache-2.0 |
| [Vitest](https://github.com/vitest-dev/vitest) | テスト | MIT |
| [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)（`@anthropic-ai/sdk`） | Claude API を呼ぶ（`api/claude.ts`）。画面は型だけ使う | Apache-2.0 |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | serverless 関数（Node）の型 | MIT |

## ライセンス

（大会の運営に確認してから決める）
