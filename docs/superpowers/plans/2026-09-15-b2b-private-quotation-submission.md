# B2B 비공개 견적 협상 제출 구현 계획

상태: 2026-09-17 구현 반영. 아래 체크리스트는 당시 작업 순서의 기록이며, 최신 검증 결과는 `README.md`와 `docs/2026-09-09-review-reproducibility.md`가 기준이다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GPU 서버 10대의 비공개 B2B 견적 협상 시나리오로 기존 DApp의 제출 메시지와 데모를 정리하고, 성공·결렬·무단 정산 거절을 재현 가능하게 만든다.

**Architecture:** 기존 Buyer·Seller·Observer 3패널 콘솔과 로컬 Demo Controller를 유지한다. `agent-core`의 로컬 가격 전략은 AI 후보를 제한하고, Compact 계약은 Buyer·Seller secret key 및 commitment로 `authorizeHiddenPrice`와 `settle`을 제한한다. 화면에는 정적 B2B 공개 맥락만 추가하고, 한도·중간 제안·guard 판단은 계속 표시하지 않는다.

**Tech Stack:** TypeScript 5.9, Compact compiler 0.31.1, Midnight local Devnet, Node.js test runner, Vinext/React

**Spec:** `docs/superpowers/specs/2026-09-15-b2b-private-quotation-submission-design.md`

## Global Constraints

- Buyer·Seller·Observer가 함께 보이는 한 화면 콘솔을 유지한다.
- Buyer와 Seller를 실제 독립 브라우저·원격 클라이언트로 분리하지 않는다.
- 현재 로컬 Demo Controller가 한도를 평문으로 역할 런타임에 전달한다는 신뢰 경계를 바꾸거나 숨기지 않는다.
- 예약 가격은 상대방·AI·Relay·공개 원장에 전달하지 않는다고만 주장한다.
- 최종 합의 가격은 `SETTLED` 뒤에 공개한다. 최종 가격 비공개를 주장하지 않는다.
- 새 제안은 250 KRW 단위를 유지한다. `accept`는 이미 검증된 상대 제안을 그대로 사용한다.
- 새 카드, KPI, 대시보드, 라운드·중간 제안·guard 판단의 화면 노출을 추가하지 않는다.
- 기존 더티 워크트리의 관련 없는 변경을 되돌리거나 커밋에 섞지 않는다.

---

### Task 1: 미커밋 협상 전략을 검증하고 독립 커밋으로 정리

**Files:**
- Modify: `packages/agent-core/src/index.ts`
- Modify: `packages/agent-core/test/agent-core.test.mjs`
- Modify: `packages/agent-core/test/openai-eval.test.mjs`
- Modify: `packages/demo-controller/src/index.ts`
- Modify: `packages/demo-controller/src/orchestrator.ts`
- Modify: `packages/demo-controller/test/ipc.test.mjs`

**Interfaces:**
- Preserves: `PRICE_INCREMENT_KRW = 250n`
- Preserves: `localTargetPrice(policy, round): bigint | undefined`
- Preserves: `strategyAllows(policy, context, candidate): boolean`
- Preserves: `LOCAL_RUNTIME_FUNDING_AMOUNT = "5000000000000"`

- [ ] **Step 1: Inspect only the intended diff**

Run:

```bash
git diff -- packages/agent-core/src/index.ts \
  packages/agent-core/test/agent-core.test.mjs \
  packages/agent-core/test/openai-eval.test.mjs \
  packages/demo-controller/src/index.ts \
  packages/demo-controller/src/orchestrator.ts \
  packages/demo-controller/test/ipc.test.mjs
```

Confirm that the diff contains only 250 KRW offer validation, Buyer/Seller round targets, StrategyGuard selection, target-price fallbacks, and the local funding constant.

- [ ] **Step 2: Run focused behavior tests**

```bash
npm run build
node --test packages/agent-core/test/agent-core.test.mjs \
  packages/agent-core/test/openai-eval.test.mjs \
  packages/demo-controller/test/ipc.test.mjs
```

Expected: zero failures. The tests must cover 250 KRW increments, a Seller rejecting a first-round floor offer, Buyer/Seller targets, overlapping settlement, non-overlap cancellation, and the local funder amount.

- [ ] **Step 3: Run the complete suite and commit only the intended changes**

```bash
npm test
git add packages/agent-core/src/index.ts \
  packages/agent-core/test/agent-core.test.mjs \
  packages/agent-core/test/openai-eval.test.mjs \
  packages/demo-controller/src/index.ts \
  packages/demo-controller/src/orchestrator.ts \
  packages/demo-controller/test/ipc.test.mjs
git commit -m "feat: balance private negotiation offers"
```

Expected: `npm test` has zero failures. Do not stage `AGENTS.md`, `CLAUDE.md`, `.omd/`, existing plan files, or unrelated files in this task.

### Task 2: Add a third-party settlement rejection regression

**Files:**
- Modify: `packages/negotiation-contract/test/contract.test.mjs`

