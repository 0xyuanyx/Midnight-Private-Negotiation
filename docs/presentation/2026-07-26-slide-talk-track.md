# 슬라이드별 필수 발표 포인트와 키워드

## 1. 한도는 숨기고, 합의만 증명한다

**꼭 말할 것**

- 이 데모의 목적은 협상 내용을 보여주는 것이 아니라, 비밀이 어디까지 이동하는지를 보여주는 것이다.
- 구매자 최대 한도와 판매자 최소 금액은 각자 로컬에 남는다.
- 거래가 성사되면 성공한 최종 가격만 공개된다.

**키워드**

`private limits` · `proven agreement` · `selective disclosure`

**한 문장 전환**

“먼저 왜 이런 경계가 필요한지, 기존 협상 구조의 문제부터 보겠습니다.”

---

## 2. 기존 협상은 신뢰를 한곳에 몰아넣는다

**꼭 말할 것**

- 중앙 협상 서버에 양쪽 한도를 보내면 그 서버가 가장 큰 신뢰 대상이 된다.
- 한도를 GPT prompt에 넣으면 온체인에서는 숨겼더라도 외부 모델 제공자에게 전달된다.
- 공개 체인에 한도 원문을 올리는 방식은 되돌릴 수 없다.

**키워드**

`trust concentration` · `prompt exposure` · `irreversible disclosure`

**주의**

“모든 블록체인 데이터가 무조건 공개된다”거나 “OpenAI가 입력을 학습한다”고 단정하지 않는다.

---

## 3. 역할을 나누면 비밀의 이동 경로가 짧아진다

**꼭 말할 것**

- Buyer·Seller·Observer는 서로 다른 프로세스다.
- Buyer 프로세스에는 Seller 한도가 없고, Seller 프로세스에는 Buyer 한도가 없다.
- Observer는 지갑·private state·proof server·OpenAI 키 없이 공개 상태만 읽는다.
- Controller는 명령을 전달하고 정제 이벤트를 중계할 뿐 한도를 저장하지 않는다.

**키워드**

`process isolation` · `least privilege` · `sanitized events`

**코드 포인터**

`packages/demo-controller/src/orchestrator.ts`

**한 문장 전환**

“이 경계 안에서 AI의 권한도 아주 작게 제한했습니다.”

---

## 4. GPT는 정책 결정자가 아니라 후보 생성기다

**꼭 말할 것**

- GPT가 보는 것은 역할, 상품 코드, 라운드, 공개 기준가, 현재 공개 제안뿐이다.
- 정확한 개인 한도는 prompt에 없다.
- GPT가 최대 다섯 후보를 만들면 로컬 PolicyGuard가 하나씩 검사한다.
- 후보를 보내고 수락하는 최종 결정권은 로컬 코드에 있다.

**키워드**

`candidate generator` · `PolicyGuard` · `local enforcement`

**코드 포인터**

`packages/agent-core/src/index.ts`

**짧은 강조 문장**

“AI는 제안합니다. 로컬 정책이 결정합니다.”

---

## 5. 재요청도 한도 신호가 되지 않게 만든다

**꼭 말할 것**

- 거절 후보와 거절 이유를 다음 요청에 넣지 않는다.
- 이전 response ID나 conversation을 사용하지 않는다.
- 모든 요청은 같은 공개 정보만 가진 stateless 요청이다.
- `store: false`와 strict Structured Outputs를 사용한다.

**키워드**

`stateless` · `store: false` · `structured outputs`

**꼭 붙일 한계**

`store: false`는 조직 단위 Zero Data Retention과 같지 않다. 또한 실제로 공개된 제안 흐름에서 선호 범위를 추정할 가능성까지 제거하지는 않는다.

**한 문장 전환**

“모델을 통과한 메시지도 중앙 Controller가 아니라 암호화 Relay로 이동합니다.”

---

## 6. Relay는 연결하지만 읽지 못한다

**꼭 말할 것**

- Buyer와 Seller는 Room Relay에 직접 연결한다.
- Relay가 받는 협상 payload는 AES-256-GCM 암호문이다.
- X25519와 HKDF로 역할 간 세션 키를 만든다.
- 방·상품 코드·역할·순번을 AAD에 넣어 변조와 replay를 거부한다.

**키워드**

`ciphertext-only relay` · `AEAD` · `replay protection`

**코드 포인터**

`packages/room-relay/src/index.ts`

**주의**

Relay가 네트워크 메타데이터까지 전혀 모른다고 말하지 않는다. 방 매칭에 필요한 최소 메타데이터는 본다.

---

## 7. Compact는 공개 상태와 private witness를 구분한다

**꼭 말할 것**

- `ledger`는 공개 계약 상태다.
- `witness`는 proof를 만들 때 로컬에서 제공되는 비공개 값이다.
- 한도 원문 대신 commitment만 ledger에 남긴다.
- 가격·한도는 KRW 범위를 위해 `Uint<64>`를 사용한다.

**키워드**

`ledger` · `witness` · `commitment`

**코드 포인터**

`packages/negotiation-contract/src/negotiation.compact`

**짧은 강조 문장**

