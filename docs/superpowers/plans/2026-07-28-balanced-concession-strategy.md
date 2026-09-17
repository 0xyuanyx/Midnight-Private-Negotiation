# Balanced Private Concession Strategy Implementation Plan

Status: Implemented in commit `005e6da` on 2026-09-17. The checklist below is the original work plan, not an open task list.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent first-round settlement at the Seller floor by applying symmetric private concession targets before AI candidates can be accepted.

**Architecture:** `agent-core` computes role-local round targets from private policies and applies a StrategyGuard after the existing hard PolicyGuard. The same target function supplies safe 250 KRW fallback offers when AI candidates are unavailable. No new field crosses the AI, Relay, Controller, or Observer trust boundaries.

**Tech Stack:** TypeScript 5.9, Node.js test runner, OpenAI Responses API

## Global Constraints

- Buyer target rises linearly from 90% in round 1 to 100% in round 10.
- Seller target falls linearly from 115% in round 1 to 100% in round 10.
- Buyer targets round down and Seller targets round up to 250 KRW.
- Private limits, targets, and guard results never enter AI requests.
- PolicyGuard remains the absolute safety boundary.

---

### Task 1: Add local concession targets and StrategyGuard

**Files:**
- Modify: `packages/agent-core/src/index.ts`
- Test: `packages/agent-core/test/agent-core.test.mjs`

**Interfaces:**
- Produces: `localTargetPrice(policy: LocalPolicy, round: number): bigint | undefined`
- Produces: `strategyAllows(policy, context, candidate): boolean`
- Consumes: `PRICE_INCREMENT_KRW`, `policyAllows`, and validated rounds 1 through 10

- [ ] Add failing tests for round 1 and round 10 Buyer/Seller targets.
- [ ] Add failing tests proving Seller rejects `780750` but accepts `897750` in round 1.
- [ ] Run `npm run build && node --test packages/agent-core/test/agent-core.test.mjs` and confirm failure.
- [ ] Implement integer basis-point interpolation and role-correct 250 KRW rounding.
- [ ] Require both `policyAllows` and `strategyAllows` in `generateAllowedCandidate`.
- [ ] Run the focused test and confirm success.

### Task 2: Use concession targets for local fallback

**Files:**
- Modify: `packages/agent-core/src/index.ts`
- Test: `packages/agent-core/test/agent-core.test.mjs`
- Test: `packages/agent-core/test/openai-eval.test.mjs`

**Interfaces:**
- Consumes: `localTargetPrice` and `strategyAllows`
- Preserves: `generateLocalFallbackCandidate(input): NegotiationCandidate | undefined`

- [ ] Add failing tests for Buyer `927000` and Seller `897750` round-1 fallback offers.
- [ ] Add a failing end-to-end evaluation for Buyer `1030000`, Seller `780550`, asserting settlement within `897750..927000`.
- [ ] Run focused tests and confirm failure.
- [ ] Replace direct-limit fallback offers with local round targets, including counteroffers after a rejected acceptance.
- [ ] Run focused tests and confirm success.
- [ ] Run `npm test` and require zero failures.
- [ ] Restart the AI Controller and run one live OpenAI evaluation for the example limits.
