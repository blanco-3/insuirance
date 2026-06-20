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

  const svg = `<svg width="600" height="400" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
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
    <linearGradient id="divider" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="rgba(255,255,255,0)" />
      <stop offset="20%"  stop-color="rgba(255,255,255,0.08)" />
      <stop offset="80%"  stop-color="rgba(255,255,255,0.08)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="600" height="400" rx="20" fill="url(#bg)"/>
  <rect width="600" height="400" rx="20" fill="none" stroke="rgba(42,212,255,0.12)" stroke-width="1"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="600" height="3" rx="1.5" fill="url(#topBar)"/>

  <!-- Shield icon -->
  <g transform="translate(40, 32)" filter="url(#glow)">
    <path d="M18 0 L36 6 L36 20 C36 29 29 34 18 38 C7 34 0 29 0 20 L0 6 Z"
      fill="rgba(10,40,70,0.9)" stroke="#2ad4ff" stroke-width="1.4"/>
    <path d="M18 7 L28 11 L28 18 C28 23 24 26.5 18 28.5 C12 26.5 8 23 8 18 L8 11 Z"
      fill="rgba(42,212,255,0.10)"/>
    <circle cx="18" cy="19" r="4.5" fill="#2ad4ff"/>
  </g>

  <!-- "INSUIRANCE" -->
  <text x="88" y="47" font-family="monospace, Courier New" font-size="11"
    fill="rgba(42,212,255,0.55)" letter-spacing="3" font-weight="bold">${"INSUIRANCE"}</text>

  <!-- Title -->
  <text x="40" y="98" font-family="-apple-system, BlinkMacSystemFont, sans-serif"
    font-size="26" font-weight="700" fill="white" letter-spacing="-0.5">${asset} CRASH COVER</text>

  <!-- Subtitle -->
  <text x="40" y="120" font-family="monospace, Courier New" font-size="11"
    fill="rgba(100,160,220,0.45)">PARAMETRIC BINARY OPTION · DEEPBOOK PREDICT</text>

  <!-- Divider -->
  <rect x="0" y="136" width="600" height="1" fill="url(#divider)"/>

  <!-- Stat: Strike -->
  <text x="40" y="165" font-family="monospace, Courier New" font-size="10"
    fill="rgba(120,170,220,0.45)" letter-spacing="1">STRIKE PRICE</text>
  <text x="40" y="192" font-family="monospace, Courier New" font-size="24"
    font-weight="bold" fill="white">${strikeStr}</text>

  <!-- Stat: Expiry -->
  <text x="240" y="165" font-family="monospace, Courier New" font-size="10"
    fill="rgba(120,170,220,0.45)" letter-spacing="1">EXPIRY</text>
  <text x="240" y="192" font-family="monospace, Courier New" font-size="24"
    font-weight="bold" fill="white">${expiryStr}</text>

  <!-- Stat: Cover -->
  <text x="460" y="165" font-family="monospace, Courier New" font-size="10"
    fill="rgba(120,170,220,0.45)" letter-spacing="1">COVER</text>
  <text x="460" y="192" font-family="monospace, Courier New" font-size="24"
    font-weight="bold" fill="white">${qtyStr}</text>

  <!-- Divider -->
  <rect x="0" y="212" width="600" height="1" fill="url(#divider)"/>

  <!-- Description -->
  <text x="40" y="248" font-family="-apple-system, BlinkMacSystemFont, sans-serif"
    font-size="13" fill="rgba(160,200,240,0.55)">
    Pays out if ${asset} settles at or below ${strikeStr} at expiry.
  </text>
  <text x="40" y="268" font-family="-apple-system, BlinkMacSystemFont, sans-serif"
    font-size="13" fill="rgba(160,200,240,0.4)">
    Settlement is automatic and fully onchain.
  </text>

  <!-- Status badge -->
  <rect x="40" y="290" width="${st.label.length * 9 + 28}" height="28" rx="14"
    fill="${st.bg}" stroke="${st.color}" stroke-opacity="0.4" stroke-width="1"/>
  <text x="${40 + (st.label.length * 9 + 28) / 2}" y="309"
    font-family="monospace, Courier New" font-size="11" font-weight="bold"
    fill="${st.color}" text-anchor="middle" letter-spacing="1">${st.label}</text>

  <!-- Oracle badge -->
  <rect x="40" y="330" width="160" height="22" rx="11"
    fill="rgba(42,212,255,0.06)" stroke="rgba(42,212,255,0.15)" stroke-width="1"/>
  <text x="120" y="345" font-family="monospace, Courier New" font-size="9"
    fill="rgba(42,212,255,0.45)" text-anchor="middle" letter-spacing="0.5">DEEPBOOK ORACLE</text>

  <!-- Footer -->
  <text x="300" y="385" font-family="monospace, Courier New" font-size="9"
    fill="rgba(80,120,160,0.3)" text-anchor="middle">
    insuirance · Sui Testnet · DeepBook Predict
  </text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
