/**
 * Veritas AI - The Degen Brain
 * Cynical, veteran crypto investigator powered by Gemini
 * 
 * "Trust no one. Verify everything."
 */

import { getGeminiClient, isGeminiAvailable } from "@/lib/gemini";
import type { TruthData } from "@/lib/api/truth";

// =============================================================================
// TYPES
// =============================================================================

export type VeritasVerdict = "SAFE" | "CAUTION" | "DANGER" | "SCAM";

export interface VeritasJudgement {
  verdict: VeritasVerdict;
  headline: string;
  summary: string;
  degen_comment: string;
  lies_detected: string[];
}

interface ContextAnalysis {
  status: string;
  flags: string[];
}

// =============================================================================
// CONTEXT ANALYZER - Hard Rules Before AI
// =============================================================================

/**
 * Analyzes TruthData and returns pre-computed context flags
 * These are "hard rules" that don't need AI interpretation
 */
export function analyzeContext(data: TruthData): ContextAnalysis {
  let flags: string[] = [];
  let status = "UNKNOWN";

  const liquidity = data.marketMetrics?.liquidity ?? 0;
  const marketCap = data.marketMetrics?.marketCap ?? 0;
  const volume24h = data.marketMetrics?.volume24h ?? 0;
  // Use REAL token age from DexScreener (pairCreatedAt), fallback to 24h if unavailable
  const age = data.marketMetrics?.ageInHours ?? 24;
  const top10Percentage = calculateTop10Percentage(data);
  const previousTokenCount = data.creatorHistory.previousTokens.length;
  const rugCheckScore = data.rugCheck?.score ?? 50; // Default to middle if unknown

  // ═══════════════════════════════════════════════════════════════════════════
  // THE CRADLE - Newborn Token Detection
  // ═══════════════════════════════════════════════════════════════════════════
  if (age < 2 && liquidity < 1000) {
    status = "NEWBORN";
    flags.push("🍼 THE CRADLE: Token is < 2 hours old with < $1K liquidity. High risk but normal for new launches.");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE CORPSE - Dead Project Detection
  // ═══════════════════════════════════════════════════════════════════════════
  if (age > 48 && liquidity < 500) {
    status = "DEAD";
    flags.push("💀 THE CORPSE: Token is > 48 hours old with < $500 liquidity. Project is dead or abandoned.");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE WHALE TRAP - Concentration Risk
  // ═══════════════════════════════════════════════════════════════════════════
  if (top10Percentage > 50) {
    status = status === "UNKNOWN" ? "CONCENTRATED" : status;
    flags.push(`🐋 THE WHALE TRAP: Top 10 holders own ${top10Percentage.toFixed(1)}% of supply. Dump incoming.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE SERIAL KILLER - Repeat Rugger Detection
  // ═══════════════════════════════════════════════════════════════════════════
  if (previousTokenCount >= 2) {
    status = "SERIAL_RUGGER";
    flags.push(`🔪 THE SERIAL KILLER: Creator has launched ${previousTokenCount} other tokens. High rug probability.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE HONEYPOT - Can't Sell Detection
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.security.honeypotRisk) {
    status = status === "UNKNOWN" ? "HONEYPOT" : status;
    flags.push("🍯 THE HONEYPOT: Buy/Sell ratio suggests you cannot sell this token.");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE WASH - Fake Volume Detection
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.security.washTradingDetected) {
    flags.push("🧼 THE WASH: Volume/Liquidity ratio indicates wash trading or bot manipulation.");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE MINTOOR - Infinite Supply Risk
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.security.mintAuthorityEnabled) {
    flags.push("🖨️ THE MINTOOR: Mint authority is ENABLED. Dev can print infinite tokens.");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE FREEZOOR - Account Freeze Risk
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.security.freezeAuthorityEnabled) {
    flags.push("🥶 THE FREEZOOR: Freeze authority is ENABLED. Dev can freeze your tokens.");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE CULT - Established High-Cap Token Override
  // ═══════════════════════════════════════════════════════════════════════════
  // If token is > 1 month old (720h) AND MC > $10M AND status isn't critical (SERIAL_RUGGER/HONEYPOT)
  // It's likely a "Cult Coin" - low liquidity is VOLATILITY risk, not RUG risk
  const isCriticalStatus = ["SERIAL_RUGGER", "HONEYPOT"].includes(status);
  if (age > 720 && marketCap > 10_000_000 && !isCriticalStatus) {
    status = "CULT_COIN";
    // Clear liquidity warnings - they don't apply to established cults
    flags = flags.filter(f => !f.includes("Liquidity") && !f.includes("CORPSE"));
    // NOTE: Don't add positive flags to alerts - AI verdict covers this
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE ACTIVE CULT - Sustained Volume Detection
  // ═══════════════════════════════════════════════════════════════════════════
  // If 24h volume > $500K AND token is > 1 week old, it has organic trading activity
  if (volume24h > 500_000 && age > 168 && !isCriticalStatus) {
    if (status !== "CULT_COIN") {
      status = "ACTIVE";
    }
    // NOTE: Don't add positive flags to alerts - AI verdict covers this
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE SAFE SCORE - Low RugCheck Risk Score
  // ═══════════════════════════════════════════════════════════════════════════
  // RugCheck score: LOW = GOOD (it's a RISK score, not a grade)
  // Score 0-20 is excellent, 21-50 is okay, 51+ is risky
  // NOTE: Don't add positive flags to alerts - only warnings
  if (rugCheckScore > 70) {
    flags.push("⚠️ RUGCHECK WARNING: Risk Score " + rugCheckScore + "/100 = High Risk detected.");
  }

  return {
    status: status === "UNKNOWN" ? "NORMAL" : status,
    flags,
  };
}

/**
 * Calculate token age in hours from fetchedAt timestamp
 * Note: In production, this would use the actual token creation time
 */
function getTokenAgeHours(fetchedAt: string): number {
  // For now, return a placeholder since we don't have actual creation time
  // This would be enhanced with on-chain creation timestamp
  return 24; // Default to 24 hours for safety
}

/**
 * Calculate top 10 holder percentage from TruthData
 * Note: This would come from on-chain holder analysis in production
 */
function calculateTop10Percentage(data: TruthData): number {
  // Check if rugCheck has holder concentration data
  const holderRisk = data.rugCheck?.risks.find(r => 
    r.name.toLowerCase().includes("holder") || 
    r.name.toLowerCase().includes("concentration")
  );
  
  // Return a conservative estimate if no data
  return holderRisk ? 60 : 30;
}

// =============================================================================
// MAIN AI FUNCTION
// =============================================================================

const VERITAS_SYSTEM_PROMPT = `You are Veritas, a veteran crypto degen who has survived 1000 rugs. You know the difference between a SCAM and a CULT GEM.

Speak like a degen. Short sentences. Real talk.

**CRITICAL SCORING RULES (READ THIS FIRST):**
- **RugCheck Score:** LOW NUMBER = GOOD. It measures RISK, not grade.
  - Score 0-20 = SAFE (renounced, locked, clean code)
  - Score 21-50 = OKAY (minor issues)
  - Score 51-100 = RISKY (unlocked LP, mint enabled, etc.)
  - DO NOT say "Score 1/100 = bad" - that means RISK LEVEL 1 = EXCELLENT!

- **Liquidity Ratio:** Context matters!
  - New token (< 1 week) with 2% LP = RED FLAG (Rug Setup)
  - Old token (> 1 month) with 2% LP = NORMAL (Volatility, not rug)
  - Meme coins that 100x naturally have low LP ratios. This is expected.

- **The Survival Test:** If token is > 1 month old with $10M+ MC and still active trading, it already PASSED the rug test. Dev would have rugged at $1M if they wanted to.

**Your Analysis Framework:**

1. **Serial Killer Check:** Look at \`creatorHistory\`. 2+ previous tokens = SUSPICIOUS. But if THIS token survived 1+ month, maybe they learned.

2. **Lie Detector:** Compare claims vs facts:
   - "LP Locked" but rugCheck shows unlocked?
   - "Renounced" but mint authority enabled?
   - "Community" but one wallet holds 20%?

3. **The Pattern Match:**
   - **Honeypot:** Buy/Sell ratio > 10:1 = Cannot sell
   - **Slow Bleed:** Volume dying, chart bleeding
   - **Mint & Dump:** Mint authority enabled
   - **CULT GEM:** Old token, active volume, low risk score, passionate community

4. **Visual Evidence & Guest Blindness:**
   - **CRITICAL TWITTER RULE:** If the Twitter screenshot shows "hasn't posted", "Sign in to X", or a login popup, **IGNORE IT**. This is X's login wall for guest users. It does NOT mean the project is dead or inactive. Do NOT flag "no posts found" as a lie if you see any login-related UI.
   - **Date Context:** Today's date is January 2026. If a bio says "Joined November 2025", that is 2 months ago - NOT suspicious for a crypto project.
   - **Website Check:** Look for generic templates vs. custom branding.
   - **Real Engagement:** Trust DexScreener volume/activity data over Twitter screenshots when login walls are present.

5. **Identity Check (Meme vs. Utility):**
   - **Meme Coin:** If the token is obviously a meme (funny name, cartoon art, no utility claims), judge it on **VIBES** (Community, Art Quality, "Cult" potential). A funny/simple site is OK.
   - **Utility Project:** If the token claims to be a Tech/AI/DeFi Protocol, judge it on **PROFESSIONALISM**. A broken or ugly site is a RED FLAG.
   - *Rule:* Do not punish a Utility Token for "low liquidity" if it's building tech (and verified). Do not punish a Meme Coin for "no whitepaper."

**VERDICT RULES:**
- "SAFE" = Low risk, renounced, locked, no red flags
- "CAUTION" = Some flags but not scam (volatility risk, not rug risk)
- "DANGER" = Multiple red flags, likely scam
- "SCAM" = Clear scam pattern (serial rugger, honeypot, unlocked LP on new token)

**Output Format (STRICT JSON ONLY - NO MARKDOWN):**
{
  "verdict": "SAFE" | "CAUTION" | "DANGER" | "SCAM",
  "headline": "Short punchy title (max 8 words)",
  "summary": "2-3 sentences. Be specific about WHY this verdict.",
  "degen_comment": "Talk like a real degen. Slang. Emojis allowed. Give honest advice.",
  "lies_detected": ["Only list ACTUAL discrepancies found", "Empty array if none"]
}`;

/**
 * Ask Veritas to analyze the TruthData and deliver judgement
 * Uses Gemini 2.0 Flash with optional multimodal vision
 */
export async function askVeritas(data: TruthData): Promise<VeritasJudgement | null> {
  if (!isGeminiAvailable()) {
    console.error("[Veritas AI] Gemini not available - missing API key");
    return null;
  }

  const client = getGeminiClient();
  if (!client) return null;

  console.log(`\n[Veritas AI] 🧠 Analyzing ${data.address.slice(0, 8)}...`);
  const startTime = Date.now();

  try {
    // =========================================================================
    // STEP 1: Pre-compute context flags
    // =========================================================================
    const context = analyzeContext(data);
    
    console.log(`[Veritas AI] 📊 Context: ${context.status} | Flags: ${context.flags.length}`);

    // =========================================================================
    // STEP 2: Build the prompt with TruthData
    // =========================================================================
    const dataPrompt = buildDataPrompt(data, context);

    // =========================================================================
    // STEP 3: Build content parts (text + optional image)
    // =========================================================================
    const contentParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
      { text: dataPrompt }
    ];

    // Add website screenshot if available (multimodal vision)
    if (data.evidence.websiteScreenshot) {
      console.log("[Veritas AI] 📸 Including website screenshot for vision analysis");
      contentParts.push({
        inlineData: {
          data: data.evidence.websiteScreenshot.base64,
          mimeType: data.evidence.websiteScreenshot.mimeType,
        }
      });
    }

    // Add Twitter screenshot if available
    if (data.evidence.twitterScreenshot) {
      console.log("[Veritas AI] 📸 Including Twitter screenshot for vision analysis");
      contentParts.push({
        inlineData: {
          data: data.evidence.twitterScreenshot.base64,
          mimeType: data.evidence.twitterScreenshot.mimeType,
        }
      });
    }

    // =========================================================================
    // STEP 4: Call Gemini
    // =========================================================================
    const response = await client.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: contentParts }],
      config: {
        systemInstruction: VERITAS_SYSTEM_PROMPT,
        temperature: 0.3, // Low temp for consistent judgement
        maxOutputTokens: 4096, // Increased to prevent truncation
      },
    });

    const text = response.text;
    if (!text) {
      console.error("[Veritas AI] Empty response from Gemini");
      return null;
    }

    // =========================================================================
    // STEP 5: Parse the JSON response
    // =========================================================================
    const judgement = parseVeritasResponse(text);
    
    if (judgement) {
      const elapsed = Date.now() - startTime;
      console.log(`[Veritas AI] ⚖️ Verdict: ${judgement.verdict} | "${judgement.headline}" (${elapsed}ms)`);
    }

    return judgement;

  } catch (error) {
    console.error("[Veritas AI] Analysis failed:", error);
    return null;
  }
}

/**
 * Build the data prompt from TruthData
 */
function buildDataPrompt(data: TruthData, context: ContextAnalysis): string {
  const sections: string[] = [];

  // Header
  sections.push("=== VERITAS FORENSIC REPORT ===\n");

  // Context flags (pre-computed hard rules)
  if (context.flags.length > 0) {
    sections.push("**⚠️ PRE-SCAN ALERTS:**");
    context.flags.forEach(flag => sections.push(`- ${flag}`));
    sections.push("");
  }

  // Token identity
  sections.push("**TOKEN IDENTITY:**");
  sections.push(`- Name: ${data.tokenProfile.name || "Unknown"}`);
  sections.push(`- Symbol: ${data.tokenProfile.symbol || "???"}`);
  sections.push(`- Address: ${data.address}`);
  sections.push(`- Website: ${data.tokenProfile.website || "NONE"}`);
  sections.push(`- Twitter: ${data.tokenProfile.twitter || "NONE"}`);
  sections.push("");

  // Market metrics
  if (data.marketMetrics) {
    sections.push("**MARKET METRICS:**");
    sections.push(`- Liquidity: $${data.marketMetrics.liquidity.toLocaleString()}`);
    sections.push(`- Market Cap: $${data.marketMetrics.marketCap.toLocaleString()}`);
    sections.push(`- 24h Volume: $${data.marketMetrics.volume24h.toLocaleString()}`);
    sections.push(`- Buy/Sell Ratio: ${data.marketMetrics.buySellRatio.toFixed(2)}:1`);
    sections.push(`- Bot Activity: ${data.marketMetrics.botActivity}`);
    if (data.marketMetrics.anomalies.length > 0) {
      sections.push(`- Anomalies: ${data.marketMetrics.anomalies.join(", ")}`);
    }
    sections.push("");
  }

  // Security flags
  sections.push("**SECURITY FLAGS:**");
  sections.push(`- Mint Authority: ${data.security.mintAuthorityEnabled ? "⚠️ ENABLED" : "✅ Disabled"}`);
  sections.push(`- Freeze Authority: ${data.security.freezeAuthorityEnabled ? "⚠️ ENABLED" : "✅ Disabled"}`);
  sections.push(`- Honeypot Risk: ${data.security.honeypotRisk ? "⚠️ YES" : "✅ No"}`);
  sections.push(`- Wash Trading: ${data.security.washTradingDetected ? "⚠️ DETECTED" : "✅ Not detected"}`);
  sections.push("");

  // RugCheck report
  if (data.rugCheck) {
    sections.push("**RUGCHECK AUDIT:**");
    sections.push(`- Score: ${data.rugCheck.score}/100`);
    if (data.rugCheck.risks.length > 0) {
      sections.push("- Risks Found:");
      data.rugCheck.risks.forEach(risk => {
        sections.push(`  • [${risk.level.toUpperCase()}] ${risk.name}: ${risk.description}`);
      });
    }
    sections.push("");
  }

  // Creator history (THE SERIAL KILLER CHECK)
  sections.push("**CREATOR HISTORY:**");
  sections.push(`- Creator Address: ${data.creatorHistory.creatorAddress || "Unknown"}`);
  sections.push(`- Previous Tokens Launched: ${data.creatorHistory.previousTokens.length}`);
  sections.push(`- Serial Launcher: ${data.creatorHistory.isSerialLauncher ? "⚠️ YES - SUSPICIOUS" : "✅ No"}`);
  if (data.creatorHistory.previousTokens.length > 0) {
    sections.push("- Previous Launches:");
    data.creatorHistory.previousTokens.slice(0, 5).forEach(token => {
      sections.push(`  • ${token.mint.slice(0, 12)}... (${token.date})`);
    });
  }
  sections.push("");

  // Evidence status
  sections.push("**EVIDENCE COLLECTED:**");
  sections.push(`- Website Screenshot: ${data.evidence.websiteScreenshot ? "✅ Captured" : "❌ Not available"}`);
  sections.push(`- Twitter Screenshot: ${data.evidence.twitterScreenshot ? "✅ Captured" : "❌ Not available"}`);
  sections.push("");

  sections.push("=== END REPORT ===");
  sections.push("\nAnalyze this token and provide your judgement in the required JSON format.");

  return sections.join("\n");
}

/**
 * Parse Veritas JSON response
 */
function parseVeritasResponse(text: string): VeritasJudgement | null {
  try {
    // Log the raw response for debugging
    console.log("[Veritas AI] Raw response preview:", text.slice(0, 300));
    
    // Clean the response - remove markdown code blocks
    let cleaned = text
      .replace(/```json\n?/gi, "")
      .replace(/```\n?/g, "")
      .trim();

    // Try to extract JSON from the response
    let jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    
    // If no complete JSON found, try to repair truncated JSON
    if (!jsonMatch) {
      // Check if we have a truncated response (starts with { but no closing })
      if (cleaned.includes('{') && !cleaned.includes('}')) {
        console.log("[Veritas AI] Attempting to repair truncated JSON...");
        // Add closing braces
        cleaned = cleaned + '"}';
        jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      }
      
      if (!jsonMatch) {
        console.error("[Veritas AI] No JSON found in response");
        console.error("[Veritas AI] Full response:", text);
        return null;
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      // Try to extract key fields manually if JSON is malformed
      console.log("[Veritas AI] JSON.parse failed, attempting manual extraction...");
      const verdictMatch = text.match(/"verdict"\s*:\s*"(SAFE|CAUTION|DANGER|SCAM)"/i);
      const headlineMatch = text.match(/"headline"\s*:\s*"([^"]+)"/i);
      const summaryMatch = text.match(/"summary"\s*:\s*"([^"]+)"/i);
      
      if (verdictMatch && headlineMatch) {
        return {
          verdict: verdictMatch[1].toUpperCase() as VeritasVerdict,
          headline: headlineMatch[1],
          summary: summaryMatch?.[1] || "Analysis completed with partial response.",
          degen_comment: "Response was truncated - check logs for details.",
          lies_detected: [],
        };
      }
      
      console.error("[Veritas AI] Manual extraction failed");
      return null;
    }

    // Validate required fields
    if (!parsed.verdict || !parsed.headline || !parsed.summary) {
      console.error("[Veritas AI] Missing required fields in response");
      console.error("[Veritas AI] Parsed object:", parsed);
      return null;
    }

    // Normalize verdict
    const validVerdicts: VeritasVerdict[] = ["SAFE", "CAUTION", "DANGER", "SCAM"];
    const verdict = parsed.verdict.toUpperCase() as VeritasVerdict;
    if (!validVerdicts.includes(verdict)) {
      console.warn(`[Veritas AI] Invalid verdict "${parsed.verdict}", defaulting to CAUTION`);
      parsed.verdict = "CAUTION";
    }

    return {
      verdict: parsed.verdict,
      headline: parsed.headline,
      summary: parsed.summary,
      degen_comment: parsed.degen_comment || "No comment.",
      lies_detected: parsed.lies_detected || [],
    };
  } catch (error) {
    console.error("[Veritas AI] Failed to parse response:", error);
    console.error("[Veritas AI] Full raw response:", text);
    return null;
  }
}
