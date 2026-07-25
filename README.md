# Midnight Private Negotiation DApp

구매자와 판매자의 가격 한도를 공개하지 않고 AI 에이전트가 협상한 뒤, 합의가 성립하면 최종 금액만 Midnight에 기록하는 데모 DApp입니다.

현재 루트는 새 DApp(v2)의 설계와 구현을 위한 작업 공간입니다. Counter 예제를 기반으로 만든 이전 데모는 `v1/`에 로컬 아카이브로 보존합니다.

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
├── v1/                 # 기존 Python·Midnight.js·Compact 데모
├── apps/
│   └── demo-web/       # 3패널 프론트엔드 목업
├── packages/
│   ├── protocol/       # IPC 명령·정제 이벤트 계약
│   ├── demo-controller/# 역할별 프로세스 실행·조정
│   ├── buyer-runtime/  # Buyer 격리 프로세스
│   ├── seller-runtime/ # Seller 격리 프로세스
│   └── observer-runtime/# Observer 격리 프로세스
├── .calm-design/       # 새 DApp 디자인 컨텍스트와 디자인 시스템
├── .superdesign/       # 새 3패널 화면 설계 산출물
└── docs/               # 새 DApp 설계 문서
```

공용 프로토콜과 별도 프로세스 IPC 뼈대가 구현되어 있습니다. 새 코드에서는 `counter` 레거시 명칭을 사용하지 않습니다.

## v2 기반 검증

```bash
npm install
npm run typecheck
npm test
```

테스트는 Buyer·Seller·Observer가 서로 다른 PID로 실행되는지, 상품 코드 입장과 한도 입력이 별도 명령인지, 먼저 한도를 잠근 역할이 상대 입력 대기 이벤트를 받는지, 한도 원문이 화면 이벤트에 포함되지 않는지 확인합니다.

## 설계 문서

- [v2 통합 시스템 설계](docs/superpowers/specs/2026-07-25-private-negotiation-dapp-v2-design.md)
- [3패널 프레젠테이션 화면 설계](docs/superpowers/specs/2026-07-25-presentation-terminal-page-design.md)
- [calm-design 디자인 시스템](.calm-design/DESIGN.md)
