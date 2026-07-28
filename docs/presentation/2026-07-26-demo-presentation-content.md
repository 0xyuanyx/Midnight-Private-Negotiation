# Midnight 비공개 협상 DApp 발표 내용 초안

## 0. 발표의 한 문장

> 구매자와 판매자의 가격 한도는 각자 로컬에 남기고, AI는 공개된 협상 정보로 후보만 만들며, Midnight는 최종 합의 가격이 양쪽 조건을 만족했다는 사실만 증명합니다.

청중에게 반드시 남겨야 할 기억은 다음 하나다.

> **한도는 숨기고, 합의만 증명한다.**

## 1. 발표 전 사실 구분

발표에서는 구현 완료, 로컬 검증 완료, 외부 환경 때문에 보류된 항목을 구분한다.

| 구분 | 현재 상태 | 발표 표현 |
|---|---|---|
| 3패널 웹 DApp | 구현·테스트 완료 | 실제 역할 프로세스의 정제 이벤트를 표시한다 |
| Buyer·Seller·Observer 프로세스 분리 | 구현·테스트 완료 | 세 역할은 별도 PID와 별도 환경을 가진다 |
| 로컬 PolicyGuard | 구현·테스트 완료 | 한도는 역할 프로세스 안에서만 정책 판정에 사용된다 |
| 암호화 Room Relay | 구현·테스트 완료 | Relay는 협상 평문이 아니라 암호문 envelope만 전달한다 |
| Compact 계약 | 컴파일·로컬 네트워크 검증 완료 | 로컬 Midnight Node·Indexer·proof server에서 상태 전이를 확인했다 |
| OpenAI provider | 구현·endpoint 도달 완료 | Responses API 배선과 데이터 경계를 확인했다 |
| 실제 GPT 협상 품질 | 재검증 필요 | API 프로젝트의 `insufficient_quota`로 실제 후보 평가는 보류됐다 |
| 공개 테스트넷·메인넷 | 미실행 | 현재 온체인 주장은 로컬 Midnight 네트워크 범위다 |

실제 API 품질 검증이 보류됐다는 점은 숨길 필요가 없다. 오히려 모델 실패에도 DApp이 멈추지 않고 역할 로컬 fallback으로 거래 흐름을 완료한다는 운영 안정성을 설명한다.

---

## 2. 권장 슬라이드 구성

### 슬라이드 1 — 한도는 숨기고, 합의만 증명한다

**화면 문구**

- Midnight Private Negotiation
- AI agents × Local policy × Zero-knowledge proof

**전달할 주장**

구매자와 판매자가 자기 가격 한도를 상대방·Relay·Observer·공개 체인에 원문으로 공개하지 않고도 거래를 합의하고 검증할 수 있다.

**시각**

검은 배경, Midnight 로고, 중앙에 크게 `PRIVATE LIMITS → PROVEN AGREEMENT`를 두고 한도는 골드, 증명은 연보라, 최종 합의만 세이지그린으로 표시한다.

---

### 슬라이드 2 — 기존 협상은 신뢰를 한곳에 몰아넣는다

**화면 문구**

1. 플랫폼이 양쪽 한도를 본다
2. AI prompt에 한도를 넣으면 모델 제공자에게 전달된다
3. 공개 체인에 원문을 기록하면 되돌릴 수 없다

**전달할 주장**

문제는 협상 알고리즘보다 “누가 비밀을 볼 수 있는가”다. 중앙 서버나 클라우드 모델에 한도를 모두 보내는 순간, 온체인에서 감췄더라도 서비스 신뢰 경계는 넓어진다.

**피해야 할 표현**

- “블록체인은 모든 것을 공개한다”처럼 과도하게 일반화하지 않는다.
- “OpenAI가 데이터를 학습한다”처럼 확인되지 않은 주장을 하지 않는다.

---

### 슬라이드 3 — 역할을 나누면 비밀의 이동 경로가 짧아진다

**화면 문구**

- Buyer runtime — 최대 한도·난수·비밀키
- Seller runtime — 최소 금액·난수·비밀키
- Observer runtime — 공개 상태만
- Demo Controller — 명령과 정제 이벤트만

**전달할 주장**

Buyer, Seller, Observer는 별도 프로세스로 실행된다. Controller는 양쪽 한도를 저장하지 않고, UI에는 비밀을 제거한 이벤트만 전달한다.

**중요 코드**

- `packages/demo-controller/src/orchestrator.ts`
  - `child_process.fork()`로 역할별 프로세스 실행
  - `runtimeProcessEnvironment()`에서 Observer 환경에는 OpenAI 키를 넣지 않음
