import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeterministicMockProvider,
  generateAllowedCandidate,
  policyAllows,
} from "../dist/index.js";

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
