# Midnight에서 정보를 공개하지 않고 거래 조건을 증명하는 법

> witness와 commitment를 활용한 AI 에이전트 협상 DApp

> **집사들은 패를 깔지 않는다. 약속한 한도 안에서 거래했다는 영수증만 깐다.**

> [!NOTE]
> 이 문서는 기존 v1 데모의 보존본입니다. 모든 실행 명령은 이 `v1/` 디렉터리를 기준으로 합니다. 새 DApp 설계와 구현은 저장소 루트에서 진행합니다.

이 프로젝트는 위 발표 주제를 설명하기 위한 사례 DApp입니다. DApp 자체가 발표의 주제가 아니라, Midnight의 `witness`·`commitment`·ZK 검증을 보여주는 실험 사례입니다. 두 규칙 기반 에이전트가 서로의 가격 한도를 공개하지 않고 거래 조건을 협상합니다.

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

Compact 협상 회로와 로컬 시뮬레이터, 규칙 기반 에이전트 데모, Python relay·Observer 목업을 구현했습니다. 계약 배포를 `createDeal` 단계로 사용하고, 판매자가 `joinDeal`로 합류한 뒤 `authorizeHiddenPrice → settle`을 실행하는 흐름은 Compact 컨트랙트뿐 아니라 실제 Midnight.js 로컬 통합 테스트에서도 검증했습니다.

- [x] Counter scaffold를 비공개 협상 작업 공간으로 전환
- [x] Compact devtools 설치 (`compact 0.5.1`)
- [x] 프로젝트 호환 컴파일러 확인 (`compact compile 0.30.0`)
- [x] 협상 Compact 계약 5개 회로 컴파일
- [x] 계약 build·typecheck·lint 통과
- [x] 단계형 협상 계약·커밋먼트·witness 격리 테스트 12개 통과
- [x] 별도 규칙 기반 에이전트와 in-memory relay 테스트 2개 통과
- [x] Docker Proof Server 이미지 다운로드 및 `6300` 포트 기동 확인
- [x] Python 2터미널 relay 데모와 KRW 천 단위 출력
- [x] Observer 공개 ledger 뷰: commitment prefix·합성 block·settled/cancelled 상태
- [x] `createDeal → joinDeal → authorizeHiddenPrice → settle` 흐름을 Compact 컨트랙트에 반영
- [x] Midnight.js wallet·indexer·proof provider와 실제 contract call 연결
- [x] 로컬 체인에서 `WAITING_SELLER → OPEN → AUTHORIZED → SETTLED` 검증
- [x] 실제 `joinDeal → authorizeHiddenPrice → settle` 증명·트랜잭션 생성
- [x] 구매자·판매자별 지갑·private state·proof server를 분리한 2프로세스 데모
- [ ] 선택적 LLM 어댑터

구현 계획은 [`docs/superpowers/plans/2026-07-22-negotiation-mvp.md`](docs/superpowers/plans/2026-07-22-negotiation-mvp.md)와 [`docs/superpowers/plans/2026-07-24-midnight-integration.md`](docs/superpowers/plans/2026-07-24-midnight-integration.md)에 있습니다.

`counter-cli/`라는 디렉터리 이름은 원본 scaffold에서 유지했지만, 내부 API와 화면은 Negotiation 계약용으로 전환했습니다. 기존 단일 런타임 CLI는 호환성 검증용으로 남겨 두었고, 발표용 경로는 Buyer와 Seller의 private state를 별도 프로세스로 분리합니다.

## 왜 Midnight인가

일반적인 암호화 채팅만으로도 두 에이전트는 서로의 한도를 숨길 수 있습니다. 하지만 거래 상대방과 체인은 다음 사실을 확인할 수 없습니다.

> 이 에이전트가 사전에 약속한 정책 한도를 지키고 있는가?

협상 컨트랙트는 한도 자체를 공개하지 않고 다음만 증명합니다.

```text
구매자 최대가 B, 판매자 최소가 S, 합의가 p

p <= B
S <= p
```

## 프로토콜

### 1. `createDeal`

