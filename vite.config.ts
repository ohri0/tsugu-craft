import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

// 開発のときだけ、/api/claude を api/claude.ts の関数につなぐ（公開先では Vercel が同じ関数を動かす）。
function claudeApiForDev(): Plugin {
  return {
    name: "tsugu-claude-api-dev",
    apply: "serve",
    configureServer(server) {
      // .env の値は、この関数（サーバー側）にだけ渡す。画面に出るのは VITE_ で始まるものだけで、キーは出ない。
      const fileEnv = loadEnv(server.config.mode, process.cwd(), "");
      for (const k of ["ANTHROPIC_API_KEY", "DEMO_PASSWORD", "DAILY_LIMIT"]) {
        if (process.env[k] === undefined && fileEnv[k] !== undefined) process.env[k] = fileEnv[k];
      }
      server.middlewares.use("/api/claude", (req: IncomingMessage, res: ServerResponse) => {
        void (async () => {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const request = new Request("http://localhost/api/claude", {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
          });
          const mod = (await server.ssrLoadModule("/api/claude.ts")) as { handle: (r: Request) => Promise<Response> };
          const response = await mod.handle(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        })().catch(() => {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: { code: "internal", message: "開発用のサーバーで失敗しました。" } }));
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [claudeApiForDev()],
  build: {
    rollupOptions: {
      // ページ：入口（index.html）、継ぐのエディター（studio.html）、見る・組み立て直す・残す（app.html）、
      // 技法の面（cad.html）、目安帳の使い道の例として残す「石座を確かめる」（ring.html）
      input: { main: "index.html", studio: "studio.html", app: "app.html", ring: "ring.html", cad: "cad.html" },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
