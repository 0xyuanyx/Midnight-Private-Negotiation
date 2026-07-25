# Midnight Private Negotiation Display — Design System

## Product and Scope

A single desktop presentation page that shows three equal terminal panels in one horizontal row:

1. Buyer
2. Seller
3. Observer

This draft is appearance-only. Use static, realistic sample lines. Do not implement or depict WebSocket controls, terminal input controls, connection settings, transaction explorer tables, dashboards, charts, or explanatory cards.

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

Use the official accent exactly, but only on a small status point, active cursor, or one current log line. Never use it as a large fill, gradient, or glow.

## Brand Philosophy

- Private and public data boundaries should be visually obvious.
- The interface should state what happened, not advertise what it means.
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

## Typography

- Korean UI text: Pretendard
- English role labels and header: Outfit or Pretendard
- Terminal logs: native system monospace stack
- Avoid Inter, serif display fonts, oversized headings, decorative tracking, thin weights, and text shadows

## Static Sample Content

Use only technically plausible phrases from the existing demo:

**Buyer**
- wallet ready
- private state loaded
- deal created
- buyer policy proof requested
- hidden price authorized

**Seller**
- wallet ready
- contract attached
- seller joined
- proposal accepted
- settlement submitted

**Observer**
- WAITING_SELLER
- OPEN
- AUTHORIZED
- SETTLED · 100 KRW

Observer is not a block explorer. Do not list unrelated transactions, gas, addresses, charts, or complete commitment values.

## Motion and States

The draft is static. No perpetual animations, shimmer, marquee, pulsing glow, or fake typing animation. If a cursor is shown, it should be a simple solid block without animation.

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
- No additional accent colors
- No terminal integration, WebSocket controls, or input fields in this scope

Use ONLY the fonts, colors, spacing, and component styles defined in this design system. Do not introduce any fonts, colors, or visual styles not in the design system.
