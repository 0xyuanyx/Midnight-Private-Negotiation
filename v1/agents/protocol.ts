export type AgentRole = "buyer" | "seller";

type MessageBase = {
  dealId: string;
  round: number;
  from: AgentRole;
};

export type NegotiationMessage =
  | (MessageBase & { type: "DEAL_OPEN" })
  | (MessageBase & { type: "OFFER"; price: string })
  | (MessageBase & { type: "COUNTER_OFFER"; price: string })
  | (MessageBase & { type: "ACCEPT"; price: string })
  | (MessageBase & { type: "CANCELLED"; reason: string });
