# De-Butler MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, locally reproducible Midnight DApp that lets two role-based agents negotiate a price while keeping their committed maximum/minimum limits private and proving only policy compliance.

**Architecture:** Two local agent runtimes communicate through a dumb WebSocket relay. Each runtime keeps its own limit, randomness, identity secret, and witness provider; the relay transports negotiation messages and never calls the contract. The Compact contract stores public commitments and settlement status, proves the buyer's hidden price is below its committed maximum, then proves the seller accepts that same hidden price above its committed minimum before disclosing the final price.

**Tech Stack:** Compact 0.30.0 for the scaffolded Counter repository, Midnight Compact runtime 0.15.0, TypeScript/Node.js 24, Vitest, Midnight.js adapters, WebSocket relay, Docker proof server. A future LLM adapter may call one provider API for both roles, but the MVP must work without an API key.

## Global Constraints

- Keep the baseline repository under `/Users/taemin/Developer/Midnight/midnight-counter`.
- Keep Compact 0.30.0 for the first implementation because the scaffolded Counter runtime is 0.15.0; do not mix compiler/runtime versions.
- Never pass buyer maximum, seller minimum, or hidden price as public circuit arguments; use witness functions and reveal only after all assertions pass.
- Store only randomized commitments and public settlement metadata on the ledger.
- Bind every commitment and authorization to `dealId`, role, and a DApp-specific caller key.
- The MVP proves policy consistency, not solvency, inventory, truthful valuation, or secure LLM operation.
- The MVP must run with deterministic rule-based agents and must not require Claude Code, an OpenAI API key, or an Anthropic API key.
- On-chain time-based expiry is not assumed until the Compact runtime exposes and tests a trusted time primitive; the MVP uses explicit cancellation/expiry state with a documented limitation if necessary.

---

### Task 1: Document the frozen design and runbook

**Files:**
- Create: `docs/superpowers/plans/2026-07-22-debutler-mvp.md`
- Modify: `README.md`

**Interfaces:**
- Produces the protocol vocabulary used by all later tasks: `createDeal`, `authorizeHiddenPrice`, `settle`, `cancel`, `buyerCommitment`, `sellerCommitment`, `priceCommitment`, `finalPrice`.

- [ ] **Step 1: Record the protocol invariants**

  Document the statements that must remain true:

  ```text
  buyerCommitment = Commit(dealId, buyerKey, maxPrice, buyerRandomness)
  sellerCommitment = Commit(dealId, sellerKey, minPrice, sellerRandomness)
  authorizeHiddenPrice proves p <= maxPrice and stores Commit(dealId, p, priceRandomness)
  settle proves the same p commitment and minPrice <= p, then discloses p
  ```

- [ ] **Step 2: Document the threat model and non-goals**

  State that the relay may observe messages, metadata remains visible, and the protocol does not prove that a limit is economically truthful.

- [ ] **Step 3: Document local setup and verification commands**

  Include the known-good baseline commands:

  ```bash
  cd /Users/taemin/Developer/Midnight/midnight-counter
  export PATH="/Users/taemin/.local/bin:$PATH"
  compact --version            # compact 0.5.1
  compact compile --version    # 0.30.0
  npm install
  cd contract && npm run compact && npm run build && npm test -- --run
  ```

- [ ] **Step 4: Commit documentation**

  Run:

  ```bash
  git add docs/superpowers/plans/2026-07-22-debutler-mvp.md README.md
  git commit -m "docs: freeze De-Butler MVP design and runbook"
  ```

### Task 2: Convert the Counter contract into a minimal De-Butler contract

**Files:**
- Create: `contract/src/debutler.compact`
- Modify: `contract/src/witnesses.ts`
- Modify: `contract/src/index.ts`
- Modify: `contract/package.json`
- Delete: `contract/src/counter.compact`
- Delete: `contract/src/test/counter-simulator.ts`
- Delete: `contract/src/test/counter.test.ts`
- Create: `contract/src/test/debutler-simulator.ts`
- Create: `contract/src/test/debutler.test.ts`

**Interfaces:**
- `Contract<DebutlerPrivateState>` generated from `debutler.compact`.
- Exported circuits: `authorizeHiddenPrice(): []`, `settle(): []`, and `cancel(): []`.
- Witness names: `buyerSecretKey`, `sellerSecretKey`, `buyerMaxPrice`, `buyerLimitRandomness`, `agreedPrice`, `priceRandomness`, `sellerMinPrice`, `sellerLimitRandomness`.

- [ ] **Step 1: Write failing simulator tests**

  Add tests for these exact behaviors:

  ```ts
  it('does not disclose a price after authorization alone', () => {
    const simulator = new DebutlerSimulator(validScenario());
    simulator.authorizeHiddenPrice();
    expect(simulator.getLedger().finalPrice).toBe(0n);
    expect(simulator.getLedger().status).toBe('AUTHORIZED');
  });

  it('settles when the hidden price is inside both committed limits', () => {
    const simulator = new DebutlerSimulator(validScenario());
    simulator.authorizeHiddenPrice();
    simulator.settle();
    expect(simulator.getLedger().finalPrice).toBe(100n);
    expect(simulator.getLedger().status).toBe('SETTLED');
  });

  it('rejects a buyer price above the committed maximum', () => {
    const simulator = new DebutlerSimulator({ ...validScenario(), buyerMax: 90n, price: 100n });
    expect(() => simulator.authorizeHiddenPrice()).toThrow();
  });

  it('rejects a seller minimum above the agreed price', () => {
    const simulator = new DebutlerSimulator({ ...validScenario(), sellerMin: 110n });
    simulator.authorizeHiddenPrice();
    expect(() => simulator.settle()).toThrow();
  });

  it('rejects a price opening that does not match the buyer commitment', () => {
    const simulator = new DebutlerSimulator(validScenario());
    simulator.authorizeHiddenPrice();
    simulator.setPriceWitness({ price: 99n, randomness: validScenario().priceRandomness });
    expect(() => simulator.settle()).toThrow();
  });
  ```

