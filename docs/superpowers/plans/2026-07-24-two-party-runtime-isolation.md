# Two-Party Runtime Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the Buyer and Seller as separate OS processes with separate wallets, private-state stores, witness data, and proof servers while sharing only public chain infrastructure and an allowlisted Relay.

**Architecture:** A role-discriminated private-state union makes the other party's fields structurally absent. Buyer and Seller child processes generate their own negotiation secrets and interact through a runtime-validated IPC Relay. Shared node/indexer services expose public data; two proof-server instances and role-specific LevelDB stores preserve the proving boundary.

**Tech Stack:** Compact 0.30.0, TypeScript 6, Midnight.js 4.0.4, Wallet SDK 3, Vitest 4, Node child processes, Docker Compose.

## Global Constraints

- Buyer and Seller run as different operating-system processes on the same laptop.
- Buyer and Seller use different wallet seeds, addresses, private-state stores, and proof-server endpoints.
- Node and indexer are shared public infrastructure.
- Relay may observe proposals and `(p, r_P)` but must never receive `B`, `S`, `r_B`, `r_S`, role secrets, wallet seeds, or private-state objects.
- Private values and randomness must never be printed in logs or errors.
- Compact compiler remains pinned to `0.30.0`.
- Existing Python, agent, simulator, and single-runtime tests must remain green until replaced by stronger coverage.

---

### Task 1: Role-specific private state and witness guards

**Files:**
- Modify: `contract/src/witnesses.ts`
- Modify: `contract/src/test/negotiation-simulator.ts`
- Create: `contract/src/test/witnesses.test.ts`
- Modify: `contract/src/test/negotiation.test.ts`

**Interfaces:**
- Produces: `BuyerPrivateState`, `SellerPrivateState`, `NegotiationPrivateState`, `withSellerPriceOpening(state, opening)`.
- Produces: the existing exported `witnesses` object, now guarded by `state.role`.

- [x] **Step 1: Write failing witness-isolation tests**

```ts
it("rejects seller witness access from buyer state", () => {
  expect(() => witnesses.sellerMinPrice(buyerContext)).toThrow(
    "seller witness requires seller private state"
  );
});

it("rejects settlement values before the seller receives an opening", () => {
  expect(() => witnesses.agreedPrice(sellerContextWithoutOpening)).toThrow(
    "seller price opening is not available"
  );
});
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd contract
npm test -- --run src/test/witnesses.test.ts
```

Expected: FAIL because the role-specific types and guards do not exist.

- [x] **Step 3: Implement the discriminated state union**

```ts
export type BuyerPrivateState = {
  role: "buyer";
  buyerSecretKey: Uint8Array;
  buyerMaxPrice: bigint;
  buyerLimitRandomness: Uint8Array;
  agreedPrice: bigint;
  priceRandomness: Uint8Array;
};

export type SellerPriceOpening = {
  agreedPrice: bigint;
  priceRandomness: Uint8Array;
};

export type SellerPrivateState = {
  role: "seller";
  sellerSecretKey: Uint8Array;
  sellerMinPrice: bigint;
  sellerLimitRandomness: Uint8Array;
  priceOpening?: SellerPriceOpening;
};

export type NegotiationPrivateState =
  | BuyerPrivateState
  | SellerPrivateState;
```

Add role guards that throw fixed, value-free messages. Buyer witnesses read only Buyer state. Seller witnesses read only Seller state. `agreedPrice` and `priceRandomness` accept Buyer state or Seller state with `priceOpening`.

- [x] **Step 4: Split the simulator into Buyer and Seller circuit contexts**

Use a Buyer context for constructor and `authorizeHiddenPrice`. Before `joinDeal`, replace only the context's private state with Seller state; before authorization restore Buyer state; before settlement use Seller state with the price opening. Preserve the public contract state and ZSwap state between calls.

- [x] **Step 5: Run contract verification and verify GREEN**

```bash
cd contract
npm run build
npm run typecheck
npm run lint
npm test -- --run
```

Expected: 11 or more tests pass with no lint errors.

### Task 2: Closed Relay protocol and runtime validation

**Files:**
- Create: `counter-cli/src/isolation/protocol.ts`
- Create: `counter-cli/src/isolation/protocol.test.ts`

**Interfaces:**
- Produces: `IsolationMessage`, `parseIsolationMessage(value: unknown): IsolationMessage`, `relayAudit(message): RelayAudit`.
- Consumes: no wallet, contract, or private-state types.

- [x] **Step 1: Write failing protocol tests**

```ts
expect(parseIsolationMessage({
  type: "CONTRACT_READY",
  contractAddress: "a".repeat(64)
})).toEqual({
  type: "CONTRACT_READY",
  contractAddress: "a".repeat(64)
});

expect(() => parseIsolationMessage({
  type: "PROPOSAL",
  dealId: "deal-1",
  price: "100",
  buyerMax: "110"
})).toThrow("unexpected relay field: buyerMax");
```

Cover valid `CONTRACT_READY`, `PROPOSAL`, and `PRICE_OPENING`, every forbidden key, unknown keys, invalid hex, and invalid decimal prices.

