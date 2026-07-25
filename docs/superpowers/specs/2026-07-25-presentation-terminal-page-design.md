# Presentation Terminal Page Design

**Date:** 2026-07-25  
**Status:** Approved visual direction; implementation not started

## Goal

Create a single presentation webpage that makes the existing Buyer, Seller, and Observer terminal views legible to an audience. The page should show only the three terminal surfaces in a quiet, honest composition.

The memorable point is: private limits stay private while the protocol proves that the agreed price satisfies both policies.

## Current Scope

This iteration is appearance-only.

Included:

- A slim Midnight-branded page header
- Three equal terminal panels in Buyer → Seller → Observer order
- Static, technically plausible sample logs
- Desktop presentation layout with a narrow responsive fallback
- Official Midnight point color taken from the rendered official website

Excluded:

- WebSocket or SSE
- Terminal input
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

The saturated accent is a user-requested brand exception to the default calm-design saturation limit. It is restricted to a small status point, cursor, or one active log line.

## Components

### PageHeader

Renders the wordmark and the literal title. Height is approximately 56px with a single bottom divider.

### TerminalGrid

Owns the equal three-column desktop layout and the narrow-screen stack fallback. It contains no business logic.

### TerminalPanel

Receives a role label and static log lines. It renders a compact panel header and a scroll-safe terminal body.

### TerminalLine

Aligns time or block metadata, phase, and message. The final implementation may model line variants such as default, muted, accent, and error, but this appearance-only phase uses static fixtures.

## Static Content

Buyer sample lines cover wallet readiness, private-state loading, deal creation, policy proof, and hidden-price authorization.

Seller sample lines cover wallet readiness, contract attachment, joining, proposal acceptance, and settlement.

Observer sample lines cover only `WAITING_SELLER`, `OPEN`, `AUTHORIZED`, and `SETTLED`. It must not resemble a full-chain transaction feed.

## Data Flow

There is no external data flow in this scope. Static fixture data lives with the page and is rendered directly into the three panels.

A future iteration may replace fixtures with independent role streams, but no adapter, protocol, socket, server, or terminal integration is introduced now.

## Error Handling

External connection errors do not exist in this scope. Long sample strings must wrap inside their panel without causing page-level horizontal scrolling.

## Accessibility

- Preserve at least WCAG AA contrast for primary and muted text.
- Use semantic headings for the page and each role.
- Do not rely on blue alone to communicate state; active lines retain readable text.
- Do not add unlabeled icon buttons or decorative controls.
- Respect reduced motion by shipping no required animation.

## Verification

- Render at a desktop presentation viewport, approximately 1440 × 900.
- Confirm all three panels have equal width and height.
- Confirm Buyer → Seller → Observer ordering.
- Confirm no page-level horizontal overflow.
- Confirm Observer contains only the demo contract states.
- Confirm the exact `#0000FE` accent is used sparingly.
- Confirm gradients, glow, glassmorphism, traffic-light dots, marketing copy, KPI cards, and charts are absent.
- Confirm the page still renders in a single-column fallback below 1024px.

## Deferred Work

Independent terminal execution, source log formatting, a local log bridge, WebSocket transport, live stream states, and reconnect behavior are deferred to a later design and implementation cycle.
