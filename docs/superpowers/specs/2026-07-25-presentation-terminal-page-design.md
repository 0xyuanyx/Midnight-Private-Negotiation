# Presentation Terminal Page Design

**Date:** 2026-07-25  
**Status:** Approved visual companion to the v2 system design

This document defines visual presentation details. The authoritative runtime, privacy, negotiation, encryption, error, and testing requirements are in [`2026-07-25-private-negotiation-dapp-v2-design.md`](2026-07-25-private-negotiation-dapp-v2-design.md). If the two documents conflict, the v2 system design takes precedence.

## Goal

Create a single presentation webpage that makes the existing Buyer, Seller, and Observer terminal views legible to an audience. The page should show only the three terminal surfaces in a quiet, honest composition.

The memorable point is: private limits and negotiation contents stay private while the protocol proves that the agreed price satisfies both policies.

## Current Scope

This page is the live presentation surface for the v2 demo. Buyer and Seller inputs connect to their independent role runtimes, while Observer renders sanitized public events from the Midnight Indexer.

Included:

- A slim Midnight-branded page header
- Separate four-digit product-code inputs inside the Buyer and Seller panels
- Three equal terminal panels in Buyer → Seller → Observer order
- A Buyer `MAXIMUM PRICE` input and Seller `MINIMUM PRICE` input
- Meaning-based color on terminal text only
- A minimal terminal spinner and `AI agent negotiating…` status while negotiation is active
- Live sanitized events rendered through the shared log contract
- Desktop presentation layout with a narrow responsive fallback
- Official Midnight point color taken from the rendered official website

Excluded:

- Block explorer tables, unrelated transactions, charts, KPIs, explanatory cards, or footer content
- Raw stdout, stack traces, wallet addresses, prover URLs, private-state fields, GPT prompts, discarded candidates, and PolicyGuard results

## Visual Direction

The approved layout is an equal three-way horizontal split. It should feel like one presentation console with three clearly bounded roles, not three product cards.

The header contains only:

- The official Midnight wordmark or an accurate non-invented wordmark treatment
- `비공개 협상 데모`

There is no navigation, subtitle, status badge, CTA, or marketing copy.

The official Midnight homepage was inspected on 2026-07-25. Its relevant computed styles are:

- Canvas: `#101010`
- Accent: `#0000FE`
- Primary text: `#FFFFFF`
- Muted text: `#A8A8A8`
- Divider: white at approximately 15% opacity

The saturated accent is a user-requested brand exception to the default calm-design saturation limit. It is restricted to a small status point, cursor, or input focus outline.

Panel surfaces remain neutral. Color is applied only to text with stable semantic roles:

- Metadata: `#A8A8A8`
- Protocol action/current stage: `#9A9AFF`
- Private input label: `#D0B36C`
- Success/final state: `#9FB8A3`
- Primary message/value: `#FFFFFF`

This is not general-purpose syntax highlighting. A color must not be introduced without a semantic role.

## Components

### PageHeader

Renders the wordmark and the literal title. Height is approximately 56px with a single bottom divider.

### TerminalGrid

Owns the equal three-column desktop layout and the narrow-screen stack fallback. It contains no business logic.

### TerminalInputPrompt

Buyer and Seller render product-code and private-limit input only as the last terminal line after Demo Controller confirms `RUNTIME_READY` from all three runtimes. Product code accepts exactly four digits. Enter removes the prompt and typed line; the submitted value is reflected only in the read-only status row above the log. Observer has no input prompt.

### TerminalPanel

Receives a role label and sanitized live log lines. Buyer and Seller additionally render their current input state above the logs. Observer renders no private input.

### PrivateStatusRow

Buyer uses `구매자 최대 한도`; Seller uses `판매자 최소 금액`. Before entry, the fixed row shows an empty amount slot. After the value is stored in role-local private state, it shows a lock plus the formatted value, for example `4821 · 구매자 최대 한도 🔒 110,000 KRW`. The amount never appears in ordinary logs, the other role runtime, GPT input, Relay plaintext, or Observer.

### TerminalLine

Uses the single format `[HH:mm:ss] 메시지`. Because every visible line is a sanitized system event, `[SYSTEM]`, `[BUYER]`, and `[SELLER]` tags are omitted. Time is gray, ordinary prose is white, private input labels are gold, and only visible protocol identifiers such as `commitment`, `OPEN`, and `AUTHORIZED` are lavender. Internal contract actions such as `createDeal` and `joinDeal` never enter the browser display stream. The only full sage-green line is Observer `SETTLED · 최종 금액`.

### NegotiatingStatus

After both commitments are ready, Buyer and Seller receive `협상을 시작합니다.` at the same timestamp with a small terminal spinner. Approximately 0.8 seconds later, the same replacement row becomes `AI 에이전트가 비공개로 협상하고 있습니다.` with the spinner still active. It intentionally contains no proposal amount, counteroffer, agent message, reasoning trace, or intermediate decision.

The spinner is the only recurring motion. It runs only while the state is negotiating, stops on completion or error, and becomes a static glyph under `prefers-reduced-motion`.

## Execution Sequence

