# Midnight Private Negotiation DApp

구매자와 판매자의 가격 한도를 공개하지 않고 AI 에이전트가 협상한 뒤, 합의가 성립하면 최종 금액만 Midnight에 기록하는 데모 DApp입니다.

현재 루트는 새 DApp(v2)의 설계와 구현을 위한 작업 공간입니다. Counter 예제를 기반으로 만든 이전 데모는 `v1/`에 로컬 아카이브로 보존하지만, Git 추적과 원격 저장소에서는 제외합니다.

## 현재 설계 방향

- Buyer, Seller, Observer를 한 화면의 세 패널로 구성
- Buyer와 Seller가 동일한 4자리 상품 코드로 협상방에 참여
- 각 역할의 한도와 commitment randomness는 역할별 로컬 private state에만 저장
- GPT에는 정확한 한도를 전달하지 않고 현재 제안과 협상 맥락만 전달
- 로컬 `PolicyGuard`가 후보 제안이 역할별 한도 안에 있는지 검사
- 역할 간 협상 메시지는 Room Relay를 통해 암호문으로 전달
- Observer는 Midnight Indexer의 공개 상태와 최종 합의 금액만 표시

## 디렉터리

```text
.
├── v1/                 # 로컬 전용 기존 데모(gitignored, 원격 미포함)
├── apps/
│   └── demo-web/       # WebSocket에 연결된 3패널 웹 DApp
├── packages/
│   ├── agent-core/     # 한도 비인지 GPT mock·로컬 PolicyGuard
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

공용 프로토콜, 별도 역할 프로세스, WebSocket Controller와 3패널 웹 DApp이 구현되어 있습니다. 브라우저는 로그를 자체 생성하지 않고 검증된 런타임 이벤트만 표시합니다. GPT mock은 공개 기준가·현재 제안·라운드만으로 최대 다섯 후보를 생성하고, 각 역할의 로컬 `PolicyGuard`가 자기 한도로 전송·수락 가능 여부를 검사합니다. 실패 후보와 stateless 재요청은 화면·IPC·Relay에 노출되지 않습니다. Room Relay는 Controller와 분리된 네 번째 프로세스로 실행되며 Buyer·Seller가 로컬 TCP로 직접 연결합니다. 역할 간 협상 패킷은 임시 X25519 공유 비밀에서 HKDF-SHA-256 세션 키를 만들고, 방·역할·순번을 AAD로 묶은 AES-256-GCM 암호문만 Relay에 전달합니다.

Midnight 로컬 체인 모드에서는 Buyer가 계약을 배포하고, Seller가 `joinDeal`, Buyer가 `authorizeHiddenPrice`, Seller가 `settle`을 각각 자기 프로세스와 전용 proof server에서 실행합니다. Controller의 타이머가 공개 상태를 만들지 않으며, 지갑이 보고한 트랜잭션 완료 뒤에도 Observer가 Indexer에서 `OPEN → AUTHORIZED → SETTLED`를 확인해야 웹에 표시됩니다. Buyer·Seller 한도는 계약의 witness로만 사용되고 공개 ledger에는 commitment만 남으며, `finalPrice`는 `SETTLED`에서만 공개됩니다. 새 코드에서는 `counter` 레거시 명칭을 사용하지 않습니다.

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

## v2 기반 검증

```bash
npm install
npm run typecheck
npm test
```

테스트는 Buyer·Seller·Observer와 Room Relay의 프로세스 격리, 상품 코드 입장, commitment 대기와 공동 타임스탬프, GPT mock 입력의 비밀 필드 거부, 역할별 PolicyGuard, stateless 재요청, 최대 10라운드 성사·결렬 분기, 결렬 시 증명 생략, 한도 원문 비노출, Controller의 암호문 비수신, Relay envelope의 평문 필드 거부, 메타데이터·인증 태그 변조, sequence replay, nonce 재사용, 다른 방 패킷 차단, Observer 공개 이벤트 제한을 확인합니다.

웹 DApp 검증:

```bash
cd apps/demo-web
npm test
```

## 설계 문서

- [v2 통합 시스템 설계](docs/superpowers/specs/2026-07-25-private-negotiation-dapp-v2-design.md)
- [3패널 프레젠테이션 화면 설계](docs/superpowers/specs/2026-07-25-presentation-terminal-page-design.md)
- [calm-design 디자인 시스템](.calm-design/DESIGN.md)
