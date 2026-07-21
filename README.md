# De-Butler

> **집사들은 패를 깔지 않는다. 약속한 한도 안에서 거래했다는 영수증만 깐다.**

Midnight 위에서 두 AI 에이전트가 서로의 가격 한도를 공개하지 않고 거래 조건을 협상하는 DApp 프로토타입입니다.

이 프로젝트의 핵심은 AI 채팅이 아닙니다. 각 에이전트가 사전에 정한 비공개 정책을 바꾸지 않았고, 최종 가격이 양쪽 조건 안에 들어간다는 사실을 Midnight의 ZK 증명으로 검증하는 것입니다.

## 현재 상태

- [x] Midnight Counter 예제 scaffold
- [x] Compact devtools 설치 (`compact 0.5.1`)
- [x] Counter 예제 컴파일러 고정 (`compact compile 0.30.0`)
- [x] Counter 계약 build 및 테스트 3개 통과
- [ ] De-Butler 계약 회로
- [ ] 두 에이전트 릴레이 데모
- [ ] 선택적 LLM 어댑터

구현 계획은 [`docs/superpowers/plans/2026-07-22-debutler-mvp.md`](docs/superpowers/plans/2026-07-22-debutler-mvp.md)에 있습니다.

## 왜 Midnight인가

일반적인 암호화 채팅만으로도 두 에이전트는 서로의 한도를 숨길 수 있습니다. 하지만 거래 상대방과 체인은 다음 사실을 확인할 수 없습니다.

> 이 에이전트가 사전에 약속한 정책 한도를 지키고 있는가?

De-Butler는 한도 자체를 공개하지 않고 다음만 증명합니다.

```text
구매자 최대가 B, 판매자 최소가 S, 합의가 p

p <= B
S <= p
```

## 프로토콜

### 1. `createDeal`

두 에이전트는 각자 한도를 랜덤성과 함께 commitment로 고정합니다.

```text
C_B = Commit(dealId, buyerKey, B, rB)
C_S = Commit(dealId, sellerKey, S, rS)
```

체인에는 `C_B`, `C_S`만 기록됩니다. 실제 `B`, `S`, `rB`, `rS`는 각 에이전트의 witness에 남습니다.

### 2. `authorizeHiddenPrice`

구매자 에이전트는 협상 가격 `p`를 witness로 사용해 다음을 증명합니다.

```text
Commit(dealId, buyerKey, B, rB) == C_B
p <= B
```

성공하면 체인에는 가격 자체가 아니라 다음 가격 commitment만 저장됩니다.

```text
C_P = Commit(dealId, p, rP)
```

### 3. `settle`

판매자 에이전트는 `p`, `rP`, `S`, `rS`를 자기 witness로 넣어 다음을 증명합니다.

```text
Commit(dealId, p, rP) == C_P
Commit(dealId, sellerKey, S, rS) == C_S
S <= p
```

모든 검증이 끝난 뒤에만 `p`를 `disclose`하고 거래 상태를 `SETTLED`로 변경합니다.

## 에이전트 연결 구조

```text
Buyer Agent ─────┐
                 ├── WebSocket Relay ──┐
Seller Agent ────┘                     │
                                       ├── Midnight Contract
Buyer Agent ───────────────────────────┘
Seller Agent ──────────────────────────┘
```

각 에이전트는 로컬에서 다음을 보관합니다.

- 자기 역할과 정책
- 최대가 또는 최소가
- commitment randomness
- 호출자 인증 secret
- Midnight witness provider
- 자기 지갑과 private state

Relay는 메시지를 전달할 뿐 계약을 대신 호출하지 않습니다. MVP에서는 Relay가 협상 가격과 메시지를 볼 수 있지만, 양쪽의 실제 한도는 보지 못합니다. 암호화된 에이전트 간 통신은 확장 항목입니다.

## AI의 역할

AI는 후보 제안가와 협상 문장을 생성합니다. 실제 한도 검사는 로컬 `PolicyGuard`와 Midnight 회로가 담당합니다.

```text
LLM이 후보 가격 생성
        ↓
로컬 PolicyGuard가 한도 검사
        ↓
통과한 메시지만 Relay로 전송
        ↓
정산 시 ZK 증명 생성
```

