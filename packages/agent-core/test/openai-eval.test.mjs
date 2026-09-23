import assert from "node:assert/strict";
import test from "node:test";
import { runNegotiationScenario } from "../../../scripts/openai-negotiation-eval.mjs";

const publicProvider = (captured) => ({
  async generateCandidates(context) {
    captured.push(structuredClone(context));
    if (context.currentOffer === undefined) {
      return [{ action: "offer", price: context.publicReferencePrice }];
    }
    return [
      { action: "accept", price: context.currentOffer.price },
      { action: "offer", price: context.publicReferencePrice },
    ];
  },
});
test("live evaluation harness settles overlap and cancels non-overlap from public contexts", async () => {
  const happyContexts = [];
  const happy = await runNegotiationScenario({
    name: "happy-100k",
    buyerLimit: 110000n,
    sellerLimit: 90000n,
    publicReferencePrice: "100000",
    buyerProvider: publicProvider(happyContexts),
    sellerProvider: publicProvider(happyContexts),
  });
  assert.deepEqual(happy, {
    name: "happy-100k",
    result: "SETTLED",
    agreedAmount: "100000",
    rounds: 6,
    modelSelections: 2,
  });

  const cancelledContexts = [];
  const cancelled = await runNegotiationScenario({
    name: "cancelled-gap",
    buyerLimit: 75000n,
    sellerLimit: 90000n,
    publicReferencePrice: "80000",
    buyerProvider: publicProvider(cancelledContexts),
    sellerProvider: publicProvider(cancelledContexts),
  });
  assert.deepEqual(cancelled, {
    name: "cancelled-gap",
    result: "CANCELLED",
    rounds: 1,
    modelSelections: 0,
  });

  for (const context of [...happyContexts, ...cancelledContexts]) {
    assert.deepEqual(
      Object.keys(context).sort(),
      (
        context.currentOffer === undefined
          ? ["productCode", "publicReferencePrice", "role", "round"]
          : [
              "currentOffer",
              "productCode",
              "publicReferencePrice",
              "role",
              "round",
            ]
      ).sort(),
    );
    const serialized = JSON.stringify(context);
    assert.doesNotMatch(
      serialized,
      /maximumPrice|minimumPrice|commitment|randomness|secret|wallet|PolicyGuard|retry/i,
    );
  }
});

test("limits far from the public reference end without a limit-shaped offer", async () => {
  const contexts = [];
  const result = await runNegotiationScenario({
    name: "far-from-reference-1030k-780550",
    buyerLimit: 1030000n,
    sellerLimit: 780550n,
    publicReferencePrice: "100000",
    buyerProvider: publicProvider(contexts),
    sellerProvider: publicProvider(contexts),
  });

  // Offers come only from the public ladder around the reference price, so a
  // Seller minimum above the whole ladder ends the deal instead of leaking it.
  assert.deepEqual(result, {
    name: "far-from-reference-1030k-780550",
    result: "CANCELLED",
    rounds: 1,
    modelSelections: 0,
  });
  assert.equal(JSON.stringify(contexts).includes("780"), false);
});
