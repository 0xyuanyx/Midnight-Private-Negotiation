# Midnight Private Negotiation Display — Design System

## Product and Scope

A single desktop presentation page that shows three equal terminal panels in one horizontal row:

1. Buyer
2. Seller
3. Observer

This draft is appearance-only. Use static, realistic sample lines. Show one clear local price input at the top of the Buyer panel and one at the top of the Seller panel; these are presentation controls only and have no terminal connection or submit action. Do not implement or depict WebSocket controls, connection settings, transaction explorer tables, dashboards, charts, or explanatory cards.

The audience includes both blockchain-aware and general developers. The screen must be understandable from a distance without extra interface explanations.

## Primary Style Source

Inspired by the current official Midnight Network homepage: https://midnight.network/

Observed computed styles on 2026-07-25:

- Main canvas: `#101010`
- Primary accent: `#0000FE`
- Primary text: `#FFFFFF`
- Muted text: `#A8A8A8`
- Dividers: white at approximately 15% opacity
- Official desktop wordmark footprint: approximately 116 × 26px

Use the official accent exactly, but only on a small status point, active cursor, or input focus ring. Never use it as a large fill, panel background, gradient, or glow.

Semantic colors are restricted to terminal text:

- Metadata and timestamps: `#A8A8A8`
- Protocol actions and current stages: `#9A9AFF`
- Private input labels: `#D0B36C`
- Success and final states: `#9FB8A3`
- Primary messages and values: `#FFFFFF`

Do not tint panel backgrounds. Do not color every token; each hue has one stable meaning.

## Brand Philosophy

- Private and public data boundaries should be visually obvious.
- The interface should state what happened, not advertise what it means.
- The interface may state that an AI agent is negotiating, but must never reveal negotiation messages, reasoning, proposals, or intermediate prices.
- Buyer, Seller, and Observer have equal importance and equal panel width.
- The page should feel like a carefully built presentation console, not a product dashboard.

## Page Architecture

- `min-height: 100dvh`
- Slim 56px header
- Left side: actual Midnight wordmark or an accurate neutral wordmark treatment; never invent a new logo symbol
- Header title only: `Private negotiation demo`
- No navigation, hero copy, CTA, subtitle, badge, metrics, footer, or help text
- Main area: three equal-height panels in a 3-column CSS grid
- 12–16px gap between panels and 20–28px page padding
- Panel order is fixed: Buyer, Seller, Observer

## Terminal Panel

- Background `#151515`
- Panel header `#191919`
- Border `#343434`, 1px
- Radius 6px maximum
- No shadow
- Panel header height around 42px
- Role label in 12–13px semibold text
- Optional tiny `#0000FE` status point, without a `LIVE` label
- Terminal body padding 20–24px
- Terminal log size 15–17px with generous 1.7 line-height
- Use tabular numerics and align timestamps/block identifiers
- Keep each log line short enough for a presentation screen

## Private Limit Inputs

- Buyer only: `MAXIMUM PRICE`, sample value `110,000`, currency `KRW`
- Seller only: `MINIMUM PRICE`, sample value `95,000`, currency `KRW`
- Observer has no input
- Render each as a compact terminal prompt row above the logs
- Use a real, visibly editable text or numeric input element in the eventual implementation
- Keep the surface transparent; use a single `#343434` bottom rule rather than an inset card
- Label uses `#D0B36C`; entered value uses `#FFFFFF`; currency and prefix use `#A8A8A8`
- Focus uses a clear `#0000FE` outline with offset
- Minimum interaction height is 44px
- No submit button, helper card, connection status, or explanatory copy

## Typography

- Korean UI text: Pretendard
- English role labels and header: Outfit or Pretendard
- Terminal logs: native system monospace stack
- Avoid Inter, serif display fonts, oversized headings, decorative tracking, thin weights, and text shadows

## Sample Content

Use only technically plausible phrases from the existing demo:

**Buyer**
- MAXIMUM PRICE · 110,000 KRW
- wallet ready
- private state loaded
- deal created
- AI agent negotiating…

**Seller**
- MINIMUM PRICE · 95,000 KRW
- wallet ready
- contract attached
- seller joined
- AI agent negotiating…

**Observer**
- WAITING_SELLER
- OPEN

The primary visual draft captures the negotiation-in-progress moment, so Observer stops at `OPEN`. `AUTHORIZED` and `SETTLED · 100,000 KRW` appear only after negotiation completes.

Observer is not a block explorer. Do not list unrelated transactions, gas, addresses, charts, or complete commitment values.

## Motion and States

While negotiation is active, the final line in Buyer and Seller shows one small terminal spinner followed by `AI agent negotiating…`. Use a quiet monospace braille sequence such as `⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏`; only the spinner glyph uses `#0000FE`, while the literal status text uses `#9A9AFF`. The spinner stops and is replaced by a completion or error line when the state changes. Under `prefers-reduced-motion`, keep a single static glyph.

Do not show agent messages, chain-of-thought, proposals, counteroffers, private prices, or intermediate negotiation details in any panel. No shimmer, marquee, pulsing glow, or fake typing animation.

## Responsive Behavior

- Desktop presentation is primary at 1440 × 900 or similar 16:9/16:10 viewport.
- Preserve the equal three-column composition at widths of 1024px and above.
- Below 1024px, stack panels only as a functional fallback.
- Never introduce horizontal page scrolling.

## Hard Bans

- No purple/blue gradients despite the blue brand accent
- No neon glow
- No glassmorphism
- No macOS traffic-light window dots
- No three separate marketing cards with large empty padding
- No dashboard widgets, KPIs, charts, or explorer table
- No `LIVE`, `Powered by`, slogans, fabricated metrics, or explanatory marketing copy
- No ad hoc colors beyond the semantic text palette
- No colored panel backgrounds or rainbow syntax highlighting
- No agent conversation, reasoning, proposals, counteroffers, or intermediate price logs
- No terminal integration, WebSocket controls, or submit controls in this scope

Use ONLY the fonts, colors, spacing, and component styles defined in this design system. Do not introduce any fonts, colors, or visual styles not in the design system.
