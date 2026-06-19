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

  // Move contract aborts — try to decode common codes
  if (/MoveAbort/i.test(msg)) {
    if (/EInsufficientLiquidity|0x1::/i.test(msg))
      return "Cover amount exceeds available vault liquidity. Try a smaller amount.";
    if (/ENotExpired|not.*expired/i.test(msg))
      return "The oracle hasn't settled yet — wait until after the expiry time.";
    if (/EAlreadyClaimed/i.test(msg))
      return "This policy has already been claimed.";
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
