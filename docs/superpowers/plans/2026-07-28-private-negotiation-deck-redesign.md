# Private Negotiation Deck Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a separate, editable 14-slide PowerPoint deck with a 12-slide ten-minute narrative, two Q&A appendix slides, updated demo amounts, clearer stage hierarchy, and verified compliance with the existing Midnight design system.

**Architecture:** Import the user-provided PPTX as the visual source, inspect every inherited element, duplicate mapped source slides into a starter deck, and edit inherited objects with `@oai/artifact-tool`. Use Superdesign only to compare the hierarchy of slide 5; the existing PPTX remains authoritative. Render and inspect every final slide, then run template fidelity, overflow, calm-design, and static omd:feel audits.

**Tech Stack:** JavaScript ES modules, `@oai/artifact-tool`, bundled presentation template-following scripts, Superdesign CLI, LibreOffice/Poppler-based rendering helpers, PowerPoint PPTX.

## Global Constraints

- Source PPTX: `/Users/taemin/Desktop/midnight-private-negotiation-demo-10min-simple-revised.pptx`
- Final PPTX: `/Users/taemin/Desktop/midnight-private-negotiation-demo-10min-omd-revised.pptx`
- Build workspace: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign`
- Do not modify `/Users/taemin/Developer/Midnight/midnight-counter/DESIGN.md`.
- Do not overwrite the source PPTX.
- Preserve the source master → layout → slide hierarchy and editable objects.
- Use only Pretendard for Korean and Outfit for English labels, formulas, and numeric display.
- Use `#101010` canvas, `#FFFFFF` primary text, `#A8A8A8`/`#9C9C9C` muted text, and `#343434` dividers.
- Remove every `#666666` text run from the final deck.
- Preserve semantic colors: Private `#D0B36C`, Proof `#9A9AFF`, Settled `#9FB8A3`, Buyer `#A9C2E6`, Seller `#D6B879`.
- All audience-facing body text must be at least 20pt.
- Slide titles must stay on one line.
- No gradients, glow, glass, decorative emoji, fake product UI, or generated evidence.
- Use `@oai/artifact-tool`; do not use `python-pptx` or direct OOXML mutation.
- Keep or update `[Sources]` blocks in every speaker note.
- Do not embed the discovered old-amount Desktop videos.
- Only final deliverables may leave the build workspace.

---

### Task 1: Establish the Build Workspace and Source Inventory

**Files:**
- Create: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/template-audit.txt`
- Create: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/source-notes.txt`
- Create: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/deviation-log.txt`
- Generate: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/template-inspect/`

**Interfaces:**
- Consumes: source PPTX and `midnight-counter/DESIGN.md`
- Produces: complete source renders, layout JSON, inspected anchors, media inventory, and source-deck preservation rules

- [ ] **Step 1: Initialize the artifact-tool workspace**

Run:

```bash
node "/Users/taemin/.codex/plugins/cache/openai-primary-runtime/presentations/26.727.11326/skills/presentations/container_tools/setup_artifact_tool_workspace.mjs" \
  --workspace "/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign"
```

Expected: workspace path printed and `node_modules/@oai/artifact-tool` available.

- [ ] **Step 2: Inspect all nine source slides**

Run:

```bash
node "/Users/taemin/.codex/plugins/cache/openai-primary-runtime/presentations/26.727.11326/skills/presentations/template_following_scripts/inspect_template_deck.mjs" \
  --workspace "/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign" \
  --pptx "/Users/taemin/Desktop/midnight-private-negotiation-demo-10min-simple-revised.pptx"
```

Expected: nine PNGs, nine layout JSON files, `template-inspect.ndjson`, and `template-manifest.json`.

- [ ] **Step 3: Record the template audit**

Write `template-audit.txt` with:

```text
Slide size: 1280x720
Source slides: 9
Master: one imported master
Layout: one imported Title Slide layout
Fonts: Pretendard, Outfit
Images: official Midnight logo and one demo screenshot
Audience-facing structure: slide-local editable shapes; inherited master/layout contain no visible content
Reusable patterns:
- 1/9: left-anchored title/closing
- 2: four-stage horizontal process
- 3: two-column comparison
- 4: two-row proof relation
- 5: three-stage timeline
- 6: relay boundary diagram
- 7: media frame
- 8: three-column evidence field
Preservation rule: duplicate source slides and edit inherited slide-local objects; do not rebuild from another template.
```

- [ ] **Step 4: Record source provenance and deliberate deviations**

