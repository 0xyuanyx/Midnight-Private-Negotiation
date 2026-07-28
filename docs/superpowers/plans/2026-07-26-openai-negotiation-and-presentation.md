# OpenAI Negotiation And Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the isolated Buyer and Seller runtimes to the OpenAI Responses API, verify real negotiations without exposing limits, document the system, and create a Midnight-branded presentation draft with a separate talk track.

**Architecture:** The existing `CandidateProvider` boundary remains the only model integration point. Buyer and Seller call a stateless OpenAI provider inside their own processes, then local PolicyGuard selects a safe candidate; the Controller only passes scoped configuration, while Relay and Observer remain unaware of model credentials and private limits.

**Tech Stack:** TypeScript, Node.js 22 native `fetch`, OpenAI Responses API Structured Outputs, Node test runner, Midnight Compact, `@oai/artifact-tool`, PowerPoint.

## Global Constraints

- The baseline commit is `96a51a7`; every change after it must remain uncommitted and unpushed.
- OpenAI receives only `role`, `productCode`, `round`, `publicReferencePrice`, and `currentOffer`.
- Every OpenAI request uses `store: false` and no prior response or conversation identifier.
- Local limits, commitments, policy decisions, rejected candidates, retries, wallet data, and relay secrets never enter the model request.
- Browser logs remain sanitized and do not reveal proposals, rounds, retries, prompts, or model responses.
- The mock provider and local fallback remain available.
- The final slide deck uses Midnight’s off-black, electric-blue, lavender, gold, sage, official logo, Outfit for English, and Pretendard for Korean.

---

### Task 1: OpenAI Responses Candidate Provider

**Files:**
- Modify: `packages/agent-core/src/index.ts`
- Modify: `packages/agent-core/test/agent-core.test.mjs`

**Interfaces:**
- Consumes: `PublicNegotiationContext`, `NegotiationModelRequest`, and `CandidateProvider`.
- Produces: `createOpenAIResponsesProvider(options): CandidateProvider` and a structured Responses request body.

- [ ] **Step 1: Write failing provider request and response parsing tests**

Assert that the injected fetch receives `POST https://api.openai.com/v1/responses`, bearer authentication, `store: false`, low reasoning, strict `text.format` JSON schema, and no private field. Return a synthetic Responses payload containing output text and assert that candidates are parsed.

- [ ] **Step 2: Run the focused test and confirm the missing export failure**

Run: `npm run build && node --test packages/agent-core/test/agent-core.test.mjs`

- [ ] **Step 3: Implement the minimal provider**

Add request construction, timeout handling, HTTP validation, output-text extraction, and JSON parsing. Keep application-side candidate validation in `generateAllowedCandidate`.

- [ ] **Step 4: Run the focused tests**

Run: `npm run build && node --test packages/agent-core/test/agent-core.test.mjs`

### Task 2: Public Reference Price And Runtime Provider Selection

