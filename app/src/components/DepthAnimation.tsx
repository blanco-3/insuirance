"use client";

import { useEffect, useState } from "react";

type Phase = "surface" | "diving" | "deep" | "fading";

interface Props {
  type: "deposit" | "cover";
  onDone: () => void;
}

const BUBBLES = [
  { x: 46, delay: 0.0, size: 7 },
  { x: 50, delay: 0.4, size: 4 },
  { x: 43, delay: 0.7, size: 9 },
  { x: 53, delay: 1.0, size: 5 },
  { x: 48, delay: 1.3, size: 3 },
  { x: 55, delay: 0.2, size: 6 },
  { x: 41, delay: 0.9, size: 4 },
];

const PARTICLES = [
  { x: 15, y: 55, c: "rgba(0,212,255,0.6)",   d: 0.0, dur: 3.2, s: 3 },
  { x: 28, y: 72, c: "rgba(100,220,180,0.5)", d: 0.6, dur: 4.0, s: 2 },
  { x: 42, y: 80, c: "rgba(0,212,255,0.4)",   d: 1.2, dur: 3.6, s: 4 },
  { x: 58, y: 63, c: "rgba(180,100,255,0.4)", d: 0.3, dur: 2.8, s: 2 },
  { x: 70, y: 78, c: "rgba(0,212,255,0.5)",   d: 0.9, dur: 3.4, s: 3 },
  { x: 82, y: 68, c: "rgba(100,220,180,0.4)", d: 1.5, dur: 4.2, s: 2 },
  { x: 22, y: 88, c: "rgba(0,212,255,0.3)",   d: 0.4, dur: 3.0, s: 5 },
  { x: 65, y: 90, c: "rgba(180,100,255,0.5)", d: 1.1, dur: 3.8, s: 2 },
  { x: 35, y: 60, c: "rgba(0,212,255,0.5)",   d: 0.7, dur: 2.6, s: 3 },
  { x: 78, y: 82, c: "rgba(100,220,180,0.6)", d: 0.2, dur: 4.4, s: 2 },
];

// Seamless wave SVG: path is doubled (0→2880) so -50% translateX loops perfectly
function WaveLayer({ opacity, speed, yOffset, fill }: {
  opacity: number; speed: number; yOffset: number; fill: string;
}) {
  return (
    <div className="absolute left-0 right-0 overflow-hidden" style={{ top: yOffset, height: 72 }}>
      <svg
        viewBox="0 0 2880 72"
        preserveAspectRatio="none"
        className="wave-anim"
        style={{ width: "200%", height: "100%", opacity, animationDuration: `${speed}s` }}
      >
        <path
          d="M0,36 C180,68 360,4 540,36 C720,68 900,4 1080,36 C1260,68 1440,4 1440,36
             C1620,68 1800,4 1980,36 C2160,68 2340,4 2520,36 C2700,68 2880,4 2880,36
             L2880,72 L0,72 Z"
          fill={fill}
        />
      </svg>
    </div>
  );
}

