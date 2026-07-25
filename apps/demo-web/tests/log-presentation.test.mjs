import assert from "node:assert/strict";
import test from "node:test";

const presentation = await import("../app/log-presentation.ts").catch(() => ({}));

const event = (messageCode, overrides = {}) => ({
  protocolVersion: 1,
  eventId: `event-${messageCode}`,
  occurredAt: "2026-07-26T00:00:00.000Z",
  panel: "observer",
  sessionId: "room-1111",
  state: "OPEN",
  messageCode,
  audience: "PUBLIC",
  ...overrides,
});

test("uses Korean-first labels while preserving exact public protocol identifiers", () => {
  assert.equal(typeof presentation.messageFor, "function");
  assert.equal(
    presentation.messageFor(event("OBSERVER_OPEN")),
    "거래 개시 · OPEN",
  );
  assert.equal(
    presentation.messageFor(
      event("OBSERVER_AUTHORIZED", { state: "AUTHORIZED" }),
    ),
    "가격 조건 승인 · AUTHORIZED · 금액 비공개",
  );
  assert.equal(
    presentation.messageFor(
      event("OBSERVER_SETTLED", {
        state: "SETTLED",
        publicAmount: "100000",
      }),
    ),
    "거래 확정 · SETTLED · 100,000 KRW",
  );
  assert.equal(
    presentation.messageFor(
      event("BUYER_COMMITMENT_CREATED", {
        panel: "buyer",
        state: "COMMITMENT_CREATED",
        audience: "ROLE_LOCAL",
      }),
    ),
    "구매자 가격 커밋을 생성했습니다.",
  );
});

test("keeps round counts and transaction identifiers out of every mapped log", () => {
  assert.equal(typeof presentation.messageFor, "function");
  const codes = [
    "NEGOTIATION_START",
    "NEGOTIATING",
    "NEGOTIATION_COMPLETE",
    "VERIFYING",
    "PROOFS_COMPLETE",
    "FINALIZING_SETTLEMENT",
    "ONCHAIN_RECORDED",
  ];
  const output = codes
    .map((messageCode) => presentation.messageFor(event(messageCode)))
    .join("\n");

  assert.doesNotMatch(output, /\(\d+\/10\)|transaction|tx hash|wallet|block/i);
  assert.match(output, /AI 에이전트가 비공개 협상을 진행하고 있습니다/);
});

test("assigns color roles only to private, protocol, success, and danger tokens", () => {
  assert.equal(typeof presentation.semanticTokens, "function");
  const privateTokens = presentation.semanticTokens(
    "AI 에이전트가 비공개 협상을 진행하고 있습니다.",
  );
  assert.deepEqual(
    privateTokens.filter(({ tone }) => tone === "private"),
    [{ text: "비공개 협상", tone: "private" }],
  );

  const proofTokens = presentation.semanticTokens(
    "모든 조건을 공개하지 않고 증명하고 있습니다.",
  );
  assert.deepEqual(
    proofTokens.filter(({ tone }) => tone !== "default"),
    [{ text: "증명", tone: "protocol" }],
  );

  const commitmentTokens = presentation.semanticTokens(
    "구매자 가격 커밋을 생성했습니다.",
  );
  assert.deepEqual(
    commitmentTokens.filter(({ tone }) => tone !== "default"),
    [],
  );

  const localPrivateTokens = presentation.semanticTokens(
    "구매자 조건을 로컬 비공개 상태에 저장했습니다.",
  );
  assert.deepEqual(
    localPrivateTokens.filter(({ tone }) => tone !== "default"),
    [{ text: "비공개 상태", tone: "private" }],
  );

  const authorizedTokens = presentation.semanticTokens(
    "가격 조건 승인 · AUTHORIZED · 금액 비공개",
  );
  assert.deepEqual(
    authorizedTokens.filter(({ tone }) => tone !== "default"),
    [
      { text: "AUTHORIZED", tone: "protocol" },
      { text: "금액 비공개", tone: "private" },
    ],
  );

  const settledTokens = presentation.semanticTokens(
    "거래 확정 · SETTLED · 100,000 KRW",
  );
  assert.deepEqual(
    settledTokens.filter(({ tone }) => tone === "success"),
    [
      { text: "거래 확정", tone: "success" },
      { text: "SETTLED", tone: "success" },
      { text: "100,000 KRW", tone: "success" },
    ],
  );
});

test("uses Korean-first labels in the fixed Observer status row", () => {
  assert.equal(typeof presentation.observerStatusLabel, "function");
  assert.equal(presentation.observerStatusLabel("OPEN"), "거래 개시 · OPEN");
  assert.equal(
    presentation.observerStatusLabel("AUTHORIZED"),
    "조건 승인 · AUTHORIZED",
  );
  assert.equal(
    presentation.observerStatusLabel("SETTLED"),
    "거래 확정 · SETTLED",
  );
  assert.equal(
    presentation.observerStatusLabel("CANCELLED"),
    "거래 취소 · CANCELLED",
  );
  assert.equal(presentation.observerStatusLabel(undefined), "대기 중");
});
