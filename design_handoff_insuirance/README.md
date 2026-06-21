# Handoff: Insuirance — Dive Animation Rework + Hero Landing

## Overview
This package upgrades the **Insuirance** dApp (BTC crash cover on Sui, settled by DeepBook Predict) in two areas:

1. **Deep-dive animation** — the surface→deep "buy cover / deposit" transition. Reworked for a seamless water gradient (no hard colour boundary), a simpler **silhouette diver** character, a **deeper, smoothly-calming** descent, and a **held final screen** the user dismisses themselves.
2. **Hero landing page** — a new DeepBook-style marketing screen that precedes the app, with a **Launch App** button that enters the existing app.

Plus a small cleanup: the dev-only **"test dive" floating button is removed**.

## About the Design Files
`Insuirance.reference.html` is a **design reference**, not production code. It's a self-contained HTML prototype (a custom component runtime) showing the intended look, motion, timing, and behaviour. **Do not ship it.** The task is to **recreate these behaviours in the existing Next.js codebase** (`insuirance/app`, React + TypeScript + `@mysten/dapp-kit`, Tailwind v4) using its established components and patterns.

Open the reference in a browser to watch the motion. The "Launch App" button enters the app; the app's logo returns to the landing.

## Fidelity
**High-fidelity.** Final colours, typography, spacing, timing curves, and the diver SVG are all specified below and present verbatim in the reference file. Recreate pixel- and timing-accurately, then map styling onto the existing CSS variables in `globals.css` where they already exist.

---

## Where this maps in the existing codebase

| Reference behaviour | Target file(s) |
|---|---|
| Dive animation (canvas water, diver, phases, dismiss) | `src/components/DepthAnimation.tsx` (rewrite) |
| Triggering the dive on cover purchase | `src/components/CoverForm.tsx` |
| Triggering the dive on vault deposit | `src/components/ShieldVault.tsx` |
| Hero landing + view routing (`hero` ↔ `app`) | `src/app/page.tsx` (+ new `src/components/HeroLanding.tsx`) |
| Colour/type tokens | `src/app/globals.css` (`--ocean-*`, `--background`, `--foreground`) |
| Remove dev "test dive" button | wherever it's currently mounted (delete it) |

---

## 1 — Deep-Dive Animation (`DepthAnimation.tsx`)

A full-screen `position:fixed; inset:0; z-index:90` overlay rendered while a dive is active. Three stacked layers, bottom→top:

1. **Storm bg** `linear-gradient(to bottom, #0e3558 0%, #061a30 40%, #030d1e 72%, #01080f 100%)` — fades out as we go deep.
2. **Deep bg** `linear-gradient(to bottom, #010d1c 0%, #010810 35%, #010609 68%, #020508 100%)` — fades in as we go deep.
3. **`<canvas>`** full-viewport (`width:100vw; height:100vh`) painting animated waves; slides up and fades out during descent.
4. Vignette overlay, diver, bubbles, biolum particles, status message.

### Canvas water (the key fix — NO hard boundary line)
Render loop at ~60fps. A global `intensity` (1 = stormy surface, 0 = still deep) scales wave amplitude. **Crucially, `intensity` is eased toward a target every frame so the sea calms smoothly and never snaps:**

```js
intensity += (intensityTarget - intensity) * 0.035;   // per-frame lerp
if (Math.abs(intensityTarget - intensity) < 0.002) intensity = intensityTarget;
```

`drawFrame(ctx, w, h, t, intensity)`:
- Clear, then a soft radial light from the surface: centre `x = w*(0.4 + sin(t*0.6)*0.25)`, `y = h*0.14`, radius `w*0.5`, colour `rgba(70,150,255, 0.13*intensity)` → transparent.
- **Wave layers** (`WAVE_LAYERS`, painted back-to-front). Each: a sine ridge at `yBase*h` summed from 3 harmonics, filled downward. **The fill gradient resolves completely to the deep bg colour `#01080f` at alpha 0 by the bottom — this is what removes the visible band:**
  ```
  stop 0.00 → rgba(r,g,b, a0)
  stop 0.45 → rgba(3,28,52, a0*0.55)
  stop 0.80 → rgba(1,12,24, a0*0.22)
  stop 1.00 → rgba(1,8,15, 0)        // fully transparent into the bg
  ```
  where `a0 = layer.a * intensity + 0.02`.
