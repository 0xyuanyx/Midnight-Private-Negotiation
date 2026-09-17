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
    agreedAmount: "100750",
    rounds: 3,
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
    rounds: 10,
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

test("balanced fallback keeps the 1,030,000 and 780,550 KRW settlement away from the Seller floor", async () => {
  const contexts = [];
  const result = await runNegotiationScenario({
    name: "balanced-1030k-780550",
    buyerLimit: 1030000n,
    sellerLimit: 780550n,
    publicReferencePrice: "100000",
    buyerProvider: publicProvider(contexts),
    sellerProvider: publicProvider(contexts),
  });

  assert.deepEqual(result, {
    name: "balanced-1030k-780550",
    result: "SETTLED",
    agreedAmount: "897750",
    rounds: 1,
    modelSelections: 2,
  });
});
