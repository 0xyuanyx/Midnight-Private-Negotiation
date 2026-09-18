# 본사 리뷰 대조 및 새 클론 실행 검증

2026-09-09에 Private Negotiation의 본사 리뷰 5개 항목과 새 클론 실행을 확인했다. 초기 점검에서 발견한 bootstrap 및 웹 빌드 문제를 아래 후속 반영으로 수정했다. 실제 OpenAI 응답과 온체인 정산은 2026-09-11 후속 검증에서 별도로 확인했다.

## 후속 반영 및 재검증

사용자 요청에 따라 원본 작업 폴더에 다음을 반영했다. 아래의 초기 점검 항목과 실패 기록은 수정 전 상태를 설명한다.

- `npm run bootstrap`: npm ci → 고정 compiler 0.31.1로 계약 컴파일 → build.
- 루트 build/typecheck 및 계약 build에서 생성물 복사를 TypeScript 검사보다 먼저 수행.
- `.gitignore`에 웹 플러그인 소스 하나만 예외로 지정. 해당 파일은 새 파일로 커밋에 포함해야 한다.
- README에 최초 설치, 웹 별도 설치, 검증한 도구 버전, 평문 Controller/IPC 경계와 과거 검증 날짜 명시.

별도 새 클론 `/tmp/midnight-applied-20260909`에 현재 tracked diff와 새 웹 플러그인 소스를 적용했다. 기존 설치/빌드/계약 생성물은 복사하지 않았다. 같은 macOS arm64 환경에서 다음이 모두 종료 코드 0으로 완료됐다.

| 명령 | 결과 |
|---|---|
| `compact update 0.31.1 --no-set-default` | 버전 준비 확인 |
| `npm run bootstrap` | 설치, 5개 회로 컴파일, 자산 복사, 빌드 통과 |
| `npm run typecheck` | 통과 |
| `npm test` | 43/43 통과 |
| 웹 `npm ci` 및 `npm test` | 설치, 빌드, 8/8 통과 |
| `git diff --check` | 통과 |

로그는 `/tmp/midnight-applied-bootstrap.log`, `/tmp/midnight-applied-typecheck.log`, `/tmp/midnight-applied-test.log`, `/tmp/midnight-applied-web-test.log`에 있다. 변경은 미커밋 상태이며, 원격 저장소에는 아직 반영되지 않았다. 의존성 보안 업데이트, 실제 AI 호출 및 Docker 기반 정산 재검증은 남아 있다.

## 검증 범위

2026-09-10 커밋 준비 시 협상 로직의 별도 미커밋 변경을 제외하고 실행 재현성 수정만 새 클론 `/tmp/midnight-commit-20260910`에서 재검증했다. 이 커밋 대상은 `npm run bootstrap`, 루트 테스트 36/36, 웹 설치·빌드·테스트 8/8을 통과했다. 위 43개 결과는 당시 작업 폴더의 별도 협상 로직 변경까지 포함한 결과이므로 커밋 대상의 테스트 수와 구분한다.

- 기준 커밋: `15149ee03293e7d85cc5d84cfafff8f4469ccf88`
- 환경: macOS arm64, Node `24.14.1`, npm `11.11.0`, Compact CLI `0.5.1`, compiler `0.31.1`
- 커밋본: 로컬 저장소에서 `git clone --no-local`로 별도 클론
- 현재 수정본: 별도 클론에 작업 시작 시점의 `git diff --binary HEAD` 적용
- 기존 node_modules, dist, managed, 지갑 데이터, API 키 파일은 복사하지 않음
- 공개 GitHub 원격을 새로 클론한 검증이나 다른 OS/Node 버전 검증은 아님
- 원본의 기존 미커밋 변경은 유지했다. 아래 원인 확인용 변경은 임시 클론에서만 수행했다.

## 본사 리뷰 5개 항목

