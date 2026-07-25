import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { Socket, createConnection } from "node:net";
import type { PartyRole } from "@midnight-negotiation/protocol";

export const RELAY_PROTOCOL_VERSION = 1 as const;
const MAX_FRAME_BYTES = 32_768;

export type RelayRegistration = {
  relayProtocolVersion: typeof RELAY_PROTOCOL_VERSION;
  type: "REGISTER";
  role: PartyRole;
  authToken: string;
  sessionId: string;
  productCode: string;
  publicKey: string;
};

export type RelayPacket = {
  relayProtocolVersion: typeof RELAY_PROTOCOL_VERSION;
  type: "PACKET";
  sessionId: string;
  productCode: string;
  sender: PartyRole;
  target: PartyRole;
  sequence: number;
  nonce: string;
  ciphertext: string;
  authTag: string;
};

export type RelayPeerKey = {
  relayProtocolVersion: typeof RELAY_PROTOCOL_VERSION;
  type: "PEER_KEY";
  sessionId: string;
  productCode: string;
  role: PartyRole;
  publicKey: string;
};

export type RelayError = {
  relayProtocolVersion: typeof RELAY_PROTOCOL_VERSION;
  type: "ERROR";
  code:
    | "AUTH_FAILED"
    | "INVALID_FRAME"
    | "ROOM_MISMATCH"
    | "ROLE_CONFLICT"
    | "PEER_UNAVAILABLE"
    | "REPLAY_REJECTED"
    | "NONCE_REUSED";
};

export type RelayClientMessage = RelayRegistration | RelayPacket;
export type RelayServerMessage = RelayPeerKey | RelayPacket | RelayError;

type RelayMetadata = Pick<
  RelayPacket,
  "sessionId" | "productCode" | "sender" | "target" | "sequence"
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const expected = new Set(keys);
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
};

const isPartyRole = (value: unknown): value is PartyRole =>
  value === "buyer" || value === "seller";

const isIdentifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);

const isProductCode = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}$/.test(value);

const isBase64 = (value: unknown, maxLength = 16_384): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maxLength &&
  /^[A-Za-z0-9+/]+={0,2}$/.test(value);

const isAuthToken = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

const isSequence = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 1;

export const parseRelayRegistration = (
  value: unknown,
): RelayRegistration => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "relayProtocolVersion",
      "type",
      "role",
      "authToken",
      "sessionId",
      "productCode",
      "publicKey",
    ]) ||
    value.relayProtocolVersion !== RELAY_PROTOCOL_VERSION ||
    value.type !== "REGISTER" ||
    !isPartyRole(value.role) ||
    !isAuthToken(value.authToken) ||
    !isIdentifier(value.sessionId) ||
    !isProductCode(value.productCode) ||
    !isBase64(value.publicKey, 1_024)
  ) {
    throw new Error("invalid relay registration");
  }
  return value as RelayRegistration;
};

export const parseRelayPacket = (value: unknown): RelayPacket => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "relayProtocolVersion",
      "type",
      "sessionId",
      "productCode",
      "sender",
      "target",
      "sequence",
      "nonce",
      "ciphertext",
      "authTag",
    ]) ||
    value.relayProtocolVersion !== RELAY_PROTOCOL_VERSION ||
    value.type !== "PACKET" ||
    !isIdentifier(value.sessionId) ||
    !isProductCode(value.productCode) ||
    !isPartyRole(value.sender) ||
    !isPartyRole(value.target) ||
    value.sender === value.target ||
    !isSequence(value.sequence) ||
    !isBase64(value.nonce, 128) ||
    Buffer.from(value.nonce, "base64").length !== 12 ||
    !isBase64(value.ciphertext) ||
    !isBase64(value.authTag, 128) ||
    Buffer.from(value.authTag, "base64").length !== 16
  ) {
    throw new Error("invalid encrypted relay packet");
  }
  return value as RelayPacket;
};

export const parseRelayClientMessage = (
  value: unknown,
): RelayClientMessage => {
  if (!isRecord(value)) throw new Error("invalid relay client message");
  if (value.type === "REGISTER") return parseRelayRegistration(value);
  if (value.type === "PACKET") return parseRelayPacket(value);
  throw new Error("unknown relay client message");
};

export const parseRelayServerMessage = (
  value: unknown,
): RelayServerMessage => {
  if (!isRecord(value)) throw new Error("invalid relay server message");
  if (value.type === "PACKET") return parseRelayPacket(value);
  if (value.type === "PEER_KEY") {
    if (
      !hasExactKeys(value, [
        "relayProtocolVersion",
        "type",
        "sessionId",
        "productCode",
        "role",
        "publicKey",
      ]) ||
      value.relayProtocolVersion !== RELAY_PROTOCOL_VERSION ||
      !isIdentifier(value.sessionId) ||
      !isProductCode(value.productCode) ||
      !isPartyRole(value.role) ||
      !isBase64(value.publicKey, 1_024)
    ) {
      throw new Error("invalid peer key message");
    }
    return value as RelayPeerKey;
  }
  if (value.type === "ERROR") {
    const codes = [
      "AUTH_FAILED",
      "INVALID_FRAME",
      "ROOM_MISMATCH",
      "ROLE_CONFLICT",
      "PEER_UNAVAILABLE",
      "REPLAY_REJECTED",
      "NONCE_REUSED",
    ] as const;
    if (
      !hasExactKeys(value, ["relayProtocolVersion", "type", "code"]) ||
      value.relayProtocolVersion !== RELAY_PROTOCOL_VERSION ||
      !codes.includes(value.code as (typeof codes)[number])
    ) {
      throw new Error("invalid relay error message");
    }
    return value as RelayError;
  }
  throw new Error("unknown relay server message");
};

