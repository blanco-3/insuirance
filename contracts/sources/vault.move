/// ShieldVault — Yield-bearing LP wrapper for DeepBook Predict
///
/// Users deposit dUSDC → vault supplies to DeepBook Predict PLP pool →
/// earns premium yield from options traders → users receive VaultShare NFT
/// representing their proportional claim.
///
/// Flow:
///   1. deposit_entry<DUSDC>(vault, predict, coin, clock, ctx)
///        → predict.supply(coin) → Coin<PLP> stored in vault
///        → VaultShare NFT transferred to depositor
///
///   2. withdraw_entry<DUSDC>(vault, predict, share, clock, ctx)
///        → VaultShare burned, proportional PLP redeemed
///        → predict.withdraw(plp_coin) → Coin<DUSDC> transferred to user
///
///   3. buy_cover_entry<DUSDC>(vault, predict, manager, oracle, ..., ctx)
///        → On-chain cover cap: single policy quantity ≤ COVER_CAP_BPS of vault PLP
///        → policy::buy_cover → Policy NFT transferred to buyer
///
/// VaultShare.shares / vault.total_shares = user's fraction of PLP pool.
/// Share price appreciates as the PLP pool earns premiums.
module insuirance::vault;

use deepbook_predict::plp::PLP;
use deepbook_predict::predict::{Self, Predict};
use deepbook_predict::predict_manager::PredictManager;
use deepbook_predict::oracle::OracleSVI;
use insuirance::policy;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::transfer;

// ── Errors ───────────────────────────────────────────────────────────────────

const EZeroAmount: u64 = 0;
const EZeroShares: u64 = 1;
/// Single cover purchase exceeds the on-chain vault capacity cap.
/// Protects LP depositors from concentrated drain by a single buyer.
/// Cap is COVER_CAP_BPS of vault's total PLP value (default 90%).
const ECoverExceedsCap: u64 = 2;

// ── Constants ─────────────────────────────────────────────────────────────────

/// Max single-policy cover as a fraction of vault PLP (90% = 9000 bps).
/// Prevents any single purchase from draining more than 90% of the pool.
/// v2 upgrade: replace with per-tx + cumulative open-interest tracking.
const COVER_CAP_BPS: u128 = 9_000;

// ── Objects ──────────────────────────────────────────────────────────────────

/// Shared vault holding all depositors' PLP.
public struct ShieldVault has key {
    id: UID,
    /// Accumulated PLP tokens from all depositors' predict.supply calls.
    plp_balance: Balance<PLP>,
    /// Total VaultShare units outstanding.
    total_shares: u64,
}

/// NFT held by each depositor representing their vault position.
/// `shares / vault.total_shares` = fraction of PLP pool.
/// `owner` is informational only — access control is enforced by Sui object ownership.
public struct VaultShare has key, store {
    id: UID,
    owner: address,
    shares: u64,
}

// ── Events ───────────────────────────────────────────────────────────────────

public struct Deposited has copy, drop {
    vault_id: ID,
    user: address,
    amount: u64,
    plp_received: u64,
    shares_minted: u64,
}

public struct Withdrawn has copy, drop {
    vault_id: ID,
    user: address,
    shares_burned: u64,
    plp_redeemed: u64,
    amount_out: u64,
}

// ── Setup ─────────────────────────────────────────────────────────────────────

/// One-shot: create and share the ShieldVault.
/// Call once after upgrading the package.
public entry fun create_vault(ctx: &mut TxContext) {
    transfer::share_object(ShieldVault {
        id: object::new(ctx),
        plp_balance: balance::zero<PLP>(),
        total_shares: 0,
    });
}

// ── Core functions ────────────────────────────────────────────────────────────

/// Deposit quote asset into the vault.
/// Vault becomes an LP in DeepBook Predict, earning premium yield.
/// Caller receives a VaultShare NFT.
///
/// Share issuance:
///   First depositor: shares = plp_received (1:1)
///   Subsequent:      shares = plp_received * total_shares / total_plp
public fun deposit<Quote>(
    vault: &mut ShieldVault,
    predict: &mut Predict,
    coin: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): VaultShare {
    let amount = coin.value();
    assert!(amount > 0, EZeroAmount);

    let plp_coin = predict.supply<Quote>(coin, clock, ctx);
    let plp_received = plp_coin.value();
    assert!(plp_received > 0, EZeroShares);

    let current_plp = vault.plp_balance.value();
    let shares: u64 = if (vault.total_shares == 0 || current_plp == 0) {
        plp_received
    } else {
        (((plp_received as u128) * (vault.total_shares as u128) / (current_plp as u128)) as u64)
    };
    assert!(shares > 0, EZeroShares);

    vault.plp_balance.join(plp_coin.into_balance());
    vault.total_shares = vault.total_shares + shares;

    event::emit(Deposited {
        vault_id: object::id(vault),
        user: ctx.sender(),
        amount,
        plp_received,
        shares_minted: shares,
    });

    VaultShare { id: object::new(ctx), owner: ctx.sender(), shares }
}

/// Entry wrapper: deposit and transfer VaultShare NFT to sender.
public entry fun deposit_entry<Quote>(
    vault: &mut ShieldVault,
    predict: &mut Predict,
    coin: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let share = deposit<Quote>(vault, predict, coin, clock, ctx);
    transfer::transfer(share, ctx.sender());
}

