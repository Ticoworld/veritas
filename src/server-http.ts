import express from "express";
import cors from "cors";
import { z } from "zod/v3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { VeritasInvestigator } from "@/lib/services/VeritasInvestigator";

const app = express();
const port = Number(process.env.MCP_PORT || process.env.PORT || 4000);

app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));

const mcpServer = new McpServer({
  name: "Veritas-Intelligence",
  version: "1.0.0",
});

const outputSchema = {
  type: "object",
  properties: {
    trustScore: { type: "number" },
    verdict: { type: "string", enum: ["Safe", "Caution", "Danger"] },
    summary: { type: "string" },
    criminalProfile: { type: "string" },
    lies: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    analysis: { type: "array", items: { type: "string" } },
    visualAnalysis: { type: "string" },
    degenComment: { type: "string" },
    thoughtSummary: { type: "string" },
    tokenAddress: { type: "string" },
    tokenName: { type: "string" },
    tokenSymbol: { type: "string" },
    onChain: {
      type: "object",
      properties: {
        mintAuth: { type: ["string", "null"] },
        freezeAuth: { type: ["string", "null"] },
        supply: { type: "number" },
        decimals: { type: "number" },
        top10Percentage: { type: "number" },
        creatorPercentage: { type: "number" },
        isDumped: { type: "boolean" },
        isWhale: { type: "boolean" },
      },
      required: [
        "mintAuth",
        "freezeAuth",
        "supply",
        "decimals",
        "top10Percentage",
        "creatorPercentage",
        "isDumped",
        "isWhale",
      ],
    },
    market: {
      type: ["object", "null"],
      properties: {
        liquidity: { type: "number" },
        volume24h: { type: "number" },
        marketCap: { type: "number" },
        buySellRatio: { type: "number" },
        ageInHours: { type: "number" },
        botActivity: { type: "string" },
        anomalies: { type: "array", items: { type: "string" } },
      },
    },
    rugCheck: {
      type: ["object", "null"],
      properties: {
        score: { type: "number" },
        risks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              level: { type: "string" },
              score: { type: "number" },
            },
            required: ["name", "description", "level", "score"],
          },
        },
      },
    },
    creatorHistory: {
      type: "object",
      properties: {
        creatorAddress: { type: "string" },
        previousTokens: { type: "number" },
        isSerialLauncher: { type: "boolean" },
      },
      required: ["creatorAddress", "previousTokens", "isSerialLauncher"],
    },
    socials: {
      type: "object",
      properties: {
        website: { type: "string" },
        twitter: { type: "string" },
        telegram: { type: "string" },
        discord: { type: "string" },
      },
    },
    elephantMemory: {
      type: "object",
      properties: {
        isKnownScammer: { type: "boolean" },
        previousFlags: { type: ["object", "null"] },
      },
      required: ["isKnownScammer"],
    },
    analyzedAt: { type: "string" },
    analysisTimeMs: { type: "number" },
  },
  required: [
    "trustScore",
    "verdict",
    "summary",
    "criminalProfile",
    "lies",
    "evidence",
    "analysis",
    "degenComment",
    "tokenAddress",
    "tokenName",
    "tokenSymbol",
    "onChain",
    "creatorHistory",
    "socials",
    "elephantMemory",
    "analyzedAt",
    "analysisTimeMs",
  ],
} as const;
const toolDefinition = {
  name: "analyze_token",
  description:
    "A forensic intelligence engine for Solana. YOU MUST PASS THE 'tokenAddress' ARGUMENT.",
  inputSchema: z.object({
    tokenAddress: z
      .string()
      .describe(
        "The exact Solana token mint address to analyze (e.g., 993wscPZQkXJ28K9xNn1a5C1Z1k1111111111111111)"
      ),
  }),
  outputSchema,
} as const;

const handler = async ({ tokenAddress }: { tokenAddress: string }) => {
    try {
      const investigator = new VeritasInvestigator();
      const result = await investigator.investigate(tokenAddress);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(mcpServer as any).tool(
  toolDefinition.name,
  toolDefinition.description,
  toolDefinition.inputSchema,
  handler,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { outputSchema: toolDefinition.outputSchema } as any
);

let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  try {
    transport = new SSEServerTransport("/message", res);
    await mcpServer.connect(transport);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[MCP HTTP] SSE connection error:", message);
    res.status(500).end();
  }
});

app.post("/message", (req, res) => {
  if (!transport) {
    res.status(503).json({ error: "SSE not initialized. Connect to /sse first." });
    return;
  }
  transport.handlePostMessage(req, res);
});

app.options("/message", (_, res) => res.sendStatus(204));
app.options("/sse", (_, res) => res.sendStatus(204));

app.listen(port, () => {
  console.log(`[MCP HTTP] Veritas-Intelligence listening on :${port}`);
  console.log(`[MCP HTTP] SSE endpoint:  /sse`);
  console.log(`[MCP HTTP] POST endpoint: /message`);
});