- **Single depth wash** over the whole canvas, also resolving to the exact bg colour so there is no seam:
  ```
  gradient (0, h*0.16) → (0, h):
  stop 0.00 → rgba(1,8,15, 0)
  stop 0.55 → rgba(1,8,15, 0.55*intensity + 0.05)
  stop 1.00 → rgba(1,8,15, 0.92*intensity + 0.08)
  ```

`WAVE_LAYERS` (kept high near the top of the canvas so they read as a surface):
```
{ amp:32, freq:0.014, speed:1.0, phase:0.0, yBase:0.22, r:8,  g:60,  b:140, a:0.70 }
{ amp:24, freq:0.023, speed:2.4, phase:2.1, yBase:0.25, r:12, g:80,  b:160, a:0.60 }
{ amp:20, freq:0.019, speed:1.6, phase:1.1, yBase:0.28, r:6,  g:55,  b:135, a:0.55 }
{ amp:16, freq:0.036, speed:3.9, phase:0.6, yBase:0.30, r:25, g:100, b:180, a:0.45 }
{ amp:10, freq:0.050, speed:5.5, phase:1.9, yBase:0.27, r:45, g:125, b:205, a:0.35 }
{ amp:28, freq:0.010, speed:0.7, phase:3.3, yBase:0.24, r:4,  g:40,  b:115, a:0.50 }
```
Per-point y for a layer: `sin(x*freq + t*speed + phase)*amp + sin(x*freq*2.2 + t*speed*1.5 + phase*0.8)*amp*0.38 + sin(x*freq*4.1 + t*speed*2.8 + phase*1.6)*amp*0.15`, sampled every 5px, then `lineTo(w,h); lineTo(0,h)` to close. `t += 0.016` per frame.

### The diver (simple silhouette — replaces the old brass-helmet diver)
Single flat-colour silhouette with one glowing visor. ViewBox `0 0 80 100`, rendered ~64×82 in the dive (and ~92×118 in the hero). Verbatim SVG:

```html
<svg viewBox="0 0 80 100" fill="none">
  <defs>
    <radialGradient id="dvGlow" cx="0.42" cy="0.36" r="0.72">
      <stop offset="0"  stop-color="#cdf6ff"/>
      <stop offset=".5" stop-color="#37c9ef"/>
      <stop offset="1"  stop-color="#0c6e96"/>
    </radialGradient>
  </defs>
  <!-- fins -->
  <path d="M31 79 Q23 96 18 99 Q31 90 36 85 Z" fill="#0c3550"/>
  <path d="M49 79 Q57 96 62 99 Q49 90 44 85 Z" fill="#0c3550"/>
  <!-- arms -->
  <path d="M30 62 Q18 66 16 77" stroke="#0e3a58" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M50 62 Q62 66 64 77" stroke="#0e3a58" stroke-width="7" fill="none" stroke-linecap="round"/>
  <!-- torso -->
  <path d="M28 56 Q26 80 33 88 Q40 92 47 88 Q54 80 52 56 Z" fill="#0e3a58"/>
  <!-- helmet -->
  <circle cx="40" cy="34" r="22" fill="#0e3a58"/>
  <!-- glowing visor -->
  <circle cx="40" cy="33" r="14" fill="url(#dvGlow)"/>
  <!-- highlight -->
  <ellipse cx="34" cy="27" rx="4.6" ry="2.8" fill="rgba(235,251,255,.55)" transform="rotate(-25 34 27)"/>
</svg>
```
Diver wrapper: `position:absolute; left:50%; translateX(-50%); top:<diverTop>%` with `transition: top 2.7s cubic-bezier(.3,0,.25,1)`. The SVG itself: `transform: rotate(<diverAngle>deg)` with `transition: transform 2.6s ease, filter 1.8s ease`.
- Surface filter: `drop-shadow(0 6px 10px rgba(0,0,0,.7))`
- Deep filter (glowing): `drop-shadow(0 0 14px rgba(42,212,255,1)) drop-shadow(0 0 30px rgba(42,212,255,.55))`

### Phase timeline (deeper + smooth)
State drives a `phase`, `diverTop` (%), `diverAngle`, `intensityTarget`, bg crossfade flag `bgDark`, and toggles for bubbles/particles. `setTimeout` schedule from `startDive(type, onComplete)`:

