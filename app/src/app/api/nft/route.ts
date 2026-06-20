import { NextRequest, NextResponse } from "next/server";

// Policy status codes (mirrors policy.move)
const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  "0": { label: "ACTIVE",  color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  "1": { label: "CLAIMED", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  "2": { label: "EXPIRED", color: "#9ca3af", bg: "rgba(156,163,175,0.10)" },
};

function fmtStrike(raw: string): string {
  const n = Number(raw);
  if (!n) return "—";
  const usd = Math.round(n / 1_000_000_000);
  return `$${usd.toLocaleString("en-US")}`;
}

function fmtQty(raw: string): string {
  const n = Number(raw);
  if (!n) return "—";
  const dusdc = n / 1_000_000;
  return `${dusdc % 1 === 0 ? dusdc.toFixed(0) : dusdc.toFixed(2)} DUSDC`;
}

function fmtExpiry(raw: string): string {
  const ms = Number(raw);
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const asset  = p.get("asset")  ?? "BTC";
  const strike = p.get("strike") ?? "0";
  const expiry = p.get("expiry") ?? "0";
  const qty    = p.get("qty")    ?? "0";
  const status = p.get("status") ?? "0";

  const strikeStr = fmtStrike(strike);
  const expiryStr = fmtExpiry(expiry);
  const qtyStr    = fmtQty(qty);
  const st        = STATUS[status] ?? STATUS["0"];

  const svg = `<svg width="600" height="380" viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#030d1e"/>
      <stop offset="100%" stop-color="#010609"/>
    </linearGradient>
    <linearGradient id="topBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#2ad4ff" stop-opacity="0"/>
      <stop offset="25%"  stop-color="#2ad4ff"/>
      <stop offset="75%"  stop-color="#2ad4ff"/>
      <stop offset="100%" stop-color="#2ad4ff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="div" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="rgba(255,255,255,0)"/>
      <stop offset="15%"  stop-color="rgba(255,255,255,0.07)"/>
      <stop offset="85%"  stop-color="rgba(255,255,255,0.07)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>

  <!-- Background + border -->
  <rect width="600" height="380" rx="20" fill="url(#bg)"/>
  <rect width="600" height="380" rx="20" fill="none" stroke="rgba(42,212,255,0.12)" stroke-width="1"/>
  <rect x="0" y="0" width="600" height="3" rx="1.5" fill="url(#topBar)"/>

  <!-- Shield icon (left-aligned with text) -->
  <g transform="translate(40, 28)">
    <path d="M16 0 L32 5.5 L32 18 C32 26 26 31 16 34 C6 31 0 26 0 18 L0 5.5 Z"
      fill="rgba(10,40,70,0.9)" stroke="#2ad4ff" stroke-width="1.3"/>
    <path d="M16 6 L25 9.5 L25 16 C25 20.5 21.5 23.5 16 25.5 C10.5 23.5 7 20.5 7 16 L7 9.5 Z"
      fill="rgba(42,212,255,0.10)"/>
    <circle cx="16" cy="17" r="4" fill="#2ad4ff"/>
  </g>

  <!-- Brand label -->
  <text x="84" y="40" font-family="monospace" font-size="10" fill="rgba(42,212,255,0.5)" letter-spacing="3">INSUIRANCE</text>
  <text x="84" y="55" font-family="monospace" font-size="9" fill="rgba(100,150,200,0.35)" letter-spacing="1">PARAMETRIC CRASH COVER</text>

  <!-- Title -->
  <text x="40" y="100" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="white">${asset} CRASH COVER</text>

  <!-- Divider -->
  <rect x="40" y="114" width="520" height="1" fill="url(#div)"/>

  <!-- Stats row — 3 columns, fixed x positions -->
  <!-- Strike -->
  <text x="40"  y="142" font-family="monospace" font-size="9"  fill="rgba(120,165,215,0.5)" letter-spacing="1.5">STRIKE</text>
  <text x="40"  y="168" font-family="monospace" font-size="22" font-weight="bold" fill="white">${strikeStr}</text>

  <!-- Expiry -->
  <text x="230" y="142" font-family="monospace" font-size="9"  fill="rgba(120,165,215,0.5)" letter-spacing="1.5">EXPIRY</text>
  <text x="230" y="168" font-family="monospace" font-size="18" font-weight="bold" fill="white">${expiryStr}</text>

  <!-- Cover -->
  <text x="430" y="142" font-family="monospace" font-size="9"  fill="rgba(120,165,215,0.5)" letter-spacing="1.5">COVER</text>
  <text x="430" y="168" font-family="monospace" font-size="18" font-weight="bold" fill="white">${qtyStr}</text>

  <!-- Divider -->
  <rect x="40" y="186" width="520" height="1" fill="url(#div)"/>

  <!-- Payout condition -->
  <text x="40" y="216" font-family="Arial, sans-serif" font-size="13" fill="rgba(150,195,240,0.6)">Pays out if ${asset} settles at or below ${strikeStr}.</text>
  <text x="40" y="236" font-family="Arial, sans-serif" font-size="12" fill="rgba(120,160,210,0.4)">Settlement automatic &#x2022; Fully onchain &#x2022; DeepBook Predict oracle</text>

  <!-- Divider -->
  <rect x="40" y="252" width="520" height="1" fill="url(#div)"/>

  <!-- Status badge -->
  <rect x="40" y="268" width="108" height="26" rx="13" fill="${st.bg}" stroke="${st.color}" stroke-opacity="0.45" stroke-width="1"/>
  <text x="94" y="285" font-family="monospace" font-size="11" font-weight="bold" fill="${st.color}" text-anchor="middle" letter-spacing="1.5">${st.label}</text>

  <!-- Oracle badge -->
  <rect x="162" y="268" width="148" height="26" rx="13" fill="rgba(42,212,255,0.06)" stroke="rgba(42,212,255,0.18)" stroke-width="1"/>
  <text x="236" y="285" font-family="monospace" font-size="9" fill="rgba(42,212,255,0.5)" text-anchor="middle" letter-spacing="0.8">DEEPBOOK ORACLE</text>

  <!-- Footer -->
  <text x="300" y="360" font-family="monospace" font-size="9" fill="rgba(70,110,155,0.3)" text-anchor="middle">Insuirance &#x2022; Sui Testnet &#x2022; Built on DeepBook Predict</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
