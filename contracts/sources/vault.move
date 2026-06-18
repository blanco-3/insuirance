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
/// VaultShare.shares / vault.total_shares = user's fraction of PLP pool.
/// Share price appreciates as the PLP pool earns premiums.
module insuirance::vault;

use deepbook_predict::plp::PLP;
use deepbook_predict::predict::{Self, Predict};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

// ── Errors ───────────────────────────────────────────────────────────────────

const EZeroAmount: u64 = 0;
const EZeroShares: u64 = 1;

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

// ── View helpers ─────────────────────────────────────────────────────────────

public fun total_shares(vault: &ShieldVault): u64 { vault.total_shares }
public fun total_plp(vault: &ShieldVault): u64 { vault.plp_balance.value() }
public fun shares(share: &VaultShare): u64 { share.shares }
public fun share_owner(share: &VaultShare): address { share.owner }
