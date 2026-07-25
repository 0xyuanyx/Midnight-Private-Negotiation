export type PanelId = "buyer" | "seller" | "observer";
export type RoleId = Exclude<PanelId, "observer">;

export type DemoState =
  | "ROOM_JOINED"
  | "PEER_JOINED"
  | "LIMIT_LOCKED"
  | "WAITING_PEER"
  | "PEER_READY"
  | "COMMITMENT_CREATED"
  | "PEER_COMMITMENT_REGISTERED"
  | "OPEN"
  | "NEGOTIATING"
  | "NEGOTIATION_COMPLETE"
  | "VERIFYING"
  | "PROOFS_COMPLETE"
  | "AGREED"
  | "AUTHORIZED"
  | "SETTLED"
  | "CANCELLED"
  | "ERROR"
  | "STOPPED";

export type MessageCode =
  | "ROOM_JOINED"
  | "WAITING_SELLER"
  | "WAITING_BUYER"
  | "SELLER_JOINED"
  | "BUYER_JOINED"
  | "BUYER_LIMIT_LOCKED"
  | "SELLER_LIMIT_LOCKED"
  | "BUYER_COMMITMENT_CREATED"
  | "SELLER_COMMITMENT_CREATED"
  | "WAITING_SELLER_COMMITMENT"
  | "WAITING_BUYER_COMMITMENT"
  | "SELLER_COMMITMENT_REGISTERED"
  | "BUYER_COMMITMENT_REGISTERED"
  | "DEAL_CREATED"
  | "DEAL_JOINED"
  | "OBSERVER_OPEN"
  | "NEGOTIATION_START"
  | "NEGOTIATING"
  | "NEGOTIATION_COMPLETE"
  | "VERIFYING"
  | "PROOFS_COMPLETE"
  | "NEGOTIATION_SETTLED"
  | "ONCHAIN_RECORDED"
  | "OBSERVER_AUTHORIZED"
  | "OBSERVER_SETTLED"
  | "NEGOTIATION_CANCELLED"
  | "OBSERVER_CANCELLED"
  | "CHAIN_OPERATION_FAILED"
  | "RELAY_CHANNEL_ERROR"
  | "INVALID_RUNTIME_COMMAND"
  | "RUNTIME_STOPPED";

export type EventAudience = "ROLE_LOCAL" | "PARTICIPANTS" | "PUBLIC";

export type DemoEvent = {
  protocolVersion: 1;
  eventId: string;
  occurredAt: string;
  panel: PanelId;
  sessionId: string;
  state: DemoState;
  messageCode: MessageCode;
  audience: EventAudience;
  productCode?: string;
  correlationId?: string;
  replaceKey?: string;
  agreedAmount?: string;
  publicAmount?: string;
};

export type ServerMessage =
  | { type: "READY" }
  | {
      type: "COMMAND_ACCEPTED";
      requestId: string;
      command: "JOIN_ROOM" | "SET_LIMIT" | "RESET_DEMO";
      role?: RoleId;
    }
  | { type: "DEMO_EVENT"; event: DemoEvent }
  | { type: "RESET_COMPLETE" }
  | { type: "ERROR"; requestId?: string; message: string };
