# Veritas — Project Context

> **Use this file when opening a new chat.** It summarizes the codebase, architecture, and important fixes.

---

## What Veritas Is

AI-powered Solana token scam detection. Paste a token address → get a forensic verdict (Safe/Caution/Danger) with trust score, criminal profile, lies, evidence, and visual analysis.

- **Web app:** Next.js, runs at `/` with search + results
- **MCP tool:** `analyze_token` exposed via Context Protocol for AI agents
- **Tier S feature:** Gemini Vision analyzes website screenshots for Visual Asset Reuse (scam templates, fake logos, recycled imagery)

---

## Architecture

| Component | Path | Role |
|-----------|------|------|
| MCP HTTP server | `src/server-http.ts` | Express server: `/mcp` (Streamable HTTP), `/sse`, `/message`, health routes |
| Master orchestrator | `src/lib/services/VeritasInvestigator.ts` | Single entry: Elephant Memory → Data pipeline → Screenshots → AI → Result |
| AI analysis | `src/lib/ai/unified-analyzer.ts` | Gemini call with Vision; prompt includes Visual Asset Reuse detection |
| Screenshot capture | `src/lib/api/screenshot.ts` | Microlink API → base64 for Gemini |
| Env loading | `src/load-env.ts` | Loads `.env` and `.env.local` before other modules |

**Flow:** DexScreener (socials) → Microlink (screenshots) → Gemini Vision → structured `visualAnalysis` + verdict.

---

## Context Protocol (MCP) — Critical Details

### Endpoint
- **Use:** `https://veritas-mcp.onrender.com/mcp`
- **Do not use:** `/sse` or `/message` — Context expects Streamable HTTP at `/mcp`
- **Fix for "Inactive" toggle:** Adding `/mcp` with `StreamableHTTPServerTransport` and registering that URL in Context fixed the inactive tool status

### Tool
- **Name:** `analyze_token`
- **Required arg:** `tokenAddress` (Solana mint address)
- **Key output fields:** `trustScore`, `verdict`, `criminalProfile`, `lies`, `evidence`, `visualAnalysis`, `degenComment`

### Test Case 4 (Tier S verification)
- **Token:** `8J69rbLTzWWgUJziFY8jeu5tDwEPBwUz4pKBMr5rpump` (Wojak)
- **Proof field:** `visualAnalysis` — contains Gemini Vision output including `VISUAL ASSET REUSE: YES/NO`

---

## Environment

- **`src/load-env.ts`** must be imported first so `.env` and `.env.local` load before `gemini.ts` reads `process.env.GEMINI_API_KEY`
- **Required:** `GEMINI_API_KEY` (in `.env` or `.env.local`)
- **Optional:** `RUGCHECK_API_KEY`, `MONGODB_URI`, `VERITAS_SAVE_SCREENSHOTS`
- **Local run:** `npm run start:mcp` (uses `tsx src/server-http.ts`)

---

## Deployment (Render)

- **URL:** https://veritas-mcp.onrender.com
- **Start command:** `tsx src/server-http.ts` or `npm run start:mcp`
- **Env:** Set `GEMINI_API_KEY` in Render dashboard (`.env.local` is not used in production)
- **Health:** `/`, `/health`, `/ping`, `/mcp/health` all return 200 JSON

---

## Marketplace Description (Context)

Use the [MCP Server Analysis Prompt](https://github.com/ctxprotocol/sdk/blob/main/docs/mcp-server-analysis-prompt.md) format:

- One-line summary
- Features (bullets)
- Try asking (example prompts)
- Agent tips (`tokenAddress` required, etc.)

After edits: **Refresh Skills** in ctxprotocol.com/developer/tools.

---

## Quick Reference

```bash
# Local MCP server
npm run start:mcp

# Test /mcp (init + tools/call)
curl -X POST http://localhost:4000/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' -D -

# Then with session ID:
curl -X POST http://localhost:4000/mcp -H "Content-Type: application/json" \
  -H "mcp-session-id: <SESSION_ID>" -H "mcp-protocol-version: 2024-11-05" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"analyze_token","arguments":{"tokenAddress":"8J69rbLTzWWgUJziFY8jeu5tDwEPBwUz4pKBMr5rpump"}},"id":2}'
```
