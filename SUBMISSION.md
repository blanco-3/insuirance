# Sui Overflow 2026 — Submission Content

---

## PROJECT PAGE

### Name
Insuirance

### Tagline
Parametric crash cover for BTC holders. Settled onchain by DeepBook's oracle. No claims. No humans. Just math.

### Short Description (1–2 sentences)
Insuirance lets BTC holders buy downside cover that pays out automatically when BTC drops below a chosen threshold — priced by DeepBook's SVI model, settled by its on-chain oracle, with no claims process or counterparty risk.

### Full Description

---

**Philosophy**

Most DeFi insurance projects are theater. A governance vote decides your claim. A multisig holds the funds. A human judges whether the event qualifies. You are still trusting people — you've just replaced the insurance company with a DAO.

Insuirance starts from a different premise: if the settlement condition is measurable onchain, then payout should be automatic and unconditional. No governance. No adjudication. No trust. Just math running on a public ledger.

That premise is now possible on Sui because DeepBook Predict provides two things at once: a decentralized price oracle that settles binary options, and a permissionless liquidity pool that absorbs the seller side. Insuirance is the product layer on top of those primitives — designed so that the only code we write is the code that can't live in DeepBook itself.

---

**The problem**

Crypto holders — BTC and SUI holders especially — face a fundamental asymmetry. They hold spot exposure with unlimited downside, but the tools to hedge that downside are locked behind:

- **Centralized exchanges** — KYC, custodial risk, withdrawal gates during volatility
- **Onchain perps** — funding costs, liquidation risk, requires active management
- **DeFi "insurance" protocols** — human claims committees, governance votes, weeks-long resolution windows

None of these are trustless. None pay out automatically. And none are designed for a holder who just wants to know: *if SUI drops 20% this week, am I protected?*

SUI is the native asset of the chain Insuirance is built on. We eat our own cooking — SUI holders on Sui are the most natural first users.

---

**What Insuirance does**

Insuirance is parametric crash cover for BTC, SUI, and any other asset DeepBook Predict provides an oracle for. The user picks a drop trigger (5%, 10%, or 20%), pays a small SVI-priced premium, and receives a **Policy NFT** in their wallet. The strike price is computed from the current spot price and locked onchain at purchase time.

After expiry, if the asset's oracle settlement price is at or below the strike — the Policy can be claimed. `claim()` calls `redeem_permissionless` and `withdraw` atomically: dUSDC lands directly in the policy owner's wallet. No frontend interaction required after signing. The payout condition is binary and unconditional — the oracle settles it, not a human.

If the asset did not fall far enough, the Policy expires with no payout. The LP earns the premium. That's the entire product. There is no ambiguity.

---

**The other side: ShieldVault**

Every option buyer needs a seller. ShieldVault is the LP layer that funds the seller side.

LPs deposit dUSDC → vault calls `predict.supply` → dUSDC enters DeepBook's PLP pool → LP receives a **VaultShare NFT** representing their proportional claim. When they withdraw, `predict.withdraw` redeems PLP shares back to dUSDC, which has grown from accumulated premiums.

The vault enforces an **on-chain cover cap**: no single policy can commit more than 90% of vault PLP in one transaction (`ECoverExceedsCap`, vault abort code 2). This protects depositor principal from concentrated drain. The cap is enforced at the Move level inside `vault::buy_cover_entry` — it cannot be bypassed by the frontend.

---

**DeepBook Predict integration — all 5 primitives**

Insuirance uses every primitive DeepBook Predict exposes. Nothing is reimplemented:

| Primitive | Where used | Purpose |
|---|---|---|
| `get_trade_amounts` | `policy::buy_cover` | Pre-flight SVI premium check; aborts if cost > `max_premium` (slippage guard) |
| `mint<DUSDC>` | `policy::buy_cover` | Opens a DOWN binary option on DeepBook's PLP pool |
| `redeem_permissionless<DUSDC>` | `policy::claim` | Settles the ITM option post-oracle-expiry |
| `supply<DUSDC>` | `vault::deposit` | LP deposits → PLP shares → counterparty liquidity |
| `withdraw<DUSDC>` | `vault::withdraw` | PLP redeemed → dUSDC returned to LP with yield |

Insuirance owns no pricing model, no liquidity pool, and no settlement logic. All of that is DeepBook. We own the product UX, the Policy NFT lifecycle, and the vault share accounting.

