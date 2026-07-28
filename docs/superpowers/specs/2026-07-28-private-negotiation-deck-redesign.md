# Midnight Private Negotiation Deck Redesign

**Date:** 2026-07-28  
**Status:** Approved direction; implementation pending written-spec review  
**Source deck:** `/Users/taemin/Desktop/midnight-private-negotiation-demo-10min-simple-revised.pptx`  
**Target runtime:** 10-minute Korean presentation, 12 main slides plus 2 untimed Q&A appendix slides

## Communication Job

By the end, a Midnight hackathon audience should understand why private negotiation limits must remain role-local, how two independent proofs authorize one agreed price without revealing either limit, and what the working demo proves.

The audience should remember one sentence:

> **한도는 숨기고, 합의만 증명한다.**

The narrative arc is:

1. Reveal the negotiation paradox.
2. Show why the trust boundary matters.
3. Introduce the role-local architecture.
4. Make the two inequalities the conceptual center.
5. Distinguish public state from private input.
6. Explain AI's limited role.
7. Prepare the audience for the demo.
8. Show the demo.
9. Reveal what remained invisible.
10. Close with verified status and next steps.

## Preservation Contract

The redesign must preserve:

- The repository's authoritative `DESIGN.md`; it must not be edited for this deck.
- The official Midnight logo asset and its aspect ratio.
- Pretendard for Korean and Outfit for English labels, formulas, and numeric display.
- The existing semantic color meanings:
  - Private: `#D0B36C`
  - Proof/protocol: `#9A9AFF`
  - Verified/settled: `#9FB8A3`
  - Buyer heading: `#A9C2E6`
  - Seller heading: `#D6B879`
- The existing 16:9, 1280×720 slide size.
- The editorial vocabulary of flat fields, 1px dividers, aligned rows, and restrained node boundaries.
- The source deck's master → layout → slide hierarchy and editable PowerPoint objects.
- Existing `[Sources]` blocks in speaker notes, updated when content or claims change.
- The source deck's no-gradient, no-glow, no-glass, no-decorative-pictogram rules.
- The source file itself; the final deck must be exported as a separate copy.

The redesign may change:

- Narrative order and total slide count.
- Background from the presentation default `#0A0A0A` to the existing Canvas token `#101010`, as an explicit response to user feedback that the black field pulls attention.
- Slide-local element positions, sizes, copy, and semantic emphasis.
- Footer and page-number contrast.
- The old demo amounts.
- The Relay slide's position, moving it from the main narrative to the appendix.

## Visual Direction

The deck should feel deliberate, calm, and stage-readable rather than handmade or generator-polished. The intended calm-design settings for this deliverable are:

- `LANGUAGE=ko`
- `Mode=B`
- `DESIGN_VARIANCE=5`
- `MOTION_INTENSITY=2`
- `VISUAL_DENSITY=5`

This does not modify the dial metadata in `DESIGN.md`; it is a tactical composition target for the deck.

### Canvas and Contrast

- Slide canvas: `#101010`
- Actual product or system surfaces only: `#151515` or `#191919`
- Primary title and key claims: `#FFFFFF`
- Audience-facing secondary text: `#A8A8A8` or brighter
- Minimum readable muted text: `#9C9C9C`
- Border/divider: `#343434`
- Remove every remaining `#666666` text run, including footer and slide number.
- Do not use `#0000FE` for audience-facing text. The official logo may retain its source appearance.

### Typography

- Deck title: Pretendard 700, 54–60pt
- Slide title: Pretendard 700, 40–46pt, one line only
- Primary body: Pretendard 500–600, 22–26pt
- Supporting consequence or tail line: Pretendard 500, 20–22pt
- Footer and slide number: Pretendard/Outfit, 11–12pt, `#9C9C9C`
- Formula hero: Outfit 600–700, 52–64pt, tabular numerals
- Inequalities: Outfit 600, 38–46pt
- Amounts and protocol states: Outfit with tabular numerals
- Korean text wrapping must preserve words; copy should be shortened before any font reduction.

