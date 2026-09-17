# Natural Negotiation Price Granularity Implementation Plan

Status: Implemented in commit `005e6da` on 2026-09-17. The checklist below is the original work plan, not an open task list.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every newly generated negotiation offer use a natural 250 KRW increment while keeping private limits out of AI requests.

**Architecture:** `agent-core` owns one exported price-increment rule used by AI output validation, deterministic Mock generation, and local fallback generation. Prompt instructions request natural non-1,000 KRW candidates, but local validation remains authoritative. Existing Buyer and Seller runtimes continue to use `generateAllowedCandidate` and `PolicyGuard` without receiving new private data.

**Tech Stack:** TypeScript 5.9, Node.js test runner, OpenAI Responses API structured output

## Global Constraints

- Every new `offer` must be a positive integer divisible by 250 KRW.
- `accept` must preserve the already validated current public offer exactly.
- Buyer maximum price and Seller minimum price must never enter an AI request.
- Invalid candidates must be discarded without Relay transmission or user-visible logs.
- Exact final prices must not be hardcoded.

---

### Task 1: Enforce the 250 KRW offer increment

**Files:**
- Modify: `packages/agent-core/src/index.ts`
- Test: `packages/agent-core/test/agent-core.test.mjs`

**Interfaces:**
- Produces: `PRICE_INCREMENT_KRW: bigint`
- Produces: `isOfferPriceIncrementValid(price: string): boolean`
- Consumes: existing `parsePrice`, `validateCandidates`, and `policyAllows`

- [ ] **Step 1: Write failing validation tests**

Add assertions proving that `90,750` is accepted and `90,700` and `90,713` are rejected as `offer` candidates, while `accept` preserves a valid current offer.

```js
assert.equal(isOfferPriceIncrementValid("90750"), true);
assert.equal(isOfferPriceIncrementValid("90700"), false);
assert.equal(isOfferPriceIncrementValid("90713"), false);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm run build
node --test packages/agent-core/test/agent-core.test.mjs
```

Expected: FAIL because `isOfferPriceIncrementValid` is not exported.

- [ ] **Step 3: Implement the shared increment validator**

Add:

```ts
export const PRICE_INCREMENT_KRW = 250n;

export const isOfferPriceIncrementValid = (rawPrice: string): boolean => {
  const price = parsePrice(rawPrice);
  return price !== undefined && price % PRICE_INCREMENT_KRW === 0n;
};
```

Apply it to `offer` validation before PolicyGuard selection. Keep `accept` tied exactly to `currentOffer.price`.

- [ ] **Step 4: Run the focused test**

Run:

```bash
npm run build
node --test packages/agent-core/test/agent-core.test.mjs
```

Expected: PASS.

### Task 2: Generate natural 250 KRW AI, Mock, and fallback offers

**Files:**
- Modify: `packages/agent-core/src/index.ts`
- Test: `packages/agent-core/test/agent-core.test.mjs`
- Test: `packages/agent-core/test/openai-eval.test.mjs`

**Interfaces:**
- Consumes: `PRICE_INCREMENT_KRW` and `isOfferPriceIncrementValid`
- Produces: `roundDownToPriceIncrement(price: bigint): bigint`
- Preserves: `createNegotiationModelRequest(context)` public-field contract

- [ ] **Step 1: Write failing generation tests**

Add tests asserting:

```js
assert.match(instructions, /250 KRW/);
assert.match(instructions, /1,000원 단위에만/);
assert.equal(mockOffers.every(({ price }) => BigInt(price) % 250n === 0n), true);
assert.equal(fallback.price, "96250");
```

The fallback expectation uses a Buyer limit of `107000`: 90% is `96300`, rounded down to `96250`.

- [ ] **Step 2: Verify the focused tests fail**

Run:

```bash
npm run build
node --test packages/agent-core/test/agent-core.test.mjs packages/agent-core/test/openai-eval.test.mjs
```

Expected: FAIL because prompt and generated fallback prices do not yet enforce the new rule.

- [ ] **Step 3: Update prompt and generators**

Add:

```ts
const roundDownToPriceIncrement = (price: bigint): bigint =>
  (price / PRICE_INCREMENT_KRW) * PRICE_INCREMENT_KRW;

const roundUpToPriceIncrement = (price: bigint): bigint => {
  const remainder = price % PRICE_INCREMENT_KRW;
  return remainder === 0n ? price : price + PRICE_INCREMENT_KRW - remainder;
};
```

Update AI instructions to require 250 KRW increments and prefer natural candidates such as `90750`, `93250`, and `96500` instead of always using exact 1,000 KRW multiples. Round Mock offers to the shared increment. Round Buyer fallback offers down so they cannot exceed the maximum price, and Seller fallback offers up so they cannot fall below the minimum price. Do not alter `accept`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm run build
node --test packages/agent-core/test/agent-core.test.mjs packages/agent-core/test/openai-eval.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run the complete regression suite**

Run:

```bash
npm test
```

Expected: 0 failures across agent, protocol, contract, Relay, and Controller tests.

- [ ] **Step 6: Verify live services**

Restart `npm run demo:midnight`, then verify:

```bash
curl -fsS http://localhost:3001/ >/dev/null
```

Expected: web returns HTTP 200 and Controller listens on `ws://127.0.0.1:8787`.