- `packages/protocol/src/index.ts`
  - 허용된 IPC 명령과 `DemoEvent` 스키마

**검증 포인트**

테스트는 역할별 PID, Observer의 private 환경 비보유, Controller 이벤트의 한도 원문 부재를 확인한다.

---

### 슬라이드 4 — GPT는 정책 결정자가 아니라 후보 생성기다

**화면 문구**

```text
공개 협상 맥락
        ↓
GPT 후보 1~5개
        ↓
로컬 PolicyGuard
   통과만 전송
```

**전달할 주장**

GPT는 다음 행동과 금액 후보를 제안할 뿐이다. Buyer는 `price <= maximum`, Seller는 `price >= minimum`을 로컬에서 검사한다. 최종 권한은 모델이 아니라 코드에 있다.

**모델에 보내는 필드**

```text
role
productCode
round
publicReferencePrice
currentOffer
```

**모델에 보내지 않는 필드**

```text
buyerMaximumPrice / sellerMinimumPrice
commitment randomness
secret key / wallet
PolicyGuard result
discarded candidate / retry count
```

**중요 코드**

- `packages/agent-core/src/index.ts`
  - `validatePublicContext()`
  - `createNegotiationModelRequest()`
  - `createOpenAIResponsesProvider()`
  - `generateAllowedCandidate()`

---

### 슬라이드 5 — 재요청도 한도 신호가 되지 않게 만든다

**화면 문구**

```text
실패 후보
→ 외부 전송 없음
→ 사용자 로그 없음
→ 다음 prompt에 실패 정보 없음
→ 새로운 stateless 요청
```

**전달할 주장**

같은 모델 대화에 “방금 후보가 정책 위반이었다”고 알려주면 반복된 성공·실패가 한도에 관한 신호가 될 수 있다. 따라서 이전 response ID나 conversation을 사용하지 않고, 다음 요청에도 PolicyGuard 결과와 폐기 횟수를 넣지 않는다.

**OpenAI 요청 설정**

- Responses API
- strict Structured Outputs
- `store: false`
- `previous_response_id` 없음
- 최대 5개 `{ action, price }` 후보

**정확한 한계**

`store: false`는 요청 단위 application state 저장을 끄는 설정이다. 조직 단위 Zero Data Retention과 같은 보장으로 표현하지 않는다.

**추가 프라이버시 한계**

공개된 현재 제안은 모델과 상대방이 본다. 반복되는 공개 가격으로 선호 범위를 통계적으로 추정할 가능성까지 제거하는 설계는 아니다.

---

### 슬라이드 6 — Relay는 대화방을 연결하지만 내용을 읽지 못한다

**화면 문구**

- X25519 임시 공유 비밀
- HKDF-SHA-256 세션 키
- AES-256-GCM 암호문
- AAD: 방·상품·역할·순번

**전달할 주장**

Buyer와 Seller가 Relay에 직접 연결한다. Relay는 매칭과 전달을 맡지만 협상 payload의 평문을 갖지 않는다. 메타데이터를 AAD로 묶어 방 바꾸기, 역할 바꾸기, 순번 재사용도 인증 실패로 만든다.

**중요 코드**

- `packages/room-relay/src/index.ts`
  - `parseRelayPacket()`
  - `relayAssociatedData()`
  - `encryptRelayPayload()`
  - `decryptRelayPayload()`
- 역할 런타임의 세션 키 생성과 sequence 관리

**검증 포인트**

평문 필드 거부, 인증 태그 변조, replay, nonce 재사용, 다른 상품 코드 방의 패킷 전달을 테스트한다.

---

### 슬라이드 7 — Compact는 공개 상태와 비공개 witness를 한 계약에 구분한다

**화면 문구**

```compact
export ledger buyerCommitment: Bytes<32>;
export ledger sellerCommitment: Bytes<32>;
export ledger priceCommitment: Bytes<32>;
export ledger finalPrice: Uint<64>;

witness buyerMaxPrice(): Uint<64>;
witness sellerMinPrice(): Uint<64>;
```

**전달할 주장**

`ledger`는 공개 계약 상태이고 `witness`는 증명 생성 시 로컬에서 제공되는 비공개 값이다. 한도 원문 대신 commitment를 공개하고, 최종 가격은 정산 전까지 commitment로 유지한다.

**왜 `Uint<64>`인가**

KRW 데모 값은 100,000을 넘을 수 있다. 이전 `Uint<16>` 범위는 최대 65,535이므로 v2는 가격과 한도를 `Uint<64>`로 확장했다.

**중요 코드**

