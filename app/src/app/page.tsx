"use client";

import { useState } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { CoverForm } from "@/components/CoverForm";
import { PolicyList } from "@/components/PolicyList";
import { Dashboard } from "@/components/Dashboard";
import { HedgeCalculator } from "@/components/HedgeCalculator";
import { ShieldVault } from "@/components/ShieldVault";
import { HeroLanding } from "@/components/HeroLanding";
import { DepthAnimation } from "@/components/DepthAnimation";

// Deterministic rain streak data — no Math.random() to avoid hydration mismatch
const rainStreaks = Array.from({ length: 40 }, (_, i) => ({
  left:     `${((i * 2.65 + (i % 3) * 0.5) % 100).toFixed(2)}%`,
  height:   12 + (i * 7) % 24,
  opacity:  0.10 + (i % 7) * 0.038,
  duration: `${(0.25 + (i % 8) * 0.036).toFixed(3)}s`,
  delay:    `-${((i * 11 % 23) * 0.055).toFixed(3)}s`,
  width:    i % 5 === 0 ? 2 : 1,
}));

const INSUIRANCE_PKG  = process.env.NEXT_PUBLIC_INSUIRANCE_PACKAGE  ?? "";
const SHIELD_VAULT_ID = process.env.NEXT_PUBLIC_SHIELD_VAULT_ID ?? "";

