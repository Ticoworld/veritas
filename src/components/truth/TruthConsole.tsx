"use client";

import { useState, useRef } from "react";
import { Terminal } from "lucide-react";
import { FastHUD } from "./FastHUD";
import { SlowVision } from "./SlowVision";
import { SkeletonFastHUD } from "./skeletons/SkeletonFastHUD";
import { SkeletonSlowVision } from "./skeletons/SkeletonSlowVision";
import type { FastResult, ScanResult } from "@/types";

// =============================================================================
// FETCH STATUS TYPE
// =============================================================================

type FetchStatus = "idle" | "loading" | "done" | "error";

// =============================================================================
// TRUTH CONSOLE — Dual-Fetch Progressive Rendering
//
// Two independent requests fire concurrently on "Scan":
//   Request A → /api/analyze-fast   (~2s)  → renders FastHUD instantly
//   Request B → /api/analyze-unified (~15s) → replaces SkeletonSlowVision
//
// Two AbortController refs prevent race conditions: if the user scans a second
// token mid-flight, both controllers cancel their in-flight requests before new
// ones begin. This ensures token A's SlowVision never resolves into token B's
// FastHUD.
//
// /api/analyze-unified is the live MCP tool — it is NEVER modified.
// This component only adds a concurrent shadow call.
// =============================================================================

export function TruthConsole() {
  const [address, setAddress] = useState("");

  // Fast channel (on-chain + market, ~2s)
  const [fastResult, setFastResult] = useState<FastResult | null>(null);
  const [fastStatus, setFastStatus] = useState<FetchStatus>("idle");

  // Slow channel (full AI verdict, ~15s)
  const [slowResult, setSlowResult] = useState<ScanResult | null>(null);
  const [slowStatus, setSlowStatus] = useState<FetchStatus>("idle");

  // Shared top-level error (fast failure); slow errors are shown inline
  const [error, setError] = useState<string | null>(null);

  // Copy state lives here, passed down to SlowVision's Share button
  const [copied, setCopied] = useState(false);

  // One AbortController per channel — cancelled on every new scan
  const fastAbortRef = useRef<AbortController | null>(null);
  const slowAbortRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // FETCH FAST — /api/analyze-fast
  // ---------------------------------------------------------------------------
  async function _fetchFast(addr: string, signal: AbortSignal) {
    try {
      const res = await fetch("/api/analyze-fast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr }),
        signal,
      });
      if (signal.aborted) return;
      const data = await res.json();
      if (signal.aborted) return;
      if (!res.ok || !data.success) throw new Error(data.error || "Fast scan failed");
      setFastResult(data.data as FastResult);
      setFastStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFastStatus("error");
      setError(err instanceof Error ? err.message : "Fast scan failed");
    }
  }

  // ---------------------------------------------------------------------------
  // FETCH SLOW — /api/analyze-unified (MCP route — read-only, never touched)
  // ---------------------------------------------------------------------------
  async function _fetchSlow(addr: string, signal: AbortSignal) {
    try {
      const res = await fetch("/api/analyze-unified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr }),
        signal,
      });
      if (signal.aborted) return;
      const data = await res.json();
      if (signal.aborted) return;
      if (!res.ok || !data.success) throw new Error(data.error || "Analysis failed");
      setSlowResult(data.data as ScanResult);
      setSlowStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSlowStatus("error");
    }
  }

  // ---------------------------------------------------------------------------
  // HANDLE SCAN — fires both channels concurrently, never awaited together
  // ---------------------------------------------------------------------------
  const handleScan = () => {
    const addr = address.trim();
    if (!addr || fastStatus === "loading" || slowStatus === "loading") return;

    // Cancel stale in-flight requests
    fastAbortRef.current?.abort();
    slowAbortRef.current?.abort();

    const fastAbort = new AbortController();
    const slowAbort = new AbortController();
    fastAbortRef.current = fastAbort;
    slowAbortRef.current = slowAbort;

    // Reset all state before new scan
    setFastResult(null);
    setSlowResult(null);
    setFastStatus("loading");
    setSlowStatus("loading");
    setError(null);
    setCopied(false);

    // Fire both — independent, no await dependency
    _fetchFast(addr, fastAbort.signal);
    _fetchSlow(addr, slowAbort.signal);
  };

  const handleCopyVerdict = () => {
    if (!slowResult) return;
    const score = slowResult.trustScore;
    const label = score >= 70 ? "APE IT" : score >= 40 ? "DYOR" : "RUN";
    const text = [
      `⚡ VERITAS: ${label}`,
      `${slowResult.tokenName} (${slowResult.tokenSymbol})`,
      `Trust: ${slowResult.trustScore}/100`,
      ``,
      slowResult.degenComment,
      ``,
      `Liq: $${fmt(slowResult.market?.liquidity || 0)} | MCap: $${fmt(slowResult.market?.marketCap || 0)}`,
      slowResult.onChain.mintAuth ? `⚠ Mint Authority ENABLED` : "",
      slowResult.onChain.freezeAuth ? `⚠ Freeze Authority ENABLED` : "",
      ``,
      `🔍 veritas-mcp.onrender.com`,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isScanning = fastStatus === "loading" || slowStatus === "loading";
  const hasResults = fastStatus !== "idle" || slowStatus !== "idle";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* === INPUT — Always visible === */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="w-3.5 h-3.5 text-zinc-600" />
          <span className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
            Token Address
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScan()}
            placeholder="Paste contract address..."
            disabled={isScanning}
            className="flex-1 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded
                       text-zinc-100 placeholder-zinc-700 font-mono text-sm
                       focus:outline-none focus:border-zinc-600
                       disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleScan}
            disabled={isScanning || !address.trim()}
            className="px-6 py-3 font-mono text-xs font-medium rounded transition-all
                       uppercase tracking-wider whitespace-nowrap
                       disabled:opacity-30 disabled:cursor-not-allowed
                       bg-emerald-500/10 border border-emerald-500/30 text-emerald-400
                       hover:bg-emerald-500/20"
          >
            {isScanning ? "..." : "Scan"}
          </button>
        </div>
      </div>

      {/* Error (fast channel failure) */}
      {error && (
        <div className="p-3 border border-red-500/30 rounded bg-red-500/5">
          <p className="text-red-400 text-xs font-mono">{error}</p>
        </div>
      )}

      {/* === FAST HUD — Renders in ~2s === */}
      {hasResults && (
        <>
          {fastStatus === "loading" && <SkeletonFastHUD />}
          {fastStatus === "done" && fastResult && <FastHUD result={fastResult} />}
          {fastStatus === "error" && (
            <div className="p-3 border border-zinc-800 rounded bg-zinc-900/30">
              <p className="text-zinc-500 text-xs font-mono">On-chain data unavailable</p>
            </div>
          )}

          {/* === SLOW VISION — Renders in ~15s === */}
          {slowStatus === "loading" && <SkeletonSlowVision />}
          {slowStatus === "done" && slowResult && (
            <SlowVision result={slowResult} onCopy={handleCopyVerdict} copied={copied} />
          )}
          {slowStatus === "error" && (
            <div className="p-3 border border-zinc-800 rounded bg-zinc-900/30">
              <p className="text-zinc-500 text-xs font-mono">
                AI analysis unavailable — on-chain data above is still valid
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function fmt(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}
