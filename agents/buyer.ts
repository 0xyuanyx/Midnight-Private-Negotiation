import type { NegotiationMessage } from "./protocol.ts";
import type { InMemoryRelay } from "./relay.ts";

export type BuyerStatus = "IDLE" | "OFFERED" | "ACCEPTED" | "CANCELLED";

export class BuyerAgent {
  readonly role = "buyer" as const;
  readonly maxPrice: bigint;
  readonly openingOffer: bigint;
  status: BuyerStatus = "IDLE";
  agreedPrice?: string;
  private dealId?: string;
  private round = 0;
  private relay?: InMemoryRelay;

  constructor(options: { maxPrice: bigint; openingOffer: bigint }) {
    this.maxPrice = options.maxPrice;
    this.openingOffer = options.openingOffer;
  }

  attach(relay: InMemoryRelay): void {
    this.relay = relay;
  }

  start(dealId: string): void {
    if (!this.relay) throw new Error("buyer relay is not attached");
    this.dealId = dealId;
    this.status = "OFFERED";
    this.send({ type: "DEAL_OPEN" });
    this.send({ type: "OFFER", price: this.openingOffer.toString() });
  }

  receive(message: NegotiationMessage): void {
    if (message.dealId !== this.dealId) return;

    if (message.type === "ACCEPT") {
      this.status = "ACCEPTED";
      this.agreedPrice = message.price;
      return;
    }

    if (message.type === "COUNTER_OFFER") {
      const price = BigInt(message.price);
      if (price <= this.maxPrice) {
        this.status = "ACCEPTED";
        this.agreedPrice = message.price;
        this.send({ type: "ACCEPT", price: message.price });
      } else {
        this.status = "CANCELLED";
        this.send({ type: "CANCELLED", reason: "counter-offer exceeds buyer policy" });
      }
      return;
    }

    if (message.type === "CANCELLED") {
      this.status = "CANCELLED";
    }
  }

  private send(message: Omit<NegotiationMessage, keyof { dealId: string; round: number; from: "buyer" }>): void {
    if (!this.relay || !this.dealId) throw new Error("buyer is not ready");
    this.round += 1;
    this.relay.send("buyer", {
      ...message,
      dealId: this.dealId,
      round: this.round,
      from: "buyer"
    } as NegotiationMessage);
  }
}
