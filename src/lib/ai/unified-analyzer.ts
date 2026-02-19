/**
 * Veritas Unified Analyzer v3.0
 * Degen-first AI analysis. Fast. No fluff.
 * Website Vision only (Twitter killed for speed).
 */

import {
  createPartFromBase64,
  PartMediaResolutionLevel,
  ThinkingLevel,
} from "@google/genai";
import { getGeminiClient, isGeminiAvailable } from "@/lib/gemini";

export interface UnifiedAnalysisResult {
  trustScore: number;
  verdict: "Safe" | "Caution" | "Danger";
  summary: string;
  criminalProfile: string;
  lies: string[];
  evidence: string[];
  analysis: string[];
  visualAnalysis?: string;
  degenComment: string;
  urlsAnalyzed?: string[];
  thoughtSummary?: string;
}

export interface UnifiedAnalysisInput {
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  mintAuth: string | null;
  freezeAuth: string | null;
  top10Percentage: number;
  creatorPercentage?: number;
  isDumped?: boolean;
  isWhale?: boolean;
  websiteUrl?: string;
  marketData?: {
    liquidity: number;
    volume24h: number;
    marketCap: number;
    buySellRatio: number;
    ageInHours: number;
  };
  websiteScreenshot?: { base64: string; mimeType: string };
  isPumpFun?: boolean;
}

/**
 * Build the prompt — degen-first, not compliance officer
 */
function buildUnifiedPrompt(data: UnifiedAnalysisInput, hasScreenshot: boolean): string {
  let creatorStatus = "Unknown";
  if (data.isDumped) {
    creatorStatus = "DEV SOLD ALL — dumped tokens";
  } else if (data.isWhale) {
    creatorStatus = `WHALE — dev holds ${data.creatorPercentage?.toFixed(1)}%`;
  } else if (data.creatorPercentage !== undefined) {
    creatorStatus = `Holding ${data.creatorPercentage.toFixed(2)}%`;
  }

  const ageHours = data.marketData?.ageInHours ?? 0;
  const ageDisplay = ageHours >= 48
    ? `${Math.floor(ageHours / 24)} days old`
    : ageHours >= 1
    ? `${Math.floor(ageHours)} hours old`
    : "brand new (<1h)";

  const marketSection = data.marketData ? `
## MARKET DATA
- Liquidity: $${data.marketData.liquidity.toLocaleString()}
- 24h Volume: $${data.marketData.volume24h.toLocaleString()}
- Market Cap: $${data.marketData.marketCap.toLocaleString()}
- Buy/Sell Ratio: ${data.marketData.buySellRatio.toFixed(2)}:1
- Age: ${ageDisplay}
` : '';

  const pumpFunSection = data.isPumpFun ? `
## PUMP.FUN TOKEN (Standard bonding-curve)
This is a Pump.fun launch. Contract is standardized.
- Contract safety is HIGH by default. Don't flag honeypot or generic contract risks.
- Focus 90% on: dev holdings, distribution, bundle patterns, community vibes.
- Low-effort websites are NORMAL for memes. Judge by community and distribution.
` : '';

  const visionInstructions = hasScreenshot ? `
## WEBSITE SCREENSHOT ANALYSIS (CRITICAL)
A website screenshot is attached. YOU MUST analyze it with vision.

STEP 1: List every section visible (hero, tokenomics, socials, footer, etc.)
STEP 2: VISUAL ASSET REUSE DETECTION:
- Does it look like a known scam template? (generic "Buy $TOKEN" hero, copy-paste layout)
- Fake partnership logos? (Binance, CoinGecko, CertiK pasted on)
- Stolen/recycled imagery from other projects?
- Generic "Locked Liquidity" or "0% Tax" badges with no substance?
- AI-generated or stock art that looks templated?

You MUST state: "VISUAL ASSET REUSE: [YES/NO]. [Evidence]" in visualAnalysis.
` : '';

  return `
You are VERITAS — a battle-hardened CT degen who's been rekt enough times to know exactly what a rug looks like. You speak from the trenches, not a Bloomberg terminal. Short, sharp, no fluff.

YOUR MINDSET:
- Think RISK/REWARD, not pass/fail. A dev selling some tokens isn't automatically bad — it's expected.
- Not every token is a scam. Pump.fun tokens with disabled mint/freeze and decent distribution are NORMAL.
- Always NFA, DYOR. You give the raw truth so degens can decide for themselves.
- Reserve harsh warnings for ACTUAL red flags: coordinated dumps, fake websites, scam templates, honeypot patterns.
- If the on-chain data looks clean and you found nothing wrong, say so. Don't manufacture FUD.
- When you write degenComment: you are tweeting from CT. Anon, fren, the trenches, bags, send it, cooked, rekt, based — this is your natural vocabulary.

# TOKEN UNDER INVESTIGATION
- Name: ${data.tokenName} (${data.tokenSymbol})
- Contract: ${data.tokenAddress}

## ON-CHAIN FACTS (GROUND TRUTH)
- Mint Authority: ${data.mintAuth ? "ENABLED — can mint infinite tokens" : "Disabled (renounced) ✓"}
- Freeze Authority: ${data.freezeAuth ? "ENABLED — can freeze your tokens" : "Disabled (renounced) ✓"}
- Top 10 Holders: ${data.top10Percentage.toFixed(2)}% ${data.top10Percentage > 50 ? "(HIGH CONCENTRATION)" : ""}
- Creator: ${creatorStatus}
${marketSection}
${pumpFunSection}
${visionInstructions}

${data.websiteUrl ? `Website: ${data.websiteUrl}` : 'No website (common for pump.fun)'}

# OUTPUT FORMAT — Respond with ONLY this JSON:
{
  "trustScore": <0-100>,
  "verdict": "<Safe | Caution | Danger>",
  "summary": "<2 sentences max. What did you find?>",
  "criminalProfile": "<Max 8 words. e.g. 'The Template Launcher' or 'Legit Community Play'>",
  "lies": ["<Specific lie found>", "<Another if any>"],
  "evidence": ["<Key finding 1>", "<Key finding 2>"],
  "analysis": ["<Security check>", "<Market read>"],
  "visualAnalysis": "<What you SAW in the screenshot. MUST include 'VISUAL ASSET REUSE: YES/NO'. Empty string if no screenshot.>",
  "degenComment": "<2-3 SHORT punchy sentences. Write like you are tweeting from CT (crypto twitter). Use actual degen vocabulary: anon, fren, ape in/out, send it, ngmi, wagmi, cooked, rekt, bags, the trenches, mid, based, cope, moonbag, etc. Emojis mandatory. Be brutally specific to THIS token's situation — not generic advice. NFA always. BAD EXAMPLE (too corporate): 'Distribution is spread out like a proper community bag. It is a 2-month-old survivor.' GOOD EXAMPLE: 'Dev left the chat 2 months ago and this thing is still alive — that is rare in the trenches fren. Community bag, clean contract, just keep size small. Send it or miss it. NFA 🫡'>"
}

# SCORING RULES (Your trustScore must respect these caps)
- Mint/Freeze ENABLED = Max 30
- Creator DUMPED ALL = Max 45 (dumping is expected on pump.fun, penalty but not death)
- Template/scam website = Max 50
- Website claims contradict on-chain = trustScore -20
- SCAM TEMPLATE reuse (generic copy-paste layout, fake partnership logos, stolen project branding) = trustScore -25
- Meme culture reuse (Pepe, Wojak, Doge, iconic meme imagery) = NEUTRAL. Does NOT lower trustScore. It is community culture.
- Clean on-chain + no website = 55-70 (Caution — not enough info for Safe)
- Clean on-chain + legit website = 70-88
- Don't score above 88 for ANY meme coin.
${data.isPumpFun ? '- PUMP.FUN: Dev selling is common. Score mainly on distribution and red flags, not dev exit.' : ''}

# LIES FIELD RULES
- Only list ACTUAL lies (website claims vs on-chain reality)
- If you found NO lies, return ["None identified"]
- Do NOT manufacture lies. If the token looks clean, say so.
`;
}

