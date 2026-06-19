/// Insuirance — Parametric Hedge Protocol
/// Wraps DeepBook Predict binary (DOWN) options as onchain insurance UX.
///
/// Flow:
///   1. buy_cover<DUSDC>(...) → Policy (NFT stored in user wallet)
///   2. After oracle settles → claim<DUSDC>(policy, ...) → payout if strike hit
module insuirance::policy;

use deepbook_predict::predict::{Self, Predict};
use deepbook_predict::predict_manager::PredictManager;
use deepbook_predict::oracle::OracleSVI;
use deepbook_predict::market_key;
use sui::clock::Clock;
use sui::event;
use sui::transfer;

// ── Status constants ────────────────────────────────────────────────────────
const STATUS_ACTIVE: u8 = 0;
const STATUS_CLAIMED: u8 = 1;
const STATUS_EXPIRED_NOPAY: u8 = 2;

// ── Error codes ─────────────────────────────────────────────────────────────
const EPremiumTooHigh: u64 = 0;
const ENotSettled: u64 = 2;
const EAlreadyClaimed: u64 = 3;
const EWrongOracle: u64 = 4;

// ── Objects ─────────────────────────────────────────────────────────────────

/// Onchain insurance certificate stored in buyer's wallet.
/// Represents a DOWN binary option position on DeepBook Predict.
public struct Policy has key, store {
    id: UID,
    owner: address,
    oracle_id: ID,
    expiry: u64,        // ms timestamp (matches OracleSVI expiry)
    strike: u64,        // price level in oracle units (1e9 per $1,000), e.g. 95_000_000_000_000 = $95k
    quantity: u64,      // option contracts (DUSDC decimals 6)
    premium_paid: u64,  // DUSDC paid at mint (decimals 6)
    asset: vector<u8>,  // e.g. b"BTC" for display
    manager_id: ID,     // associated PredictManager
    status: u8,
}

// ── Events ───────────────────────────────────────────────────────────────────

public struct CoverBought has copy, drop {
    policy_id: ID,
    owner: address,
    oracle_id: ID,
    strike: u64,
    expiry: u64,
    quantity: u64,
    premium_paid: u64,
}

public struct CoverClaimed has copy, drop {
    policy_id: ID,
    owner: address,
    settlement_price: u64,
    payout: bool,
}

// ── Core functions ────────────────────────────────────────────────────────────

/// Purchase a parametric cover (DOWN binary option).
///
/// `strike`      — price at or below which payout triggers (oracle units, tick-aligned)
/// `expiry`      — oracle expiry timestamp in ms
/// `quantity`    — contracts to buy (DUSDC decimals 6)
/// `max_premium` — slippage guard: aborts if mint_cost > max_premium
/// `asset`       — human label stored on Policy, e.g. b"BTC"
///
/// Caller must have DUSDC pre-deposited in `manager` (via predict::deposit).
/// Returns a Policy NFT transferred to ctx.sender().
public fun buy_cover<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    strike: u64,
    expiry: u64,
    quantity: u64,
    max_premium: u64,
    asset: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): Policy {
    let key = market_key::down(oracle.id(), expiry, strike);
    let (mint_cost, _) = predict.get_trade_amounts(oracle, key, quantity, clock);
    assert!(mint_cost <= max_premium, EPremiumTooHigh);

    predict.mint<Quote>(manager, oracle, key, quantity, clock, ctx);

    let policy = Policy {
        id: object::new(ctx),
        owner: ctx.sender(),
        oracle_id: oracle.id(),
        expiry,
        strike,
        quantity,
        premium_paid: mint_cost,
        asset,
        manager_id: object::id(manager),
        status: STATUS_ACTIVE,
    };

    event::emit(CoverBought {
        policy_id: object::id(&policy),
        owner: ctx.sender(),
        oracle_id: oracle.id(),
        strike,
        expiry,
        quantity,
        premium_paid: mint_cost,
    });

    policy
}