- `packages/negotiation-contract/src/negotiation.compact`
  - 13–20행: 공개 ledger
  - 22–31행: private witness
  - 125–146행: 역할·가격별 domain-separated commitment

---

### 슬라이드 8 — 두 회로가 각자의 조건을 나눠서 증명한다

**화면 문구**

```text
joinDeal
Seller 한도 commitment 등록

authorizeHiddenPrice
합의가 ≤ Buyer 최대 한도
→ 가격 commitment만 공개

settle
Seller 최소 금액 ≤ 합의가
→ 최종 가격 공개
```

**전달할 주장**

Buyer는 자기 commitment를 다시 열어 합의 가격이 최대 한도 이하임을 증명한다. Seller는 자기 commitment와 가격 commitment를 열어 최소 금액 이상임을 증명한다. 두 검사가 모두 끝난 뒤에만 `finalPrice`가 공개된다.

**중요 Compact 조건**

```compact
assert(price <= maxPrice, "price exceeds buyer maximum");
assert(minPrice <= price, "price is below seller minimum");
finalPrice = disclose(price);
```

**핵심 구분**

commitment는 비밀값을 대신하는 공개 고정값이고, ZK proof는 그 commitment에 연결된 비밀값이 조건을 만족한다는 사실을 증명한다.

---

### 슬라이드 9 — 공개 상태는 세 단계만 말한다

**화면 문구**

```text
OPEN
거래 참여 완료

AUTHORIZED
가격 조건 승인 · 금액 비공개

SETTLED
100,000 KRW 공개
```

**전달할 주장**

Observer는 협상 대화, 중간 제안, 라운드, 한도, proof 내부 값을 보지 않는다. Indexer가 확인한 공개 계약 상태만 표시한다. `AUTHORIZED`와 `SETTLED`를 대비시켜 “가격은 마지막에만 공개된다”는 점을 시각적으로 전달한다.

**표시하지 않는 항목**

- 지갑 주소
- 트랜잭션 해시
- 블록 번호
- proof server 주소
- raw stdout

이 값들은 프로토콜에 필요할 수 있지만, 메인 데모의 프라이버시 메시지를 흐리고 로컬 네트워크에서는 공개 explorer 링크도 제공하지 않으므로 화면에서 제외한다.

---

### 슬라이드 10 — 화면은 기술을 감추는 것이 아니라 경계를 보여준다

**화면 문구**

- Buyer: 자기 한도와 자기 로그
- Seller: 자기 한도와 자기 로그
- Observer: 공개 상태만

**전달할 주장**

3패널 UI는 하나의 통합 테스트 화면이 아니라 세 개의 신뢰 경계를 한 장면에 나란히 보여준다. 로그는 기존 행을 바꾸지 않고 새 행으로 추가되며, 오래 걸리는 작업은 spinner가 진행 중임을 알린다.

**로그 색상 의미**

- 흰색: 일반 메시지
- 회색: 시간
- 골드: 비공개 상태·비공개 협상
- 연보라: protocol·proof
- 세이지그린: 합의·`SETTLED`·최종 가격
- 빨강: 결렬

**데모에서 숨기는 것**

AI 대화와 추론, 제안 금액, 라운드 수, 재요청 횟수, PolicyGuard 판정은 로그에 표시하지 않는다.

---

### 슬라이드 11 — 라이브 데모는 다섯 장면으로 끝낸다

**장면 1 — 같은 상품 코드 입장**

Buyer와 Seller가 각각 `1111`을 입력한다. 상대 참여 전에는 필요한 패널에만 대기 spinner가 나타난다.

**장면 2 — 역할별 한도 입력**

Buyer `110,000 KRW`, Seller `90,000 KRW`. 한도는 자기 패널 상단에만 잠금 아이콘과 함께 고정된다.

**장면 3 — commitment 준비**

양쪽 로그에는 자기 가격 커밋 생성과 상대 커밋 등록만 나타난다. `createDeal`, `joinDeal`은 내부 이벤트로 유지한다.

**장면 4 — 비공개 협상과 증명**

양쪽에 같은 시각으로 `AI 에이전트가 비공개 협상을 진행하고 있습니다.`가 표시된다. 협상 완료 후 `모든 조건을 공개하지 않고 증명하고 있습니다.`가 이어진다.

**장면 5 — 선택적 공개**

Observer는 `OPEN → AUTHORIZED · 금액 비공개 → SETTLED · 100,000 KRW`를 보여준다.

**결렬 데모**

