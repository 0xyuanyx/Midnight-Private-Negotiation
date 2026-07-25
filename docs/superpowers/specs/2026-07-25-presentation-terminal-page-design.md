# Presentation Terminal Page Design

**Date:** 2026-07-25  
**Status:** Revised visual direction; implementation not started

## Goal

Create a single presentation webpage that makes the existing Buyer, Seller, and Observer terminal views legible to an audience. The page should show only the three terminal surfaces in a quiet, honest composition.

The memorable point is: private limits and negotiation contents stay private while the protocol proves that the agreed price satisfies both policies.

## Current Scope

This iteration is appearance-only. The Buyer and Seller fields are local UI inputs; they are not connected to the demo terminals yet.

Included:

- A slim Midnight-branded page header
- Three equal terminal panels in Buyer → Seller → Observer order
- A Buyer `MAXIMUM PRICE` input and Seller `MINIMUM PRICE` input
- Meaning-based color on terminal text only
- A minimal terminal spinner and `AI agent negotiating…` status while negotiation is active
- Static, technically plausible sample logs
- Desktop presentation layout with a narrow responsive fallback
- Official Midnight point color taken from the rendered official website

Excluded:

- WebSocket or SSE
- Input submission or validation workflow
- Runtime or CLI changes
- Log bridge or server
- Live data, reconnect behavior, loading behavior, or stream errors
- Block explorer tables, unrelated transactions, charts, KPIs, explanatory cards, or footer content

## Visual Direction

The approved layout is an equal three-way horizontal split. It should feel like one presentation console with three clearly bounded roles, not three product cards.

The header contains only:

- The official Midnight wordmark or an accurate non-invented wordmark treatment
- `Private negotiation demo`

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

### TerminalPanel

Receives a role label and static log lines. Buyer and Seller additionally render a compact private-limit input above their logs. Observer renders no input.

### PrivateLimitInput

Buyer uses the label `MAXIMUM PRICE`; Seller uses `MINIMUM PRICE`. Each field contains a divider, editable numeric value, and `KRW` suffix in one terminal-like row. Sample values are `110,000` and `95,000`. The field has a visible label, a minimum 44px interaction height, and a keyboard-visible `#0000FE` focus outline. It has no submit button or external side effect in this phase.

### TerminalLine

Aligns time or block metadata, phase, and message. Line segments use only the documented metadata, protocol, success, private, primary, and error roles. Panel backgrounds do not change by role or state.

### NegotiatingStatus

Buyer and Seller each show one final status line while their agents are negotiating. The line contains a small terminal spinner and the exact literal text `AI agent negotiating…`. It intentionally contains no proposal amount, counteroffer, agent message, reasoning trace, or intermediate decision.

The spinner is the only recurring motion. It runs only while the state is negotiating, stops on completion or error, and becomes a static glyph under `prefers-reduced-motion`.

## Preview Content

Buyer sample lines cover wallet readiness, private-state loading, deal creation, and the non-disclosing negotiation status.

Seller sample lines cover wallet readiness, contract attachment, joining, and the non-disclosing negotiation status.

Observer sample lines are state-dependent. During negotiation it shows only `WAITING_SELLER` and current state `OPEN`. After successful negotiation, `AUTHORIZED` and `SETTLED · 100,000 KRW` may append. It must not resemble a full-chain transaction feed.

No view displays the AI agents' conversation, reasoning, proposals, counteroffers, private price limits, or intermediate prices as logs. Buyer and Seller see only their own input field plus a coarse status; Observer sees only public contract state.

## Data Flow

There is no external data flow in this scope. Static fixture data lives with the page and is rendered directly into the three panels. Buyer and Seller input values may change locally in their fields, but they are not submitted, synchronized, or used to derive Observer output.

A future iteration may replace fixtures with independent role streams, but no adapter, protocol, socket, server, or terminal integration is introduced now.

## Error Handling

External connection errors do not exist in this scope. Long sample strings must wrap inside their panel without causing page-level horizontal scrolling.

## Accessibility

- Preserve at least WCAG AA contrast for primary and muted text.
- Use semantic headings for the page and each role.
- Associate both limit inputs with visible labels and expose their currency in accessible text.
- Provide a keyboard-visible focus style for inputs.
- Do not rely on color alone to communicate state; each line retains a literal text label.
- Do not add unlabeled icon buttons or decorative controls.
- The spinner has the adjacent literal status `AI agent negotiating…`, so motion is not the sole state signal.
- Under reduced motion, the spinner remains static without hiding the status.

## Verification

- Render at a desktop presentation viewport, approximately 1440 × 900.
- Confirm all three panels have equal width and height.
- Confirm Buyer → Seller → Observer ordering.
- Confirm no page-level horizontal overflow.
- Confirm Observer contains only the demo contract states.
- Confirm the exact `#0000FE` accent is used sparingly.
- Confirm color appears on text only, except the small status point/cursor and input focus outline.
- Confirm Buyer and Seller each have one labeled input and Observer has none.
- Confirm the negotiating state exposes only the spinner and literal status, with no agent content or intermediate price.
- Confirm Observer stops at `OPEN` in the negotiating-state preview.
- Confirm all semantic text colors meet WCAG AA against `#151515`.
- Confirm gradients, glow, glassmorphism, traffic-light dots, marketing copy, KPI cards, and charts are absent.
- Confirm the page still renders in a single-column fallback below 1024px.

## Deferred Work

Input submission, validation rules, independent terminal execution, source log formatting, a local log bridge, WebSocket transport, live stream states, and reconnect behavior are deferred to a later design and implementation cycle.