| 항목 | 상태 | 근거와 남은 작업 |
|---|---|---|
| 계약 runtime 0.15.0 → 0.16.0 | 해결 | compiler 0.31.1 생성물과 runtime 0.16.0 조합으로 계약 테스트 및 로컬 정산 통과. |
| 새 클론 bootstrap | 해결 | 컴파일 → 자산 복사 → TypeScript 빌드 순서를 고정하고 새 클론에서 검증. |
| README 프라이버시 경계 | 해결 | 로컬 WebSocket·역할 IPC의 평문 신뢰 경계와 GPT·Relay·Ledger 비전달 범위를 구분해 명시. |
| 실제 OpenAI 모델 검증 | 완료 | 2026-09-11 `gpt-5.6-sol` 31회 요청, 모델 선택 5회, 합의 2건 `SETTLED`; privacy audit 통과. |
| 실제 deploy → settle | 완료 | 2026-09-11 로컬 Node·Indexer·proof server에서 `OPEN → AUTHORIZED → SETTLED` 확인. |

## 새 클론에서 확인한 실패

### 계약 생성물과 빌드 순서

루트 `npm ci`는 두 클론 모두 성공했다. `npm test`는 `src/managed/negotiation/contract/index.js`가 없어 실패했다. compiler 0.31.1로 5개 회로를 컴파일한 뒤에도 adapter의 `withWitnesses` 등에서 타입이 `never`로 추론돼 실패했다.

루트 build는 `tsc -b` 이후에 계약 자산을 복사한다. 계약의 dist/index.d.ts가 참조하는 dist/managed가 먼저 존재해야 downstream adapter가 계약 타입을 읽을 수 있다. 자산을 먼저 복사하면 기존 의존성 설정 그대로 전체 테스트 43/43이 통과했다.

`compact-js@2.5.0`의 runtime 0.15.0과 계약의 runtime 0.16.0이 함께 설치된다. 이 혼용만으로 타입 실패 원인이라고 판단하지 않는다. runtime override 실험은 원복했으며, 강제 통일을 수정안으로 채택하지 않았다. 실제 체인 SDK 호환성은 별도 실행으로 검증해야 한다.

현재 수정본에 대해 확인한 준비 순서:

```bash
npm ci
compact compile +0.31.1 --version
npm run contract:compile
npm run sync-assets --workspace @midnight-negotiation/negotiation-contract
npm run typecheck
npm test
```

현재 contract:compile 스크립트는 compiler 버전을 고정하지 않는다. 위 검증은 활성 compiler가 0.31.1인 환경에서 수행했다. 재현성을 위해 스크립트의 명시적 버전 지정과 CLI 설치 안내가 필요하다.

### 웹의 필수 소스가 Git에서 제외됨

`apps/demo-web/vite.config.ts`가 `./build/sites-vite-plugin`을 import하지만 루트 `.gitignore`의 `build/` 규칙으로 `apps/demo-web/build/sites-vite-plugin.ts`가 제외된다. `npm ci`는 성공해도 `npm test`는 해당 import를 찾지 못해 빌드에서 실패한다.