function parseUnifiedResponse(text: string): UnifiedAnalysisResult | null {
  try {
    let jsonString = text.trim();
    const jsonBlockMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonString = jsonBlockMatch[1].trim();
    } else {
      const firstBrace = jsonString.indexOf('{');
      const lastBrace = jsonString.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonString = jsonString.slice(firstBrace, lastBrace + 1);
      }
    }

    const parsed = JSON.parse(jsonString);

    return {
      trustScore: Math.min(100, Math.max(0, Number(parsed.trustScore) || 50)),
      verdict: parsed.verdict || "Caution",
      summary: parsed.summary || "Analysis complete.",
      criminalProfile: parsed.criminalProfile || "Unknown Entity",
      lies: Array.isArray(parsed.lies) ? parsed.lies : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      analysis: Array.isArray(parsed.analysis) ? parsed.analysis : [],
      visualAnalysis: parsed.visualAnalysis,
      degenComment: parsed.degenComment || "DYOR anon. 🔍",
    };
  } catch (error) {
    console.error("[Analyzer] Failed to parse:", error);
    return null;
  }
}

export async function runUnifiedAnalysis(
  data: UnifiedAnalysisInput
): Promise<UnifiedAnalysisResult | null> {
  if (!isGeminiAvailable()) {
    console.error("[Analyzer] No Gemini API key");
    return null;
  }

  const ai = getGeminiClient();
  if (!ai) return null;

  console.log(`[Analyzer] 🕵️ Investigating ${data.tokenName}...`);

  const hasScreenshot = !!data.websiteScreenshot;
  const prompt = buildUnifiedPrompt(data, hasScreenshot);

  const contentParts: any[] = [{ text: prompt }];

  if (data.websiteScreenshot) {
    console.log("[Analyzer] 📸 Website screenshot attached");
    contentParts.push(
      createPartFromBase64(
        data.websiteScreenshot.base64,
        data.websiteScreenshot.mimeType,
        PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
      )
    );
  }

  try {
    console.log("[Analyzer] 🔍 Calling Gemini...");

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: contentParts }],
      config: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    let mainText = "";
    let thoughtSummary = "";
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const t = (part as { text?: string; thought?: boolean }).text ?? "";
      if (!t) continue;
      if ((part as { thought?: boolean }).thought) {
        thoughtSummary += t;
      } else {
        mainText += t;
      }
    }
    if (!mainText && response.text) mainText = response.text;

    console.log("[Analyzer] ✅ Response received");

    const result = parseUnifiedResponse(mainText);
    if (result) {
      result.thoughtSummary = thoughtSummary || undefined;
      console.log(`[Analyzer] 🎯 AI Verdict: ${result.verdict} (Trust: ${result.trustScore})`);
    }

    return result;
  } catch (error) {
    console.error("[Analyzer] ❌ Failed:", error);
    return null;
  }
}
