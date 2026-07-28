# Midnight Private Negotiation DApp

구매자와 판매자의 가격 한도를 공개하지 않고 AI 에이전트가 협상한 뒤, 합의가 성립하면 최종 금액만 Midnight에 기록하는 데모 DApp입니다.

현재 루트는 새 DApp(v2)의 설계와 구현을 위한 작업 공간입니다. Counter 예제를 기반으로 만든 이전 데모는 `v1/`에 로컬 아카이브로 보존하지만, Git 추적과 원격 저장소에서는 제외합니다.

## 현재 설계 방향

- Buyer, Seller, Observer를 한 화면의 세 패널로 구성
- Buyer와 Seller가 동일한 4자리 상품 코드로 협상방에 참여
- 각 역할의 한도와 commitment randomness는 역할별 로컬 private state에만 저장
- GPT에는 정확한 한도를 전달하지 않고 공개 기준가·현재 제안·협상 맥락만 전달
- 로컬 `PolicyGuard`가 후보 제안이 역할별 한도 안에 있는지 검사
- 역할 간 협상 메시지는 Room Relay를 통해 암호문으로 전달
- Observer는 Midnight Indexer의 공개 상태와 최종 합의 금액만 표시
- 최대 10라운드는 내부 종료 조건으로만 사용하고 화면에는 라운드 수·중간 제안·재시도 횟수를 표시하지 않음
- 사용자 로그는 한글 설명을 먼저 쓰고 `OPEN`, `AUTHORIZED`, `SETTLED` 같은 실제 계약 상태를 함께 표시

## 디렉터리

```text
.
├── v1/                 # 로컬 전용 기존 데모(gitignored, 원격 미포함)
├── apps/
│   └── demo-web/       # WebSocket에 연결된 3패널 웹 DApp
├── packages/
│   ├── agent-core/     # 한도 비인지 mock/OpenAI provider·로컬 PolicyGuard
│   ├── protocol/       # IPC 명령·정제 이벤트 계약
│   ├── room-relay/     # 독립 암호문 중계 프로세스·AEAD envelope
│   ├── negotiation-contract/# Uint64 가격·비공개 한도 검증 Compact 계약
│   ├── midnight-adapter/# Wallet·Provider·계약·Indexer 연결
│   ├── demo-controller/# 역할별 프로세스 실행·조정
│   ├── buyer-runtime/  # Buyer 격리 프로세스
│   ├── seller-runtime/ # Seller 격리 프로세스
│   └── observer-runtime/# Observer 격리 프로세스
├── .calm-design/       # 새 DApp 디자인 컨텍스트와 디자인 시스템
├── .superdesign/       # 새 3패널 화면 설계 산출물
└── docs/               # 새 DApp 설계 문서
```

공용 프로토콜, 별도 역할 프로세스, WebSocket Controller와 3패널 웹 DApp이 구현되어 있습니다. 브라우저는 로그를 자체 생성하지 않고 검증된 런타임 이벤트만 표시합니다. mock과 실제 OpenAI provider는 공개 기준가·현재 제안·라운드만으로 최대 다섯 후보를 생성하고, 각 역할의 로컬 `PolicyGuard`가 자기 한도로 전송·수락 가능 여부를 검사합니다. 외부 AI가 없거나 모든 후보가 정책을 통과하지 못하면 역할 런타임 내부의 결정론적 fallback이 제안·수락을 이어받습니다. fallback이 사용하는 한도는 GPT 입력, Controller, 로그로 전달되지 않습니다. 실패 후보와 stateless 재요청도 화면·IPC·Relay에 노출되지 않습니다. Room Relay는 Controller와 분리된 네 번째 프로세스로 실행되며 Buyer·Seller가 로컬 TCP로 직접 연결합니다. 역할 간 협상 패킷은 임시 X25519 공유 비밀에서 HKDF-SHA-256 세션 키를 만들고, 방·역할·순번을 AAD로 묶은 AES-256-GCM 암호문만 Relay에 전달합니다.

Midnight 로컬 체인 모드에서는 Buyer가 계약을 배포하고, Seller가 `joinDeal`, Buyer가 `authorizeHiddenPrice`, Seller가 `settle`을 각각 자기 프로세스와 전용 proof server에서 실행합니다. Controller의 타이머가 공개 상태를 만들지 않으며, 지갑이 보고한 트랜잭션 완료 뒤에도 Observer가 Indexer에서 `OPEN → AUTHORIZED → SETTLED`를 확인해야 웹에 표시됩니다. Buyer·Seller 한도는 계약의 witness로만 사용되고 공개 ledger에는 commitment만 남으며, `finalPrice`는 `SETTLED`에서만 공개됩니다. 새 코드에서는 `counter` 레거시 명칭을 사용하지 않습니다.