### Eye-Path Contract

Every main slide must have exactly three reading levels:

1. Top-left claim title.
2. One dominant central object or comparison.
3. One bottom consequence sentence.

Equal-weight multi-column structures are allowed only when the equality is itself meaningful. Otherwise, one item must be visually dominant. Adjacent slides must vary silhouette among comparison, boundary map, formula hero, timeline, list, video, and closing statement.

### Accent Budget

Each slide uses at most two saturated semantic colors plus neutral text. The colors must identify meaning, not decorate headings:

- Gold marks private values or non-disclosure.
- Lavender marks proof or authorization.
- Sage marks verification, settlement, or completed state.
- Buyer/Seller heading colors appear only where role distinction is required.

## Main Slide Design

### 1. Title — 20 seconds

**Source pattern:** source slide 1, preserve and edit in place only if needed.

- Keep the current title, subtitle, technology line, and logo.
- Change only the canvas and remaining footer/page-number contrast.
- Maintain the current asymmetric left anchor and large empty field.

### 2. Hook: 협상의 역설 — 50 seconds

**Source pattern:** source slide 3's two-column comparison.

- Title: `당신의 마지노선을 말하는 순간, 협상은 끝난다`
- Left: `구매자` / `이 이상은 못 낸다`
- Right: `판매자` / `이 밑으로는 못 판다`
- Replace amounts with five gold concealment marks, drawn as typography rather than emoji.
- Bottom: `합의하려면 조건을 맞춰봐야 하고, 조건을 밝히면 협상력을 잃는다`
- The gold concealment marks are the dominant central read.

### 3. Trust Boundary — 50 seconds

**Source pattern:** source slide 2's horizontal process, reduced from four positions to three.

- Title: `문제는 알고리즘이 아니라, 누가 비밀을 보는가`
- Three columns:
  - `중개 플랫폼` — 서버가 양쪽 한도를 열람
  - `AI 비서` — 프롬프트에 적는 순간 모델 제공자에게 전송
  - `공개 블록체인` — 원문 기록은 되돌릴 수 없음
- Bottom: `어디로 보내든, 받은 쪽이 내 패를 쥔다`
- Use neutral text and one gold privacy-risk phrase per column; do not turn the columns into cards.

### 4. Idea: Role-Local Privacy — 60 seconds

**Source pattern:** source slide 8's three-column field, without KPI styling.

- Title: `한도는 어디에도 보내지 않는다`
- Buyer maximum and Seller minimum are the two private local fields.
- Observer receives only public state and is visually quieter.
- Bottom flow:
  - `AI가 대신 협상` → `ZK로 조건 증명` → `최종 금액만 온체인`
- Tail: `성사되지 않으면? 공개되는 금액도 없다.`
- Lock meaning must be expressed by the words `비공개 상태`; a decorative emoji is not required.

### 5. Hero: Two Independent Proofs — 80 seconds

**Source pattern:** source slide 4, substantially rebalanced.

- Title: `서로 믿지 않는 두 사람이, 각자 자기 비밀만 증명한다`
- Center: `p = 4,500 KRW`, Outfit 52–64pt.
- Left proof: `p ≤ 내 최대 한도`, lavender, Outfit 38–46pt.
- Right proof: `내 최소 금액 ≤ p`, lavender, Outfit 38–46pt.
- Gold support under both: `한도 원문은 공개 안 함`
- Bottom:
  - `두 증명이 모두 통과했을 때에만`
  - `→ 금액 공개`
- Tail: `누구도 상대의 한도를 알 필요가 없다`
- This slide is the deck's primary memorability moment.
- Speaker notes must include the exact phrase `서로 신뢰가 없는 두 당사자의 비공개 값 관계 증명`.

### 6. Public Record vs Private Input — 50 seconds

**Source pattern:** source slide 3, retain its two-column hierarchy.