export default function Home() {
  const account = useCurrentAccount();
  const [suggestedCover, setSuggestedCover] = useState<string | undefined>();
  const [tab, setTab] = useState<"cover" | "vault">("cover");
  const [view, setView] = useState<"hero" | "app">("hero");

  function launchApp() {
    setView("app");
    window.scrollTo(0, 0);
  }

  function goToHero() {
    setView("hero");
    window.scrollTo(0, 0);
  }

  if (view === "hero") {
    return <HeroLanding onLaunchApp={launchApp} />;
  }

  return (
    <div className="app-enter flex flex-col min-h-screen">
      {/* Nav — matches hero style */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
        style={{
          background:           "rgba(3,11,22,.65)",
          backdropFilter:       "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom:         "1px solid rgba(96,165,222,.08)",
        }}
      >
        <button
          onClick={goToHero}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <svg width="26" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
            <rect width="32" height="32" rx="7" fill="#02080f"/>
            <path d="M16 2 L28 7 L28 18 C28 25 22 29.5 16 32 C10 29.5 4 25 4 18 L4 7 Z"
              fill="#0e3a58" stroke="#2ad4ff" strokeWidth="1.5"/>
            <path d="M16 8 L22 11 L22 18 C22 22 19.5 25 16 26.5 C12.5 25 10 22 10 18 L10 11 Z"
              fill="rgba(42,212,255,.18)"/>
            <circle cx="16" cy="18" r="3.5" fill="#2ad4ff"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>Insuirance</span>
          <span
            className="font-mono text-xs px-2 py-0.5 rounded-full"
            style={{ background: "rgba(42,212,255,.12)", color: "#2ad4ff", letterSpacing: "0.06em" }}
          >
            TESTNET
          </span>
        </button>
        <ConnectButton />
      </nav>


      {/* Main */}
      <main className="flex flex-1 flex-col items-center px-4 py-12">
        <div className="max-w-lg w-full space-y-4">
          {/* Hero */}
          <div className="text-center mb-8 relative">
            {/* Storm scene */}
            <div
              className="absolute left-1/2 -translate-x-1/2 w-screen overflow-hidden pointer-events-none"
              style={{
                top: -64,
                height: 260,
                WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)",
                maskImage: "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)",
              }}
            >
              {/* Storm sky gradient */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(3,6,16,0.97) 0%, rgba(6,14,34,0.88) 40%, rgba(10,22,48,0.55) 70%, transparent 100%)",
                }}
              />

              {/* Rain streaks */}
              {rainStreaks.map((r, i) => (
                <div
                  key={i}
                  className="absolute storm-rain"
                  style={{
                    left: r.left,
                    top: 0,
                    width: r.width,
                    height: r.height,
                    opacity: r.opacity,
                    animationDuration: r.duration,
                    animationDelay: r.delay,
                    background: "rgba(160,215,255,0.55)",
                    borderRadius: 1,
                  }}
                />
              ))}

              {/* Lightning ambient glow */}
              <div
                className="absolute inset-0 storm-lightning"
                style={{ background: "rgba(180,220,255,0.10)", animationDuration: "5.3s" }}
              />
              <div
                className="absolute inset-0 storm-lightning"
                style={{ background: "rgba(180,220,255,0.08)", animationDuration: "8.9s", animationDelay: "3.2s" }}
              />

              {/* Lightning bolt 1 */}
              <svg
                className="absolute storm-lightning"
                style={{ top: 20, left: "24%", width: 18, height: 52, animationDuration: "5.3s", filter: "blur(0.4px)" }}
                viewBox="0 0 18 52"
              >
                <path d="M13,0 L5,24 L10,24 L2,52 L15,22 L9,22 Z" fill="rgba(215,240,255,0.95)" />
              </svg>
              {/* Lightning bolt 2 */}
              <svg
                className="absolute storm-lightning"
                style={{ top: 12, left: "71%", width: 14, height: 44, animationDuration: "8.9s", animationDelay: "3.2s", filter: "blur(0.4px)" }}
                viewBox="0 0 14 44"
              >
                <path d="M10,0 L4,20 L8,20 L1,44 L12,17 L6,17 Z" fill="rgba(215,240,255,0.90)" />
              </svg>

              {/* Wave 1 */}
              <svg
                className="wave-anim absolute"
                viewBox="0 0 2880 65"
                preserveAspectRatio="none"
                style={{ width: "200%", height: 65, bottom: 80, animationDuration: "10s" }}
              >
                <path
                  d="M0,35 C240,63 480,7 720,35 C960,63 1200,7 1440,35 C1680,63 1920,7 2160,35 C2400,63 2640,7 2880,35 L2880,65 L0,65 Z"
                  fill="rgba(0,22,68,0.88)"
                />
              </svg>
              {/* Wave 2 */}
              <svg
                className="wave-anim absolute"
                viewBox="0 0 2880 55"
                preserveAspectRatio="none"
                style={{ width: "200%", height: 55, bottom: 52, animationDuration: "6.2s" }}
              >
                <path
                  d="M0,28 C160,50 320,6 480,28 C640,50 800,6 960,28 C1120,50 1280,6 1440,28 C1600,50 1760,6 1920,28 C2080,50 2240,6 2400,28 C2560,50 2720,6 2880,28 L2880,55 L0,55 Z"
                  fill="rgba(0,50,120,0.72)"
                />
              </svg>
              {/* Wave 3 */}
              <svg
                className="wave-anim absolute"
                viewBox="0 0 2880 45"
                preserveAspectRatio="none"
                style={{ width: "200%", height: 45, bottom: 24, animationDuration: "3.5s" }}
              >
                <path
                  d="M0,22 C80,38 160,6 240,22 C320,38 400,6 480,22 C560,38 640,6 720,22 C800,38 880,6 960,22 C1040,38 1120,6 1200,22 C1280,38 1360,6 1440,22 C1520,38 1600,6 1680,22 C1760,38 1840,6 1920,22 C2000,38 2080,6 2160,22 C2240,38 2320,6 2400,22 C2480,38 2560,6 2640,22 C2720,38 2800,6 2880,22 L2880,45 L0,45 Z"
                  fill="rgba(0,85,180,0.62)"
                />
              </svg>
              {/* Wave 4 */}
              <svg
                className="wave-anim absolute"
                viewBox="0 0 2880 36"
                preserveAspectRatio="none"
                style={{ width: "200%", height: 36, bottom: 0, animationDuration: "2.2s" }}
              >
                <path
                  d="M0,18 C53,30 107,6 160,18 C213,30 267,6 320,18 C373,30 427,6 480,18 C533,30 587,6 640,18 C693,30 747,6 800,18 C853,30 907,6 960,18 C1013,30 1067,6 1120,18 C1173,30 1227,6 1280,18 C1333,30 1387,6 1440,18 C1493,30 1547,6 1600,18 C1653,30 1707,6 1760,18 C1813,30 1867,6 1920,18 C1973,30 2027,6 2080,18 C2133,30 2187,6 2240,18 C2293,30 2347,6 2400,18 C2453,30 2507,6 2560,18 C2613,30 2667,6 2720,18 C2773,30 2827,6 2880,18 L2880,36 L0,36 Z"
                  fill="rgba(55,145,240,0.48)"
                />
                <path
                  d="M0,18 C53,30 107,6 160,18 C213,30 267,6 320,18 C373,30 427,6 480,18 C533,30 587,6 640,18 C693,30 747,6 800,18 C853,30 907,6 960,18 C1013,30 1067,6 1120,18 C1173,30 1227,6 1280,18 C1333,30 1387,6 1440,18 C1493,30 1547,6 1600,18 C1653,30 1707,6 1760,18 C1813,30 1867,6 1920,18 C1973,30 2027,6 2080,18 C2133,30 2187,6 2240,18 C2293,30 2347,6 2400,18 C2453,30 2507,6 2560,18 C2613,30 2667,6 2720,18 C2773,30 2827,6 2880,18"
                  stroke="rgba(190,230,255,0.28)"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            </div>

            {/* Text — relative+z-index to paint above absolute storm scene */}
            <div className="relative space-y-3 pt-2" style={{ zIndex: 1 }}>
              <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "rgba(42,212,255,0.6)" }}>
                Insuirance
              </p>
              <h1 className="text-4xl font-bold tracking-tight leading-tight">
                Surface storms don&apos;t<br />reach the deep.
              </h1>
              <p className="text-sm" style={{ color: "rgba(180,220,255,0.55)" }}>
                BTC crashes on the surface — your cover lives in the deep with DeepBook.
              </p>
              <p className="text-xs" style={{ color: "rgba(120,160,200,0.4)" }}>
                One-click settlement · Fully onchain · Sui Testnet
              </p>
            </div>
          </div>

          {account ? (
            <>
              <Dashboard address={account.address} />

              {/* Tab switcher */}
              <div className="flex rounded-xl border border-white/10 bg-white/5 p-1 gap-1">
                {(["cover", "vault"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                      tab === t
                        ? "bg-white/10 text-white"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {t === "cover" ? "Buy Cover" : "Earn Yield"}
                  </button>
                ))}
              </div>

              {tab === "cover" ? (
                <>
                  <HedgeCalculator onHedge={setSuggestedCover} />
                  <CoverForm address={account.address} suggestedCover={suggestedCover} />
                  <PolicyList address={account.address} />
                </>
              ) : (
                <ShieldVault address={account.address} />
              )}
            </>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { title: "Buy Cover", desc: "Auto payout if BTC drops below strike" },
                  { title: "Earn Yield", desc: "LP to Predict vault, earn premiums" },
                  { title: "Onchain", desc: "Oracle settles trustlessly" },
                ].map((c) => (
                  <div key={c.title} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center space-y-1">
                    <p className="text-sm font-semibold">{c.title}</p>
                    <p className="text-xs text-gray-500">{c.desc}</p>
                  </div>
                ))}
              </div>
              <HedgeCalculator />
              {/* How it works */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                <p className="text-sm font-semibold text-gray-300">How it works</p>
                <div className="space-y-3">
                  {[
                    { n: "1", title: "Calculate your exposure", desc: "Enter your BTC holdings to see exact dollar downside at 5%, 10%, 20% drops." },
                    { n: "2", title: "Buy cover or earn yield", desc: "Buy Cover: pick a strategy and get a Policy NFT. ShieldVault: deposit dUSDC and earn LP premiums." },
                    { n: "3", title: "One-click settlement", desc: "Oracle confirms price at expiry. Click Claim — payout lands in your wallet instantly, fully onchain." },
                  ].map((s) => (
                    <div key={s.n} className="flex gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-xs flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                      <div>
                        <p className="text-sm font-medium">{s.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 text-center">
                  <ConnectButton />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer
        className="mt-auto px-6 py-6 text-center space-y-3"
        style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}
      >
        <div className="flex flex-wrap justify-center gap-4 text-xs" style={{ color: "rgba(120,160,200,.45)" }}>
          {INSUIRANCE_PKG && (
            <span className="font-mono">
              Contract: {INSUIRANCE_PKG.slice(0, 10)}…{INSUIRANCE_PKG.slice(-6)}
            </span>
          )}
          {SHIELD_VAULT_ID && (
            <span className="font-mono">
              Vault: {SHIELD_VAULT_ID.slice(0, 10)}…{SHIELD_VAULT_ID.slice(-6)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-5 text-xs" style={{ color: "rgba(120,160,200,.4)" }}>
          <a
            href="https://discord.gg/sui"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80 transition-opacity"
          >
            Discord
          </a>
          <a
            href="https://twitter.com/SuiNetwork"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80 transition-opacity"
          >
            Twitter
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80 transition-opacity"
          >
            GitHub
          </a>
          <a
            href="/terms"
            className="hover:opacity-80 transition-opacity"
          >
            Terms
          </a>
        </div>
        <p className="text-xs" style={{ color: "rgba(80,120,160,.25)" }}>
          Insuirance · Built on Sui + DeepBook Predict · Testnet
        </p>
      </footer>
    </div>
  );
}