원본에 있던 해당 파일 하나를 검증 클론에 복사하자 웹 빌드 및 테스트 8/8이 통과했다. 소스를 Git 추적 대상에 포함하거나 생성물 폴더와 분리해야 한다. 루트 workspace는 packages/*만 포함하므로 웹의 별도 npm ci도 README에 명시해야 한다.

## 추가 의존성 점검

2026-09-09 npm audit 결과는 루트 high 1건(ws), 웹 24건(low 1, moderate 6, high 16, critical 1)이었다. 2026-09-11 보안 패치 적용 뒤 루트는 0건, 웹은 high 2건과 moderate 4건이다. 웹의 잔여 항목은 Vinext와 Drizzle 개발 도구 경로에 있으며, 현재 버전 범위에서 강제 업데이트 없이 제거할 수 없다.

## 반영한 수정 순서

1. 계약 컴파일 버전과 bootstrap 명령을 고정하고, build에서 계약 자산 복사를 tsc 이전으로 이동한다.
2. 웹 빌드 플러그인을 Git 추적 대상으로 포함한다.
3. README에 최초 설치, 웹 별도 설치, 확인한 버전, 로컬 평문 신뢰 경계를 반영한다.
4. 변경을 담은 새 클론에서 같은 검증을 다시 수행한다.
5. Docker 복구 후 실제 체인 정산과 실제 AI 응답을 각각 검증한다.

## 로그 위치

이번 실행의 상세 로그는 로컬 `/tmp/midnight-*.log`에 남겼다. 주요 파일은 다음과 같다.

- `/tmp/midnight-head-contract-tests.log`: 커밋본 version mismatch
- `/tmp/midnight-working-cold-test.log`: 최초 managed 누락
- `/tmp/midnight-working-test.log`: 자산 복사 전 adapter 타입 실패
- `/tmp/midnight-final-test.log`: 원래 의존성 복구 후 43/43 통과
- `/tmp/midnight-web-test.log`: 웹 플러그인 누락
- `/tmp/midnight-web-restored-test.log`: 플러그인 복원 후 8/8 통과

임시 경로는 영구 보관을 보장하지 않는다. 이 문서의 결과 표가 검증 요약이다.

## 2026-09-11 후속 검증

- `npm run test:openai`: `gpt-5.6-sol` API 요청 31회, 실제 모델 선택 5회.
- 겹치는 한도 2개 시나리오는 각각 `SETTLED`, 비중첩 시나리오는 10라운드 뒤 `CANCELLED`.
- OpenAI 요청에 허용된 공개 입력만 포함되고 `store: false`인지 검사하는 privacy audit 통과.
- 루트 `ws`를 `8.21.3`으로 올린 임시 클론에서 npm audit 0건, 전체 테스트 43/43 통과.
- 웹의 Next, React, Cloudflare, Vite, Wrangler 계열을 보안 패치 버전으로 올린 임시 클론에서 critical 0건, 웹 테스트 8/8 통과. Vinext와 개발 도구 경로의 high 2건, moderate 4건은 메이저 변경 없이는 해결되지 않아 남겨 두었다.
- Docker Desktop의 오래된 backend 프로세스를 종료하고 엔진을 다시 시작한 뒤, 기존 임시 devnet 컨테이너를 내리고 새로 생성했다.
- mock 협상 provider와 로컬 Midnight Node·Indexer·proof server로 구매자·판매자 흐름을 실행해 Observer의 `OPEN → AUTHORIZED → SETTLED`를 확인했다.

## 2026-09-17 B2B 제출 구현 및 중단 시점 기록

- 협상 전략 `005e6da`, 제3자 정산 거절 테스트 `cdc418b`, B2B 화면 문구 `85cc890`, 제출 문서와 포트 설정 `fdde745`를 `main`에 커밋하고 `origin/main`에 푸시했다.
- `npm test`: 44/44 통과. `npm --prefix apps/demo-web test`: 빌드 및 8/8 통과. 계약 집중 테스트 `node --test packages/negotiation-contract/test/contract.test.mjs`: 5/5 통과. 제3자 Seller 비밀키 정산 시도는 거절되고 계약 상태 `AUTHORIZED`, `finalPrice` `0n`을 유지한다.
- 기존 `private-match` 컨테이너가 기본 포트 `9944`를 사용해 최초 `npm run midnight:up`은 바인딩 오류로 종료됐다. 이 컨테이너는 중단하지 않았다. 이후 `MIDNIGHT_NODE_HOST_PORT=9945 MIDNIGHT_INDEXER_HOST_PORT=8089 npm run midnight:up`으로 이 프로젝트의 Node·Indexer·proof server를 정상 기동했고, Controller의 `MIDNIGHT_NODE`, `MIDNIGHT_INDEXER`, `MIDNIGHT_INDEXER_WS`를 대응 포트로 설정했다.
- 실제 로컬 체인과 브라우저에서 상품 코드 `4821`, 공개 기준가격 `100000000`, Buyer 한도 `110000000`, Seller 한도 `95000000`을 입력했다. Observer에 `OPEN → AUTHORIZED → SETTLED`가 순서대로 표시됐고 `SETTLED`에서 최종 가격 `100,000,000 KRW`가 처음 공개됐다.
- 같은 브라우저에서 초기화한 뒤 Buyer `90000000`, Seller `95000000`을 입력했다. Observer에 `OPEN → CANCELLED`가 표시됐고 `CANCELLED · 공개된 금액 없음`으로 종료됐다. 이 실행의 화면에는 `AUTHORIZED`, `SETTLED`, 최종 가격이 나타나지 않았다.
- 확인 뒤 이번 프로젝트의 웹·Controller 프로세스를 종료하고 `npm run midnight:down`으로 `negotiation-v2-*` 컨테이너와 Compose 네트워크만 내렸다.
- 당시 미실행이었던 항목: 푸시된 최종 커밋을 공개 원격에서 새로 클론해 `bootstrap`, 루트 테스트, 웹 `npm ci`·테스트를 재실행하는 검증. 임시 디렉터리만 생성했고 클론은 시작하지 않았다. 공개 테스트넷 배포, 호스팅된 라이브 URL, 이번 변경에 대한 실제 OpenAI API 평가도 확인하지 않았다. 사용자 요청에 따라 이 지점에서 작업을 중단했다. 이 중 새 클론 검증은 아래 2026-09-17 항목에서 완료했다.

## 2026-09-17 공개 원격 새 클론 검증

위에서 미실행으로 남았던 새 클론 검증을 실행했다. 공개 원격 `https://github.com/0xyuanyx/Midnight-Private-Negotiation.git`을 임시 디렉터리에 `--depth 1`로 새로 클론했고, 클론된 `HEAD`는 `4d95515ddab6b4b43e614bead084a7fc2e23a525`(`docs: record submission rehearsal and remaining verification`)이다.

환경은 macOS arm64, Node `v24.14.1`, npm `11.11.0`, Compact CLI `0.5.1`, compiler `0.31.1`이다. 기존 작업 폴더의 `node_modules`, `dist`, `managed`, Docker 데이터, 미커밋 파일을 복사하지 않았고, `OPENAI_API_KEY`·`MEMO_OPENAI_API_KEY`·`NEGOTIATION_*` 환경 변수를 검증 셸에서 명시적으로 해제한 뒤 실행했다.

| 명령 | 결과 |
|---|---|
| `git clone --depth 1` | 통과 (2초) |
| `compact compile +0.31.1 --version` | 통과 |
| `npm run bootstrap` | 통과 (37초) |
| `npm run typecheck` | 통과 |
| `npm test` | 44/44 통과 (15.6초) |
| `npm --prefix apps/demo-web ci` | 통과 (21초) |
| `npm --prefix apps/demo-web test` | 8/8 통과 |

루트 44개에는 `rejects third-party settlement and leaves the authorized ledger unchanged`와 `skips proof and settlement states when private limits do not overlap`이 포함된다.

**이 검증에 포함되지 않은 것:** 새 클론에서 Docker 로컬 체인을 다시 기동한 실행, 공개 테스트넷·메인넷 배포, 호스팅된 라이브 URL, 이번 변경에 대한 실제 OpenAI API 협상 평가. 로컬 체인 성공·결렬 시연은 같은 날 원본 작업 폴더에서 확인한 위 항목이 근거이며 새 클론에서 재현하지 않았다.

별도로 OpenAI provider 배선을 실제 API 1회 호출로 확인했다. `gpt-5.6-sol`이 strict Structured Outputs로 후보 5개를 반환했고 모두 250 KRW 단위와 Buyer StrategyGuard를 통과했다. 요청 본문에는 `role`, `productCode`, `round`, `publicReferencePrice`만 포함됐고 `store`는 `false`였다. 이는 배선 확인이며 2026-09-11의 31회 협상 평가를 대체하지 않는다.

## 2026-09-18 보안 감사와 수정

Claude Code의 midnight-expert 플러그인으로 계약을 감사하고, 발견한 문제를 `fix/seller-slot-binding` 브랜치에서 수정했다.

### 감사에서 확인한 문제

- **H-1 Seller 자리 탈취 (실행으로 확인):** `joinDeal`에 호출자 검사가 없었다. 공격자 비밀키로 먼저 `joinDeal`을 호출하면 성공했고, 정상 Seller의 `joinDeal`은 `deal is not waiting for seller`로 실패했으며, 공격자가 `cancelAsSeller`로 거래를 취소할 수 있었다. midnight-verify witness-verifier가 실제 계약과 witness로 PoC를 실행해 확인했다.
- **M-1 합의가 미대조:** Seller runtime이 Buyer가 여는 가격을 합의 가격과 비교하지 않고 바로 정산했다. 계약은 한도만 검사한다.
- **L-1:** 생성자에서만 쓰는 필드가 `sealed`가 아니었다.

### 수정

- 계약 생성자가 Seller 공개키를 받아 `sellerKey`로 고정하고, `joinDeal`이 `publicKey(sellerSecretKey()) == sellerKey`를 검사한다. `dealId`, `buyerKey`, `sellerKey`, `buyerCommitment`를 `export sealed ledger`로 선언했다.
- Seller가 암호화 relay로 `seller_key`를 보내고, Buyer는 그 키를 받은 뒤 한 번만 배포한다.
- Seller는 합의한 가격을 기록하고, 다른 가격이 열리면 정산하지 않고 `cancelAsSeller`로 취소한다. 합의 후에는 추가 협상 메시지를 거부한다. Controller가 Seller의 `CANCELLED` 보고를 받도록 했다.
- 기존 경쟁 조건: `tryJoinOnChain`이 두 경로에서 동시에 실행돼 `joinDeal`이 두 번 호출될 수 있었다. 시작 플래그로 막았다. 배포와 참여는 대기 중 세션이 바뀌면 공유 상태를 바꾸지 않고 멈춘다.
- 기존 버그: 지갑 초기화 실패가 처리되지 않은 promise 거절로 runtime 프로세스를 종료시켰다. 로컬 체인 실행 중 Seller runtime이 이 경로로 종료되는 것을 관측했다. 이제 프로세스는 유지되고 화면에 `Midnight 거래를 완료하지 못했습니다.`가 표시된다.

### 노드 오류 138의 원인과 수정

로컬 체인에서 Seller 지갑의 DUST 등록이 간헐적으로 `1010: Invalid Transaction: Custom error: 138`로 거절됐다. midnight-status-codes 조회 결과 138은 `BalanceCheckOverspend`다.

- genesis 지갑의 DUST는 `1.249 × 10^24`로 충분해 funder 원인은 배제했다.
- 격리 실험에서 등록 직후 runtime 지갑의 DUST는 `3.06 × 10^18`으로 수수료 오버헤드보다 충분히 컸다.
- midnight-verify source-investigator가 wallet-sdk-facade·dust-wallet 3.0.0(`midnight-wallet@a1da646`)과 ledger-v8 소스를 확인했다. 등록 수수료는 등록하는 NIGHT UTXO가 생성 후 만든 DUST(`generatedNow`)로 지불되고, 이 값은 UTXO 생성 시각부터의 경과 시간에 비례한다. 반면 수수료에는 이 프로젝트의 `additionalFeeOverhead` `3 × 10^14`가 항상 더해진다. 방금 받은 UTXO로 즉시 등록하면 부족해진다. Seller는 funder의 두 번째 이체를 받으므로 가장 자주 영향을 받는다.
- 같은 조사에서 거절된 등록 트랜잭션은 코인을 사용 중으로 표시하지 않아 재시도 시 같은 코인이 다시 보인다는 것도 확인했다.
- 수정: 등록이 138로 거절되면 5초 뒤 최대 6회 재시도한다. 138이 아닌 오류는 재시도하지 않는다. wallet SDK의 Effect `FiberFailure`는 원인을 `.cause`가 아닌 Symbol 속성에 담아서, 오류 구조 전체를 검사하도록 구현하고 로컬 테스트로 확인했다.
- 재현 실험 2회에서는 138이 다시 나오지 않았다. 최종 로컬 체인 실행에서도 138이 발생하지 않아 재시도 경로 자체는 실제 체인에서 실행되지 않았다.

### 검증

- midnight-verify witness-verifier: 수정된 계약을 실제로 실행해 제3자 `joinDeal`·`cancelAsSeller` 거절, 정상 흐름 `SETTLED` 100000, `sealed` 필드의 회로 쓰기 컴파일 거부를 확인했다. `witnesses.ts` 타입 검사와 구조 검사를 통과했다.
- compact-core security-reviewer 재검토 2회: 1차에서 새 Critical·High 없음, Medium 1건(재입장 시 Seller 키 미전송)과 Low 4건. 2차(최종)에서 Critical·High·Medium 없음, Low 2건과 제안 2건. 최종 검토 뒤 다음을 추가로 반영했다.
  - Buyer가 같은 Seller 키의 재전송은 무시하고, 다른 키만 거부한다.
  - Seller의 정산이 실패하면 온체인에서 취소한다.
  - `AUTHORIZED` 뒤 Seller가 취소하면 Controller가 "기록 중" 진행 행을 같은 교체 키로 끝내고 보관한 합의 금액을 지운다.
  - DUST 등록 후 잔액 대기에 180초 제한을 둔다.
- `npm test` 46/46, `npm --prefix apps/demo-web test` 8/8, 계약 테스트 7/7 통과.
- 로컬 체인(Node 9945, Indexer 8089, proof server 6301·6302, mock 협상, 공개 기준가격 100000000):
  - 성공, Buyer 한도 먼저 입력: Buyer `110000000` / Seller `95000000` → `OPEN 14:07:58 → AUTHORIZED 14:09:09 → SETTLED 14:10:03 · 100,000,000 KRW`
  - 성공, Seller 한도 먼저 입력: `OPEN 14:28:13 → AUTHORIZED 14:28:51 → SETTLED 14:29:32 · 100,000,000 KRW`
  - 결렬, Buyer 한도 먼저 입력: Buyer `90000000` / Seller `95000000` → `OPEN 14:32:46 → CANCELLED 14:33:26 · 공개된 금액 없음`
  - 최종 코드로 다시 실행한 성공(Buyer 먼저): `OPEN 14:41:14 → AUTHORIZED 14:42:24 → SETTLED 14:42:56 · 100,000,000 KRW`
  - 최종 코드로 다시 실행한 결렬(Seller 먼저): `OPEN 14:45:57 → CANCELLED 14:46:29 · 공개된 금액 없음`
  - 모든 실행에서 상대 한도가 다른 패널에 표시되지 않았고, Observer에도 한도가 표시되지 않았다.
  - 한 번은 테스트를 조작하던 중 실수로 두 한도에 모두 `4821`을 입력했다. 제품 결함이 아니므로 결과에서 제외했다.
- 새 동작: 배포 시 Seller가 고정되므로 정상 Seller는 참여 전(`WAITING_SELLER`)에도 취소할 수 있다. 계약 테스트로 고정했다.

### 남은 한계

- relay를 통한 X25519 교환은 인증되지 않는다. relay 운영자는 키를 바꿔치기할 수 있다. relay는 Controller의 신뢰 경계 안에 있고 이전 설계부터 같은 경계였다.
- 138 재시도 경로는 소스 근거와 로컬 테스트로만 확인했고 실제 체인에서 발동한 적은 없다.
- 이 수정 이후의 새 클론 검증은 아직 실행하지 않았다.

## 2026-09-18 보안 수정 커밋의 새 클론 검증

공개 원격 `main`을 임시 디렉터리에 새로 클론했고 `HEAD`는 `999c1af43923d8ccba01a5136af1cccb927c49b3`이다. 환경과 제외 조건은 2026-09-17 새 클론 검증과 같다. API 키 환경 변수를 해제했고, 로컬 생성물을 재사용하지 않았다.

| 명령 | 결과 |
|---|---|
| `git clone --depth 1` | 통과 (3초) |
| `compact compile +0.31.1 --version` | 통과 |
| `npm run bootstrap` | 통과 (125초) |
| `npm run typecheck` | 통과 |
| `npm test` | 46/46 통과 |
| `npm --prefix apps/demo-web ci` | 통과 (36초) |
| `npm --prefix apps/demo-web test` | 8/8 통과 |

### 이후 추가한 것

- `scripts/check-toolchain.mjs`: `bootstrap`과 `contract:compile`이 시작 전에 Node 버전, Compact CLI, compiler `0.31.1` 설치 여부를 점검한다. 빈 `COMPACT_DIRECTORY`(compiler 없음)와 `compact`가 없는 `PATH`에서 각각 설치 명령을 안내하고 종료 코드 1로 멈추는 것을 확인했다. 이전에는 compiler가 없으면 npm 오류 출력 속에 `Couldn't find compiler for aarch64-darwin (0.31.1)` 한 줄만 남았다.
- 계약 테스트 추가: 제3자의 `authorizeHiddenPrice`, `cancelAsBuyer`, `cancelAsSeller`가 거절되고 ledger가 `OPEN`, `finalPrice 0`으로 유지된다. 계약 테스트 8/8, 루트 테스트 47/47 통과.

## 2026-09-18 체인 모드 표시 순서 수정

제출 영상을 만들려고 녹화한 프레임을 확인하던 중, 체인 모드에서 화면이 실제 상태보다 앞서 나가는 것을 발견했다. 비중첩 시연에서 Buyer·Seller 패널은 21:40:56에 "판매자 가격 커밋이 등록되었습니다"와 "협상을 시작합니다"를, 21:40:57부터 "AI 에이전트가 비공개 협상을 진행하고 있습니다"를 표시했다. 그런데 Observer가 체인에서 `OPEN`을 확인한 시각은 21:43:43이었다. 약 3분 동안 계약 배포와 참여가 진행 중인데도 등록·협상 중으로 보였다. 성공 시연도 21:36:00과 21:38:09로 같은 차이가 있었다. 실제 협상 시작(`START_RUNTIME`)은 이전부터 `OPEN` 이후로 막혀 있었으므로, 틀린 것은 표시뿐이었다.

Controller는 두 역할의 오프체인 commitment가 준비되는 즉시 상대 커밋 등록 알림과 협상 시작 문구를 보냈다. 이제 체인 모드에서는 Observer가 `OPEN`을 확인한 뒤에만 이 문구를 보내고, 시각도 Observer의 확인 시각을 쓴다. 그 전까지는 "상대 가격 커밋 등록을 기다리고 있습니다" 행의 스피너가 계속 돈다. mock(비체인) 모드의 동작은 바꾸지 않았다. 루트 테스트 47/47, 웹 테스트 8/8 통과. 수정 후 로컬 체인에서 다시 녹화한 화면 텍스트로 확인했다. 성공 시연에서는 상대 커밋 등록 문구와 Observer `OPEN`이 모두 22:05:18, 비중첩 시연에서는 모두 22:10:40에 처음 나타났다. 두 시연은 각각 `SETTLED · 100,000,000 KRW`와 `CANCELLED · 공개된 금액 없음`으로 끝났다.

## 2026-09-18 README·제출 양식 Midnight 주장 fact-check

midnight-fact-check fast-check로 README와 제출 양식 초안에서 Midnight·Compact·SDK·계약·프라이버시 관련 주장 18개를 뽑아 소스로 검증했다. 확인 17, 반박 1, 판단 보류 0. 표준 절차와 달리 관련 주장을 묶어 source-investigator 5개로 검증했다. 계약 동작은 같은 날 실행 기반 PoC와 계약 테스트로도 확인했다.

- 반박 1건: 상태 흐름을 `OPEN → AUTHORIZED → SETTLED`로만 적어 초기 상태 `WAITING_SELLER`가 빠져 있었다. README에 초기 상태와 `CANCELLED` 조건을 추가했다.
- 표현 수정 2건:
  - 합의가 대조는 계약이 아니라 **Seller 런타임의 오프체인 검사**임을 명시했다. 계약은 연 가격이 Buyer commitment와 같고 Seller 최저가 이상인지만 검사한다.
  - `finalPrice`는 언제든 읽을 수 있는 공개 필드이며 `settle` 전까지 0이라고 고쳤다.
- 확인한 근거 중 언어 의미론은 Compact 저장소에서 찾았다. `assert` 실패는 회로를 중단하고 회로 안에서 제약된다(`doc/compact-reference.mdx`). `disclose()`는 개발자의 공개 선언이다(`doc/explicit-disclosure.mdx`). `sealed` 필드는 exported circuit에서 쓸 수 없다(`compiler/analysis-passes/check-sealed-fields.ss`).
- 보고서: `~/.midnight-expert/fact-checker/09-26/fast-run-negotiation-readme-dgHL/report.md`

## 2026-09-19 최종 커밋 새 클론 검증

공개 원격 `main`을 새로 클론했고 `HEAD`는 `beef1d975d280316bb0802d9125e4709c5ccb15e`이다. 조건은 이전 새 클론 검증과 같다.

| 명령 | 결과 |
|---|---|
| `git clone --depth 1` | 통과 |
| `compact compile +0.31.1 --version` | 통과 |
| `npm run bootstrap` (도구 점검 포함) | 통과 (50초) |
| `npm run typecheck` | 통과 |
| `npm test` | 47/47 통과 |
| `npm --prefix apps/demo-web ci` | 통과 |
| `npm --prefix apps/demo-web test` | 8/8 통과 |
