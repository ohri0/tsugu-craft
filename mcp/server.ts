// 継ぐの MCP サーバー（標準入出力でつなぐ）。Claude Desktop や Claude Code から、
// 目安帳を読む・職人の決まりを足す・指輪を組んで確かめる・型紙を出す・途切れた技の模様の見込みを描く、を直接使えるようにする。
// 標準出力は MCP のやり取りだけに使うので、知らせは標準エラーに出す。
// 画面の src/claude/prompt.ts は Vite でしか読めない書き方（?raw）なので、ここからは読み込まない。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defaultLedgerPath } from "./ledger-file";
import { listPatternOps, PATTERN_DESCRIPTIONS, simulatePatternShape, simulatePatternTool } from "./pattern";
import {
  checkRingShape,
  checkRingTool,
  defaultContext,
  DESCRIPTIONS,
  ledgerAsText,
  listRules,
  listRulesShape,
  patternSvgShape,
  patternSvgTool,
  proposeRule,
  proposeRuleShape,
  type ToolContext,
} from "./tools";

const LEDGER_URI = "tsugu://ledger/jewelry";

/** 結果を JSON の文章にして返す。失敗はその理由を Claude に見せる（サーバーは止めない） */
function reply(run: () => unknown) {
  try {
    const result = run();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text" as const, text: `うまくいきませんでした：${e instanceof Error ? e.message : String(e)}` }] };
  }
}

export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "tsugu", version: "0.1.0" });

  server.registerTool(
    "list_rules",
    { title: "目安帳を読む", description: DESCRIPTIONS.list_rules, inputSchema: listRulesShape, annotations: { readOnlyHint: true } },
    async (input) => reply(() => listRules(ctx, input)),
  );

  server.registerTool(
    "propose_rule",
    { title: "職人の決まりを目安帳に足す", description: DESCRIPTIONS.propose_rule, inputSchema: proposeRuleShape, annotations: { destructiveHint: false } },
    async (input) => reply(() => proposeRule(ctx, input)),
  );

  server.registerTool(
    "check_ring",
    { title: "指輪を組んで確かめる", description: DESCRIPTIONS.check_ring, inputSchema: checkRingShape, annotations: { readOnlyHint: true } },
    async (input) => reply(() => checkRingTool(ctx, input)),
  );

  server.registerTool(
    "pattern_svg",
    { title: "原寸の型紙を出す", description: DESCRIPTIONS.pattern_svg, inputSchema: patternSvgShape },
    async (input) => {
      try {
        const { svg, ...rest } = patternSvgTool(ctx, input);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rest, null, 2) },
            { type: "text" as const, text: svg },
          ],
        };
      } catch (e) {
        return { isError: true, content: [{ type: "text" as const, text: `うまくいきませんでした：${e instanceof Error ? e.message : String(e)}` }] };
      }
    },
  );

  server.registerTool(
    "list_pattern_ops",
    { title: "模様の見込みの操作の一覧", description: PATTERN_DESCRIPTIONS.list_pattern_ops, annotations: { readOnlyHint: true } },
    async () => reply(() => listPatternOps()),
  );

  server.registerTool(
    "simulate_pattern",
    { title: "模様の見込みの絵を描く（形だけの見込み）", description: PATTERN_DESCRIPTIONS.simulate_pattern, inputSchema: simulatePatternShape, annotations: { destructiveHint: false } },
    async (input) => {
      try {
        const { text, result, images } = await simulatePatternTool(ctx, input);
        return {
          content: [
            { type: "text" as const, text },
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
            ...images.map((img) => ({ type: "image" as const, data: img.png.toString("base64"), mimeType: "image/png" })),
          ],
        };
      } catch (e) {
        return { isError: true, content: [{ type: "text" as const, text: `うまくいきませんでした：${e instanceof Error ? e.message : String(e)}` }] };
      }
    },
  );

  server.registerResource(
    "ledger",
    LEDGER_URI,
    { title: "目安帳（ジュエリー）", description: "今効いている職人の決まりを、理由と出どころつきの文章で", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: ledgerAsText(ctx) }] }),
  );

  server.registerPrompt(
    "ledger_context",
    { title: "目安帳を読んでから話す", description: "目安帳の決まりを会話の最初に読み込む（設計の相談・生徒の「なぜ？」に答えるとき）" },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "次は継ぐの目安帳（職人の決まり）です。設計を確かめるときや「なぜ？」に答えるときは、この決まりと理由を使い、どの決まりか（誰の・いつの）を添えてください。" +
              "目安帳に答えがないこと・職人でないと決められないことは「先生に聞くこと」として分けてください。\n\n" +
              ledgerAsText(ctx),
          },
        },
      ],
    }),
  );

  return server;
}

async function main() {
  const ledgerPath = defaultLedgerPath();
  const server = createServer(defaultContext(ledgerPath));
  await server.connect(new StdioServerTransport());
  process.stderr.write(`継ぐの MCP サーバーを始めました（目安帳：${ledgerPath}）\n`);
}

main().catch((e) => {
  process.stderr.write(`継ぐの MCP サーバーを始められませんでした：${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
