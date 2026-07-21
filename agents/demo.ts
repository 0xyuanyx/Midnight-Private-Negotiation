import { BuyerAgent } from "./buyer.ts";
import { InMemoryRelay } from "./relay.ts";
import { SellerAgent } from "./seller.ts";

const runScenario = (
  name: string,
  buyerOptions: { maxPrice: bigint; openingOffer: bigint },
  sellerOptions: { minPrice: bigint }
): void => {
  const buyer = new BuyerAgent(buyerOptions);
  const seller = new SellerAgent(sellerOptions);
  const relay = new InMemoryRelay();

  relay.connect("buyer", (message) => buyer.receive(message));
  relay.connect("seller", (message) => seller.receive(message));
  buyer.attach(relay);
  seller.attach(relay);
  buyer.start(name);

  console.log(
    JSON.stringify({
      dealId: name,
      buyer: { status: buyer.status },
      seller: { status: seller.status },
      agreedPrice: buyer.agreedPrice ?? null
    })
  );
};

runScenario(
  "deal-success",
  { maxPrice: 110n, openingOffer: 100n },
  { minPrice: 95n }
);

runScenario(
  "deal-rejected",
  { maxPrice: 90n, openingOffer: 80n },
  { minPrice: 95n }
);