export function DepthAnimation({ type, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("surface");
  const [diverTop, setDiverTop]     = useState(9);   // % from top
  const [bgDeep,   setBgDeep]       = useState(false);
  const [bubbles,  setBubbles]      = useState(false);
  const [showMsg,  setShowMsg]      = useState(false);

  useEffect(() => {
    // start descent
    const t1 = setTimeout(() => {
      setPhase("diving");
      setDiverTop(60);
      setBubbles(true);
    }, 600);
    // reach the deep
    const t2 = setTimeout(() => {
      setPhase("deep");
      setBgDeep(true);
      setBubbles(false);
    }, 2800);
    // success message
    const t3 = setTimeout(() => setShowMsg(true), 3500);
    // begin fade-out
    const t4 = setTimeout(() => setPhase("fading"), 5000);
    // remove
    const t5 = setTimeout(onDone, 5700);

    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, [onDone]);

  const isStormy = phase === "surface" || phase === "diving";

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        opacity: phase === "fading" ? 0 : 1,
        transition: "opacity 700ms ease",
      }}
    >
      {/* Ocean background — transitions from stormy to deep */}
      <div
        className="absolute inset-0"
        style={{
          background: bgDeep
            ? "linear-gradient(to bottom, #020d1a 0%, #010810 50%, #010608 100%)"
            : "linear-gradient(to bottom, #0e3d60 0%, #07233d 35%, #030f20 100%)",
          transition: "background 2500ms ease",
        }}
      />

      {/* Storm light shimmer near surface */}
      <div
        className="absolute top-0 left-0 right-0 h-56 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(80,160,255,0.18) 0%, transparent 70%)",
          opacity: isStormy ? 1 : 0,
          transition: "opacity 2000ms ease",
        }}
      />

      {/* Waves — slide out as we go deep */}
      <div
        style={{
          opacity: isStormy ? 1 : 0,
          transform: bgDeep ? "translateY(-40px)" : "translateY(0)",
          transition: "opacity 2000ms ease, transform 2000ms ease",
        }}
      >
        <WaveLayer opacity={0.7} speed={3.5} yOffset={0}  fill="rgba(14,90,150,0.55)" />
        <WaveLayer opacity={0.5} speed={5.5} yOffset={18} fill="rgba(8,55,100,0.45)"  />
        <WaveLayer opacity={0.3} speed={7.0} yOffset={32} fill="rgba(4,30,60,0.35)"   />
      </div>

      {/* Depth lines — appear as we go deeper */}
      {[0,1,2,3,4].map((i) => (
        <div
          key={i}
          className="absolute left-0 right-0"
          style={{
            top: `${22 + i * 14}%`,
            height: 1,
            background: `rgba(0,212,255,${0.08 - i * 0.01})`,
            opacity: bgDeep ? 1 : 0,
            transition: `opacity 1500ms ease ${300 + i * 180}ms`,
          }}
        />
      ))}

      {/* Fugu 🐡 */}
      <div
        className="absolute left-1/2 select-none pointer-events-none"
        style={{
          top: `${diverTop}%`,
          fontSize: 52,
          transform: `translateX(-50%) ${phase === "diving" ? "rotate(14deg) scale(0.82)" : "rotate(0deg) scale(1)"}`,
          filter: bgDeep
            ? "drop-shadow(0 0 28px rgba(0,212,255,0.9)) drop-shadow(0 0 8px rgba(0,212,255,0.6))"
            : "drop-shadow(0 4px 12px rgba(0,0,0,0.5))",
          transition: [
            "top 2300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            "transform 2300ms ease",
            "filter 1200ms ease",
          ].join(", "),
        }}
      >
        🐡
      </div>

      {/* Bubbles rising from Fugu while diving */}
      {bubbles && BUBBLES.map((b, i) => (
        <div
          key={i}
          className="absolute rounded-full bubble-anim"
          style={{
            left: `${b.x}%`,
            top: "58%",
            width: b.size,
            height: b.size,
            background: "rgba(0,212,255,0.18)",
            border: "1px solid rgba(0,212,255,0.35)",
            animationDelay: `${b.delay}s`,
            animationDuration: "1.9s",
          }}
        />
      ))}

      {/* Bioluminescent particles in the deep */}
      <div
        style={{
          opacity: bgDeep ? 1 : 0,
          transition: "opacity 1800ms ease 400ms",
        }}
      >
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-full biolum-anim"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.s,
              height: p.s,
              background: p.c,
              animationDelay: `${p.d}s`,
              animationDuration: `${p.dur}s`,
            }}
          />
        ))}
      </div>

      {/* Success message */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center gap-3"
        style={{
          bottom: "28%",
          opacity: showMsg ? 1 : 0,
          transform: showMsg ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 700ms ease, transform 700ms ease",
        }}
      >
        <div className="flex items-center gap-3">
          <div style={{ width: 1, height: 32, background: "rgba(0,212,255,0.35)" }} />
          <span
            className="text-xs font-mono tracking-widest uppercase"
            style={{ color: "#00d4ff" }}
          >
            {type === "deposit" ? "Secured in the deep" : "Cover active in the deep"}
          </span>
          <div style={{ width: 1, height: 32, background: "rgba(0,212,255,0.35)" }} />
        </div>
        <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
          Calm beneath the chaos · Powered by DeepBook
        </p>
      </div>

      {/* Skip */}
      <button
        onClick={onDone}
        className="absolute bottom-7 left-1/2 -translate-x-1/2 text-xs transition-colors"
        style={{ color: "rgba(255,255,255,0.2)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
      >
        skip
      </button>
    </div>
  );
}