/// Withdraw from vault by burning a VaultShare NFT.
/// Redeems proportional PLP and returns underlying quote asset.
///
/// plp_to_redeem = share.shares * vault.total_plp / vault.total_shares
public fun withdraw<Quote>(
    vault: &mut ShieldVault,
    predict: &mut Predict,
    share: VaultShare,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert!(share.shares > 0, EZeroShares);

    // Sui object ownership enforces access — no sender check needed.
    let VaultShare { id, owner: _, shares } = share;
    object::delete(id);

    let total_plp = vault.plp_balance.value();
    let plp_to_redeem = (((shares as u128) * (total_plp as u128) / (vault.total_shares as u128)) as u64);
    assert!(plp_to_redeem > 0, EZeroAmount);

    vault.total_shares = vault.total_shares - shares;
    let plp_coin = vault.plp_balance.split(plp_to_redeem).into_coin(ctx);

    let out_coin = predict.withdraw<Quote>(plp_coin, clock, ctx);
    let amount_out = out_coin.value();

    event::emit(Withdrawn {
        vault_id: object::id(vault),
        user: ctx.sender(),
        shares_burned: shares,
        plp_redeemed: plp_to_redeem,
        amount_out,
    });

    out_coin
}

/// Entry wrapper: withdraw and transfer coins to sender.
public entry fun withdraw_entry<Quote>(
    vault: &mut ShieldVault,
    predict: &mut Predict,
    share: VaultShare,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let coin = withdraw<Quote>(vault, predict, share, clock, ctx);
    transfer::public_transfer(coin, ctx.sender());
}

/// Purchase a parametric cover policy with on-chain vault capacity guard.
///
/// On-chain cap (COVER_CAP_BPS = 90%):
///   quantity must not exceed 90% of vault's total PLP value.
///   This prevents a single buyer from committing more than 90% of LP
///   principal to one policy, protecting depositors from concentrated drain.
///
///   Note: this is a per-transaction size cap. Cumulative open-interest
///   tracking (decrement on claim) is the v2 upgrade path.
///
/// After the cap check, delegates to policy::buy_cover which calls
/// predict.mint, enforces the slippage guard, and mints the Policy NFT.
public entry fun buy_cover_entry<Quote>(
    vault: &ShieldVault,
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
) {
    // ── On-chain cover cap ───────────────────────────────────────────────────
    // Skip cap when vault is empty (bootstrap phase — ShieldVault not yet funded).
    // Once the vault has liquidity, cap applies.
    let vault_plp = vault.plp_balance.value();
    if (vault_plp > 0) {
        let max_qty = (vault_plp as u128) * COVER_CAP_BPS / 10_000u128;
        assert!((quantity as u128) <= max_qty, ECoverExceedsCap);
    };

    // ── Policy mint ──────────────────────────────────────────────────────────
    let policy_nft = policy::buy_cover<Quote>(
        predict, manager, oracle, strike, expiry, quantity, max_premium, asset, clock, ctx,
    );
    transfer::public_transfer(policy_nft, ctx.sender());
}

// ── View helpers ─────────────────────────────────────────────────────────────

public fun total_shares(vault: &ShieldVault): u64 { vault.total_shares }
public fun total_plp(vault: &ShieldVault): u64 { vault.plp_balance.value() }
public fun shares(share: &VaultShare): u64 { share.shares }
public fun share_owner(share: &VaultShare): address { share.owner }
public fun cover_cap_bps(): u128 { COVER_CAP_BPS }

// ── Test-only helpers ─────────────────────────────────────────────────────────

#[test_only]
/// Create an empty ShieldVault for unit testing (bypasses create_vault entry).
public fun new_vault_for_testing(ctx: &mut TxContext): ShieldVault {
    ShieldVault {
        id: object::new(ctx),
        plp_balance: balance::zero<PLP>(),
        total_shares: 0,
    }
}

#[test_only]
/// Inject synthetic PLP balance into the vault (simulates predict.supply returns).
public fun add_plp_for_testing(vault: &mut ShieldVault, amount: u64) {
    let b = balance::create_for_testing<PLP>(amount);
    vault.plp_balance.join(b);
}

#[test_only]
/// Directly set total_shares (simulates share minting without predict call).
public fun set_shares_for_testing(vault: &mut ShieldVault, total: u64) {
    vault.total_shares = total;
}

#[test_only]
/// Create a VaultShare for testing.
public fun new_share_for_testing(owner: address, share_count: u64, ctx: &mut TxContext): VaultShare {
    VaultShare { id: object::new(ctx), owner, shares: share_count }
}

#[test_only]
/// Destroy a vault and discard PLP balance (test cleanup only).
public fun destroy_vault_for_testing(vault: ShieldVault) {
    let ShieldVault { id, plp_balance, .. } = vault;
    object::delete(id);
    balance::destroy_for_testing(plp_balance);
}

#[test_only]
/// Destroy a VaultShare (test cleanup only).
public fun destroy_share_for_testing(share: VaultShare) {
    let VaultShare { id, .. } = share;
    object::delete(id);
}
