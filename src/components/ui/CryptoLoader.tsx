"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface CryptoLoaderProps {
  size?: number;
  message?: string;
}

const CRYPTO_CHARS = "0123456789ABCDEF";

function RandomHex() {
  const [chars, setChars] = useState("f7b3c2e1");

  useEffect(() => {
    const interval = setInterval(() => {
      setChars(
        Array.from({ length: 8 }, () =>
          CRYPTO_CHARS[Math.floor(Math.random() * CRYPTO_CHARS.length)]
        ).join("")
      );
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="font-mono text-xs text-zinc-700">{chars}</span>
  );
}

export function CryptoLoader({ size = 80, message = "Scanning..." }: CryptoLoaderProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const step =
    elapsed < 2 ? "Querying blockchain..." :
    elapsed < 5 ? "Fetching market data..." :
    elapsed < 8 ? "Capturing website..." :
    "AI analyzing...";

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10">
      {/* Spinner */}
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <motion.div
          className="absolute inset-0 rounded-full border border-zinc-800"
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute rounded-full border border-emerald-500/30"
          style={{ width: size * 0.7, height: size * 0.7 }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.div
          className="w-2 h-2 rounded-full bg-emerald-400"
          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>

      {/* Status */}
      <div className="text-center space-y-2">
        <motion.p
          className="text-zinc-400 text-sm font-mono"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {step}
        </motion.p>
        <div className="flex items-center justify-center gap-3">
          <RandomHex />
          <span className="text-zinc-700 text-xs font-mono">{elapsed}s</span>
          <RandomHex />
        </div>
      </div>
    </div>
  );
}