- [x] **Step 2: Run the focused tests and verify RED**

```bash
cd counter-cli
npx vitest run src/isolation/protocol.test.ts
```

Expected: FAIL because `protocol.ts` does not exist.

- [x] **Step 3: Implement an exact-key runtime parser**

```ts
export type IsolationMessage =
  | { type: "CONTRACT_READY"; contractAddress: string }
  | { type: "PROPOSAL"; dealId: string; price: string }
  | {
      type: "PRICE_OPENING";
      dealId: string;
      price: string;
      priceRandomness: string;
    };
```

For each message kind, compare `Object.keys(value).sort()` to the exact allowed key set. Reject forbidden and unknown keys before validating values. `relayAudit` returns only `{ type, keys }`.

- [x] **Step 4: Run focused and static verification**

```bash
cd counter-cli
npx vitest run src/isolation/protocol.test.ts
npm run typecheck
npm run lint
```

Expected: all protocol tests pass and no lint errors.

### Task 3: Role-scoped providers and Seller opening update

**Files:**
- Modify: `counter-cli/src/config.ts`
- Modify: `counter-cli/src/api.ts`
- Create: `counter-cli/src/isolation/providers.test.ts`

**Interfaces:**
- Produces: `RuntimeRole = "buyer" | "seller"`.
- Produces: `configureProviders(ctx, config, role): Promise<NegotiationProviders>`.
- Produces: `storeSellerPriceOpening(providers, contractAddress, opening): Promise<void>`.

- [x] **Step 1: Write failing role-provider tests**

Use a fake `PrivateStateProvider` to verify:

```ts
await storeSellerPriceOpening(providers, contractAddress, {
  agreedPrice: 100n,
  priceRandomness
});

expect(provider.setContractAddress).toHaveBeenCalledWith(contractAddress);
expect(provider.set).toHaveBeenCalledWith(
  NegotiationPrivateStateId,
  expect.objectContaining({
    role: "seller",
    priceOpening: { agreedPrice: 100n, priceRandomness }
  })
);
```

Also verify Buyer state is rejected and that role-specific store names differ.

- [x] **Step 2: Run focused tests and verify RED**

```bash
cd counter-cli
npx vitest run src/isolation/providers.test.ts
```

Expected: FAIL because role configuration and opening storage do not exist.

- [x] **Step 3: Add role-specific provider configuration**

```ts
export const privateStateStoreNameFor = (role: RuntimeRole): string =>
  `negotiation-${role}-private-state`;
```

Pass this name to `levelPrivateStateProvider`. Keep account IDs and storage passwords wallet-specific.

- [x] **Step 4: Implement Seller opening storage**

Scope the provider with `setContractAddress`, read the existing state, assert `role === "seller"`, produce a new object through `withSellerPriceOpening`, and store it under `NegotiationPrivateStateId`.

- [x] **Step 5: Update existing callers and verify**

The single-runtime compatibility CLI uses role `"buyer"` only until Task 5 replaces it. The integration test creates explicit Buyer and Seller providers.

