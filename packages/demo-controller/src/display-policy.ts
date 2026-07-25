import type { DemoEvent } from "@midnight-negotiation/protocol";

const runtimeOnlyMessageCodes = new Set(["DEAL_CREATED", "DEAL_JOINED"]);

export const isBrowserDisplayEvent = (event: DemoEvent): boolean =>
  !runtimeOnlyMessageCodes.has(event.messageCode);
