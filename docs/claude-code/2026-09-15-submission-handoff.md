# Claude Code 제출 작업 인계

상태: 2026-09-17 제출 구현을 반영한 이력 문서. 최신 실행·검증 결과는 `README.md`와 `docs/2026-09-09-review-reproducibility.md`를 확인한다. 이 계획을 처음부터 다시 실행하지 않는다.

## 후속 검토 프롬프트

아래 내용을 Claude Code에서 이 저장소 루트에 붙여 넣는다.

```text
Read CLAUDE.md, PROJECT_DIRECTION.md, docs/superpowers/specs/2026-09-15-b2b-private-quotation-submission-design.md, and docs/superpowers/plans/2026-09-15-b2b-private-quotation-submission.md before changing code.

Review the implemented submission against the design and verification record. Preserve unrelated working-tree changes. Do not build independent Buyer/Seller clients, auctions, payments, escrow, logistics, multiple products, or a new AI provider without a new user decision. Keep the one-screen presentation console and its documented local Controller trust boundary. Do not claim the platform cannot see limits; the Demo Controller receives them transiently in the local demo boundary. Propose only evidence-backed corrections and run relevant tests before committing.
```

## 읽는 순서

1. `CLAUDE.md`
2. `PROJECT_DIRECTION.md`
3. 설계 문서
4. 구현 계획
5. 현재 `git status --short`와 `git diff`

협상 전략과 계약 테스트는 2026-09-17에 별도 커밋으로 정리했다. 이후 작업자는 먼저 `git status --short`와 최신 커밋을 확인하고, 관련 없는 변경을 스테이징하거나 되돌리지 않는다.

## 발표용 실행 명령

성공 흐름은 API 비용이 없는 mock provider로 우선 확인한다.

```bash
npm run midnight:up
NEGOTIATION_REFERENCE_PRICE_KRW=100000000 npm run demo:midnight:mock
```

다른 터미널에서 웹을 실행한다.

```bash
npm --prefix apps/demo-web run dev -- --port 3001
```

브라우저에서 `http://localhost:3001`을 열고 Buyer와 Seller 모두 상품 코드 `4821`을 입력한다.

- 성공: Buyer `110000000`, Seller `95000000`
- 결렬: 초기화 후 Buyer `90000000`, Seller `95000000`

검증 후 컨테이너를 내린다.

```bash
npm run midnight:down
```

실제 OpenAI를 시연할 때만 `NEGOTIATION_AI_PROVIDER=openai`와 API 키를 사용한다. 비공개 한도는 OpenAI 요청에 넣지 않는다.

## 제출 전 주장 점검

- 말할 수 있음: 상대방·AI·Relay·공개 원장에는 예약 가격을 전달하지 않는다.
- 말할 수 있음: 성립 뒤 최종 합의 가격만 공개한다.
- 말할 수 있음: 다른 secret key로 Seller 정산 witness를 만들면 계약이 거절한다.
- 말하면 안 됨: 플랫폼 전체가 예약 가격을 보지 못한다.
- 말하면 안 됨: 실제 고객 검증이나 실제 B2B 운영을 마쳤다.
- 말하면 안 됨: 최종 계약가도 비공개다.
