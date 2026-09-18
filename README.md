# Midnight Private Negotiation DApp

구매자와 판매자의 예약 가격을 상대방·AI·Relay·공개 원장에 전달하지 않고 협상한 뒤, 합의가 성립하면 최종 가격을 Midnight에 공개하는 데모 DApp입니다.

제출 시나리오는 가상의 원사업자(Buyer)와 수급사업자(Seller)가 **하도급 부품 납품 단가**를 협상하는 경우입니다. 국내 하도급법은 원사업자가 수급사업자에게 재료비·노무비 같은 원가 정보를 정당한 사유 없이 요구하는 것을 금지합니다. 그래도 수급사업자는 원가를 근거로 한 최저 수용가를 가지고 협상하며, 중소벤처기업부 2024년 납품대금 연동제 실태조사에서도 미연동 약정 기업의 1순위 사유가 위탁기업에 원가 정보를 제공하기 싫다는 응답(35개사 중 45.7%)이었습니다. 이 데모는 그런 거래에서 양측 한도를 공개하지 않고 단가를 합의하는 흐름을 보여줍니다. 근거와 한계는 [국내 하도급 원가 공개 부담 조사](docs/research/2026-09-17-subcontract-cost-disclosure.md)에 정리했습니다.

시연용 공개 기준가격은 **100,000,000 KRW**입니다. 품목은 발표 맥락에만 쓰는 정적 예시이며 현재 AI 요청이나 계약 데이터에는 포함되지 않습니다. 실제 AI 입력은 상품 코드, 공개 기준가격, 현재 제안, 라운드와 역할 정보로 제한됩니다. 아래 금액은 모두 시연 값이며 실제 거래 가격이나 고객 검증 결과가 아닙니다. 이 데모는 하도급법이나 연동제 준수를 판정하거나 증명하지 않으며, 원가의 진위를 확인하지 않습니다. 납품대금 연동 조정을 비공개 원재료 비중으로 증명하는 회로는 후속 제안이며 구현하지 않았습니다.

구매자 최대 승인 한도와 판매자 최저 수용가는 상대방·AI·Relay·공개 원장에 전달하지 않습니다. 현재 단일 브라우저와 로컬 Demo Controller는 데모 신뢰 경계 안에 있으며, Controller는 입력 한도를 대상 역할 런타임에 평문으로 전달합니다. 계약이 `SETTLED`가 되면 최종 합의 가격이 공개됩니다. 이 데모는 분리된 구매자·판매자 클라이언트나 최종 계약가 비공개를 구현하지 않습니다.

현재 루트는 새 DApp(v2)의 설계와 구현을 위한 작업 공간입니다. Counter 예제를 기반으로 만든 이전 데모는 `v1/`에 로컬 아카이브로 보존하지만, Git 추적과 원격 저장소에서는 제외합니다.

## 현재 설계 방향

- Buyer, Seller, Observer를 한 화면의 세 패널로 구성
- Buyer와 Seller가 동일한 4자리 상품 코드로 협상방에 참여
- 각 역할의 한도와 commitment randomness는 역할별 로컬 private state에서 관리하며, 한도 입력은 아래 로컬 Controller 신뢰 경계를 거쳐 전달
- GPT에는 정확한 한도를 전달하지 않고 공개 기준가·현재 제안·협상 맥락만 전달
- 로컬 `PolicyGuard`와 `StrategyGuard`가 후보 제안의 역할별 한도와 단계적 가격 전략을 검사
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

공용 프로토콜, 별도 역할 프로세스, WebSocket Controller와 3패널 웹 DApp이 구현되어 있습니다. 브라우저는 로그를 자체 생성하지 않고 검증된 런타임 이벤트만 표시합니다. mock과 실제 OpenAI provider는 공개 기준가·현재 제안·라운드만으로 최대 다섯 후보를 생성하고, 각 역할의 로컬 `PolicyGuard`와 `StrategyGuard`가 자기 한도와 가격 전략에 맞는지 검사합니다. 외부 AI가 없거나 모든 후보가 정책을 통과하지 못하면 역할 런타임 내부의 결정론적 fallback이 제안·수락을 이어받습니다. 한도는 Controller를 거쳐 대상 역할 런타임에 전달되지만 GPT 입력이나 로그에는 포함되지 않습니다. 실패 후보와 stateless 재요청도 화면·IPC·Relay에 노출되지 않습니다. Room Relay는 Controller와 분리된 네 번째 프로세스로 실행되며 Buyer·Seller가 로컬 TCP로 직접 연결합니다. 역할 간 협상 패킷은 임시 X25519 공유 비밀에서 HKDF-SHA-256 세션 키를 만들고, 방·역할·순번을 AAD로 묶은 AES-256-GCM 암호문만 Relay에 전달합니다.