**Interfaces:**
- Consumes: `withSellerPriceOpening(state, opening)` from `packages/negotiation-contract/src/witnesses.ts`
- Exercises: `settle()` in `packages/negotiation-contract/src/negotiation.compact`
- Proves: a secret key whose public key differs from ledger `sellerKey` cannot settle an authorized contract

- [ ] **Step 1: Add a failing third-party settlement test**

Add this test after the existing mismatched Seller-opening test:

```js
test("rejects a third party that attempts Seller settlement", () => {
  const simulation = createSimulation(scenario());
  simulation.join();
  simulation.authorize();
  assert.throws(() => simulation.settleAsThirdParty());
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.AUTHORIZED);
  assert.equal(simulation.ledger().finalPrice, 0n);
});
```

- [ ] **Step 2: Run the focused test and confirm the failure**

```bash
npm run build
node --test packages/negotiation-contract/test/contract.test.mjs
```

Expected before implementation: failure because `settleAsThirdParty` is not defined.

- [ ] **Step 3: Add the simulation helper**

Inside `createSimulation`, add `settleAsThirdParty` next to `settle`. It preserves the actual Seller's minimum price and price opening while replacing only `sellerSecretKey`.

```js
settleAsThirdParty: () => {
  const thirdPartyState = withSellerPriceOpening(
    {
      ...sellerState,
      sellerSecretKey: hexToBytes("99".repeat(32)),
    },
    {
      agreedPrice: input.price,
      priceRandomness: buyerState.priceRandomness,
    },
  );
  context.currentPrivateState = thirdPartyState;
  context = contract.impureCircuits.settle(context).context;
},
```

- [ ] **Step 4: Verify the regression and commit**

```bash
npm run build
node --test packages/negotiation-contract/test/contract.test.mjs
npm test
git add packages/negotiation-contract/test/contract.test.mjs
git commit -m "test: reject third party settlement"
```

Expected: zero failures. The test must prove the ledger remains `AUTHORIZED` with final price `0n`.

### Task 3: Apply the B2B scenario to the presentation console

**Files:**
- Modify: `DESIGN.md`
- Modify: `apps/demo-web/app/layout.tsx`
- Modify: `apps/demo-web/app/NegotiationDapp.tsx`
- Modify: `apps/demo-web/tests/rendered-html.test.mjs`

**Interfaces:**
- Preserves: `NegotiationDapp({ initialNow })`
- Preserves: Buyer and Seller four-digit product-code and private-limit prompts
- Produces: a static B2B scenario header without a new panel or public input form

- [ ] **Step 1: Write failing rendered HTML assertions**

In `server-renders the private negotiation console`, replace the old title assertions with:

```js
assert.match(html, /<title>Midnight B2B 비공개 견적 협상<\/title>/i);
assert.match(html, /GPU 서버 10대 · 비공개 B2B 견적 협상/);
```

Keep assertions for `MIDNIGHT`, `BUYER`, `SELLER`, `OBSERVER`, no pre-start prompts, and forbidden marketing copy.

- [ ] **Step 2: Verify the test is red**

```bash
npm --prefix apps/demo-web test
```

Expected: title/header assertions fail because the old text remains.

- [ ] **Step 3: Change the design rule and visible copy**

In `DESIGN.md`, change the Page Header content rule to `GPU 서버 10대 · 비공개 B2B 견적 협상`. Add one sentence saying this identifies the public presentation scenario and does not disclose a Buyer limit, Seller limit, intermediate offer, or round.

In `apps/demo-web/app/layout.tsx`, use:

```ts
export const metadata: Metadata = {
  title: "Midnight B2B 비공개 견적 협상",
  description:
    "GPU 서버 10대 견적에서 Buyer와 Seller의 예약 가격을 보호하는 Midnight 3패널 데모",
};
```

In `apps/demo-web/app/NegotiationDapp.tsx`, replace only the existing `<h1>` body with:

```tsx
<h1>GPU 서버 10대 · 비공개 B2B 견적 협상</h1>
```

Do not add reference-price, delivery, metric, or explanation cards to the page.

- [ ] **Step 4: Verify the web build and commit**

```bash
npm --prefix apps/demo-web test
git add DESIGN.md apps/demo-web/app/layout.tsx \
  apps/demo-web/app/NegotiationDapp.tsx \
  apps/demo-web/tests/rendered-html.test.mjs
git commit -m "feat: frame demo as private B2B quotation"
```

Expected: zero failures and all three panels remain in the pre-start HTML.

### Task 4: Align README and prepare the three-scene presentation script

**Files:**
- Modify: `README.md`
- Create: `docs/presentation/2026-09-15-b2b-quotation-demo-script.md`

**Interfaces:**
- Consumes: B2B header from Task 3, existing local commands in `package.json`, and contract behavior from Task 2
- Produces: one honest claim set and one reproducible demo script

- [ ] **Step 1: Add the B2B scenario and trust boundary to README**

Add these facts near the opening description:

