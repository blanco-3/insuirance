# E2E Integration Tests

Tests the full Insuirance flow against Sui testnet — including real calls to
DeepBook Predict shared objects (`predict.supply`, `predict.withdraw`).

## vault-integration.ts

Proves end-to-end that `ShieldVault.deposit_entry` and `withdraw_entry` correctly
call DeepBook Predict's `supply<DUSDC>` and `withdraw<DUSDC>` on testnet.

```
deposit_entry  →  predict.supply<DUSDC>  →  Coin<PLP> stored in vault
                                          →  VaultShare NFT → user wallet

withdraw_entry →  predict.withdraw<DUSDC> →  dUSDC → user wallet
```

### Run

```bash
cd app
npm install

cd ../tests/e2e
export TEST_PRIVKEY="<your-base64-ed25519-privkey>"
npx ts-node --project tsconfig.json vault-integration.ts
```

### Expected output

```
[...] predict.supply confirmed ✅  1000000 PLP received from DeepBook
[...] predict.withdraw confirmed ✅ 1.0 dUSDC returned from DeepBook
╔══════════════════════════════════════════════╗
║  ALL TESTS PASSED ✅                         ║
║  predict.supply   ← DeepBook CONFIRMED ✅   ║
║  predict.withdraw ← DeepBook CONFIRMED ✅   ║
╚══════════════════════════════════════════════╝
```
