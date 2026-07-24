# Staged Negotiation Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Compact contract and simulator follow the approved `createDeal → joinDeal → authorizeHiddenPrice → settle` lifecycle already shown by the Python demo.

**Architecture:** Deploying one contract instance represents `createDeal`: the constructor stores only the buyer identity and buyer limit commitment, then leaves the deal in `WAITING_SELLER`. A seller-owned `joinDeal()` circuit derives the seller key and commitment from seller witnesses, stores only those public commitments, and opens the deal. Existing buyer authorization, seller settlement, and role-specific cancellation remain separate calls.

**Tech Stack:** Compact 0.30.0, Midnight Compact runtime 0.15.0, TypeScript, Vitest, Python unittest.

## Global Constraints

- Keep Compact compiler `0.30.0`; do not update the contract runtime.
- Never expose buyer maximum, seller minimum, agreed price, or commitment randomness as public circuit arguments.
- Treat the constructor/deployment as the public `createDeal(C_B)` step.
- `joinDeal()` must derive `sellerKey` and `sellerCommitment` from seller witnesses.
- `authorizeHiddenPrice()` must reject calls until a seller has joined.
- `settle()` may disclose the price only after both commitment checks and `sellerMinPrice <= agreedPrice` pass.
- Preserve the rule-based TypeScript agents and Python presentation demo.

---

### Task 1: Add the staged seller-join lifecycle

**Files:**
- Modify: `contract/src/test/negotiation.test.ts`
- Modify: `contract/src/test/negotiation-simulator.ts`
- Modify: `contract/src/negotiation.compact`

**Interfaces:**
- Constructor: `constructor(dealId, buyerKey, buyerCommitment)`
- New status: `DealStatus.WAITING_SELLER`
- New circuit: `joinDeal(): []`
- Test helper: `NegotiationSimulator.joinDeal(): void`

- [x] **Step 1: Write failing lifecycle tests**

  Add tests that prove a new deal waits for a seller, buyer authorization is rejected before join, joining stores the seller commitment and opens the deal, and a second join is rejected.

  ```ts
  it("starts in WAITING_SELLER and rejects early authorization", () => {
    const simulator = new NegotiationSimulator(validScenario());
    expect(simulator.getLedger().status).toBe(
      (DealStatus as Record<string, bigint>).WAITING_SELLER
    );
    expect(() => simulator.authorizeHiddenPrice()).toThrow();
  });

  it("opens only after the seller joins", () => {
    const simulator = new NegotiationSimulator(validScenario());
    simulator.joinDeal();
    expect(simulator.getLedger().status).toBe(DealStatus.OPEN);
    expect(simulator.getLedger().sellerKey).toEqual(
      simulator.expectedSellerKey
    );
    expect(simulator.getLedger().sellerCommitment).toEqual(
      simulator.expectedSellerCommitment
    );
  });

  it("rejects a second seller join", () => {
    const simulator = new NegotiationSimulator(validScenario());
    simulator.joinDeal();
    expect(() => simulator.joinDeal()).toThrow();
  });
  ```

- [x] **Step 2: Run the focused test and verify RED**

  Run:

  ```bash
  cd /Users/taemin/Developer/Midnight/midnight-counter/contract
  npm test -- --run src/test/negotiation.test.ts
  ```

  Expected: FAIL because `WAITING_SELLER` and `joinDeal` do not exist.

- [x] **Step 3: Implement the minimum Compact lifecycle**

  Change the public state machine to:

  ```compact
  export enum DealStatus {
    WAITING_SELLER,
    OPEN,
    AUTHORIZED,
    SETTLED,
    CANCELLED
  }

  constructor(
    _dealId: Bytes<32>,
    _buyerKey: Bytes<32>,
    _buyerCommitment: Bytes<32>
  ) {
    dealId = disclose(_dealId);
    buyerKey = disclose(_buyerKey);
    sellerKey = disclose(pad(32, ""));
    buyerCommitment = disclose(_buyerCommitment);
    sellerCommitment = disclose(pad(32, ""));
    priceCommitment = disclose(pad(32, ""));
    finalPrice = 0;
    status = DealStatus.WAITING_SELLER;
  }

  export circuit joinDeal(): [] {
    assert(status == DealStatus.WAITING_SELLER, "deal is not waiting for seller");

    const joinedSellerKey = publicKey(sellerSecretKey());
    const joinedSellerCommitment = limitCommitment(
      pad(32, "negotiation:seller:"),
      joinedSellerKey,
      sellerMinPrice(),
      sellerLimitRandomness()
    );

    sellerKey = disclose(joinedSellerKey);
    sellerCommitment = disclose(joinedSellerCommitment);
    status = DealStatus.OPEN;
  }
  ```

  Update the simulator constructor to pass only buyer fields and expose a `joinDeal()` helper that calls the generated circuit.

- [x] **Step 4: Update existing success and failure tests**

  Call `simulator.joinDeal()` before every existing authorization path. Keep the early-authorization test unjoined.

- [x] **Step 5: Compile and verify GREEN**

  Run:

  ```bash
  export PATH="/Users/taemin/.local/bin:$PATH"
  compact update 0.30.0
  npm run compact
  npm run build
  npm run typecheck
  npm run lint
  npm test -- --run src/test/negotiation.test.ts
  ```

  Expected: all lifecycle and existing contract tests pass.

### Task 2: Align presentation documentation with the implemented lifecycle

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-22-negotiation-mvp.md`

**Interfaces:**
- Presentation title: `Midnight에서 정보를 공개하지 않고 거래 조건을 증명하는 법`
- Runtime lifecycle: constructor/deployment `createDeal` → `joinDeal` → `authorizeHiddenPrice` → `settle`

- [x] **Step 1: Correct the title and status**

  Update the README title and implementation checklist so it states that the Compact lifecycle now matches the staged Python demo. Keep actual Midnight.js proof-provider integration marked pending.

- [x] **Step 2: Update the main MVP plan**

  Record `joinDeal()` and `WAITING_SELLER` in the contract interfaces and mark the contract/demo lifecycle reconciliation complete.

- [x] **Step 3: Check documentation formatting**

  Run:

  ```bash
  git diff --check
  ```

  Expected: no whitespace errors.

### Task 3: Run the complete local regression suite

**Files:**
- No production files beyond Tasks 1–2.

**Interfaces:**
- Produces a verified baseline for the later Midnight.js proof-provider integration.

- [x] **Step 1: Verify Compact and TypeScript contract code**

  Run:

  ```bash
  cd /Users/taemin/Developer/Midnight/midnight-counter/contract
  export PATH="/Users/taemin/.local/bin:$PATH"
  compact update 0.30.0
  npm run compact
  npm run build
  npm run typecheck
  npm run lint
  npm test -- --run
  ```

- [x] **Step 2: Verify both demo implementations**

  Run:

  ```bash
  cd /Users/taemin/Developer/Midnight/midnight-counter
  npm run test:agents
  python3 -m unittest test_python_demo.py
  npm run demo
  git diff --check
  ```

  Expected: contract, TypeScript agent, and Python tests pass; the deterministic demo prints one settlement and one cancellation.

- [x] **Step 3: Review the final diff**

  Confirm that the diff contains only the existing neutral-name migration, the staged contract lifecycle, its tests, and matching documentation. Do not commit unrelated files.
