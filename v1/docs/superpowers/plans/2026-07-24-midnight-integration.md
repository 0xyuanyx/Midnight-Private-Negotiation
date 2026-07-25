# Midnight.js Negotiation Integration Plan

> **For implementation:** Follow the executing-plans and test-driven-development skills. Keep the existing staged Compact contract and Python demo behavior intact.

**Goal:** Replace the Counter-specific Midnight.js adapter with a Negotiation adapter and prove the staged lifecycle on the local standalone Midnight stack.

**Architecture:** The Compact contract package owns the deterministic commitment helpers shared by deployment code and simulator tests. The CLI package owns wallet/provider wiring and exposes contract-specific operations for deploy, attach, join, authorize, settle, cancel, and ledger reads. The first end-to-end test intentionally uses one funded local wallet and one combined private state; separate buyer/seller processes are a later demo-shell milestone.

**Tech stack:** Compact 0.30, TypeScript, Midnight.js 4.0.4, ledger-v8, Vitest, Docker Compose standalone node/indexer/proof server.

**Status (2026-07-24):** Complete. The standalone integration test finalized deploy, `joinDeal`, `authorizeHiddenPrice`, and `settle`; the final ledger state was `SETTLED` with `finalPrice = 100`.

---

### Task 1: Share commitment construction

**Files:**
- Create: `contract/src/commitments.ts`
- Modify: `contract/src/index.ts`
- Modify: `contract/src/test/negotiation-simulator.ts`
- Test: `contract/src/test/commitments.test.ts`

- [x] Add a failing test that compares helper-generated buyer and seller commitments with values accepted and stored by the generated Compact simulator.
- [x] Move byte conversion, public-key derivation, limit commitment, and price commitment helpers into the production contract package.
- [x] Export the helpers and make the simulator consume them.
- [x] Run the focused tests, then the full contract suite.

### Task 2: Replace Counter adapter types and paths

**Files:**
- Modify: `counter-cli/src/common-types.ts`
- Modify: `counter-cli/src/config.ts`
- Modify: `counter-cli/src/api.ts`

- [x] Change Counter contract/provider aliases to Negotiation equivalents.
- [x] Point compiled circuit assets and private state storage at `managed/negotiation`.
- [x] Compile and capture the expected missing Counter operation failures before adding Negotiation operations.

### Task 3: Implement staged Negotiation operations

**Files:**
- Modify: `counter-cli/src/api.ts`
- Test: `counter-cli/src/test/counter.api.test.ts`

- [x] Rewrite the slow integration test for `WAITING_SELLER → OPEN → AUTHORIZED → SETTLED`.
- [x] Add deployment constructor arguments: deal ID, buyer key, and buyer commitment.
- [x] Add ledger query plus `joinDeal`, `authorizeHiddenPrice`, `settle`, and cancellation wrappers.
- [x] Build, typecheck, lint, and verify the integration test is structurally valid.

### Task 4: Align the interactive CLI

**Files:**
- Modify: `counter-cli/src/cli.ts`

- [x] Replace Counter copy and actions with the Negotiation staged flow.
- [x] Collect or generate scenario inputs without logging private values.
- [x] Keep wallet setup, DUST monitoring, standalone container mapping, and error reporting unchanged.
- [x] Build, typecheck, and lint the full CLI.

### Task 5: Prove the local Midnight path

**Files:**
- Test: `counter-cli/src/test/counter.api.test.ts`
- Modify: `README.md`

- [x] Check Docker availability and start the standalone node, indexer, and proof server through the existing test harness.
- [x] Run the slow test through deploy, join, authorize, and settle.
- [x] Record the exact verified scope: one local wallet/provider runtime, real Midnight transactions/proofs, staged ledger states.
- [x] Update README commands, status, limitations, and the next two-process milestone.
- [x] Run contract, CLI, agent, and Python verification plus `git diff --check`.
