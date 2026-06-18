"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "surface" | "diving" | "deep" | "success" | "fading";

interface Props {
  type: "deposit" | "cover";
  onDone: () => void;
}

// ── Wave layers (rendered on canvas) ────────────────────────────────────────

interface WaveLayer {
  amp: number;       // base amplitude px
  freq: number;      // spatial frequency
  speed: number;     // time speed multiplier
  phase: number;     // initial phase offset
  yBase: number;     // fraction of canvas height
  r: number; g: number; b: number; a: number; // RGBA
}

const WAVE_LAYERS: WaveLayer[] = [
  { amp: 32, freq: 0.014, speed: 1.0, phase: 0.0, yBase: 0.36, r:  8, g: 60, b:140, a: 0.70 },
  { amp: 24, freq: 0.023, speed: 2.4, phase: 2.1, yBase: 0.41, r: 12, g: 80, b:160, a: 0.60 },
  { amp: 20, freq: 0.019, speed: 1.6, phase: 1.1, yBase: 0.45, r:  6, g: 55, b:135, a: 0.55 },
  { amp: 16, freq: 0.036, speed: 3.9, phase: 0.6, yBase: 0.49, r: 25, g:100, b:180, a: 0.45 },
  { amp: 10, freq: 0.050, speed: 5.5, phase: 1.9, yBase: 0.43, r: 45, g:125, b:205, a: 0.35 },
  { amp: 28, freq: 0.010, speed: 0.7, phase: 3.3, yBase: 0.38, r:  4, g: 40, b:115, a: 0.50 },
  { amp:  8, freq: 0.068, speed: 7.0, phase: 0.3, yBase: 0.46, r: 70, g:150, b:220, a: 0.25 },
];

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  intensity: number,   // 1 = full storm, 0 = calm
) {
  ctx.clearRect(0, 0, w, h);

  // ── Flickering storm light ──
  const lx = w * (0.4 + Math.sin(t * 0.6) * 0.25);
  const lg = ctx.createRadialGradient(lx, h * 0.25, 0, lx, h * 0.25, w * 0.45);
  lg.addColorStop(0, `rgba(70,150,255,${0.14 * intensity})`);
  lg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, w, h);

  // ── Wave layers back → front ──
  for (let wi = WAVE_LAYERS.length - 1; wi >= 0; wi--) {
    const l = WAVE_LAYERS[wi];
    const amp = l.amp * intensity;
    const yb  = h * l.yBase;

    ctx.beginPath();
    ctx.moveTo(0, yb);
    for (let x = 0; x <= w; x += 4) {
      const y  = Math.sin(x * l.freq + t * l.speed + l.phase) * amp;
      const y2 = Math.sin(x * l.freq * 2.2 + t * l.speed * 1.5 + l.phase * 0.8) * amp * 0.38;
      const y3 = Math.sin(x * l.freq * 4.1 + t * l.speed * 2.8 + l.phase * 1.6) * amp * 0.15;
      ctx.lineTo(x, yb + y + y2 + y3);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();

    // Gradient fill: wave colour at crest → seamless deep-black at bottom
    const wGrad = ctx.createLinearGradient(0, yb - amp, 0, h);
    const a0 = l.a * intensity + 0.02;
    wGrad.addColorStop(0,    `rgba(${l.r},${l.g},${l.b},${a0.toFixed(3)})`);
    wGrad.addColorStop(0.28, `rgba(${Math.max(0,l.r-5)},${Math.max(0,l.g-18)},${Math.max(0,l.b-26)},${(a0*0.82).toFixed(3)})`);
    wGrad.addColorStop(0.60, `rgba(2,9,24,${(a0*0.68).toFixed(3)})`);
    wGrad.addColorStop(1,    `rgba(1,4,11,${(0.94*intensity+0.05).toFixed(3)})`);
    ctx.fillStyle = wGrad;
    ctx.fill();
  }

  // ── Foam spray at crests ──
  if (intensity > 0.1) {
    for (let x = 0; x < w; x += 55) {
      const cy = h * 0.36 + Math.sin(x * 0.014 + t * 1.0) * 32 * intensity;
      const cx = x + Math.sin(t * 1.9 + x * 0.009) * 22;
      const fa = (0.10 + Math.abs(Math.sin(t * 2.4 + x * 0.018)) * 0.09) * intensity;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
      rg.addColorStop(0, `rgba(210,240,255,${fa})`);
      rg.addColorStop(1, "rgba(210,240,255,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Abyss gradient — seamless fade from wave base into deep black ──
  const abyssGrad = ctx.createLinearGradient(0, h * 0.38, 0, h);
  abyssGrad.addColorStop(0,    "rgba(1,5,14,0)");
  abyssGrad.addColorStop(0.22, "rgba(1,5,13,0.28)");
  abyssGrad.addColorStop(0.50, "rgba(1,4,11,0.64)");
  abyssGrad.addColorStop(0.78, "rgba(1,3,10,0.86)");
  abyssGrad.addColorStop(1,    "rgba(1,3,9,0.97)");
  ctx.fillStyle = abyssGrad;
  ctx.fillRect(0, h * 0.38, w, h * 0.62);
}

// ── Diver SVG silhouette ─────────────────────────────────────────────────────

function Diver({ glowing, angle }: { glowing: boolean; angle: number }) {
  return (
    <svg
      width="56" height="80"
      viewBox="0 0 56 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transform: `rotate(${angle}deg)`,
        filter: glowing
          ? "drop-shadow(0 0 14px rgba(0,212,255,1)) drop-shadow(0 0 30px rgba(0,212,255,0.55))"
          : "drop-shadow(0 6px 10px rgba(0,0,0,0.7))",
        transition: "transform 2600ms ease, filter 1800ms ease",
      }}
    >
      {/* Air tank */}
      <rect x="32" y="27" width="10" height="24" rx="4" fill="rgba(130,200,220,0.88)" />
      <rect x="33" y="24" width="8"  height="4"  rx="2" fill="rgba(100,175,200,0.80)" />
      {/* Regulator hose */}
      <path d="M36 28 Q44 25 43 20 Q42 16 38 17"
        stroke="rgba(90,170,200,0.75)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Body / wetsuit */}
      <ellipse cx="23" cy="43" rx="11" ry="16" fill="rgba(20,65,130,0.95)" />
      <ellipse cx="20" cy="39" rx="4.5" ry="9" fill="rgba(35,90,165,0.50)" />
      {/* Helmet */}
      <circle cx="23" cy="21" r="11" fill="rgba(20,65,130,0.95)" />
      {/* Visor */}
      <path d="M13 19 Q23 10 33 19 Q33 28 23 30 Q13 28 13 19Z" fill="rgba(0,175,230,0.82)" />
      {/* Visor glare */}
      <path d="M16 17 Q21 13 27 16" stroke="rgba(210,245,255,0.55)" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Left arm */}
      <path d="M12 37 L2 51" stroke="rgba(20,65,130,0.95)" strokeWidth="7" strokeLinecap="round" />
      {/* Right arm */}
      <path d="M34 37 L42 52" stroke="rgba(20,65,130,0.95)" strokeWidth="7" strokeLinecap="round" />
      {/* Gloves */}
      <circle cx="2"  cy="52" r="5" fill="rgba(0,145,200,0.92)" />
      <circle cx="42" cy="53" r="5" fill="rgba(0,145,200,0.92)" />
      {/* Left fin */}
      <path d="M13 57 L2  78 L23 67 Z" fill="rgba(0,195,220,0.92)" />
      {/* Right fin */}
      <path d="M33 57 L44 78 L23 67 Z" fill="rgba(0,195,220,0.92)" />
    </svg>
  );
}