기본 데모는 API 키가 없어도 실행되는 규칙 기반 에이전트입니다. 필요할 때만 하나의 GPT API 또는 Claude API를 두 역할에 공용으로 연결할 수 있습니다. Claude Code는 개발 도구이며 런타임 에이전트가 아닙니다.

## 증명하는 것과 증명하지 않는 것

### 증명하는 것

- 커밋된 구매자 한도와 판매자 한도를 나중에 바꾸지 않았음
- 최종 가격이 양쪽 한도 안에 있음
- 구매자와 판매자가 해당 deal의 역할을 보유함
- 합의 전에는 가격을 공개하지 않음

### 증명하지 않는 것

- 한도가 실제 사용자의 진짜 예산인지
- 구매자가 실제로 지불할 자산을 보유했는지
- 판매자가 실제 상품을 보유했는지
- AI가 합리적인 정책을 선택했는지
- Relay가 협상 메시지를 보거나 지연시키지 않았는지

현업 버전에서는 사용자 서명 기반 권한 위임, shielded escrow, 상품/재고 attestation, 암호화 릴레이를 추가해야 합니다.

## MVP 범위

### 포함

- Compact 계약과 로컬 시뮬레이터
- `createDeal → authorizeHiddenPrice → settle` 흐름
- 성공·실패·잘못된 가격 opening 테스트
- 두 개의 규칙 기반 에이전트
- WebSocket 또는 in-memory relay
- 합의 가격만 공개하는 데모

### 제외

- 실제 토큰 결제와 원자적 자산 교환
- 외부 MPC 또는 proof aggregation
- LLM API 필수화
- 자동 온체인 시간 만료가 확인되기 전의 강제 expiry 주장
- 에이전트의 솔벤시·재고·정책 진실성 증명

## 실행 환경

```text
Node.js 24
npm 11
Compact devtools 0.5.1
Compact compiler 0.30.0
Docker Desktop
```

현재 Counter scaffold가 사용하는 runtime 0.15.0과의 호환성을 위해 첫 구현은 Compact compiler 0.30.0을 사용합니다.

### 계약만 검증

```bash
cd /Users/taemin/Developer/Midnight/midnight-counter
export PATH="/Users/taemin/.local/bin:$PATH"
npm install
cd contract
npm run compact
npm run build
npm run typecheck
npm run lint
npm test -- --run
```

### proof server

```bash
docker run -p 6300:6300 \
  midnightntwrk/proof-server:latest \
  midnight-proof-server -v
```

### 전체 데모 목표

```bash
npm run demo
```

기대 결과:

```text
BUYER  max=110  ── offer 100 ──┐
SELLER min=95   ── accept 100 ─┘

Buyer proof:  PASS
Seller proof: PASS
Public result: price=100, limits=hidden
```

## 8일 진행 계획

| 기간 | 목표 |
|---|---|
| 1일차 | 환경 고정, Counter 회로 이해, README/계획 확정 |
| 2일차 | commitment·witness·`disclose` 회로와 단위 테스트 |
| 3일차 | buyer/seller caller binding과 실패 케이스 |
| 4일차 | 두 에이전트와 relay 연결 |
| 5일차 | 성공·결렬 데모와 proof latency 측정 |
| 6일차 | 선택적 LLM adapter 또는 대사 연출 |
| 7일차 | 발표 자료·아키텍처·위협 모델 정리 |
| 8일차 | 리허설, 녹화 백업, 전체 회귀 테스트 |

## 핵심 발표 문장

> **AI는 협상하고, Midnight는 AI가 약속한 한도를 넘지 않았음을 증명한다.**

## 참고 자료

- [Midnight Developer Documentation](https://docs.midnight.network/)
- [Compact contract examples](https://docs.midnight.network/examples/contracts)
- [Private Reserve Auction](https://docs.midnight.network/examples/contracts/private-reserve-auction)
- [ZK Loan DApp](https://docs.midnight.network/examples/dapps/zkloan)
- [Private data and commitments](https://docs.midnight.network/concepts/how-midnight-works/keeping-data-private)
- [Transaction building blocks](https://docs.midnight.network/concepts/how-midnight-works/building-blocks)
