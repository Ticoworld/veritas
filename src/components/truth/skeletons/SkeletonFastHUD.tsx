"use client";

export function SkeletonFastHUD() {
  return (
    <div className="rounded-lg border border-zinc-800/50 overflow-hidden animate-pulse">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/40 bg-zinc-950/80">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-800" />
          <div className="h-2 w-24 rounded bg-zinc-800" />
        </div>
        <div className="h-2 w-12 rounded bg-zinc-800" />
      </div>

      <div className="p-5 space-y-4">
        {/* Token name placeholder */}
        <div className="flex items-center gap-3">
          <div className="h-4 w-32 rounded bg-zinc-800/80" />
          <div className="h-3 w-16 rounded bg-zinc-800/50" />
        </div>

        {/* 4-column metrics grid */}
        <div className="grid grid-cols-4 gap-2">
          {["LIQ", "MCAP", "TOP 10", "AGE"].map((label) => (
            <div key={label} className="bg-zinc-900/50 border border-zinc-800/30 rounded p-2 text-center space-y-1.5">
              <div className="h-2 w-8 rounded bg-zinc-800/60 mx-auto" />
              <div className="h-4 w-12 rounded bg-zinc-800/80 mx-auto" />
            </div>
          ))}
        </div>

        {/* On-chain flags row */}
        <div className="flex flex-wrap gap-1.5">
          {[40, 56, 44].map((w, i) => (
            <div
              key={i}
              className={`h-5 rounded bg-zinc-800/60`}
              style={{ width: `${w}px` }}
            />
          ))}
        </div>

        {/* Preliminary score bar */}
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 rounded bg-zinc-800/50" />
          <div className="h-2 w-8 rounded bg-zinc-700/60" />
        </div>
      </div>
    </div>
  );
}
