import { describe, expect, it } from "vitest";
import {
  hexToBytes,
  limitCommitment,
  priceCommitment,
  publicKeyForSecret
} from "../commitments.js";
import {
  NegotiationSimulator,
  type NegotiationScenario
} from "./negotiation-simulator.js";

const scenario: NegotiationScenario = {
  dealId: "11".repeat(32),
  buyerSecretKey: "44".repeat(32),
  sellerSecretKey: "55".repeat(32),
  buyerMax: 110n,
  sellerMin: 95n,
  price: 100n,
  buyerLimitRandomness: "66".repeat(32),
  sellerLimitRandomness: "77".repeat(32),
  priceRandomness: "88".repeat(32)
};

describe("negotiation commitments", () => {
  it("matches the commitments stored by the Compact contract", () => {
    const dealId = hexToBytes(scenario.dealId);
    const buyerKey = publicKeyForSecret(hexToBytes(scenario.buyerSecretKey));
    const sellerKey = publicKeyForSecret(hexToBytes(scenario.sellerSecretKey));
    const simulator = new NegotiationSimulator(scenario);

    expect(simulator.getLedger().buyerKey).toEqual(buyerKey);
    expect(simulator.getLedger().buyerCommitment).toEqual(
      limitCommitment(
        dealId,
        "negotiation:buyer:",
        buyerKey,
        scenario.buyerMax,
        hexToBytes(scenario.buyerLimitRandomness)
      )
    );

    simulator.joinDeal();

    expect(simulator.getLedger().sellerKey).toEqual(sellerKey);
    expect(simulator.getLedger().sellerCommitment).toEqual(
      limitCommitment(
        dealId,
        "negotiation:seller:",
        sellerKey,
        scenario.sellerMin,
        hexToBytes(scenario.sellerLimitRandomness)
      )
    );

    simulator.authorizeHiddenPrice();

    expect(simulator.getLedger().priceCommitment).toEqual(
      priceCommitment(
        dealId,
        scenario.price,
        hexToBytes(scenario.priceRandomness)
      )
    );
  });
});
