import { TruthConsole } from "@/components/truth/TruthConsole";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-zinc-100 tracking-tight mb-2">
          VERITAS
        </h1>
        <p className="text-zinc-600 font-mono text-sm uppercase tracking-widest">
          // TRUTH ENGINE
        </p>
      </div>

      {/* Console */}
      <TruthConsole />

      {/* Footer */}
      <footer className="fixed bottom-4 text-center text-zinc-700 text-xs font-mono">
        Trust no one. Verify everything.
      </footer>
    </main>
  );
}


