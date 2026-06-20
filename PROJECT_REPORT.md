# Insuirance 프로젝트 보고서

> 나중에 복기할 수 있도록 작성된 개발 기록. 지속 업데이트.

---

## 프로젝트 주제

**Insuirance** — DeepBook Predict 위에 구축한 온체인 파라메트릭 헤지/보험 프로토콜.  
BTC가 설정한 strike 이하로 하락 시 dUSDC가 자동 지급된다.

Sui Overflow 2026 해커톤 / DeepBook 스폰서 트랙 ($35k 1등) 출품작.

---

## 활동 목적

- 기존 DeFi 보험은 청구 과정이 복잡하고 인간 심사가 필요하다.
- DeepBook Predict의 바이너리 옵션 프리미티브를 활용해 **코드가 전부인 무신뢰 헤지** 를 구현한다.
- BTC 현물 보유자가 1클릭으로 크래시 보호를 살 수 있는 UX를 만든다.

---

## 활동 목표

1. `policy.move` — buy_cover + claim 온체인 로직 (Move 2024.beta)
2. `vault.move` — ShieldVault (LP 풀, Earn Yield 사이드)
3. Next.js 14 프론트엔드 — CoverForm, PolicyList, ShieldVault, Dashboard
4. DeepBook Predict primitive 5개 모두 사용: get_trade_amounts / mint / redeem_permissionless / supply / withdraw
5. 해커톤 마감(2026-06-21) 전 testnet 배포 완료

---

## 사용 기술

| 레이어 | 기술 |
|---|---|
| 스마트 컨트랙트 | Sui Move 2024.beta edition |
| 의존성 | DeepBook Predict (deepbook_predict 패키지) |
| 프론트엔드 | Next.js 14, TypeScript, Tailwind CSS |
| Sui 연결 | @mysten/dapp-kit, @mysten/sui/transactions |
| 가격 산출 | SVI(Stochastic Volatility Inspired) + Black's formula (TypeScript) |
| 실시간 가격 | Binance WebSocket → oracle API 폴백 |
| 테스트 | sui move test (vault_tests.move 7개, policy_tests.move 7개) |

---

## 기술 선택 이유

**DeepBook Predict**: Sui 생태계에서 유일한 온체인 바이너리 옵션 프리미티브. PLP 공유 볼트가 카운터파티 역할을 하므로 별도 AMM/orderbook 없이 구현 가능.

**Move 2024.beta**: `has key, store` Policy NFT 패턴이 객체 소유권으로 접근 제어를 자동 처리 — ENotOwner 에러 코드 자체가 불필요.

**PTB (Programmable Transaction Blocks)**: Full Ladder(5/10/20% 3개 Policy)를 단일 원자 TX로 발행. 가스비 절감 + 부분 실패 없음.

**SVI + Black's 공식**: DeepBook OracleSVI 파라미터(a,b,ρ,m,σ)를 그대로 읽어 fair premium 계산. 온체인 검증과 동일한 가격 공식을 프론트에서도 사용.

---

## 문제 상황 및 목표

### 해결한 주요 문제들

| 문제 | 원인 | 해결 |
|---|---|---|
| claim() payout 2-hop 문제 | redeem 후 withdraw를 프론트 PTB에서 따로 호출해야 했음 | claim() 내부에 redeem→withdraw→transfer 원자화 |
| compute_strike u128 오버플로 | spot × (10000-bps) 가 u64 범위 초과 | u128 중간 변수 사용 |
| VaultShare 잔액 파싱 오류 | fields.plp_balance가 중첩 객체이거나 직접 값 | optional chaining으로 양쪽 케이스 처리 |
| parseError 숫자 코드 미매핑 | MoveAbort 에러가 "code: 3" 형태로 옴 | 정규식으로 숫자 추출 후 policy/vault 에러 코드 매핑 |
| ENotOwner 코드 1 충돌 | 이미 제거된 에러 코드가 코드 번호 공백 생성 | 코드 1을 reserved 주석으로 문서화 |
| GitHub 링크 오류 | page.tsx에 하드코딩된 `https://github.com` | `https://github.com/blanco-3/insuirance` 로 수정 |

---

## 구체적 해결과정

### 1단계: 컨트랙트 설계 (policy.move + vault.move)

```
Policy (NFT) {
  owner, oracle_id, strike, expiry, quantity, premium_paid, status
}

buy_cover<DUSDC>():
  get_trade_amounts() → slippage guard (max_premium)
  predict.mint() → DeepBook PLP 카운터파티
  Policy NFT → user wallet

claim<DUSDC>():
  assert is_settled()
  settlement_price ≤ strike?
    ITM: redeem_permissionless → withdraw → transfer to owner (원자)
    OTM: status = EXPIRED_NOPAY
```

### 2단계: ShieldVault (vault.move)

```
deposit: predict.supply() → PLP 수령 → VaultShare NFT 발행
  첫 입금: shares = plp_received (1:1)
  추후 입금: shares = plp_received × total_shares / total_plp (u128)

withdraw: VaultShare 소각 → 비례 PLP 반환 → predict.withdraw() → dUSDC
```

### 3단계: 프론트엔드 (Next.js 14)

- **CoverForm**: oracle 선택, 5/10/20% trigger, Full Ladder PTB, SVI fair premium 표시
- **PolicyList**: Policy NFT 목록, claim PTB 실행
- **ShieldVault**: deposit/withdraw UI, APY 추정, LP Risk Disclosure
- **Dashboard**: Binance WS 실시간 BTC가격, oracle 폴백, isLive 인디케이터
- **HedgeCalculator**: BTC 보유량 입력 → 손실 계산 → "Protect Now" 프리필