Write `source-notes.txt` with the Midnight official URLs and local repository source paths already present in the deck notes. Write `deviation-log.txt` with the canvas change `#0A0A0A → #101010`, full `#666666 → #9C9C9C` replacement, main-story reordering, old-amount replacement, and Relay relocation.

- [ ] **Step 5: Verify the inventory**

Run:

```bash
test "$(find "/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/template-inspect/source-slides" -name 'source-slide-*.png' | wc -l | tr -d ' ')" = "9"
```

Expected: exit code 0.

### Task 2: Calibrate Slide 5 with Superdesign

**Files:**
- Create: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/superdesign-slide5-context.txt`
- Create: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/superdesign-review.txt`

**Interfaces:**
- Consumes: existing Superdesign project `af2ac580-b1e7-437b-8bac-2c128001d87e`, approved design spec, and `midnight-counter/DESIGN.md`
- Produces: two 1280×720 hierarchy variants and a selected hierarchy-only recommendation

- [ ] **Step 1: Write the exact slide-5 context**

Write `superdesign-slide5-context.txt` containing the canvas, palette, fonts, title, center price, both inequalities, bottom consequence, and the prohibition on new visual language.

- [ ] **Step 2: Create one 1280×720 base graphic draft**

Run:

```bash
npx --yes @superdesign/cli@latest create-design-draft \
  --project-id af2ac580-b1e7-437b-8bac-2c128001d87e \
  --title "Midnight Deck — Two Independent Proofs" \
  --kind graphic \
  --width 1280 \
  --height 720 \
  -p "Create one static 16:9 presentation slide. Use the provided Midnight design system exactly. Title at top left: 서로 믿지 않는 두 사람이, 각자 자기 비밀만 증명한다. Center hero: p = 4,500 KRW. Left proof: p ≤ 내 최대 한도. Right proof: 내 최소 금액 ≤ p. Bottom: 두 증명이 모두 통과했을 때에만 → 금액 공개. No cards, gradients, glow, icons, or new colors. Use ONLY the fonts, colors, spacing, and component styles defined in the design system." \
  --context-file "/Users/taemin/Developer/Midnight/midnight-counter/DESIGN.md" \
  --context-file "/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/superdesign-slide5-context.txt"
```

Expected: draft id, canvas URL, and preview URL.

- [ ] **Step 3: Branch exactly two hierarchy variants**

Run `iterate-design-draft` with:

```text
Variant 1: Central price hero with the two proofs flanking it; preserve all visual tokens.
Variant 2: Two proof fields sharing one central price axis; preserve all visual tokens.
```

Use `--mode branch` and pass the same two context files.

- [ ] **Step 4: Review only transferable hierarchy**

Write `superdesign-review.txt` with scores for primary read, inequality readability, 8px rhythm, and design-system fidelity. Select the variant with the clearest `p = 4,500 KRW → two proofs → amount disclosure` order. Reject any generated new font, color, card, gradient, or decoration.

### Task 3: Build and Validate the Template Frame Map

**Files:**
- Create: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/template-frame-map.json`
- Generate: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/template-starter.pptx`

**Interfaces:**
- Consumes: source inventory and inspected source element IDs
- Produces: a 14-slide starter deck preserving source slide structures

- [ ] **Step 1: Map output slides to source slides**

Use this mapping:

```json
{
  "outputSlides": [
    {"outputSlide":1,"sourceSlide":1,"narrativeRole":"title"},
    {"outputSlide":2,"sourceSlide":3,"narrativeRole":"negotiation paradox"},
    {"outputSlide":3,"sourceSlide":2,"narrativeRole":"trust boundary"},
    {"outputSlide":4,"sourceSlide":8,"narrativeRole":"role-local idea"},
    {"outputSlide":5,"sourceSlide":4,"narrativeRole":"two independent proofs"},
    {"outputSlide":6,"sourceSlide":3,"narrativeRole":"public versus private"},
    {"outputSlide":7,"sourceSlide":2,"narrativeRole":"AI and local policy"},
    {"outputSlide":8,"sourceSlide":5,"narrativeRole":"demo scenario"},
    {"outputSlide":9,"sourceSlide":7,"narrativeRole":"demo media"},
    {"outputSlide":10,"sourceSlide":3,"narrativeRole":"what stayed invisible"},
    {"outputSlide":11,"sourceSlide":3,"narrativeRole":"current state and next steps"},
    {"outputSlide":12,"sourceSlide":9,"narrativeRole":"closing"},
    {"outputSlide":13,"sourceSlide":6,"narrativeRole":"appendix relay"},
    {"outputSlide":14,"sourceSlide":4,"narrativeRole":"appendix commitment versus proof"}
  ],
  "omittedSourceSlides": []
}
```