- Keep the existing content structure.
- Replace the bottom sentence with:
  - `공개는 자동이 아니라 명시적 선택이다 — 원문 대신 조건이 맞았다는 사실만 증명한다`
- Keep `공개 기록` lavender and `비공개 입력` gold.

### 7. AI Proposes, Local Logic Decides — 50 seconds

**Source pattern:** source slide 2, moved later in the narrative.

- Preserve the four-stage flow.
- Emphasize `로컬 정책` with gold, not sage, because this is where private limits are applied.
- Keep: `정확한 한도는 AI 요청에 포함하지 않는다.`
- Add: `모델이 실패해도 로컬 로직이 거래를 끝까지 완료한다.`
- The second bottom sentence is supporting evidence and must not compete with the first.

### 8. Demo Scenario — 30 seconds

**Source pattern:** source slide 5's horizontal progression, expanded to five stages.

- Title: `데모 — 상품 코드 1111`
- Top amount line:
  - `BUYER 최대 5,000 KRW`
  - `SELLER 최소 2,000 KRW`
  - Both marked as private without exposing them to the opposite role.
- Five numbered stages:
  1. 같은 코드로 입장
  2. 각자 한도 입력
  3. AI 비공개 협상
  4. 조건을 공개하지 않고 증명
  5. `OPEN → AUTHORIZED → SETTLED · 4,500 KRW`
- Stage 4 carries the note `실제 수십 초 · 편집 안 함`.
- Speaker notes: `증명 대기 시간은 실제 proof server 연산입니다.`

### 9. Demo Video — 90 seconds

**Source pattern:** source slide 7.

- Keep a single media frame and no explanatory body copy.
- Update the speaker notes to `5,000 / 2,000 / 4,500`.
- The supplied PPTX currently contains a static PNG, not an embedded video.
- The discovered Desktop recordings show the old amount set and must not be embedded.
- Until a matching new recording is available, preserve the existing media frame as a replaceable placeholder and do not fabricate a new screenshot or video.

### 10. What the Audience Did Not See — 60 seconds

**Source pattern:** source slide 3's two columns.

- Title: `방금 보지 못한 것들`
- Left, gold: `끝까지 비공개`
  - 구매자 최대 한도
  - 판매자 최소 금액
  - 중간 제안 금액들
  - 협상 라운드 수
  - AI 대화 전문
- Right, sage/lavender:
  - `OPEN` — 거래 개시
  - `AUTHORIZED` — 가격 조건 승인 · 금액 비공개
  - `SETTLED` — 거래 확정 · `4,500 KRW`
- Bottom: `이 “보이지 않음”은 버그가 아니라, 이 앱의 기능입니다.`
- Speaker-note opening: `방금 영상, 심심하지 않으셨나요? 그게 핵심입니다.`
- This is the deck's secondary memorability moment.

### 11. Current State and Next Steps — 40 seconds

**Source pattern:** source slide 3's two-column structure.

- Left: `검증 완료`
  - 로컬 Midnight 네트워크 계약 배포와 상태 전이
  - Node · Indexer · proof server
  - 실제 AI provider 연동 협상
  - 자동 검사 `36 + 8`
  - 동작과 비노출을 함께 검증
- Right: `다음 단계`
  - 공개 네트워크 배포
  - 협상 시나리오 고도화
  - Midnight 해커톤에서 계속 개발
- Bottom: `완성 보고가 아니라, 계속 만들 프로젝트의 첫 공개입니다.`
- Do not present `36 / 8 / 5` as three equal KPI cards.

### 12. Closing — 20 seconds

**Source pattern:** source slide 9.

- Preserve the current closing statement and semantic summary.
- Add one neutral line:
  - `github.com/0xyuanyx/Midnight-Private-Negotiation`
- Keep the URL readable but subordinate to the closing claim.

## Q&A Appendix

### A. Ciphertext Relay

**Source pattern:** source slide 6.

- Move the existing Relay slide here.
- Preserve its content and notes.
- Apply the new canvas and minimum contrast rules.
- Keep it out of the timed main narrative.