```bash
cd counter-cli
npx vitest run src/isolation/providers.test.ts
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit zero.

### Task 4: Two proof servers and two funded wallets

**Files:**
- Modify: `counter-cli/standalone.yml`
- Modify: `counter-cli/src/test/commons.ts`
- Modify: `counter-cli/src/api.ts`
- Modify: `.gitignore`
- Create: `counter-cli/src/isolation/role-wallet.ts`
- Create: `counter-cli/src/isolation/wallet-bootstrap.ts`

**Interfaces:**
- Produces: `RoleNetworkConfig = { buyer: Config; seller: Config }`.
- Produces: `buildWalletAndWaitForSync(config, seed): Promise<WalletContext>`.
- Produces: `fundWallet(funder, receiverAddress, amount): Promise<string>`.
- Produces: `loadOrCreateRoleSeed(role, directory): Promise<string>`, called only inside a role process.

- [x] **Step 1: Add separate proof-server services**

Define `buyer-proof-server` and `seller-proof-server`, both using `midnightntwrk/proof-server:8.0.3`, with dynamic host ports and the existing health check. Remove the single `proof-server` service.

- [x] **Step 2: Split wallet sync from funding**

Refactor the current wallet builder so it can return a synced zero-balance wallet before `waitForFunds`. Keep `buildWalletAndWaitForFunds` as a compatibility wrapper.

- [x] **Step 3: Add role-local seed persistence**

Each role process calls `loadOrCreateRoleSeed` inside its own address space. It creates a 32-byte seed with `generateRandomSeed`, writes it with owner-only permissions, and restores it on later runs. The orchestrator passes only the role directory path and never reads the seed file.

Ignore the following paths:

```text
.demo-wallets/
.demo-private-state/
```

- [x] **Step 4: Add the funding helper**

Decode the receiver with:

```ts
const receiver = MidnightBech32m.parse(receiverAddress).decode(
  UnshieldedAddress,
  getNetworkId()
);
```

Create an unshielded NIGHT transfer with `wallet.transferTransaction`, sign the recipe using the funder's unshielded keystore, finalize it, and submit it. The helper accepts only a public address and amount.

- [x] **Step 5: Extend `TestEnvironment`**

Map both proof-server endpoints and expose them as Buyer and Seller public configs. The environment owns only the Compose services. Role wallets are created and stopped inside their child processes. A separate bootstrap child owns the standalone genesis seed, receives only role public addresses and transfer amounts, funds both roles, and exits before negotiation.

- [x] **Step 6: Verify container and wallet preparation**

```bash
cd counter-cli
docker compose -f standalone.yml config
npm run typecheck
npm run lint
```

Expected: four services (`buyer-proof-server`, `seller-proof-server`, `node`, `indexer`) and zero errors.

### Task 5: Buyer and Seller child runtimes

**Files:**
- Create: `counter-cli/src/isolation/child-protocol.ts`
- Create: `counter-cli/src/roles/buyer-runtime.ts`
- Create: `counter-cli/src/roles/seller-runtime.ts`
- Create: `counter-cli/src/roles/observer-runtime.ts`
- Create: `counter-cli/src/roles/funder-runtime.ts`
- Create: `counter-cli/src/isolation/orchestrator.ts`
- Create: `counter-cli/src/isolation/two-party.api.test.ts`
- Modify: `counter-cli/package.json`

**Interfaces:**
- Buyer consumes public config and a role-owned wallet directory; it reads its seed only inside its process.
- Seller consumes public config and a role-owned wallet directory; it reads its seed only inside its process.
- Funder consumes public wallet addresses and transfer amounts only.
- Observer consumes node/indexer configuration and a contract address only.
- Orchestrator forwards only parsed `IsolationMessage` values and public readiness metadata.

- [x] **Step 1: Write the failing multi-process test**

Assert different PIDs, wallet addresses, store names, and proof endpoints. Assert Relay audit contains no forbidden field. Assert the final lifecycle and price.

- [x] **Step 2: Run it and verify RED**

```bash
cd counter-cli
npx vitest run src/isolation/two-party.api.test.ts
```

Expected: FAIL because role runtimes and orchestrator do not exist.

- [x] **Step 3: Implement Buyer runtime**

Generate `B`, `r_B`, role secret, `p`, and `r_P` inside the child. Build Buyer providers, deploy, emit `CONTRACT_READY`, wait for Seller `OPEN`, authorize, and emit `PRICE_OPENING`. Emit only redacted runtime metadata.

- [x] **Step 4: Implement Seller runtime**

Generate `S`, `r_S`, and the Seller role secret inside the child. Attach after `CONTRACT_READY`, call `joinDeal`, validate `PRICE_OPENING`, update Seller private state, and call `settle`. Emit only redacted runtime metadata.

- [x] **Step 5: Implement the orchestrator**

Spawn Buyer, Seller, Funder, and Observer with Node child-process IPC. After Buyer and Seller report only their public addresses, ask Funder to transfer NIGHT and exit. Route every negotiation message through `parseIsolationMessage`. Keep a field-name-only audit. On invalid messages or child failure, terminate all live children and report a value-free error.

- [x] **Step 6: Implement the public Observer**

After `CONTRACT_READY`, query only public indexer state and emit status, commitment prefixes, block metadata, and final price. The Observer process receives no wallet seed, private-state path, or proof-server URL.

- [x] **Step 7: Add scripts**

```json
{
  "demo:isolated": "node --no-warnings --experimental-specifier-resolution=node --loader ts-node/esm src/isolation/orchestrator.ts",
  "test:isolated": "vitest run src/isolation/two-party.api.test.ts"
}
```

- [x] **Step 8: Run the actual standalone test**

```bash
cd counter-cli
npm run test:isolated
```

Expected: Buyer and Seller run with different process/runtime identities and the chain finishes at `SETTLED`, `finalPrice=100`.

### Task 6: Presentation preflight and documentation

**Files:**
- Create: `counter-cli/src/isolation/preflight.ts`
- Modify: `counter-cli/package.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run demo:preflight`.

- [x] **Step 1: Implement preflight checks**

Check node health, indexer query reachability, both proof-server `/version` endpoints, two distinct wallet addresses, non-zero NIGHT, non-zero DUST, different private-state stores, and different process IDs. Print no private values.

- [x] **Step 2: Document the claim and limitations**

Document that node/indexer are shared, proving and private state are role-local, Relay sees proposals and `(p, r_P)`, and the demo runs on one laptop rather than two physical machines.

- [x] **Step 3: Run full verification**

```bash
export PATH="/Users/taemin/.local/bin:$PATH"
cd contract
compact update 0.30.0
npm run compact
npm run build
npm run typecheck
npm run lint
npm test -- --run

cd ../counter-cli
npm run typecheck
npm run lint
npm run build
npm run test:isolated

cd ..
npm run test:agents
python3 -m unittest test_python_demo.py
npm run demo
git diff --check
```

Expected: all commands exit zero; only the known wallet-SDK `any` lint warnings may remain.