For every output slide, populate `editTargets` from the mapped source slide's exact slide-local element IDs in `template-inspect.ndjson`. Classify each target as `rewrite`, `rewrite-and-reposition`, `keep`, or `delete`; do not use blanket text clearing.

- [ ] **Step 2: Validate the map**

Run:

```bash
node "/Users/taemin/.codex/plugins/cache/openai-primary-runtime/presentations/26.727.11326/skills/presentations/template_following_scripts/validate_template_plan.mjs" \
  --workspace "/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign" \
  --pptx "/Users/taemin/Desktop/midnight-private-negotiation-demo-10min-simple-revised.pptx" \
  --map "/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/template-frame-map.json"
```

Expected: all 14 mappings valid and all inherited placeholders classified.

- [ ] **Step 3: Build the starter deck**

Run `prepare_template_starter_deck.mjs` with the validated map and output `template-starter.pptx`, starter renders, starter layouts, and a contact sheet.

### Task 4: Author the 14-Slide Deck

**Files:**
- Create: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/build-deck.mjs`
- Generate: `/Users/taemin/Desktop/midnight-private-negotiation-demo-10min-omd-revised.pptx`

**Interfaces:**
- Consumes: `template-starter.pptx`, exact anchors from starter inspection, and approved copy
- Produces: editable final PPTX with updated notes and 14 slides

- [ ] **Step 1: Import the starter deck**

Use:

```js
import fs from "node:fs/promises";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const presentation = await PresentationFile.importPptx(
  await FileBlob.load("/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/template-starter.pptx"),
);
```

- [ ] **Step 2: Define focused edit helpers**

Implement:

```js
function setText(shape, text, { fontSize, typeface = "Pretendard", color = "#FFFFFF", bold = false, align = "left" } = {}) {
  shape.text = text;
  shape.text.style = { fontSize, typeface, color, bold, alignment: align };
}

function setFrame(element, left, top, width, height) {
  element.position = { left, top, width, height };
}

function applyFooter(footerShape, pageNumberShape, label, number) {
  setText(footerShape, label, {
    fontSize: 11,
    typeface: "Pretendard",
    color: "#9C9C9C",
    bold: true,
  });
  setText(pageNumberShape, String(number).padStart(2, "0"), {
    fontSize: 11,
    typeface: "Outfit",
    color: "#9C9C9C",
    align: "right",
  });
}
```

Resolve exact slide and element anchors from starter inspection before calling these helpers.

- [ ] **Step 3: Apply the global visual changes**

For all slides:

```js
slide.background.fill = "#101010";
```

Replace every `#666666` run with `#9C9C9C`. Update page numbers to `01` through `14`. Keep the official logo objects intact.

- [ ] **Step 4: Implement slides 1–4**

Use the approved exact copy and layouts from the design spec. Slide 2 uses a two-column comparison; slide 3 uses three positions; slide 4 uses three trust-boundary columns plus a bottom three-step flow.

- [ ] **Step 5: Implement slide 5**

Apply the selected Superdesign hierarchy while preserving the source deck's visual language:

```text
Title: 40–44pt Pretendard 700
Center: p = 4,500 KRW, 56–64pt Outfit 700
Proofs: 40–44pt Outfit 600, #9A9AFF
Private support: 20–22pt Pretendard 600, #D0B36C
Bottom consequence: 24–28pt Pretendard 600
```

Update speaker notes with the required trustless-private-relation phrase and the existing `[Sources]` block.

- [ ] **Step 6: Implement slides 6–8**

Preserve the source two-column and process/timeline layouts. Ensure slide 8 shows `5,000`, `2,000`, and `4,500 KRW`, plus the actual proof-server wait note in speaker notes.

- [ ] **Step 7: Implement slide 9**

Keep the inherited media frame and image object. Do not embed `데모1.mov` through `데모6.mov`. Update the notes to `5,000 / 2,000 / 4,500`.

- [ ] **Step 8: Implement slides 10–11**

Create the private-versus-observer reversal and two-column status/roadmap slide. Keep `OPEN`, `AUTHORIZED`, `SETTLED`, and `4,500 KRW` in Outfit.

