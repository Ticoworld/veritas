"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { ScanResult } from "@/types";

// =============================================================================
// VERDICT CONFIG
// =============================================================================

type VerdictKey = "APE" | "DYOR" | "RUN";

function getVerdictConfig(score: number): {
  key: VerdictKey;
  label: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
  textGlow: string;
} {
  if (score >= 70)
    return {
      key: "APE",
      label: "APE IT",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/40",
      glow: "shadow-[0_0_40px_rgba(52,211,153,0.15)]",
      textGlow: "drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]",
    };
  if (score >= 40)
    return {
      key: "DYOR",
      label: "DYOR",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/40",
      glow: "shadow-[0_0_40px_rgba(251,191,36,0.15)]",
      textGlow: "drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]",
    };
  return {
    key: "RUN",
    label: "RUN",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    glow: "shadow-[0_0_40px_rgba(248,113,113,0.15)]",
    textGlow: "drop-shadow-[0_0_12px_rgba(248,113,113,0.8)]",
  };
}

function fmt(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="bg-zinc-900/30 rounded px-3 py-1.5 flex items-center justify-between">
      <span className="text-zinc-600 text-[10px] font-mono uppercase">{label}</span>
      <span className={`text-xs font-mono ${danger ? "text-red-400" : "text-zinc-400"}`}>{value}</span>
    </div>
  );
}

// =============================================================================
// SLOW VISION — AI-Dependent render stage
// Receives the full ScanResult from /api/analyze-unified.
// The FastHUD above already shows metrics — this component shows ONLY the
// AI verdict, degen comment, visual analysis, lies, and full details.
// =============================================================================

interface SlowVisionProps {
  result: ScanResult;
  onCopy: () => void;
  copied: boolean;
}