- [ ] **Step 2: Run the focused test and verify the expected failure**

  Run:

  ```bash
  cd contract
  npm test -- --run src/test/debutler.test.ts
  ```

  Expected result: FAIL because the generated De-Butler contract and simulator do not exist yet.

- [ ] **Step 3: Implement the minimum Compact state and witness assertions**

  Use public randomized commitments and public status/final price. Keep `maxPrice`, `minPrice`, `price`, and all opening randomness in witness functions. `authorizeHiddenPrice` stores only `priceCommitment`; `settle` verifies the price commitment and seller bound before `disclose(price)`.

- [ ] **Step 4: Run the focused test and verify it passes**

  Run:

  ```bash
  npm run compact
  npm run build
  npm test -- --run src/test/debutler.test.ts
  ```

- [ ] **Step 5: Run all contract checks**

  Run:

  ```bash
  npm run typecheck
  npm run lint
  npm test -- --run
  ```

### Task 3: Add the deterministic two-agent relay demo

**Files:**
- Create: `agents/shared/protocol.ts`
- Create: `agents/shared/messages.ts`
- Create: `agents/relay.ts`
- Create: `agents/buyer.ts`
- Create: `agents/seller.ts`
- Create: `agents/policy.ts`
- Create: `agents/demo.test.ts`
- Modify: `package.json`

**Interfaces:**
- `NegotiationMessage` discriminated union with `DEAL_OPEN`, `OFFER`, `COUNTER_OFFER`, `ACCEPT`, `AUTHORIZATION_SUBMITTED`, `PRICE_OPENING`, `SETTLE_SUBMITTED`, and `CANCELLED`.
- `BuyerAgent(maxPrice: bigint)` and `SellerAgent(minPrice: bigint)` with `receive(message)` and `nextAction()` methods.
- `Relay` forwards messages without inspecting or changing protocol fields.

- [ ] **Step 1: Write a failing protocol test**

  Test a deterministic success flow with `maxPrice=110`, `minPrice=95`, and final price `100`, plus a rejection flow where `maxPrice=90`.

- [ ] **Step 2: Verify the protocol test fails**

  Run:

  ```bash
  npm test -- --run agents/shared/agents/demo.test.ts
  ```

- [ ] **Step 3: Implement the relay and rule-based agents**

  Keep the relay in-memory for tests and WebSocket-backed for the demo. Agent limits stay in local objects and are never put into messages.

- [ ] **Step 4: Verify the protocol test passes**

  Run the focused test, then:

  ```bash
  npm run demo
  ```

  Expected output: one successful settlement and one rejected negotiation.

### Task 4: Add the optional LLM adapter

**Files:**
- Create: `agents/llm/adapter.ts`
- Create: `agents/llm/prompts.ts`
- Create: `agents/llm/README.md`
- Modify: `agents/buyer.ts`
- Modify: `agents/seller.ts`

**Interfaces:**
- `NegotiationModel.generateOffer(context: PublicNegotiationContext): Promise<bigint>`.
- `RuleBasedNegotiationModel` remains the default.
- `OpenAINegotiationModel` is opt-in and receives only public item/offer context, never `maxPrice`, `minPrice`, salts, or private keys.

- [ ] **Step 1: Write adapter contract tests with a deterministic fake model**

  Verify that the adapter receives public context only and that `PolicyGuard` rejects model output outside the local limit.

- [ ] **Step 2: Implement the optional provider adapter**

  Read the provider key from an environment variable at runtime. Do not put keys in the browser bundle or README examples.

- [ ] **Step 3: Verify the default demo still works without a provider key**

  Run:

  ```bash
  npm run demo
  ```

### Task 5: Add demo runbook, threat-model screen copy, and evidence

**Files:**
- Modify: `README.md`
- Create: `docs/demo-script.md`
- Create: `docs/threat-model.md`

**Interfaces:**
- No runtime interface changes.

- [ ] **Step 1: Document the exact success and failure scripts**
- [ ] **Step 2: Document public/private data and relay visibility**
- [ ] **Step 3: Document proof latency fallback and local proof-server commands**
- [ ] **Step 4: Run the complete verification suite and record outputs**

  ```bash
  cd /Users/taemin/Developer/Midnight/midnight-counter
  cd contract && npm run compact && npm run build && npm run typecheck && npm run lint && npm test -- --run
  cd ..
  npm test -- --run
  ```

## Self-review checklist

- [ ] Every public contract argument is intentionally public.
- [ ] Every secret limit, price opening, and randomness value is a witness.
- [ ] `authorizeHiddenPrice` cannot disclose the price.
- [ ] `settle` cannot disclose a price unless both commitment and seller-bound checks pass.
- [ ] Role authorization is checked independently of commitment preimages.
- [ ] The default demo has no API-key dependency.
- [ ] README states that solvency, inventory, and policy truthfulness are out of scope.
- [ ] The plan does not assume native contract-call merging or unverified block-time access.
