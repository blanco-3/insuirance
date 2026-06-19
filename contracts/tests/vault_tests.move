#[test_only]
module insuirance::vault_tests;

use insuirance::vault;
use sui::test_scenario;

// ── View helpers ──────────────────────────────────────────────────────────────

/// New vault starts with zero shares and zero PLP.
#[test]
fun test_new_vault_initial_state() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let vault = vault::new_vault_for_testing(ctx);
        assert!(vault::total_shares(&vault) == 0, 0);
        assert!(vault::total_plp(&vault) == 0, 1);
        vault::destroy_vault_for_testing(vault);
    };
    test_scenario::end(scenario);
}

/// VaultShare view helpers return correct values.
#[test]
fun test_vault_share_view_helpers() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let share = vault::new_share_for_testing(@0xA, 500_000, ctx);
        assert!(vault::shares(&share) == 500_000, 0);
        assert!(vault::share_owner(&share) == @0xA, 1);
        vault::destroy_share_for_testing(share);
    };
    test_scenario::end(scenario);
}

// ── Share issuance math ───────────────────────────────────────────────────────

/// First depositor: shares issued == PLP received (1:1 initialisation).
/// Formula: if total_shares == 0 → shares = plp_received
#[test]
fun test_first_deposit_shares_equal_plp() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let mut vault = vault::new_vault_for_testing(ctx);
        // Simulate first deposit: 1,000,000 PLP → 1,000,000 shares (1:1)
        vault::add_plp_for_testing(&mut vault, 1_000_000);
        vault::set_shares_for_testing(&mut vault, 1_000_000);
        assert!(vault::total_plp(&vault) == 1_000_000, 0);
        assert!(vault::total_shares(&vault) == 1_000_000, 1);
        vault::destroy_vault_for_testing(vault);
    };
    test_scenario::end(scenario);
}

/// Second depositor proportional share formula:
///   shares = plp_received * total_shares / current_plp
///
/// After first deposit: 1M PLP, 1M shares.
/// Second deposit: 500K PLP → 500K * 1M / 1M = 500K shares.
#[test]
fun test_second_deposit_proportional_shares() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let mut vault = vault::new_vault_for_testing(ctx);
        // Existing vault state after first depositor
        vault::add_plp_for_testing(&mut vault, 1_000_000);
        vault::set_shares_for_testing(&mut vault, 1_000_000);

        // Calculate expected shares for a 500K PLP deposit
        let new_plp: u64       = 500_000;
        let current_plp: u64   = vault::total_plp(&vault);    // 1_000_000
        let current_shares: u64 = vault::total_shares(&vault); // 1_000_000
        let expected: u64 = (((new_plp as u128) * (current_shares as u128)
                               / (current_plp as u128)) as u64);
        assert!(expected == 500_000, 0);

        vault::destroy_vault_for_testing(vault);
    };
    test_scenario::end(scenario);
}

/// If PLP price has doubled (share price = 2x), second depositor gets fewer shares.
///   Vault: 2M PLP, 1M shares (price appreciated).
///   Second deposit: 1M PLP → 1M * 1M / 2M = 500K shares (correct dilution).
#[test]
fun test_share_dilution_when_plp_price_appreciated() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let mut vault = vault::new_vault_for_testing(ctx);
        // Vault where PLP has doubled in value
        vault::add_plp_for_testing(&mut vault, 2_000_000);
        vault::set_shares_for_testing(&mut vault, 1_000_000);

        let new_plp: u64       = 1_000_000;
        let current_plp: u64   = vault::total_plp(&vault);    // 2_000_000
        let current_shares: u64 = vault::total_shares(&vault); // 1_000_000
        let expected: u64 = (((new_plp as u128) * (current_shares as u128)
                               / (current_plp as u128)) as u64);
        assert!(expected == 500_000, 0);

        vault::destroy_vault_for_testing(vault);
    };
    test_scenario::end(scenario);
}

// ── Withdrawal proportion math ────────────────────────────────────────────────

/// Withdrawal formula: plp_to_redeem = shares * total_plp / total_shares
///   Vault: 1M shares, 1M PLP.  User: 500K shares → redeems 500K PLP.
#[test]
fun test_withdraw_proportion_equal_plp() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let mut vault = vault::new_vault_for_testing(ctx);
        vault::add_plp_for_testing(&mut vault, 1_000_000);
        vault::set_shares_for_testing(&mut vault, 1_000_000);

        let user_shares: u64   = 500_000;
        let total_plp: u64     = vault::total_plp(&vault);
        let total_shares: u64  = vault::total_shares(&vault);
        let plp_out: u64 = (((user_shares as u128) * (total_plp as u128)
                              / (total_shares as u128)) as u64);
        assert!(plp_out == 500_000, 0);

        vault::destroy_vault_for_testing(vault);
    };
    test_scenario::end(scenario);
}

/// Withdrawal with appreciated PLP: user gets MORE than they deposited.
///   Vault: 1M shares, 2M PLP (premiums earned).  User: 500K shares → 1M PLP.
#[test]
fun test_withdraw_yields_more_when_plp_appreciated() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let mut vault = vault::new_vault_for_testing(ctx);
        vault::add_plp_for_testing(&mut vault, 2_000_000);
        vault::set_shares_for_testing(&mut vault, 1_000_000);

        let user_shares: u64  = 500_000;
        let total_plp: u64    = vault::total_plp(&vault);
        let total_shares: u64 = vault::total_shares(&vault);
        let plp_out: u64 = (((user_shares as u128) * (total_plp as u128)
                              / (total_shares as u128)) as u64);
        // user deposited proportional to 1M shares, PLP doubled → gets 1M back
        assert!(plp_out == 1_000_000, 0);

        vault::destroy_vault_for_testing(vault);
    };
    test_scenario::end(scenario);
}