/// Claim payout after oracle settles.
///
/// If settlement_price <= strike → redeem binary option → withdraw payout coin →
///   transfer directly to policy.owner. No frontend interaction needed after this call.
/// If settlement_price > strike  → no payout, Policy marked expired.
/// Either way, Policy becomes non-claimable (EAlreadyClaimed on retry).
public fun claim<Quote>(
    policy: &mut Policy,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(policy.status == STATUS_ACTIVE, EAlreadyClaimed);
    assert!(oracle.id() == policy.oracle_id, EWrongOracle);
    assert!(oracle.is_settled(), ENotSettled);

    // settlement_price() returns Option<u64>; safe to unwrap since is_settled() == true
    let settle = oracle.settlement_price().destroy_some();
    let payout = settle <= policy.strike;

    if (payout) {
        let key = market_key::down(policy.oracle_id, policy.expiry, policy.strike);
        // redeem_permissionless settles the binary option into manager's internal balance.
        // For a binary DOWN settled ITM, payout = quantity (1:1, verified in predict.move:762-765).
        predict.redeem_permissionless<Quote>(manager, oracle, key, policy.quantity, clock, ctx);
        // Withdraw the exact payout amount from manager and transfer directly to policy owner.
        // This makes claim self-contained — payout lands in owner's wallet without frontend PTB.
        let payout_coin = manager.withdraw<Quote>(policy.quantity, ctx);
        transfer::public_transfer(payout_coin, policy.owner);
        policy.status = STATUS_CLAIMED;
    } else {
        policy.status = STATUS_EXPIRED_NOPAY;
    };

    event::emit(CoverClaimed {
        policy_id: object::id(policy),
        owner: policy.owner,
        settlement_price: settle,
        payout,
    });
}

// ── View helpers ─────────────────────────────────────────────────────────────

public fun owner(policy: &Policy): address { policy.owner }
public fun oracle_id(policy: &Policy): ID { policy.oracle_id }
public fun expiry(policy: &Policy): u64 { policy.expiry }
public fun strike(policy: &Policy): u64 { policy.strike }
public fun quantity(policy: &Policy): u64 { policy.quantity }
public fun premium_paid(policy: &Policy): u64 { policy.premium_paid }
public fun asset(policy: &Policy): vector<u8> { policy.asset }
public fun status(policy: &Policy): u8 { policy.status }
public fun is_active(policy: &Policy): bool { policy.status == STATUS_ACTIVE }
public fun is_claimed(policy: &Policy): bool { policy.status == STATUS_CLAIMED }

/// Compute strike price from current spot and desired drop percentage.
/// Rounds DOWN to nearest tick. Call off-chain to build PTB args.
///
/// drop_bps: basis points, e.g. 500 = 5%
/// tick_size: e.g. 1_000_000_000 ($1,000 in oracle units)
public fun compute_strike(spot: u64, drop_bps: u64, tick_size: u64): u64 {
    let raw = spot * (10_000 - drop_bps) / 10_000;
    (raw / tick_size) * tick_size
}

// ── Test-only helpers ─────────────────────────────────────────────────────────

#[test_only]
/// Construct a Policy directly for unit testing (bypasses buy_cover / Predict).
public fun new_for_testing(
    oracle_id: ID,
    expiry: u64,
    strike: u64,
    quantity: u64,
    asset: vector<u8>,
    manager_id: ID,
    ctx: &mut TxContext,
): Policy {
    Policy {
        id: object::new(ctx),
        owner: ctx.sender(),
        oracle_id,
        expiry,
        strike,
        quantity,
        premium_paid: 0,
        asset,
        manager_id,
        status: STATUS_ACTIVE,
    }
}

#[test_only]
/// Set status directly for testing state transitions.
public fun set_status_for_testing(policy: &mut Policy, status: u8) {
    policy.status = status;
}

#[test_only]
public fun destroy_for_testing(policy: Policy) {
    let Policy { id, .. } = policy;
    object::delete(id);
}

#[test_only]
/// Asserts that a policy can still be claimed. Aborts with EAlreadyClaimed if not.
/// Used in tests to verify the double-claim protection.
public fun assert_claimable_for_testing(policy: &Policy) {
    assert!(policy.status == STATUS_ACTIVE, EAlreadyClaimed);
}

