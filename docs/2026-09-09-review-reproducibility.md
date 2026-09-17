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
- **미실행:** 푸시된 최종 커밋을 공개 원격에서 새로 클론해 `bootstrap`, 루트 테스트, 웹 `npm ci`·테스트를 재실행하는 검증. 임시 디렉터리만 생성했고 클론은 시작하지 않았다. 공개 테스트넷 배포, 호스팅된 라이브 URL, 이번 변경에 대한 실제 OpenAI API 평가는 확인하지 않았다. 사용자 요청에 따라 이 지점에서 작업을 중단했다.
