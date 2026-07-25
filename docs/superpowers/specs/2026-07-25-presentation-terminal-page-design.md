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

### ProductCodeInput

Buyer and Seller each render their own `상품 코드` field. It accepts exactly four digits, with `4821` as the reference value. After submission, the same location becomes the role-specific limit row. Observer has no product-code input.

### TerminalPanel

Receives a role label and sanitized live log lines. Buyer and Seller additionally render their current input state above the logs. Observer renders no private input.

### PrivateLimitInput

Buyer uses `구매자 최대 한도`; Seller uses `판매자 최소 금액`. Each field contains the submitted product code, a divider, an editable numeric value, and the `KRW` suffix in one terminal-like row. Entry examples are `110,000` and `95,000`. After the value is stored in role-local private state, the field becomes read-only and shows a lock plus the formatted value, for example `4821 · 구매자 최대 한도 🔒 110,000 KRW`. The amount never appears in logs, the other role runtime, GPT input, Relay plaintext, or Observer. The field has a visible label, a minimum 44px interaction height, and a keyboard-visible `#0000FE` focus outline.

### TerminalLine

Uses the single format `[HH:mm:ss] [SYSTEM] 메시지`. It aligns timestamp, source tag, and message. Line segments use only the documented metadata, protocol, success, private, primary, and error roles. Panel backgrounds do not change by role or state.

### NegotiatingStatus

Buyer and Seller each show one final status line while their agents are negotiating. The line contains the literal text `AI 에이전트가 비공개로 협상하고 있습니다.` and a small terminal spinner. It intentionally contains no proposal amount, counteroffer, agent message, reasoning trace, or intermediate decision.

The spinner is the only recurring motion. It runs only while the state is negotiating, stops on completion or error, and becomes a static glyph under `prefers-reduced-motion`.

## Execution Sequence

1. Buyer와 Seller가 각자 동일한 네 자리 상품 코드 입력
2. Buyer 최대 한도와 Seller 최소 금액 입력
3. 각 조건을 역할별 로컬 비공개 상태에 저장하고 자기 패널에서 잠긴 값으로 표시
4. 구매자 commitment 생성 및 `createDeal`
5. 판매자 commitment 생성 및 `joinDeal`
6. GPT 기반 에이전트의 비공개 협상
7. 구매자 증명: 합의 금액이 최대 한도 이하임을 값 공개 없이 증명
8. 판매자 증명: 합의 금액이 최소 금액 이상임을 값 공개 없이 증명
9. 성공 시 합의 금액 공개 및 온체인 기록
10. 실패 시 금액을 공개하지 않고 협상 결렬만 기록

## Preview Content

Buyer sample lines cover wallet readiness, private-state loading, deal creation, and the non-disclosing negotiation status.

Seller sample lines cover wallet readiness, contract attachment, joining, and the non-disclosing negotiation status.

Observer sample lines are state-dependent. During negotiation it shows public deal creation, seller participation, and current state `OPEN`. After Buyer authorization it appends `AUTHORIZED · 가격 커밋 등록(금액 비공개)`, with no amount. Only after successful settlement does it append `SETTLED · 100,000 KRW`. On failure it appends only `협상이 결렬되었습니다.` with no amount. It must not resemble a full-chain transaction feed.

No view displays the AI agents' conversation, reasoning, proposals, counteroffers, private price limits, or intermediate prices as logs. Buyer and Seller see only their own input field plus a coarse status; Observer sees only public contract state.

All prose UI and log messages are Korean. English remains only where it is a real role name or protocol identifier, including `Buyer`, `Seller`, `Observer`, `SYSTEM`, `commitment`, `createDeal`, `joinDeal`, `OPEN`, `AUTHORIZED`, and `SETTLED`.

## Data Flow

Buyer and Seller secret inputs go directly to their dedicated role runtime channels. Demo Controller receives lifecycle commands and already-sanitized display events only. Observer receives public contract data through Midnight Indexer and sends sanitized public events to Demo Controller. The page never renders raw role stdout or derives Observer output from private browser inputs.

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
