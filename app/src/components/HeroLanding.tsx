"use client";

import { useEffect } from "react";
import { getVaultSummary, getActiveOracles } from "@/lib/predict-api";

// Prefetch key data so Dashboard loads faster when user enters the app
function prefetchAppData() {
  getVaultSummary().catch(() => {});
  getActiveOracles().catch(() => {});
}

// ── Deterministic data — no Math.random() to avoid hydration mismatches ──────
const rainStreaks = Array.from({ length: 50 }, (_, i) => ({
  left:     `${((i * 2.65 + (i % 3) * 0.5) % 100).toFixed(2)}%`,
  height:   14 + (i * 7) % 28,
  opacity:  0.13 + (i % 7) * 0.04,
  duration: `${(0.22 + (i % 8) * 0.036).toFixed(3)}s`,
  delay:    `-${((i * 11 % 23) * 0.055).toFixed(3)}s`,
  width:    i % 5 === 0 ? 2 : 1,
}));

const ambientParticles = Array.from({ length: 30 }, (_, i) => ({
  id:    i,
  x:     (i * 3.33 + (i % 7) * 1.1) % 100,
  y:     (i * 3.17 + (i % 5) * 2.3) % 100,
  color: ["rgba(42,212,255,.3)", "rgba(74,224,168,.25)", "rgba(150,120,255,.2)"][i % 3],
  size:  2 + (i % 3),
  delay: (i * 0.41) % 5,
  dur:   4 + (i % 5) * 0.8,
}));

