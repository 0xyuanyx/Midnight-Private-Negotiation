import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import { describe, expect, it } from "vitest";
import type { Ledger } from "../managed/negotiation/contract/index.js";
import { type NegotiationPrivateState, witnesses } from "../witnesses.js";

const contextFor = (
  privateState: NegotiationPrivateState
): WitnessContext<Ledger, NegotiationPrivateState> =>
  ({ privateState }) as WitnessContext<Ledger, NegotiationPrivateState>;

const buyerState = {
  role: "buyer",
  buyerSecretKey: new Uint8Array(32),
  buyerMaxPrice: 110n,
  buyerLimitRandomness: new Uint8Array(32),
  agreedPrice: 100n,
  priceRandomness: new Uint8Array(32)
} as unknown as NegotiationPrivateState;

const sellerStateWithoutOpening = {
  role: "seller",
  sellerSecretKey: new Uint8Array(32),
  sellerMinPrice: 95n,
  sellerLimitRandomness: new Uint8Array(32)
} as unknown as NegotiationPrivateState;

describe("role-isolated witnesses", () => {
  it("rejects buyer witness access from seller state", () => {
    expect(() =>
      witnesses.buyerMaxPrice(contextFor(sellerStateWithoutOpening))
    ).toThrow("buyer witness requires buyer private state");
  });

  it("rejects seller witness access from buyer state", () => {
    expect(() => witnesses.sellerMinPrice(contextFor(buyerState))).toThrow(
      "seller witness requires seller private state"
    );
  });

  it("rejects settlement values before the seller receives an opening", () => {
    expect(() =>
      witnesses.agreedPrice(contextFor(sellerStateWithoutOpening))
    ).toThrow("seller price opening is not available");
  });
});
