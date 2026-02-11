import express from "express";
import cors from "cors";
import { z } from "zod";
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

mcpServer.tool(
  "analyze_token",
  {
    tokenAddress: z.string().describe("Solana token mint address to analyze for fraud risk"),
  },
  async ({ tokenAddress }) => {
    try {
      const investigator = new VeritasInvestigator();
      const result = await investigator.investigate(tokenAddress);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  }
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