Midnight 로컬 체인 모드에서는 Seller가 암호화 relay로 자기 공개키를 먼저 보내고, Buyer가 그 키를 생성자에 고정해 계약을 배포합니다. 이후 Seller가 `joinDeal`, Buyer가 `authorizeHiddenPrice`, Seller가 `settle`을 각각 자기 프로세스와 전용 proof server에서 실행합니다. `joinDeal`은 배포 시 고정된 Seller 키로만 호출할 수 있으므로 제3자가 Seller 자리를 먼저 차지할 수 없습니다. 계약은 Buyer가 연 가격이 Buyer의 가격 commitment와 같고 Seller 최저가 이상인지만 검사하며, 협상에서 합의한 가격인지는 알지 못합니다. 그래서 Seller 런타임이 자기가 기록한 합의 가격과 Buyer가 여는 가격을 오프체인에서 대조하고, 다르면 정산하지 않고 거래를 취소합니다. 계약 상태는 배포 시 `WAITING_SELLER`에서 시작해 `OPEN → AUTHORIZED → SETTLED`로 진행하고, 정산 전에는 어느 단계에서든 `CANCELLED`로 끝날 수 있습니다. Controller의 타이머가 공개 상태를 만들지 않으며, 지갑이 보고한 트랜잭션 완료 뒤에도 Observer가 Indexer에서 각 상태를 확인해야 웹에 표시됩니다. Buyer·Seller 한도는 계약의 witness로만 사용되고 공개 ledger에는 commitment만 남습니다. `finalPrice`는 공개 ledger 필드라 언제든 읽을 수 있지만 `settle` 전까지 0이며, `SETTLED`에서만 합의 가격이 기록됩니다. 새 코드에서는 `counter` 레거시 명칭을 사용하지 않습니다.

한 역할이 늦게 입장했을 때 상대가 이미 입장했거나 상대 가격 커밋이 이미 준비되어 있으면 완료 이벤트를 먼저 동기화하고 불필요한 대기 로그를 만들지 않습니다. 대기 로그는 아직 충족되지 않은 상태에만 회전 아이콘과 함께 표시됩니다. 화면에는 같은 4자리 상품 코드를 유지하지만 내부 session ID는 브라우저 데모 인스턴스별로 분리하므로, 페이지를 새로 열어 같은 코드를 사용해도 이전 실행 상태와 섞이지 않습니다.

메인 데모는 거래 흐름을 `거래 개시 · OPEN → 가격 조건 승인 · AUTHORIZED → 거래 확정 · SETTLED`로 표시합니다. 시간은 회색, `비공개 협상`과 `금액 비공개`는 골드, 증명·`OPEN`·`AUTHORIZED`는 연보라, 합의·최종 상태·금액은 세이지그린으로 의미 토큰만 강조합니다. 반복되는 가격 커밋과 완료 문장은 흰색으로 유지합니다. 지갑 주소, 트랜잭션 해시, 블록 번호는 비공개 메시지를 흐리고 로컬 체인에서 공개 검증 링크도 제공하지 못하므로 메인 화면에 표시하지 않습니다.

## GPT 역할과 비공개 경계

이 데모에서 브라우저와 로컬 Demo Controller는 신뢰 경계 안에 있습니다. 입력한 한도는 `ws://127.0.0.1:8787`로 Controller에 평문 전달되고, Controller가 대상 역할 프로세스에 IPC로 전달합니다. Controller는 이 값을 저장하거나 로그에 남기지 않지만 전달 중에는 평문을 취급합니다. 브라우저에서 역할 프로세스까지 종단 간 암호화되는 구조는 아닙니다. 한도 원문은 GPT, Room Relay, 공개 Ledger에는 전달하지 않습니다. 브라우저에는 각 역할의 입력값이 표시되므로 현재 한 화면의 데모를 서로 신뢰하지 않는 사용자를 위한 분리된 클라이언트로 해석해서는 안 됩니다.