Buyer 최대 한도보다 Seller 최소 금액이 높도록 입력한다. 합의 가격이 없으므로 증명·정산 단계를 건너뛰고 `CANCELLED · 공개된 금액 없음`으로 종료한다.

---

### 슬라이드 12 — 테스트는 “동작”과 “비노출”을 함께 본다

**화면 문구**

```text
35 runtime tests passed
8 web tests passed
Compact 5 circuits compiled
```

**전달할 주장**

성공 결과만 테스트하지 않는다. 비밀 필드가 request, IPC, Relay, Observer에 나타나지 않는지와 위변조·재사용이 거부되는지를 함께 검증한다.

**검증 범주**

- 프로세스 격리와 역할별 private state
- OpenAI 공개 입력 field audit
- `store: false`와 strict schema
- PolicyGuard 성공·거절·fallback
- Relay 암호문 변조·replay·nonce 재사용
- `OPEN → AUTHORIZED → SETTLED`
- `SETTLED` 전 최종 금액 비공개
- 결렬 시 proof 단계 생략

**정직한 현재 상태**

2026-07-26 실제 OpenAI 요청은 endpoint까지 도달했지만 프로젝트가 `429 insufficient_quota`를 반환했다. 따라서 실제 모델의 협상 품질은 할당량 복구 후 `npm run test:openai`로 다시 검증해야 한다.

---

### 슬라이드 13 — 다음 단계는 신뢰 경계를 더 줄이는 것이다

**화면 문구**

1. OpenAI quota 복구 후 실제 모델 scenario 평가
2. 공개 Midnight 네트워크 배포·explorer 검증
3. production key management와 운영 telemetry 분리
4. 민감도가 높은 환경은 로컬 모델 또는 전용 inference 검토

**전달할 주장**

현재 구조의 장점은 provider가 교체 가능하다는 점이다. GPT는 `CandidateProvider` 구현일 뿐이므로, 향후 로컬 모델이나 조직 전용 inference로 바꿔도 PolicyGuard·Relay·Compact 회로의 신뢰 경계는 유지된다.

**마지막 문장**

> 우리는 AI에게 비밀을 맡기지 않았습니다. AI는 후보를 만들고, 로컬 정책이 결정하며, Midnight가 결과를 증명합니다.

---

## 3. 발표에서 집중할 핵심 코드

### 3.1 Compact 계약

파일: `packages/negotiation-contract/src/negotiation.compact`

가장 중요한 네 부분:

1. `ledger`와 `witness`의 분리
2. Buyer `price <= maxPrice`
3. Seller `minPrice <= price`
4. `SETTLED`에서만 `finalPrice = disclose(price)`

발표에서 Compact 전체를 보여주지 말고 이 네 부분만 확대한다.

### 3.2 역할별 witness

파일: `packages/negotiation-contract/src/witnesses.ts`

Buyer private state에는 Buyer 한도와 Buyer 난수만, Seller private state에는 Seller 최소 금액과 Seller 난수만 둔다. 서로의 private state가 구조적으로 존재하지 않는다는 점이 런타임 격리와 연결된다.

### 3.3 AI provider와 PolicyGuard

파일: `packages/agent-core/src/index.ts`

보여줄 순서:

1. 공개 context validator
2. 역할별 system instructions
3. Responses API `store: false`와 strict JSON schema
4. 후보 validation
5. 로컬 PolicyGuard
6. provider 실패 시 local fallback

### 3.4 프로세스·자격 증명 격리

파일: `packages/demo-controller/src/orchestrator.ts`

`runtimeProcessEnvironment()`가 Observer에서 OpenAI 키를 제거하고, `fork()`가 각 역할에 필요한 환경만 넣는 부분을 보여준다.

### 3.5 암호화 Relay

파일: `packages/room-relay/src/index.ts`

AES-GCM 암호화 자체보다 AAD에 `sessionId`, `productCode`, `sender`, `target`, `sequence`를 넣는 이유를 설명한다. 암호문이 다른 방이나 다른 순서로 재사용되는 것도 거부하기 위해서다.

### 3.6 실제 Midnight 연결

파일: `packages/midnight-adapter/src/index.ts`

계약 배포·attach·circuit 호출·Indexer 공개 상태 조회를 담당한다. Controller가 타이머로 `SETTLED`를 꾸미는 것이 아니라 Observer가 Indexer에서 확인한 상태를 웹에 보낸다는 점이 중요하다.

---

## 4. 예상 질문과 답변

### Q1. AI가 한도를 모르는데 어떻게 협상합니까?