1. 페이지 로드 시 세 패널의 빈 터미널 외곽만 표시
2. DApp 실행 후 Buyer·Seller·Observer 프로세스의 `RUNTIME_READY` 확인
3. Buyer와 Seller 터미널 마지막 줄에 상품 코드 입력 프롬프트 표시
4. Buyer와 Seller가 각자 동일한 네 자리 상품 코드 입력
5. Buyer 최대 한도와 Seller 최소 금액 입력
6. 각 조건을 역할별 로컬 비공개 상태에 저장하고 자기 패널에서 잠긴 값으로 표시
7. 먼저 입장한 역할에는 상대 입장 대기를, 먼저 조건을 입력한 역할에는 상대 commitment 대기를 표시
8. 상대 입장·commitment 완료 이벤트는 기존 대기 행을 교체
9. 구매자·판매자 commitment 생성. 내부 `createDeal`·`joinDeal` 이벤트는 화면 스트림에서 제외
10. 양쪽에 같은 시각으로 `협상을 시작합니다. ⠋` 표시
11. 약 0.8초 뒤 같은 행을 `AI 에이전트가 비공개로 협상하고 있습니다. ⠋`로 교체
12. Buyer·Seller에 같은 시각으로 `모든 조건을 공개하지 않고 증명하고 있습니다.` 표시
13. 양쪽 조건 검사가 끝나면 같은 시각으로 증명 완료 표시
14. 성공 시 합의 금액 공개 및 온체인 기록
15. 실패 시 금액을 공개하지 않고 협상 결렬만 기록

## Runtime Content

The browser does not schedule presentation logs from page load or timers. Every displayed log comes from a validated runtime `DemoEvent` over the local WebSocket. Waiting lines use a stable replacement key so completion stops the spinner and replaces the waiting state.

Buyer sample lines cover room entry, private-condition storage, commitment readiness, and the non-disclosing negotiation status.

Seller sample lines cover room entry, private-condition storage, commitment readiness, and the non-disclosing negotiation status.

Observer sample lines are state-dependent. During negotiation it shows public deal creation, seller participation, and current state `OPEN`. After Buyer authorization it appends `AUTHORIZED · 가격 커밋 등록(금액 비공개)`, with no amount. Only after successful settlement does it append `SETTLED · 100,000 KRW`. On failure it appends only `협상이 결렬되었습니다.` with no amount. It must not resemble a full-chain transaction feed.

No view displays the AI agents' conversation, reasoning, proposals, counteroffers, private price limits, or intermediate prices as logs. Buyer and Seller see only their own input field plus a coarse status; Observer sees only public contract state.

Runtime events carry an explicit audience. `ROLE_LOCAL` lines such as private-condition storage and peer-input waiting use the private text role. `PARTICIPANTS` lines shared by Buyer and Seller use the protocol text role. `PUBLIC` lines belong to Observer and use the public-state tone. Color is supplementary; the literal message must still identify the state.

All prose UI and log messages are Korean. English remains only where it is a real role name or visible protocol identifier, including `Buyer`, `Seller`, `Observer`, `commitment`, `OPEN`, `AUTHORIZED`, and `SETTLED`.

## Data Flow

Buyer and Seller inputs travel over one local WebSocket to the trusted demo-only Controller, which forwards each command immediately to the matching isolated role process over IPC without storing or logging the limit. Each role process pushes only sanitized `DemoEvent` messages back over IPC; the Controller validates the sender role and routes them to the matching web panel. Observer receives public contract data through Midnight Indexer and sends sanitized public events through the same path. The page never renders raw role stdout or derives Observer output from private browser inputs.

## Error Handling

Formatting errors remain attached to the relevant input. Runtime, Relay, GPT, proof, transaction, and Observer failures are mapped to fixed Korean message codes from the v2 system design. Raw exceptions and secret-bearing diagnostic values never appear in the terminal panels. Long public strings wrap without page-level horizontal scrolling.

## Accessibility

- Preserve at least WCAG AA contrast for primary and muted text.
- Use semantic headings for the page and each role.
- Associate both limit inputs with visible labels and expose their currency in accessible text.
- Associate both product-code inputs with their visible Korean labels.
- Provide a keyboard-visible focus style for inputs.
- Do not rely on color alone to communicate state; each line retains a literal text label.
- Do not add unlabeled icon buttons or decorative controls.
- The spinner has the adjacent literal status `AI 에이전트가 비공개로 협상하고 있습니다.`, so motion is not the sole state signal.
- Under reduced motion, the spinner remains static without hiding the status.

## Verification

- Render at a desktop presentation viewport, approximately 1440 × 900.
- Confirm all three panels have equal width and height.
- Confirm Buyer → Seller → Observer ordering.
- Confirm no page-level horizontal overflow.
- Confirm Observer contains only the demo contract states.
- Confirm the exact `#0000FE` accent is used sparingly.
- Confirm color appears on text only, except the small status point/cursor and input focus outline.
- Confirm Buyer and Seller each have one product-code state and one role-specific limit state; Observer has neither.
- Confirm both locked role rows show their own submitted value with a lock and never repeat the amount in logs.
- Confirm the negotiating state exposes only the spinner and literal status, with no agent content or intermediate price.
- Confirm Observer stops at `OPEN` in the negotiating-state preview.
- Confirm success is the only path that reveals an agreed amount and failure reveals none.
- Confirm prose is Korean except for real role and protocol identifiers.
- Confirm all semantic text colors meet WCAG AA against `#151515`.
- Confirm gradients, glow, glassmorphism, traffic-light dots, marketing copy, KPI cards, and charts are absent.
- Confirm the page still renders in a single-column fallback below 1024px.

## Deferred Work

The implementation plan will choose the web framework, runtime transport, process orchestration, OpenAI SDK/model, cryptography library, deployment target, and CI. Those choices must preserve the interfaces and privacy boundaries in the v2 system design.
