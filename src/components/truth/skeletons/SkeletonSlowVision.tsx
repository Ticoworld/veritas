"use client";

import { useEffect, useState } from "react";

const TERMINAL_LINES = [
  "> Establishing secure uplink...",
  "> Capturing DOM payload & CSS assets...",
  "> Running Gemini Vision heuristics...",
  "> Cross-referencing known scam templates...",
  "> Analyzing wallet distribution network...",
  "> Scanning for recycled visual assets...",
  "> Querying on-chain forensics layer...",
  "> Correlating social graph anomalies...",
];

export function SkeletonSlowVision() {
  const [lineIndex, setLineIndex] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Cycle through terminal lines every 2s
  useEffect(() => {
    const line = setInterval(() => {
      setLineIndex((i) => (i + 1) % TERMINAL_LINES.length);
    }, 2000);
    return () => clearInterval(line);
  }, []);

  // Blinking cursor
  useEffect(() => {
    const cursor = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 530);
    return () => clearInterval(cursor);
  }, []);

  return (
    <div className="rounded-lg border border-amber-500/20 overflow-hidden bg-zinc-950/40 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/50 bg-zinc-950/80">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-amber-500/70 text-[10px] font-mono uppercase tracking-widest">
            Veritas Verdict
          </span>
        </div>
        <span className="text-zinc-600 text-[10px] font-mono animate-pulse">
          interrogating...
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* === INTERROGATION BADGE === */}
        <div className="flex flex-col items-center justify-center py-3 space-y-3">
          <div className="relative flex items-center justify-center">
            {/* Outer ring pulse */}
            <div className="absolute inset-0 rounded-full ring-2 ring-amber-500/30 animate-ping scale-110" />
            <div className="relative px-6 py-2.5 rounded border border-amber-500/40 bg-amber-500/10 animate-pulse">
              <span className="text-amber-400 font-black font-mono text-lg tracking-widest">
                [ INTERROGATING VISUALS ]
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-600 text-xs font-mono">Gemini Vision</span>
            <span className="text-zinc-700">•</span>
            <span className="text-zinc-600 text-xs font-mono">AI Analysis</span>
          </div>
        </div>

        {/* === SIMULATED TERMINAL === */}
        <div className="bg-[#0A0A0B] border border-zinc-800 rounded p-4 font-mono text-xs min-h-[80px] flex flex-col justify-between">
          {/* Static completed lines (dimmed) */}
          <div className="space-y-1 mb-2">
            {[
              TERMINAL_LINES[(lineIndex - 2 + TERMINAL_LINES.length) % TERMINAL_LINES.length],
              TERMINAL_LINES[(lineIndex - 1 + TERMINAL_LINES.length) % TERMINAL_LINES.length],
            ].map((line, i) => (
              <div key={i} className="text-zinc-700">
                {line}
              </div>
            ))}
          </div>
          {/* Active line */}
          <div className="flex items-center gap-0 text-emerald-500/80">
            <span>{TERMINAL_LINES[lineIndex]}</span>
            <span
              className="ml-0.5 inline-block w-1.5 h-3.5 bg-emerald-500/80 relative top-px"
              style={{ opacity: cursorVisible ? 1 : 0, transition: "opacity 0.05s" }}
            />
          </div>
        </div>

        {/* === PLACEHOLDER FLAGS ROW === */}
        <div className="flex flex-wrap gap-1.5">
          {[52, 68, 48, 60].map((w, i) => (
            <div
              key={i}
              className="h-5 rounded bg-zinc-800/40 animate-pulse"
              style={{ width: `${w}px`, animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>

        {/* === PLACEHOLDER VISION BOX === */}
        <div className="border border-zinc-800/30 rounded p-3 space-y-2 bg-zinc-950/30">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-700/50 animate-pulse" />
            <div className="h-2 w-14 rounded bg-zinc-800/40 animate-pulse" />
          </div>
          <div className="h-2.5 w-full rounded bg-zinc-800/30 animate-pulse [animation-delay:100ms]" />
          <div className="h-2.5 w-4/5 rounded bg-zinc-800/25 animate-pulse [animation-delay:200ms]" />
        </div>

        {/* === SHARE BUTTON PLACEHOLDER === */}
        <div className="h-9 w-full rounded bg-zinc-900/40 border border-zinc-800/20 animate-pulse [animation-delay:300ms]" />
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-zinc-800/20 bg-zinc-950/50 text-center">
        <span className="text-zinc-700 text-[9px] font-mono">NFA • DYOR • Powered by Gemini</span>
      </div>
    </div>
  );
}
