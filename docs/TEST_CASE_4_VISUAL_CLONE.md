# Test Case 4: The Visual Clone — Tier S Verification

**For:** Alex @ Context Protocol  
**Re:** Veritas grant — Visual Asset Reuse Detection (Gemini Vision)

---

## 1. Summary

Veritas implements **Visual Asset Reuse Detection** via **Gemini Vision**. The `analyze_token` tool:

1. Fetches the token's website URL from DexScreener (when available)
2. Captures a full-page screenshot via Microlink
3. Sends the screenshot to Gemini as a base64 image
4. Gemini performs **computer vision analysis** and returns structured output including `visualAnalysis`

**The `visualAnalysis` field in the JSON response is the proof that Gemini Vision analyzed the visual assets.**

---

## 2. Implementation Details

| Component | Location | What it does |
|-----------|----------|--------------|
| Screenshot capture | `src/lib/api/screenshot.ts` | `fetchScreenshotAsBase64()` — captures website via Microlink API |
| Data pipeline | `src/lib/services/VeritasInvestigator.ts` | Phase 3: Fetches website + Twitter screenshots; Phase 4: Passes to AI |
| Vision + prompt | `src/lib/ai/unified-analyzer.ts` | `createPartFromBase64()` attaches images; prompt instructs Gemini to detect scam templates, fake logos, recycled design |
| MCP output | `src/server-http.ts` | `visualAnalysis` included in tool response schema |

---

## 3. Output Field: `visualAnalysis`

**Schema:** `visualAnalysis: string | null`

**When populated (token has a website):** Contains Gemini Vision's analysis, including:
- Enumeration of what was seen (hero, tokenomics, socials, footer)
- **VISUAL ASSET REUSE: [YES/NO]** — explicit assessment
- Evidence of template design, fake partnership logos, recycled imagery, layout similarities to known scam sites

**When null/empty (no website):** e.g. `"No visual evidence available. The investigation confirms there is no website or social media profile attached to the mint."`

---

## 4. How to Run Test Case 4

### Prerequisites
- `GEMINI_API_KEY` must be set (Render deployment has it)
- Token must have a **website URL** in DexScreener data (many Pump.fun tokens do not)

### Step 1: Find a token with a website

Use DexScreener or similar to find a Solana token that links to a project website. Tokens with scam-style template sites often have:
- Generic "Buy $TOKEN" hero
- Fake "Locked Liquidity" or "Audited" badges
- Pasted Binance/CoinGecko logos

### Step 2: Call `analyze_token`

```bash
# Via Context / MCP
# Or locally:
curl -X POST https://veritas-mcp.onrender.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{...},"id":1}'
# Then tools/call with tokenAddress
```

### Step 3: Inspect the response

Look at the `visualAnalysis` field. If the token has a website, it will contain:
- A description of what Gemini saw in the screenshot
- **VISUAL ASSET REUSE: YES** or **NO** with specific evidence

**Example (template scam site):**
```json
{
  "visualAnalysis": "VISUAL ASSET REUSE: YES. Hero section shows generic 'Buy $TOKEN' CTA. Fake 'Locked Liquidity' badge with CertiK-style logo. Layout matches common Pump.fun scam template: single hero, no roadmap, stock gradient background. No team section. Footer has generic disclaimer. Design appears recycled from known rug sites."
}
```

**Example (no website):**
```json
{
  "visualAnalysis": "No visual evidence available. The investigation confirms there is no website or social media profile attached to the mint. It is a 'naked' contract with a generic name."
}
```

---

## 5. Suggested Test Tokens

**Tokens with websites (will populate `visualAnalysis`):**

| Token Address | Website | Notes |
|---------------|---------|-------|
| `fgQkxC7HbmZD7LS5YPKFww5xQJWoVo7GYddRGtxpump` | https://allocore.xyz | Custom project site |
| `962SGZ4A1yDDAqyoVTVmRb64ViKunUuqHqbop4VWpump` | https://www.cleothe.codes/ | Custom dev site |
| `GCazDbM4UiLaQW3oajgKtCHsbZHQUJcZmVCMHXfTpump` | https://tinkerbots.app/ | Custom project |
| `DcnZzHmbNy6DjPYfKiribzfoRbbZtBRVcFUoCtEash9b` | https://bonk.fun/token/... | Dex/bonk.fun page |

**For Visual Clone (scam template) test:** Browse DexScreener for tokens with generic landing pages (e.g. "Buy $TOKEN" hero, fake badges). Many Pump.fun tokens have **no website**, so `visualAnalysis` will say "No visual evidence available" — that still proves the pipeline runs; Vision analysis fires when a screenshot exists.

---

## 6. Code References

- **Screenshot → Gemini:** `src/lib/ai/unified-analyzer.ts` lines 296–318 (`createPartFromBase64`, `contentParts`)
- **Visual Asset Reuse prompt:** `src/lib/ai/unified-analyzer.ts` — "STEP 2: VISUAL ASSET REUSE DETECTION"
- **Output mapping:** `src/lib/services/VeritasInvestigator.ts` line 308 — `visualAnalysis: aiResult.visualAnalysis`

---

## 7. Description Update (per Alex's PS)

After verifying the Vision integration, we will update the Context marketplace description using the [MCP Server Analysis Prompt](https://github.com/ctxprotocol/sdk/blob/main/docs/mcp-server-analysis-prompt.md) and refresh skills.

---

## 8. Email Response Template for Alex

**Subject:** Re: Veritas Grant — Test Case 4: Visual Asset Reuse (Tier S)

Hi Alex,

**1. Token address with website (for Visual Analysis proof):**

`fgQkxC7HbmZD7LS5YPKFww5xQJWoVo7GYddRGtxpump` — has website https://allocore.xyz

(Alternative: `962SGZ4A1yDDAqyoVTVmRb64ViKunUuqHqbop4VWpump` — https://www.cleothe.codes/)

**2. Output field proving Gemini Vision analyzed the assets:**

The **`visualAnalysis`** field in the JSON response.

When the token has a website:
- We capture a full-page screenshot via Microlink
- Send it to Gemini as a base64 image
- Gemini returns structured output including `visualAnalysis` with a description of what it saw
- The prompt now explicitly asks for **"VISUAL ASSET REUSE: [YES/NO]"** with evidence (template design, fake logos, recycled imagery)

When the token has no website:
- `visualAnalysis` will say e.g. "No visual evidence available. The investigation confirms there is no website or social media profile attached to the mint."

**3. How to verify:**
Call `analyze_token` with one of the addresses above via Context (or directly to the MCP endpoint). Inspect the `visualAnalysis` field in the response — it will contain Gemini Vision's analysis.

Full implementation details: `docs/TEST_CASE_4_VISUAL_CLONE.md` in the repo.

Best,  
Timothy
