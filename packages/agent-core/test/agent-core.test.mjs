import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNegotiationAgentInstructions,
  createCandidateProviderFromEnvironment,
  createNegotiationModelRequest,
  createDeterministicMockProvider,
  createOpenAIResponsesProvider,
  generateAllowedCandidate,
  generateLocalFallbackCandidate,
  NEGOTIATION_PROMPT_VERSION,
  policyAllows,
} from "../dist/index.js";

test("Buyer and Seller receive detailed, separate negotiation roles", () => {
  const buyer = buildNegotiationAgentInstructions("buyer");
  const seller = buildNegotiationAgentInstructions("seller");

  assert.match(buyer, new RegExp(`prompt_version=${NEGOTIATION_PROMPT_VERSION}`));
  assert.match(buyer, /\[BUYER 역할\]/);
  assert.match(buyer, /높은 가격을 확정하지 않으면서도/);
  assert.match(buyer, /낮은 counter offer/);
  assert.match(seller, /\[SELLER 역할\]/);
  assert.match(seller, /낮은 가격을 확정하지 않으면서도/);
  assert.match(seller, /높은 counter offer/);

  for (const instructions of [buyer, seller]) {
    assert.match(instructions, /로컬 PolicyGuard가 최종 결정/);
    assert.match(instructions, /완전히 독립적인 stateless 요청/);
    assert.match(instructions, /폐기된 후보/);
    assert.match(instructions, /마지노선/);
    assert.match(instructions, /종료 여부를 스스로 선언하지 않는다/);
    assert.match(instructions, /1개 이상 5개 이하/);
    assert.match(instructions, /오직 \{"candidates":\[\.\.\.\]\}/);
  }
});

test("model request contains only validated public context and disables response storage", () => {
  const request = createNegotiationModelRequest({
    role: "buyer",
    productCode: "4821",
    round: 3,
    publicReferencePrice: "100000",
    currentOffer: { maker: "seller", price: "105000" },
  });

  assert.equal(request.store, false);
  assert.deepEqual(JSON.parse(request.input), {
    role: "buyer",
    productCode: "4821",
    round: 3,
    publicReferencePrice: "100000",
    currentOffer: { maker: "seller", price: "105000" },
  });
  assert.equal(request.input.includes("maximumPrice"), false);
  assert.equal(request.input.includes("minimumPrice"), false);
  assert.equal(request.input.includes("commitment"), false);
  assert.equal(request.input.includes("PolicyGuard"), false);
});

test("OpenAI Responses provider sends a stateless structured request and parses candidates", async () => {
  let captured;
  const provider = createOpenAIResponsesProvider({
    apiKey: "test-api-key",
    model: "gpt-test",
    fetchImpl: async (url, init) => {
      captured = {
        url: String(url),
        method: init?.method,
        headers: init?.headers,
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({
          id: "resp_test",
          object: "response",
          status: "completed",
          output: [
            {
              id: "msg_test",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    candidates: [
                      { action: "offer", price: "100000" },
                      { action: "offer", price: "95000" },
                    ],
                  }),
                  annotations: [],
                },
              ],
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const candidates = await provider.generateCandidates({
    role: "buyer",
    productCode: "4821",
    round: 1,
    publicReferencePrice: "100000",
  });

  assert.deepEqual(candidates, [
    { action: "offer", price: "100000" },
    { action: "offer", price: "95000" },
  ]);
  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.equal(captured.method, "POST");
  assert.equal(captured.headers.Authorization, "Bearer test-api-key");
  assert.equal(captured.body.model, "gpt-test");
  assert.equal(captured.body.store, false);
  assert.deepEqual(captured.body.reasoning, { effort: "low" });
  assert.equal(captured.body.previous_response_id, undefined);
  assert.equal(captured.body.conversation, undefined);
  assert.deepEqual(captured.body.text.format, {
    type: "json_schema",
    name: "negotiation_candidates",
    strict: true,
    schema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["offer", "accept"] },
              price: { type: "string", pattern: "^[1-9][0-9]{0,19}$" },
            },
            required: ["action", "price"],
            additionalProperties: false,
          },
        },
      },
      required: ["candidates"],
      additionalProperties: false,
    },
  });
  assert.deepEqual(JSON.parse(captured.body.input), {
    role: "buyer",
    productCode: "4821",
    round: 1,
    publicReferencePrice: "100000",
  });
  const serializedInput = captured.body.input;
  assert.equal(serializedInput.includes("maximumPrice"), false);
  assert.equal(serializedInput.includes("minimumPrice"), false);
  assert.equal(serializedInput.includes("commitment"), false);
  assert.equal(captured.body.instructions.includes("PolicyGuard 판정"), true);
  assert.equal(serializedInput.includes("110000"), false);
  assert.equal(serializedInput.includes("90000"), false);
});

