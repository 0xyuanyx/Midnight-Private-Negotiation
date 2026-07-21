import type { AgentRole, NegotiationMessage } from "./protocol.ts";

export type RelayListener = (message: NegotiationMessage) => void;

export class InMemoryRelay {
  private readonly listeners = new Map<AgentRole, RelayListener>();

  connect(role: AgentRole, listener: RelayListener): void {
    this.listeners.set(role, listener);
  }

  send(from: AgentRole, message: NegotiationMessage): void {
    const recipient: AgentRole = from === "buyer" ? "seller" : "buyer";
    this.listeners.get(recipient)?.(message);
  }
}