| t (ms) | phase | diverTop | diverAngle | intensityTarget | other |
|---|---|---|---|---|---|
| 0 | surface | 8 | 0 | 1 | waves full, bgDark=false, canDismiss=false |
| 700 | diving | 42 | 9 | 0.62 | showBubbles=true, waveSlide=-55 |
| 2100 | diving | 60 | 5 | 0.28 | waveSlide=-150, waveOpacity=0.4 |
| 3500 | deep | **70** | 0 | 0 | bgDark=true, showParticles=true, waveSlide=-260, waveOpacity=0 |
| 4600 | success | 70 | 0 | 0 | showMsg=true |
| 5500 | success | 70 | 0 | 0 | **canDismiss=true** (arms dismissal) |

After 5500ms it **stops and waits for the user** — no auto-close.

### Final screen + dismissal (new behaviour)
- Status block floats in the **upper water column** at `top:28%` (so it never overlaps the deep-resting diver), `pointer-events:none`, fades/rises in via `opacity`+`translateY` over .9s:
  - Eyebrow (mono, .28em, `#2ad4ff`): `Cover active in the deep` (cover) / `Secured in the deep` (deposit).
  - Sub (mono, `rgba(160,210,255,.32)`): `Calm beneath the chaos · Powered by DeepBook`.
- Once `canDismiss`, reveal (fade .7s): a primary **button** `Enter the deep →` (`pointer-events:auto`; gradient `linear-gradient(180deg,#5fe2ff,#16a8df)`, text `#04121f`, radius 11px, glow `0 0 24px -4px rgba(42,212,255,.6)`) and below it a mono hint `press anywhere to continue` (`rgba(140,195,235,.4)`, gentle drift animation).
- **Dismissal:** the whole overlay has an `onClick` that, **only when `canDismiss` is true**, runs `dismissDive()` → set `phase:'fading'` (overlay `opacity→0` over .7s) → after 650ms call `finishDive()`. Clicking the button does the same.
- `finishDive()` clears timers, cancels the RAF, sets `diving:false`, and calls the stored `onComplete` **once** (this is where the real cover/deposit state mutation — and later the NFT mint tx — runs).
- A small **"skip"** text button (mono, bottom centre) is shown only while `!canDismiss && phase!=='fading'`; it calls `finishDive()` immediately (so skipping a real purchase still completes it).

> **NFT mint:** intentionally **not** shown in the dive yet. Leave a clear seam at the `phase:'deep'/'success'` step to later surface the mint transaction status; for now `onComplete` just mutates local state.

---

## 2 — Hero Landing (`HeroLanding.tsx` + `page.tsx` routing)

`page.tsx` holds a `view` state, default **`'hero'`**. `HeroLanding` shows when `view==='hero'`; the existing app (nav + dashboard/cover/vault) shows when `view==='app'`.
- **Launch App** buttons → `setView('app')` + `window.scrollTo(0,0)`.
- App nav **logo** is clickable → `setView('hero')` + scroll top.

Shares the page background gradient and ambient biolum particles with the app (same `position:fixed` particle field, `z-index:0`).

### Sections (top→bottom)
1. **Landing nav** (sticky, `rgba(3,11,22,.6)` + blur): logo + wordmark "Insuirance" left; **Launch App →** button right (gradient `linear-gradient(180deg,#3fdcff,#0fa3da)`, text `#04121f`, radius 10px, glow).
2. **Hero** (`min-height:88vh`, centred): storm scene up top (rain streaks, 2 lightning bolts on `storm-flash`, animated wave SVGs on `wave-slide`, masked to fade out downward) → **floating diver silhouette** (the hero-size SVG above, `animation: mascot-bob 6s ease-in-out infinite`, cyan drop-shadow glow) → eyebrow `[ ONCHAIN CRASH COVER · BUILT ON DEEPBOOK ]` → **H1 62px/600/-.03em** "Where the crash / can't reach you." → 17px sub (`rgba(184,222,250,.62)`, max 520px): "BTC storms on the surface — your cover lives in the calm deep. Onchain protection, settled automatically by DeepBook Predict. No claims, no counterparty." → CTA row: **Launch App →** (primary) + **How it works** (secondary, `<a href="#how">`, `rgba(8,22,40,.7)` + hairline) → live **BTC/USD ticker** chip.
3. **Stats band** (4-col grid, 1px gaps, hairline frame, radius 16px, cells `rgba(5,15,28,.72)`): `$4.2M Total Covered · 1,284 Active Covers · $1.9M Vault TVL · $612K Payouts Settled`. Numbers in mono 28px/600, labels mono 10px .2em uppercase `rgba(140,185,220,.5)`. *(Wire to real metrics when available.)*
4. **How it works** (`id="how"`): eyebrow `[ THE DESCENT ]`, H2 38px "Three steps below the storm.", 3 cards (`rgba(6,18,34,.6)` + hairline, radius 16px, hover border `rgba(120,200,255,.4)`):
   - `[ 01 ] Pick your trigger` — "Cover a 5%, 10%, or 20% BTC drop. Pay a small premium up front — that's your only cost."
   - `[ 02 ] Dive in` — "Mint a Policy NFT onchain. Your cover descends below the storm, locked until expiry."
   - `[ 03 ] Settle automatically` — "A DeepBook oracle confirms the price at expiry. If it crashed, you're paid in dUSDC — no claims."
