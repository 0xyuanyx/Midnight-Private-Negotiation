import { describe, expect, it } from "vitest";
import { DealStatus } from "../managed/debutler/contract/index.js";
import {
  DebutlerSimulator,
  type DebutlerScenario
} from "./debutler-simulator.js";

const validScenario = (): DebutlerScenario => ({
  dealId: "11".repeat(32),
  buyerSecretKey: "44".repeat(32),
  sellerSecretKey: "55".repeat(32),
  buyerMax: 110n,
  sellerMin: 95n,
  price: 100n,
  buyerLimitRandomness: "66".repeat(32),
  sellerLimitRandomness: "77".repeat(32),
  priceRandomness: "88".repeat(32)
});

describe("De-Butler contract", () => {
  it("does not disclose a price after authorization alone", () => {
    const simulator = new DebutlerSimulator(validScenario());

    simulator.authorizeHiddenPrice();

    expect(simulator.getLedger().finalPrice).toBe(0n);
    expect(simulator.getLedger().status).toBe(DealStatus.AUTHORIZED);
  });

  it("settles when the hidden price is inside both committed limits", () => {
    const simulator = new DebutlerSimulator(validScenario());

    simulator.authorizeHiddenPrice();
    simulator.settle();

    expect(simulator.getLedger().finalPrice).toBe(100n);
    expect(simulator.getLedger().status).toBe(DealStatus.SETTLED);
  });

  it("rejects a buyer price above the committed maximum", () => {
    const simulator = new DebutlerSimulator({
      ...validScenario(),
      buyerMax: 90n
    });

    expect(() => simulator.authorizeHiddenPrice()).toThrow();
  });

  it("rejects a seller minimum above the agreed price", () => {
    const simulator = new DebutlerSimulator({
      ...validScenario(),
      sellerMin: 110n
    });

    simulator.authorizeHiddenPrice();

    expect(() => simulator.settle()).toThrow();
  });

  it("rejects a price opening that does not match the buyer commitment", () => {
    const simulator = new DebutlerSimulator(validScenario());

    simulator.authorizeHiddenPrice();
    simulator.setPriceWitness({
      price: 99n,
      randomness: validScenario().priceRandomness
    });

    expect(() => simulator.settle()).toThrow();
  });
});