GPT는 공개 기준가와 현재 공개 제안으로 여러 후보를 만든다. 역할 프로세스의 PolicyGuard가 자기 한도로 후보를 검사한다. 통과한 후보만 Relay에 전송한다. 모델이 정책 집행자가 아니라 후보 생성기이기 때문에 한도를 직접 알 필요가 없다.

### Q2. 후보가 계속 거절되면 GPT가 한도를 추론하지 않습니까?

거절 결과와 횟수를 다음 요청에 넣지 않는다. 이전 response ID나 상태형 대화도 사용하지 않는다. 다만 상대방에게 실제로 공개된 제안 흐름에서 선호 범위를 통계적으로 추정할 가능성까지 제거하는 것은 아니다.

### Q3. `store: false`면 OpenAI가 데이터를 전혀 보관하지 않습니까?

그렇게 말하면 안 된다. 이 설정은 Responses API의 요청 단위 application state 저장을 끄는 설정이다. 조직 단위 Zero Data Retention과는 별도다. 더 높은 민감도에는 ZDR 계약, 전용 inference 또는 로컬 모델을 검토한다.

### Q4. commitment만 쓰면 왜 ZK proof가 필요합니까?

commitment는 값을 공개하지 않고 고정해 두는 역할을 한다. 그러나 그 값이 조건을 만족하는지는 commitment만으로 알 수 없다. ZK proof가 commitment에 연결된 비밀 한도와 합의 가격의 부등식을 원문 공개 없이 증명한다.

### Q5. Observer에 지갑 주소와 트랜잭션 해시가 왜 없습니까?

메인 데모의 목적은 공개 가능한 계약 상태와 최종 금액의 선택적 공개를 보여주는 것이다. 지갑·Tx 상세는 기술 검증용 별도 화면이나 개발 로그에 둘 수 있지만, 현재 로컬 네트워크는 공개 explorer 링크가 없고 메인 메시지를 흐리므로 제외했다.

### Q6. 실제 온체인입니까?

로컬 Midnight Node·Indexer·Buyer/Seller proof server에 실제 Compact 계약을 배포하고 회로를 실행한다. 다만 공개 테스트넷이나 메인넷 배포를 완료한 것은 아니므로 “로컬 Midnight 네트워크에서 온체인 상태 전이를 검증했다”고 표현한다.

### Q7. OpenAI가 현재 실제로 협상했습니까?

provider와 요청 데이터 경계는 구현했고 실제 endpoint에도 도달했다. 그러나 현재 API 프로젝트가 `insufficient_quota`를 반환해 실제 모델 후보 품질 검증은 보류됐다. 장애 상황에서 로컬 fallback으로 전체 거래가 완료되는 것은 검증했다.

### Q8. 왜 최대 10라운드입니까?

합의를 강제하기 위한 값이 아니다. 무한 반복, API 비용, 데모 대기 시간을 제한하는 운영 안전장치다. 내부 라운드는 최대 10이지만 화면에는 라운드와 중간 가격을 노출하지 않는다.

---

## 5. 데모 전 체크리스트

1. `npm run contract:compile`
2. `npm run midnight:up`
3. `npm run demo:midnight` 또는 quota 복구 후 `npm run demo:midnight:ai`
4. `cd apps/demo-web && npm run dev -- --port 3001`
5. 포트 `8787`, `3001` 중복 프로세스 확인
6. Safari 자동완성·주소 제안 비활성화 또는 브라우저 프로필 분리
7. happy path: Buyer `110000`, Seller `90000`
8. cancelled path: Buyer `90000`, Seller `100000`
9. Observer의 `AUTHORIZED`에는 금액이 없는지 확인
10. `SETTLED`에서만 최종 금액이 나타나는지 확인
11. Buyer·Seller 로그에 한도 금액이 일반 로그로 반복되지 않는지 확인
12. 화면 녹화 전에 새로고침·초기화 동작 확인

---

## 6. 출처

- Midnight의 공개·비공개 상태, witness와 선택적 공개 개념: [Midnight Network Overview](https://midnight.network/overview)
- Midnight 공식 색상·로고·Outfit 서체: [Midnight Brand Hub](https://midnight.network/brand-hub)
- OpenAI Responses API: [Create a model response](https://developers.openai.com/api/reference/resources/responses/methods/create)
- Responses API 전환과 상태 관리: [Migrate to the Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- 모델 선택 및 prompting 참고: [GPT-5.6-sol migration guide](https://developers.openai.com/api/docs/guides/upgrading-to-gpt-5p6-sol.md), [GPT-5.6 prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6.md)
- 구현의 직접 근거: 이 저장소의 `packages/`, `apps/demo-web/`, `README.md`, `docs/superpowers/specs/`
