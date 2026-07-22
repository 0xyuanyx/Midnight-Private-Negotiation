# Observer Public View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third `observer` terminal to the Python relay demo that displays only the public ledger projection: shortened commitments, synthetic block numbers, final settlement price, or a no-disclosure cancellation.

**Architecture:** Keep buyer and seller negotiation messages on the existing relay path. Add a public-event projection inside the relay that converts only `CREATE_DEAL`, `DEAL_JOINED`, `AUTHORIZED`, `SETTLED`, and `CANCEL` into sanitized events. Observer clients receive the event history and future events, never the raw negotiation messages or private values.

**Tech Stack:** Python 3 standard library sockets and `socketserver`, JSON-lines protocol, existing `python_demo.py` two-terminal demo, pytest-free `unittest` tests.

## Global Constraints

- Observer output must contain only `DEAL_CREATED`, `SELLER_JOINED`, `PRICE_COMMITTED`, `SETTLED`, or `CANCELLED` events.
- Observer must never receive budgets, minimum prices, offers, counters, accepts, negotiation round counts, `(p, r_P)`, or full commitment strings.
- Commitment display uses a `0x` prefix plus a short prefix and a Unicode ellipsis, e.g. `0x3fa2…`.
- Synthetic block numbers start at `12` and increment once per public event; they are explicitly labeled as demo values.
- Successful output has four public lines: `C_B`, `C_S`, `C_P`, and `SETTLED`.
- Failed output has no `C_P` or price and ends with `CANCELLED — 공개된 값: 없음`.
- The current Python demo remains a simulation; actual Midnight indexer integration is a later replacement for the relay event source.

---

### Task 1: Add a tested public-event projection

**Files:**
- Modify: `/Users/taemin/Developer/Midnight/midnight-counter/python_demo.py`
- Create: `/Users/taemin/Developer/Midnight/midnight-counter/test_python_demo.py`

**Interfaces:**
- `short_commitment(value: str) -> str` returns `0x` plus the first four hex characters and `…`.
- `PublicEvent` is a JSON-compatible dictionary with `event`, `block`, and event-specific fields.
- `public_event_from_message(message: dict[str, Any], block: int) -> dict[str, Any] | None` returns a sanitized event or `None` for non-public messages.
- `render_public_event(event: dict[str, Any]) -> str` renders exactly one Observer line.

- [ ] **Step 1: Write failing unit tests for formatting and filtering**

  Add tests covering these exact behaviors:

  ```python
  def test_short_commitment_uses_prefix_and_ellipsis():
      assert short_commitment("0x3fa2aabbccdd") == "0x3fa2…"

  def test_offer_is_not_public_event():
      assert public_event_from_message(
          {"type": "OFFER", "from": "buyer", "price": 9000}, 12
      ) is None

  def test_create_deal_exposes_only_short_buyer_commitment():
      event = public_event_from_message(
          {"type": "CREATE_DEAL", "from": "buyer", "product": "111", "buyer_commitment": "0x3fa2aabb"},
          12,
      )
      assert event == {
          "event": "DEAL_CREATED",
          "block": 12,
          "deal_id": "111",
          "commitment": "0x3fa2…",
      }

  def test_settled_exposes_price_but_not_private_fields():
      event = public_event_from_message(
          {"type": "SETTLED", "from": "seller", "price": 9000, "min_price": 7500},
          15,
      )
      assert event == {"event": "SETTLED", "block": 15, "price": 9000}

  def test_cancelled_contains_no_reason_or_price():
      event = public_event_from_message(
          {"type": "CANCEL", "from": "buyer", "reason": "over budget", "price": 9000},
          15,
      )
      assert event == {"event": "CANCELLED", "block": 15}
  ```

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run:

  ```bash
  python3 -m unittest test_python_demo.py -v
  ```

  Expected result: FAIL because the public-event helpers do not exist yet.

- [ ] **Step 3: Implement pure projection and renderer helpers**

  Map messages as follows:

  ```text
  CREATE_DEAL → DEAL_CREATED with deal_id and shortened buyer_commitment
  DEAL_JOINED → SELLER_JOINED with shortened seller_commitment
  AUTHORIZED → PRICE_COMMITTED with shortened price_commitment
  SETTLED → SETTLED with public price only
  CANCEL → CANCELLED with no reason or price
  everything else → None
  ```

  Render these exact strings:

  ```text
  [block 12] DEAL#111 created — C_B: 0x3fa2…
  [block 13] C_S registered — 0x8c1d…
  [block 14] C_P registered — 0x77e9…
  [block 15] SETTLED: 9,000 KRW
  [block 15] CANCELLED — 공개된 값: 없음
  ```

