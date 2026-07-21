import { describe, expect, it } from "vitest";
import { BuyerAgent } from "./buyer.ts";
import { InMemoryRelay } from "./relay.ts";
import { SellerAgent } from "./seller.ts";

const connect = (buyer: BuyerAgent, seller: SellerAgent): InMemoryRelay => {
  const relay = new InMemoryRelay();
  relay.connect("buyer", (message) => buyer.receive(message));
  relay.connect("seller", (message) => seller.receive(message));
  buyer.attach(relay);
  seller.attach(relay);
  return relay;
};

describe("De-Butler agent negotiation", () => {
  it("settles a price inside both private policy limits", () => {
    const buyer = new BuyerAgent({ maxPrice: 110n, openingOffer: 100n });
    const seller = new SellerAgent({ minPrice: 95n });
    connect(buyer, seller);

    buyer.start("deal-success");

    expect(buyer.status).toBe("ACCEPTED");
    expect(seller.status).toBe("ACCEPTED");
    expect(buyer.agreedPrice).toBe("100");
  });

  it("cancels when the seller counter-offer exceeds the buyer limit", () => {
    const buyer = new BuyerAgent({ maxPrice: 90n, openingOffer: 80n });
    const seller = new SellerAgent({ minPrice: 95n });
    connect(buyer, seller);

    buyer.start("deal-rejected");

    expect(buyer.status).toBe("CANCELLED");
    expect(seller.status).toBe("CANCELLED");
    expect(buyer.agreedPrice).toBeUndefined();
  });
});