“공개할 값과 증명에만 쓸 값을 언어 수준에서 분리했습니다.”

---

## 8. 두 회로가 각자의 조건을 나눠 증명한다

**꼭 말할 것**

- Buyer 회로는 합의 가격이 최대 한도 이하인지 증명한다.
- Seller 회로는 합의 가격이 최소 금액 이상인지 증명한다.
- `AUTHORIZED`에서는 가격 commitment만 공개된다.
- `settle`이 성공한 뒤에만 `finalPrice`를 disclose한다.

**키워드**

`price ≤ max` · `min ≤ price` · `disclose at settlement`

**코드 포인터**

`authorizeHiddenPrice()` · `settle()`

**한 문장 전환**

“그래서 외부 관찰자는 복잡한 내부 과정 대신 세 개의 공개 상태만 보게 됩니다.”

---

## 9. 공개 상태는 세 단계만 말한다

**꼭 말할 것**

- `OPEN`은 양쪽 참여가 준비됐다는 뜻이다.
- `AUTHORIZED`는 Buyer 조건을 통과했지만 가격은 commitment로만 있다는 뜻이다.
- `SETTLED`에서 Seller 조건까지 통과하고 최종 가격이 공개된다.
- Observer에는 비공개 협상·증명 진행 로그가 없다.

**키워드**

`OPEN` · `AUTHORIZED` · `SETTLED`

**시각적 강조**

`AUTHORIZED · 금액 비공개`와 `SETTLED · 100,000 KRW`의 대비를 짚는다.

**주의**

메인 화면에 Tx hash가 없다는 것을 “체인에 트랜잭션이 없다”로 오해하지 않도록 설명한다.

---

## 10. 화면은 세 개의 신뢰 경계를 보여준다

**꼭 말할 것**

- Buyer와 Seller는 자기 한도만 상단에 본다.
- Observer는 공개 계약 상태만 본다.
- 긴 작업에는 spinner가 있고, 완료 로그는 기존 행을 바꾸지 않고 다음 행에 추가된다.
- 색은 문장 전체가 아니라 의미 토큰에만 사용한다.

**키워드**

`role-local view` · `immutable logs` · `semantic color`

**데모 화면에서 짚을 색**

골드 `비공개`, 연보라 `증명`, 세이지그린 `최종 합의`.

---

## 11. 라이브 데모는 다섯 장면으로 끝낸다

**꼭 말할 것**

1. 같은 상품 코드로 입장한다.
2. 각자 한도를 입력한다.
3. 양쪽 commitment가 준비된다.
4. 비공개 협상과 조건 증명이 진행된다.
5. Observer에서 마지막 가격만 공개된다.

**키워드**

`join` · `negotiate privately` · `reveal once`

**happy path 입력**

Buyer `110000`, Seller `90000`

**cancelled path 입력**

Buyer `90000`, Seller `100000`

**데모 중 말하지 말 것**

중간 후보 금액, round 수, 재요청 횟수, PolicyGuard reject 사유.

---

## 12. 테스트는 동작과 비노출을 함께 본다

**꼭 말할 것**

- 런타임 테스트 35개와 웹 테스트 8개가 통과한다.
- Compact 회로 5개가 컴파일된다.
- 성공 경로뿐 아니라 request·IPC·Relay·Observer에 비밀 필드가 없는지도 검사한다.
- 위변조, replay, nonce 재사용, 다른 방 packet을 거부한다.

**키워드**

`35 + 8 tests` · `privacy invariants` · `adversarial checks`

**정직하게 말할 현재 제한**

실제 OpenAI endpoint에는 도달했지만 프로젝트 quota가 없어 `429 insufficient_quota`였다. 실제 모델 협상 품질은 quota 복구 후 재실행한다. API 실패 후 로컬 fallback으로 전체 흐름이 완료되는 것은 검증했다.

---

## 13. 다음 단계는 신뢰 경계를 더 줄이는 것이다

**꼭 말할 것**

- 실제 모델 scenario 평가를 quota 복구 후 다시 실행한다.
- 로컬 Midnight 검증 다음에는 공개 네트워크 배포·explorer 검증이 필요하다.
- production에서는 키 관리와 telemetry를 역할 경계에 맞춰 설계해야 한다.
- 민감도가 더 높다면 같은 provider 인터페이스에 로컬 AI를 연결할 수 있다.

**키워드**

`provider swap` · `public network` · `local inference`

**마지막 문장**

“AI는 후보를 만들고, 로컬 정책이 결정하며, Midnight가 결과를 증명합니다.”

---

## 발표 전체에서 반복할 세 문장

1. **정확한 한도는 모델 입력에 넣지 않습니다.**
2. **PolicyGuard는 역할별 로컬에서 후보를 검사합니다.**
3. **최종 가격은 `SETTLED`에서 한 번만 공개됩니다.**

## 발표 전체에서 피할 세 문장

1. “아무 정보도 절대 새지 않습니다.”
2. “`store: false`라서 OpenAI가 데이터를 전혀 보관하지 않습니다.”
3. “메인넷에서 이미 검증됐습니다.”
