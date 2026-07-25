import { randomUUID } from "node:crypto";

export const PROTOCOL_VERSION = 1 as const;

export const roles = ["buyer", "seller", "observer"] as const;
export type Role = (typeof roles)[number];
export type PartyRole = Exclude<Role, "observer">;

export const demoStates = [
  "ROOM_JOINED",
  "LIMIT_LOCKED",
  "WAITING_PEER",
  "PEER_READY",
  "COMMITTING",
  "NEGOTIATING",
  "BUYER_VERIFYING",
  "SELLER_VERIFYING",
  "AUTHORIZED",
  "SETTLED",
  "CANCELLED",
  "ERROR",
  "STOPPED",
] as const;
export type DemoState = (typeof demoStates)[number];

export const eventAudiences = ["ROLE_LOCAL", "PARTICIPANTS", "PUBLIC"] as const;
export type EventAudience = (typeof eventAudiences)[number];

export type JoinRoomCommand = {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "JOIN_ROOM";
  requestId: string;
  target: PartyRole;
  sessionId: string;
  productCode: string;
};

export type SetLimitCommand = {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "SET_LIMIT";
  requestId: string;
  target: PartyRole;
  sessionId: string;
  limitKrw: string;
};

export type ConfigureObserverCommand = {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "CONFIGURE_OBSERVER";
  requestId: string;
  target: "observer";
  sessionId: string;
  productCode: string;
};

export type StartRuntimeCommand = {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "START_RUNTIME";
  requestId: string;
  target: Role;
};

export type PeerReadyCommand = {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "PEER_READY";
  requestId: string;
  target: PartyRole;
  sessionId: string;
};

export type ShutdownRuntimeCommand = {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "SHUTDOWN_RUNTIME";
  requestId: string;
  target: Role;
};

export type RuntimeCommand =
  | JoinRoomCommand
  | SetLimitCommand
  | ConfigureObserverCommand
  | PeerReadyCommand
  | StartRuntimeCommand
  | ShutdownRuntimeCommand;

export type DemoEvent = {
  protocolVersion: typeof PROTOCOL_VERSION;
  eventId: string;
  occurredAt: string;
  panel: Role;
  sessionId: string;
  state: DemoState;
  messageCode: string;
  audience: EventAudience;
  productCode?: string;
  publicAmount?: string;
};

export type RuntimeReadyMessage = {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "RUNTIME_READY";
  role: Role;
  pid: number;
};

export type RuntimeEventMessage = {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "DEMO_EVENT";
  event: DemoEvent;
};

export type RuntimeMessage = RuntimeReadyMessage | RuntimeEventMessage;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isIdentifier = (value: unknown): value is string =>
  isNonEmptyString(value) && /^[A-Za-z0-9_-]{1,64}$/.test(value);

const isProductCode = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}$/.test(value);

const isKrwAmount = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value)) return false;
  const amount = BigInt(value);
  return amount <= 18_446_744_073_709_551_615n;
};

const isRole = (value: unknown): value is Role =>
  typeof value === "string" && roles.includes(value as Role);

const isPartyRole = (value: unknown): value is PartyRole =>
  value === "buyer" || value === "seller";

const isDemoState = (value: unknown): value is DemoState =>
  typeof value === "string" && demoStates.includes(value as DemoState);

const isEventAudience = (value: unknown): value is EventAudience =>
  typeof value === "string" && eventAudiences.includes(value as EventAudience);

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

const isMessageCode = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(value);

