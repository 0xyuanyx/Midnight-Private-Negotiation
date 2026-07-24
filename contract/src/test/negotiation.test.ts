import { describe, expect, it } from "vitest";
import { DealStatus } from "../managed/negotiation/contract/index.js";
import {
  NegotiationSimulator,
  type NegotiationScenario
} from "./negotiation-simulator.js";

const validScenario = (): NegotiationScenario => ({
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

describe("Negotiation contract", () => {
  it("starts waiting for a seller and rejects early authorization", () => {
    const simulator = new NegotiationSimulator(validScenario());
    const statuses = DealStatus as unknown as Record<string, bigint>;

    expect(statuses.WAITING_SELLER).toBeDefined();
    expect(simulator.getLedger().status).toBe(statuses.WAITING_SELLER);
    expect(() => simulator.authorizeHiddenPrice()).toThrow();
  });

  it("opens only after the seller joins", () => {
    const simulator = new NegotiationSimulator(validScenario());

    simulator.joinDeal();

    expect(simulator.getLedger().status).toBe(DealStatus.OPEN);
    expect(simulator.getLedger().sellerKey).toEqual(
      simulator.expectedSellerKey
    );
    expect(simulator.getLedger().sellerCommitment).toEqual(
      simulator.expectedSellerCommitment
    );
  });

  it("rejects a second seller join", () => {
    const simulator = new NegotiationSimulator(validScenario());

    simulator.joinDeal();

    expect(() => simulator.joinDeal()).toThrow();
  });

  it("does not disclose a price after authorization alone", () => {
    const simulator = new NegotiationSimulator(validScenario());

    simulator.joinDeal();
    simulator.authorizeHiddenPrice();

    expect(simulator.getLedger().finalPrice).toBe(0n);
    expect(simulator.getLedger().status).toBe(DealStatus.AUTHORIZED);
  });

  it("settles when the hidden price is inside both committed limits", () => {
    const simulator = new NegotiationSimulator(validScenario());

    simulator.joinDeal();
    simulator.authorizeHiddenPrice();
    simulator.settle();

    expect(simulator.getLedger().finalPrice).toBe(100n);
    expect(simulator.getLedger().status).toBe(DealStatus.SETTLED);
  });

  it("rejects a buyer price above the committed maximum", () => {
    const simulator = new NegotiationSimulator({
      ...validScenario(),
      buyerMax: 90n
    });

    simulator.joinDeal();

    expect(() => simulator.authorizeHiddenPrice()).toThrow();
  });

  it("rejects a seller minimum above the agreed price", () => {
    const simulator = new NegotiationSimulator({
      ...validScenario(),
      sellerMin: 110n
    });

    simulator.joinDeal();
    simulator.authorizeHiddenPrice();

    expect(() => simulator.settle()).toThrow();
  });

  it("rejects a price opening that does not match the buyer commitment", () => {
    const simulator = new NegotiationSimulator(validScenario());

    simulator.joinDeal();
    simulator.authorizeHiddenPrice();
    simulator.setPriceWitness({
      price: 99n,
      randomness: validScenario().priceRandomness
    });

    expect(() => simulator.settle()).toThrow();
  });
});