### B. Commitment Is Not the Proof

**Source pattern:** source slide 4's two-row proof relation.

- Title: `commitment만으로는 조건을 증명할 수 없다`
- Row 1: `commitment` — 비밀값을 바꾸지 않았다는 공개 고정점
- Row 2: `ZK proof` — 그 비밀값이 합의 조건을 만족한다는 증명
- Bottom: `고정값과 관계 증명은 서로 다른 역할이다.`
- This slide is for likely Q&A only and receives no main-deck timing.

## Superdesign Review Scope

Superdesign is a visual review aid, not the PowerPoint authoring source.

- Reuse the existing `Midnight Private Negotiation Display` project.
- Create a 1280×720 static draft for slide 5 only.
- Compare exactly two branches:
  1. Central price hero with proofs flanking it.
  2. Two proof fields with the price as their shared axis.
- Pass the authoritative `DESIGN.md` as context.
- The selected branch may inform hierarchy and spacing only.
- Do not copy new fonts, colors, rounded-card styling, gradients, or foreign visual language from the generated draft.
- The existing PPTX remains the authoritative template for final implementation.

## Implementation Architecture

The final deck will be produced from the source PPTX with `@oai/artifact-tool`:

1. Inspect every source slide and its layout.
2. Map every output slide to a source slide.
3. Duplicate mapped source slides into a starter deck.
4. Rewrite, reposition, or delete only explicitly mapped inherited objects.
5. Preserve master/layout relationships and notes.
6. Export a new PPTX without overwriting the source.

No `python-pptx`, direct OOXML mutation, rasterized slide rebuild, or alternate presentation template is allowed.

## Error and Media Handling

- If an inherited slide cannot support the requested content without overlays or clipping, remap it to another source slide.
- If artifact-tool cannot preserve the source hierarchy, stop rather than rebuilding a visually similar deck.
- If the updated demo media is unavailable, keep an explicit replaceable media placeholder; do not use an old-amount recording and do not fabricate evidence.
- If a source claim changes, update or add its `[Sources]` note block.
- If title or body copy wraps unexpectedly, shorten copy or revise layout before reducing font size.

## Verification

### Presentation QA

- Render all 14 slides.
- Inspect every slide at full size.
- Create a montage for narrative pacing only.
- Run overflow and template-fidelity checks.
- Confirm no unintended overlaps, clipping, unresolved placeholders, or broken connectors.
- Confirm all titles remain one line.
- Confirm all audience-facing body text is at least 20pt.
- Confirm formulas and amounts use Outfit with tabular numerals.
- Confirm every old `110,000 / 90,000 / 100,000` value is removed from visible copy and notes except external source history that is not audience-facing.
- Confirm `5,000 / 2,000 / 4,500` is consistent across slides 5, 8, 9 notes, and 10.
- Confirm slide 6 Relay appears only in the appendix.
- Confirm the closing URL is readable.

### calm-design Self-Critique

- No pure black canvas.
- No gradients, glow, glass, decorative emoji, or equal-card feature grids.
- No artificial metrics or marketing filler.
- Pretendard and Outfit only.
- Clear hierarchy and one dominant read per slide.
- Memorability targets:
  - Formula hero: at least 7/10
  - Private-vs-visible reversal: at least 7/10
  - Overall distinction from generic AI decks: at least 7/10

### omd:feel Audit

Only static-presentation-applicable axes are scored:

- 8px/4px spacing rhythm
- 4px baseline rhythm where measurable
- Typography hierarchy and tabular numerals
- Text contrast:
  - Normal text at least 4.5:1
  - Large text at least 3:1
- Consistent semantic color use
- No shadow/glass depth conflicts with `DESIGN.md`
- No unintentional overlap

Motion, pointer targets, form validation, scrolling, overlays, and response-time rules are marked not applicable rather than counted as failures.

The final report must include applicable SPEC/DS rules, BLOCK/WARN/FYI counts, and actionable slide references.