test("configured provider activates OpenAI only when explicitly requested", async () => {
  let authorization;
  const provider = createCandidateProviderFromEnvironment({
    environment: {
      NEGOTIATION_AI_PROVIDER: "openai",
      MEMO_OPENAI_API_KEY: "memo-test-key",
      OPENAI_NEGOTIATION_MODEL: "gpt-configured",
    },
    fetchImpl: async (_url, init) => {
      authorization = init?.headers.Authorization;
      return new Response(
        JSON.stringify({
          id: "resp_configured",
          object: "response",
          status: "completed",
          output: [
            {
              id: "msg_configured",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: '{"candidates":[{"action":"offer","price":"100000"}]}',
                  annotations: [],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const candidates = await provider.generateCandidates({
    role: "buyer",
    productCode: "1111",
    round: 1,
    publicReferencePrice: "100000",
  });
  assert.equal(authorization, "Bearer memo-test-key");
  assert.deepEqual(candidates, [{ action: "offer", price: "100000" }]);

  assert.throws(
    () =>
      createCandidateProviderFromEnvironment({
        environment: { NEGOTIATION_AI_PROVIDER: "openai" },
      }),
    /API key/,
  );
  assert.throws(
    () =>
      createCandidateProviderFromEnvironment({
        environment: { NEGOTIATION_AI_PROVIDER: "unknown" },
      }),
    /provider/,
  );
});

test("model request rejects private fields instead of silently forwarding them", () => {
  assert.throws(
    () =>
      createNegotiationModelRequest({
        role: "seller",
        productCode: "4821",
        round: 1,
        minimumPrice: "95000",
      }),
    /public negotiation context/,
  );
});

test("mock provider receives only public negotiation context", async () => {
  const received = [];
  const provider = {
    async generateCandidates(context) {
      received.push(structuredClone(context));
      return [{ action: "offer", price: "120000" }];
    },
  };

  const selected = await generateAllowedCandidate({
    provider,
    context: {
      role: "buyer",
      productCode: "4821",
      round: 1,
    },
    policy: { role: "buyer", maximumPrice: 110000n },
    maxStatelessRequests: 2,
  });

  assert.equal(selected, undefined);
  assert.equal(received.length, 2);
  assert.deepEqual(received[0], {
    role: "buyer",
    productCode: "4821",
    round: 1,
  });
  assert.deepEqual(received[1], received[0]);
  assert.equal(JSON.stringify(received).includes("110000"), false);
  assert.equal(JSON.stringify(received).includes("maximumPrice"), false);
});

test("PolicyGuard enforces Buyer and Seller limits locally", () => {
  const buyerContext = {
    role: "buyer",
    productCode: "4821",
    round: 1,
    currentOffer: { maker: "seller", price: "115000" },
  };
  assert.equal(
    policyAllows(
      { role: "buyer", maximumPrice: 110000n },
      buyerContext,
      { action: "accept", price: "115000" },
    ),
    false,
  );
  assert.equal(
    policyAllows(
      { role: "buyer", maximumPrice: 110000n },
      buyerContext,
      { action: "offer", price: "110000" },
    ),
    true,
  );

  const sellerContext = {
    role: "seller",
    productCode: "4821",
    round: 1,
    currentOffer: { maker: "buyer", price: "90000" },
  };
  assert.equal(
    policyAllows(
      { role: "seller", minimumPrice: 95000n },
      sellerContext,
      { action: "accept", price: "90000" },
    ),
    false,
  );
  assert.equal(
    policyAllows(
      { role: "seller", minimumPrice: 95000n },
      sellerContext,
      { action: "offer", price: "100000" },
    ),
    true,
  );
});

test("deterministic GPT mock proposes 100,000 KRW without receiving a limit", async () => {
  const provider = createDeterministicMockProvider();
  const selected = await generateAllowedCandidate({
    provider,
    context: {
      role: "buyer",
      productCode: "4821",
      round: 1,
    },
    policy: { role: "buyer", maximumPrice: 110000n },
  });

  assert.deepEqual(selected, { action: "offer", price: "100000" });
});

test("Buyer and Seller mock agents can counter and accept through local guards", async () => {
  const provider = createDeterministicMockProvider();
  const sellerCounter = await generateAllowedCandidate({
    provider,
    context: {
      role: "seller",
      productCode: "4821",
      round: 1,
      currentOffer: { maker: "buyer", price: "100000" },
    },
    policy: { role: "seller", minimumPrice: 115000n },
  });
  assert.deepEqual(sellerCounter, { action: "offer", price: "115000" });

  const buyerAcceptance = await generateAllowedCandidate({
    provider,
    context: {
      role: "buyer",
      productCode: "4821",
      round: 1,
      currentOffer: { maker: "seller", price: "115000" },
    },
    policy: { role: "buyer", maximumPrice: 120000n },
  });
  assert.deepEqual(buyerAcceptance, { action: "accept", price: "115000" });
});

test("mock provider rejects a context carrying a private field", async () => {
  const provider = createDeterministicMockProvider();
  await assert.rejects(
    provider.generateCandidates({
      role: "buyer",
      productCode: "4821",
      round: 1,
      maximumPrice: "110000",
    }),
    /public negotiation context/,
  );
});

test("invalid provider output is discarded before a stateless retry", async () => {
  const received = [];
  let calls = 0;
  const provider = {
    async generateCandidates(context) {
      received.push(structuredClone(context));
      calls += 1;
      return calls === 1
        ? [{ action: "leak", price: "1" }]
        : [{ action: "offer", price: "100000" }];
    },
  };

  const selected = await generateAllowedCandidate({
    provider,
    context: {
      role: "buyer",
      productCode: "4821",
      round: 1,
    },
    policy: { role: "buyer", maximumPrice: 110000n },
  });

  assert.deepEqual(selected, { action: "offer", price: "100000" });
  assert.equal(calls, 2);
  assert.deepEqual(received[1], received[0]);
});

test("local fallback completes overlapping high-value limits without exposing them to the provider", async () => {
  const received = [];
  const provider = {
    async generateCandidates(context) {
      received.push(structuredClone(context));
      return [
        { action: "accept", price: context.currentOffer.price },
        { action: "offer", price: "115000" },
      ];
    },
  };
  const sellerContext = {
    role: "seller",
    productCode: "1111",
    round: 1,
    currentOffer: { maker: "buyer", price: "100000" },
  };
  const sellerPolicy = { role: "seller", minimumPrice: 700000n };

  const generated = await generateAllowedCandidate({
    provider,
    context: sellerContext,
    policy: sellerPolicy,
  });
  assert.equal(generated, undefined);

  const counter = generateLocalFallbackCandidate({
    context: sellerContext,
    policy: sellerPolicy,
  });
  assert.deepEqual(counter, { action: "offer", price: "700000" });
  assert.equal(JSON.stringify(received).includes("700000"), false);
  assert.equal(JSON.stringify(received).includes("minimumPrice"), false);

  const buyerAcceptance = await generateAllowedCandidate({
    provider: createDeterministicMockProvider(),
    context: {
      role: "buyer",
      productCode: "1111",
      round: 1,
      currentOffer: { maker: "seller", price: "700000" },
    },
    policy: { role: "buyer", maximumPrice: 1000000n },
  });
  assert.deepEqual(buyerAcceptance, { action: "accept", price: "700000" });
});