- [ ] **Step 9: Implement appendix slides 12–13**

Move the Relay content intact to slide 12 with contrast updates. Build slide 13 from the two-row proof relation pattern with the exact commitment-versus-proof copy.

- [ ] **Step 10: Implement closing slide 14**

Move the inherited closing slide to the final position. Recompose it as a centered end card with the official logo, closing statement, semantic summary, and clickable GitHub URL. Remove the ordinary footer and page number so it cannot be mistaken for another opening slide.

- [ ] **Step 11: Export**

Use:

```js
const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save("/Users/taemin/Desktop/midnight-private-negotiation-demo-10min-omd-revised.pptx");
```

Expected: final PPTX exists and the source PPTX remains unchanged.

### Task 5: Structural and Content Verification

**Files:**
- Generate: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/final-render/`
- Generate: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/final-layout/`
- Create: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/content-check.txt`

**Interfaces:**
- Consumes: final PPTX
- Produces: render evidence, layout evidence, and deterministic text checks

- [ ] **Step 1: Render all slides and layouts**

Export 14 PNGs, 14 layout JSON files, and a montage with artifact-tool.

- [ ] **Step 2: Run overflow checks**

Run:

```bash
python3 "/Users/taemin/.codex/plugins/cache/openai-primary-runtime/presentations/26.727.11326/skills/presentations/container_tools/slides_test.py" \
  "/Users/taemin/Desktop/midnight-private-negotiation-demo-10min-omd-revised.pptx"
```

Expected: no overflow findings.

- [ ] **Step 3: Verify amounts and forbidden text**

Inspect the final deck and fail if visible text or notes contain:

```text
110,000
90,000
100,000
#666666
```

Require:

```text
5,000
2,000
4,500
p ≤ 내 최대 한도
내 최소 금액 ≤ p
github.com/0xyuanyx/Midnight-Private-Negotiation
```

- [ ] **Step 4: Run template fidelity**

Run `check_template_fidelity.mjs` against the starter and final PPTX, the validated map, starter layouts, and final layouts.

Expected: pass with only deviations listed in `deviation-log.txt`.

### Task 6: Visual Self-Critique and omd:feel Audit

**Files:**
- Create: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/.reviews/calm-design-review.txt`
- Create: `/Users/taemin/Developer/Midnight/.tmp/midnight-deck-redesign/.reviews/feel-audit-round-1.md`

**Interfaces:**
- Consumes: all 14 full-size slide renders and layout JSON
- Produces: final visual findings and actionable revisions

- [ ] **Step 1: Inspect every slide at full size**

Check one primary read, title wrapping, text clipping, media crop, contrast, divider alignment, and slide-to-slide silhouette for all 14 slides.

- [ ] **Step 2: Run calm-design self-critique**

Score:

```text
AI tells
Korean readability
Hierarchy
Whitespace
Dial match
Memorability
Differentiation
Delight
```

Require formula hero, invisible-state reversal, and overall distinctiveness at least 7/10.

- [ ] **Step 3: Run the static omd:feel audit**

Audit only:

```text
8px/4px spacing rhythm
4px baseline rhythm
type hierarchy
tabular numerals
text contrast
semantic color consistency
unintended overlap
depth/shadow compliance
```

Write BLOCK/WARN/FYI issues with exact slide numbers and element labels. Mark motion, targets, scroll, forms, overlays, and response-time axes as not applicable.

- [ ] **Step 4: Fix all BLOCK findings and unintended overlaps**

Make pinpoint edits in `build-deck.mjs`, rebuild, rerender, and rerun the affected checks. Do not change unrelated slides.

### Task 7: Final Verification and Delivery

**Files:**
- Final: `/Users/taemin/Desktop/midnight-private-negotiation-demo-10min-omd-revised.pptx`

**Interfaces:**
- Consumes: revised deck and QA reports
- Produces: one final user-facing presentation file

- [ ] **Step 1: Verify final output**

Confirm:

```bash
test -s "/Users/taemin/Desktop/midnight-private-negotiation-demo-10min-omd-revised.pptx"
```

Expected: exit code 0.

- [ ] **Step 2: Confirm source preservation**

Compare the source file's checksum recorded before implementation with its checksum after implementation. They must match.

- [ ] **Step 3: Deliver one output citation**

Return the final PPTX once with `purpose="output"`, summarize the narrative and visual changes, state that the old videos were not embedded, and report the final `omd:feel` BLOCK/WARN/FYI result.
