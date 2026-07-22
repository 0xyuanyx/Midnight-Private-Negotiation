# Midnight에서 비밀을 공개하지 않고 조건을 증명하는 법

> witness와 commitment를 활용한 AI 에이전트 협상 DApp

> **집사들은 패를 깔지 않는다. 약속한 한도 안에서 거래했다는 영수증만 깐다.**

De-Butler는 위 발표 주제를 설명하기 위한 사례 DApp입니다. DApp 자체가 발표의 주제가 아니라, Midnight의 `witness`·`commitment`·ZK 검증을 보여주는 실험 사례입니다. 두 규칙 기반 에이전트가 서로의 가격 한도를 공개하지 않고 거래 조건을 협상합니다.

이 프로젝트의 핵심은 AI 채팅이 아닙니다. 각 에이전트가 사전에 정한 비공개 정책을 바꾸지 않았고, 최종 가격이 양쪽 조건 안에 들어간다는 사실을 Midnight의 ZK 증명으로 검증하는 것입니다.

## 발표 포지셔닝

### 메인 질문

> **서로의 비밀을 보지 않고도 거래 조건을 검증할 수 있는가?**

### 발표에서 설명할 것

1. 공개 블록체인에서 민감한 조건을 그대로 공개할 때 생기는 문제
2. Midnight의 `witness`, `commitment`, ZK proof, `disclose` 모델
3. 이 모델을 두 에이전트 협상 사례에 적용하는 방법
4. 가격 한도는 숨기고 합의 가격만 공개하는 데모

AI 에이전트는 기술의 주인공이 아니라 기술을 직관적으로 보여주는 사례와 화면 연출입니다. 기본 데모는 LLM 없이도 재현됩니다.

## 현재 상태

- [x] Counter scaffold를 De-Butler 작업 공간으로 전환
- [x] Compact devtools 설치 (`compact 0.5.1`)
- [x] 프로젝트 호환 컴파일러 확인 (`compact compile 0.30.0`)
- [x] De-Butler Compact 계약 4개 회로 컴파일
- [x] 계약 build·typecheck·lint 통과
- [x] 계약 시뮬레이터 테스트 5개 통과
- [x] 두 규칙 기반 에이전트와 in-memory relay 테스트 2개 통과
- [x] Docker Proof Server 이미지 다운로드 및 `6300` 포트 기동 확인
- [ ] Midnight.js proof provider와 실제 contract call 연결
- [ ] 협상 성공 뒤 실제 `authorizeHiddenPrice → settle` 증명 생성
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

체인에는 `C_B`, `C_S`와 역할·호출자 바인딩 정보만 기록됩니다. 실제 `B`, `S`, `rB`, `rS`는 각 에이전트의 witness에 남습니다. 커밋만으로는 호출자를 인증할 수 없으므로 회로가 역할별 caller secret과 공개 키의 일치도 확인합니다.

### 2. `authorizeHiddenPrice`

구매자 에이전트만 호출할 수 있는 `authorizeHiddenPrice`에서 협상 가격 `p`를 witness로 사용해 다음을 증명합니다.

```text
Commit(dealId, buyerKey, B, rB) == C_B
p <= B
```

성공하면 체인에는 가격 자체가 아니라 다음 가격 commitment만 저장됩니다.

```text
C_P = Commit(dealId, p, rP)
```

### 3. `settle`

판매자 에이전트만 호출할 수 있는 `settle`에서 `p`, `rP`, `S`, `rS`를 자기 witness로 넣어 다음을 증명합니다.

```text
Commit(dealId, p, rP) == C_P
Commit(dealId, sellerKey, S, rS) == C_S
S <= p
```

모든 검증이 끝난 뒤에만 `p`를 `disclose`하고 거래 상태를 `SETTLED`로 변경합니다.

### 4. 취소

구매자나 판매자가 잘못된 증명을 제출하거나 협상을 중단하면 역할별 `cancelAsBuyer`·`cancelAsSeller`로 딜을 `CANCELLED` 상태로 끝낼 수 있습니다. MVP에서는 신뢰할 수 있는 온체인 시간 primitive를 전제하지 않으므로 자동 시간 만료는 구현 범위 밖입니다.

## 에이전트 연결 구조

```text
┌────────────────────┐       ┌────────────────────┐
│ Buyer Agent        │◄─────►│ Seller Agent       │
│ maxPrice, witness  │ relay │ minPrice, witness  │
└─────────┬──────────┘       └─────────┬──────────┘
          │ authorizeHiddenPrice       │ settle
          └──────────────┬─────────────┘
                         ▼
                 Midnight Contract
                 (public commitments,
                  status, final price)
                         ▲
                   Proof Server :6300
```

각 에이전트는 로컬에서 다음을 보관합니다.

- 자기 역할과 정책
- 최대가 또는 최소가
- commitment randomness
- 호출자 인증 secret
- Midnight witness provider
- 자기 지갑과 private state

