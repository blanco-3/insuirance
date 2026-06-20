# Insuirance

**Parametric crash cover, settled onchain. Built on DeepBook Predict.**

BTC drops below your chosen strike → dUSDC pays out automatically.  
No claims process. No counterparty. No humans. Just math and DeepBook's oracle.

---

## What it does

| Step | Action |
|---|---|
| 1 | Enter your BTC holdings in the Exposure Calculator |
| 2 | Pick a strategy (5 / 10 / 20% drop, or Full Ladder) |
| 3 | Buy Cover → 1–3 Policy NFTs minted in one Sui transaction |
| 4 | At oracle expiry, if price ≤ strike → click Claim → dUSDC arrives |

Alternatively: deposit dUSDC into ShieldVault → become the LP (earn premium yield).

---

## DeepBook Predict primitives used

- `predict::get_trade_amounts` — pre-flight premium check (slippage guard)
- `predict::mint<DUSDC>` — open a DOWN binary option position
- `predict::redeem_permissionless<DUSDC>` — settle payout post-expiry
- PLP vault as counterparty — no market maker required
- `OracleSVI` — on-chain BTC/USD price settlement

Multi-trigger PTB: Full Ladder mints 3 Policy NFTs (5/10/20%) atomically.

---

## On-chain addresses (Sui Testnet)

```
Insuirance package:   0xb2832b01656468017fdcd3fab7793fc3c70edfe2cc6c0dbae526cc1a51564e8a
DeepBook Predict pkg: 0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138
Predict object:       0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a
```

---

## Run locally

```bash
# 1. Install dependencies
cd app && npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — NEXT_PUBLIC_INSUIRANCE_PACKAGE is already set

# 3. Start dev server
npm run dev
# → http://localhost:3000
```

You'll need testnet SUI for gas (Sui Discord `#testnet-faucet`) and testnet dUSDC.

---

## Contracts

```bash
cd contracts
sui move build
# Published at: contracts/Published.toml (v3, testnet)
```

---

## Architecture

### Buy Cover Flow

```
User Wallet
  │
  ├─[1] HedgeCalculator
  │       BTC holdings → loss at 5/10/20% drops → "Protect Now" prefill
  │
  ├─[2] CoverForm  (predict-api.ts: computeStrike + computeFairPremium)
  │       spot × (1 − bps) → tick-aligned strike
  │       OracleSVI params → SVI total-variance → Black's formula → fair premium
  │       max_premium = fair × 1.15  (slippage buffer)
  │
  ├─[3] insuirance::policy::buy_cover<DUSDC>  (policy.move)
  │       predict.get_trade_amounts(oracle, key, qty, clock)  — slippage pre-check
  │       assert mint_cost ≤ max_premium                      — EPremiumTooHigh guard
  │       predict.mint<DUSDC>(manager, oracle, key, qty, clock, ctx)
  │       → Policy NFT { owner, oracle_id, strike, expiry, quantity, status=ACTIVE }
  │       → emits CoverBought event
  │
  │  [Full Ladder: 3 × buy_cover in one PTB → 3 Policy NFTs atomically]
  │
  └─[4] insuirance::policy::claim<DUSDC>  (post oracle settlement)
          assert status == ACTIVE          — EAlreadyClaimed
          assert oracle.id() == oracle_id  — EWrongOracle
          assert oracle.is_settled()       — ENotSettled
          settlement_price().destroy_some() ≤ strike?
            ITM → predict.redeem_permissionless<DUSDC>(manager, oracle, key, qty)
                  + predict_manager::withdraw(manager, qty)  [same PTB, PolicyList.tsx]
                  → dUSDC to user wallet
            OTM → status = EXPIRED_NOPAY
```

### Earn Yield Flow (ShieldVault)

ShieldVault is **independent of Buy Cover**. It adds liquidity to DeepBook's PLP pool,
which is also the counterparty for all Cover purchases. More ShieldVault deposits →
deeper PLP liquidity → lower slippage for cover buyers. But Buy Cover works without it.

```
User Wallet (LP)
  │
  ├─[Deposit] insuirance::vault::deposit_entry<DUSDC>  (vault.move)
  │             predict.supply<DUSDC>(coin, clock, ctx)  → Coin<PLP>
  │             plp_balance.join(plp_coin)               — stored in ShieldVault
  │
  │             Share issuance:
  │               first depositor : shares = plp_received          (1:1 base)
  │               subsequent      : shares = plp_received × total_shares / total_plp
  │               (u128 intermediates — overflow-safe)
  │
  │             → VaultShare NFT { shares } → user wallet
  │
  ├─[Yield]   PLP share price appreciates as options buyers pay premiums into the pool
  │             plp_share_price > 1.0  → LP earns the spread
  │
  └─[Withdraw] insuirance::vault::withdraw_entry<DUSDC>
                VaultShare NFT presented (Sui object ownership = access control)
                plp_to_redeem = shares × total_plp / total_shares
                plp_balance.split(plp_to_redeem)
                predict.withdraw<DUSDC>(plp_coin, clock, ctx) → dUSDC → user wallet
                VaultShare NFT burned (object::delete)
```

> **LP risk**: ShieldVault depositors are the payout source. When BTC crashes and
> covered policies settle ITM, `predict.redeem_permissionless` draws from the PLP pool
> (`dispense_payout`), reducing LP principal. High utilization → potential withdrawal delay.

### DeepBook Predict Dependency Map

```
insuirance::policy                    insuirance::vault
  buy_cover  ──┬── predict.get_trade_amounts   deposit ──── predict.supply
               ├── predict.mint                withdraw ─── predict.withdraw
  claim      ──┼── predict.redeem_permissionless
               └── oracle.is_settled / settlement_price
                         │
                   DeepBook Predict (shared objects)
                   ├── Predict       0xc8736204…
                   ├── OracleSVI     (per market)
                   └── PLP Pool      (counterparty + yield source)
```

### Object Ownership Model

| Object | Type | Owner |
|---|---|---|
| `Policy` | `has key, store` | User wallet (transferred on mint) |
| `VaultShare` | `has key, store` | User wallet (transferred on deposit) |
| `ShieldVault` | `has key` (shared) | Shared — all users write |
| `PredictManager` | shared | Shared — holds dUSDC balance |
| `OracleSVI` | shared (read-only) | DeepBook |

---

## Sui Overflow 2026 / DeepBook Sponsor Track

Built during Sui Overflow 2026 (deadline 2026-06-21). Solo.  
Target: DeepBook sponsor track ($35k 1st prize).