구매자는 최대 한도를 랜덤성과 함께 commitment로 고정하고 계약을 배포합니다. 이 배포 단계가 데모의 `createDeal`에 해당하며, 계약은 `WAITING_SELLER` 상태로 시작합니다.

```text
C_B = Commit(dealId, buyerKey, B, rB)
```

체인에는 `dealId`, 구매자 역할 키, `C_B`만 기록되고 실제 `B`, `rB`는 구매자의 witness에 남습니다.

### 2. `joinDeal`

판매자는 자기 비밀 키와 최소 가격·랜덤성을 witness로 사용해 역할 키와 commitment를 계산한 뒤 딜에 합류합니다.

```text
C_S = Commit(dealId, sellerKey, S, rS)
```

성공하면 `sellerKey`, `C_S`가 공개 ledger에 기록되고 상태가 `OPEN`으로 바뀝니다. 실제 `S`, `rS`는 판매자의 witness에 남습니다.

### 3. `authorizeHiddenPrice`

구매자 에이전트만 호출할 수 있는 `authorizeHiddenPrice`에서 협상 가격 `p`를 witness로 사용해 다음을 증명합니다.

```text
Commit(dealId, buyerKey, B, rB) == C_B
p <= B
```

성공하면 체인에는 가격 자체가 아니라 다음 가격 commitment만 저장됩니다.

```text
C_P = Commit(dealId, p, rP)
```

### 4. `settle`

판매자 에이전트만 호출할 수 있는 `settle`에서 `p`, `rP`, `S`, `rS`를 자기 witness로 넣어 다음을 증명합니다.

```text
Commit(dealId, p, rP) == C_P
Commit(dealId, sellerKey, S, rS) == C_S
S <= p
```

모든 검증이 끝난 뒤에만 `p`를 `disclose`하고 거래 상태를 `SETTLED`로 변경합니다.

### 5. 취소

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
- `createDeal → joinDeal → authorizeHiddenPrice → settle` 흐름
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
cd /Users/taemin/Developer/Midnight/midnight-counter/v1
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

`npm run demo`는 여전히 빠른 규칙 기반 에이전트 데모이므로 Proof Server를 호출하지 않습니다. 실제 proof provider와 로컬 체인 호출은 다음 통합 테스트로 검증합니다.

### 실제 Midnight.js 통합 테스트

Docker Desktop이 실행 중인 상태에서 다음 명령을 실행합니다.

```bash
cd /Users/taemin/Developer/Midnight/midnight-counter/v1
export PATH="/Users/taemin/.local/bin:$PATH"
compact update 0.30.0
cd contract && npm run compact && npm run build
cd ../counter-cli && npm run test-api
```

이 테스트는 standalone Midnight node·indexer·proof server와 사전 자금이 있는 로컬 지갑을 시작하고 다음 상태를 실제 트랜잭션으로 확인합니다.

```text
deploy/createDeal  → WAITING_SELLER, finalPrice=0
joinDeal           → OPEN,           finalPrice=0
authorizeHiddenPrice
                   → AUTHORIZED,     finalPrice=0
settle             → SETTLED,        finalPrice=100
```

`npm run test-api`는 기존 단일 런타임 호환성 테스트입니다. 실제 발표용 격리는 아래의 `test:isolated`가 검증합니다.

### 발표용 2프로세스 격리 데모

프로젝트 루트에서 다음 명령 하나로 실행합니다.

```bash
npm run demo:isolated
```

별도의 브라우저 지갑 두 개는 필요하지 않습니다. Buyer와 Seller 프로세스가 각자 로컬 seed 파일과 주소를 만들고, 별도 Funder 프로세스가 두 공개 주소만 받아 standalone genesis 자금을 전송합니다. seed 값은 부모 오케스트레이터·Relay·상대 역할로 전송되지 않으며 `.demo-wallets/` 아래 파일도 출력하지 않습니다.

발표 전 전체 격리 조건을 같은 실제 체인 흐름으로 리허설하려면 다음을 실행합니다.

```bash
npm run demo:preflight
```