한 역할이 늦게 입장했을 때 상대가 이미 입장했거나 상대 가격 커밋이 이미 준비되어 있으면 완료 이벤트를 먼저 동기화하고 불필요한 대기 로그를 만들지 않습니다. 대기 로그는 아직 충족되지 않은 상태에만 회전 아이콘과 함께 표시됩니다. 화면에는 같은 4자리 상품 코드를 유지하지만 내부 session ID는 브라우저 데모 인스턴스별로 분리하므로, 페이지를 새로 열어 같은 코드를 사용해도 이전 실행 상태와 섞이지 않습니다.

메인 데모는 거래 흐름을 `거래 개시 · OPEN → 가격 조건 승인 · AUTHORIZED → 거래 확정 · SETTLED`로 표시합니다. 시간은 회색, `비공개 협상`과 `금액 비공개`는 골드, 증명·`OPEN`·`AUTHORIZED`는 연보라, 합의·최종 상태·금액은 세이지그린으로 의미 토큰만 강조합니다. 반복되는 가격 커밋과 완료 문장은 흰색으로 유지합니다. 지갑 주소, 트랜잭션 해시, 블록 번호는 비공개 메시지를 흐리고 로컬 체인에서 공개 검증 링크도 제공하지 못하므로 메인 화면에 표시하지 않습니다.

## GPT 역할과 비공개 경계

Buyer와 Seller는 서로 다른 상세 역할 지침을 사용합니다. Buyer는 공개된 Seller 제안에서 수락 후보와 점진적으로 낮은 counter offer 후보를 만들고, Seller는 공개된 Buyer 제안에서 수락 후보와 점진적으로 높은 counter offer 후보를 만듭니다. 양쪽 모두 한 후보만 고집하지 않고 최대 다섯 후보를 만들어 불필요한 조기 결렬 가능성을 낮춥니다.

GPT 요청에는 `role`, `productCode`, `round`, `publicReferencePrice`, `currentOffer`만 들어갑니다. `publicReferencePrice`는 첫 제안을 만들기 위한 공개 상품 기준가이며 어느 역할의 비공개 한도도 아닙니다. 한도, commitment 난수, 비밀키, 지갑 정보, PolicyGuard 판정, 폐기 후보와 재시도 횟수는 포함하지 않습니다. GPT는 `최종 제안`, `마지노선`, `더는 양보할 수 없음`처럼 비공개 경계를 암시하는 표현도 생성하지 않으며, 후보가 거절되면 같은 공개 입력으로 완전히 새로운 stateless 요청을 수행합니다.

실제 어댑터는 OpenAI Responses API와 strict Structured Outputs를 사용합니다. 모든 요청은 `store: false`이고 이전 response ID나 conversation을 사용하지 않습니다. 단, `store: false`는 요청 단위 application state 저장을 끄는 설정이며 조직 단위 Zero Data Retention과 동일한 보장은 아닙니다. 실제 provider는 `NEGOTIATION_AI_PROVIDER=openai`일 때만 활성화되므로 기본 명령에서는 API 호출과 비용이 발생하지 않습니다. API 오류, 시간 초과, 잘못된 후보 또는 정책을 통과하지 못한 후보는 외부 로그 없이 폐기되고 역할 런타임의 로컬 fallback으로 전환됩니다.

## 로컬 DApp 실행

터미널 1:

```bash
npm run demo:controller
```

터미널 2:

```bash
cd apps/demo-web
npm run dev -- --port 3001
```

그다음 `http://localhost:3001/`에서 Buyer와 Seller가 같은 상품 코드를 입력하고 각자 한도를 입력합니다. 기본 WebSocket 주소는 `ws://127.0.0.1:8787`입니다.

## 실제 Midnight 로컬 체인 모드

최초 실행 또는 Compact 계약 변경 후에는 설치된 Compact compiler로 생성물을 준비합니다. `managed/` 생성물은 저장소에 커밋하지 않습니다.

```bash
npm run contract:compile
```

터미널 1에서 v2 전용 Node, Indexer, Buyer/Seller proof server를 시작합니다.

```bash
npm run midnight:up
```

터미널 2에서는 mock 공개 상태 대신 실제 Midnight 계약과 Indexer를 사용하는 Controller를 실행합니다.

```bash
npm run demo:midnight
```

