"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Phase = "surface" | "diving" | "deep" | "success" | "fading";

interface Props {
  type: "deposit" | "cover";
  onDone: () => void;
}

// ── Wave layers (README spec: yBase kept high so waves read as surface) ──────

interface WaveLayer {
  amp: number;
  freq: number;
  speed: number;
  phase: number;
  yBase: number;
  r: number; g: number; b: number; a: number;
}

const WAVE_LAYERS: WaveLayer[] = [
  { amp: 32, freq: 0.014, speed: 1.0, phase: 0.0, yBase: 0.22, r:  8, g:  60, b: 140, a: 0.70 },
  { amp: 24, freq: 0.023, speed: 2.4, phase: 2.1, yBase: 0.25, r: 12, g:  80, b: 160, a: 0.60 },
  { amp: 20, freq: 0.019, speed: 1.6, phase: 1.1, yBase: 0.28, r:  6, g:  55, b: 135, a: 0.55 },
  { amp: 16, freq: 0.036, speed: 3.9, phase: 0.6, yBase: 0.30, r: 25, g: 100, b: 180, a: 0.45 },
  { amp: 10, freq: 0.050, speed: 5.5, phase: 1.9, yBase: 0.27, r: 45, g: 125, b: 205, a: 0.35 },
  { amp: 28, freq: 0.010, speed: 0.7, phase: 3.3, yBase: 0.24, r:  4, g:  40, b: 115, a: 0.50 },
];

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  intensity: number,
) {
  ctx.clearRect(0, 0, w, h);

  // Soft radial light from surface
  const lx = w * (0.4 + Math.sin(t * 0.6) * 0.25);
  const lg = ctx.createRadialGradient(lx, h * 0.14, 0, lx, h * 0.14, w * 0.5);
  lg.addColorStop(0, `rgba(70,150,255,${(0.13 * intensity).toFixed(3)})`);
  lg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, w, h);

  // Wave layers back → front
  for (let wi = WAVE_LAYERS.length - 1; wi >= 0; wi--) {
    const l = WAVE_LAYERS[wi];
    const amp = l.amp * intensity;
    const yb  = h * l.yBase;

    ctx.beginPath();
    ctx.moveTo(0, yb);
    for (let x = 0; x <= w; x += 5) {
      const y  = Math.sin(x * l.freq + t * l.speed + l.phase) * amp;
      const y2 = Math.sin(x * l.freq * 2.2 + t * l.speed * 1.5 + l.phase * 0.8) * amp * 0.38;
      const y3 = Math.sin(x * l.freq * 4.1 + t * l.speed * 2.8 + l.phase * 1.6) * amp * 0.15;
      ctx.lineTo(x, yb + y + y2 + y3);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();

    // Fill resolves to rgba(1,8,15,0) at bottom — no hard boundary line
    const a0 = l.a * intensity + 0.02;
    const wGrad = ctx.createLinearGradient(0, yb - amp, 0, h);
    wGrad.addColorStop(0.00, `rgba(${l.r},${l.g},${l.b},${a0.toFixed(3)})`);
    wGrad.addColorStop(0.45, `rgba(3,28,52,${(a0 * 0.55).toFixed(3)})`);
    wGrad.addColorStop(0.80, `rgba(1,12,24,${(a0 * 0.22).toFixed(3)})`);
    wGrad.addColorStop(1.00, "rgba(1,8,15,0)");
    ctx.fillStyle = wGrad;
    ctx.fill();
  }

  // Single depth wash — resolves to exact bg colour so there is no seam
  const dw = ctx.createLinearGradient(0, h * 0.16, 0, h);
  dw.addColorStop(0.00, "rgba(1,8,15,0)");
  dw.addColorStop(0.55, `rgba(1,8,15,${(0.55 * intensity + 0.05).toFixed(3)})`);
  dw.addColorStop(1.00, `rgba(1,8,15,${(0.92 * intensity + 0.08).toFixed(3)})`);
  ctx.fillStyle = dw;
  ctx.fillRect(0, h * 0.16, w, h * 0.84);
}

// ── Diver — simple silhouette (README verbatim SVG) ───────────────────────────

function Diver({ glowing, angle }: { glowing: boolean; angle: number }) {
  return (
    <svg
      width="64" height="82"
      viewBox="0 0 80 100"
      fill="none"
      style={{
        transform: `rotate(${angle}deg)`,
        filter: glowing
          ? "drop-shadow(0 0 14px rgba(42,212,255,1)) drop-shadow(0 0 30px rgba(42,212,255,.55))"
          : "drop-shadow(0 6px 10px rgba(0,0,0,.7))",
        transition: "transform 2600ms ease, filter 1800ms ease",
      }}
    >
      <defs>
        <radialGradient id="dvGlow" cx="0.42" cy="0.36" r="0.72">
          <stop offset="0"   stopColor="#cdf6ff" />
          <stop offset=".5"  stopColor="#37c9ef" />
          <stop offset="1"   stopColor="#0c6e96" />
        </radialGradient>
      </defs>
      {/* fins */}
      <path d="M31 79 Q23 96 18 99 Q31 90 36 85 Z" fill="#0c3550" />
      <path d="M49 79 Q57 96 62 99 Q49 90 44 85 Z" fill="#0c3550" />
      {/* arms */}
      <path d="M30 62 Q18 66 16 77" stroke="#0e3a58" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M50 62 Q62 66 64 77" stroke="#0e3a58" strokeWidth="7" fill="none" strokeLinecap="round" />
      {/* torso */}
      <path d="M28 56 Q26 80 33 88 Q40 92 47 88 Q54 80 52 56 Z" fill="#0e3a58" />
      {/* helmet */}
      <circle cx="40" cy="34" r="22" fill="#0e3a58" />
      {/* glowing visor */}
      <circle cx="40" cy="33" r="14" fill="url(#dvGlow)" />
      {/* highlight */}
      <ellipse cx="34" cy="27" rx="4.6" ry="2.8" fill="rgba(235,251,255,.55)" transform="rotate(-25 34 27)" />
    </svg>
  );
}