두 명령은 로컬 node/indexer와 proof server 두 개를 올리고, 두 지갑의 동기화·NIGHT·DUST와 역할별 store/prover 분리를 확인한 뒤에만 배포 시작 신호를 보냅니다. 데모가 끝나면 컨테이너를 종료합니다. 첫 실행은 이미지와 ZK 파라미터 준비로 수 분 걸릴 수 있습니다.

격리 기준은 다음과 같습니다.

| 자원/값 | Buyer | Seller | 공유 가능 |
|---|---:|---:|---:|
| 지갑 seed·주소 | 자기 것만 | 자기 것만 | 주소만 공개 |
| private-state store | buyer 전용 | seller 전용 | 아니요 |
| role secret, 한도, `r_B`/`r_S` | buyer 값만 | seller 값만 | 아니요 |
| proof server | buyer 전용 | seller 전용 | 아니요 |
| 계약 주소·공개 ledger | 조회 | 조회 | 예 |
| node·indexer | 사용 | 사용 | 예 |
| 제안가와 `(p, r_P)` | 생성/전달 | 수신/검증 | Relay가 관찰 |

Relay 메시지는 `CONTRACT_READY`, `PROPOSAL`, `PRICE_OPENING` 세 종류의 정확한 필드 목록만 허용합니다. `B`, `S`, `r_B`, `r_S`, role secret, wallet seed, private-state 객체 또는 알 수 없는 추가 필드가 들어오면 전달 전에 거부합니다.

Observer 역시 별도 프로세스입니다. 입력은 `contractAddress`, `indexer`, `indexerWS`뿐이며 wallet, private state, proof server가 없습니다. 공개 indexer에서 `WAITING_SELLER(0) → OPEN(1) → AUTHORIZED(2) → SETTLED(3)`를 직접 확인하고, 마지막 상태에서만 `finalPrice=100`을 봅니다.

이 데모가 주장하는 것은 “감사된 Buyer/Seller 구현이 별도 OS 프로세스에서 상대의 비밀을 IPC로 받지 않고, 각자 witness와 proof server로 증명했다”입니다. 한 노트북의 같은 사용자 계정에서 실행되므로 악성 역할 코드에 대한 파일시스템·프로세스 샌드박스, 두 물리 장비 또는 적대적 호스트 사이의 네트워크 격리까지 증명하는 것은 아닙니다. 실제 배포에서는 각 당사자가 자기 장비 또는 격리 컨테이너에서 역할 런타임을 실행해야 합니다. 또한 MVP Relay는 협상 제안가와 최종 가격 opening `(p, r_P)`을 볼 수 있습니다.

### Python 터미널 이해용 데모

Python 데모는 실제 Midnight 증명이 아니라, 구매자·판매자·중간 Relay·Observer가 어떻게 연결되는지 보여주는 학습용 프로토타입입니다. 네 터미널을 열고 실행합니다.

```bash
cd /Users/taemin/Developer/Midnight/midnight-counter/v1
python3 python_demo.py relay
```

```bash
cd /Users/taemin/Developer/Midnight/midnight-counter/v1
python3 python_demo.py observer
```

```bash
cd /Users/taemin/Developer/Midnight/midnight-counter
python3 python_demo.py
```

```bash
cd /Users/taemin/Developer/Midnight/midnight-counter
python3 python_demo.py
```

Observer를 구매자·판매자보다 먼저 실행하면 공개 이벤트를 모두 볼 수 있습니다. 구매자·판매자 클라이언트는 상품 코드를 입력한 뒤 역할을 선택합니다.

각 클라이언트는 먼저 상품 코드를 입력한 뒤 구매자·판매자 역할을 선택합니다. 구매자는 최대 예산만, 판매자는 최소 판매가만 입력합니다. 첫 제안가는 구매자 에이전트의 고정 규칙으로 자동 결정되고, 출력 금액은 `110,000 KRW`처럼 표시됩니다.

Python 화면에서 표시하는 흐름은 다음과 같습니다.

