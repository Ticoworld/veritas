import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { VeritasInvestigator } from "@/lib/services/VeritasInvestigator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  async (server) => {
    server.registerTool(
      "analyze_token",
      {
        title: "Analyze Token",
        description: "Analyze a Solana token for fraud risk using Veritas.",
        inputSchema: z.object({
          tokenAddress: z.string().describe("Solana token mint address"),
        }),
      },
      async ({ tokenAddress }) => {
        try {
          const investigator = new VeritasInvestigator();
          const result = await investigator.investigate(tokenAddress);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text", text: JSON.stringify({ error: message }) }],
            isError: true,
          };
        }
      }
    );
  },
  {},
  {
    basePath: "/api/mcp",
    maxDuration: 60,
    verboseLogs: true,
    disableSse: false,
  }
);

export { handler as GET, handler as POST };

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