---

**On-chain architecture**

Two Move modules (Sui Move 2024.beta):

**`insuirance::policy`**
- `buy_cover<Quote>()` — calls `get_trade_amounts` for slippage check, then `mint`, then wraps a Policy NFT and transfers it to the buyer. Policy is `has key, store` — Sui object ownership enforces access control, no custom auth needed.
- `claim<Quote>()` — checks `is_settled()`, then calls `redeem_permissionless` + `withdraw` atomically. Transfer directly to `policy.owner`. Double-claim protected by `status` field (`EAlreadyClaimed`).
- `compute_strike()` — u128 intermediate to prevent overflow at high BTC prices (safe to $3.4 × 10^13 in oracle units).

**`insuirance::vault`**
- `deposit_entry<Quote>()` → `predict.supply` → VaultShare NFT
- `withdraw_entry<Quote>()` → burn VaultShare → `predict.withdraw` → dUSDC
- `buy_cover_entry<Quote>()` → on-chain cap check → `policy::buy_cover` → Policy NFT

PTBs are used on the frontend for the "Full Ladder" flow: 3 `buy_cover_entry` calls (5%/10%/20%) in a single atomic transaction.

---

**Target users**

- **SUI holders on Sui** — the most natural first users. SUI is the native asset of the chain Insuirance lives on. Hedging SUI exposure without leaving the Sui ecosystem is the zero-friction entry point.
- **BTC and altcoin holders** — any holder of BTC, ETH, or other assets who wants downside protection that settles automatically, without touching a CEX or trusting a DAO
- **DeFi-native yield seekers** — deposit into ShieldVault, earn premium income as the seller side of the market. Defined risk, no liquidation, no funding cost.
- **Institutions entering Sui** — need a risk-management primitive before deploying large capital onchain. Parametric cover with automatic payout removes counterparty trust from the equation.

The demand case is straightforward: any SUI or BTC holder who lived through a 40%+ drawdown with no hedge in place wishes this existed. Insuirance is the first version of that product that is fully onchain, permissionless, and auto-settling — on Sui, using DeepBook.

---

**Revenue model**

Every cover purchase is priced at **115% of DeepBook's SVI fair value**. The 15% spread is taken at `mint` time — it flows directly into protocol revenue, proportional to volume. No token. No inflation. No grants dependency.

At scale: $1M notional cover volume/week at average 2% premium → ~$2,000/week gross premium → $300/week protocol revenue (15% spread). Scales linearly with volume and with BTC volatility (higher IV → higher premiums).

---

**What's next**

- **Cumulative OI tracking** via dynamic fields (v2 upgrade) — per-tx cap becomes per-epoch exposure limit
- **Multi-asset expansion** — SUI is the flagship market. As DeepBook Predict adds new oracle markets (BTC, ETH, SOL, and beyond), Insuirance cover plans activate automatically. Zero new Move code — just a new oracle ID passed to the same `buy_cover_entry`. The architecture is oracle-agnostic by design; the product grows with DeepBook's oracle coverage.
- **Mainnet deployment** — as soon as DeepBook Predict launches on mainnet
- **Full Ladder automation** — one-click PTB to buy 5%/10%/20% cover simultaneously

---

**Verified on Sui Testnet**

- Package v4: `0x8559a28a9e20a65b0b7deeb66c6e8022b67290b52e1166d0c2cfca44f2bdd481`
- ShieldVault: `0xe5790d19867341dbe11e0dea0ea4be22b8d8c06d4cd3b5eda69afa78017e0f7a`
- Deposit TX (predict.supply): `DbCHu8b6WT7FzHLTxvWzjNTHjRkNhJFHbqsknBHuCe5Q`
- Withdraw TX (predict.withdraw): `9FB65qhmMi4HerYBd2aTe21k2YpJHHyPbUBqHunEdAuB`

---

### Tech Stack
- Sui Move 2024.beta (policy.move, vault.move)
- DeepBook Predict (all 5 primitives)
- Next.js 14, TypeScript, Tailwind CSS
- @mysten/dapp-kit, @mysten/sui/transactions (PTB)
- SVI + Black's formula (TypeScript, Abramowitz-Stegun normCDF)
- Binance WebSocket (real-time BTC spot price)
- GCP Cloud Run (deployment)

### Links
- Live app: https://insuirance-971342541474.asia-northeast3.run.app
- GitHub: https://github.com/blanco-3/insuirance