터미널 3에서는 위와 동일하게 웹을 실행합니다. 웹의 WebSocket 주소는 바뀌지 않으므로 기존 3패널 화면이 실제 체인 이벤트를 그대로 받습니다.

```bash
cd apps/demo-web
npm run dev -- --port 3001
```

종료할 때 로컬 체인 컨테이너를 내립니다.

```bash
npm run midnight:down
```

## 실제 OpenAI 협상 모드

셸에 `MEMO_OPENAI_API_KEY` 또는 `OPENAI_API_KEY`가 설정되어 있어야 합니다. 기본 모델은 `gpt-5.6-sol`, 공개 기준가는 `100000` KRW이며 환경 변수로 변경할 수 있습니다.

```bash
source ~/.zshrc
npm run demo:ai
```

Midnight 로컬 체인과 실제 OpenAI provider를 함께 사용할 때:

```bash
source ~/.zshrc
npm run midnight:up
npm run demo:midnight:ai
```

선택 설정:

```bash
export OPENAI_NEGOTIATION_MODEL=gpt-5.6-sol
export NEGOTIATION_REFERENCE_PRICE_KRW=100000
```

실제 API의 구조화 출력, 합의·결렬 시나리오, 공개 입력 필드 감사를 실행할 때:

```bash
source ~/.zshrc
npm run test:openai
```

2026-07-26 로컬 검증에서는 요청이 OpenAI까지 도달했지만 API 프로젝트가 `429 insufficient_quota`를 반환해 실제 모델 후보의 협상 품질 평가는 완료하지 못했습니다. 같은 OpenAI 실행 모드에서 API 실패가 로컬 fallback으로 전환되고 전체 Buyer·Seller·Observer 흐름이 `SETTLED`까지 완료되는 것은 확인했습니다. 할당량 복구 후 `npm run test:openai`를 다시 실행하면 실제 모델 선택이 한 번도 없을 경우 실패하도록 구성되어 있습니다.

검증 상태를 발표에서 혼동하지 않도록 다음처럼 구분합니다.

| 검증 대상 | 상태 | 확인 내용 |
|---|---|---|
| OpenAI 요청 배선 | 완료 | Responses API endpoint 도달, 역할별 키 전달, Observer 키 비전달 |
| 요청 데이터 경계 | 완료 | 공개 필드만 전송, `store: false`, strict JSON schema |
| PolicyGuard·fallback | 완료 | API 실패 후 역할 로컬 fallback으로 `SETTLED` 완료 |
| 실제 모델 협상 품질 | 보류 | API 프로젝트 `insufficient_quota`; 할당량 복구 후 재실행 필요 |
| Midnight 계약 | 로컬 네트워크 완료 | 로컬 Node·Indexer·proof server에서 `OPEN → AUTHORIZED → SETTLED` |
| 공개 테스트넷·메인넷 | 미실행 | 현재 데모는 공개 네트워크 배포를 주장하지 않음 |

## v2 기반 검증

```bash
npm install
npm run typecheck
npm test
```

테스트는 Buyer·Seller·Observer와 Room Relay의 프로세스 격리, 상품 코드 입장, commitment 대기와 공동 타임스탬프, GPT mock 및 OpenAI 요청의 비밀 필드 거부, strict Structured Outputs 파싱, 역할별 PolicyGuard, stateless 재요청, Observer·Relay 키 비전달, 외부 AI 키 없는 고액 조건 fallback, 최대 10라운드 성사·결렬 분기, 결렬 시 증명 생략, 한도 원문 비노출, Controller의 암호문 비수신, Relay envelope의 평문 필드 거부, 메타데이터·인증 태그 변조, sequence replay, nonce 재사용, 다른 방 패킷 차단, Observer 공개 이벤트 제한을 확인합니다.

웹 DApp 검증:

```bash
cd apps/demo-web
npm test
```

## 설계 문서

- [v2 통합 시스템 설계](docs/superpowers/specs/2026-07-25-private-negotiation-dapp-v2-design.md)
- [3패널 프레젠테이션 화면 설계](docs/superpowers/specs/2026-07-25-presentation-terminal-page-design.md)
- [OpenAI 협상 연결 설계](docs/superpowers/specs/2026-07-26-openai-negotiation-integration-design.md)
- [발표 내용 초안](docs/presentation/2026-07-26-demo-presentation-content.md)
- [슬라이드별 발표 포인트](docs/presentation/2026-07-26-slide-talk-track.md)
- [calm-design 디자인 시스템](.calm-design/DESIGN.md)