- [ ] **Step 4: Run the focused tests and verify they pass**

  Run:

  ```bash
  python3 -m unittest test_python_demo.py -v
  ```

- [ ] **Step 5: Commit the pure projection**

  ```bash
  git add python_demo.py test_python_demo.py
  git commit -m "feat: add sanitized observer event projection"
  ```

### Task 2: Broadcast public events to Observer clients

**Files:**
- Modify: `/Users/taemin/Developer/Midnight/midnight-counter/python_demo.py`
- Modify: `/Users/taemin/Developer/Midnight/midnight-counter/test_python_demo.py`

**Interfaces:**
- `RelayState.public_events: list[dict[str, Any]]` stores the current demo's public history.
- `RelayState.public_clients: set[RelayHandler]` stores Observer connections.
- `RelayState.publish_public(message: dict[str, Any]) -> None` assigns the next block, stores the event, and broadcasts only the sanitized event.
- A `HELLO` message with role `observer` registers a public client and replays all stored public events.

- [ ] **Step 1: Add failing tests for event history and replay**

  Test that a newly connected Observer receives stored events in block order and that an `OFFER` never reaches the public event list.

- [ ] **Step 2: Run the focused tests and verify they fail**

  ```bash
  python3 -m unittest test_python_demo.py -v
  ```

- [ ] **Step 3: Add relay-side public event history**

  Start the synthetic block counter at `12`. On each incoming raw message, call `publish_public` only for the five public message types. Do not broadcast the raw message to Observer clients.

- [ ] **Step 4: Add Observer registration and replay**

  Keep Buyer/Seller routing unchanged. When an Observer sends `HELLO`, replay `public_events` and then stream future sanitized events.

- [ ] **Step 5: Run the focused tests and verify they pass**

  ```bash
  python3 -m unittest test_python_demo.py -v
  ```

- [ ] **Step 6: Commit relay projection**

  ```bash
  git add python_demo.py test_python_demo.py
  git commit -m "feat: broadcast public events to observer clients"
  ```

### Task 3: Add the Observer terminal mode

**Files:**
- Modify: `/Users/taemin/Developer/Midnight/midnight-counter/python_demo.py`
- Modify: `/Users/taemin/Developer/Midnight/midnight-counter/README.md`

**Interfaces:**
- `run_observer() -> None` connects as role `observer`, receives public events, and prints the rendered line.
- CLI accepts `python3 python_demo.py observer` in addition to `relay` and the default Buyer/Seller client mode.

- [ ] **Step 1: Add a failing CLI/output test**

  Verify the Observer renderer prints the four-line success sequence and the three-line cancellation sequence without raw negotiation fields.

- [ ] **Step 2: Implement `run_observer()`**

  Show this header and status text:

  ```text
  === Observer (누구나 볼 수 있는 온체인 상태) ===
  공개 이벤트를 기다리는 중...
  ```

  For every `PUBLIC_EVENT`, print one rendered line. Do not print a raw JSON payload.

- [ ] **Step 3: Update README run instructions and demo script**

  Document this order:

  ```bash
  python3 python_demo.py relay
  python3 python_demo.py observer
  python3 python_demo.py
  python3 python_demo.py
  ```

  Explain that the block numbers and commitments are simulated in Python, while the displayed public boundary matches the intended Midnight ledger view.

- [ ] **Step 4: Run syntax, unit, and manual success/failure checks**

  ```bash
  python3 -m py_compile python_demo.py
  python3 -m unittest test_python_demo.py -v
  npm run test:agents
  npm test --workspace contract -- --run
  git diff --check
  ```

- [ ] **Step 5: Commit Observer mode**

  ```bash
  git add python_demo.py README.md test_python_demo.py
  git commit -m "feat: add public observer terminal"
  ```

## Self-review checklist

- [ ] Observer gets only the five specified event types.
- [ ] Observer never receives a raw offer, counter, accept, budget, minimum price, reason, or `(p, r_P)`.
- [ ] Success displays exactly four public state lines.
- [ ] Cancellation displays no price and says `공개된 값: 없음`.
- [ ] Prefixes are visibly shortened with `0x` and `…`.
- [ ] Synthetic block numbers are monotonic and documented as simulation values.
- [ ] Existing Buyer/Seller negotiation and proof-order behavior remains unchanged.