### Track
DeepBook Sponsor Track

---

## DEMO VIDEO SCRIPT (5분, 영어 서툰 경우 기준)

> 💡 말은 짧게, 화면이 설명하게. 침묵도 괜찮음.
> 한 문장 말하고 → 행동 보여주고 → 다음 문장.

---

### 사전 준비
- 앱 열어두기: https://insuirance-971342541474.asia-northeast3.run.app
- 지갑 연결 + Manager Balance 5 DUSDC 이상
- 화면 녹화 준비 (QuickTime)

---

### PART 1 — 문제 제기 (0:00–0:40) 🎙️ 말 적음

**화면**: 랜딩 페이지 히어로

**말하기**:
> "This is Insuirance."
> *(2초 pause)*
> "BTC crashes. You lose money. No way to hedge onchain — until now."
> *(스크롤 내리며)*
> "We built parametric cover on DeepBook Predict. No claims. No humans. Just code."

---

### PART 2 — ShieldVault (LP 사이드) (0:40–1:30) 🎙️ 말 거의 없음

**화면**: Earn Yield 탭

**말하기**:
> "First — the LP side. Depositors fund the vault."

**액션** (말 없이 보여주기):
1. "Earn Yield" 탭 클릭
2. 금액 입력 → Deposit 클릭 → 지갑 승인
3. TX 완료 → VaultShare NFT 생성 확인

**말하기** (TX 완료 후):
> "predict dot supply is called. PLP shares minted. Vault is funded."

---

### PART 3 — Buy Cover (핵심) (1:30–3:30) 🎙️ 핵심만

**화면**: Buy Cover 탭

**말하기**:
> "Now — buying cover."

**액션 + 짧은 설명**:
1. Exposure Calculator 열기 → "0.05" BTC 입력
   > "I hold 0.05 BTC. Ten percent drop — that's 320 dollars gone."
2. "Protect Now" 클릭 → CoverForm 이동
3. 트리거 하나 선택 (예: 10%)
   > "I pick the ten percent trigger."
4. Expiry 선택 (침묵으로 클릭만)
5. Cover Amount "1" 입력
6. 프리미엄 표시 보여주기
   > "Premium is priced by DeepBook's SVI model. Real-time, onchain."
7. Buy Cover 클릭 → 지갑 승인
   > "Signing the transaction."
8. *(TX pending 동안 침묵 또는)*
   > "vault buy cover entry — checks the ninety percent cap — then calls predict dot mint."
9. TX 성공 → Policy NFT 확인
   > "Policy NFT is in my wallet."

---

### PART 4 — Policy & Claim 설명 (3:30–4:20)

**화면**: My Policies

**말하기**:
> "The Policy stores my strike price and expiry."
> *(카드 가리키며)*
> "After expiry — if BTC is below the strike — I click Claim."
> "dUSDC goes directly to my wallet. Automatic. No one approves it."

*(settled oracle 있으면 실제 Claim 보여주기. 없으면 Policy 카드만)*

---

### PART 5 — 온체인 증명 + 마무리 (4:20–5:00)

**화면**: README Testnet Verification 섹션

**말하기**:
> "Everything is verified on Sui testnet."
> *(TX 링크 가리키며)*
> "predict dot supply, predict dot withdraw — both confirmed onchain."

**화면**: 랜딩 히어로로 복귀

> "Insuirance. Built on DeepBook. Where the crash can't reach you."

---

### 촬영 팁
- 말 중간에 **2~3초 침묵** 자연스러움 — 편집 안 해도 됨
- TX 기다리는 시간엔 말 안 해도 됨 (pending 화면 그냥 보여주면 됨)
- 틀려도 계속 녹화 → 나중에 제일 나은 take로 편집
- 총 발화량: 약 **150단어** (느리게 말해도 3분 안에 다 말할 수 있는 양)

---

## 제출 페이지 입력 순서

1. 프로젝트명: **Insuirance**
2. Tagline: **Parametric crash cover for BTC holders. Settled onchain by DeepBook's oracle.**
3. GitHub: https://github.com/blanco-3/insuirance
4. Demo: (영상 업로드 후)
5. Track: DeepBook Sponsor Track
6. Description: 위 Full Description 복붙
7. Tech Stack: 위 내용
8. Live URL: https://insuirance-971342541474.asia-northeast3.run.app