export function SlowVision({ result, onCopy, copied }: SlowVisionProps) {
  const v = getVerdictConfig(result.trustScore);
  const [showDetails, setShowDetails] = useState(false);

  // Build red flags
  const flags: { label: string; variant: "danger" | "warn" | "meme" | "safe" }[] = [];
  if (result.onChain.mintAuth) flags.push({ label: "MINT ENABLED", variant: "danger" });
  if (result.onChain.freezeAuth) flags.push({ label: "FREEZE ENABLED", variant: "danger" });
  if (result.onChain.isDumped) flags.push({ label: "DEV DUMPED", variant: "warn" });
  if (result.onChain.isWhale)
    flags.push({ label: `DEV ${result.onChain.creatorPercentage.toFixed(0)}%`, variant: "warn" });
  if (result.onChain.top10Percentage > 50)
    flags.push({ label: `TOP10 ${result.onChain.top10Percentage.toFixed(0)}%`, variant: "warn" });
  if (result.market && result.market.liquidity < 5000)
    flags.push({ label: "LOW LIQ", variant: "danger" });
  if (result.market && result.market.botActivity === "High")
    flags.push({ label: "BOTS", variant: "warn" });
  if (result.creatorHistory?.isSerialLauncher)
    flags.push({ label: `${result.creatorHistory.previousTokens} LAUNCHES`, variant: "warn" });
  if (result.elephantMemory?.isKnownScammer)
    flags.push({ label: "KNOWN SCAMMER", variant: "danger" });

  const hasRealLies =
    result.lies.length > 0 &&
    !/^(none|no\s|no explicit|no deception|no lies)/i.test(result.lies[0]?.trim() ?? "");

  if (hasRealLies) flags.push({ label: "LIES", variant: "danger" });

  const hasVision =
    !!result.visualAnalysis &&
    !/no website|screenshot capture failed|screenshot skipped|no screenshot|social media or redirect/i.test(
      result.visualAnalysis
    );

  // NUANCED ASSET REUSE LOGIC:
  // Meme coins (Pepe, Wojak, Doge) legitimately reuse shared imagery — that's culture, not a scam.
  // Only flag SCAM TEMPLATE when Gemini's analysis explicitly describes low-effort/generic template abuse.
  const isAssetReuse =
    hasVision && /VISUAL ASSET REUSE:\s*YES/i.test(result.visualAnalysis!);
  const isMemeContext =
    isAssetReuse &&
    /meme culture|meme aesthetic|thematic|standard for|pepe|wojak|doge|iconic meme|cultural|tribute|community meme/i.test(
      result.visualAnalysis!
    );
  const isScamTemplate = isAssetReuse && !isMemeContext;
  // When Vision ran and found NO reuse — show it as a positive signal
  const isOriginalAssets = hasVision && !isAssetReuse;

  if (isScamTemplate) flags.push({ label: "SCAM TEMPLATE", variant: "danger" });
  if (isMemeContext) flags.push({ label: "MEME ASSETS", variant: "meme" });
  if (isOriginalAssets) flags.push({ label: "ORIGINAL ASSETS", variant: "safe" });

  return (
    <div className={`rounded-lg border ${v.border} ${v.glow} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/50 bg-zinc-950/80">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              v.key === "APE"
                ? "bg-emerald-400"
                : v.key === "DYOR"
                ? "bg-amber-400"
                : "bg-red-400"
            } animate-pulse`}
          />
          <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">
            Veritas Verdict
          </span>
        </div>
        <span className="text-zinc-600 text-[10px] font-mono">
          {(result.analysisTimeMs / 1000).toFixed(1)}s total
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* === VERDICT === */}
        <div className="text-center space-y-1">
          <div
            className={`text-4xl font-black font-mono tracking-widest ${v.color} ${v.textGlow}`}
          >
            {v.label}
          </div>
          <div className="flex items-center justify-center gap-3">
            <span className={`text-sm font-mono ${v.color}`}>{result.trustScore}/100</span>
            <span className="text-zinc-700">•</span>
            <span className="text-zinc-500 text-sm font-mono">{result.tokenName}</span>
          </div>
        </div>

        {/* === DEGEN COMMENT === */}
        <div className={`border ${v.border} rounded p-3 ${v.bg}`}>
          <p className={`${v.color} font-mono text-sm leading-relaxed`}>
            {result.degenComment}
          </p>
        </div>

        {/* === FLAGS === */}
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {flags.slice(0, 7).map((f, i) => (
              <span
                key={i}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide ${
                  f.variant === "danger"
                    ? "bg-red-500/10 border border-red-500/30 text-red-400"
                    : f.variant === "warn"
                    ? "bg-amber-500/10 border border-amber-500/30 text-amber-400"
                    : f.variant === "safe"
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                    : "bg-violet-500/10 border border-violet-500/30 text-violet-400"
                }`}
              >
                {f.label}
              </span>
            ))}
          </div>
        )}

        {/* === AI VISION === */}
        {hasVision && (
          <div className="border border-zinc-800 rounded p-3 bg-zinc-950/50">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span className="text-cyan-400/80 text-[10px] font-mono uppercase tracking-widest">
                AI Vision
              </span>
            </div>
            <p className="text-zinc-400 text-xs font-mono leading-relaxed whitespace-pre-wrap">
              {result.visualAnalysis}
            </p>
          </div>
        )}

        {/* === LIES === */}
        {hasRealLies && (
          <div className="border border-red-500/30 rounded p-3 bg-red-500/5">
            <span className="text-red-400 text-[10px] font-mono uppercase tracking-widest">
              Lies Detected
            </span>
            <ul className="mt-1.5 space-y-1">
              {result.lies.slice(0, 3).map((lie, i) => (
                <li
                  key={i}
                  className="text-red-400/80 text-xs font-mono flex items-start gap-2"
                >
                  <span className="text-red-500 mt-0.5">×</span>
                  <span>{lie}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* === DETAILS (collapsed) === */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full py-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors border-t border-zinc-800/50"
        >
          {showDetails ? "Hide Details ▲" : "Details ▼"}
        </button>

        {showDetails && (
          <div className="space-y-3 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <span className="text-zinc-600 text-[10px] font-mono uppercase">Profile:</span>
              <span className="text-zinc-300 text-xs font-mono">{result.criminalProfile}</span>
            </div>

            <p className="text-zinc-500 text-xs font-mono leading-relaxed">{result.summary}</p>

            <div className="grid grid-cols-2 gap-2">
              <MiniStat
                label="Mint Auth"
                value={result.onChain.mintAuth ? "ENABLED" : "Disabled"}
                danger={!!result.onChain.mintAuth}
              />
              <MiniStat
                label="Freeze Auth"
                value={result.onChain.freezeAuth ? "ENABLED" : "Disabled"}
                danger={!!result.onChain.freezeAuth}
              />
              <MiniStat label="24h Vol" value={`$${fmt(result.market?.volume24h || 0)}`} />
              <MiniStat
                label="Bots"
                value={result.market?.botActivity || "N/A"}
                danger={result.market?.botActivity === "High"}
              />
            </div>

            {result.rugCheck && result.rugCheck.risks.length > 0 && (
              <div className="border border-zinc-800 rounded p-3">
                <span className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
                  Audit Risks
                </span>
                <ul className="mt-1.5 space-y-1">
                  {result.rugCheck.risks.slice(0, 4).map((risk, i) => (
                    <li
                      key={i}
                      className="text-zinc-500 text-xs font-mono flex items-start gap-2"
                    >
                      <span
                        className={
                          risk.level === "danger"
                            ? "text-red-500"
                            : risk.level === "warn"
                            ? "text-amber-500"
                            : "text-zinc-600"
                        }
                      >
                        •
                      </span>
                      <span>{risk.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-700 text-[10px] font-mono uppercase">Sources:</span>
              {result.socials?.website && (
                <a
                  href={result.socials.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-500/70 text-[10px] font-mono hover:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded"
                >
                  Website ↗
                </a>
              )}
              {result.socials?.twitter && (
                <a
                  href={result.socials.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-500/70 text-[10px] font-mono hover:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded"
                >
                  Twitter ↗
                </a>
              )}
              <span className="text-emerald-500/70 text-[10px] font-mono border border-emerald-500/20 px-1.5 py-0.5 rounded">
                On-chain ✓
              </span>
            </div>
          </div>
        )}

        {/* === SHARE === */}
        <button
          onClick={onCopy}
          className={`w-full py-2 rounded font-mono text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2
                     ${
                       copied
                         ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
                         : "bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
                     }`}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Share Verdict
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-zinc-800/30 bg-zinc-950/50 text-center">
        <span className="text-zinc-700 text-[9px] font-mono">NFA • DYOR • Powered by Gemini</span>
      </div>
    </div>
  );
}
