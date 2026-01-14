"use client";

import { useState } from "react";
import type { TruthData } from "@/lib/api/truth";
import type { VeritasJudgement } from "@/lib/ai/veritas";
import { 
  Shield, 
  ShieldAlert, 
  ShieldX, 
  Skull,
  ArrowLeft,
  Droplets,
  TrendingUp,
  Activity,
  Bot,
  Percent,
  Lock,
  Unlock,
  Terminal
} from "lucide-react";
import { CryptoLoader } from "@/components/ui/CryptoLoader";

// =============================================================================
// TYPES
// =============================================================================

interface ScanResult {
  truth: TruthData;
  context: {
    status: string;
    flags: string[];
  };
  analysis: VeritasJudgement | null;
  meta: {
    analysisAvailable: boolean;
    analysisError: string | null;
    scanTimeMs: number;
    scannedAt: string;
    elephantMemory?: boolean;
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TruthConsole() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    if (!address.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Scan failed");
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setAddress("");
    setResult(null);
    setError(null);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Search Input */}
      {!result && !loading && (
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
              placeholder="Enter contract address..."
              disabled={loading}
              className="w-full px-4 py-3 bg-[#0A0A0B] border border-[#27272A] rounded-sm
                         text-[#FAFAFA] placeholder-[#52525B] font-mono text-sm
                         focus:outline-none focus:border-[#3F3F46]
                         disabled:opacity-50 transition-colors"
            />
          </div>

          <button
            onClick={handleScan}
            disabled={loading || !address.trim()}
            className="w-full py-3 px-4 bg-[#18181B] border border-[#27272A] 
                       hover:bg-[#27272A] hover:border-[#3F3F46]
                       disabled:opacity-40 disabled:cursor-not-allowed
                       text-[#FAFAFA] font-medium text-sm rounded-sm
                       transition-colors uppercase tracking-wide"
          >
            Analyze Token
          </button>

          {error && (
            <div className="p-3 bg-[#18181B] border border-[#7F1D1D] rounded-sm">
              <p className="text-[#FCA5A5] text-xs font-mono">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Loading State - Premium CryptoLoader */}
      {loading && (
        <CryptoLoader message="Veritas is analyzing the contract..." />
      )}

      {/* Result Card */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Back Button */}
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[#71717A] hover:text-[#A1A1AA] 
                       text-xs transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            New scan
          </button>

          {/* Verdict Section */}
          <div className="bg-[#0A0A0B] border border-[#27272A] rounded-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <VerdictBadge verdict={result.analysis?.verdict || "CAUTION"} />
              {result.meta.elephantMemory && (
                <span className="text-[#FCA5A5] text-xs font-mono uppercase">
                  Known Criminal
                </span>
              )}
            </div>
            
            {result.analysis?.headline && (
              <h2 className="text-[#FAFAFA] text-lg font-medium mb-2">
                {result.analysis.headline}
              </h2>
            )}
            
            {result.analysis?.summary && (
              <p className="text-[#A1A1AA] text-sm leading-relaxed">
                {result.analysis.summary}
              </p>
            )}
            
            {/* Sources Analyzed Badge */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#27272A]">
              <span className="text-[#52525B] text-xs">📸 Sources:</span>
              <div className="flex gap-2">
                {result.truth.tokenProfile?.website && result.truth.evidence.websiteScreenshot && (
                  <a 
                    href={result.truth.tokenProfile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#10B981] text-xs font-mono hover:underline cursor-pointer"
                  >
                    Website ✓
                  </a>
                )}
                {result.truth.tokenProfile?.twitter && result.truth.evidence.twitterScreenshot && (
                  <a 
                    href={`https://twitter.com/${result.truth.tokenProfile.twitter.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#10B981] text-xs font-mono hover:underline cursor-pointer"
                  >
                    Twitter ✓
                  </a>
                )}
                {result.truth.rugCheck && (
                  <span className="text-[#10B981] text-xs font-mono">Contract ✓</span>
                )}
              </div>
            </div>
          </div>

          {/* Lies Detected */}
          {result.analysis?.lies_detected && result.analysis.lies_detected.length > 0 && (
            <div className="bg-[#0A0A0B] border border-[#7F1D1D] rounded-sm p-4">
              <h3 className="text-[#FCA5A5] text-xs font-medium uppercase tracking-wide mb-3">
                Deception Detected
              </h3>
              <ul className="space-y-2">
                {result.analysis.lies_detected.map((lie, i) => (
                  <li key={i} className="text-[#FCA5A5] text-sm flex items-start gap-2">
                    <span className="text-[#EF4444] mt-1">•</span>
                    {lie}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Creator History - Serial Rugger Detection */}
          {result.truth.creatorHistory?.previousTokens && result.truth.creatorHistory.previousTokens.length > 0 && (
            <div className="bg-[#0A0A0B] border border-[#78350F] rounded-sm p-4">
              <h3 className="text-[#FCD34D] text-xs font-medium uppercase tracking-wide mb-3">
                ⚠️ Creator&apos;s Other Tokens ({result.truth.creatorHistory.previousTokens.length})
              </h3>
              <ul className="space-y-2">
                {result.truth.creatorHistory.previousTokens.slice(0, 5).map((token, i) => (
                  <li key={i} className="text-[#A1A1AA] text-sm flex items-center gap-2">
                    <span className="text-[#EAB308]">•</span>
                    <span className="font-mono">{token.tokenName || token.mint.slice(0, 8) + '...'}</span>
                    <span className="text-[#52525B] text-xs">
                      {new Date(token.date).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Alerts */}
          {result.context.flags.length > 0 && (
            <div className="bg-[#0A0A0B] border border-[#78350F] rounded-sm p-4">
              <h3 className="text-[#FCD34D] text-xs font-medium uppercase tracking-wide mb-3">
                Alerts
              </h3>
              <ul className="space-y-2">
                {result.context.flags.map((flag, i) => (
                  <li key={i} className="text-[#FCD34D] text-sm">
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bento Grid - Main Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Large Cards */}
            <MetricCard
              icon={<Shield className="w-4 h-4" />}
              label="Risk Score"
              value={formatRiskLevel(result.truth.rugCheck?.score ?? 0)}
              status={getRiskStatus(result.truth.rugCheck?.score ?? 0)}
              large
            />
            <MetricCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Market Cap"
              value={`$${formatNumber(result.truth.marketMetrics?.marketCap || 0)}`}
              large
            />
          </div>

          {/* Bento Grid - Secondary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard
              icon={<Droplets className="w-3.5 h-3.5" />}
              label="Liquidity"
              value={`$${formatNumber(result.truth.marketMetrics?.liquidity || 0)}`}
            />
            <MetricCard
              icon={<Activity className="w-3.5 h-3.5" />}
              label="24h Vol"
              value={`$${formatNumber(result.truth.marketMetrics?.volume24h || 0)}`}
            />
            <MetricCard
              icon={<Percent className="w-3.5 h-3.5" />}
              label="LP Ratio"
              value={calculateLPRatio(result.truth)}
            />
            <MetricCard
              icon={<Bot className="w-3.5 h-3.5" />}
              label="Bot Activity"
              value={result.truth.marketMetrics?.botActivity || "N/A"}
              status={result.truth.marketMetrics?.botActivity === "Low" ? "safe" : "warning"}
            />
          </div>

          {/* Security Flags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SecurityCard
              icon={result.truth.security.mintAuthorityEnabled ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              label="Mint Authority"
              enabled={result.truth.security.mintAuthorityEnabled}
            />
            <SecurityCard
              icon={result.truth.security.freezeAuthorityEnabled ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              label="Freeze Authority"
              enabled={result.truth.security.freezeAuthorityEnabled}
            />
          </div>

          {/* Degen Comment */}
          {result.analysis?.degen_comment && (
            <div className="bg-[#0A0A0B] border border-[#27272A] rounded-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-3.5 h-3.5 text-[#22C55E]" />
                <span className="text-[#22C55E] text-xs font-mono uppercase">Veritas</span>
              </div>
              <p className="text-[#A1A1AA] text-sm font-mono leading-relaxed">
                {result.analysis.degen_comment}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-[#52525B] text-xs font-mono pt-2">
            Analyzed in {result.meta.scanTimeMs}ms
            {!result.meta.analysisAvailable && (
              <span className="text-[#EAB308] ml-2">
                (AI unavailable: {result.meta.analysisError})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function VerdictBadge({ verdict }: { verdict: string }) {
  const config: Record<string, { 
    bg: string; 
    text: string; 
    border: string;
    icon: React.ReactNode;
  }> = {
    SAFE: { 
      bg: "bg-[#052E16]", 
      text: "text-[#22C55E]", 
      border: "border-[#166534]",
      icon: <Shield className="w-4 h-4" />
    },
    CAUTION: { 
      bg: "bg-[#422006]", 
      text: "text-[#EAB308]", 
      border: "border-[#854D0E]",
      icon: <ShieldAlert className="w-4 h-4" />
    },
    DANGER: { 
      bg: "bg-[#450A0A]", 
      text: "text-[#EF4444]", 
      border: "border-[#7F1D1D]",
      icon: <ShieldX className="w-4 h-4" />
    },
    SCAM: { 
      bg: "bg-[#450A0A]", 
      text: "text-[#FCA5A5]", 
      border: "border-[#991B1B]",
      icon: <Skull className="w-4 h-4" />
    },
  };

  const c = config[verdict] || config.CAUTION;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border ${c.bg} ${c.border}`}>
      <span className={c.text}>{c.icon}</span>
      <span className={`${c.text} text-sm font-medium uppercase tracking-wide`}>
        {verdict}
      </span>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  status,
  large = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status?: "safe" | "warning" | "danger";
  large?: boolean;
}) {
  const statusColors = {
    safe: "text-[#22C55E]",
    warning: "text-[#EAB308]",
    danger: "text-[#EF4444]",
  };

  return (
    <div className={`bg-[#0A0A0B] border border-[#27272A] rounded-sm ${large ? "p-4" : "p-3"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[#52525B]">{icon}</span>
        <span className="text-[#52525B] text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-mono ${large ? "text-lg" : "text-sm"} ${status ? statusColors[status] : "text-[#FAFAFA]"}`}>
        {value}
      </p>
    </div>
  );
}

function SecurityCard({
  icon,
  label,
  enabled,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
}) {
  return (
    <div className={`p-3 rounded-sm border ${
      enabled 
        ? "bg-[#450A0A] border-[#7F1D1D]" 
        : "bg-[#052E16] border-[#166534]"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={enabled ? "text-[#EF4444]" : "text-[#22C55E]"}>
            {icon}
          </span>
          <span className="text-[#A1A1AA] text-xs">{label}</span>
        </div>
        <span className={`text-xs font-mono ${enabled ? "text-[#EF4444]" : "text-[#22C55E]"}`}>
          {enabled ? "ENABLED" : "DISABLED"}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

/**
 * Convert RugCheck cumulative score to risk level
 * RugCheck returns cumulative risk points (can be 1000+), not percentage
 */
function formatRiskLevel(score: number): string {
  if (score === 0) return "Unknown";
  if (score <= 100) return "Low";
  if (score <= 500) return "Medium";
  if (score <= 2000) return "High";
  return "Critical";
}

function getRiskStatus(score: number): "safe" | "warning" | "danger" {
  if (score <= 100) return "safe";
  if (score <= 500) return "warning";
  return "danger";
}

function calculateLPRatio(truth: TruthData): string {
  const lp = truth.marketMetrics?.liquidity || 0;
  const mc = truth.marketMetrics?.marketCap || 1;
  const ratio = (lp / mc) * 100;
  return `${ratio.toFixed(1)}%`;
}