5. **Closing CTA**: H2 44px "Ready to leave / the surface?", sub, **Launch App →**.
6. **Footer**: wordmark + TESTNET badge left; mono "Calm beneath the chaos · Powered by DeepBook" right; top hairline.

---

## Interactions & Behaviour
- **View routing:** `hero` ⇄ `app` via Launch App / logo; scroll resets to top on switch.
- **Dive trigger:** cover purchase and vault deposit call `startDive(type, onComplete)`; `type` ∈ `'cover' | 'deposit'` only changes the success eyebrow copy.
- **Dive dismissal:** click anywhere (after ~5.5s) or the button → fade → `onComplete`. Early "skip" also completes.
- **Animations/easings:** diver `top` 2.7s `cubic-bezier(.3,0,.25,1)`; canvas slide/opacity 2.8s `cubic-bezier(.4,0,.2,1)` / 1.8s ease; bg crossfade 2.8s ease; wave intensity per-frame lerp (0.035); message fade/rise .9s; overlay fade .7s; hero diver `mascot-bob` 6s; rain `storm-rain`, lightning `storm-flash`, waves `wave-slide` (see keyframes in the reference `<style>`).
- **Reduced motion:** consider gating the canvas RAF + storm loops behind `prefers-reduced-motion` (not in the prototype).

## State Management (dive)
`diving`, `divingType`, `phase` (`surface|diving|deep|success|fading`), `diverTop`, `diverAngle`, `waveSlide`, `waveOpacity`, `bgDark`, `showBubbles`, `showParticles`, `showMsg`, `canDismiss`. Non-state refs: `intensity`, `intensityTarget`, the canvas ref, the RAF id, the timer array, and the stored `onComplete`. Always clear timers + cancel RAF on unmount and on finish.

## Design Tokens
- **Background / deep:** `#02080f` page; storm gradient `#2a6396→#01060d`; deep bg `#01080f`; layer stops `#010d1c #010810 #010609 #020508`.
- **Biolum / accent cyan:** `#2ad4ff`, `#3fdcff`, `#5fe2ff`, gradient pair `#3fdcff→#0fa3da` and `#5fe2ff→#16a8df`; visor glow `#cdf6ff→#37c9ef→#0c6e96`; diver silhouette `#0e3a58` (body), `#0c3550` (fins).
- **Text:** primary `#e8f4f8`; muted `rgba(184,222,250,.62)`; faint mono `rgba(140,185,220,.5)`. CTA text on cyan: `#04121f`.
- **Particle palette:** `rgba(42,212,255,.8)`, `rgba(74,224,168,.7)`, `rgba(150,120,255,.6)`.
- **Type:** Geist (UI) + Geist Mono (eyebrows/metrics/status). H1 62/600/-.03em, H2 38–44/600/-.025em, body 14–17/1.6. Mono eyebrows ~11px, .28–.34em, uppercase, often bracketed `[ … ]`.
- **Radius:** 9–16px. **Hairline:** `1px rgba(96,165,222,.12)`. **Glow shadow:** `0 0 24px -4px rgba(42,212,255,.6)`.
- **Spacing:** 4/7/9/14/18/22/24/30/48/96/104px rhythm used in the reference.

## Assets
No bitmap assets. Diver, shield logo, lightning, waves, and biolum particles are all inline SVG / CSS (verbatim in the reference). Fonts: Geist + Geist Mono (Google Fonts).

## Files
- `Insuirance.reference.html` — the full interactive prototype (open in a browser).
- Existing code to modify: `src/components/DepthAnimation.tsx`, `CoverForm.tsx`, `ShieldVault.tsx`, `Dashboard.tsx`, `src/app/page.tsx`, `src/app/globals.css`. New: `src/components/HeroLanding.tsx`.
