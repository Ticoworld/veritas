import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Veritas | Web3 Anti-Scam Scanner",
  description: "Detect rug pulls on Solana by analyzing creator wallet behavior and bonding curve status for Pump.fun tokens.",
  keywords: ["solana", "web3", "rug pull", "pump.fun", "crypto", "scanner", "anti-scam"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#09090b] text-white min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