```md
가상의 기업 구매 담당자와 GPU 서버 공급업체가 동일 규격 GPU 서버 10대의 견적을 협상한다.
공개 조건은 품목, 수량, 기준가격, 납기다.
구매자 최대 승인 한도와 판매자 최저 수용가는 상대방·AI·Relay·공개 원장에 전달하지 않는다.
로컬 Demo Controller는 데모 신뢰 경계 안에서 한도를 역할 런타임에 평문으로 전달한다.
거래가 성립하면 최종 합의 가격만 `SETTLED`에서 공개한다.
```

Do not claim independent clients, platform-wide confidentiality, customer validation, or final-price confidentiality.

- [ ] **Step 2: Add the B2B mock-demo commands**

Under local Midnight execution, add:

```bash
npm run midnight:up
NEGOTIATION_REFERENCE_PRICE_KRW=100000000 npm run demo:midnight:mock
npm --prefix apps/demo-web run dev -- --port 3001
```

Label all prices as demonstration values. Document product code `4821`, success inputs Buyer `110000000` / Seller `95000000`, and failure inputs Buyer `90000000` / Seller `95000000`.

- [ ] **Step 3: Create the presentation script**

Create `docs/presentation/2026-09-15-b2b-quotation-demo-script.md` with exactly these scenes:

1. Opening: GPU 서버 10대, public conditions, reservation-price problem.
2. Success: enter `4821`, then 110,000,000 / 95,000,000; show Observer `OPEN → AUTHORIZED → SETTLED` and final price.
3. Non-overlap: reset, enter 90,000,000 / 95,000,000; show `CANCELLED` with no amount.
4. Unauthorized settlement: show the focused Task 2 test output; explain a different Seller secret key fails and leaves the deal `AUTHORIZED`.
5. Closing: AI suggests from public inputs, local guards enforce each policy, Midnight verifies the successful deal.

Include `npm run midnight:down` after the demo. Do not use a Blue English eyebrow or marketing phrases.

- [ ] **Step 4: Verify wording and commit**

```bash
rg -n "플랫폼.*공개하지|독립.*클라이언트|최종.*비공개" README.md docs/presentation/2026-09-15-b2b-quotation-demo-script.md
npm test
npm --prefix apps/demo-web test
git add README.md docs/presentation/2026-09-15-b2b-quotation-demo-script.md
git commit -m "docs: add B2B quotation submission demo"
```

Expected: the search finds no incorrect platform, independent-client, or final-price-private claim. Both test commands have zero failures.

### Task 5: Rehearse local Devnet and verify the pushed final commit from a new clone

**Files:**
- Modify: `docs/2026-09-09-review-reproducibility.md`
- Modify: `PROJECT_DIRECTION.md` only if the final implementation changes current confirmed direction

**Interfaces:**
- Consumes: final committed source, README commands, local Docker Compose configuration, and test suites
- Produces: dated evidence limited to commands actually run

- [ ] **Step 1: Run all local regression proofs**

```bash
npm test
node --test packages/negotiation-contract/test/contract.test.mjs
npm --prefix apps/demo-web test
```

Expected: zero failures. Record actual test counts and date only after reading the output.

- [ ] **Step 2: Rehearse success and non-overlap on the local chain**

Run in separate terminals:

```bash
npm run midnight:up
NEGOTIATION_REFERENCE_PRICE_KRW=100000000 npm run demo:midnight:mock
npm --prefix apps/demo-web run dev -- --port 3001
```

Success: code `4821`, Buyer `110000000`, Seller `95000000`; require Observer `OPEN`, `AUTHORIZED`, and `SETTLED`.

Non-overlap after UI reset: code `4821`, Buyer `90000000`, Seller `95000000`; require `CANCELLED` and no displayed amount, proof, or settlement event.

- [ ] **Step 3: Stop only the local demo infrastructure**

```bash
npm run midnight:down
```

Expected: Docker Compose removes only the local Node, Indexer, and proof-server containers defined by this project.

- [ ] **Step 4: Push and verify a clean clone**

After all intended commits are pushed, use a `mktemp -d` directory and clone public `main`. In the clone run:

```bash
compact update 0.31.1 --no-set-default
compact compile +0.31.1 --version
npm run bootstrap
npm test
npm --prefix apps/demo-web ci
npm --prefix apps/demo-web test
```

Expected: every command exits 0 without reusing local `node_modules`, `dist`, `managed`, Docker data, API keys, or uncommitted files.

- [ ] **Step 5: Record only factual verification and commit**

Add date, commands, test counts, local `SETTLED`, local `CANCELLED`, and clean-clone results to `docs/2026-09-09-review-reproducibility.md`. Then run:

```bash
git add docs/2026-09-09-review-reproducibility.md PROJECT_DIRECTION.md
git commit -m "docs: record submission verification"
git push origin main
```

Before pushing, run `git status --short` and confirm that only intentionally retained user work is unstaged.

## Plan self-review

- Task 1 covers existing negotiation-quality changes.
- Task 2 covers unauthorized settlement rejection.
- Task 3 covers the B2B presentation frame.
- Task 4 covers honest documentation and the success/failure demo script.
- Task 5 covers local and clean-clone evidence.
- The plan does not add independent clients, auctions, payments, escrow, logistics, multi-product support, or AI-provider changes.