Buyer와 Seller는 서로 다른 상세 역할 지침을 사용합니다. Buyer는 공개된 Seller 제안에서 수락 후보와 점진적으로 낮은 counter offer 후보를 만들고, Seller는 공개된 Buyer 제안에서 수락 후보와 점진적으로 높은 counter offer 후보를 만듭니다. 양쪽 모두 한 후보만 고집하지 않고 최대 다섯 후보를 만들어 불필요한 조기 결렬 가능성을 낮춥니다.

GPT 요청에는 `role`, `productCode`, `round`, `publicReferencePrice`, `currentOffer`만 들어갑니다. `publicReferencePrice`는 첫 제안을 만들기 위한 공개 상품 기준가이며 어느 역할의 비공개 한도도 아닙니다. 한도, commitment 난수, 비밀키, 지갑 정보, PolicyGuard 판정, 폐기 후보와 재시도 횟수는 포함하지 않습니다. GPT는 `최종 제안`, `마지노선`, `더는 양보할 수 없음`처럼 비공개 경계를 암시하는 표현도 생성하지 않으며, 후보가 거절되면 같은 공개 입력으로 완전히 새로운 stateless 요청을 수행합니다.

실제 어댑터는 OpenAI Responses API와 strict Structured Outputs를 사용합니다. 모든 요청은 `store: false`이고 이전 response ID나 conversation을 사용하지 않습니다. 단, `store: false`는 요청 단위 application state 저장을 끄는 설정이며 조직 단위 Zero Data Retention과 동일한 보장은 아닙니다. 기본 데모 명령은 실제 OpenAI provider를 활성화하므로 API 호출과 비용이 발생합니다. API 오류, 시간 초과, 잘못된 후보 또는 정책을 통과하지 못한 후보는 외부 로그 없이 폐기되고 역할 런타임의 로컬 fallback으로 전환됩니다. API 호출 없이 확인하려면 `demo:mock` 또는 `demo:midnight:mock`을 사용합니다.

## 최초 설치

검증 환경은 macOS arm64, Node `24.14.1`, npm `11.11.0`, Compact CLI `0.5.1`, Compact compiler `0.31.1`입니다. package.json의 Node 최소 요구사항은 `22.13.0`이지만 다른 Node 버전과 OS는 별도 검증이 필요합니다. `node`, `npm`, `compact`가 PATH에 있는 환경에서 시작합니다. 실제 체인 모드에는 실행 중인 Docker와 Docker Compose도 필요합니다.

```bash
git clone https://github.com/0xyuanyx/Midnight-Private-Negotiation.git
cd Midnight-Private-Negotiation
compact update 0.31.1 --no-set-default
compact compile +0.31.1 --version
npm run bootstrap
npm run typecheck
npm test
npm --prefix apps/demo-web ci
npm --prefix apps/demo-web test
```

Compact CLI가 없다면 먼저 설치하고 새 터미널을 엽니다.

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

`bootstrap`과 `contract:compile`은 시작 전에 Node 버전, Compact CLI, compiler `0.31.1` 설치 여부를 점검하고, 빠진 것이 있으면 실행할 명령을 안내한 뒤 멈춥니다. `bootstrap`은 이어서 lockfile 기반 설치 → 계약 컴파일 → 생성물 복사 → TypeScript 빌드를 수행합니다. 계약 스크립트는 전역 기본 버전과 관계없이 compiler `0.31.1`을 사용하며 계약 runtime은 `0.16.0`입니다. `managed/`, `dist/`, `node_modules/`는 Git에 포함하지 않습니다. 새 클론에서는 `bootstrap`을 먼저 실행해야 합니다. 웹은 루트 workspace에 포함되지 않아 별도 설치가 필요합니다. 최초 설치와 위 테스트에는 OpenAI 키나 Docker가 필요하지 않습니다.

