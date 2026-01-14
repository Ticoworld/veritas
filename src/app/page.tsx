import { TruthConsole } from "@/components/truth/TruthConsole";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="text-center mb-12">
        <img 
          src="/images/logo.png" 
          alt="Veritas" 
          className="h-12 mx-auto"
        />
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