// ── Bioluminescent particles ─────────────────────────────────────────────────

const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  x: 4 + (i * 4.4) % 92,
  y: 48 + (i * 2.9) % 47,
  color: [
    "rgba(0,212,255,0.75)",
    "rgba(70,220,175,0.65)",
    "rgba(155,80,255,0.55)",
  ][i % 3],
  size: 2 + (i % 3),
  delay: (i * 0.31) % 3.8,
  dur:   2.6 + (i % 4) * 0.55,
}));

// ── Bubbles rising from diver ────────────────────────────────────────────────

const BUBBLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: 44 + (i % 5) * 2.2 - 4.5,
  size: 3 + (i % 4),
  delay: (i * 0.19) % 1.6,
  dur: 1.5 + (i % 3) * 0.45,
}));

// ── Main component ───────────────────────────────────────────────────────────

export function DepthAnimation({ type, onDone }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const tRef        = useRef(0);
  const intRef      = useRef(1);            // wave intensity (no re-render needed)

  const [phase,        setPhase]        = useState<Phase>("surface");
  const [diverTop,     setDiverTop]     = useState(10);   // % from top
  const [diverAngle,   setDiverAngle]   = useState(0);
  const [waveSlide,    setWaveSlide]    = useState(0);    // translateY px — waves scroll up
  const [waveOpacity,  setWaveOpacity]  = useState(1);
  const [bgDark,       setBgDark]       = useState(false);
  const [showBubbles,  setShowBubbles]  = useState(false);
  const [showParticles,setShowParticles]= useState(false);
  const [showMsg,      setShowMsg]      = useState(false);

  // ── Canvas wave loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = Math.round(window.innerHeight * 0.6);
    }
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d")!;

    function loop() {
      tRef.current += 0.016;
      if (canvas) drawFrame(ctx, canvas.width, canvas.height, tRef.current, intRef.current);
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ── Animation timeline ───────────────────────────────────────────────────
  useEffect(() => {
    // 0.7s — start diving
    const t1 = setTimeout(() => {
      setPhase("diving");
      setDiverTop(58);
      setDiverAngle(10);
      setWaveSlide(-55);
      setShowBubbles(true);
    }, 700);

    // 2.0s — mid-water: waves receding
    const t2 = setTimeout(() => {
      intRef.current = 0.25;
      setWaveSlide(-120);
      setWaveOpacity(0.35);
    }, 2000);

    // 3.2s — reach the deep
    const t3 = setTimeout(() => {
      setPhase("deep");
      setBgDark(true);
      setDiverAngle(0);
      setShowBubbles(false);
      setShowParticles(true);
      setWaveSlide(-200);
      setWaveOpacity(0);
      intRef.current = 0;
    }, 3200);

    // 4.2s — success message
    const t4 = setTimeout(() => {
      setPhase("success");
      setShowMsg(true);
    }, 4200);

    // 5.6s — fade out
    const t5 = setTimeout(() => setPhase("fading"), 5700);
    const t6 = setTimeout(onDone, 6400);

    return () => [t1, t2, t3, t4, t5, t6].forEach(clearTimeout);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        opacity: phase === "fading" ? 0 : 1,
        transition: "opacity 700ms ease",
      }}
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
      {/* ── Deep ocean background (fades in) ────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, #010d1c 0%, #010810 35%, #010609 68%, #020508 100%)",
          opacity: bgDark ? 1 : 0,
          transition: "opacity 2800ms ease",
        }}
      />
      {/* ── Mid-water pressure gradient (appears while diving) ───────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, transparent 0%, rgba(0,6,18,0) 20%, rgba(0,5,14,0.50) 55%, rgba(1,4,12,0.88) 100%)",
          opacity: phase === "diving" || phase === "deep" || phase === "success" ? 1 : 0,
          transition: "opacity 2200ms ease",
        }}
      />

      {/* ── Storm surface glow (top) ────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 110% 45% at 50% 0%, rgba(50,130,255,0.18) 0%, transparent 100%)",
          opacity: phase === "surface" || phase === "diving" ? 1 : 0,
          transition: "opacity 2200ms ease",
        }}
      />

      {/* ── Canvas (waves) — scrolls upward as diver descends ─────── */}
      <canvas
        ref={canvasRef}
        className="absolute left-0"
        style={{
          top: 0,
          width: "100%",
          transform: `translateY(${waveSlide}px)`,
          opacity: waveOpacity,
          transition: [
            "transform 2800ms cubic-bezier(0.4, 0, 0.2, 1)",
            "opacity 1800ms ease",
          ].join(", "),
        }}
      />

      {/* ── Depth vignette at bottom ───────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to top, rgba(1,5,10,0.95) 0%, rgba(1,5,10,0.5) 25%, transparent 55%)",
          opacity: bgDark ? 1 : 0.3,
          transition: "opacity 2500ms ease",
        }}
      />

      {/* ── Depth luminescence glow (replaces hard lines) ──────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 30% at 50% 62%, rgba(0,140,220,0.07) 0%, transparent 100%)",
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
          transition: "top 2700ms cubic-bezier(0.3, 0, 0.25, 1)",
          zIndex: 10,
        }}
      >
        <Diver glowing={bgDark} angle={diverAngle} />
      </div>

      {/* ── Bubbles rising from diver ───────────────────────────────── */}
      {showBubbles && BUBBLES.map((b) => (
        <div
          key={b.id}
          className="absolute rounded-full bubble-anim"
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
          className="absolute rounded-full biolum-anim"
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

      {/* ── Success message ─────────────────────────────────────────── */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center gap-3 pointer-events-none"
        style={{
          bottom: "22%",
          opacity: showMsg ? 1 : 0,
          transform: showMsg ? "translateY(0)" : "translateY(18px)",
          transition: "opacity 900ms ease, transform 900ms ease",
        }}
      >
        <div className="flex items-center gap-5">
          <div style={{ width: 1, height: 40, background: "rgba(0,212,255,0.28)" }} />
          <div className="text-center space-y-2">
            <p
              className="text-xs font-mono tracking-[0.28em] uppercase"
              style={{ color: "#00d4ff" }}
            >
              {type === "deposit" ? "Secured in the deep" : "Cover active in the deep"}
            </p>
            <p className="text-xs font-mono" style={{ color: "rgba(160,210,255,0.32)" }}>
              Calm beneath the chaos · Powered by DeepBook
            </p>
          </div>
          <div style={{ width: 1, height: 40, background: "rgba(0,212,255,0.28)" }} />
        </div>
      </div>

      {/* ── Skip ───────────────────────────────────────────────────── */}
      <button
        onClick={onDone}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs transition-colors duration-200"
        style={{ color: "rgba(255,255,255,0.15)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.15)")}
      >
        skip
      </button>
    </div>
  );
}