## 로컬 DApp 실행

위 최초 설치를 마친 뒤 실행합니다.

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

`demo:controller`는 실제 OpenAI 협상을 기본으로 사용합니다. API 호출 없이 로컬 후보 생성기로 확인할 때는 다음 명령을 사용합니다.

```bash
npm run demo:mock
```

## 실제 Midnight 로컬 체인 모드

최초 실행에는 위 `bootstrap`을 사용합니다. Compact 계약 변경 후에는 고정된 compiler `0.31.1`로 생성물을 다시 준비합니다. 이후 데모 명령의 build 단계가 자산을 복사합니다.

```bash
npm run contract:compile
```

터미널 1에서 v2 전용 Node, Indexer, Buyer/Seller proof server를 시작합니다.

```bash
npm run midnight:up
```

터미널 2에서는 실제 Midnight 계약과 Indexer, OpenAI 협상을 사용하는 Controller를 실행합니다.

```bash
npm run demo:midnight
```

API 호출 없이 Midnight 연결만 확인할 때는 `npm run demo:midnight:mock`을 사용합니다.

해커톤 B2B 시나리오는 다음처럼 공개 기준가격을 명시해 실행합니다. `mock` 모드는 실제 AI API를 호출하지 않고 결정론적 후보 생성기를 사용합니다.

```bash
npm run midnight:up
NEGOTIATION_REFERENCE_PRICE_KRW=100000000 npm run demo:midnight:mock
npm --prefix apps/demo-web run dev -- --port 3001
```

각 명령은 별도 터미널에서 실행합니다. `http://localhost:3001/`에서 Buyer와 Seller가 각각 상품 코드 `4821`을 입력합니다. 성공 시연은 Buyer 최대 한도 `110000000`, Seller 최소 금액 `95000000`을 입력해 Observer의 `OPEN → AUTHORIZED → SETTLED`와 최종 공개 가격을 확인합니다. 화면을 초기화한 뒤 결렬 시연에는 Buyer `90000000`, Seller `95000000`을 입력합니다. 한도가 겹치지 않으면 `CANCELLED`로 종료되고 결렬 가격은 표시하지 않습니다. 제3자 정산 거절은 아래 계약 테스트로 재현합니다.

다른 로컬 Midnight 프로젝트가 기본 포트 `9944` 또는 `8088`을 사용 중이면 해당 컨테이너를 중단할 필요가 없습니다. 이 프로젝트의 Node와 Indexer 호스트 포트만 바꿔 실행할 수 있습니다. 다른 두 터미널의 웹 명령은 그대로 사용합니다.

```bash
MIDNIGHT_NODE_HOST_PORT=9945 MIDNIGHT_INDEXER_HOST_PORT=8089 npm run midnight:up
MIDNIGHT_NODE=http://127.0.0.1:9945 MIDNIGHT_INDEXER=http://127.0.0.1:8089/api/v3/graphql MIDNIGHT_INDEXER_WS=ws://127.0.0.1:8089/api/v3/graphql/ws NEGOTIATION_REFERENCE_PRICE_KRW=100000000 npm run demo:midnight:mock
```

```bash
node --test packages/negotiation-contract/test/contract.test.mjs
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

## 실제 OpenAI 협상 설정

기본 데모를 실행하기 전에 셸에 `MEMO_OPENAI_API_KEY` 또는 `OPENAI_API_KEY`가 설정되어 있어야 합니다. 기본 모델은 `gpt-5.6-sol`, 공개 기준가는 `100000` KRW이며 환경 변수로 변경할 수 있습니다.

```bash
source ~/.zshrc
npm run demo:controller
```

Midnight 로컬 체인과 실제 OpenAI provider를 함께 사용할 때:

```bash
source ~/.zshrc
npm run midnight:up
npm run demo:midnight
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

2026-09-11 실제 OpenAI 평가에서 `gpt-5.6-sol`로 31개 API 요청을 수행했습니다. 모델 후보가 사용된 두 합의 시나리오는 각각 `SETTLED`에 도달했고, 한도가 겹치지 않는 시나리오는 모델을 호출하지 않고 10라운드 뒤 `CANCELLED`로 종료했습니다. 요청 본문에 허용된 공개 필드만 포함되고 `store: false`인지 검사하는 privacy audit도 통과했습니다. 이 평가는 협상 평가 스크립트 기준이며 Midnight 온체인 정산 검증과는 구분합니다.