export const relayAssociatedData = (metadata: RelayMetadata): Buffer =>
  Buffer.from(
    JSON.stringify([
      RELAY_PROTOCOL_VERSION,
      metadata.sessionId,
      metadata.productCode,
      metadata.sender,
      metadata.target,
      metadata.sequence,
    ]),
    "utf8",
  );

export const encryptRelayPayload = (input: {
  sharedKey: Buffer;
  metadata: RelayMetadata;
  payload: unknown;
}): RelayPacket => {
  if (input.sharedKey.length !== 32) {
    throw new Error("relay shared key must contain 32 bytes");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", input.sharedKey, nonce);
  cipher.setAAD(relayAssociatedData(input.metadata));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(input.payload), "utf8"),
    cipher.final(),
  ]);
  return parseRelayPacket({
    relayProtocolVersion: RELAY_PROTOCOL_VERSION,
    type: "PACKET",
    ...input.metadata,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  });
};

export const decryptRelayPayload = (input: {
  sharedKey: Buffer;
  packet: RelayPacket;
}): unknown => {
  if (input.sharedKey.length !== 32) {
    throw new Error("relay shared key must contain 32 bytes");
  }
  const packet = parseRelayPacket(input.packet);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    input.sharedKey,
    Buffer.from(packet.nonce, "base64"),
  );
  decipher.setAAD(relayAssociatedData(packet));
  decipher.setAuthTag(Buffer.from(packet.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(packet.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as unknown;
};

export class RoomRelayClient {
  readonly #host: string;
  readonly #port: number;
  readonly #role: PartyRole;
  readonly #authToken: string;
  readonly #onPeerKey: (message: RelayPeerKey) => void;
  readonly #onPacket: (packet: RelayPacket) => void;
  readonly #onError: (error: Error) => void;
  #socket: Socket | undefined;
  #buffer = "";
  #registration: RelayRegistration | undefined;

  constructor(input: {
    host: string;
    port: number;
    role: PartyRole;
    authToken: string;
    onPeerKey: (message: RelayPeerKey) => void;
    onPacket: (packet: RelayPacket) => void;
    onError: (error: Error) => void;
  }) {
    if (
      !Number.isInteger(input.port) ||
      input.port < 1 ||
      input.port > 65_535 ||
      !isAuthToken(input.authToken)
    ) {
      throw new Error("invalid Room Relay client configuration");
    }
    this.#host = input.host;
    this.#port = input.port;
    this.#role = input.role;
    this.#authToken = input.authToken;
    this.#onPeerKey = input.onPeerKey;
    this.#onPacket = input.onPacket;
    this.#onError = input.onError;
  }

  async register(input: {
    sessionId: string;
    productCode: string;
    publicKey: string;
  }): Promise<void> {
    if (this.#socket !== undefined) {
      throw new Error("Room Relay client is already connected");
    }
    this.#registration = parseRelayRegistration({
      relayProtocolVersion: RELAY_PROTOCOL_VERSION,
      type: "REGISTER",
      role: this.#role,
      authToken: this.#authToken,
      ...input,
    });
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({
        host: this.#host,
        port: this.#port,
      });
      this.#socket = socket;
      socket.setEncoding("utf8");
      socket.once("connect", () => {
        socket.write(`${JSON.stringify(this.#registration)}\n`);
        resolve();
      });
      socket.once("error", reject);
      socket.on("data", (chunk: string) => this.#acceptChunk(chunk));
      socket.on("error", (error) => this.#onError(error));
      socket.on("close", () => {
        this.#socket = undefined;
      });
    });
  }

  sendPacket(packet: RelayPacket): void {
    const registration = this.#registration;
    if (
      registration === undefined ||
      packet.sender !== this.#role ||
      packet.sessionId !== registration.sessionId ||
      packet.productCode !== registration.productCode
    ) {
      throw new Error("relay packet does not match its registered client");
    }
    if (this.#socket === undefined || this.#socket.destroyed) {
      throw new Error("Room Relay is not connected");
    }
    this.#socket.write(`${JSON.stringify(parseRelayPacket(packet))}\n`);
  }

  close(): void {
    this.#socket?.destroy();
    this.#socket = undefined;
    this.#registration = undefined;
    this.#buffer = "";
  }

  #acceptChunk(chunk: string): void {
    this.#buffer += chunk;
    if (Buffer.byteLength(this.#buffer, "utf8") > MAX_FRAME_BYTES) {
      this.close();
      this.#onError(new Error("Room Relay frame exceeded its size limit"));
      return;
    }
    while (true) {
      const newline = this.#buffer.indexOf("\n");
      if (newline < 0) return;
      const frame = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      if (frame.length === 0) continue;
      try {
        const message = parseRelayServerMessage(JSON.parse(frame) as unknown);
        if (message.type === "ERROR") {
          this.#onError(new Error(`Room Relay rejected message: ${message.code}`));
        } else if (message.type === "PEER_KEY") {
          this.#onPeerKey(message);
        } else {
          this.#onPacket(message);
        }
      } catch (error) {
        this.#onError(
          error instanceof Error
            ? error
            : new Error("Room Relay returned an invalid message"),
        );
      }
    }
  }
}
