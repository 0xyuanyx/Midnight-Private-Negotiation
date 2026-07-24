# Two-Party Runtime Isolation Design

**Date:** 2026-07-24  
**Status:** Approved for implementation

## Goal

Demonstrate that a distrustful buyer and seller can execute the Midnight negotiation protocol without either runtime learning the other party's private limit, limit randomness, role secret, wallet seed, or private state.

The presentation claim supported by this design is:

> The buyer and seller ran in separate processes, with separate wallets, private-state stores, witness data, and local proof servers. Each process generated its own proof without receiving the other party's private limit.

## Trust boundary

| Data or component | Buyer | Seller | Shared infrastructure |
|---|---:|---:|---:|
| Wallet seed and signing material | Own only | Own only | No |
| Private-state provider and database | Own only | Own only | No |
| Witness implementation code | Same public code | Same public code | Repository |
| Witness values | Buyer values only | Seller values only | No |
| Buyer maximum `B` and randomness `r_B` | Yes | No | No |
| Seller minimum `S` and randomness `r_S` | No | Yes | No |
| Role secret | Buyer secret only | Seller secret only | No |
| Price randomness `r_P` | Generated locally | Received after authorization | Relay can observe in MVP |
| Agreed price `p` | Yes | Received through negotiation | Relay can observe; public after settlement |
| Contract address and public ledger | Yes | Yes | Node/indexer |
| Proof server | Buyer-local | Seller-local | No |
| Node and indexer | Uses shared services | Uses shared services | Yes |

The HTTP proof provider sends a serialized proving preimage to its proof server. Sharing one proof server would therefore create a component that handles both parties' proving inputs. The demo uses two proof-server instances on separate endpoints.

## Runtime topology

The same laptop runs independent operating-system processes:

- `buyer-runtime`
  - restores the Buyer wallet;
  - opens the Buyer private-state store;
  - uses the Buyer proof server;
  - creates and deploys the deal;
  - calls `authorizeHiddenPrice`;
  - sends only allowed relay messages.
- `seller-runtime`
  - restores the Seller wallet;
  - opens the Seller private-state store;
  - uses the Seller proof server;
  - attaches to the public contract address;
  - calls `joinDeal`;
  - receives `(p, r_P)` and updates its own private state;
  - calls `settle`.
- `relay`
  - forwards an allowlisted message union;
  - rejects unknown fields;
  - records field names, not secret values, for the presentation audit.
- `observer`
  - reads only public indexer data.
- shared standalone `node` and `indexer`
  - expose public chain state.
- separate Buyer and Seller proof-server instances
  - each receives proving inputs from only one role.

The parent test orchestrator may coordinate process readiness and public messages. It must not generate, receive, or persist `B`, `S`, `r_B`, `r_S`, role secrets, wallet seeds, or complete private-state objects.

## Role-specific private state

Replace the monolithic state object with a discriminated union:

```ts
type NegotiationPrivateState =
  | BuyerPrivateState
  | SellerPrivateState;
```

Buyer state contains:

- `role: "buyer"`
- `buyerSecretKey`
- `buyerMaxPrice`
- `buyerLimitRandomness`
- `agreedPrice`
- `priceRandomness`

Seller state contains:

- `role: "seller"`
- `sellerSecretKey`
- `sellerMinPrice`
- `sellerLimitRandomness`
- an optional price opening that is absent before authorization and present before settlement.

Witness functions assert the expected role. Calling a Buyer witness against Seller state, or vice versa, fails immediately. The other party's fields are absent rather than filled with dummy values.

After the Seller receives the opening, its process scopes the private-state provider to the public contract address and stores an updated Seller state before calling `settle`.

## Protocol and communication

The staged flow is:

1. Buyer generates its own secrets and deploys `createDeal`.
2. Buyer sends `ContractReady { contractAddress }`.
3. Seller generates its own secrets, attaches, and calls `joinDeal`.
4. Buyer and Seller exchange `Proposal` messages.
5. Buyer calls `authorizeHiddenPrice`.
6. Buyer sends `PriceOpening { dealId, price, priceRandomness }`.
7. Seller updates only its local private state and calls `settle`.
8. Observer reports `SETTLED` and the disclosed final price.

Allowed relay messages form a closed discriminated union:

```text
ContractReady { contractAddress }
Proposal      { dealId, price }
PriceOpening  { dealId, price, priceRandomness }
```