**Files:**
- Modify: `packages/agent-core/src/index.ts`
- Modify: `packages/agent-core/test/agent-core.test.mjs`
- Modify: `packages/buyer-runtime/src/index.ts`
- Modify: `packages/seller-runtime/src/index.ts`
- Modify: `packages/demo-controller/src/orchestrator.ts`
- Modify: `packages/demo-controller/test/ipc.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `NEGOTIATION_AI_PROVIDER`, `MEMO_OPENAI_API_KEY` or `OPENAI_API_KEY`, `OPENAI_NEGOTIATION_MODEL`, and `NEGOTIATION_REFERENCE_PRICE_KRW`.
- Produces: role-scoped provider configuration and `publicReferencePrice` in every model context.

- [ ] **Step 1: Write failing context and scoped-environment tests**

Assert that `publicReferencePrice` survives request sanitization, private fields are still rejected, Buyer and Seller receive the OpenAI key only in explicit OpenAI mode, and Observer receives no key.

- [ ] **Step 2: Run focused tests and confirm expected failures**

Run: `npm run build && node --test packages/agent-core/test/*.test.mjs packages/demo-controller/test/ipc.test.mjs`

- [ ] **Step 3: Implement runtime selection**

Create the configured provider in each party runtime, add the public reference price to every negotiation context, validate controller configuration, and add `demo:ai` plus `demo:midnight:ai` scripts.

- [ ] **Step 4: Run full local tests**

Run: `npm run typecheck && npm test`

### Task 3: Live OpenAI Negotiation Evaluation

**Files:**
- Create: `scripts/test-openai-negotiation.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the configured OpenAI provider and local PolicyGuard.
- Produces: a sanitized evaluation report containing scenario name, settled/cancelled result, final public amount when settled, request count, and latency.

- [ ] **Step 1: Write the evaluation harness assertions**

Cover a 110,000/90,000 overlap scenario, a higher-value overlap scenario with a matching public reference, and a non-overlap scenario. Assert that captured request bodies contain no private field names or limit strings.

- [ ] **Step 2: Run with a synthetic fetch to verify harness behavior**

Run: `npm run build && node scripts/test-openai-negotiation.mjs --self-test`

- [ ] **Step 3: Run against the real API**

Run: `zsh -lc 'source ~/.zshrc >/dev/null 2>&1; cd /Users/taemin/Developer/Midnight/midnight-counter && npm run test:openai'`

- [ ] **Step 4: Run one full runtime flow**

Start the Controller with `NEGOTIATION_AI_PROVIDER=openai` on an unused WebSocket port, drive Buyer and Seller commands, and assert a terminal Observer state without inspecting private logs.

### Task 4: Documentation And Presentation Content

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-25-private-negotiation-dapp-v2-design.md`
- Create: `docs/presentation/2026-07-26-demo-presentation-content.md`
- Create: `docs/presentation/2026-07-26-slide-talk-track.md`

**Interfaces:**
- Consumes: verified runtime architecture, actual test results, Compact contract source, and public OpenAI documentation.
- Produces: implementation/runbook documentation, presentation narrative, code tour, and slide-specific speaking notes.

- [ ] **Step 1: Update operating documentation**

Document explicit provider activation, environment variables, fallback behavior, `store: false` versus ZDR, and live-test commands.

- [ ] **Step 2: Write the presentation content**

Explain the problem, trust boundaries, three isolated roles, encrypted Relay, GPT candidate generation, local PolicyGuard, Compact circuits, public state transition, live demo flow, limitations, and roadmap. Cite the exact important repository files and functions.

- [ ] **Step 3: Write the talk track**

For every slide, list the one sentence that must be said, three keywords, the code or demo evidence to show, and the claim to avoid overstating.

- [ ] **Step 4: Check internal consistency**

Run searches for contradictory claims about API activation, fields sent to GPT, and chain visibility.

### Task 5: Midnight-Branded PowerPoint Draft

**Files:**
- Create: `docs/presentation/midnight-private-negotiation-demo.pptx`
- Create in temporary workspace only: presentation build script and rendered QA images.

**Interfaces:**
- Consumes: the presentation content, talk track, official local Midnight logo, local Outfit font, UI screenshot, and verified code snippets.
- Produces: a 16:9 PowerPoint draft with speaker notes and source notes.

- [ ] **Step 1: Define the visual system**

Use off-black backgrounds, electric-blue as a rare brand signal, lavender for protocol, gold for private state, sage for settlement, Outfit for English headings, and Pretendard for Korean body copy. Avoid gradients, glow, equal card grids, and dense dashboard styling.

- [ ] **Step 2: Build the deck with `@oai/artifact-tool`**

Create a minimal title, problem, trust boundary, data flow, private negotiation, PolicyGuard, Compact proof, public states, demo script, verified evidence, limitations, and closing slides.

- [ ] **Step 3: Render and inspect every slide**

Run the presentation renderer and inspect full-size PNGs for wrapping, clipping, contrast, hierarchy, and consistency.

- [ ] **Step 4: Run automated slide validation**

Run `slides_test.py` and fix every unintended overlap or overflow.

### Task 6: Final Verification And Local-Only Handoff

**Files:**
- Verify all changed and created files.

**Interfaces:**
- Consumes: all implementation and presentation outputs.
- Produces: test evidence and a clean distinction between pushed baseline and local-only work.

- [ ] **Step 1: Run code verification**

Run: `npm run typecheck && npm test && npm run lint --prefix apps/demo-web && npm test --prefix apps/demo-web && git diff --check`

- [ ] **Step 2: Run presentation verification**

Render the final deck, inspect all slides, and run `slides_test.py`.

- [ ] **Step 3: Confirm Git state**

Assert that `origin/main` remains at baseline commit `96a51a7` and that every post-baseline file appears only as an unstaged or untracked local change.
