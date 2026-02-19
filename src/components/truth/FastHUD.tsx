"use client";

import { Terminal, Zap } from "lucide-react";
import type { FastResult } from "@/types";

function fmt(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

function fmtAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded p-2 text-center">
      <div className="text-zinc-600 text-[9px] font-mono uppercase tracking-widest mb-0.5">{label}</div>
      <div className="text-zinc-200 text-sm font-mono font-medium">{value}</div>
    </div>
  );
}

interface FastHUDProps {
  result: FastResult;
}

export function FastHUD({ result }: FastHUDProps) {
  const flags: { label: string; variant: "danger" | "warn" | "info" }[] = [];

  if (result.elephantMemory.isKnownScammer)
    flags.push({ label: "KNOWN SCAMMER", variant: "danger" });
  if (result.onChain.mintAuth)
    flags.push({ label: "MINT ENABLED", variant: "danger" });
  if (result.onChain.freezeAuth)
    flags.push({ label: "FREEZE ENABLED", variant: "danger" });
  if (result.onChain.isDumped)
    flags.push({ label: "DEV DUMPED", variant: "warn" });
  if (result.onChain.isWhale)
    flags.push({ label: `DEV ${result.onChain.creatorPercentage.toFixed(0)}%`, variant: "warn" });
  if (result.onChain.top10Percentage > 50)
    flags.push({ label: `TOP10 ${result.onChain.top10Percentage.toFixed(0)}%`, variant: "warn" });
  if (result.market && result.market.liquidity < 5000)
    flags.push({ label: "LOW LIQ", variant: "danger" });
  if (result.market && result.market.botActivity === "High")
    flags.push({ label: "BOTS", variant: "warn" });
  if (result.creatorHistory.isSerialLauncher)
    flags.push({ label: `${result.creatorHistory.previousTokens} LAUNCHES`, variant: "warn" });

  // Preliminary score color
  const scoreColor =
    result.deterministicScore >= 70
      ? "text-emerald-400"
      : result.deterministicScore >= 40
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div className="rounded-lg border border-zinc-800/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/50 bg-zinc-950/80">
        <div className="flex items-center gap-2">
          <Terminal className="w-3 h-3 text-zinc-600" />
          <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">
            On-Chain Data
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-emerald-500/60" />
          <span className="text-emerald-500/60 text-[10px] font-mono">
            {(result.analysisTimeMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Token identity */}
        <div className="flex items-baseline gap-2">
          <span className="text-zinc-200 text-base font-mono font-semibold">
            {result.tokenName}
          </span>
          <span className="text-zinc-600 text-xs font-mono">{result.tokenSymbol}</span>
          <span className="ml-auto text-zinc-700 text-[10px] font-mono truncate max-w-[120px]">
            {result.tokenAddress.slice(0, 4)}…{result.tokenAddress.slice(-4)}
          </span>
        </div>

        {/* 4-column metrics */}
        <div className="grid grid-cols-4 gap-2">
          <Metric label="LIQ" value={`$${fmt(result.market?.liquidity || 0)}`} />
          <Metric label="MCAP" value={`$${fmt(result.market?.marketCap || 0)}`} />
          <Metric label="TOP 10" value={`${result.onChain.top10Percentage.toFixed(1)}%`} />
          <Metric label="AGE" value={result.market ? fmtAge(result.market.ageInHours) : "N/A"} />
        </div>

        {/* Flags */}
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {flags.slice(0, 6).map((f, i) => (
              <span
                key={i}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide ${
                  f.variant === "danger"
                    ? "bg-red-500/10 border border-red-500/30 text-red-400"
                    : "bg-amber-500/10 border border-amber-500/30 text-amber-400"
                }`}
              >
                {f.label}
              </span>
            ))}
          </div>
        )}

        {/* Preliminary score */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-700 text-[10px] font-mono uppercase tracking-widest">
            Preliminary Score
          </span>
          <span className={`text-sm font-mono font-bold ${scoreColor}`}>
            {result.deterministicScore}/100
          </span>
          <span className="text-zinc-700 text-[10px] font-mono">(AI finalizing…)</span>
        </div>

        {/* RugCheck risks if any */}
        {result.rugCheck && result.rugCheck.risks.length > 0 && (
          <div className="border border-zinc-800 rounded p-2.5">
            <span className="text-zinc-600 text-[9px] font-mono uppercase tracking-widest">
              Audit Flags
            </span>
            <ul className="mt-1 space-y-0.5">
              {result.rugCheck.risks.slice(0, 3).map((risk, i) => (
                <li key={i} className="flex items-start gap-1.5 text-zinc-500 text-[11px] font-mono">
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
      </div>
    </div>
  );
}