// ── Bioluminescent particles ──────────────────────────────────────────────────

const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  x: 4 + (i * 4.4) % 92,
  y: 48 + (i * 2.9) % 47,
  color: [
    "rgba(42,212,255,.8)",
    "rgba(74,224,168,.7)",
    "rgba(150,120,255,.6)",
  ][i % 3],
  size: 2 + (i % 3),
  delay: (i * 0.31) % 3.8,
  dur:   2.6 + (i % 4) * 0.55,
}));

// ── Bubbles rising from diver ─────────────────────────────────────────────────

const BUBBLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: 44 + (i % 5) * 2.2 - 4.5,
  size: 3 + (i % 4),
  delay: (i * 0.19) % 1.6,
  dur:   1.5 + (i % 3) * 0.45,
}));

// ── Main component ────────────────────────────────────────────────────────────

export function DepthAnimation({ type, onDone }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const rafRef         = useRef<number>(0);
  const tRef           = useRef(0);
  const intRef         = useRef(1);          // current intensity (lerped each frame)
  const intTargetRef   = useRef(1);          // target intensity
  const timersRef      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onDoneRef      = useRef(onDone);
  onDoneRef.current    = onDone;

  const [phase,          setPhase]          = useState<Phase>("surface");
  const [diverTop,       setDiverTop]       = useState(8);
  const [diverAngle,     setDiverAngle]     = useState(0);
  const [waveSlide,      setWaveSlide]      = useState(0);
  const [waveOpacity,    setWaveOpacity]    = useState(1);
  const [bgDark,         setBgDark]         = useState(false);
  const [showBubbles,    setShowBubbles]    = useState(false);
  const [showParticles,  setShowParticles]  = useState(false);
  const [showMsg,        setShowMsg]        = useState(false);
  const [canDismiss,     setCanDismiss]     = useState(false);

  // finishDive: clear all timers, cancel RAF, call onDone once
  const finishDive = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    cancelAnimationFrame(rafRef.current);
    onDoneRef.current();
  }, []);

  // dismissDive: fade overlay then finish
  const dismissDive = useCallback(() => {
    setPhase("fading");
    const t = setTimeout(finishDive, 650);
    timersRef.current.push(t);
  }, [finishDive]);

  // ── Canvas RAF with per-frame intensity lerp ────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d")!;

    function loop() {
      tRef.current += 0.016;
      // Per-frame lerp — wave intensity eases smoothly, never snaps
      const diff = intTargetRef.current - intRef.current;
      intRef.current = Math.abs(diff) < 0.002
        ? intTargetRef.current
        : intRef.current + diff * 0.035;
      if (canvas) drawFrame(ctx, canvas.width, canvas.height, tRef.current, intRef.current);
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ── Phase timeline ──────────────────────────────────────────────────────────
  useEffect(() => {
    const push = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timersRef.current.push(t);
    };

    // t=0: surface — waves full, canDismiss=false
    intTargetRef.current = 1;

    // t=700: start diving
    push(() => {
      setPhase("diving");
      setDiverTop(42);
      setDiverAngle(9);
      intTargetRef.current = 0.62;
      setShowBubbles(true);
      setWaveSlide(-55);
    }, 700);

    // t=2100: mid-water
    push(() => {
      setDiverTop(60);
      setDiverAngle(5);
      intTargetRef.current = 0.28;
      setWaveSlide(-150);
      setWaveOpacity(0.4);
    }, 2100);

    // t=3500: reach the deep
    push(() => {
      setPhase("deep");
      setDiverTop(48);
      setDiverAngle(0);
      intTargetRef.current = 0;
      setBgDark(true);
      setShowParticles(true);
      setWaveSlide(-260);
      setWaveOpacity(0);
    }, 3500);

    // t=4600: success message
    push(() => {
      setPhase("success");
      setShowMsg(true);
    }, 4600);

    // t=5500: enable dismissal — stops and waits for user
    push(() => {
      setCanDismiss(true);
    }, 5500);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{
        zIndex: 90,
        opacity: phase === "fading" ? 0 : 1,
        transition: "opacity 700ms ease",
        cursor: canDismiss ? "pointer" : "default",
      }}
      onClick={canDismiss ? dismissDive : undefined}
    >
      {/* ── Storm background (fades out as we descend) ─────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, #0e3558 0%, #061a30 40%, #030d1e 72%, #01080f 100%)",
          opacity: bgDark ? 0 : 1,
          transition: "opacity 2800ms ease",
        }}
      />
      {/* ── Deep ocean background (fades in) ───────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, #010d1c 0%, #010810 35%, #010609 68%, #020508 100%)",
          opacity: bgDark ? 1 : 0,
          transition: "opacity 2800ms ease",
        }}
      />

      {/* ── Canvas (waves) — slides up and fades out during descent ─── */}
      <canvas
        ref={canvasRef}
        className="absolute left-0 top-0"
        style={{
          width: "100%",
          transform: `translateY(${waveSlide}px)`,
          opacity: waveOpacity,
          transition: [
            "transform 2800ms cubic-bezier(0.4,0,0.2,1)",
            "opacity 1800ms ease",
          ].join(", "),
        }}
      />

      {/* ── Depth vignette ─────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to top, rgba(1,5,10,.95) 0%, rgba(1,5,10,.5) 25%, transparent 55%)",
          opacity: bgDark ? 1 : 0.3,
          transition: "opacity 2500ms ease",
        }}
      />

      {/* ── Biolum depth glow ──────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 30% at 50% 62%, rgba(0,140,220,.07) 0%, transparent 100%)",
          opacity: showParticles ? 1 : 0,
          transition: "opacity 2000ms ease",
        }}
      />

      {/* ── Diver ──────────────────────────────────────────────────── */}
      <div
        className="absolute left-1/2 pointer-events-none"
        style={{
          top: `${diverTop}%`,
          transform: "translateX(-50%)",
          transition: "top 2700ms cubic-bezier(0.3,0,0.25,1)",
          zIndex: 10,
        }}
      >
        <Diver glowing={bgDark} angle={diverAngle} />
      </div>

      {/* ── Bubbles rising from diver ───────────────────────────────── */}
      {showBubbles && BUBBLES.map((b) => (
        <div
          key={b.id}
          className="absolute rounded-full bubble-anim pointer-events-none"
          style={{
            left: `${b.x}%`,
            top: `${diverTop + 6}%`,
            width: b.size,
            height: b.size,
            background: "rgba(160,225,255,0.22)",
            border: "1px solid rgba(120,205,255,0.45)",
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
          }}
        />
      ))}

      {/* ── Bioluminescent particles (deep only) ───────────────────── */}
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full biolum-anim pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            opacity: showParticles ? 1 : 0,
            transition: `opacity 900ms ease ${Math.round(p.delay * 120)}ms`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}

      {/* ── Status message — anchored above the diver ───────────────── */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center gap-3 pointer-events-none"
        style={{
          top: `${Math.max(diverTop - 13, 5)}%`,
          opacity: showMsg ? 1 : 0,
          transform: showMsg ? "translateY(0)" : "translateY(18px)",
          transition: "opacity 900ms ease, transform 900ms ease, top 2700ms cubic-bezier(0.3,0,0.25,1)",
        }}
      >
        <div className="flex items-center gap-5">
          <div style={{ width: 1, height: 40, background: "rgba(42,212,255,0.28)" }} />
          <div className="text-center space-y-2">
            <p
              className="text-xs font-mono tracking-[0.28em] uppercase"
              style={{ color: "#2ad4ff" }}
            >
              {type === "deposit" ? "Secured in the deep" : "Cover active in the deep"}
            </p>
            <p className="text-xs font-mono" style={{ color: "rgba(160,210,255,0.32)" }}>
              Calm beneath the chaos · Powered by DeepBook
            </p>
          </div>
          <div style={{ width: 1, height: 40, background: "rgba(42,212,255,0.28)" }} />
        </div>
      </div>

      {/* ── Dismiss button + hint — anchored below the diver ─────────── */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center gap-3"
        style={{
          top: `${Math.min(diverTop + 12, 85)}%`,
          opacity: canDismiss ? 1 : 0,
          transition: "opacity 700ms ease, top 2700ms cubic-bezier(0.3,0,0.25,1)",
          pointerEvents: canDismiss ? "auto" : "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismissDive}
          style={{
            background: "linear-gradient(180deg,#5fe2ff,#16a8df)",
            color: "#04121f",
            borderRadius: 11,
            padding: "10px 28px",
            fontWeight: 600,
            fontSize: 14,
            boxShadow: "0 0 24px -4px rgba(42,212,255,.6)",
            border: "none",
            cursor: "pointer",
          }}
        >
          Enter the deep →
        </button>
        <p
          className="text-xs font-mono drift-anim"
          style={{ color: "rgba(140,195,235,.4)" }}
        >
          press anywhere to continue
        </p>
      </div>

      {/* ── Skip (only while waiting to dive, before canDismiss) ───── */}
      {!canDismiss && phase !== "fading" && (
        <button
          onClick={finishDive}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs font-mono transition-colors duration-200"
          style={{ color: "rgba(255,255,255,0.15)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.15)")}
        >
          skip
        </button>
      )}
    </div>
  );
}