export const parseRuntimeCommand = (value: unknown, expectedRole?: Role): RuntimeCommand => {
  if (!isRecord(value) || value.protocolVersion !== PROTOCOL_VERSION || !isNonEmptyString(value.type)) {
    throw new Error("invalid runtime command envelope");
  }

  let command: RuntimeCommand;
  switch (value.type) {
    case "JOIN_ROOM":
      if (
        !hasExactKeys(value, [
          "protocolVersion",
          "type",
          "requestId",
          "target",
          "sessionId",
          "productCode",
        ]) ||
        !isIdentifier(value.requestId) ||
        !isPartyRole(value.target) ||
        !isIdentifier(value.sessionId) ||
        !isProductCode(value.productCode)
      ) {
        throw new Error("invalid room join command");
      }
      command = value as JoinRoomCommand;
      break;
    case "SET_LIMIT":
      if (
        !hasExactKeys(value, [
          "protocolVersion",
          "type",
          "requestId",
          "target",
          "sessionId",
          "limitKrw",
        ]) ||
        !isIdentifier(value.requestId) ||
        !isPartyRole(value.target) ||
        !isIdentifier(value.sessionId) ||
        !isKrwAmount(value.limitKrw)
      ) {
        throw new Error("invalid private limit command");
      }
      command = value as SetLimitCommand;
      break;
    case "CONFIGURE_OBSERVER":
      if (
        !hasExactKeys(value, [
          "protocolVersion",
          "type",
          "requestId",
          "target",
          "sessionId",
          "productCode",
        ]) ||
        !isIdentifier(value.requestId) ||
        value.target !== "observer" ||
        !isIdentifier(value.sessionId) ||
        !isProductCode(value.productCode)
      ) {
        throw new Error("invalid observer configuration command");
      }
      command = value as ConfigureObserverCommand;
      break;
    case "PEER_READY":
      if (
        !hasExactKeys(value, [
          "protocolVersion",
          "type",
          "requestId",
          "target",
          "sessionId",
        ]) ||
        !isIdentifier(value.requestId) ||
        !isPartyRole(value.target) ||
        !isIdentifier(value.sessionId)
      ) {
        throw new Error("invalid peer ready command");
      }
      command = value as PeerReadyCommand;
      break;
    case "START_RUNTIME":
    case "SHUTDOWN_RUNTIME":
      if (
        !hasExactKeys(value, ["protocolVersion", "type", "requestId", "target"]) ||
        !isIdentifier(value.requestId) ||
        !isRole(value.target)
      ) {
        throw new Error("invalid runtime lifecycle command");
      }
      command = value as StartRuntimeCommand | ShutdownRuntimeCommand;
      break;
    default:
      throw new Error("unknown runtime command");
  }

  if (expectedRole !== undefined && command.target !== expectedRole) {
    throw new Error("runtime command target does not match process role");
  }
  return command;
};

export const parseDemoEvent = (value: unknown): DemoEvent => {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [
        "protocolVersion",
        "eventId",
        "occurredAt",
        "panel",
        "sessionId",
        "state",
        "messageCode",
        "audience",
      ],
      ["productCode", "publicAmount"],
    ) ||
    value.protocolVersion !== PROTOCOL_VERSION ||
    !isIdentifier(value.eventId) ||
    !isIsoDate(value.occurredAt) ||
    !isRole(value.panel) ||
    !isIdentifier(value.sessionId) ||
    !isDemoState(value.state) ||
    !isMessageCode(value.messageCode) ||
    !isEventAudience(value.audience)
  ) {
    throw new Error("invalid demo event");
  }
  if (value.productCode !== undefined && !isProductCode(value.productCode)) {
    throw new Error("invalid public product code");
  }
  if (value.productCode !== undefined && value.state !== "ROOM_JOINED") {
    throw new Error("product code is only allowed for room events");
  }
  if (value.publicAmount !== undefined && (!isKrwAmount(value.publicAmount) || value.state !== "SETTLED")) {
    throw new Error("public amount is only allowed for settled events");
  }
  if (value.panel === "observer" && value.audience !== "PUBLIC") {
    throw new Error("observer events must use the public audience");
  }
  if (value.publicAmount !== undefined && value.audience !== "PUBLIC") {
    throw new Error("settled amount must use the public audience");
  }
  return value as DemoEvent;
};

export const parseRuntimeMessage = (value: unknown): RuntimeMessage => {
  if (!isRecord(value) || value.protocolVersion !== PROTOCOL_VERSION || !isNonEmptyString(value.type)) {
    throw new Error("invalid runtime message envelope");
  }
  if (value.type === "RUNTIME_READY") {
    if (
      !hasExactKeys(value, ["protocolVersion", "type", "role", "pid"]) ||
      !isRole(value.role) ||
      typeof value.pid !== "number" ||
      !Number.isSafeInteger(value.pid) ||
      value.pid <= 0
    ) {
      throw new Error("invalid runtime ready message");
    }
    return value as RuntimeReadyMessage;
  }
  if (value.type === "DEMO_EVENT") {
    if (!hasExactKeys(value, ["protocolVersion", "type", "event"])) {
      throw new Error("invalid runtime event message");
    }
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "DEMO_EVENT",
      event: parseDemoEvent(value.event),
    };
  }
  throw new Error("unknown runtime message");
};

export const createDemoEvent = (
  input: Omit<DemoEvent, "protocolVersion" | "eventId" | "occurredAt">,
): DemoEvent =>
  parseDemoEvent({
    protocolVersion: PROTOCOL_VERSION,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    ...input,
  });

export const createRequestId = (): string => randomUUID();