아래 표는 2026-09-17까지 확인한 검증 상태입니다. 실제 모델 평가는 2026-09-11 OpenAI 전용 시나리오에서, 이번 B2B 온체인 성공·결렬 시연은 2026-09-17 mock 협상 provider와 로컬 Midnight Node·Indexer·proof server에서 각각 실행했습니다.

| 검증 대상 | 상태 | 확인 내용 |
|---|---|---|
| OpenAI 요청 배선 | 완료 | Responses API endpoint 도달, 역할별 키 전달, Observer 키 비전달 |
| 요청 데이터 경계 | 완료 | 공개 필드만 전송, `store: false`, strict JSON schema |
| PolicyGuard·fallback | 완료 | API 실패 후 역할 로컬 fallback으로 `SETTLED` 완료 |
| 실제 모델 협상 품질 | 완료 | 2026-09-11 `gpt-5.6-sol` 31회 요청, 모델 선택 5회, 합의 2건 `SETTLED` |
| Midnight 계약 | 로컬 네트워크 완료 | 2026-09-18 Seller 고정 계약으로 성공 `OPEN → AUTHORIZED → SETTLED · 100,000,000 KRW`(입력 순서 두 가지 각 1회)와 결렬 `OPEN → CANCELLED · 공개된 금액 없음` 확인. 제3자의 참여·승인·정산·취소 거절을 포함한 계약 테스트 8/8 통과 |
| 공개 테스트넷·메인넷 | 미실행 | 현재 데모는 공개 네트워크 배포를 주장하지 않음 |

현재 루트 테스트는 47/47, 웹 테스트는 8/8 통과합니다. 2026-09-18에 보안 수정 커밋 `999c1af`를 공개 원격에서 새로 클론해 `compact compile +0.31.1`, `npm run bootstrap`, `npm run typecheck`, 루트 테스트 46/46, 웹 `npm ci`와 웹 테스트 8/8이 모두 통과하는 것을 확인했습니다. 이 새 클론 검증에는 Docker 로컬 체인 재기동이 포함되지 않았고, 공개 테스트넷 배포와 호스팅된 라이브 데모 URL도 준비되지 않았습니다. 자세한 명령과 범위는 [재현성 기록](docs/2026-09-09-review-reproducibility.md)에 있습니다.

## v2 기반 검증

```bash
npm run bootstrap
npm run typecheck
npm test
```

테스트는 Buyer·Seller·Observer와 Room Relay의 프로세스 격리, 상품 코드 입장, commitment 대기와 공동 타임스탬프, GPT mock 및 OpenAI 요청의 비밀 필드 거부, strict Structured Outputs 파싱, 역할별 PolicyGuard, stateless 재요청, Observer·Relay 키 비전달, 외부 AI 키 없는 고액 조건 fallback, 최대 10라운드 성사·결렬 분기, 결렬 시 증명 생략, 한도 원문 비노출, Controller의 암호문 비수신, Relay envelope의 평문 필드 거부, 메타데이터·인증 태그 변조, sequence replay, nonce 재사용, 다른 방 패킷 차단, Observer 공개 이벤트 제한을 확인합니다.

웹 DApp 검증:

```bash
cd apps/demo-web
npm ci
npm test
```

## 설계 문서

- [v2 통합 시스템 설계](docs/superpowers/specs/2026-07-25-private-negotiation-dapp-v2-design.md)
- [3패널 프레젠테이션 화면 설계](docs/superpowers/specs/2026-07-25-presentation-terminal-page-design.md)
- [OpenAI 협상 연결 설계](docs/superpowers/specs/2026-07-26-openai-negotiation-integration-design.md)
- [발표 내용 초안](docs/presentation/2026-07-26-demo-presentation-content.md)
- [슬라이드별 발표 포인트](docs/presentation/2026-07-26-slide-talk-track.md)
- [calm-design 디자인 시스템](.calm-design/DESIGN.md)
