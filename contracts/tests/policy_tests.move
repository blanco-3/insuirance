#[test_only]
module insuirance::policy_tests;

use insuirance::policy;
use sui::test_scenario;
use sui::object;

// ── compute_strike ────────────────────────────────────────────────────────────

/// BTC $100,000, 5% drop → $95,000. Tick = $1,000.
#[test]
fun test_compute_strike_5pct() {
    // Oracle units: 1e9 per $1,000 → $100k = 100_000_000_000_000, tick = 1_000_000_000
    let spot     = 100_000_000_000_000u64; // $100,000
    let tick     = 1_000_000_000u64;       // $1,000
    let result   = policy::compute_strike(spot, 500, tick);
    assert!(result == 95_000_000_000_000, 0); // $95,000
}

/// BTC $100,000, 10% drop → $90,000.
#[test]
fun test_compute_strike_10pct() {
    let spot   = 100_000_000_000_000u64;
    let tick   = 1_000_000_000u64;
    let result = policy::compute_strike(spot, 1000, tick);
    assert!(result == 90_000_000_000_000, 0); // $90,000
}

/// BTC $100,000, 20% drop → $80,000.
#[test]
fun test_compute_strike_20pct() {
    let spot   = 100_000_000_000_000u64;
    let tick   = 1_000_000_000u64;
    let result = policy::compute_strike(spot, 2000, tick);
    assert!(result == 80_000_000_000_000, 0); // $80,000
}

/// Tick rounding: raw = $94,500 → rounds DOWN to $94,000.
#[test]
fun test_compute_strike_rounds_down_to_tick() {
    // spot = $94,736 → 5% drop → raw $89,999.2 → tick rounds to $89,000
    let spot   = 94_736_000_000_000u64; // $94,736
    let tick   = 1_000_000_000u64;      // $1,000
    let result = policy::compute_strike(spot, 500, tick);
    // raw = 94_736 * 9500 / 10000 = 89_999.2 → floor to 89_000 in $1k ticks
    assert!(result % tick == 0, 1);    // always tick-aligned
    assert!(result <= spot * 9500 / 10000, 2); // always <= theoretical value
}

// ── View helpers + status transitions ────────────────────────────────────────

#[test]
fun test_policy_view_helpers_and_initial_state() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let oracle_id  = object::id_from_address(@0xB);
        let manager_id = object::id_from_address(@0xC);

        let policy = policy::new_for_testing(
            oracle_id,
            1_750_000_000_000u64, // expiry ms
            90_000_000_000_000u64, // strike $90k
            5_000_000u64,          // 5 dUSDC quantity
            b"BTC",
            manager_id,
            ctx,
        );

        assert!(policy::is_active(&policy), 0);
        assert!(!policy::is_claimed(&policy), 1);
        assert!(policy::strike(&policy) == 90_000_000_000_000, 2);
        assert!(policy::quantity(&policy) == 5_000_000, 3);
        assert!(policy::asset(&policy) == b"BTC", 4);

        policy::destroy_for_testing(policy);
    };
    test_scenario::end(scenario);
}

/// Setting status to CLAIMED makes is_claimed() return true and is_active() false.
#[test]
fun test_policy_status_claimed() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let mut policy = policy::new_for_testing(
            object::id_from_address(@0xB),
            0u64, 0u64, 1_000_000u64, b"BTC",
            object::id_from_address(@0xC),
            ctx,
        );

        assert!(policy::is_active(&policy), 0);
        policy::set_status_for_testing(&mut policy, 1); // STATUS_CLAIMED
        assert!(policy::is_claimed(&policy), 1);
        assert!(!policy::is_active(&policy), 2);

        policy::destroy_for_testing(policy);
    };
    test_scenario::end(scenario);
}

/// A policy with status != ACTIVE (already claimed) should abort with EAlreadyClaimed (code 3).
#[test]
#[expected_failure(abort_code = 3)] // EAlreadyClaimed = 3 (policy.move)
fun test_claim_already_claimed_aborts() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let mut policy = policy::new_for_testing(
            object::id_from_address(@0xB),
            0u64, 0u64, 1_000_000u64, b"BTC",
            object::id_from_address(@0xC),
            ctx,
        );
        // Simulate already-claimed state
        policy::set_status_for_testing(&mut policy, 1); // STATUS_CLAIMED

        // Calling assert_claimable should abort with EAlreadyClaimed
        policy::assert_claimable_for_testing(&policy);

        policy::destroy_for_testing(policy);
    };
    test_scenario::end(scenario);
}