```text
온체인 시뮬레이션: createDeal(C_B)
온체인 시뮬레이션: joinDeal(C_S)
오프체인: 가격 협상
온체인 시뮬레이션: authorizeHiddenPrice
오프체인 시뮬레이션: (p, r_P) 전달
온체인 시뮬레이션: settle + disclose(p)
```

Python 화면의 온체인 메시지는 아직 실제 Midnight.js 호출 결과가 아닙니다. 다만 단계 순서와 상태 전이는 Compact 계약의 `createDeal(배포) → joinDeal → authorizeHiddenPrice → settle` 구조와 일치합니다.

증명 순서는 실제 프로토콜과 동일한 모양으로 연출합니다.

```text
협상 완료
  → 구매자 authorizeHiddenPrice 증명
  → 판매자 settle 증명
  → 최종 가격 공개
```

현재 Python 화면의 `Midnight 시뮬레이션: ... PASS`는 실제 Proof Server 호출이 아니라 자리표시자입니다. 실제 Proof Server 호출은 별도의 `counter-cli` 통합 테스트에서 실행됩니다.

### 전체 데모 목표

```bash
npm run demo
```

현재 `npm run demo`는 두 규칙 기반 에이전트의 협상과 성공·결렬 시나리오를 빠르게 실행합니다. 실제 Midnight.js proof provider·계약 호출과 2프로세스 발표 흐름은 각각 `cd counter-cli && npm run test-api`, `npm run demo:isolated`로 실행합니다.

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
| ✅ 완료 | 환경 고정, 발표 제목·구성 확정, 단계형 계약 회로·시뮬레이터·규칙 기반 데모 구현 |
| ✅ 완료 | Midnight.js proof provider 및 실제 `joinDeal → authorizeHiddenPrice → settle` 호출 연결 |
| ▶ 다음 | proof latency 측정, 실패·취소 화면, 공개/비공개 데이터 표 정리 |
| 선택 | LLM adapter 또는 협상 대사 연출 추가 |
| 마무리 | 발표 자료, 위협 모델, 리허설, 녹화 백업, 전체 회귀 테스트 |

## 핵심 발표 문장

> **Midnight는 비밀을 숨기는 데서 끝나지 않고, 비밀을 공개하지 않은 채 조건을 증명하게 한다.**

AI 에이전트 협상은 이 문장을 보여주는 사례 DApp입니다.

## 이후 발전 방향

### 1단계: 터미널 데모 다듬기

- 입력 중인 비밀 금액을 화면에 남기지 않기
- 구매자·판매자 터미널의 색상과 상태 구분
- 증명 생성 중 spinner와 실제 latency 표시
- 성공·반대 제안·결렬 시나리오를 한 명령으로 재생

### 2단계: 실제 Midnight 연결 — 완료

- [x] 실제 Proof Server 두 개로 역할별 증명 생성
- [x] `authorizeHiddenPrice → settle` contract call 실행
- [x] 공개 ledger에는 commitment·상태·최종 가격만 표시

### 3단계: 채팅형 DApp 화면

- 브라우저에서 구매자·판매자 대화창을 좌우 패널로 분리
- 가운데에 공개 협상 상태와 최종 settlement 영수증 표시
- 각 에이전트의 한도는 해당 패널에서도 마스킹
- Relay·Proof Server·Contract 상태를 별도 아키텍처 패널로 표시

발표 준비에서는 1단계와 2단계를 먼저 완성하고, 시간이 남으면 3단계의 채팅형 화면을 추가합니다. 채팅 UI가 추가되어도 발표의 주제는 여전히 DApp이 아니라 Midnight의 비공개 조건 증명입니다.

## 참고 자료

- [Midnight Developer Documentation](https://docs.midnight.network/)
- [Compact contract examples](https://docs.midnight.network/examples/contracts)
- [Private Reserve Auction](https://docs.midnight.network/examples/contracts/private-reserve-auction)
- [ZK Loan DApp](https://docs.midnight.network/examples/dapps/zkloan)
- [Private data and commitments](https://docs.midnight.network/concepts/how-midnight-works/keeping-data-private)
- [Transaction building blocks](https://docs.midnight.network/concepts/how-midnight-works/building-blocks)