현재 데모의 Relay는 in-memory 메시지 전달기이며 계약을 대신 호출하지 않습니다. MVP에서는 Relay가 협상 가격과 메시지를 볼 수 있지만, 양쪽의 실제 한도·랜덤성·비밀 키는 보지 못합니다. 외부 Relay를 사용할 때의 지연·검열·메타데이터 노출과 암호화된 에이전트 간 통신은 확장 항목입니다.

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
- 합의 전 가격을 체인에 공개하지 않음

### 증명하지 않는 것

- 한도가 실제 사용자의 진짜 예산인지
- 구매자가 실제로 지불할 자산을 보유했는지
- 판매자가 실제 상품을 보유했는지
- AI가 합리적인 정책을 선택했는지
- Relay가 협상 메시지를 보거나 지연시키지 않았는지

협상 상대방과 MVP Relay는 협상 과정에서 제안 가격을 볼 수 있습니다. 이 설계가 숨기는 대상은 체인과 제3자에게 공개되는 한도·가격 원문이며, 상대방이 이미 받은 제안까지 숨긴다고 주장하지 않습니다.

현업 버전에서는 사용자 서명 기반 권한 위임, shielded escrow, 상품/재고 attestation, 암호화 릴레이를 추가해야 합니다.

## MVP 범위

### 포함

- Compact 계약과 로컬 시뮬레이터
- `createDeal → authorizeHiddenPrice → settle` 흐름
- 성공·실패·잘못된 가격 opening 테스트
- 두 개의 규칙 기반 에이전트
- in-memory relay 기반 협상 데모
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

현재 계약 패키지가 사용하는 Compact runtime `0.15.0`과의 호환성을 위해 프로젝트 컴파일러는 `0.30.0`으로 고정합니다. `compact update`를 인자 없이 실행하면 최신 `0.31.1`이 기본값이 될 수 있으므로, 이 프로젝트에서 컴파일하기 전에는 반드시 `compact update 0.30.0`을 실행합니다.

### 계약만 검증

```bash
cd /Users/taemin/Developer/Midnight/midnight-counter
export PATH="/Users/taemin/.local/bin:$PATH"
compact update 0.30.0
compact --version
compact compile --version
npm install
cd contract && npm run compact && npm run build && npm run typecheck && npm run lint && npm test -- --run
cd ..
npm run test:agents
npm run demo
```

### proof server

```bash
docker run --rm \
  --name midnight-proof-server \
  -p 6300:6300 \
  midnightntwrk/proof-server:latest \
  midnight-proof-server -v
```

첫 실행에는 ZK 공개 파라미터를 다운로드하므로 시간이 걸릴 수 있습니다. 다음 명령에서 `Up`과 `0.0.0.0:6300->6300/tcp`가 보이면 준비가 끝난 것입니다.

```bash
docker ps --filter name=midnight-proof-server
```

Proof Server가 실행 중이어도 현재 `npm run demo`가 자동으로 Proof Server를 호출하는 것은 아닙니다. Proof provider 연결은 다음 구현 단계입니다.

### 전체 데모 목표

```bash
npm run demo
```

현재 `npm run demo`는 두 규칙 기반 에이전트의 협상과 성공·결렬 시나리오를 실행합니다. 다음 단계에서 성공한 협상 결과를 실제 Midnight.js proof provider와 계약 호출에 연결합니다.

현재 확인된 출력:

```json
{"dealId":"deal-success","buyer":{"status":"ACCEPTED"},"seller":{"status":"ACCEPTED"},"agreedPrice":"100"}
{"dealId":"deal-rejected","buyer":{"status":"CANCELLED"},"seller":{"status":"CANCELLED"},"agreedPrice":null}
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
| 상태 | 목표 |
|---|---|
| ✅ 완료 | 환경 고정, 발표 제목·구성 확정, 계약 회로·시뮬레이터·규칙 기반 에이전트 구현 |
| ▶ 다음 | Midnight.js proof provider 연결 및 실제 `authorizeHiddenPrice → settle` 호출 |
| 예정 | proof latency 측정, 실패·취소 화면, 공개/비공개 데이터 표 정리 |
| 선택 | LLM adapter 또는 협상 대사 연출 추가 |
| 마무리 | 발표 자료, 위협 모델, 리허설, 녹화 백업, 전체 회귀 테스트 |

## 핵심 발표 문장

> **Midnight는 비밀을 숨기는 데서 끝나지 않고, 비밀을 공개하지 않은 채 조건을 증명하게 한다.**

AI 에이전트 협상은 이 문장을 보여주는 사례 DApp입니다.

## 참고 자료

- [Midnight Developer Documentation](https://docs.midnight.network/)
- [Compact contract examples](https://docs.midnight.network/examples/contracts)
- [Private Reserve Auction](https://docs.midnight.network/examples/contracts/private-reserve-auction)
- [ZK Loan DApp](https://docs.midnight.network/examples/dapps/zkloan)
- [Private data and commitments](https://docs.midnight.network/concepts/how-midnight-works/keeping-data-private)
- [Transaction building blocks](https://docs.midnight.network/concepts/how-midnight-works/building-blocks)