### 4단계: 해커톤 최적화

심사위원 평가 기준에 맞춰:
- README 아키텍처 다이어그램 추가 (Buy Cover 플로우, Earn Yield 플로우, 객체 소유권 테이블)
- **utilization cap**: DeepBook PLP 풀 utilization ≥ 90% 시 Buy Cover 버튼 비활성 (LP 보호 의도 명시)
- **프리미엄 툴팁**: "SVI fair value × 1.15 슬리피지 버퍼" 설명을 Max Premium 옆에 ⓘ로 표시

---

## 온체인 주소 (Sui Testnet)

```
Insuirance package: 0xb2832b01656468017fdcd3fab7793fc3c70edfe2cc6c0dbae526cc1a51564e8a
Manager ID:         0x814d09c610698bf2c7793fb43eab34ba7e204319d0c2a7c2b50f5ebd8642cba3
ShieldVault ID:     0xe5790d19867341dbe11e0dea0ea4be22b8d8c06d4cd3b5eda69afa78017e0f7a
DeepBook Predict:   0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138
Predict object:     0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a
```

---

## 결과 (성과)

### 기술적 성과
- Move 컨트랙트 배포 완료 (Sui testnet v3)
- 14개 단위 테스트 통과 (vault 7개, policy 7개)
- Full Ladder PTB: 3개 Policy NFT 단일 TX 발행 작동 확인
- SVI 가격 공식 TypeScript 구현 (Abramowitz-Stegun normCDF)
- TypeScript 컴파일 오류 0개

### 해커톤 심사 예상 점수 (Opus 에이전트 평가)
- 초기: 55/75 (73%)
- 버그 수정 후: 64/75 (85%)
- utilization cap + 툴팁 추가 후: **71+/75 예상**

| 심사위원 | 역할 | 초기 | 최종 예상 |
|---|---|---|---|
| Judge A | DeepBook 엔지니어 (30점) | 23 | 27 |
| Judge B | DeFi 프로토콜 설계자 (25점) | 15 | 21+ |
| Judge C | 해커톤 심사 리드 (20점) | 17 | 18+ |

---

## 배운점

### 기술

1. **Sui 객체 소유권이 접근 제어**: `has key, store` Policy를 user wallet에 transfer하면 해당 유저만 PTB에서 `&mut Policy`를 인수로 넣을 수 있다. ENotOwner를 직접 구현할 필요가 없다.

2. **PTB 원자성 활용**: Move 함수 내에서 redeem→withdraw→transfer를 순서대로 호출하면 하나라도 실패 시 전체 TX가 롤백된다. "claim atomicity"는 Move 레벨에서 보장됨.

3. **u128 중간 변수**: Move에서 u64 곱셈 전에 캐스팅하지 않으면 overflow abort. `(spot as u128) * ...` 패턴을 기억.

4. **SVI 파라미터 해석**: a=forward variance, b=volatility of volatility, ρ=skew, m=ATM shift, σ=smoothing. `w(k) = a + b*(ρ*(k-m) + sqrt((k-m)²+σ²))` 에서 total variance 추출 후 Black's formula.

5. **DeepBook VaultSummary.utilization**: API가 0~1 범위로 반환. 90% 이상이면 LP 고갈 위험 — 신규 커버 차단이 합리적.

### 프로세스

1. **소규모 해커톤에서 Earn Yield는 선택이 아닌 필수**: Buy Cover만으론 "왜 DeepBook인가"를 설명하기 어렵다. supply/withdraw까지 써야 5개 프리미티브 완성 + LP 양면 시장 스토리가 나온다.

2. **데모 준비가 점수의 10%**: settled oracle + ITM policy를 발표 전에 미리 구매해두면 라이브 Claim 시연이 가능하다. 코드보다 임팩트가 클 수 있다.

3. **LLM 에이전트로 코드 검수**: Opus 모델에 Judge/User 페르소나를 부여해 심사 시뮬레이션 → 가장 효과적인 점수 개선 포인트를 빠르게 식별.

---

## 커밋 이력 (주요)

| 해시 | 내용 |
|---|---|
| `63c649b` | docs: expand architecture section with full flow diagrams and ShieldVault design |
| `d928677` | feat: utilization cap UI + premium markup tooltip |
| (pending) | fix: github link, error code 1 comment, compute_strike u128 overflow guard |

> **PENDING (수동 실행 필요)**: `.git/index.lock` 삭제 후 page.tsx + policy.move 수정사항 push
> ```bash
> rm /Users/blanco/insuirance/.git/index.lock
> cd /Users/blanco/insuirance
> git add app/src/app/page.tsx contracts/sources/policy.move
> git commit -m "fix: github link, error code 1 comment, compute_strike u128 overflow guard"
> git push origin main
> ```

---

## 남은 TODO

- [ ] **settled oracle Policy 사전 구매** — 발표 전 ITM 포지션 준비 (비코드, 최고 ROI)
- [ ] **index.lock 수동 삭제 + commit push** — page.tsx & policy.move 변경사항
- [ ] DeepBook Predict testnet faucet URL 확보 시 ShieldVault.tsx/CoverForm.tsx에 직접 링크 추가

---

_Last updated: 2026-06-21_
