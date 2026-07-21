import type { NegotiationMessage } from "./protocol.ts";
import type { InMemoryRelay } from "./relay.ts";

export type SellerStatus =
  | "IDLE"
  | "COUNTERED"
  | "ACCEPTED"
  | "CANCELLED";

export class SellerAgent {
  readonly role = "seller" as const;
  readonly minPrice: bigint;
  status: SellerStatus = "IDLE";
  agreedPrice?: string;
  private dealId?: string;
  private round = 0;
  private relay?: InMemoryRelay;

  constructor(options: { minPrice: bigint }) {
    this.minPrice = options.minPrice;
  }

  attach(relay: InMemoryRelay): void {
    this.relay = relay;
  }

  receive(message: NegotiationMessage): void {
    if (!this.dealId) this.dealId = message.dealId;
    if (message.dealId !== this.dealId) return;

    if (message.type === "OFFER") {
      const price = BigInt(message.price);
      if (price >= this.minPrice) {
        this.status = "ACCEPTED";
        this.agreedPrice = message.price;
        this.send({ type: "ACCEPT", price: message.price });
      } else {
        this.status = "COUNTERED";
        this.send({ type: "COUNTER_OFFER", price: this.minPrice.toString() });
      }
      return;
    }

    if (message.type === "ACCEPT") {
      this.status = "ACCEPTED";
      this.agreedPrice = message.price;
      return;
    }

    if (message.type === "CANCELLED") {
      this.status = "CANCELLED";
    }
  }

  private send(message: Omit<NegotiationMessage, keyof { dealId: string; round: number; from: "seller" }>): void {
    if (!this.relay || !this.dealId) throw new Error("seller is not ready");
    this.round += 1;
    this.relay.send("seller", {
      ...message,
      dealId: this.dealId,
      round: this.round,
      from: "seller"
    } as NegotiationMessage);
  }
}