interface Props {
  onLaunchApp: () => void;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function HeroLanding({ onLaunchApp }: Props) {
  // Start fetching app data in the background so Dashboard renders faster
  useEffect(() => {
    const t = setTimeout(prefetchAppData, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative min-h-screen" style={{ background: "#02080f", color: "#e8f4f8" }}>
      {/* Ambient biolum particle field */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        {ambientParticles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full biolum-anim"
            style={{
              left:              `${p.x}%`,
              top:               `${p.y}%`,
              width:             p.size,
              height:            p.size,
              background:        p.color,
              animationDelay:    `${p.delay}s`,
              animationDuration: `${p.dur}s`,
            }}
          />
        ))}
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
        style={{
          background:           "rgba(3,11,22,.65)",
          backdropFilter:       "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom:         "1px solid rgba(96,165,222,.08)",
        }}
      >
        <div className="flex items-center gap-2">
          <svg width="26" height="30" viewBox="0 0 28 32" fill="none" aria-hidden>
            <path d="M14 1 L26 6 L26 16 C26 23 20 28.5 14 31 C8 28.5 2 23 2 16 L2 6 Z"
              fill="rgba(14,58,88,.9)" stroke="rgba(42,212,255,.5)" strokeWidth="1.5" />
            <path d="M14 7 L20 10 L20 17 C20 21 17.5 24 14 25.5 C10.5 24 8 21 8 17 L8 10 Z" fill="rgba(42,212,255,.15)" />
            <circle cx="14" cy="16" r="3" fill="rgba(42,212,255,.7)" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>Insuirance</span>
          <span
            className="font-mono text-xs px-2 py-0.5 rounded-full"
            style={{ background: "rgba(42,212,255,.12)", color: "#2ad4ff", letterSpacing: "0.06em" }}
          >
            TESTNET
          </span>
        </div>
        <button
          onClick={onLaunchApp}
          onMouseEnter={prefetchAppData}
          style={{
            background:   "linear-gradient(180deg,#3fdcff,#0fa3da)",
            color:        "#04121f",
            borderRadius: 10,
            padding:      "8px 20px",
            fontWeight:   600,
            fontSize:     14,
            boxShadow:    "0 0 20px -4px rgba(42,212,255,.5)",
            border:       "none",
            cursor:       "pointer",
          }}
        >
          Launch App →
        </button>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section
        className="relative flex flex-col items-center justify-center text-center px-4"
        style={{ minHeight: "88vh", zIndex: 1 }}
      >
        {/* Daytime storm scene — masked to fade out downward */}
        <div
          className="absolute left-0 right-0 top-0 overflow-hidden pointer-events-none"
          style={{
            height: 360,
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 38%, transparent 100%)",
            maskImage:        "linear-gradient(to bottom, black 0%, black 38%, transparent 100%)",
          }}
        >
          {/* Daytime stormy sky — lighter blues, not pitch black */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(28,60,115,.92) 0%, rgba(50,90,148,.80) 28%, rgba(70,110,162,.55) 58%, transparent 100%)",
            }}
          />
          {/* Horizon warmth — sun behind clouds */}
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse 80% 30% at 50% 100%, rgba(130,165,215,.16) 0%, transparent 100%)",
            }}
          />

          {/* Rain — slightly more visible in daylight */}
          {rainStreaks.map((r, i) => (
            <div
              key={i}
              className="absolute storm-rain"
              style={{
                left:              r.left,
                top:               0,
                width:             r.width,
                height:            r.height,
                opacity:           r.opacity,
                animationDuration: r.duration,
                animationDelay:    r.delay,
                background:        "rgba(180,220,255,.65)",
                borderRadius:      1,
              }}
            />
          ))}

          {/* Lightning */}
          <div className="absolute inset-0 storm-lightning" style={{ background: "rgba(220,235,255,.12)", animationDuration: "5.3s" }} />
          <div className="absolute inset-0 storm-lightning" style={{ background: "rgba(220,235,255,.09)", animationDuration: "8.9s", animationDelay: "3.2s" }} />
          <svg className="absolute storm-lightning" style={{ top: 18, left: "24%", width: 18, height: 52, animationDuration: "5.3s", filter: "blur(.3px)" }} viewBox="0 0 18 52">
            <path d="M13,0 L5,24 L10,24 L2,52 L15,22 L9,22 Z" fill="rgba(230,245,255,.97)" />
          </svg>
          <svg className="absolute storm-lightning" style={{ top: 10, left: "71%", width: 14, height: 44, animationDuration: "8.9s", animationDelay: "3.2s", filter: "blur(.3px)" }} viewBox="0 0 14 44">
            <path d="M10,0 L4,20 L8,20 L1,44 L12,17 L6,17 Z" fill="rgba(230,245,255,.93)" />
          </svg>

          {/* Waves — vivid daytime ocean blues */}
          <svg className="wave-anim absolute" viewBox="0 0 2880 65" preserveAspectRatio="none"
            style={{ width: "200%", height: 65, bottom: 80, animationDuration: "10s" }}>
            <path d="M0,35 C240,63 480,7 720,35 C960,63 1200,7 1440,35 C1680,63 1920,7 2160,35 C2400,63 2640,7 2880,35 L2880,65 L0,65 Z" fill="rgba(0,50,120,.90)" />
          </svg>
          <svg className="wave-anim absolute" viewBox="0 0 2880 55" preserveAspectRatio="none"
            style={{ width: "200%", height: 55, bottom: 52, animationDuration: "6.2s" }}>
            <path d="M0,28 C160,50 320,6 480,28 C640,50 800,6 960,28 C1120,50 1280,6 1440,28 C1600,50 1760,6 1920,28 C2080,50 2240,6 2400,28 C2560,50 2720,6 2880,28 L2880,55 L0,55 Z" fill="rgba(0,90,175,.76)" />
          </svg>
          <svg className="wave-anim absolute" viewBox="0 0 2880 45" preserveAspectRatio="none"
            style={{ width: "200%", height: 45, bottom: 24, animationDuration: "3.5s" }}>
            <path d="M0,22 C80,38 160,6 240,22 C320,38 400,6 480,22 C560,38 640,6 720,22 C800,38 880,6 960,22 C1040,38 1120,6 1200,22 C1280,38 1360,6 1440,22 C1520,38 1600,6 1680,22 C1760,38 1840,6 1920,22 C2000,38 2080,6 2160,22 C2240,38 2320,6 2400,22 C2480,38 2560,6 2640,22 C2720,38 2800,6 2880,22 L2880,45 L0,45 Z" fill="rgba(10,125,200,.68)" />
          </svg>
          <svg className="wave-anim absolute" viewBox="0 0 2880 36" preserveAspectRatio="none"
            style={{ width: "200%", height: 36, bottom: 0, animationDuration: "2.2s" }}>
            <path d="M0,18 C53,30 107,6 160,18 C213,30 267,6 320,18 C373,30 427,6 480,18 C533,30 587,6 640,18 C693,30 747,6 800,18 C853,30 907,6 960,18 C1013,30 1067,6 1120,18 C1173,30 1227,6 1280,18 C1333,30 1387,6 1440,18 C1493,30 1547,6 1600,18 C1653,30 1707,6 1760,18 C1813,30 1867,6 1920,18 C1973,30 2027,6 2080,18 C2133,30 2187,6 2240,18 C2293,30 2347,6 2400,18 C2453,30 2507,6 2560,18 C2613,30 2667,6 2720,18 C2773,30 2827,6 2880,18 L2880,36 L0,36 Z" fill="rgba(55,170,235,.55)" />
            <path d="M0,18 C53,30 107,6 160,18 C213,30 267,6 320,18 C373,30 427,6 480,18 C533,30 587,6 640,18 C693,30 747,6 800,18 C853,30 907,6 960,18 C1013,30 1067,6 1120,18 C1173,30 1227,6 1280,18 C1333,30 1387,6 1440,18 C1493,30 1547,6 1600,18 C1653,30 1707,6 1760,18 C1813,30 1867,6 1920,18 C1973,30 2027,6 2080,18 C2133,30 2187,6 2240,18 C2293,30 2347,6 2400,18 C2453,30 2507,6 2560,18 C2613,30 2667,6 2720,18 C2773,30 2827,6 2880,18"
              stroke="rgba(200,235,255,.30)" strokeWidth="1.5" fill="none" />
          </svg>
        </div>

        {/* Diver mascot */}
        <div style={{ marginTop: 104, marginBottom: 28, position: "relative", zIndex: 2 }}>
          <svg
            width="92" height="118"
            viewBox="0 0 80 100"
            fill="none"
            className="mascot-bob-anim"
            style={{ filter: "drop-shadow(0 0 18px rgba(42,212,255,.7)) drop-shadow(0 0 40px rgba(42,212,255,.35))" }}
          >
            <defs>
              <radialGradient id="hvGlow" cx="0.42" cy="0.36" r="0.72">
                <stop offset="0"   stopColor="#cdf6ff" />
                <stop offset=".5"  stopColor="#37c9ef" />
                <stop offset="1"   stopColor="#0c6e96" />
              </radialGradient>
            </defs>
            <path d="M31 79 Q23 96 18 99 Q31 90 36 85 Z" fill="#0c3550" />
            <path d="M49 79 Q57 96 62 99 Q49 90 44 85 Z" fill="#0c3550" />
            <path d="M30 62 Q18 66 16 77" stroke="#0e3a58" strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M50 62 Q62 66 64 77" stroke="#0e3a58" strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M28 56 Q26 80 33 88 Q40 92 47 88 Q54 80 52 56 Z" fill="#0e3a58" />
            <circle cx="40" cy="34" r="22" fill="#0e3a58" />
            <circle cx="40" cy="33" r="14" fill="url(#hvGlow)" />
            <ellipse cx="34" cy="27" rx="4.6" ry="2.8" fill="rgba(235,251,255,.55)" transform="rotate(-25 34 27)" />
          </svg>
        </div>

        {/* Eyebrow */}
        <p
          className="font-mono text-xs tracking-[0.32em] uppercase mb-4"
          style={{ color: "#2ad4ff", position: "relative", zIndex: 2 }}
        >
          [ ONCHAIN CRASH COVER · BUILT ON DEEPBOOK ]
        </p>

        {/* H1 */}
        <h1
          style={{
            fontSize:      "clamp(38px,6vw,62px)",
            fontWeight:    600,
            letterSpacing: "-0.03em",
            lineHeight:    1.1,
            marginBottom:  20,
            maxWidth:      680,
            position:      "relative",
            zIndex:        2,
          }}
        >
          Where the crash<br />can&apos;t reach you.
        </h1>

        {/* Sub */}
        <p
          style={{
            fontSize:     17,
            lineHeight:   1.6,
            color:        "rgba(184,222,250,.65)",
            maxWidth:     540,
            marginBottom: 32,
            position:     "relative",
            zIndex:       2,
          }}
        >
          BTC storms on the surface. Your cover lives in the calm deep —
          priced by DeepBook&apos;s SVI model, settled by its oracle.
          No claims. No counterparty. Just math.
        </p>

        {/* CTA row */}
        <div className="flex items-center gap-4 flex-wrap justify-center" style={{ marginBottom: 32, position: "relative", zIndex: 2 }}>
          <button
            onClick={onLaunchApp}
          onMouseEnter={prefetchAppData}
            style={{
              background:   "linear-gradient(180deg,#3fdcff,#0fa3da)",
              color:        "#04121f",
              borderRadius: 10,
              padding:      "12px 28px",
              fontWeight:   600,
              fontSize:     16,
              boxShadow:    "0 0 24px -4px rgba(42,212,255,.6)",
              border:       "none",
              cursor:       "pointer",
            }}
          >
            Launch App →
          </button>
          <a
            href="#deepbook"
            style={{
              background:     "rgba(8,22,40,.7)",
              color:          "#e8f4f8",
              borderRadius:   10,
              padding:        "12px 28px",
              fontWeight:     500,
              fontSize:       16,
              border:         "1px solid rgba(96,165,222,.12)",
              textDecoration: "none",
              display:        "inline-block",
            }}
          >
            How it works
          </a>
        </div>

      </section>

      {/* ── Powered by DeepBook Predict ───────────────────────────────── */}
      <section id="deepbook" style={{ padding: "0 24px 80px", position: "relative", zIndex: 1 }}>
        <div className="mx-auto" style={{ maxWidth: 820 }}>
          <p className="font-mono text-xs tracking-[0.32em] uppercase text-center mb-3" style={{ color: "#2ad4ff" }}>
            [ DEEPBOOK PREDICT INTEGRATION ]
          </p>
          <h2
            className="text-center"
            style={{
              fontSize:      "clamp(26px,4vw,38px)",
              fontWeight:    600,
              letterSpacing: "-0.025em",
              marginBottom:  12,
            }}
          >
            Real derivatives infrastructure, onchain.
          </h2>
          <p className="text-center mb-10" style={{ color: "rgba(184,222,250,.55)", fontSize: 15, maxWidth: 520, margin: "0 auto 40px" }}>
            Insuirance is a thin product layer on top of DeepBook Predict.
            All the heavy lifting — pricing, liquidity, settlement — is DeepBook.
          </p>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {[
              {
                tag:   "SVI PRICING",
                icon:  "∿",
                title: "Fair premium, not an estimate",
                desc:  "Cover premiums are computed in real-time using DeepBook's Stochastic Volatility Inspired model — the same framework institutional options desks use. No flat fee, no guesswork.",
              },
              {
                tag:   "ORACLE SETTLEMENT",
                icon:  "◎",
                title: "Zero human settlement",
                desc:  "At expiry, DeepBook's on-chain BTC/USD oracle provides the final price. If the drop threshold was hit, dUSDC flows automatically. No claims desk. No dispute period. Pure code.",
              },
              {
                tag:   "PREDICT POOL",
                icon:  "⬡",
                title: "One pool, two products",
                desc:  "Each cover draws premium from a PredictManager vault account backed by DeepBook's LP pool. ShieldVault depositors fund these accounts and earn yield as the options seller side.",
              },
            ].map((c) => (
              <div
                key={c.tag}
                className="p-6 rounded-2xl transition-all"
                style={{ background: "rgba(6,18,34,.65)", border: "1px solid rgba(96,165,222,.12)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(42,212,255,.35)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(96,165,222,.12)")}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ fontSize: 18, color: "#2ad4ff" }}>{c.icon}</span>
                  <p className="font-mono text-xs tracking-[0.22em] uppercase" style={{ color: "#2ad4ff" }}>
                    {c.tag}
                  </p>
                </div>
                <p className="font-semibold text-base mb-2">{c.title}</p>
                <p className="text-sm" style={{ color: "rgba(184,222,250,.58)", lineHeight: 1.65 }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How value flows ───────────────────────────────────────────── */}
      <section style={{ padding: "0 24px 96px", position: "relative", zIndex: 1 }}>
        <div className="mx-auto" style={{ maxWidth: 820 }}>
          {/* Section header */}
          <div
            className="rounded-2xl p-8 mb-6"
            style={{ background: "rgba(4,18,36,.7)", border: "1px solid rgba(42,212,255,.12)" }}
          >
            <p className="font-mono text-xs tracking-[0.32em] uppercase mb-3" style={{ color: "#2ad4ff" }}>
              [ VALUE FLOW ]
            </p>
            <h2 style={{ fontSize: "clamp(24px,3.5vw,36px)", fontWeight: 600, letterSpacing: "-0.025em", marginBottom: 12 }}>
              Fair pricing. Real yield.
            </h2>
            <p style={{ color: "rgba(184,222,250,.58)", fontSize: 15, lineHeight: 1.65, maxWidth: 560 }}>
              Buyers pay the SVI fair market price — no hidden markup. Premiums flow directly
              to ShieldVault LPs via DeepBook&apos;s PLP vault. Yield without token emissions.
            </p>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            {[
              {
                num:   "LP",
                label: "Premium Yield",
                desc:  "Premiums paid by cover buyers flow directly to ShieldVault depositors via DeepBook's PLP vault. No protocol spread, no extraction — real yield from real coverage demand.",
              },
              {
                num:   "∞",
                label: "Compounding Vault Yield",
                desc:  "ShieldVault LPs earn premiums from every options buyer. As TVL grows, total premium income scales — depositors compound automatically with zero active management.",
              },
              {
                num:   "×N",
                label: "Multi-Market Expansion",
                desc:  "The architecture is oracle-agnostic. Any asset with a DeepBook oracle is a new market — ETH, SOL, indexes — with zero additional infrastructure code.",
              },
            ].map((r) => (
              <div
                key={r.label}
                className="p-6 rounded-xl"
                style={{ background: "rgba(5,15,30,.6)", border: "1px solid rgba(96,165,222,.09)" }}
              >
                <div
                  className="font-mono font-bold mb-1"
                  style={{ fontSize: 32, color: "#2ad4ff", letterSpacing: "-0.02em" }}
                >
                  {r.num}
                </div>
                <p className="font-semibold text-sm mb-2">{r.label}</p>
                <p className="text-xs" style={{ color: "rgba(184,222,250,.5)", lineHeight: 1.65 }}>
                  {r.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ───────────────────────────────────────────────── */}
      <section className="text-center" style={{ padding: "0 24px 96px", position: "relative", zIndex: 1 }}>
        <h2 style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 600, letterSpacing: "-0.025em", marginBottom: 16 }}>
          Ready to leave<br />the surface?
        </h2>
        <p style={{ color: "rgba(184,222,250,.58)", fontSize: 16, marginBottom: 32 }}>
          Buy crash cover or deposit into ShieldVault and earn yield.
        </p>
        <button
          onClick={onLaunchApp}
          onMouseEnter={prefetchAppData}
          style={{
            background:   "linear-gradient(180deg,#3fdcff,#0fa3da)",
            color:        "#04121f",
            borderRadius: 10,
            padding:      "14px 36px",
            fontWeight:   600,
            fontSize:     17,
            boxShadow:    "0 0 24px -4px rgba(42,212,255,.6)",
            border:       "none",
            cursor:       "pointer",
          }}
        >
          Launch App →
        </button>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer
        className="flex items-center justify-between px-6 py-6"
        style={{ borderTop: "1px solid rgba(96,165,222,.1)", position: "relative", zIndex: 1 }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>Insuirance</span>
          <span
            className="font-mono text-xs px-2 py-0.5 rounded-full"
            style={{ background: "rgba(42,212,255,.1)", color: "#2ad4ff", letterSpacing: "0.06em" }}
          >
            TESTNET
          </span>
        </div>
        <p className="font-mono text-xs text-right" style={{ color: "rgba(140,185,220,.4)" }}>
          Calm beneath the chaos · Powered by DeepBook
        </p>
      </footer>
    </div>
  );
}
