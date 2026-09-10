# 본사 리뷰 대조 및 새 클론 실행 검증

2026-09-09에 Private Negotiation의 본사 리뷰 5개 항목과 새 클론 실행을 확인했다. 초기 점검에서 발견한 bootstrap 및 웹 빌드 문제를 아래 후속 반영으로 수정했다. 실제 OpenAI 응답과 온체인 정산은 이번 검증의 통과 범위에 포함하지 않는다.

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
| 계약 runtime 0.15.0 → 0.16.0 | 현재 수정본에서 해결, 미커밋 | 커밋본은 compiler 0.31.1 생성물 로드 시 version mismatch 재현. 현재 수정본 계약 테스트 4/4 통과. package.json과 lockfile 변경을 함께 제출해야 한다. |
| 새 클론 bootstrap | 미해결 | 설치 후 바로 테스트하면 src/managed 누락. 컴파일만 추가해도 dist/managed 복사 전 adapter 타입 검사에서 실패. 컴파일 → 자산 복사 → TypeScript 빌드 순서 필요. |
| README 프라이버시 경계 | 미해결 | server.ts에서 limitKrw를 수신해 controller.setLimit으로 전달. 로컬 ws://127.0.0.1:8787 및 역할 IPC는 한도 평문을 취급하는 데모 신뢰 경계라고 명시해야 한다. GPT·Relay·Ledger 비전달 주장과 구분해야 한다. |
| 실제 OpenAI 모델 검증 | 재검증 필요 | 기본 gpt-5.6-sol과 실제 provider 기본 실행을 코드에서 확인. README의 과거 insufficient_quota 기록은 현재 API 성공 근거가 아니다. 이번에는 실제 API 호출을 수행하지 않았다. |
| 실제 deploy → settle | 재검증 필요 | README에는 과거 로컬 완료 기록이 있지만 이번 Docker 상태 조회는 Docker Desktop is unable to start로 실패했다. 실제 Indexer에서 SETTLED 확인은 별도 필요. |

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

검증 당시 npm audit 결과는 루트 high 1건(ws), 웹 24건(low 1, moderate 6, high 16, critical 1)이었다. 웹 critical 항목은 next였다. 이는 의존성 감사 결과이며 실제 제품에서의 악용 가능성을 검증한 것은 아니다. 자동 force 업데이트는 수행하지 않았다. 의존성 업데이트와 호환성 검증을 별도 작업으로 잡아야 한다.

## 다음 수정 순서

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