Forbidden fields include:

```text
buyerMax
sellerMin
buyerLimitRandomness
sellerLimitRandomness
buyerSecretKey
sellerSecretKey
walletSeed
privateState
```

Runtime validation rejects unknown message kinds, missing fields, extra fields, invalid byte lengths, and forbidden keys. Relay construction must not accept arbitrary object spreading.

The MVP makes no claim that the Relay cannot observe proposals or `(p, r_P)`. Correctness and role-policy compliance are enforced by the contract even if the Relay delays, drops, or modifies messages.

## Wallet provisioning

The presentation uses persistent local standalone wallets rather than creating wallets live:

1. Generate independent Buyer and Seller seeds locally.
2. Store role wallet data in separate ignored directories.
3. Use a standalone bootstrap/genesis wallet to fund the two public addresses.
4. Register each role's NIGHT for DUST generation.
5. Wait for both wallets to be synced and fee-ready.
6. Run a preflight check before recording or presenting.

The bootstrap wallet sees only public wallet addresses and transfer amounts. It receives no negotiation private data and exits before the negotiation begins.

## Presentation-safe audit output

Do not print wallet seeds, role secrets, limits, or randomness. Print process and storage separation plus field presence:

```text
[BUYER pid=4101]
wallet=mn_addr_...a81f
private-store=buyer
proof-server=:6301
local fields: buyerMax ✓ buyerLimitRandomness ✓ buyerSecretKey ✓
seller fields: ABSENT

[SELLER pid=4102]
wallet=mn_addr_...7c22
private-store=seller
proof-server=:6302
local fields: sellerMin ✓ sellerLimitRandomness ✓ sellerSecretKey ✓
buyer fields: ABSENT
```

Relay audit output shows field names only:

```text
[RELAY] ContractReady keys=[contractAddress]
[RELAY] Proposal keys=[dealId, price]
[RELAY] PriceOpening keys=[dealId, price, priceRandomness]
[RELAY] forbidden private fields observed=0
```

These lines are presentation evidence, not a cryptographic proof of process absence. The stronger evidence is the role-specific state type, witness guards, closed message schema, separate process identities, separate wallet addresses, separate storage paths, separate proof endpoints, and automated integration assertions.

## Failure handling

- Abort before deployment if either wallet is unsynced, unfunded, or lacks DUST.
- Abort if either proof server fails its health check.
- Reject Relay messages with unknown or forbidden fields before forwarding.
- Reject settlement when the Seller has no validated price opening.
- Treat duplicate `ContractReady`, `joinDeal`, authorization, or settlement messages as protocol errors.
- Apply bounded timeouts to process readiness, chain finalization, and relay hand-offs.
- On child-process failure, terminate the run without copying its private state into the orchestrator.
- Never include private values in thrown errors or logs.

## Verification

### Unit tests

- Buyer witnesses reject Seller state and Seller witnesses reject Buyer state.
- Relay accepts each valid message shape.
- Relay rejects every forbidden field and all unknown extra fields.
- Seller state cannot settle before a price opening is stored.

### Simulator tests

- Existing staged lifecycle and invalid-opening tests continue to pass with role-specific states.

### Multi-process standalone integration

The integration test must assert:

- Buyer and Seller have different PIDs.
- Buyer and Seller have different wallet addresses.
- Buyer and Seller use different private-state store names or paths.
- Buyer and Seller use different proof-server endpoints.
- The orchestrator and Relay receive no forbidden fields.
- `WAITING_SELLER → OPEN → AUTHORIZED → SETTLED`.
- `finalPrice` remains zero through authorization.
- final `finalPrice` equals the agreed price.

### Presentation preflight

A single command checks Docker services, both wallets, balances, DUST, proof-server endpoints, process separation, and public indexer reachability before opening the three presentation terminals.

## Scope

Included:

- same-laptop operating-system process separation;
- independent wallets, private state, witnesses, and local provers;
- shared public node/indexer;
- allowlisted Relay messages;
- automated isolation and lifecycle verification;
- Buyer, Seller, and Observer terminal entry points.

Excluded:

- separate physical computers;
- hiding proposals or `(p, r_P)` from the Relay;
- production key custody;
- encrypted peer-to-peer transport;
- token escrow or atomic asset settlement;
- claims about solvency, inventory, or truthfulness of the chosen limits.
