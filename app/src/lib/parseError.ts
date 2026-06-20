/**
 * Maps raw Sui/Move/network errors to user-friendly messages.
 * Returns empty string if the user intentionally cancelled — callers should
 * skip showing an error in that case.
 */
export function parseError(e: unknown): string {
  const msg: string = (e as any)?.message ?? String(e) ?? "Transaction failed";

  // User cancelled intentionally — silent
  if (/user rejected|rejected by user|cancelled|denied/i.test(msg)) return "";

  // Gas / SUI balance
  if (/GasBalanceTooLow|gas balance|insufficient.*gas|not enough.*sui/i.test(msg)) {
    return "Not enough SUI for gas fees. Get testnet SUI from the Sui Discord (#testnet-faucet).";
  }

  // Coin / dUSDC balance
  if (/InsufficientCoinBalance|insufficient.*balance|not enough.*coin/i.test(msg)) {
    return "Insufficient dUSDC balance. Deposit more dUSDC into your manager first.";
  }

  // Object not found
  if (/ObjectNotFound/i.test(msg)) {
    return "Object not found on chain. It may have already been used — try refreshing.";
  }

  // Move contract aborts — try numeric code first, then text patterns
  if (/MoveAbort/i.test(msg)) {
    // Detect module context from the error message
    const inPolicy = /::policy/i.test(msg);
    const inVault  = /::vault/i.test(msg);

    // Extract numeric abort code — last number before closing paren, e.g. "MoveAbort(..., 3)"
    const codeMatch = msg.match(/,\s*(\d+)\s*\)/) ?? msg.match(/abort\s+code[:\s]+(\d+)/i);
    const code = codeMatch ? parseInt(codeMatch[1], 10) : -1;

    // policy.move error codes
    if (inPolicy || (!inVault && code >= 2)) {
      if (code === 0)
        return "Cover cost exceeded slippage limit — price moved. Try again or increase max premium.";
      if (code === 2)
        return "Oracle hasn't settled yet — wait until after the expiry time.";
      if (code === 3)
        return "This policy has already been claimed.";
      if (code === 4)
        return "Wrong oracle for this policy — it may have expired or changed.";
    }

    // vault.move error codes
    if (inVault) {
      if (code === 0)
        return "Deposit amount must be greater than zero.";
      if (code === 1)
        return "Deposit too small — share allocation rounds to zero. Try a larger amount.";
      if (code === 2)
        return "Cover amount exceeds vault capacity (90% limit). Try a smaller position or wait for vault deposits.";
    }

    // Text-based fallbacks for common abort names
    if (/EInsufficientLiquidity/i.test(msg))
      return "Cover amount exceeds available vault liquidity. Try a smaller amount.";
    if (/ENotExpired|not.*expired/i.test(msg))
      return "The oracle hasn't settled yet — wait until after the expiry time.";
    if (/EAlreadyClaimed/i.test(msg))
      return "This policy has already been claimed.";
    if (/EPremiumTooHigh/i.test(msg))
      return "Cover cost exceeded slippage limit — price moved. Try again or increase max premium.";

    // DeepBook Predict internal errors — strike outside oracle grid
    if (/quote_spread_from_fair_price|assert_mintable_ask|mintable.*ask|outside.*grid|grid.*outside/i.test(msg))
      return "Strike price is outside this oracle's supported range. Try selecting a different expiry or a smaller drop percentage.";
    if (/assert_mintable/i.test(msg))
      return "This strike price is not supported by the oracle. Try a different expiry.";

    return "Contract rejected the transaction. Double-check your inputs and try again.";
  }

  // Network / RPC
  if (/fetch failed|network|ECONNREFUSED|timeout|socket/i.test(msg)) {
    return "Network error — check your connection and try again.";
  }

  // Oracle / price feed
  if (/oracle|price feed|stale/i.test(msg)) {
    return "Oracle price is unavailable or stale. Please try again shortly.";
  }

  // Truncate raw messages
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}
